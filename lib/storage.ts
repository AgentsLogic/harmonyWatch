/**
 * Supabase Storage Service
 * Handles file uploads to Supabase Storage
 */

import { supabaseAdmin } from './supabase';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const storageService = {
  /**
   * Upload a file to Supabase Storage
   * @param bucket - The storage bucket name
   * @param filePath - The path where the file should be stored
   * @param file - The file to upload
   * @returns Promise<UploadResult>
   */
  async uploadFile(
    bucket: string,
    filePath: string,
    file: File
  ): Promise<UploadResult> {
    try {
      console.log(`📤 Uploading file to ${bucket}/${filePath}`);
      
      // Upload the file
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Overwrite if file exists
        });

      if (error) {
        console.error('❌ Upload error:', error);
        return {
          success: false,
          error: error.message
        };
      }

      // Get the public URL
      const { data: urlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(filePath);

      console.log('✅ Upload successful:', urlData.publicUrl);
      
      return {
        success: true,
        url: urlData.publicUrl
      };
    } catch (error) {
      console.error('❌ Upload exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  /**
   * Delete a file from Supabase Storage
   * @param bucket - The storage bucket name
   * @param filePath - The path of the file to delete
   * @returns Promise<boolean>
   */
  async deleteFile(bucket: string, filePath: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .remove([filePath]);

      if (error) {
        console.error('❌ Delete error:', error);
        return false;
      }

      console.log('✅ File deleted successfully');
      return true;
    } catch (error) {
      console.error('❌ Delete exception:', error);
      return false;
    }
  },

  /**
   * Generate a unique file path for uploads
   * @param prefix - Optional prefix for the file path
   * @param extension - File extension
   * @returns string - Unique file path
   */
  generateFilePath(prefix: string = '', extension: string = ''): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    
    if (prefix && extension) {
      return `${prefix}/${timestamp}_${randomId}.${extension}`;
    } else if (prefix) {
      return `${prefix}/${timestamp}_${randomId}`;
    } else {
      return `${timestamp}_${randomId}${extension}`;
    }
  },

  /**
   * Get file extension from file name
   * @param fileName - The file name
   * @returns string - File extension without dot
   */
  getFileExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() || '';
  }
};

// Storage bucket names
export const STORAGE_BUCKETS = {
  THUMBNAILS: 'thumbnails',
  BANNERS: 'banners',
  CONTENT: 'content',
  AUDIO_FILES: 'audio-files'
} as const;
