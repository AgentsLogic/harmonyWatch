import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import { muxVideoService } from '@/lib/services/mux-video';

function verifyMuxSignature(req: NextRequest, rawBody: string): boolean {
	const signature = req.headers.get('mux-signature');
	if (!signature) return false;
	// Mux provides signatures like: t=timestamp,v1=hash
	const parts = signature.split(',').reduce<Record<string, string>>((acc, kv) => {
		const [k, v] = kv.split('=').map(s => s.trim());
		if (k && v) acc[k] = v;
		return acc;
	}, {});
	const provided = parts['v1'];
	if (!provided) return false;
	const crypto = require('crypto');
	const hmac = crypto.createHmac('sha256', serverConfig.MUX_WEBHOOK_SECRET);
	hmac.update(rawBody, 'utf8');
	const expected = hmac.digest('hex');
	return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// In-memory store for upload_id -> asset_id mapping (for development)
// In production, use a proper database table
const uploadToAssetMap = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!verifyMuxSignature(request, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const body = JSON.parse(rawBody);
    console.log('Mux webhook received:', body);

    const { type, data } = body;

    // Handle different webhook event types
    switch (type) {
      case 'video.upload.asset_created':
        // Store the mapping between upload_id and asset_id
        if (data.upload_id && data.asset_id) {
          uploadToAssetMap.set(data.upload_id, data.asset_id);
          console.log(`[Webhook] Stored mapping: upload_id ${data.upload_id} -> asset_id ${data.asset_id}`);
          
          // Try to find and update pending content items that don't have an upload_id yet
          // Look for pending items created in the last 2 hours (to account for slow uploads)
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          
          const { data: pendingItems, error: pendingError } = await supabaseAdmin
            .from('content_items')
            .select('id, title, mux_upload_id, created_at, content_type')
            .eq('stream_status', 'pending')
            .is('mux_upload_id', null)
            .eq('content_type', 'video')
            .gte('created_at', twoHoursAgo)
            .order('created_at', { ascending: false })
            .limit(10); // Limit to most recent 10 to avoid matching wrong items
          
          if (!pendingError && pendingItems && pendingItems.length > 0) {
            console.log(`[Webhook] Found ${pendingItems.length} pending content items without upload_id, attempting to match...`);
            
            // Update the most recently created pending item (most likely to be the one that just uploaded)
            // In the future, we could match by filename if Mux provides it in the webhook
            const mostRecentPending = pendingItems[0];
            
            console.log(`[Webhook] Updating pending content item ${mostRecentPending.id} (${mostRecentPending.title}) with upload_id ${data.upload_id}`);
            
            const { error: updateError } = await supabaseAdmin
              .from('content_items')
              .update({
                mux_upload_id: data.upload_id,
                stream_status: 'processing' // Transition from pending to processing
              })
              .eq('id', mostRecentPending.id);
            
            if (updateError) {
              console.error(`[Webhook] Error updating pending content item ${mostRecentPending.id}:`, updateError);
            } else {
              console.log(`[Webhook] Successfully updated pending content item ${mostRecentPending.id} with upload_id ${data.upload_id}`);
            }
          }
        }
        break;

      case 'video.asset.ready':
        // Asset is ready for playback
        if (data.id) {
          console.log(`Asset ${data.id} is ready for playback`);
          
          // Get duration from Mux asset data (in seconds)
          const durationSeconds = data.duration || null;
          let durationFormatted: string | null = null;
          
          if (durationSeconds && durationSeconds > 0) {
            // Convert seconds to MM:SS format
            const minutes = Math.floor(durationSeconds / 60);
            const seconds = Math.floor(durationSeconds % 60);
            durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            console.log(`Calculated duration: ${durationFormatted} (${durationSeconds} seconds)`);
          }
          
          // Try to find upload_id from the mapping or from asset data
          let uploadId: string | null = null;
          
          // Check if webhook data includes upload_id
          if (data.passthrough) {
            try {
              const passthrough = typeof data.passthrough === 'string' ? JSON.parse(data.passthrough) : data.passthrough;
              uploadId = passthrough?.upload_id || null;
            } catch (e) {
              // passthrough might not be JSON
            }
          }
          
          // If no upload_id in passthrough, try to find it from the mapping
          if (!uploadId) {
            for (const [uid, assetId] of uploadToAssetMap.entries()) {
              if (assetId === data.id) {
                uploadId = uid;
                break;
              }
            }
          }
          
          // Find the content item by asset_id (if already set) or by upload_id
          let contentItems;
          let error;
          
          if (uploadId) {
            // First try to find by upload_id (for content saved while processing)
            const result = await supabaseAdmin
              .from('content_items')
              .select('id, mux_upload_id, mux_asset_id')
              .eq('mux_upload_id', uploadId)
              .limit(1);
            contentItems = result.data;
            error = result.error;
          }
          
          // If not found by upload_id, try by asset_id
          if (!contentItems || contentItems.length === 0) {
            const result = await supabaseAdmin
              .from('content_items')
              .select('id, mux_upload_id, mux_asset_id')
              .eq('mux_asset_id', data.id)
              .limit(1);
            contentItems = result.data;
            error = result.error;
          }

          // Fallback: If still not found, query all processing items and check their upload_ids
          if ((!contentItems || contentItems.length === 0) && !error) {
            console.log(`[Webhook] Content not found by upload_id or asset_id, checking all processing items...`);
            const { data: processingItems, error: processingError } = await supabaseAdmin
              .from('content_items')
              .select('id, mux_upload_id, mux_asset_id')
              .eq('stream_status', 'processing')
              .not('mux_upload_id', 'is', null);

            if (!processingError && processingItems && processingItems.length > 0) {
              console.log(`[Webhook] Found ${processingItems.length} processing items, checking upload_ids...`);
              
              // Check each processing item's upload_id against Mux
              for (const item of processingItems) {
                if (!item.mux_upload_id) continue;
                
                try {
                  const uploadDetails = await muxVideoService.getUploadDetails(item.mux_upload_id);
                  if (uploadDetails.success && uploadDetails.assetId === data.id) {
                    console.log(`[Webhook] Found matching content item via upload_id lookup: ${item.id}`);
                    contentItems = [item];
                    break;
                  }
                } catch (err) {
                  console.error(`[Webhook] Error checking upload_id ${item.mux_upload_id}:`, err);
                }
              }
            }
          }

          if (error) {
            console.error('Error finding content item:', error);
          } else if (contentItems && contentItems.length > 0) {
            const contentItem = contentItems[0];
            
            // Update the content item with the asset details including duration
            const { error: updateError } = await supabaseAdmin
              .from('content_items')
              .update({
                mux_asset_id: data.id,
                mux_playback_id: data.playback_ids?.[0]?.id || null,
                duration: durationFormatted,
                stream_status: 'ready'
              })
              .eq('id', contentItem.id);

            if (updateError) {
              console.error('Error updating content item:', updateError);
            } else {
              console.log(`Updated content item ${contentItem.id} with asset details and duration: ${durationFormatted}`);
            }
          } else {
            console.log(`No content item found for asset ${data.id} (upload_id: ${uploadId})`);
          }
        }
        break;

      case 'video.asset.errored':
        // Asset processing failed
        if (data.id) {
          console.log(`Asset ${data.id} processing failed`);
          
          // Update content item status to errored
          const { error } = await supabaseAdmin
            .from('content_items')
            .update({ stream_status: 'errored' })
            .eq('mux_asset_id', data.id);

          if (error) {
            console.error('Error updating content item status:', error);
          }
        }
        break;

      default:
        console.log(`Unhandled webhook event type: ${type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve stored webhook events (for debugging)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');

  if (assetId) {
    // Find upload_id for this asset_id
    for (const [uploadId, mappedAssetId] of uploadToAssetMap.entries()) {
      if (mappedAssetId === assetId) {
        return NextResponse.json({ uploadId, assetId: mappedAssetId });
      }
    }
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  // Return all mappings (for debugging)
  const mappings = Array.from(uploadToAssetMap.entries()).map(([uploadId, assetId]) => ({
    uploadId,
    assetId
  }));

  return NextResponse.json({ mappings });
}
