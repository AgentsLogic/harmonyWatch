import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

export async function PUT(request: NextRequest) {
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
    const { data: { user }, error: authError } = await supabaseService.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { email } = await request.json();

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email is already in use by another user
    // Note: getUserByEmail is not available in this SDK version; use listUsers + filter
    const { data: { users: allUsers } } = await supabaseService.auth.admin.listUsers({ perPage: 1000 });
    const existingUserWithEmail = (allUsers as any[] | null)?.find((u: any) => u.email === email.trim()) ?? null;
    if (existingUserWithEmail && existingUserWithEmail.id !== user.id) {
      return NextResponse.json(
        { error: 'Email is already in use by another account' },
        { status: 400 }
      );
    }

    // Update user email using admin API
    // Note: Supabase may require email confirmation depending on settings
    const { data: updatedUser, error: updateError } = await supabaseService.auth.admin.updateUserById(
      user.id,
      { email: email.trim() }
    );

    if (updateError) {
      console.error('Error updating email:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update email' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Email updated successfully', email: updatedUser.user.email },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
