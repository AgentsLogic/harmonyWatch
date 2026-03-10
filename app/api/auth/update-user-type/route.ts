import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for database operations
  const supabase = createClient(
    publicConfig.NEXT_PUBLIC_SUPABASE_URL,
    serverConfig.SUPABASE_SERVICE_ROLE_KEY
  );

export async function POST(request: NextRequest) {
  try {
    // Get the access token from cookies
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token found' },
        { status: 401 }
      );
    }

    // Verify the user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { userType } = await request.json();

    // Validate user type
    if (!userType || !['free', 'subscriber', 'admin'].includes(userType)) {
      return NextResponse.json(
        { error: 'Invalid user type' },
        { status: 400 }
      );
    }

    // Update user type in user_profiles table
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ user_type: userType, signup_status: 'complete' })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating user type:', updateError);
      return NextResponse.json(
        { error: 'Failed to update user type' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'User type updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update user type error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
