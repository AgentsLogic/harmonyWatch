import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for public read access
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch landing page modules (public endpoint)
export async function GET(request: NextRequest) {
  try {
    const { data: modules, error } = await supabase
      .from('landing_page_modules')
      .select(`
        *,
        series:series_id (
          id,
          title,
          description,
          thumbnail_url,
          logo_url,
          banner_url,
          content_type,
          episodes_count
        )
      `)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching landing page modules:', error);
      return NextResponse.json(
        { error: 'Failed to fetch landing page modules' },
        { status: 500 }
      );
    }

    // Return empty array if no modules configured
    return NextResponse.json({ modules: modules || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching landing page modules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch landing page modules' },
      { status: 500 }
    );
  }
}
