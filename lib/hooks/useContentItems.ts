"use client";

import { useState, useEffect } from 'react';
import { contentItemsService, seriesService } from '../database';
import type { SeriesUpdate } from '../database.types';
import { storageService, STORAGE_BUCKETS } from '../storage';
import { supabaseAdmin } from '../supabase';
import { compressImage, COMPRESSION_PRESETS } from '../utils/image-compression';

export interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  content_url: string | null;
  content_type: 'video' | 'audio';
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR';
  tags: string[] | null;
  duration: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  monetization: boolean;
  restrictions: string | null;
  views: number;
  comments_count: number;
  upload_date: string;
  created_at: string;
  updated_at: string;
  cloudflare_stream_id: string | null;
  stream_thumbnail_url: string | null;
  stream_playback_url: string | null;
  stream_status: 'pending' | 'processing' | 'ready' | 'failed' | null;
  stream_metadata: any | null;
  stream_analytics: any | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_upload_id: string | null;
  mux_thumbnail_url: string | null;
  original_filename: string | null;
  new_calendar_date: string | null;
  old_calendar_date: string | null;
  saints: any | null;
  is_free_episode: boolean;
  short_id: string | null;
}

export interface Series {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR';
  tags: string[] | null;
  content_type: 'video' | 'audio';
  content_ids: string[] | null;
  episodes_count: number;
  is_daily_content: boolean;
  is_premium: boolean;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentOption {
  id: string;
  title: string;
  thumbnail_url: string | null;
  type: 'content' | 'series';
  isNew?: boolean;
}

export function useContentItems() {
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [contentData, seriesData] = await Promise.all([
        contentItemsService.getAll(),
        seriesService.getAll()
      ]);
      
      setContentItems(contentData);
      setSeries(seriesData);
    } catch (err) {
      console.error('Error loading content:', err);
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Get all available content options (both content items and series)
  const getAllContentOptions = (): ContentOption[] => {
    const contentOptions: ContentOption[] = contentItems.map(item => ({
      id: item.id,
      title: item.title,
      thumbnail_url: item.thumbnail_url,
      type: 'content' as const,
      isNew: false
    }));

    const seriesOptions: ContentOption[] = series.map(seriesItem => ({
      id: seriesItem.id,
      title: seriesItem.title,
      thumbnail_url: seriesItem.thumbnail_url,
      type: 'series' as const,
      isNew: false
    }));

    return [...contentOptions, ...seriesOptions];
  };

  const getContentById = async (id: string): Promise<ContentItem | null> => {
    try {
      return await contentItemsService.getById(id);
    } catch (error) {
      console.error('Failed to fetch content item:', error);
      return null;
    }
  };

  const updateContent = async (id: string, updates: Partial<ContentItem>): Promise<boolean> => {
    try {
      await contentItemsService.update(id, updates);
      // Refresh the content items list
      await loadData();
      return true;
    } catch (error) {
      console.error('Failed to update content item:', error);
      return false;
    }
  };

  const getSeriesById = async (id: string): Promise<Series | null> => {
    try {
      return await seriesService.getById(id);
    } catch (error) {
      console.error('Failed to fetch series:', error);
      return null;
    }
  };

  const updateSeries = async (
    id: string, 
    updates: Partial<Series>,
    thumbnailFile?: File,
    logoFile?: File,
    bannerFile?: File
  ): Promise<boolean> => {
    try {
      let thumbnailUrl = updates.thumbnail_url;
      let logoUrl = updates.logo_url;
      let bannerUrl = updates.banner_url;

      // Upload thumbnail if provided
      if (thumbnailFile) {
        // Compress image before upload
        const compressedFile = await compressImage(thumbnailFile, COMPRESSION_PRESETS.thumbnail);
        const extension = storageService.getFileExtension(compressedFile.name);
        const thumbnailPath = storageService.generateFilePath('series-thumbnails', extension);
        
        const thumbnailResult = await storageService.uploadFile(
          STORAGE_BUCKETS.THUMBNAILS,
          thumbnailPath,
          compressedFile
        );
        
        if (thumbnailResult.success && thumbnailResult.url) {
          thumbnailUrl = thumbnailResult.url;
        } else {
          console.error('Failed to upload thumbnail:', thumbnailResult.error);
          // Continue with existing thumbnail
        }
      }

      // Upload logo if provided
      if (logoFile) {
        // Compress image before upload
        const compressedFile = await compressImage(logoFile, COMPRESSION_PRESETS.logo);
        const extension = storageService.getFileExtension(compressedFile.name);
        const logoPath = storageService.generateFilePath('series-logos', extension);
        
        const logoResult = await storageService.uploadFile(
          STORAGE_BUCKETS.THUMBNAILS,
          logoPath,
          compressedFile
        );
        
        if (logoResult.success && logoResult.url) {
          logoUrl = logoResult.url;
        } else {
          console.error('Failed to upload logo:', logoResult.error);
          // Continue with existing logo
        }
      }

      // Upload banner if provided
      if (bannerFile) {
        // Compress image before upload
        const compressedFile = await compressImage(bannerFile, COMPRESSION_PRESETS.banner);
        const extension = storageService.getFileExtension(compressedFile.name);
        const bannerPath = storageService.generateFilePath('series-banners', extension);
        
        const bannerResult = await storageService.uploadFile(
          STORAGE_BUCKETS.BANNERS,
          bannerPath,
          compressedFile
        );
        
        if (bannerResult.success && bannerResult.url) {
          bannerUrl = bannerResult.url;
        } else {
          console.error('Failed to upload banner:', bannerResult.error);
          // Continue with existing banner
        }
      }

      // Include is_daily_content in the update if provided
      const cleanUpdates: SeriesUpdate = {
        ...updates,
        thumbnail_url: thumbnailUrl,
        logo_url: logoUrl,
        banner_url: bannerUrl
      };

      // Update series with all fields including is_daily_content
      await seriesService.update(id, cleanUpdates);
      
      // Refresh the data
      await loadData();
      return true;
    } catch (error: any) {
      console.error('Failed to update series:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      });
      return false;
    }
  };

  const addSeries = async (
    series: Omit<Series, 'id' | 'created_at' | 'updated_at'>,
    thumbnailFile?: File,
    bannerFile?: File
  ): Promise<boolean> => {
    try {
      let thumbnailUrl = series.thumbnail_url;
      let bannerUrl = series.banner_url;

      // Upload thumbnail if provided
      if (thumbnailFile) {
        // Compress image before upload
        const compressedFile = await compressImage(thumbnailFile, COMPRESSION_PRESETS.thumbnail);
        const extension = storageService.getFileExtension(compressedFile.name);
        const thumbnailPath = storageService.generateFilePath('series-thumbnails', extension);
        
        const thumbnailResult = await storageService.uploadFile(
          STORAGE_BUCKETS.THUMBNAILS,
          thumbnailPath,
          compressedFile
        );
        
        if (thumbnailResult.success && thumbnailResult.url) {
          thumbnailUrl = thumbnailResult.url;
        } else {
          console.error('Failed to upload thumbnail:', thumbnailResult.error);
          // Continue with fallback thumbnail
        }
      }

      // Upload banner if provided
      if (bannerFile) {
        // Compress image before upload
        const compressedFile = await compressImage(bannerFile, COMPRESSION_PRESETS.banner);
        const extension = storageService.getFileExtension(compressedFile.name);
        const bannerPath = storageService.generateFilePath('series-banners', extension);
        
        const bannerResult = await storageService.uploadFile(
          STORAGE_BUCKETS.BANNERS,
          bannerPath,
          compressedFile
        );
        
        if (bannerResult.success && bannerResult.url) {
          bannerUrl = bannerResult.url;
        } else {
          console.error('Failed to upload banner:', bannerResult.error);
          // Continue with fallback banner
        }
      }

      // Create series with uploaded URLs
      await seriesService.create({
        ...series,
        thumbnail_url: thumbnailUrl,
        banner_url: bannerUrl
      });
      
      await loadData(); // Refresh the data
      return true;
    } catch (error) {
      console.error('Failed to add series:', error);
      return false;
    }
  };

  const deleteContent = async (id: string): Promise<boolean> => {
    try {
      // First, get the content item to check if it has an audio file to delete
      const contentItem = await contentItemsService.getById(id);
      
      if (contentItem && contentItem.content_type === 'audio' && contentItem.content_url) {
        // Extract the file path from the content_url
        // URL format: https://qwcunnnhwbewjhqoddec.supabase.co/storage/v1/object/public/audio-files/audio/filename.mp3
        const url = new URL(contentItem.content_url);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.findIndex(part => part === 'audio-files');
        
        if (bucketIndex !== -1 && bucketIndex + 1 < pathParts.length) {
          // Reconstruct the file path: audio/filename.mp3
          const filePath = pathParts.slice(bucketIndex + 1).join('/');
          
          console.log('🗑️ Deleting audio file from storage:', filePath);
          
          // Delete the audio file from Supabase Storage
          const deleteSuccess = await storageService.deleteFile(STORAGE_BUCKETS.AUDIO_FILES, filePath);
          
          if (deleteSuccess) {
            console.log('✅ Audio file deleted successfully from storage');
          } else {
            console.warn('⚠️ Failed to delete audio file from storage, but continuing with content deletion');
          }
        }
      }
      
      // Delete the content item from the database
      await contentItemsService.delete(id);
      await loadData(); // Refresh the data
      return true;
    } catch (error) {
      console.error('Failed to delete content:', error);
      return false;
    }
  };

  const deleteSeries = async (id: string): Promise<boolean> => {
    try {
      await seriesService.delete(id);
      await loadData(); // Refresh the data
      return true;
    } catch (error) {
      console.error('Failed to delete series:', error);
      return false;
    }
  };

  const addContent = async (
    content: Omit<ContentItem, 'id' | 'created_at' | 'updated_at'>,
    thumbnailFile?: File
  ): Promise<ContentItem | null> => {
    try {
      // Start with the thumbnail_url from content if already set, otherwise use default
      let thumbnailUrl = content.thumbnail_url || '/images/content-1.png';

      // Upload thumbnail if a file is provided (this will override the URL)
      if (thumbnailFile) {
        const extension = storageService.getFileExtension(thumbnailFile.name);
        const filePath = storageService.generateFilePath('content', extension);
        const uploadResult = await storageService.uploadFile(STORAGE_BUCKETS.THUMBNAILS, filePath, thumbnailFile);
        
        if (uploadResult.success && uploadResult.url) {
          thumbnailUrl = uploadResult.url;
        }
      }

      // Create content item - only override thumbnail_url if we need to change it
      const newContent = await contentItemsService.create({
        ...content,
        // Only set thumbnail_url if thumbnailFile was provided (uploaded here) 
        // OR if content.thumbnail_url was not already set
        thumbnail_url: thumbnailFile ? thumbnailUrl : (content.thumbnail_url || thumbnailUrl)
      });

      // Refresh the content list
      await loadData();
      
      return newContent;
    } catch (error) {
      console.error('Failed to add content:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      // Log the content that was being created for debugging
      console.error('Content being created:', JSON.stringify(content, null, 2));
      return null;
    }
  };

  // Legacy function - no longer used since we migrated to Mux
  // const addContentWithStream = async (...) => { ... }

  // Get content IDs for a series (now just returns the array directly)
  const getSeriesContentIds = async (seriesId: string): Promise<string[]> => {
    try {
      const seriesItem = await getSeriesById(seriesId);
      return seriesItem?.content_ids || [];
    } catch (error) {
      console.error('Failed to get series content IDs:', error);
      return [];
    }
  };

  // Get full content items for a series
  const getSeriesContent = async (seriesId: string): Promise<ContentItem[]> => {
    try {
      const data = await seriesService.getSeriesWithContent(seriesId);
      
      if (!data?.content_items || data.content_items.length === 0) {
        return [];
      }
      
      // content_items are already fetched in one query
      return data.content_items.filter((item: ContentItem) => item !== null);
    } catch (error) {
      console.error('Failed to get series content:', error);
      return [];
    }
  };

  return {
    contentItems,
    series,
    loading,
    error,
    refresh: loadData,
    getAllContentOptions,
    getContentById,
    updateContent,
    deleteContent,
    getSeriesById,
    updateSeries,
    addSeries,
    deleteSeries,
    addContent,
    getSeriesContentIds,
    getSeriesContent
  };
}

