import { NextRequest, NextResponse } from 'next/server';
import { carouselService } from '@/lib/services/carouselService';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { series_id, sort_order, logo_url, subtitle, background_url, background_urls, badges, auto_badge_enabled, enable_video_preview, is_active } = body;

    const updates: any = {};
    if (series_id !== undefined) updates.series_id = series_id;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (logo_url !== undefined) updates.logo_url = logo_url || null;
    if (subtitle !== undefined) updates.subtitle = subtitle || null;
    if (background_url !== undefined) updates.background_url = background_url || null;
    if (background_urls !== undefined) updates.background_urls = background_urls || null;
    if (badges !== undefined) updates.badges = badges || null;
    if (auto_badge_enabled !== undefined) updates.auto_badge_enabled = auto_badge_enabled;
    if (enable_video_preview !== undefined) updates.enable_video_preview = enable_video_preview;
    if (is_active !== undefined) updates.is_active = is_active;

    const updatedItem = await carouselService.updateCarouselItem(id, updates);

    return NextResponse.json({ item: updatedItem }, { status: 200 });
  } catch (error) {
    console.error('Error updating carousel item:', error);
    return NextResponse.json(
      { error: 'Failed to update carousel item' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    await carouselService.deleteCarouselItem(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting carousel item:', error);
    return NextResponse.json(
      { error: 'Failed to delete carousel item' },
      { status: 500 }
    );
  }
}

