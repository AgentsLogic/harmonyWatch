import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for RLS bypass
const supabase = createClient(
  serverConfig.SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to get user from Supabase auth (same pattern as playback/progress route)
async function getUserFromAuth(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (!accessToken) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error getting user from auth:', error);
    return null;
  }
}

/**
 * GET /api/user/preferences/calendar-type
 * Get the user's preferred calendar type
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromAuth(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile - use maybeSingle to handle missing profiles gracefully
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('preferred_calendar_type')
      .eq('user_id', user.id)
      .maybeSingle();

    // If profile doesn't exist (edge case), return default
    if (profileError) {
      // PGRST116 means no rows found - this is okay, return default
      if (profileError.code === 'PGRST116') {
        return NextResponse.json({ 
          preferred_calendar_type: 'old' 
        });
      }
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch preference' }, { status: 500 });
    }

    // Return preference or default to 'old' if null/undefined
    return NextResponse.json({ 
      preferred_calendar_type: profile?.preferred_calendar_type || 'old' 
    });
  } catch (error) {
    console.error('Error in GET /api/user/preferences/calendar-type:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/user/preferences/calendar-type
 * Update the user's preferred calendar type
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromAuth(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { preferred_calendar_type } = body;

    if (!preferred_calendar_type || !['new', 'old'].includes(preferred_calendar_type)) {
      return NextResponse.json({ 
        error: 'Invalid calendar type. Must be "new" or "old"' 
      }, { status: 400 });
    }

    // Update user profile
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        preferred_calendar_type,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating user profile:', updateError);
      return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      preferred_calendar_type 
    });
  } catch (error) {
    console.error('Error in PUT /api/user/preferences/calendar-type:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

