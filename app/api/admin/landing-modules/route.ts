import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch all landing page modules
export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

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
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: 'Database table not found. Please run the migration: database-migrations/add-landing-page-modules.sql'
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch landing page modules'},
        { status: 500 }
      );
    }

    return NextResponse.json({ modules: modules || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching landing page modules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch landing page modules' },
      { status: 500 }
    );
  }
}

// POST - Add a module to landing page
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
    const { 
      series_id, 
      sort_order,
      logo_url_override,
      background_url_override,
      subtitle_override,
      hide_subtitle,
      button_text_override,
      logo_width,
      logo_height
    } = body;

    if (!series_id) {
      return NextResponse.json(
        { error: 'series_id is required' },
        { status: 400 }
      );
    }

    // Check if module already exists for this series
    const { data: existing } = await supabase
      .from('landing_page_modules')
      .select('id')
      .eq('series_id', series_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Module already exists for this series' },
        { status: 400 }
      );
    }

    // Get max sort_order to append at end if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const { data: maxOrder } = await supabase
        .from('landing_page_modules')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();
      
      finalSortOrder = maxOrder ? (maxOrder.sort_order + 1) : 0;
    }

    const { data: newModule, error } = await supabase
      .from('landing_page_modules')
      .insert({
        series_id,
        sort_order: finalSortOrder,
        logo_url_override: logo_url_override || null,
        background_url_override: background_url_override || null,
        subtitle_override: subtitle_override || null,
        hide_subtitle: hide_subtitle || false,
        button_text_override: button_text_override || null,
        logo_width: logo_width ? (typeof logo_width === 'string' ? parseInt(logo_width) : logo_width) : null,
        logo_height: logo_height ? (typeof logo_height === 'string' ? parseInt(logo_height) : logo_height) : null,
      })
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
      .single();

    if (error) {
      console.error('Error creating landing page module:', error);
      return NextResponse.json(
        { error: 'Failed to create landing page module' },
        { status: 500 }
      );
    }

    return NextResponse.json({ module: newModule }, { status: 201 });
  } catch (error) {
    console.error('Error creating landing page module:', error);
    return NextResponse.json(
      { error: 'Failed to create landing page module' },
      { status: 500 }
    );
  }
}
