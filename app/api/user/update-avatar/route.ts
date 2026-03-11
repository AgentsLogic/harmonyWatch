import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabaseService } from '@/lib/supabase';

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

    const { avatar_url } = await request.json();

    // Validate avatar_url (can be null to remove avatar)
    if (avatar_url !== null && avatar_url !== undefined && typeof avatar_url !== 'string') {
      return NextResponse.json(
        { error: 'Invalid avatar URL format' },
        { status: 400 }
      );
    }

    // Update avatar_url in user_profiles table
    const { error: updateError } = await supabaseService
      .from('user_profiles')
      .update({ 
        avatar_url: avatar_url?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating avatar:', updateError);
      return NextResponse.json(
        { error: 'Failed to update avatar' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Avatar updated successfully', avatar_url: avatar_url?.trim() || null },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update avatar error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
