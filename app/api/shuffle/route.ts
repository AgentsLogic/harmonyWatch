import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/shuffle
 * Returns a random video ID from all available videos (regardless of free/premium status)
 */
export async function GET() {
  try {
    // Fetch a limited set of video IDs (100) and pick one randomly
    // This is much faster than fetching all videos, and works around Supabase's
    // limitation of not supporting ORDER BY random() directly
    const { data: videos, error } = await supabaseAdmin
      .from('content_items')
      .select(`
        id,
        short_id
      `)
      .eq('visibility', 'public')
      .eq('content_type', 'video')
      .not('mux_playback_id', 'is', null) // Only videos that are ready to play
      .limit(100); // Fetch up to 100 videos for random selection

    if (error) {
      console.error('[API] Error fetching videos for shuffle:', error);
      return NextResponse.json(
        { error: 'Failed to fetch videos'},
        { status: 500 }
      );
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json(
        { error: 'No videos available' },
        { status: 404 }
      );
    }

    // Pick a random video from the fetched set
    const randomIndex = Math.floor(Math.random() * videos.length);
    const randomVideo = videos[randomIndex];

    // Return short_id if available, otherwise id
    return NextResponse.json({
      id: randomVideo.id,
      short_id: randomVideo.short_id || randomVideo.id,
    });
  } catch (error) {
    console.error('[API] Error in shuffle endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
