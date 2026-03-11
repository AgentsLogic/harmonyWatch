import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/utils/rate-limit';

// Initialize Supabase clients
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 registrations per IP per hour
    const ip = getClientIp(request);
    const { success, retryAfter } = rateLimit(`register:${ip}`, 3, 60 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      );
    }

    const { email, password, userType } = await request.json();

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

    console.log('[register] Attempting to create user', email);

    const adminClient = supabaseService.auth.admin as {
      getUserByEmail?: (
        email: string
      ) => Promise<{
        data: { user: { id: string } | null }
        error: { message?: string } | null
      }>
    };

    if (typeof adminClient.getUserByEmail === 'function') {
      console.log('[register] Checking for existing user via adminClient');

      const existingUserResponse = await adminClient.getUserByEmail(email);

      if (existingUserResponse.error && existingUserResponse.error.message !== 'User not found') {
        console.error('Error checking existing user:', existingUserResponse.error);
        return NextResponse.json(
          { error: 'Failed to verify email status' },
          { status: 500 }
        );
      }

      if (existingUserResponse.data?.user) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }
    }

    // Supabase JS v2 removed the legacy `auth.admin.getUserByEmail` helper.
    // We rely on the createUser call below to surface duplicate-email errors.
    // Create the user using the service role to bypass email confirmations
    const {
      data: createdUser,
      error: createUserError,
    } = await supabaseService.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        user_type: userType || 'free',
        display_name: email.split('@')[0],
      },
    });

    console.log('[register] Create user response', {
      hasUser: Boolean(createdUser?.user),
      createUserError,
    });

    if (createUserError || !createdUser?.user) {
      const normalizedMessage = createUserError?.message?.toLowerCase() ?? '';
      if (
        createUserError?.code === 'email_exists' ||
        normalizedMessage.includes('already registered') ||
        normalizedMessage.includes('already been registered')
      ) {
        // User already exists - check if they're pending and update password instead
        const { data: { users }, error: listError } = await supabaseService.auth.admin.listUsers();
        
        if (listError) {
          console.error('Error listing users:', listError);
          return NextResponse.json(
            { error: 'An account with this email already exists' },
            { status: 409 }
          );
        }

        const existingUser = users.find(u => u.email === email);

        if (existingUser) {
          // Check if user profile exists and is pending
          const { data: profile, error: profileError } = await supabaseService
            .from('user_profiles')
            .select('signup_status')
            .eq('user_id', existingUser.id)
            .single();

          if (!profileError && profile?.signup_status === 'pending') {
            // User is pending - update password instead of creating new account
            const { error: updateError } = await supabaseService.auth.admin.updateUserById(
              existingUser.id,
              { password }
            );

            if (updateError) {
              console.error('Error updating password:', updateError);
              return NextResponse.json(
                { error: 'Failed to update password' },
                { status: 500 }
              );
            }

            // Sign the user in with the new password
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (signInError || !signInData.session || !signInData.user) {
              console.error('Sign-in after password update failed:', signInError);
              return NextResponse.json(
                { error: 'Password updated but failed to sign in. Please try logging in manually.' },
                { status: 500 }
              );
            }

            // Get user profile
            const { data: userProfile, error: profileFetchError } = await supabaseService
              .from('user_profiles')
              .select('user_id, user_type, signup_status, display_name, created_at')
              .eq('user_id', signInData.user.id)
              .single();

            if (profileFetchError) {
              console.error('Error fetching profile:', profileFetchError);
              return NextResponse.json(
                { error: 'Password updated but failed to fetch user profile' },
                { status: 500 }
              );
            }

            // Set session cookie
            const response = NextResponse.json({
              user: {
                id: userProfile.user_id,
                email: signInData.user.email,
                user_type: userProfile.user_type,
                signup_status: userProfile.signup_status,
                display_name: userProfile.display_name,
                created_at: userProfile.created_at,
                last_login: new Date().toISOString(),
                subscription: null,
              },
              session: {
                access_token: signInData.session.access_token,
                refresh_token: signInData.session.refresh_token,
              },
            });

            // Set auth cookies
            response.cookies.set('sb-access-token', signInData.session.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 7, // 7 days
              path: '/',
            });

            return response;
          }
        }

        // User exists but is not pending - return error
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }

      console.error('Create user error:', createUserError);
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Immediately sign the user in so we can set auth cookies
    console.log('[register] Attempting sign-in for new user', email);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log('[register] Sign-in response', {
      hasSession: Boolean(signInData?.session),
      hasUser: Boolean(signInData?.user),
      signInError,
    });

    if (signInError || !signInData.session || !signInData.user) {
      console.error('Sign-in after registration failed:', signInError);

      // Cleanup: remove the just-created user to avoid orphaned accounts
      await supabaseService.auth.admin.deleteUser(createdUser.user.id);

      return NextResponse.json(
        { error: 'Failed to initialize session for new account' },
        { status: 500 }
      );
    }

    // Ensure profile exists and is marked as pending
    const displayName = email.split('@')[0];
    console.log('[register] Ensuring user profile exists');

    let profile:
      | {
          user_type: string | null
          display_name: string | null
          signup_status: string | null
        }
      | null = null;

    try {
      const {
        data: existingProfile,
        error: fetchProfileError,
      } = await supabaseService
        .from('user_profiles')
        .select('user_type, display_name, signup_status')
        .eq('user_id', createdUser.user.id)
        .maybeSingle();

      if (fetchProfileError && fetchProfileError.code !== 'PGRST116') {
        throw fetchProfileError;
      }

      if (!existingProfile) {
        console.log('[register] Creating new user profile');
        const {
          data: insertedProfile,
          error: profileInsertError,
        } = await supabaseService
          .from('user_profiles')
          .insert({
            user_id: createdUser.user.id,
            user_type: userType || 'free',
            display_name: displayName,
            signup_status: 'pending',
          })
          .select('user_type, display_name, signup_status')
          .single();

        if (profileInsertError) {
          throw profileInsertError;
        }

        profile = insertedProfile;
      } else {
        console.log('[register] Updating existing user profile');
        const {
          data: updatedProfile,
          error: profileUpdateError,
        } = await supabaseService
          .from('user_profiles')
          .update({
            user_type: userType || existingProfile.user_type || 'free',
            display_name: existingProfile.display_name || displayName,
            signup_status: existingProfile.signup_status ?? 'pending',
          })
          .eq('user_id', createdUser.user.id)
          .select('user_type, display_name, signup_status')
          .single();

        if (profileUpdateError) {
          throw profileUpdateError;
        }

        profile = updatedProfile;
      }
    } catch (profileError) {
      console.error('Profile synchronization failed, proceeding with defaults:', profileError);
      profile = {
        user_type: userType || 'free',
        display_name: displayName,
        signup_status: 'pending',
      };
    }

    console.log('[register] Profile ensured');

    const response = NextResponse.json(
      { 
        message: 'User created successfully',
        user: {
          id: createdUser.user.id,
          email: createdUser.user.email,
          user_type: profile?.user_type || userType || 'free',
          signup_status: profile?.signup_status || 'pending',
          display_name: profile?.display_name || displayName,
          created_at: createdUser.user.created_at,
          subscription: null,
        },
        // Return session tokens so client can set Supabase session
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        },
        needsEmailVerification: false
      },
      { status: 201 }
    );

    console.log('[register] Setting auth cookies and returning response');

    // Set auth cookies for the new session - extended expiration times
    response.cookies.set('sb-access-token', signInData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days (matches login route)
      path: '/',
    });

    if (signInData.session.refresh_token) {
      response.cookies.set('sb-refresh-token', signInData.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 90, // 90 days (matches login route)
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}