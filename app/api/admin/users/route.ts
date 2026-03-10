import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { getActiveSubscription } from '@/lib/services/subscription-service';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to verify admin access
async function verifyAdmin(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (!accessToken) {
    return { error: 'No access token found', status: 401, user: null };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  
  if (authError || !user) {
    return { error: 'Invalid or expired token', status: 401, user: null };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_type')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: 'Unauthorized - Admin access required', status: 403, user: null };
  }

  return { error: null, status: 200, user };
}

// GET - Fetch users with filtering
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);
    if (adminCheck.error) {
      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all'; // all, paid, free, admin

    // Build query based on filter
    // Subscription details are read from subscriptions table only
    let query = supabase
      .from('user_profiles')
      .select(`
        id,
        user_id,
        user_type,
        signup_status,
        display_name,
        avatar_url,
        preferred_calendar_type,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    // Apply filter
    if (filter === 'paid') {
      query = query.eq('user_type', 'subscriber');
    } else if (filter === 'free') {
      query = query.eq('user_type', 'free');
    } else if (filter === 'admin') {
      query = query.eq('user_type', 'admin');
    } else if (filter === 'staff') {
      query = query.eq('user_type', 'staff');
    }
    // 'all' doesn't need a filter

    const { data: users, error } = await query;

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    // Fetch auth users separately (Supabase doesn't allow direct joins to auth.users)
    const userIds = (users || []).map((u: any) => u.user_id);
    const { data: authUsersData } = await supabase.auth.admin.listUsers();
    
    // Create a map of user_id -> auth user data
    const authUsersMap = new Map();
    authUsersData?.users.forEach((authUser) => {
      // Determine signup method from identities or app_metadata
      let signupMethod = 'email'; // Default to email
      
      if (authUser.identities && authUser.identities.length > 0) {
        // Check the first identity provider
        const primaryIdentity = authUser.identities[0];
        if (primaryIdentity.provider === 'apple') {
          signupMethod = 'apple';
        } else if (primaryIdentity.provider === 'email') {
          signupMethod = 'email';
        }
      } else if (authUser.app_metadata?.provider) {
        // Fallback to app_metadata if identities not available
        signupMethod = authUser.app_metadata.provider === 'apple' ? 'apple' : 'email';
      }
      
      authUsersMap.set(authUser.id, {
        email: authUser.email,
        email_confirmed_at: authUser.email_confirmed_at,
        created_at: authUser.created_at,
        signup_method: signupMethod,
      });
    });

    // Fetch active subscriptions for all users using unified service (parallel fetching)
    const allUserIds = (users || []).map((u: any) => u.user_id);
    const subscriptionChecks = await Promise.all(
      allUserIds.map(async (userId: string) => {
        const subscription = await getActiveSubscription(userId);
        return {
          userId,
          hasActiveSubscription: subscription !== null,
          subscription,
        };
      })
    );

    // Create a map of user_id -> has active subscription
    const subscriptionMap = new Map<string, { hasActive: boolean; subscription: any }>();
    subscriptionChecks.forEach((check) => {
      subscriptionMap.set(check.userId, {
        hasActive: check.hasActiveSubscription,
        subscription: check.subscription,
      });
    });

    // Transform the data to include email from auth_users and paid subscription status
    const transformedUsers = (users || []).map((user: any) => {
      const authUser = authUsersMap.get(user.user_id);
      const subscriptionInfo = subscriptionMap.get(user.user_id);
      const hasActivePaidSubscription = subscriptionInfo?.hasActive || false;
      const subscriptionSource = subscriptionInfo?.subscription?.provider || null;

      return {
        id: user.id,
        user_id: user.user_id,
        email: authUser?.email || 'N/A',
        email_confirmed: !!authUser?.email_confirmed_at,
        signup_method: authUser?.signup_method || 'email',
        user_type: user.user_type,
        signup_status: user.signup_status,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        preferred_calendar_type: user.preferred_calendar_type,
        created_at: user.created_at,
        updated_at: user.updated_at,
        auth_created_at: authUser?.created_at || null,
        hasActivePaidSubscription,
        subscriptionProvider: subscriptionSource,
        subscriptionExpiresAt: subscriptionInfo?.subscription?.expires_at || subscriptionInfo?.subscription?.current_period_end || null,
      };
    });

    return NextResponse.json({ users: transformedUsers }, { status: 200 });

  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new user
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);
    if (adminCheck.error) {
      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { email, password, userType = 'free' } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate userType
    if (!['free', 'subscriber', 'admin', 'staff'].includes(userType)) {
      return NextResponse.json(
        { error: 'Invalid user type. Must be free, subscriber, admin, or staff' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === email);

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Create the user using Supabase Auth
    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        user_type: userType,
        display_name: email.split('@')[0],
      },
    });

    if (createUserError || !createdUser?.user) {
      console.error('Error creating user:', createUserError);
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create user profile (should be automatic via trigger, but ensure it exists)
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', createdUser.user.id)
      .single();

    if (!existingProfile) {
      // Profile doesn't exist, create it
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: createdUser.user.id,
          user_type: userType,
          signup_status: 'complete', // Admin-created users are complete
          display_name: email.split('@')[0],
        });

      if (profileError) {
        console.error('Error creating user profile:', profileError);
        // User was created but profile failed - try to clean up
        await supabase.auth.admin.deleteUser(createdUser.user.id);
        return NextResponse.json(
          { error: 'Failed to create user profile' },
          { status: 500 }
        );
      }
    } else {
      // Profile exists, update user_type if different
      if (userType !== 'free') {
        await supabase
          .from('user_profiles')
          .update({ user_type: userType })
          .eq('user_id', createdUser.user.id);
      }
    }

    return NextResponse.json(
      { 
        message: 'User created successfully',
        user: {
          id: createdUser.user.id,
          email: createdUser.user.email,
          user_type: userType,
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Admin users POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
