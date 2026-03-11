import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for database operations
const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

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

    // Find user by email
    // Note: getUserByEmail is not available in this SDK version; use listUsers + filter
    const { data: { users: allUsers }, error: lookupError } = await supabaseService.auth.admin.listUsers({ perPage: 1000 });
    const user = (allUsers as any[] | null)?.find((u: any) => u.email === email) ?? null;

    if (lookupError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user profile exists and is pending
    const { data: profile, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('signup_status')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    // Only allow password update for pending users
    if (profile?.signup_status !== 'pending') {
      return NextResponse.json(
        { error: 'Password can only be updated for pending accounts' },
        { status: 403 }
      );
    }

    // Update user password using admin API
    const { data: updatedUser, error: updateError } = await supabaseService.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update password' },
        { status: 500 }
      );
    }

    // Sign the user in with the new password to establish a session
    const supabase = createClient(
      publicConfig.NEXT_PUBLIC_SUPABASE_URL,
      publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

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
      console.error('Error fetching updated profile:', profileFetchError);
      return NextResponse.json(
        { error: 'Password updated but failed to fetch user profile' },
        { status: 500 }
      );
    }

    // Set session cookie
    const response = NextResponse.json({
      success: true,
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
  } catch (error) {
    console.error('Update password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

