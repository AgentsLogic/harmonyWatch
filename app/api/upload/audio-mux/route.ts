import { NextRequest, NextResponse } from 'next/server';
import { muxVideoService } from '@/lib/services/mux-video';

// In-memory store for upload_id -> asset_id mapping (for development)
// In production, use a proper database table
const uploadToAssetMap = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    console.log('Mux audio upload API called (create upload URL)');
    
    // Create direct upload URL
    const uploadResult = await muxVideoService.createDirectUpload('audio.mp3', 'unknown');
    
    console.log('Upload result:', uploadResult);
    
    if (!uploadResult.success || !uploadResult.uploadId || !uploadResult.uploadUrl) {
      console.error('Upload creation failed:', uploadResult);
      return NextResponse.json(
        { error: uploadResult.error || 'Failed to create upload URL' },
        { status: 500 }
      );
    }

    // Store the upload_id for webhook matching
    if (uploadResult.uploadId) {
      uploadToAssetMap.set(uploadResult.uploadId, 'pending');
    }

    console.log('Upload result:', {
      success: uploadResult.success,
      uploadId: uploadResult.uploadId,
      assetId: uploadResult.assetId
    });

    // Return the upload URL as plain text (MuxUploaderDrop expects this)
    return new NextResponse(uploadResult.uploadUrl, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });

  } catch (error) {
    console.error('Mux direct upload creation error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json(
      { 
        error: 'Failed to create upload URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve asset details by upload_id or asset_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId');
    const assetId = searchParams.get('assetId');

    if (!uploadId && !assetId) {
      return NextResponse.json(
        { error: 'uploadId or assetId parameter is required' },
        { status: 400 }
      );
    }

    // If assetId is provided, get asset details directly
    if (assetId) {
      console.log(`[Mux API] Getting asset details for assetId: ${assetId}`);
      const assetDetails = await muxVideoService.getAssetDetails(assetId);
      
      if (!assetDetails) {
        console.log(`[Mux API] Failed to get asset details for assetId: ${assetId}`);
        return NextResponse.json(
          { error: 'Failed to retrieve asset details' },
          { status: 500 }
        );
      }

      console.log(`[Mux API] Asset status: ${assetDetails.status}`);

      // Format duration as MM:SS
      let durationFormatted: string | null = null;
      if (assetDetails.duration && assetDetails.duration > 0) {
        const minutes = Math.floor(assetDetails.duration / 60);
        const seconds = Math.floor(assetDetails.duration % 60);
        durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }

      return NextResponse.json({
        assetId,
        status: assetDetails.status,
        playbackId: assetDetails.playback_ids[0]?.id || null,
        duration: durationFormatted,
        durationSeconds: assetDetails.duration,
        aspectRatio: assetDetails.aspect_ratio,
        maxResolution: assetDetails.max_stored_resolution
      });
    }

    console.log(`[Mux API] Checking status for uploadId: ${uploadId}`);

    // Try to get asset_id from our mapping first
    let mappedAssetId = uploadToAssetMap.get(uploadId!);
    
    if (!mappedAssetId || mappedAssetId === 'pending') {
      // Try to get asset_id directly from Mux upload details
      console.log(`[Mux API] Upload not in map, checking Mux for uploadId: ${uploadId}`);
      const uploadDetails = await muxVideoService.getUploadDetails(uploadId!);
      
      if (uploadDetails.success && uploadDetails.assetId) {
        mappedAssetId = uploadDetails.assetId;
        uploadToAssetMap.set(uploadId!, mappedAssetId);
        console.log(`[Mux API] Found assetId from Mux: ${mappedAssetId}`);
      } else {
        console.log(`[Mux API] No assetId found yet for uploadId: ${uploadId}`);
        // Upload is still processing, no asset created yet
        return NextResponse.json({
          uploadId,
          status: 'processing',
          message: 'Upload is still being processed'
        });
      }
    }

    if (!mappedAssetId || mappedAssetId === 'pending') {
      console.log(`[Mux API] No assetId available for uploadId: ${uploadId}`);
      return NextResponse.json({
        uploadId,
        status: 'processing',
        message: 'Upload is still being processed'
      });
    }

    // Get asset details
    console.log(`[Mux API] Getting asset details for assetId: ${mappedAssetId}`);
    const assetDetails = await muxVideoService.getAssetDetails(mappedAssetId);
    
    if (!assetDetails) {
      console.log(`[Mux API] Failed to get asset details for assetId: ${mappedAssetId}`);
      return NextResponse.json(
        { error: 'Failed to retrieve asset details' },
        { status: 500 }
      );
    }

    console.log(`[Mux API] Asset status: ${assetDetails.status}`);

    // Format duration as MM:SS
    let durationFormatted: string | null = null;
    if (assetDetails.duration && assetDetails.duration > 0) {
      const minutes = Math.floor(assetDetails.duration / 60);
      const seconds = Math.floor(assetDetails.duration % 60);
      durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    return NextResponse.json({
      uploadId,
      assetId: mappedAssetId,
      status: assetDetails.status,
      playbackId: assetDetails.playback_ids[0]?.id || null,
      duration: durationFormatted,
      durationSeconds: assetDetails.duration,
      aspectRatio: assetDetails.aspect_ratio,
      maxResolution: assetDetails.max_stored_resolution
    });

  } catch (error) {
    console.error('Error retrieving asset details:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve asset details' },
      { status: 500 }
    );
  }
}

