import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for public read access
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

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













