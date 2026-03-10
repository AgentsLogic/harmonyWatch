import Mux from '@mux/mux-node';
import { serverConfig } from '@/lib/env';

export interface MuxUploadResult {
  success: boolean;
  uploadId?: string;
  uploadUrl?: string;
  assetId?: string;
  error?: string;
}

export interface MuxAssetDetails {
  id: string;
  status: 'preparing' | 'ready' | 'errored';
  playback_ids: any[];
  duration: number;
  created_at: string;
  aspect_ratio: string;
  max_stored_resolution: string;
}

class MuxVideoService {
  private mux: Mux | null = null;
  private tokenId: string | null = null;
  private tokenSecret: string | null = null;

  constructor() {
    // Do not initialize at construction to avoid build-time failures
  }

  private initialize() {
    if (this.mux && this.tokenId && this.tokenSecret) {
      return; // Already initialized
    }

    this.tokenId = serverConfig.MUX_TOKEN_ID || null;
    this.tokenSecret = serverConfig.MUX_TOKEN_SECRET || null;
    
    const token: string = typeof this.tokenId === 'string' ? this.tokenId : '';
    const tokenIdPreview = token.length > 0 ? `${token.slice(0, 8)}...` : 'missing';

    console.log('Mux Video initialization:', {
      hasTokenId: !!this.tokenId,
      hasTokenSecret: !!this.tokenSecret,
      tokenId: tokenIdPreview
    });
    
    if (!this.tokenId) {
      throw new Error('MUX_TOKEN_ID environment variable is not set');
    }
    
    if (!this.tokenSecret) {
      throw new Error('MUX_TOKEN_SECRET environment variable is not set');
    }
    
    try {
      this.mux = new Mux({
        tokenId: this.tokenId,
        tokenSecret: this.tokenSecret
      });
      console.log('Mux Video service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Mux service:', error);
      throw new Error(`Failed to initialize Mux service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createDirectUpload(fileName: string, fileSize: number | 'unknown'): Promise<MuxUploadResult> {
    try {
      this.initialize(); // Ensure Mux is initialized
    } catch (error) {
      console.error('Mux initialization failed:', error);
      return { success: false, error: `Mux initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }

    console.log('Creating Mux direct upload:', {
      fileName,
      fileSize: fileSize === 'unknown' ? 'unknown' : `${fileSize} bytes`,
      muxInstance: !!this.mux,
      hasVideo: !!this.mux?.video,
      hasUploads: !!this.mux?.video.uploads
    });

    if (!this.mux || !this.mux.video || !this.mux.video.uploads) {
      throw new Error('Mux Video API not available or not initialized.');
    }

    try {
      const upload = await this.mux.video.uploads.create({
        new_asset_settings: {
          playback_policy: ['public'],
          normalize_audio: true,
        },
        // In development, allow any origin to simplify port changes
        cors_origin: process.env.NODE_ENV === 'production'
          ? (serverConfig.NEXT_PUBLIC_APP_URL || 'https://harmony.watch')
          : '*',
      });

      console.log('Mux direct upload created:', {
        uploadId: upload.id,
        assetId: upload.asset_id,
        uploadUrl: upload.url
      });

      return {
        success: true,
        uploadId: upload.id,
        uploadUrl: upload.url,
        assetId: upload.asset_id,
      };
    } catch (error) {
      console.error('Mux direct upload creation error:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during upload creation'
      };
    }
  }

  async getAssetDetails(assetId: string): Promise<MuxAssetDetails | null> {
    this.initialize(); // Ensure Mux is initialized
    if (!this.mux || !this.mux.video || !this.mux.video.assets) {
      console.error('Mux Video API not available for asset retrieval.');
      return null;
    }

    try {
      const asset = await this.mux.video.assets.retrieve(assetId);
      return {
        id: asset.id,
        status: asset.status as 'preparing' | 'ready' | 'errored',
        playback_ids: asset.playback_ids || [],
        duration: asset.duration || 0,
        created_at: asset.created_at || new Date().toISOString(),
        aspect_ratio: asset.aspect_ratio || '16:9',
        max_stored_resolution: asset.max_stored_resolution || '1080p'
      };
    } catch (error) {
      console.error(`Error retrieving asset details for ${assetId}:`, error);
      return null;
    }
  }

  async getUploadDetails(uploadId: string): Promise<MuxUploadResult> {
    this.initialize(); // Ensure Mux is initialized
    if (!this.mux || !this.mux.video || !this.mux.video.uploads) {
      return { success: false, error: 'Mux Video API not available or not initialized.' };
    }

    try {
      const upload = await this.mux.video.uploads.retrieve(uploadId);
      return {
        success: true,
        uploadId: upload.id,
        assetId: upload.asset_id,
      };
    } catch (error) {
      console.error(`Error retrieving upload details for ${uploadId}:`, error);
      return { success: false, error: `Failed to retrieve upload details: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }
}

export const muxVideoService = new MuxVideoService();
