import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// GET - Fetch landing page series (public endpoint)
export async function GET(request: NextRequest) {
  try {
    const { data: landingSeries, error } = await supabase
      .from('landing_page_series')
      .select(`
        *,
        series:series_id (
          id,
          title,
          description,
          thumbnail_url,
          content_type,
          episodes_count
        )
      `)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching landing page series:', error);
      return NextResponse.json(
        { error: 'Failed to fetch landing page series' },
        { status: 500 }
      );
    }

    // If no series are configured, return empty array
    // The landing page will handle showing random video series
    return NextResponse.json({ series: landingSeries || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching landing page series:', error);
    return NextResponse.json(
      { error: 'Failed to fetch landing page series' },
      { status: 500 }
    );
  }
}













