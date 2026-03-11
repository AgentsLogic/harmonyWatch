import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// Helper to get user from Supabase auth
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

// GET: Fetch playback progress for a specific content item
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromAuth(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const contentItemId = searchParams.get('contentItemId');

    if (!contentItemId) {
      return NextResponse.json(
        { error: 'Content item ID is required' },
        { status: 400 }
      );
    }

    // Fetch progress for this user and content item
    const { data, error } = await supabase
      .from('user_playback_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('content_item_id', contentItemId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching playback progress:', error);
      return NextResponse.json(
        { error: 'Failed to fetch progress' },
        { status: 500 }
      );
    }

    // Return progress data or default values
    return NextResponse.json({
      currentPosition: data?.current_position || 0,
      duration: data?.duration || 0,
      progressPercentage: data?.progress_percentage || 0,
      isCompleted: data?.is_completed || false
    });

  } catch (error) {
    console.error('Playback progress GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Save playback progress
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromAuth(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { contentItemId, currentPosition, duration } = body;

    if (!contentItemId || typeof currentPosition !== 'number' || typeof duration !== 'number') {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Calculate progress percentage
    const progressPercentage = duration > 0 ? (currentPosition / duration) * 100 : 0;
    const isCompleted = progressPercentage >= 95;

    // If content is completed (>=95%), delete the progress record instead of saving
    // This matches video behavior and ensures completed content doesn't appear in continue watching
    if (isCompleted) {
      const { error: deleteError } = await supabase
        .from('user_playback_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('content_item_id', contentItemId);

      if (deleteError) {
        console.error('Error clearing completed playback progress:', deleteError);
        return NextResponse.json(
          { error: 'Failed to clear progress' },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        message: 'Progress cleared - content completed',
        progressPercentage,
        isCompleted: true
      });
    }

    // Save or update progress for incomplete content
    const { error } = await supabase
      .from('user_playback_progress')
      .upsert({
        user_id: user.id,
        content_item_id: contentItemId,
        current_position: currentPosition,
        duration: duration,
        progress_percentage: progressPercentage,
        is_completed: false,
        last_played: new Date().toISOString()
      }, {
        onConflict: 'user_id,content_item_id'
      });

    if (error) {
      console.error('Error saving playback progress:', error);
      return NextResponse.json(
        { error: 'Failed to save progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Progress saved successfully',
      progressPercentage,
      isCompleted: false
    });

  } catch (error) {
    console.error('Playback progress POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Clear playback progress
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromAuth(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const contentItemId = searchParams.get('contentItemId');

    if (!contentItemId) {
      return NextResponse.json(
        { error: 'Content item ID is required' },
        { status: 400 }
      );
    }

    // Remove progress record
    const { error } = await supabase
      .from('user_playback_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('content_item_id', contentItemId);

    if (error) {
      console.error('Error clearing playback progress:', error);
      return NextResponse.json(
        { error: 'Failed to clear progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Progress cleared successfully' });

  } catch (error) {
    console.error('Playback progress DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}