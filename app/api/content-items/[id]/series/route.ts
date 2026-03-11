import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contentId } = await params;

    if (!contentId) {
      return NextResponse.json({ seriesTitle: null }, { status: 400 });
    }

    // Fetch the content item's calendar dates
    const { data: contentItem, error: contentError } = await supabaseAdmin
      .from('content_items')
      .select('new_calendar_date, old_calendar_date')
      .eq('id', contentId)
      .single();

    // Find which series contains this content item in its content_ids array
    // The series table has a content_ids TEXT[] column that contains content item IDs
    // Fetch all series and check which one contains this content ID in its array
    const { data: seriesList, error: seriesError } = await supabaseAdmin
      .from('series')
      .select('id, title, content_ids, is_daily_content, thumbnail_url');

    if (seriesError) {
      console.error('[API] Error fetching series:', seriesError);
      return NextResponse.json({ seriesTitle: null, isDailyContent: false });
    }

    if (!seriesList || seriesList.length === 0) {
      return NextResponse.json({ seriesTitle: null, isDailyContent: false });
    }

    // Find the series that contains this content item ID in its content_ids array
    const containingSeries = seriesList.find(series => {
      if (!series.content_ids || !Array.isArray(series.content_ids)) {
        return false;
      }
      return series.content_ids.includes(contentId);
    });

    if (!containingSeries) {
      // Content is not in any series
      return NextResponse.json({ seriesTitle: null, isDailyContent: false });
    }

    
    return NextResponse.json({ 
      seriesTitle: containingSeries.title,
      isDailyContent: containingSeries.is_daily_content || false,
      newCalendarDate: contentItem?.new_calendar_date || null,
      oldCalendarDate: contentItem?.old_calendar_date || null,
      seriesThumbnailUrl: containingSeries.thumbnail_url || null
    });
  } catch (error) {
    console.error('[API] Error fetching series title:', error);
    return NextResponse.json({ seriesTitle: null }, { status: 500 });
  }
}

