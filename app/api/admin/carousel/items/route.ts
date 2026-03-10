import { NextRequest, NextResponse } from 'next/server';
import { carouselService } from '@/lib/services/carouselService';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const items = await carouselService.getAllCarouselItems();
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error('Error fetching carousel items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch carousel items' },
      { status: 500 }
    );
  }
}

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
    const { series_id, sort_order, logo_url, subtitle, background_url, background_urls, badges, auto_badge_enabled, enable_video_preview, is_active } = body;

    if (!series_id) {
      return NextResponse.json(
        { error: 'series_id is required' },
        { status: 400 }
      );
    }

    const newItem = await carouselService.createCarouselItem({
      series_id,
      sort_order,
      logo_url: logo_url || null,
      subtitle: subtitle || null,
      background_url: background_url || null,
      background_urls: background_urls || null,
      badges: badges || null,
      auto_badge_enabled: auto_badge_enabled !== undefined ? auto_badge_enabled : false,
      enable_video_preview: enable_video_preview !== undefined ? enable_video_preview : false,
      is_active: is_active !== undefined ? is_active : true,
    });

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error('Error creating carousel item:', error);
    return NextResponse.json(
      { error: 'Failed to create carousel item' },
      { status: 500 }
    );
  }
}

