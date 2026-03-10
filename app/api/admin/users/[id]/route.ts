import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
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

// DELETE - Delete a user
export async function DELETE(
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

    // Prevent admins from deleting themselves
    if (userId === adminCheck.user?.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
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

    // Prevent deleting other admins (optional safety check)
    if (userProfile.user_type === 'admin') {
      return NextResponse.json(
        { error: 'Cannot delete admin users. Please change their user type first.' },
        { status: 403 }
      );
    }

    // Delete the user from Supabase Auth
    // This will cascade delete the user_profile and other related records via database triggers
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return NextResponse.json(
        { 
          error: deleteError.message || 'Failed to delete user',
          details: deleteError 
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'User deleted successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Delete user error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorDetails = error instanceof Error ? error.stack : String(error);
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { status: 500 }
    );
  }
}
