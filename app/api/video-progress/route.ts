import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with anon key for auth operations
const supabaseAuth = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Initialize Supabase client with service role key for database operations
const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch user's progress for a video
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json(
        { error: 'Content ID is required' },
        { status: 400 }
      );
    }

    // Get authenticated user from Supabase auth
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      // If not authenticated, return empty progress (don't track)
      return NextResponse.json({ currentTime: 0, duration: 0, percentageWatched: 0 });
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    
    if (authError || !user) {
      // If not authenticated, return empty progress (don't track)
      return NextResponse.json({ currentTime: 0, duration: 0, percentageWatched: 0 });
    }

    // Fetch progress for this user and content using service role (bypasses RLS)
    const { data, error } = await supabaseService
      .from('playback_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('content_id', contentId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching video progress:', error);
      return NextResponse.json(
        { error: 'Failed to fetch progress' },
        { status: 500 }
      );
    }

    // Return progress data or default values
    return NextResponse.json({
      currentTime: data?.current_time_seconds || 0,
      duration: data?.duration || 0,
      percentageWatched: data?.percentage_watched || 0
    });

  } catch (error) {
    console.error('Video progress GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save user's progress
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentId, currentTime, duration } = body;

    if (!contentId || typeof currentTime !== 'number' || typeof duration !== 'number') {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Get authenticated user from Supabase auth
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      // If not authenticated, silently ignore (don't track)
      return NextResponse.json({ message: 'Not authenticated' }, { status: 200 });
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    
    if (authError || !user) {
      // If not authenticated, silently ignore (don't track)
      return NextResponse.json({ message: 'Not authenticated' }, { status: 200 });
    }

    // Check if should save progress (>5% watched)
    const percentageWatched = duration > 0 ? (currentTime / duration) * 100 : 0;
    
    if (percentageWatched < 5) {
      // Don't save if less than 5%
      return NextResponse.json({ message: 'Progress below threshold' }, { status: 200 });
    }

    // Check if video is completed (>95% watched)
    if (percentageWatched >= 95) {
      // Clear progress if video completed using service role (bypasses RLS)
      await supabaseService
        .from('playback_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('content_id', contentId);
      
      return NextResponse.json({ message: 'Progress cleared - video completed' }, { status: 200 });
    }

    // Save or update progress using service role (bypasses RLS)
    const { error } = await supabaseService
      .from('playback_progress')
      .upsert({
        user_id: user.id,
        content_id: contentId,
        current_time_seconds: currentTime,
        duration: duration,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id,content_id'
      });

    if (error) {
      console.error('Error saving video progress:', error);
      return NextResponse.json(
        { error: 'Failed to save progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Progress saved successfully' });

  } catch (error) {
    console.error('Video progress POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Clear progress when video ends
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json(
        { error: 'Content ID is required' },
        { status: 400 }
      );
    }

    // Get authenticated user from Supabase auth
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      // If not authenticated, silently ignore (don't track)
      return NextResponse.json({ message: 'Not authenticated' }, { status: 200 });
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    
    if (authError || !user) {
      // If not authenticated, silently ignore (don't track)
      return NextResponse.json({ message: 'Not authenticated' }, { status: 200 });
    }

    // Remove progress record using service role (bypasses RLS)
    const { error } = await supabaseService
      .from('playback_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('content_id', contentId);

    if (error) {
      console.error('Error clearing video progress:', error);
      return NextResponse.json(
        { error: 'Failed to clear progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Progress cleared successfully' });

  } catch (error) {
    console.error('Video progress DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
