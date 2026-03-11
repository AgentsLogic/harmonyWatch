import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// DELETE - Remove a series from landing page
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
      .from('landing_page_series')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting landing page series:', error);
      return NextResponse.json(
        { error: 'Failed to delete landing page series' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting landing page series:', error);
    return NextResponse.json(
      { error: 'Failed to delete landing page series' },
      { status: 500 }
    );
  }
}

// PATCH - Update sort order
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
    const { sort_order } = body;

    const updateData: any = {};
    if (sort_order !== undefined) {
      updateData.sort_order = sort_order;
    }

    const { data: updated, error } = await supabase
      .from('landing_page_series')
      .update(updateData)
      .eq('id', id)
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
      console.error('Error updating landing page series:', error);
      return NextResponse.json(
        { error: 'Failed to update landing page series' },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (error) {
    console.error('Error updating landing page series:', error);
    return NextResponse.json(
      { error: 'Failed to update landing page series' },
      { status: 500 }
    );
  }
}













