import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch all landing page series
export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

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

    return NextResponse.json({ series: landingSeries || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching landing page series:', error);
    return NextResponse.json(
      { error: 'Failed to fetch landing page series' },
      { status: 500 }
    );
  }
}

// POST - Add a series to landing page
export async function POST(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { series_id, sort_order } = body;

    if (!series_id) {
      return NextResponse.json(
        { error: 'series_id is required' },
        { status: 400 }
      );
    }

    // Check if series already exists
    const { data: existing } = await supabase
      .from('landing_page_series')
      .select('id')
      .eq('series_id', series_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Series already added to landing page' },
        { status: 400 }
      );
    }

    // Get max sort_order to append at end if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const { data: maxOrder } = await supabase
        .from('landing_page_series')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();
      
      finalSortOrder = maxOrder ? (maxOrder.sort_order + 1) : 0;
    }

    const { data: newItem, error } = await supabase
      .from('landing_page_series')
      .insert({
        series_id,
        sort_order: finalSortOrder,
      })
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
      .single();

    if (error) {
      console.error('Error creating landing page series:', error);
      return NextResponse.json(
        { error: 'Failed to create landing page series' },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error('Error creating landing page series:', error);
    return NextResponse.json(
      { error: 'Failed to create landing page series' },
      { status: 500 }
    );
  }
}













