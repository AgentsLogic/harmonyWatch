import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// PATCH - Update image (sort_order, is_active)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { sort_order, is_active } = body;

    // Build update object with only provided fields
    const updateData: { sort_order?: number; is_active?: boolean } = {};
    if (sort_order !== undefined) {
      updateData.sort_order = typeof sort_order === 'string' ? parseInt(sort_order) : sort_order;
    }
    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: updatedImage, error } = await supabase
      .from('mobile_landing_slideshow')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating mobile landing slideshow image:', error);
      return NextResponse.json(
        { error: 'Failed to update image', details: error.message },
        { status: 500 }
      );
    }

    if (!updatedImage) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ image: updatedImage }, { status: 200 });
  } catch (error) {
    console.error('Error updating mobile landing slideshow image:', error);
    return NextResponse.json(
      { error: 'Failed to update image' },
      { status: 500 }
    );
  }
}

// DELETE - Delete image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // First, get the image to get the URL (for potential storage cleanup)
    const { data: image, error: fetchError } = await supabase
      .from('mobile_landing_slideshow')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('mobile_landing_slideshow')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting mobile landing slideshow image:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete image', details: deleteError.message },
        { status: 500 }
      );
    }

    // Note: We don't delete from Supabase Storage here to avoid breaking references
    // If needed, storage cleanup can be done separately

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting mobile landing slideshow image:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
