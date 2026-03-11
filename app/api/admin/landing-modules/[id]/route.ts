import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// PATCH - Update a landing page module
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

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (series_id !== undefined) updateData.series_id = series_id;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (logo_url_override !== undefined) updateData.logo_url_override = logo_url_override || null;
    if (background_url_override !== undefined) updateData.background_url_override = background_url_override || null;
    if (subtitle_override !== undefined) updateData.subtitle_override = subtitle_override || null;
    if (hide_subtitle !== undefined) updateData.hide_subtitle = hide_subtitle;
    if (button_text_override !== undefined) updateData.button_text_override = button_text_override || null;
    if (logo_width !== undefined) updateData.logo_width = logo_width ? (typeof logo_width === 'string' ? parseInt(logo_width) : logo_width) : null;
    if (logo_height !== undefined) updateData.logo_height = logo_height ? (typeof logo_height === 'string' ? parseInt(logo_height) : logo_height) : null;

    const { data: updatedModule, error } = await supabase
      .from('landing_page_modules')
      .update(updateData)
      .eq('id', id)
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
      console.error('Error updating landing page module:', error);
      return NextResponse.json(
        { error: 'Failed to update landing page module' },
        { status: 500 }
      );
    }

    return NextResponse.json({ module: updatedModule }, { status: 200 });
  } catch (error) {
    console.error('Error updating landing page module:', error);
    return NextResponse.json(
      { error: 'Failed to update landing page module' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a landing page module
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

    const { error } = await supabase
      .from('landing_page_modules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting landing page module:', error);
      return NextResponse.json(
        { error: 'Failed to delete landing page module' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting landing page module:', error);
    return NextResponse.json(
      { error: 'Failed to delete landing page module' },
      { status: 500 }
    );
  }
}
