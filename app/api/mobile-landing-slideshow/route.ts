import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// GET - Fetch all active images ordered by sort_order (public endpoint)
export async function GET(request: NextRequest) {
  try {
    const { data: images, error } = await supabase
      .from('mobile_landing_slideshow')
      .select('id, image_url, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching mobile landing slideshow images:', error);
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: 'Database table not found. Please run the migration: database-migrations/add-mobile-landing-slideshow.sql'
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch images'},
        { status: 500 }
      );
    }

    // Add caching headers for better performance
    // Cache for 5 minutes, but allow revalidation
    const headers = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    };

    return NextResponse.json({ images: images || [] }, { headers });
  } catch (error) {
    console.error('Error in GET /api/mobile-landing-slideshow:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
