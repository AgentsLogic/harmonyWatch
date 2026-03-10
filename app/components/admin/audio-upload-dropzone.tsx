"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import MuxUploader from '@mux/mux-uploader-react';

interface AudioUploadDropzoneProps {
  onUploadComplete: (data: {
    assetId?: string;
    thumbnailUrl?: string;
    playbackId?: string;
    duration?: string | null;
    filename?: string | null;
    uploadId?: string;
    isProcessing?: boolean;
  }) => void;
  onUploadError: (error: any) => void;
  onUploadProgress: (progress: number) => void;
  /** Called immediately when we have an upload ID (before upload completes) */
  onUploadIdReady?: (uploadId: string) => void;
  disabled?: boolean;
}

export function AudioUploadDropzone({
  onUploadComplete,
  onUploadError,
  onUploadProgress,
  onUploadIdReady,
  disabled = false
}: AudioUploadDropzoneProps) {
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filename, setFilename] = useState<string | null>(null);
  const filenameRef = useRef<string | null>(null);
  const uploaderRef = useRef<any>(null);

  // Poll asset status to check when audio is ready
  const pollAssetStatus = useCallback(async (uploadId: string, attempt = 0) => {
    const maxAttempts = 60; // 10 minutes max (10s intervals) - for long audio files
    const interval = 10000; // 10 seconds

    if (attempt >= maxAttempts) {
      console.error('[Mux Upload] Asset polling timeout after 10 minutes');
      onUploadError('Audio processing timeout after 10 minutes. Please try again or contact support if the issue persists.');
      setIsProcessing(false);
      return;
    }

    try {
      console.log(`[Mux Upload] Polling asset status (attempt ${attempt + 1}/${maxAttempts})`);
      const response = await fetch(`/api/upload/audio-mux?uploadId=${uploadId}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Mux Upload] Asset status:', data);
        
        if (data.status === 'ready' && data.playbackId) {
          console.log('[Mux Upload] Asset is ready! Duration:', data.duration);
          setIsProcessing(false);
          
          // Use ref to get the latest filename value
          const currentFilename = filenameRef.current || filename || null;
          console.log('[Mux Upload] Passing filename to callback:', currentFilename);
          
          onUploadComplete({
            assetId: data.assetId,
            playbackId: data.playbackId,
            uploadId: uploadId,
            thumbnailUrl: undefined,
            duration: data.duration || null, // Pass duration in MM:SS format
            filename: currentFilename,
            isProcessing: false
          });
          
          return;
        } else if (data.status === 'errored') {
          console.error('[Mux Upload] Asset processing failed');
          onUploadError('Audio processing failed. Please try again.');
          setIsProcessing(false);
          return;
        }
      }
      
      // Continue polling
      setTimeout(() => pollAssetStatus(uploadId, attempt + 1), interval);
    } catch (error) {
      console.error('[Mux Upload] Error polling asset status:', error);
      setTimeout(() => pollAssetStatus(uploadId, attempt + 1), interval);
    }
  }, [onUploadComplete, onUploadError, filename]);

  // Handle upload success - start processing state
  const handleUploadSuccess = useCallback((event: any) => {
    console.log('[Mux Upload] Upload completed - Full event:', event);
    console.log('[Mux Upload] Event detail:', event.detail);
    console.log('[Mux Upload] Event target:', event.target);
    
    // Try to get filename from uploader element's file input
    let fileInputFilename: string | null = null;
    if (uploaderRef.current) {
      const fileInput = uploaderRef.current.querySelector?.('input[type="file"]');
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        fileInputFilename = fileInput.files[0].name;
        console.log('[Mux Upload] Found filename from file input:', fileInputFilename);
      }
    }
    
    // Try multiple ways to extract filename from event
    const eventFilename = event.detail?.file?.name 
      || event.detail?.files?.[0]?.name
      || event.target?.files?.[0]?.name 
      || event.detail?.upload?.file?.name
      || fileInputFilename
      || null;
    
    // Use ref value if event doesn't have filename
    const currentFilename = filenameRef.current || eventFilename;
    
    if (currentFilename) {
      console.log('[Mux Upload] Captured filename from event/ref/input:', currentFilename);
      setFilename(currentFilename);
      filenameRef.current = currentFilename; // Ensure ref is set
    } else {
      console.warn('[Mux Upload] No filename found in event, ref, or file input');
    }
    
    // Extract uploadId from the upload URL since the React component doesn't provide it in the event
    let uploadId: string | null = null;
    
    if (uploadUrl) {
      // Extract uploadId from URL like: https://direct-uploads.oci-us-ashburn-1-vop1.production.mux.com/upload/UPLOAD_ID?token=...
      const urlParts = uploadUrl.split('/upload/');
      if (urlParts.length > 1) {
        const uploadIdPart = urlParts[1].split('?')[0];
        uploadId = uploadIdPart;
        console.log('[Mux Upload] Extracted upload ID from URL:', uploadId);
      }
    }
    
    if (uploadId) {
      console.log('[Mux Audio Upload] Upload ID found:', uploadId);
      console.log('[Mux Audio Upload] Filename state:', filename || eventFilename);
      setUploadId(uploadId);
      setIsProcessing(true);
      
      // Immediately notify parent that upload is complete (but still processing)
      // This allows saving content while audio processes in background
      onUploadComplete({
        uploadId: uploadId,
        filename: currentFilename || eventFilename || null,
        isProcessing: true
      });
      
      // Start polling for asset status (will update parent when ready)
      pollAssetStatus(uploadId);
    } else {
      console.error('[Mux Audio Upload] Upload completed but no uploadId found in URL');
      console.error('[Mux Audio Upload] Upload URL:', uploadUrl);
      onUploadError('Upload completed but no uploadId found.');
    }
  }, [onUploadError, onUploadComplete, uploadUrl, pollAssetStatus, filename]);

  // Handle upload errors
  const handleUploadError = useCallback((event: any) => {
    console.error('[Mux Upload] Upload error:', event);
    const errorMessage = event.detail?.message || 'An unknown upload error occurred.';
    onUploadError(errorMessage);
  }, [onUploadError]);

  // Handle upload progress
  const handleUploadProgress = useCallback((event: any) => {
    const progress = event.detail?.progress || 0;
    console.log('[Mux Upload] Upload progress:', progress);
    onUploadProgress(progress);
  }, [onUploadProgress]);

  // Reset upload state
  const resetUpload = useCallback(() => {
    setUploadId(null);
    setIsProcessing(false);
  }, []);

  // Fetch upload URL when component mounts (only once)
  useEffect(() => {
    const fetchUploadUrl = async () => {
      try {
        setIsLoading(true);
        console.log('[Mux Audio Upload] Fetching upload URL...');
        const response = await fetch('/api/upload/audio-mux', { 
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload URL creation failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const url = await response.text();
        console.log('[Mux Audio Upload] Upload URL received:', url);
        setUploadUrl(url);
        
        // CRITICAL FIX: Extract uploadId IMMEDIATELY from the URL
        // This ensures we have the uploadId even if user saves content before upload completes
        const urlParts = url.split('/upload/');
        if (urlParts.length > 1) {
          const extractedUploadId = urlParts[1].split('?')[0];
          console.log('[Mux Audio Upload] Upload ID extracted early:', extractedUploadId);
          setUploadId(extractedUploadId);
          
          // Notify parent immediately so they have the uploadId before upload even starts
          if (onUploadIdReady) {
            onUploadIdReady(extractedUploadId);
          }
        }
      } catch (error) {
        console.error('[Mux Audio Upload] Failed to fetch upload URL:', error);
        onUploadError('Failed to initialize upload');
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if we don't already have a URL
    if (!uploadUrl) {
      fetchUploadUrl();
    }
  }, []); // Empty dependency array - only run once on mount

  return (
    <div className="w-full">
      <div className="space-y-4">
        {/* Loading State */}
        {isLoading && (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <div className="flex items-center justify-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">Initializing upload...</span>
            </div>
          </div>
        )}

        {/* Mux Uploader Component - Following Mux Best Practices */}
        {uploadUrl && !isLoading && (
          <MuxUploader
            ref={uploaderRef}
            endpoint={uploadUrl}
            onSuccess={handleUploadSuccess}
            onError={handleUploadError}
            onProgress={handleUploadProgress}
            onChange={(event: any) => {
              // Capture filename when file is selected/changed
              console.log('[Mux Upload] onChange event:', event);
              const file = event.detail?.file || event.target?.files?.[0] || event.detail?.files?.[0];
              if (file && file.name) {
                console.log('[Mux Upload] File selected via onChange:', file.name);
                setFilename(file.name);
                filenameRef.current = file.name; // Store in ref for immediate access
              }
            }}
            onSelect={(event: any) => {
              // Also try onSelect as fallback
              console.log('[Mux Upload] onSelect event:', event);
              const file = event.detail?.file || event.target?.files?.[0] || event.detail?.files?.[0];
              if (file && file.name) {
                console.log('[Mux Upload] File selected via onSelect:', file.name);
                setFilename(file.name);
                filenameRef.current = file.name; // Store in ref for immediate access
              }
            }}
          />
        )}
        
        {/* Processing State - Show when upload completes but audio is still processing */}
        {isProcessing && (
          <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-sm text-blue-700">Processing audio...</span>
            </div>
            <div className="text-xs text-gray-500 ml-4">
              Upload ID: {uploadId}
            </div>
            <div className="text-xs text-gray-500 ml-4">
              ⏱️ Long audio files may take up to 10 minutes
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
