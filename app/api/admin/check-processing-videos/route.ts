import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { muxVideoService } from '@/lib/services/mux-video';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

export async function POST(request: NextRequest) {
  try {
    // Check if user is admin or staff
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - Admin or Staff access required' }, { status: 401 });
    }

    console.log('[Check Processing Videos] Starting check for processing videos...');

    // Get all content items that are processing or pending
    // Include both videos with and without mux_upload_id (pending videos might not have it yet)
    const { data: processingItems, error } = await supabaseAdmin
      .from('content_items')
      .select('id, mux_upload_id, mux_asset_id, mux_playback_id, title, stream_status')
      .or('stream_status.eq.processing,stream_status.eq.pending');
    
    // Separate items into two groups:
    // 1. Items with mux_upload_id that we can check with Mux API
    // 2. Items without mux_upload_id (pending, waiting for upload to complete)
    const itemsWithUploadId = processingItems?.filter(item => 
      (item.stream_status === 'processing' || item.stream_status === 'pending') && 
      item.mux_upload_id && 
      !item.mux_playback_id
    ) || [];

    const itemsWithoutUploadId = processingItems?.filter(item => 
      (item.stream_status === 'processing' || item.stream_status === 'pending') && 
      !item.mux_upload_id &&
      !item.mux_playback_id
    ) || [];

    // Automatically transition pending items with upload_id to processing status
    const pendingItemsWithUploadId = itemsWithUploadId.filter(item => item.stream_status === 'pending');
    if (pendingItemsWithUploadId.length > 0) {
      console.log(`[Check Processing Videos] Found ${pendingItemsWithUploadId.length} pending items with upload_id, updating to processing...`);
      
      for (const item of pendingItemsWithUploadId) {
        const { error: updateError } = await supabaseAdmin
          .from('content_items')
          .update({ stream_status: 'processing' })
          .eq('id', item.id);
        
        if (updateError) {
          console.error(`[Check Processing Videos] Error updating item ${item.id} from pending to processing:`, updateError);
        } else {
          console.log(`[Check Processing Videos] Updated item ${item.id} (${item.title}) from pending to processing`);
          // Update the item's status in memory so it's processed correctly below
          item.stream_status = 'processing';
        }
      }
    }

    // Items we can check with Mux API
    const itemsToCheck = itemsWithUploadId;

    if (error) {
      console.error('[Check Processing Videos] Error fetching processing items:', error);
      return NextResponse.json({ error: 'Failed to fetch processing items' }, { status: 500 });
    }

    // Initialize results array and counter
    let updatedCount = 0;
    const results: Array<{
      id: string;
      title: string;
      status: string;
      message: string;
    }> = [];

    // Add items without upload_id to results (they're waiting for upload to complete)
    itemsWithoutUploadId.forEach(item => {
      results.push({
        id: item.id,
        title: item.title,
        status: 'waiting_upload',
        message: 'Video is pending - waiting for upload to complete. Upload ID not yet available. The webhook will automatically match this when the upload completes.'
      });
    });

    if (itemsToCheck.length === 0 && itemsWithoutUploadId.length === 0) {
      console.log('[Check Processing Videos] No processing items found');
      return NextResponse.json({ 
        message: 'No processing videos found',
        checked: 0,
        updated: 0,
        results: []
      });
    }

    console.log(`[Check Processing Videos] Found ${itemsToCheck.length} processing items with upload ID, ${itemsWithoutUploadId.length} waiting for upload`);

    // Check each processing item
    for (const item of itemsToCheck) {
      if (!item.mux_upload_id) continue;

      try {
        // Get upload details from Mux
        const uploadDetails = await muxVideoService.getUploadDetails(item.mux_upload_id);
        
        if (!uploadDetails.success || !uploadDetails.assetId) {
          console.log(`[Check Processing Videos] Upload ${item.mux_upload_id} still processing (no asset yet)`);
          results.push({
            id: item.id,
            title: item.title,
            status: 'still_processing',
            message: 'Upload still processing, no asset created yet'
          });
          continue;
        }

        // Get asset details from Mux
        const assetDetails = await muxVideoService.getAssetDetails(uploadDetails.assetId);
        
        if (!assetDetails) {
          console.log(`[Check Processing Videos] Could not retrieve asset details for ${uploadDetails.assetId}`);
          results.push({
            id: item.id,
            title: item.title,
            status: 'error',
            message: 'Could not retrieve asset details'
          });
          continue;
        }

        if (assetDetails.status === 'ready') {
          // Format duration
          let durationFormatted: string | null = null;
          if (assetDetails.duration && assetDetails.duration > 0) {
            const minutes = Math.floor(assetDetails.duration / 60);
            const seconds = Math.floor(assetDetails.duration % 60);
            durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }

          // Update the content item
          const { error: updateError } = await supabaseAdmin
            .from('content_items')
            .update({
              mux_asset_id: uploadDetails.assetId,
              mux_playback_id: assetDetails.playback_ids[0]?.id || null,
              duration: durationFormatted,
              stream_status: 'ready'
            })
            .eq('id', item.id);

          if (updateError) {
            console.error(`[Check Processing Videos] Error updating item ${item.id}:`, updateError);
            results.push({
              id: item.id,
              title: item.title,
              status: 'error',
              message: `Update failed: ${updateError.message}`
            });
          } else {
            console.log(`[Check Processing Videos] Updated item ${item.id} (${item.title}) to ready`);
            updatedCount++;
            results.push({
              id: item.id,
              title: item.title,
              status: 'updated',
              message: 'Successfully updated to ready'
            });
          }
        } else if (assetDetails.status === 'errored') {
          // Update to errored status
          const { error: updateError } = await supabaseAdmin
            .from('content_items')
            .update({ stream_status: 'errored' })
            .eq('id', item.id);

          if (updateError) {
            console.error(`[Check Processing Videos] Error updating item ${item.id} to errored:`, updateError);
          } else {
            console.log(`[Check Processing Videos] Updated item ${item.id} (${item.title}) to errored`);
            results.push({
              id: item.id,
              title: item.title,
              status: 'errored',
              message: 'Asset processing failed'
            });
          }
        } else {
          // Still preparing
          console.log(`[Check Processing Videos] Asset ${uploadDetails.assetId} still preparing`);
          results.push({
            id: item.id,
            title: item.title,
            status: 'still_processing',
            message: 'Asset still preparing'
          });
        }
      } catch (err) {
        console.error(`[Check Processing Videos] Error checking item ${item.id}:`, err);
        results.push({
          id: item.id,
          title: item.title,
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    const totalChecked = itemsToCheck.length + itemsWithoutUploadId.length;
    return NextResponse.json({
      message: `Checked ${totalChecked} items (${itemsToCheck.length} with upload ID, ${itemsWithoutUploadId.length} waiting for upload), updated ${updatedCount}`,
      checked: totalChecked,
      updated: updatedCount,
      results
    });

  } catch (error) {
    console.error('[Check Processing Videos] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check processing videos', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

