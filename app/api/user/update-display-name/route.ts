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

    const { display_name } = await request.json();

    // Validate display name (optional - can be null or empty string)
    if (display_name !== null && display_name !== undefined && display_name.trim().length > 50) {
      return NextResponse.json(
        { error: 'Display name must be 50 characters or less' },
        { status: 400 }
      );
    }

    // Update display_name in user_profiles table
    const { error: updateError } = await supabaseService
      .from('user_profiles')
      .update({ 
        display_name: display_name?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating display name:', updateError);
      return NextResponse.json(
        { error: 'Failed to update display name' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Display name updated successfully', display_name: display_name?.trim() || null },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update display name error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

