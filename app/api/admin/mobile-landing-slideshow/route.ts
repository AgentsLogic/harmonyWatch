import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch all images (including inactive), ordered by sort_order
export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { data: images, error } = await supabase
      .from('mobile_landing_slideshow')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching mobile landing slideshow images:', error);
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: 'Database table not found. Please run the migration: database-migrations/add-mobile-landing-slideshow.sql',
            details: error.message 
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch images', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ images: images || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching mobile landing slideshow images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}

// POST - Add new image record (receives image_url after client-side upload, plus optional sort_order)
export async function POST(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { image_url, sort_order } = body;

    if (!image_url) {
      return NextResponse.json(
        { error: 'image_url is required' },
        { status: 400 }
      );
    }

    // Get max sort_order to append at end if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const { data: maxOrder } = await supabase
        .from('mobile_landing_slideshow')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();
      
      finalSortOrder = maxOrder ? (maxOrder.sort_order + 1) : 0;
    }

    const { data: newImage, error } = await supabase
      .from('mobile_landing_slideshow')
      .insert({
        image_url,
        sort_order: finalSortOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating mobile landing slideshow image:', error);
      return NextResponse.json(
        { error: 'Failed to create image record', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: newImage }, { status: 201 });
  } catch (error) {
    console.error('Error creating mobile landing slideshow image:', error);
    return NextResponse.json(
      { error: 'Failed to create image record' },
      { status: 500 }
    );
  }
}
