import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { verifyAdmin } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// PATCH - Update user role (set/remove staff)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminCheck = await verifyAdmin(request);
    if (adminCheck.error) {
      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { id: userId } = await params;
    const { user_type } = await request.json();

    // Validate user_type
    if (!['free', 'subscriber', 'admin', 'staff'].includes(user_type)) {
      return NextResponse.json(
        { error: 'Invalid user type. Must be free, subscriber, admin, or staff' },
        { status: 400 }
      );
    }

    // Prevent admins from changing their own role
    if (userId === adminCheck.user?.id && user_type !== 'admin') {
      return NextResponse.json(
        { error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    // Verify the user exists
    const { data: userProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('user_id, user_type')
      .eq('user_id', userId)
      .single();

    if (fetchError || !userProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent changing other admins' roles (optional safety check)
    if (userProfile.user_type === 'admin' && user_type !== 'admin') {
      return NextResponse.json(
        { error: 'Cannot change admin user roles. Please change their user type first.' },
        { status: 403 }
      );
    }

    // Update the user type
    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update({ user_type })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating user role:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update user role' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        message: 'User role updated successfully',
        user: updatedProfile
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Update user role error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
