import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  try {
    const { seriesId } = await params;
    
    // Get the series to find its content_ids
    const { data: seriesData, error: seriesError } = await supabaseAdmin
      .from('series')
      .select('content_ids')
      .eq('id', seriesId)
      .single();
    
    if (seriesError || !seriesData) {
      return NextResponse.json(
        { error: 'Series not found' },
        { status: 404 }
      );
    }
    
    const contentIds = seriesData.content_ids || [];
    
    if (contentIds.length === 0) {
      return NextResponse.json({ episodes: [] });
    }
    
    // Fetch all content items for this series that have calendar dates
    const { data: episodes, error } = await supabaseAdmin
      .from('content_items')
      .select('id, title, description, thumbnail_url, new_calendar_date, old_calendar_date, content_type, duration')
      .in('id', contentIds)
      .not('new_calendar_date', 'is', null)
      .order('new_calendar_date', { ascending: true })
      .order('created_at', { ascending: true }); // Secondary sort for episodes on same date
    
    if (error) {
      console.error('Error fetching episodes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch episodes' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ episodes: episodes || [] });
  } catch (error) {
    console.error('Error in GET /api/admin/daily-content/[seriesId]/episodes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

