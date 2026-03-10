"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useContentItems, type ContentItem } from "../../../lib/hooks/useContentItems";
import type { Series } from "../../../lib/database.types";
import { VideoUploadDropzone } from "./video-upload-dropzone";
import { AudioUploadDropzone } from "./audio-upload-dropzone";
import { EditContentModal } from "./edit-content-modal";
import { cropThumbnailForContent } from "@/lib/utils/image-crop";
import { compressImage, COMPRESSION_PRESETS } from "@/lib/utils/image-compression";
import { slugify } from "@/lib/utils/slug";

interface LocalContentItem {
  id: string;
  title: string;
  thumbnail: string;
  isNew?: boolean;
  type?: string;
  badge?: string;
  sort_order: number;
  itemType?: 'content' | 'series'; // Distinguish between content items and series
}

interface Category {
  id: string;
  title: string;
  sort_order: number;
  items: LocalContentItem[];
}

interface ContentListProps {
  categories: Category[];
  onDeleteContent: (categoryId: string, itemId: string) => void;
  onContentUpdate?: () => void;
  contentToEdit?: string | null;
  onContentEditComplete?: () => void;
}

export default function ContentList({ categories, onDeleteContent, onContentUpdate, contentToEdit, onContentEditComplete }: ContentListProps) {
  const [activeTab, setActiveTab] = useState("content");
  const [contentTypeFilter, setContentTypeFilter] = useState<'video' | 'audio'>('video');
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set());
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<Set<string>>(new Set());
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isDeleteSeriesConfirmModalOpen, setIsDeleteSeriesConfirmModalOpen] = useState(false);
  const [isAddContentModalOpen, setIsAddContentModalOpen] = useState(false);
  const [isAddSeriesModalOpen, setIsAddSeriesModalOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<any>(null);
  const [editingContent, setEditingContent] = useState<any>(null);
  
  // Hook for content management
  const { contentItems, series, getContentById, updateContent, deleteContent, getSeriesById, updateSeries, addSeries, deleteSeries, addContent, refresh: refreshContent } = useContentItems();
  
  // Periodically refresh content list to check for processing status updates
  useEffect(() => {
    // Check if there are any processing or pending items
    const hasProcessingItems = contentItems.some(item => 
      item.stream_status === 'processing' || 
      item.stream_status === 'pending' ||
      (item.mux_upload_id && !item.mux_playback_id)
    );
    
    if (hasProcessingItems) {
      // Refresh every 30 seconds if there are processing items
      const interval = setInterval(() => {
        refreshContent();
      }, 30000); // 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [contentItems, refreshContent]);

  // Manual check for processing videos
  const [isCheckingProcessing, setIsCheckingProcessing] = useState(false);
  const handleCheckProcessingVideos = async () => {
    setIsCheckingProcessing(true);
    try {
      const response = await fetch('/api/admin/check-processing-videos', {
        method: 'POST',
      });
      const result = await response.json();
      
      if (response.ok) {
        console.log('[Admin] Check processing videos result:', result);
        // Refresh the content list to show updated statuses
        refreshContent();
        // Silently update - no popup needed
      } else {
        console.error('[Admin] Error checking processing videos:', result);
      }
    } catch (error) {
      console.error('[Admin] Error checking processing videos:', error);
    } finally {
      setIsCheckingProcessing(false);
    }
  };
  
  // Form state for editing content
  const [editFormData, setEditFormData] = useState<{
    title: string;
    description: string;
    contentType: 'video' | 'audio';
    rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR';
    tags: string;
    seriesId: string;
    dailyEpisodeDate: string | null;
    isFreeEpisode: boolean;
    saints: Array<{
      id: string;
      name: string;
      pictureFile: File | null;
      picturePreview: string | null;
      pictureUrl: string | null;
      biography: string;
    }>;
    thumbnailFile?: File;
    thumbnailPreview?: string;
  }>({
    title: '',
    description: '',
    contentType: 'video',
    rating: 'G',
    tags: '',
    seriesId: '',
    dailyEpisodeDate: null,
    isFreeEpisode: false,
    saints: []
  });

  // Form state for editing series
  const [editSeriesFormData, setEditSeriesFormData] = useState<{
    title: string;
    description: string;
    rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR';
    tags: string;
    contentType: 'video' | 'audio';
    isDailyContent: boolean;
    isOneOff: boolean;
    isPremium: boolean;
    slug: string;
    thumbnailFile: File | null;
    logoFile: File | null;
    bannerFile: File | null;
    thumbnailPreview: string | null;
    logoPreview: string | null;
    bannerPreview: string | null;
    selectedContent: string[]; // Track selected content IDs
  }>({
    title: '',
    description: '',
    rating: 'G',
    tags: '',
    contentType: 'video',
    isDailyContent: false,
    isOneOff: false,
    isPremium: true, // Default to premium
    slug: '',
    thumbnailFile: null,
    logoFile: null,
    bannerFile: null,
    thumbnailPreview: null,
    logoPreview: null,
    bannerPreview: null,
    selectedContent: []
  });

  // Form state for adding series
  const [addSeriesFormData, setAddSeriesFormData] = useState<{
    title: string;
    description: string;
    rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR';
    tags: string;
    contentType: 'video' | 'audio';
    isDailyContent: boolean;
    isOneOff: boolean;
    isPremium: boolean;
    slug: string;
    thumbnailFile: File | null;
    bannerFile: File | null;
    thumbnailPreview: string | null;
    bannerPreview: string | null;
    selectedContent: string[];
  }>({
    title: '',
    description: '',
    rating: 'G',
    tags: '',
    contentType: 'video',
    isDailyContent: false,
    isOneOff: false,
    isPremium: true,
    slug: '',
    thumbnailFile: null,
    bannerFile: null,
    thumbnailPreview: null,
    bannerPreview: null,
    selectedContent: []
  });

  // Form state for adding content
  const [addContentFormData, setAddContentFormData] = useState<{
    title: string;
    description: string;
    contentType: 'video' | 'audio';
    rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR';
    tags: string;
    seriesId: string;
    dailyEpisodeDate: string | null;
    isOneOff: boolean;
    saints: Array<{
      id: string;
      name: string;
      pictureFile: File | null;
      picturePreview: string | null;
      pictureUrl: string | null;
      biography: string;
    }>;
    thumbnailFile: File | null;
    thumbnailPreview: string | null;
    // Legacy Cloudflare fields (removed from UI but kept in types for backward compatibility)
    cloudflareStreamId: string | null;
    streamThumbnailUrl: string | null;
    streamPlaybackUrl: string | null;
    muxAssetId: string | null;
    muxUploadId: string | null;
    muxPlaybackId: string | null;
    muxThumbnailUrl: string | null;
    contentUrl: string | null;
    audioFileName: string | null;
    originalFilename: string | null;
    duration: string | null;
  }>({
    title: '',
    description: '',
    contentType: 'video',
    rating: 'G',
    tags: '',
    seriesId: '',
    dailyEpisodeDate: null,
    isOneOff: false,
    saints: [],
    thumbnailFile: null,
    thumbnailPreview: null,
    cloudflareStreamId: null,
    streamThumbnailUrl: null,
    streamPlaybackUrl: null,
    muxAssetId: null,
    muxUploadId: null,
    muxPlaybackId: null,
    muxThumbnailUrl: null,
            contentUrl: null,
            audioFileName: null,
            originalFilename: null,
            duration: null
          });

  // Unfiltered content for modals (shows all content regardless of type)
  const allContentUnfiltered = useMemo(() => {
    const mapped = contentItems.map(item => ({
      id: item.id,
      title: item.title,
      thumbnail: item.thumbnail_url || '/images/content-1.png',
      duration: item.duration || "14:59",
      visibility: item.visibility === 'public' ? 'Public' : item.visibility === 'unlisted' ? 'Unlisted' : 'Private',
      monetization: item.monetization ? 'On' : 'Off',
      restrictions: item.restrictions || 'None',
      uploadDate: new Date(item.upload_date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }),
      views: item.views,
      comments: item.comments_count,
      rating: item.rating,
      tags: item.tags,
      contentType: item.content_type,
      description: item.description,
      streamStatus: item.stream_status || 'pending' // Include stream_status for processing indicator
    }));
    return mapped;
  }, [contentItems]);

  // Filtered content for display (filtered by content type)
  const allContent = useMemo(() => {
    return allContentUnfiltered.filter(item => item.contentType === contentTypeFilter);
  }, [allContentUnfiltered, contentTypeFilter]);

  // Clear selections when content type filter changes
  useEffect(() => {
    setSelectedContentIds(new Set());
  }, [contentTypeFilter]);

  // Use real series data from the database
  const seriesData = series.map(s => ({
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail_url && s.thumbnail_url !== '/images/series-thumbnail.png' ? s.thumbnail_url : '/images/content-1.png',
    episodes: s.episodes_count || 0,
    visibility: "Members", // Default values for display
    monetization: "On",
    restrictions: "None",
    uploadDate: new Date(s.created_at).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }),
    views: Math.floor(Math.random() * 10000), // Random for now
    comments: Math.floor(Math.random() * 100), // Random for now
    content_type: s.content_type // Include content type for conditional styling
  }));

  const handleDeleteContent = (categoryId: string, itemId: string) => {
    onDeleteContent(categoryId, itemId);
  };

  // Handle checkbox toggle for content selection
  const handleContentSelect = (contentId: string) => {
    setSelectedContentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contentId)) {
        newSet.delete(contentId);
      } else {
        newSet.add(contentId);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedContentIds.size === allContent.length) {
      setSelectedContentIds(new Set());
    } else {
      setSelectedContentIds(new Set(allContent.map(item => item.id)));
    }
  };

  // Handle checkbox toggle for series selection
  const handleSeriesSelect = (seriesId: string) => {
    setSelectedSeriesIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(seriesId)) {
        newSet.delete(seriesId);
      } else {
        newSet.add(seriesId);
      }
      return newSet;
    });
  };

  // Handle select all series
  const handleSelectAllSeries = () => {
    if (selectedSeriesIds.size === seriesData.length) {
      setSelectedSeriesIds(new Set());
    } else {
      setSelectedSeriesIds(new Set(seriesData.map(item => item.id)));
    }
  };

  // Handle bulk delete for series
  const handleDeleteSelectedSeries = async () => {
    if (selectedSeriesIds.size === 0) return;
    
    try {
      const deletePromises = Array.from(selectedSeriesIds).map(id => deleteSeries(id));
      await Promise.all(deletePromises);
      
      setSelectedSeriesIds(new Set());
      setIsDeleteSeriesConfirmModalOpen(false);
      
      // Refresh the parent component's data
      onContentUpdate?.();
    } catch (error) {
      console.error('Failed to delete series:', error);
      alert('Failed to delete some series. Please check the console for details.');
    }
  };

  // Handle delete selected content
  const handleDeleteSelected = async () => {
    if (selectedContentIds.size === 0) return;
    
    try {
      const deletePromises = Array.from(selectedContentIds).map(id => deleteContent(id));
      await Promise.all(deletePromises);
      
      setSelectedContentIds(new Set());
      setIsDeleteConfirmModalOpen(false);
      
      if (onContentUpdate) {
        onContentUpdate();
      }
    } catch (error) {
      console.error('Error deleting content:', error);
    }
  };

  // Handle opening edit modal with real data
  const handleEditContent = async (contentId: string) => {
    try {
      const contentData = await getContentById(contentId);
      if (contentData) {
        // Debug: Log to check if original_filename and tags are present
        console.log('Edit Content - Loaded content data:', {
          id: contentData.id,
          title: contentData.title,
          original_filename: contentData.original_filename,
          mux_playback_id: contentData.mux_playback_id,
          mux_asset_id: contentData.mux_asset_id,
          tags: contentData.tags,
          tags_type: typeof contentData.tags,
          tags_is_array: Array.isArray(contentData.tags),
          tags_length: Array.isArray(contentData.tags) ? contentData.tags.length : 'N/A'
        });
        setEditingContent(contentData);
        
        // Load existing saints data
        const existingSaints = contentData.saints && Array.isArray(contentData.saints) 
          ? contentData.saints.map((saint: any, index: number) => ({
              id: `existing-${index}-${Date.now()}`,
              name: saint.name || '',
              pictureFile: null,
              picturePreview: saint.picture_url || null,
              pictureUrl: saint.picture_url || null,
              biography: saint.biography || ''
            }))
          : [];
        
        // Load existing calendar date if available
        const existingCalendarDate = contentData.new_calendar_date || null;
        
        // Find which series contains this content
        let currentSeriesId = '';
        for (const s of series) {
          if (s.content_ids && s.content_ids.includes(contentData.id)) {
            currentSeriesId = s.id;
            break;
          }
        }
        
        // Handle tags - ensure it's an array and has items before joining
        const tagsString = contentData.tags && Array.isArray(contentData.tags) && contentData.tags.length > 0
          ? contentData.tags.join(', ')
          : '';
        
        console.log('Setting editFormData tags:', {
          tagsRaw: contentData.tags,
          tagsString: tagsString
        });
        
        // Check if parent series is premium
        const parentSeries = currentSeriesId ? series.find(s => s.id === currentSeriesId) : null;
        const isParentSeriesPremium = parentSeries ? (parentSeries as any).is_premium !== undefined ? (parentSeries as any).is_premium : true : false;
        
        setEditFormData({
          title: contentData.title || '',
          description: contentData.description || '',
          contentType: contentData.content_type || 'video',
          rating: contentData.rating || 'G',
          tags: tagsString,
          seriesId: currentSeriesId,
          dailyEpisodeDate: existingCalendarDate,
          isFreeEpisode: (contentData as any).is_free_episode || false,
          saints: existingSaints
        });
      }
    } catch (error) {
      console.error('Failed to load content for editing:', error);
    }
  };

  // Handle saving edited content
  const handleSaveContent = async () => {
    if (!editingContent) return;

    try {
      const tagsArray = editFormData.tags ? editFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
      
      console.log('Saving tags:', {
        tagsString: editFormData.tags,
        tagsArray: tagsArray,
        tagsArrayLength: tagsArray.length,
        tagsArrayType: Array.isArray(tagsArray)
      });
      
      let thumbnailUrl = editingContent.thumbnail_url; // Keep existing thumbnail by default
      
      // Upload new thumbnail if one was selected
      if (editFormData.thumbnailFile) {
        // Compress image before upload
        const compressedFile = await compressImage(editFormData.thumbnailFile, COMPRESSION_PRESETS.thumbnail);
        
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('bucket', 'thumbnails');
        formData.append('path', `content-${editingContent.id}-${Date.now()}.${compressedFile.name.split('.').pop()}`);
        
        const uploadResponse = await fetch('/api/upload/thumbnail', {
          method: 'POST',
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const { url } = await uploadResponse.json();
          thumbnailUrl = url;
        } else {
          console.error('Failed to upload thumbnail');
        }
      }
      
      // Calculate old calendar date (13 days behind new calendar date) if date is selected
      let newCalendarDate: string | null = null;
      let oldCalendarDate: string | null = null;
      
      if (editFormData.dailyEpisodeDate) {
        newCalendarDate = editFormData.dailyEpisodeDate;
        
        // Parse date string directly to avoid timezone issues
        const [year, month, day] = editFormData.dailyEpisodeDate.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        
        // Calculate old calendar date (13 days behind)
        const oldDate = new Date(year, month - 1, day - 13);
        
        // Format as YYYY-MM-DD without timezone conversion
        const formatDate = (date: Date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };
        
        oldCalendarDate = formatDate(oldDate);
      }

      // Upload saint pictures and prepare saints data
      const saintsData = await Promise.all(
        editFormData.saints.map(async (saint) => {
          let pictureUrl = saint.pictureUrl || null;
          
          // Upload picture if a new file was selected
          if (saint.pictureFile) {
            try {
              // Compress image before upload
              const compressedFile = await compressImage(saint.pictureFile, COMPRESSION_PRESETS.profile);
              
              const formData = new FormData();
              formData.append('file', compressedFile);
              formData.append('bucket', 'thumbnails');
              formData.append('path', `saints/${editingContent.id}-${Date.now()}-${compressedFile.name}`);
              
              const uploadResponse = await fetch('/api/upload/thumbnail', {
                method: 'POST',
                body: formData
              });
              
              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json();
                pictureUrl = uploadData.url;
              }
            } catch (error) {
              console.error('Failed to upload saint picture:', error);
            }
          }
          
          return {
            name: saint.name,
            picture_url: pictureUrl,
            biography: saint.biography
          };
        })
      );
      
      // Ensure tags is always an array (Supabase TEXT[] expects array, not null)
      const tagsForUpdate = Array.isArray(tagsArray) && tagsArray.length > 0 ? tagsArray : [];
      
      const updates: any = {
        title: editFormData.title,
        description: editFormData.description,
        content_type: editFormData.contentType,
        rating: editFormData.rating,
        tags: tagsForUpdate, // Always an array
        thumbnail_url: thumbnailUrl,
        updated_at: new Date().toISOString(),
        // Add calendar dates if provided
        ...(newCalendarDate && { new_calendar_date: newCalendarDate }),
        ...(oldCalendarDate && { old_calendar_date: oldCalendarDate }),
        // Add saints data
        saints: saintsData.length > 0 ? saintsData : null,
        // Add is_free_episode
        is_free_episode: editFormData.isFreeEpisode || false
      };
      
      console.log('Content update payload:', {
        ...updates,
        tags: updates.tags,
        tagsType: typeof updates.tags,
        tagsIsArray: Array.isArray(updates.tags),
        tagsLength: Array.isArray(updates.tags) ? updates.tags.length : 'N/A'
      });

      const success = await updateContent(editingContent.id, updates);
      
      // Handle series relationship update
      if (success && editFormData.seriesId) {
        try {
          // Get the new series
          const newSeries = await getSeriesById(editFormData.seriesId);
          if (newSeries) {
            // Get current content_ids array
            const currentContentIds = newSeries.content_ids || [];
            
            // Add this content ID if it's not already in the array
            if (!currentContentIds.includes(editingContent.id)) {
              const updatedContentIds = [...currentContentIds, editingContent.id];
              await updateSeries(editFormData.seriesId, {
                content_ids: updatedContentIds
              });
            }
          }
        } catch (error) {
          console.error('Failed to update series relationship:', error);
          // Don't fail the whole save if series update fails
        }
      }
      
      // Also remove from old series if it was in one
      // We need to check all series to find which one contains this content
      if (success) {
        try {
          // Find all series that contain this content
          for (const s of series) {
            if (s.content_ids && s.content_ids.includes(editingContent.id)) {
              // If this series is not the newly selected one, remove the content
              if (s.id !== editFormData.seriesId) {
                const updatedContentIds = s.content_ids.filter(id => id !== editingContent.id);
                await updateSeries(s.id, {
                  content_ids: updatedContentIds
                });
              }
            }
          }
        } catch (error) {
          console.error('Failed to remove from old series:', error);
          // Don't fail the whole save if series update fails
        }
      }
      
      if (success) {
        setEditingContent(null);
        setEditFormData({
          title: '',
          description: '',
          contentType: 'video',
          rating: 'G',
          tags: '',
          seriesId: '',
          dailyEpisodeDate: null,
          isFreeEpisode: false,
          saints: []
        });
        // Refresh the parent component's data
        onContentUpdate?.();
      }
    } catch (error) {
      console.error('Failed to save content:', error);
    }
  };

  // Auto-open edit modal if contentToEdit is provided
  useEffect(() => {
    if (contentToEdit) {
      handleEditContent(contentToEdit);
      // Notify parent that we've opened the edit modal
      if (onContentEditComplete) {
        // Use setTimeout to ensure the modal is opened before clearing
        setTimeout(() => {
          onContentEditComplete();
        }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentToEdit]);

  // Handle deleting content from edit modal
  const handleDeleteContentFromEdit = async () => {
    if (!editingContent) return;

    if (confirm(`Are you sure you want to delete "${editingContent.title}"? This action cannot be undone.`)) {
      try {
        const success = await deleteContent(editingContent.id);
        if (success) {
          setEditingContent(null);
          setEditFormData({
            title: '',
            description: '',
            contentType: 'video',
            rating: 'G',
            tags: '',
            seriesId: '',
            dailyEpisodeDate: null,
            isFreeEpisode: false,
            saints: []
          });
          // Refresh the parent component's data
          onContentUpdate?.();
        }
      } catch (error) {
        console.error('Failed to delete content:', error);
      }
    }
  };

  // Handle opening edit series modal with real data
  const handleEditSeries = async (seriesId: string) => {
    try {
      const seriesData = await getSeriesById(seriesId);
      if (seriesData) {
        setEditingSeries(seriesData);
        
        // Get the content IDs directly from the series (now stored in content_ids array)
        const selectedContentIds = seriesData.content_ids || [];
        
        setEditSeriesFormData({
          title: seriesData.title || '',
          description: seriesData.description || '',
          rating: seriesData.rating || 'G',
          tags: seriesData.tags ? seriesData.tags.join(', ') : '',
          contentType: seriesData.content_type || 'video',
          isDailyContent: (seriesData as any).is_daily_content || false,
          isOneOff: (seriesData as any).is_one_off || false,
          isPremium: (seriesData as any).is_premium !== undefined ? (seriesData as any).is_premium : true,
          slug: seriesData.slug || '',
          thumbnailFile: null,
          logoFile: null,
          bannerFile: null,
          thumbnailPreview: null,
          logoPreview: null,
          bannerPreview: null,
          selectedContent: selectedContentIds
        });
      }
    } catch (error) {
      console.error('Failed to load series for editing:', error);
    }
  };

  // Handle saving edited series
  const handleSaveSeries = async () => {
    if (!editingSeries) return;

    try {
      const tagsArray = editSeriesFormData.tags ? editSeriesFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
      
      const updates: any = {
        title: editSeriesFormData.title,
        description: editSeriesFormData.description,
        rating: editSeriesFormData.rating,
        tags: tagsArray,
        content_type: editSeriesFormData.contentType,
        content_ids: editSeriesFormData.selectedContent, // Store content IDs directly in series
        episodes_count: editSeriesFormData.selectedContent.length, // Update episode count
        thumbnail_url: editingSeries.thumbnail_url, // Keep existing URL as fallback
        logo_url: editingSeries.logo_url, // Keep existing logo URL
        banner_url: editingSeries.banner_url, // Keep existing banner URL
        slug: editSeriesFormData.slug || null // Include slug for URL routing
        // Don't set updated_at manually - let the database trigger handle it
      };

      // Add is_daily_content if the column exists in the database
      if (editSeriesFormData.isDailyContent !== undefined) {
        updates.is_daily_content = editSeriesFormData.isDailyContent;
      }

      // Add is_one_off if the column exists in the database
      if (editSeriesFormData.isOneOff !== undefined) {
        updates.is_one_off = editSeriesFormData.isOneOff;
      }

      // Add is_premium
      if (editSeriesFormData.isPremium !== undefined) {
        updates.is_premium = editSeriesFormData.isPremium;
      }

      // Pass the thumbnail, logo, and banner files if new ones were uploaded
      const success = await updateSeries(
        editingSeries.id, 
        updates,
        editSeriesFormData.thumbnailFile || undefined,
        editSeriesFormData.logoFile || undefined,
        editSeriesFormData.bannerFile || undefined
      );
      
      if (success) {
        
        setEditingSeries(null);
        setEditSeriesFormData({
          title: '',
          description: '',
          rating: 'G',
          tags: '',
          contentType: 'video',
          isDailyContent: false,
          isOneOff: false,
          isPremium: true,
          slug: '',
          thumbnailFile: null,
          logoFile: null,
          bannerFile: null,
          thumbnailPreview: null,
          logoPreview: null,
          bannerPreview: null,
          selectedContent: []
        });
        // Refresh the parent component's data
        onContentUpdate?.();
      }
    } catch (error) {
      console.error('Failed to save series:', error);
    }
  };

  // Handle deleting series from edit modal
  const handleDeleteSeriesFromEdit = async () => {
    if (!editingSeries) return;

    if (confirm(`Are you sure you want to delete "${editingSeries.title}"? This action cannot be undone.`)) {
      try {
        const success = await deleteSeries(editingSeries.id);
        if (success) {
          setEditingSeries(null);
        setEditSeriesFormData({
          title: '',
          description: '',
          rating: 'G',
          tags: '',
          contentType: 'video',
          isDailyContent: false,
          isOneOff: false,
          isPremium: true,
          slug: '',
          thumbnailFile: null,
          logoFile: null,
          bannerFile: null,
          thumbnailPreview: null,
          logoPreview: null,
          bannerPreview: null,
          selectedContent: []
        });
          // Refresh the parent component's data
          onContentUpdate?.();
        }
      } catch (error) {
        console.error('Failed to delete series:', error);
      }
    }
  };

  // Handle file upload for series thumbnail
  const handleThumbnailUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAddSeriesFormData(prev => ({
        ...prev,
        thumbnailFile: file,
        thumbnailPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle file upload for series banner
  const handleBannerUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAddSeriesFormData(prev => ({
        ...prev,
        bannerFile: file,
        bannerPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle file upload for content thumbnail
  const handleContentThumbnailUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Crop image based on content type
        const contentType = addContentFormData.contentType || 'video';
        const croppedFile = await cropThumbnailForContent(file, contentType);
        
        setAddContentFormData(prev => ({
          ...prev,
          thumbnailFile: croppedFile,
          thumbnailPreview: URL.createObjectURL(croppedFile)
        }));
      } catch (error) {
        console.error('Failed to crop thumbnail:', error);
        // Fallback to original file if cropping fails
        setAddContentFormData(prev => ({
          ...prev,
          thumbnailFile: file,
          thumbnailPreview: URL.createObjectURL(file)
        }));
      }
    }
  };

  // Handle file upload for edit content thumbnail
  const handleEditContentThumbnailUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Crop image based on content type
        const contentType = editFormData.contentType || editingContent?.content_type || 'video';
        const croppedFile = await cropThumbnailForContent(file, contentType);
        
        setEditFormData(prev => ({
          ...prev,
          thumbnailFile: croppedFile,
          thumbnailPreview: URL.createObjectURL(croppedFile)
        }));
      } catch (error) {
        console.error('Failed to crop thumbnail:', error);
        // Fallback to original file if cropping fails
        setEditFormData(prev => ({
          ...prev,
          thumbnailFile: file,
          thumbnailPreview: URL.createObjectURL(file)
        }));
      }
    }
  };

  // Handle drag and drop for series thumbnail
  const handleThumbnailDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setAddSeriesFormData(prev => ({
        ...prev,
        thumbnailFile: file,
        thumbnailPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle drag and drop for content thumbnail
  const handleContentThumbnailDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    console.log('[Content Thumbnail] Drop event triggered');
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer.files;
    console.log('[Content Thumbnail] Files dropped:', files.length);
    
    if (files.length > 0) {
      const file = files[0];
      console.log('[Content Thumbnail] File type:', file.type);
      
      if (file && file.type.startsWith('image/')) {
        console.log('[Content Thumbnail] Valid image file, cropping and setting preview');
        try {
          // Crop image based on content type
          const contentType = addContentFormData.contentType || 'video';
          const croppedFile = await cropThumbnailForContent(file, contentType);
          
          setAddContentFormData(prev => ({
            ...prev,
            thumbnailFile: croppedFile,
            thumbnailPreview: URL.createObjectURL(croppedFile)
          }));
        } catch (error) {
          console.error('Failed to crop thumbnail:', error);
          // Fallback to original file if cropping fails
          setAddContentFormData(prev => ({
            ...prev,
            thumbnailFile: file,
            thumbnailPreview: URL.createObjectURL(file)
          }));
        }
      } else {
        console.log('[Content Thumbnail] Invalid file type:', file.type);
      }
    }
  };

  // Handle drag and drop for edit content thumbnail
  const handleEditContentThumbnailDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      try {
        // Crop image based on content type
        const contentType = editFormData.contentType || editingContent?.content_type || 'video';
        const croppedFile = await cropThumbnailForContent(file, contentType);
        
        setEditFormData(prev => ({
          ...prev,
          thumbnailFile: croppedFile,
          thumbnailPreview: URL.createObjectURL(croppedFile)
        }));
      } catch (error) {
        console.error('Failed to crop thumbnail:', error);
        // Fallback to original file if cropping fails
        setEditFormData(prev => ({
          ...prev,
          thumbnailFile: file,
          thumbnailPreview: URL.createObjectURL(file)
        }));
      }
    }
  };

  // Handle drag and drop for banner
  const handleBannerDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setAddSeriesFormData(prev => ({
        ...prev,
        bannerFile: file,
        bannerPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle drag over
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Don't log here to reduce console spam
  };

  // Handle file upload for editing series thumbnail
  const handleEditThumbnailUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditSeriesFormData(prev => ({
        ...prev,
        thumbnailFile: file,
        thumbnailPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle file upload for editing series banner
  const handleEditBannerUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditSeriesFormData(prev => ({
        ...prev,
        bannerFile: file,
        bannerPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle file upload for editing series logo
  const handleEditLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditSeriesFormData(prev => ({
        ...prev,
        logoFile: file,
        logoPreview: URL.createObjectURL(file)
      }));
    }
  };

  // Handle adding new content
  const handleAddContent = async () => {
    try {
      const tagsArray = addContentFormData.tags ? addContentFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
      
      console.log('Adding content with tags:', {
        tagsString: addContentFormData.tags,
        tagsArray: tagsArray,
        tagsArrayLength: tagsArray.length
      });
      
      // Calculate old calendar date (13 days behind new calendar date) if date is selected
      let newCalendarDate: string | null = null;
      let oldCalendarDate: string | null = null;
      
      if (addContentFormData.dailyEpisodeDate) {
        newCalendarDate = addContentFormData.dailyEpisodeDate;
        
        // Parse date string directly to avoid timezone issues
        const [year, month, day] = addContentFormData.dailyEpisodeDate.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        
        // Calculate old calendar date (13 days behind)
        const oldDate = new Date(year, month - 1, day - 13);
        
        // Format as YYYY-MM-DD without timezone conversion
        const formatDate = (date: Date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };
        
        oldCalendarDate = formatDate(oldDate);
      }

      // Upload saint pictures and prepare saints data
      const saintsData = await Promise.all(
        addContentFormData.saints.map(async (saint) => {
          let pictureUrl = saint.pictureUrl || null;
          
          // Upload picture if a new file was selected
          if (saint.pictureFile) {
            try {
              // Compress image before upload
              const compressedFile = await compressImage(saint.pictureFile, COMPRESSION_PRESETS.profile);
              
              const formData = new FormData();
              formData.append('file', compressedFile);
              formData.append('bucket', 'thumbnails');
              formData.append('path', `saints/${Date.now()}-${compressedFile.name}`);
              
              const uploadResponse = await fetch('/api/upload/thumbnail', {
                method: 'POST',
                body: formData
              });
              
              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json();
                pictureUrl = uploadData.url;
              }
            } catch (error) {
              console.error('Failed to upload saint picture:', error);
            }
          }
          
          return {
            name: saint.name,
            picture_url: pictureUrl,
            biography: saint.biography
          };
        })
      );

      console.log('[Content List] Creating content with filename:', {
        originalFilename: addContentFormData.originalFilename,
        muxAssetId: addContentFormData.muxAssetId,
        muxPlaybackId: addContentFormData.muxPlaybackId
      });

      // Ensure tags is always an array (Supabase TEXT[] expects array, not null)
      const tagsForCreate = Array.isArray(tagsArray) && tagsArray.length > 0 ? tagsArray : [];
      
      console.log('[Content List] Creating content with tags:', {
        tagsString: addContentFormData.tags,
        tagsArray: tagsArray,
        tagsForCreate: tagsForCreate,
        tagsLength: tagsForCreate.length
      });
      
      // Upload thumbnail if provided (before creating content)
      // Priority: custom thumbnail > Mux thumbnail > fallback
      let thumbnailUrl = '/images/content-1.png'; // Default fallback
      
      // Debug log to trace thumbnail state
      console.log('[Content List] Thumbnail state at save time:', {
        hasThumbnailFile: !!addContentFormData.thumbnailFile,
        thumbnailFileName: addContentFormData.thumbnailFile?.name,
        thumbnailFileSize: addContentFormData.thumbnailFile?.size,
        thumbnailPreview: addContentFormData.thumbnailPreview,
        muxThumbnailUrl: addContentFormData.muxThumbnailUrl,
        streamThumbnailUrl: addContentFormData.streamThumbnailUrl
      });
      
      if (addContentFormData.thumbnailFile) {
        // User uploaded a custom thumbnail - compress and upload it first
        console.log('[Content List] Uploading custom thumbnail file:', addContentFormData.thumbnailFile.name);
        try {
          // Compress image before upload
          const compressedFile = await compressImage(addContentFormData.thumbnailFile, COMPRESSION_PRESETS.thumbnail);
          
          const formData = new FormData();
          formData.append('file', compressedFile);
          formData.append('bucket', 'thumbnails');
          formData.append('path', `content-${Date.now()}.${compressedFile.name.split('.').pop() || 'webp'}`);
          
          const uploadResponse = await fetch('/api/upload/thumbnail', {
            method: 'POST',
            body: formData,
          });
          
          if (uploadResponse.ok) {
            const { url } = await uploadResponse.json();
            thumbnailUrl = url;
            console.log('[Content List] Custom thumbnail uploaded successfully:', url);
          } else {
            const errorText = await uploadResponse.text();
            console.error('[Content List] Thumbnail upload failed:', uploadResponse.status, errorText);
            // Fall back to Mux thumbnail if custom upload fails
            thumbnailUrl = addContentFormData.muxThumbnailUrl || addContentFormData.streamThumbnailUrl || '/images/content-1.png';
          }
        } catch (error) {
          console.error('[Content List] Failed to upload thumbnail:', error);
          // Fall back to Mux thumbnail if custom upload fails
          thumbnailUrl = addContentFormData.muxThumbnailUrl || addContentFormData.streamThumbnailUrl || '/images/content-1.png';
        }
      } else {
        // No custom thumbnail - use Mux thumbnail if available
        console.log('[Content List] No custom thumbnail file, using fallback');
        thumbnailUrl = addContentFormData.muxThumbnailUrl || addContentFormData.streamThumbnailUrl || '/images/content-1.png';
      }
      
      console.log('[Content List] Final thumbnail URL:', thumbnailUrl);

      const newContent: any = {
        title: addContentFormData.title,
        description: addContentFormData.description,
        content_url: addContentFormData.contentType === 'audio' ? addContentFormData.contentUrl : null, // For audio files, use contentUrl
        content_type: addContentFormData.contentType,
        rating: addContentFormData.rating,
        tags: tagsForCreate,
        thumbnail_url: thumbnailUrl, // Use the determined thumbnail URL
        duration: addContentFormData.duration || null, // Store duration from upload
        visibility: 'public',
        monetization: false,
        restrictions: null,
        views: 0,
        comments_count: 0,
        upload_date: new Date().toISOString(),
        // Legacy Cloudflare fields (kept for backward compatibility with existing data)
        cloudflare_stream_id: null,
        stream_thumbnail_url: null,
        stream_playback_url: null,
        // Add Mux fields for both video and audio content
        mux_asset_id: addContentFormData.muxAssetId || null,
        mux_playback_id: addContentFormData.muxPlaybackId || null,
        mux_upload_id: addContentFormData.muxUploadId || null, // Store uploadId for processing videos
        mux_thumbnail_url: addContentFormData.muxThumbnailUrl || null,
        original_filename: addContentFormData.originalFilename || null,
        stream_status: addContentFormData.muxAssetId ? 'ready' : (addContentFormData.muxUploadId ? 'processing' : 'pending'),
        stream_metadata: null,
        stream_analytics: null,
        // Add calendar dates if provided (only include if not null)
        ...(newCalendarDate && { new_calendar_date: newCalendarDate }),
        ...(oldCalendarDate && { old_calendar_date: oldCalendarDate })
      };

      // Only add saints if there are any - ensure it's a proper array for JSONB
      if (saintsData.length > 0) {
        // Ensure each saint object has the correct structure
        newContent.saints = saintsData.map(saint => ({
          name: saint.name || '',
          picture_url: saint.picture_url || null,
          biography: saint.biography || ''
        }));
      }
      // If no saints, don't include the field (let database use default)

      // For content with Mux (video or audio), use the regular create method
      // Allow saving if we have either assetId (ready) or uploadId (processing)
      if (addContentFormData.muxAssetId || addContentFormData.muxUploadId) {
        try {
          const createdContent = await addContent(newContent);
          
          if (createdContent) {
            // If one-off content is selected, create a series automatically
            if (addContentFormData.isOneOff) {
              try {
                const tagsArray = addContentFormData.tags ? addContentFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
                
                const newSeries: any = {
                  title: addContentFormData.title,
                  description: addContentFormData.description,
                  rating: addContentFormData.rating,
                  tags: tagsArray,
                  content_type: addContentFormData.contentType,
                  content_ids: [createdContent.id], // Add the newly created content
                  episodes_count: 1,
                  is_one_off: true,
                  thumbnail_url: thumbnailUrl, // Use the same thumbnail URL
                  banner_url: thumbnailUrl, // Use the same thumbnail for banner
                  logo_url: null
                };

                // Create the series with the thumbnail file if available
                const seriesSuccess = await addSeries(
                  newSeries,
                  addContentFormData.thumbnailFile || undefined, // Use same thumbnail file
                  addContentFormData.thumbnailFile || undefined  // Use same file for banner
                );

                if (!seriesSuccess) {
                  console.error('Failed to create one-off series');
                }
              } catch (error) {
                console.error('Failed to create one-off series:', error);
                // Don't fail the whole operation if series creation fails
              }
            } else if (addContentFormData.seriesId) {
              // Add content to series if a series is manually selected
              try {
                const selectedSeries = await getSeriesById(addContentFormData.seriesId);
                if (selectedSeries) {
                  const currentContentIds = selectedSeries.content_ids || [];
                  if (!currentContentIds.includes(createdContent.id)) {
                    await updateSeries(addContentFormData.seriesId, {
                      content_ids: [...currentContentIds, createdContent.id]
                    });
                  }
                }
              } catch (error) {
                console.error('Failed to update series relationship:', error);
                // Don't fail the whole operation if series update fails
              }
            }
            
            // Reset form
            setAddContentFormData({
              title: '',
              description: '',
              contentType: 'video',
              rating: 'G',
              tags: '',
              seriesId: '',
              dailyEpisodeDate: null,
              isOneOff: false,
              saints: [],
              thumbnailFile: null,
              thumbnailPreview: null,
              cloudflareStreamId: null,
              streamThumbnailUrl: null,
              streamPlaybackUrl: null,
              muxAssetId: null,
              muxUploadId: null,
              muxPlaybackId: null,
              muxThumbnailUrl: null,
              contentUrl: null,
              audioFileName: null,
              originalFilename: null,
              duration: null
            });
            
            // Close modal
            setIsAddContentModalOpen(false);
            
            // Refresh the parent component's data
            onContentUpdate?.();
          } else {
            alert('Failed to add content. Please check the console for details.');
          }
        } catch (error) {
          console.error('Error in handleAddContent:', error);
          alert('Failed to add content. Please ensure the database migration for saints has been run.');
        }
      } else {
        // For audio content or fallback, use existing method
        try {
          const createdContent = await addContent(
            newContent,
            addContentFormData.thumbnailFile || undefined
          );

          if (createdContent) {
            // If one-off content is selected, create a series automatically
            if (addContentFormData.isOneOff) {
              try {
                const tagsArray = addContentFormData.tags ? addContentFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
                
                const newSeries: any = {
                  title: addContentFormData.title,
                  description: addContentFormData.description,
                  rating: addContentFormData.rating,
                  tags: tagsArray,
                  content_type: addContentFormData.contentType,
                  content_ids: [createdContent.id], // Add the newly created content
                  episodes_count: 1,
                  is_one_off: true,
                  thumbnail_url: thumbnailUrl, // Use the same thumbnail URL
                  banner_url: thumbnailUrl, // Use the same thumbnail for banner
                  logo_url: null
                };

                // Create the series with the thumbnail file if available
                const seriesSuccess = await addSeries(
                  newSeries,
                  addContentFormData.thumbnailFile || undefined, // Use same thumbnail file
                  addContentFormData.thumbnailFile || undefined  // Use same file for banner
                );

                if (!seriesSuccess) {
                  console.error('Failed to create one-off series');
                }
              } catch (error) {
                console.error('Failed to create one-off series:', error);
                // Don't fail the whole operation if series creation fails
              }
            } else if (addContentFormData.seriesId) {
              // Add content to series if a series is manually selected
              try {
                const selectedSeries = await getSeriesById(addContentFormData.seriesId);
                if (selectedSeries) {
                  const currentContentIds = selectedSeries.content_ids || [];
                  if (!currentContentIds.includes(createdContent.id)) {
                    await updateSeries(addContentFormData.seriesId, {
                      content_ids: [...currentContentIds, createdContent.id]
                    });
                  }
                }
              } catch (error) {
                console.error('Failed to update series relationship:', error);
                // Don't fail the whole operation if series update fails
              }
            }
            
            // Reset form
            setAddContentFormData({
            title: '',
            description: '',
            contentType: 'video',
            rating: 'G',
            tags: '',
            seriesId: '',
            dailyEpisodeDate: null,
            isOneOff: false,
            saints: [],
            thumbnailFile: null,
            thumbnailPreview: null,
            cloudflareStreamId: null,
            streamThumbnailUrl: null,
            streamPlaybackUrl: null,
            muxAssetId: null,
            muxUploadId: null,
            muxPlaybackId: null,
            muxThumbnailUrl: null,
            contentUrl: null,
            audioFileName: null,
            originalFilename: null,
            duration: null
          });
          
          // Close modal
          setIsAddContentModalOpen(false);
          
          // Refresh the parent component's data
          onContentUpdate?.();
          } else {
            alert('Failed to add content. Please check the console for details.');
          }
        } catch (error) {
          console.error('Error in handleAddContent (audio/fallback):', error);
          alert('Failed to add content. Please ensure the database migration for saints has been run.');
        }
      }
    } catch (error) {
      console.error('Failed to add content:', error);
      alert('Failed to add content. Please check the console for details.');
    }
  };

  // Handle adding new series
  const handleAddSeries = async () => {
    try {
      const tagsArray = addSeriesFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      const newSeries: any = {
        title: addSeriesFormData.title,
        description: addSeriesFormData.description,
        rating: addSeriesFormData.rating,
        tags: tagsArray,
        content_type: addSeriesFormData.contentType,
        content_ids: addSeriesFormData.selectedContent, // Store selected content IDs
        thumbnail_url: '/images/series-thumbnail.png', // Fallback URL
        logo_url: '/images/series-logo.png', // Fallback URL
        banner_url: '/images/series-banner.png', // Fallback URL
        episodes_count: addSeriesFormData.selectedContent.length, // Set based on selected content
        slug: addSeriesFormData.slug || null // Include slug for URL routing
      };

      // Add is_daily_content if the column exists in the database
      if (addSeriesFormData.isDailyContent !== undefined) {
        newSeries.is_daily_content = addSeriesFormData.isDailyContent;
      }

      // Add is_one_off if the column exists in the database
      if (addSeriesFormData.isOneOff !== undefined) {
        newSeries.is_one_off = addSeriesFormData.isOneOff;
      }

      // Add is_premium if the column exists in the database
      if (addSeriesFormData.isPremium !== undefined) {
        newSeries.is_premium = addSeriesFormData.isPremium;
      }

      // Pass the actual files to the addSeries function for upload
      const success = await addSeries(
        newSeries,
        addSeriesFormData.thumbnailFile || undefined,
        addSeriesFormData.bannerFile || undefined
      );
      
      if (success) {
        // Reset form
        setAddSeriesFormData({
          title: '',
          description: '',
          rating: 'G',
          tags: '',
          contentType: 'video',
          isDailyContent: false,
          isOneOff: false,
          isPremium: true,
          slug: '',
          thumbnailFile: null,
          bannerFile: null,
          thumbnailPreview: null,
          bannerPreview: null,
          selectedContent: []
        });
        
        setIsAddSeriesModalOpen(false);
        onContentUpdate?.();
      } else {
        console.error('Failed to add series');
      }
    } catch (error) {
      console.error('Failed to add series:', error);
    }
  };

  const renderTable = (data: any[], type: string) => {
      const columns = type === "content" ? 
        ["", "Date", "Views", "Comments", ""] :
        ["Series"];

      return (
        <div className="bg-[#1a1a1a] rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className={`grid gap-4 px-4 py-3 border-b border-gray-700 bg-[#242424] text-gray-400 text-sm font-medium ${
            type === "content" ? "grid-cols-8" : "grid-cols-1"
          }`}>
          {columns.map((column, index) => (
            <div key={column || `col-${index}`} className={
              index === 0 ? "col-span-3" : 
              index === columns.length - 1 ? "col-span-2" : 
              "col-span-1"
            }>
              {index === 0 && type === "content" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setContentTypeFilter("video")}
                    className={`px-3 py-1 text-sm font-medium transition-colors rounded ${
                      contentTypeFilter === "video"
                        ? "text-white bg-gray-700"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    Video
                  </button>
                  <button
                    onClick={() => setContentTypeFilter("audio")}
                    className={`px-3 py-1 text-sm font-medium transition-colors rounded ${
                      contentTypeFilter === "audio"
                        ? "text-white bg-gray-700"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    Audio
                  </button>
                </div>
              ) : column === "Date" ? (
                <div className="flex items-center gap-1">
                  {column}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              ) : (
                column
              )}
            </div>
          ))}
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-gray-700">
                  {data.map((item, index) => (
                    <div 
                      key={`${item.id}-${index}`} 
                      onClick={() => {
                        if (type === "content") {
                          handleEditContent(item.id);
                        } else {
                          handleEditSeries(item.id);
                        }
                      }}
                      className={`grid gap-4 px-4 py-4 hover:bg-[#242424] transition-colors group cursor-pointer ${
                        type === "content" ? "grid-cols-8" : "grid-cols-1"
                      }`}
                    >
                      {type === "content" ? (
                        <>
                          {/* Video */}
                          <div className="col-span-3 flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <Image
                        src={item.thumbnail}
                        alt={item.title}
                        width={item.contentType === 'audio' ? 68 : 120}
                        height={68}
                        className={`${item.contentType === 'audio' ? 'w-17 h-17' : 'w-30 h-17'} object-cover rounded`}
                        unoptimized
                      />
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
                        {item.duration}
                      </div>
                    </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-white font-medium text-sm line-clamp-2 flex-1">
                                  {item.title}
                                </h3>
                                {/* Processing indicator */}
                                {item.streamStatus === 'processing' && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/20 border border-blue-500/50 rounded text-xs text-blue-300 flex-shrink-0">
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-300"></div>
                                    <span>Processing</span>
                                  </div>
                                )}
                                {item.streamStatus === 'pending' && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs text-yellow-300 flex-shrink-0">
                                    <span>Pending</span>
                                  </div>
                                )}
                                {item.streamStatus === 'errored' && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-300 flex-shrink-0">
                                    <span>Error</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-gray-400 text-xs line-clamp-2">
                                {item.tags && Array.isArray(item.tags) && item.tags.length > 0
                                  ? item.tags.join(', ')
                                  : 'No tags'}
                              </p>
                            </div>
                          </div>

                  {/* Date */}
                  <div className="col-span-1">
                    <div className="text-gray-300 text-sm">{item.uploadDate}</div>
                    <div className="text-gray-500 text-xs">Uploaded</div>
                  </div>

                  {/* Views */}
                  <div className="col-span-1">
                    <span className="text-gray-300 text-sm">{item.views}</span>
                  </div>

                  {/* Comments */}
                  <div className="col-span-1">
                    <span className="text-gray-300 text-sm">{item.comments}</span>
                  </div>

                  {/* Checkbox and Edit Button */}
                  <div className="col-span-2 flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedContentIds.has(item.id)}
                      onChange={() => handleContentSelect(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditContent(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-[#2a2a2a] rounded-lg"
                      title="Edit content"
                    >
                      <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </>
                        ) : (
                          /* Series */
                          <div className="col-span-1 flex items-start gap-4 group">
                            <div className="relative flex-shrink-0">
                              <Image
                                src={item.thumbnail}
                                alt={item.title}
                                width={item.content_type === 'audio' ? 90 : 160}
                                height={90}
                                className={`${item.content_type === 'audio' ? 'w-22 h-22' : 'w-40 h-22'} object-cover rounded`}
                                unoptimized
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-white font-semibold text-lg mb-2 line-clamp-2">
                                {item.title}
                              </h3>
                              <p className="text-gray-400 text-sm">
                                {item.episodes} episodes
                              </p>
                            </div>
                            {/* Checkbox and Edit Button */}
                            <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedSeriesIds.has(item.id)}
                                onChange={() => handleSeriesSelect(item.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditSeries(item.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-[#2a2a2a] rounded-lg"
                                title="Edit series"
                              >
                                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-8">
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => {
                setActiveTab("content");
                // Clear series selections when switching to content tab
                setSelectedSeriesIds(new Set());
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "content"
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Content
            </button>
            <button
              onClick={() => {
                setActiveTab("series");
                // Clear content selections when switching to series tab
                setSelectedContentIds(new Set());
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "series"
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Series
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-gray-400 text-sm">
            {activeTab === "content" 
              ? `${allContent.length} ${contentTypeFilter === 'video' ? 'videos' : 'audio files'}` 
              : `${seriesData.length} series`}
          </div>
          {activeTab === "content" ? (
            <>
              {contentItems.some(item => 
                item.stream_status === 'processing' || 
                item.stream_status === 'pending' ||
                (item.mux_upload_id && !item.mux_playback_id)
              ) && (
                <button
                  onClick={handleCheckProcessingVideos}
                  disabled={isCheckingProcessing}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCheckingProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Checking...</span>
                    </>
                  ) : (
                    <span>Check Processing Videos</span>
                  )}
                </button>
              )}
              <button
                onClick={() => setIsAddContentModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Add Content
              </button>
              <button
                onClick={() => {
                  if (selectedContentIds.size > 0) {
                    setIsDeleteConfirmModalOpen(true);
                  }
                }}
                disabled={selectedContentIds.size === 0}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  selectedContentIds.size > 0
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsAddSeriesModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Add Series
              </button>
              <button
                onClick={() => {
                  if (selectedSeriesIds.size > 0) {
                    setIsDeleteSeriesConfirmModalOpen(true);
                  }
                }}
                disabled={selectedSeriesIds.size === 0}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  selectedSeriesIds.size > 0
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content Table */}
      {activeTab === "content" ? (
        allContent.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">No content items found</div>
            <div className="text-gray-500 text-sm">Add content to categories in the Home tab</div>
          </div>
        ) : (
          renderTable(allContent, "content")
        )
      ) : (
        seriesData.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">No series found</div>
            <div className="text-gray-500 text-sm">Create series in the Home tab</div>
          </div>
        ) : (
          renderTable(seriesData, "series")
        )
      )}

      {/* Delete Confirmation Modal for Content */}
      {isDeleteConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsDeleteConfirmModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-md mx-4">
            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-4">Confirm Delete</h2>
            
            {/* Message */}
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete {selectedContentIds.size} {selectedContentIds.size === 1 ? 'item' : 'items'}? This action cannot be undone.
            </p>
            
            {/* Buttons */}
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setIsDeleteConfirmModalOpen(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Series */}
      {isDeleteSeriesConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsDeleteSeriesConfirmModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-md mx-4">
            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-4">Confirm Delete</h2>
            
            {/* Message */}
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete {selectedSeriesIds.size} {selectedSeriesIds.size === 1 ? 'series' : 'series'}? This action cannot be undone.
            </p>
            
            {/* Buttons */}
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setIsDeleteSeriesConfirmModalOpen(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelectedSeries}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Content Modal */}
      {isAddContentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsAddContentModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-6xl mx-4 max-h-[85vh] overflow-y-auto">
            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-6">Add New Content</h2>
            
            {/* Form - Two Column Layout */}
            <div className="grid grid-cols-2 gap-8">
              {/* Left Column - Upload Areas */}
              <div className="space-y-6">
                {/* Content Type */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Content Type</label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="contentType"
                        value="video"
                        checked={addContentFormData.contentType === 'video'}
                        onChange={(e) => setAddContentFormData(prev => ({ ...prev, contentType: e.target.value as 'video' | 'audio' }))}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-300">Video</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="contentType"
                        value="audio"
                        checked={addContentFormData.contentType === 'audio'}
                        onChange={(e) => setAddContentFormData(prev => ({ ...prev, contentType: e.target.value as 'video' | 'audio' }))}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-300">Audio</span>
                    </label>
                  </div>
                </div>

                {/* Video Upload - Only show for video content */}
                {addContentFormData.contentType === 'video' && (
                  <div>
                    <label className="block text-white text-sm font-medium mb-3">Video File</label>
                    <VideoUploadDropzone
                      onUploadComplete={(data) => {
                        console.log('[Content List] Video upload complete, received data:', {
                          assetId: data.assetId,
                          uploadId: data.uploadId,
                          playbackId: data.playbackId,
                          filename: data.filename,
                          isProcessing: data.isProcessing,
                          thumbnailUrl: data.thumbnailUrl
                        });
                        setAddContentFormData(prev => {
                          // IMPORTANT: Preserve user's custom thumbnail if they uploaded one
                          // Don't overwrite thumbnailPreview if user has a custom thumbnailFile
                          const shouldPreserveThumbnail = prev.thumbnailFile !== null;
                          
                          console.log('[Content List] Updating form state, preserving thumbnail:', {
                            hasCustomThumbnailFile: shouldPreserveThumbnail,
                            prevThumbnailPreview: prev.thumbnailPreview,
                            dataThumbnailUrl: data.thumbnailUrl
                          });
                          
                          return {
                            ...prev,
                            muxAssetId: data.assetId || prev.muxAssetId, // Update if available, keep existing if processing
                            muxUploadId: data.uploadId || prev.muxUploadId, // Store uploadId for processing videos
                            muxPlaybackId: data.playbackId || prev.muxPlaybackId, // Update if available
                            muxThumbnailUrl: data.thumbnailUrl || prev.muxThumbnailUrl, // Update if available
                            // Only update thumbnailPreview from Mux if user hasn't uploaded a custom thumbnail
                            thumbnailPreview: shouldPreserveThumbnail ? prev.thumbnailPreview : (data.thumbnailUrl || prev.thumbnailPreview),
                            duration: data.duration || prev.duration, // Update if available
                            originalFilename: data.filename || prev.originalFilename // Update if available
                          };
                        });
                      }}
                      onUploadError={(error) => {
                        console.error('Video upload error:', error);
                        // You could add a toast notification here
                      }}
                      onUploadProgress={(progress) => {
                        // Optional: Show progress in UI
                        console.log('Upload progress:', progress);
                      }}
                      onUploadIdReady={(uploadId) => {
                        // CRITICAL: Get uploadId IMMEDIATELY when the upload URL is created
                        // This ensures we have it even if user saves content before upload completes
                        console.log('[Content List] Upload ID ready early:', uploadId);
                        setAddContentFormData(prev => ({
                          ...prev,
                          muxUploadId: uploadId
                        }));
                      }}
                      disabled={!!addContentFormData.muxAssetId}
                    />
                  </div>
                )}

                {/* Audio Upload - Only show for audio content */}
                {addContentFormData.contentType === 'audio' && (
                  <div>
                    <label className="block text-white text-sm font-medium mb-3">Audio File</label>
                    <AudioUploadDropzone
                      onUploadComplete={(data) => {
                        console.log('[Content List] Audio upload complete, received data:', {
                          assetId: data.assetId,
                          uploadId: data.uploadId,
                          playbackId: data.playbackId,
                          filename: data.filename,
                          isProcessing: data.isProcessing
                        });
                        setAddContentFormData(prev => ({
                          ...prev,
                          muxAssetId: data.assetId || prev.muxAssetId,
                          muxUploadId: data.uploadId || prev.muxUploadId,
                          muxPlaybackId: data.playbackId || prev.muxPlaybackId,
                          muxThumbnailUrl: data.thumbnailUrl || prev.muxThumbnailUrl,
                          thumbnailPreview: data.thumbnailUrl || prev.thumbnailPreview,
                          duration: data.duration || prev.duration,
                          originalFilename: data.filename || prev.originalFilename
                        }));
                      }}
                      onUploadError={(error) => {
                        console.error('Audio upload error:', error);
                        // You could add a toast notification here
                      }}
                      onUploadProgress={(progress) => {
                        // Optional: Show progress in UI
                        console.log('Upload progress:', progress);
                      }}
                      onUploadIdReady={(uploadId) => {
                        // CRITICAL: Get uploadId IMMEDIATELY when the upload URL is created
                        // This ensures we have it even if user saves content before upload completes
                        console.log('[Content List] Audio Upload ID ready early:', uploadId);
                        setAddContentFormData(prev => ({
                          ...prev,
                          muxUploadId: uploadId
                        }));
                      }}
                      disabled={!!addContentFormData.muxAssetId}
                    />
                  </div>
                )}

                {/* Thumbnail Upload - Always visible for both audio and video */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Content Thumbnail</label>
                  <div 
                    className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer h-48 flex flex-col items-center justify-center relative overflow-hidden"
                    onDrop={handleContentThumbnailDrop}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => {
                      console.log('[Content Thumbnail] Drag enter');
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onDragLeave={(e) => {
                      console.log('[Content Thumbnail] Drag leave');
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.style.borderColor = '#4b5563';
                    }}
                    onClick={() => document.getElementById('content-thumbnail-upload')?.click()}
                    style={{ pointerEvents: 'auto' }}
                  >
                    {addContentFormData.thumbnailPreview ? (
                      <Image
                        src={addContentFormData.thumbnailPreview}
                        alt="Thumbnail preview"
                        width={192}
                        height={128}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        unoptimized
                      />
                    ) : (
                      <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    <div className="relative z-10 bg-black/50 rounded-lg px-4 py-2 pointer-events-none">
                      <svg className="w-8 h-8 text-white mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-white text-xs font-medium">{addContentFormData.thumbnailPreview ? 'Change thumbnail' : 'Upload thumbnail'}</p>
                    </div>
                    <input
                      id="content-thumbnail-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleContentThumbnailUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column - Details */}
              <div className="space-y-5">
                {/* Title */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Title</label>
                  <input
                    type="text"
                    placeholder="Enter content title"
                    value={addContentFormData.title}
                    onChange={(e) => setAddContentFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Description</label>
                  <textarea
                    placeholder="Enter content description"
                    rows={4}
                    value={addContentFormData.description}
                    onChange={(e) => setAddContentFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                  />
                </div>

                {/* One-off Content Checkbox */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={addContentFormData.isOneOff}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setAddContentFormData(prev => ({ 
                            ...prev, 
                            isOneOff: isChecked,
                            // Clear series selection when one-off is checked
                            seriesId: isChecked ? '' : prev.seriesId
                          }));
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </div>
                    <span className="text-white text-sm">One-off content</span>
                  </label>
                  <span className="text-gray-400 text-xs ml-6 block mt-1">Automatically create a series with this content as its only episode</span>
                </div>

                {/* Daily Episode Date - Only show if selected series is daily content */}
                {addContentFormData.seriesId && (() => {
                  const selectedSeries = series.find(s => s.id === addContentFormData.seriesId);
                  const isDailySeries = selectedSeries && (selectedSeries as any).is_daily_content === true;
                  
                  return isDailySeries ? (
                    <div>
                      <label className="block text-white text-sm font-medium mb-2">Daily Episode Date</label>
                      <div className="relative">
                        <input
                          type="date"
                          value={addContentFormData.dailyEpisodeDate || ''}
                          onChange={(e) => {
                            const selectedDate = e.target.value;
                            setAddContentFormData(prev => ({ ...prev, dailyEpisodeDate: selectedDate || null }));
                          }}
                          className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                          onClick={(e) => {
                            // Ensure the entire input is clickable
                            e.currentTarget.showPicker?.();
                          }}
                        />
                      </div>
                      {addContentFormData.dailyEpisodeDate && (() => {
                        // Parse date string directly to avoid timezone issues
                        const [year, month, day] = addContentFormData.dailyEpisodeDate.split('-').map(Number);
                        const selectedDate = new Date(year, month - 1, day);
                        
                        // Calculate old calendar date (13 days ahead for display only)
                        const oldCalendarDate = new Date(year, month - 1, day + 13);
                        
                        // Format dates as YYYY-MM-DD to avoid timezone conversion
                        const formatDate = (date: Date) => {
                          const y = date.getFullYear();
                          const m = String(date.getMonth() + 1).padStart(2, '0');
                          const d = String(date.getDate()).padStart(2, '0');
                          return `${y}-${m}-${d}`;
                        };
                        
                        const formattedSelected = formatDate(selectedDate);
                        const formattedOld = formatDate(oldCalendarDate);
                        
                        // Display in a readable format
                        const displayDate = (dateStr: string) => {
                          const [y, m, d] = dateStr.split('-');
                          return `${m}/${d}/${y}`;
                        };
                        
                        return (
                          <p className="text-gray-400 text-xs mt-2">
                            New Calendar: {displayDate(formattedSelected)} | Old Calendar: {displayDate(formattedOld)}
                          </p>
                        );
                      })()}
                    </div>
                  ) : null;
                })()}

                {/* Rating and Series - Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Rating */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">Rating</label>
                    <div className="relative">
                      <select 
                        value={addContentFormData.rating}
                        onChange={(e) => setAddContentFormData(prev => ({ ...prev, rating: e.target.value as 'G' | 'PG' | 'PG-13' | 'R' | 'NR' }))}
                        className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
                      >
                        <option value="G">G</option>
                        <option value="PG">PG</option>
                        <option value="PG-13">PG-13</option>
                        <option value="R">R</option>
                        <option value="NR">NR</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Series Selection */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">Series</label>
                    <div className="relative">
                      <select 
                        value={addContentFormData.seriesId}
                        onChange={(e) => {
                          const newSeriesId = e.target.value;
                          // Reset dailyEpisodeDate when series changes
                          setAddContentFormData(prev => ({ 
                            ...prev, 
                            seriesId: newSeriesId,
                            dailyEpisodeDate: null, // Reset when series changes
                            // Clear one-off when manually selecting a series
                            isOneOff: false
                          }));
                        }}
                        disabled={addContentFormData.isOneOff}
                        className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 appearance-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">None</option>
                        {series.map((s) => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Tags</label>
                  <input
                    type="text"
                    placeholder="drama, action, documentary"
                    value={addContentFormData.tags}
                    onChange={(e) => setAddContentFormData(prev => ({ ...prev, tags: e.target.value }))}
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <p className="text-gray-500 text-xs mt-1.5">Separate tags with commas</p>
                </div>

                {/* Saints */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-white text-sm font-medium">Saints</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newSaint = {
                          id: Date.now().toString(),
                          name: '',
                          pictureFile: null,
                          picturePreview: null,
                          pictureUrl: null,
                          biography: ''
                        };
                        setAddContentFormData(prev => ({
                          ...prev,
                          saints: [...prev.saints, newSaint]
                        }));
                      }}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
                    >
                      + Add Saint
                    </button>
                  </div>
                  
                  {addContentFormData.saints.length > 0 && (
                    <div className="space-y-4">
                      {addContentFormData.saints.map((saint, index) => (
                        <div key={saint.id} className="bg-[#1a1a1a] border border-gray-700 rounded-md p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-white text-sm font-medium">Saint {index + 1}</h4>
                            <button
                              type="button"
                              onClick={() => {
                                setAddContentFormData(prev => ({
                                  ...prev,
                                  saints: prev.saints.filter(s => s.id !== saint.id)
                                }));
                              }}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              Remove
                            </button>
                          </div>
                          
                          {/* Saint Name */}
                          <div>
                            <label className="block text-gray-400 text-xs mb-1.5">Name</label>
                            <input
                              type="text"
                              placeholder="Enter saint's name"
                              value={saint.name}
                              onChange={(e) => {
                                setAddContentFormData(prev => ({
                                  ...prev,
                                  saints: prev.saints.map(s => 
                                    s.id === saint.id ? { ...s, name: e.target.value } : s
                                  )
                                }));
                              }}
                              className="w-full bg-[#0a0a0a] text-white px-3 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors text-sm"
                            />
                          </div>
                          
                          {/* Saint Picture */}
                          <div>
                            <label className="block text-gray-400 text-xs mb-1.5">Picture</label>
                            <div className="relative">
                              <div
                                className="border-2 border-dashed border-gray-600 rounded-md p-3 cursor-pointer hover:border-gray-500 transition-colors"
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.add('border-blue-500');
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.remove('border-blue-500');
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.remove('border-blue-500');
                                  const file = e.dataTransfer.files[0];
                                  if (file && file.type.startsWith('image/')) {
                                    setAddContentFormData(prev => ({
                                      ...prev,
                                      saints: prev.saints.map(s => 
                                        s.id === saint.id ? {
                                          ...s,
                                          pictureFile: file,
                                          picturePreview: URL.createObjectURL(file)
                                        } : s
                                      )
                                    }));
                                  }
                                }}
                                onClick={() => {
                                  const input = document.getElementById(`saint-picture-${saint.id}`) as HTMLInputElement;
                                  input?.click();
                                }}
                              >
                                {saint.picturePreview ? (
                                  <div className="relative">
                                    <img
                                      src={saint.picturePreview}
                                      alt={saint.name || 'Saint picture'}
                                      className="w-full h-32 object-cover rounded pointer-events-none"
                                    />
                                    <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center pointer-events-none">
                                      <p className="text-white text-xs">Change picture</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center py-4 pointer-events-none">
                                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-gray-400 text-xs">Drop image here or click to upload</p>
                                  </div>
                                )}
                              </div>
                              <input
                                id={`saint-picture-${saint.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setAddContentFormData(prev => ({
                                      ...prev,
                                      saints: prev.saints.map(s => 
                                        s.id === saint.id ? {
                                          ...s,
                                          pictureFile: file,
                                          picturePreview: URL.createObjectURL(file)
                                        } : s
                                      )
                                    }));
                                  }
                                }}
                              />
                            </div>
                          </div>
                          
                          {/* Saint Biography */}
                          <div>
                            <label className="block text-gray-400 text-xs mb-1.5">Biography</label>
                            <textarea
                              placeholder="Enter short biography"
                              rows={3}
                              value={saint.biography}
                              onChange={(e) => {
                                setAddContentFormData(prev => ({
                                  ...prev,
                                  saints: prev.saints.map(s => 
                                    s.id === saint.id ? { ...s, biography: e.target.value } : s
                                  )
                                }));
                              }}
                              className="w-full bg-[#0a0a0a] text-white px-3 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 resize-none transition-colors text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {addContentFormData.saints.length === 0 && (
                    <p className="text-gray-500 text-xs">No saints added. Click "Add Saint" to add one.</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-6">
                  <button
                    onClick={() => setIsAddContentModalOpen(false)}
                    className="px-6 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors border border-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddContent}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    Add Content
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Series Modal */}
      {isAddSeriesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsAddSeriesModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-6xl mx-4 max-h-[85vh] overflow-y-auto">
            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-6">Add New Series</h2>
            
            {/* Form - Two Column Layout */}
            <div className="grid grid-cols-2 gap-8">
              {/* Left Column - Upload Areas */}
              <div className="space-y-6">
                {/* Series Thumbnail */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Series Thumbnail</label>
                  <div 
                    className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer h-48 flex flex-col items-center justify-center relative overflow-hidden"
                    onDrop={handleThumbnailDrop}
                    onDragOver={handleDragOver}
                    onClick={() => document.getElementById('thumbnail-upload')?.click()}
                  >
                    {addSeriesFormData.thumbnailPreview ? (
                      <Image
                        src={addSeriesFormData.thumbnailPreview}
                        alt="Thumbnail preview"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <>
                        <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-300 text-sm font-medium">Upload thumbnail image</p>
                      </>
                    )}
                    <input
                      id="thumbnail-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Series Banner */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Series Banner</label>
                  <div 
                    className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:border-gray-500 transition-colors cursor-pointer h-64 flex flex-col items-center justify-center relative overflow-hidden"
                    onDrop={handleBannerDrop}
                    onDragOver={handleDragOver}
                    onClick={() => document.getElementById('banner-upload')?.click()}
                  >
                    {addSeriesFormData.bannerPreview ? (
                      <Image
                        src={addSeriesFormData.bannerPreview}
                        alt="Banner preview"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <>
                        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-300 mb-2 font-medium">Drag and drop banner image here</p>
                        <p className="text-gray-500 text-sm">or click to browse files</p>
                      </>
                    )}
                    <input
                      id="banner-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleBannerUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column - Details */}
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Series Title</label>
                  <input
                    type="text"
                    value={addSeriesFormData.title}
                    onChange={(e) => {
                      const newTitle = e.target.value;
                      setAddSeriesFormData(prev => ({
                        ...prev,
                        title: newTitle,
                        // Auto-populate slug from title, but only if slug is empty or matches the previous auto-generated slug
                        slug: prev.slug === '' || prev.slug === slugify(prev.title) ? slugify(newTitle) : prev.slug
                      }));
                    }}
                    placeholder="Enter series title"
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* URL Slug */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">URL Slug</label>
                  <input
                    type="text"
                    value={addSeriesFormData.slug}
                    onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="dust-to-dust"
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <p className="text-gray-400 text-xs mt-1">Used in the URL (e.g., /dust-to-dust). Auto-generated from title, but you can customize it.</p>
                </div>

                {/* Content Type */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Content Type</label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="contentType"
                        value="video"
                        checked={addSeriesFormData.contentType === 'video'}
                        onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, contentType: e.target.value as 'video' | 'audio' }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white">Video</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="contentType"
                        value="audio"
                        checked={addSeriesFormData.contentType === 'audio'}
                        onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, contentType: e.target.value as 'video' | 'audio' }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white">Audio</span>
                    </label>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Description</label>
                  <textarea
                    value={addSeriesFormData.description}
                    onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter series description"
                    rows={3}
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                  />
                </div>

                {/* Content Settings */}
                <div className="space-y-3">
                  <label className="block text-white text-sm font-medium">Content Settings</label>
                  <div className="space-y-3 pl-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addSeriesFormData.isDailyContent}
                        onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, isDailyContent: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white text-sm font-medium">Daily Content?</span>
                    </label>
                    <label className="flex flex-col gap-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addSeriesFormData.isOneOff}
                          onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, isOneOff: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-white text-sm font-medium">One-off</span>
                      </div>
                      <span className="text-gray-400 text-xs ml-6">A one-off piece of content with no additional episodes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addSeriesFormData.isPremium}
                        onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, isPremium: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white text-sm font-medium">Premium Series</span>
                    </label>
                  </div>
                </div>

                {/* Rating and Tags - Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Rating */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">Rating</label>
                    <div className="relative">
                      <select 
                        value={addSeriesFormData.rating}
                        onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, rating: e.target.value as 'G' | 'PG' | 'PG-13' | 'R' | 'NR' }))}
                        className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
                      >
                        <option value="G">G</option>
                        <option value="PG">PG</option>
                        <option value="PG-13">PG-13</option>
                        <option value="R">R</option>
                        <option value="NR">NR</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">Tags</label>
                    <input
                      type="text"
                      value={addSeriesFormData.tags}
                      onChange={(e) => setAddSeriesFormData(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="drama, action"
                      className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Content Selection */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Select Content for Series</label>
                  <div className="bg-[#1a1a1a] rounded-md border border-gray-600 max-h-[280px] overflow-y-auto">
                    {allContentUnfiltered.filter(item => item.contentType === addSeriesFormData.contentType).map((item, idx) => (
                      <div key={`${item.id}-add-${idx}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a2a2a] border-b border-gray-700 last:border-b-0">
                        <input
                          type="checkbox"
                          checked={addSeriesFormData.selectedContent?.includes(item.id) || false}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setAddSeriesFormData(prev => ({
                              ...prev,
                              selectedContent: isChecked
                                ? [...(prev.selectedContent || []), item.id]
                                : (prev.selectedContent || []).filter(id => id !== item.id)
                            }));
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <Image
                            src={item.thumbnail}
                            alt={item.title}
                            width={56}
                            height={32}
                            className="w-14 h-8 object-cover rounded flex-shrink-0"
                            unoptimized
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{item.title}</p>
                            <p className="text-gray-400 text-xs truncate">{item.contentType}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 text-xs mt-2">
                    {addSeriesFormData.selectedContent?.length || 0} content item(s) selected
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setIsAddSeriesModalOpen(false)}
                    className="px-6 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors border border-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddSeries}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    Add Series
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Series Modal */}
      {editingSeries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditingSeries(null)}
          />
          
          {/* Modal */}
          <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-6xl mx-4 max-h-[85vh] overflow-y-auto">
            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-6">Edit Series</h2>
            
            {/* Form - Two Column Layout */}
            <div className="grid grid-cols-2 gap-8">
              {/* Left Column - Upload Areas */}
              <div className="space-y-6">
                {/* Series Thumbnail */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Series Thumbnail</label>
                  <div 
                    className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer h-48 flex flex-col items-center justify-center relative overflow-hidden"
                    onClick={() => document.getElementById('edit-thumbnail-upload')?.click()}
                  >
                    {editSeriesFormData.thumbnailPreview ? (
                      <Image
                        src={editSeriesFormData.thumbnailPreview}
                        alt="Thumbnail preview"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : editingSeries.thumbnail_url && editingSeries.thumbnail_url !== '/images/series-thumbnail.png' ? (
                      <Image
                        src={editingSeries.thumbnail_url}
                        alt={editingSeries.title}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          console.log('Image failed to load:', editingSeries.thumbnail_url);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                        <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 right-2 bg-black/70 rounded-lg px-3 py-2">
                      <svg className="w-5 h-5 text-white mb-1 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-white text-xs font-medium">Change thumbnail</p>
                    </div>
                    <input
                      id="edit-thumbnail-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleEditThumbnailUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Series Logo */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Series Logo</label>
                  <div 
                    className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer h-48 flex flex-col items-center justify-center relative overflow-hidden"
                    onClick={() => document.getElementById('edit-logo-upload')?.click()}
                  >
                    {(editSeriesFormData.logoPreview || (editingSeries?.logo_url && editingSeries.logo_url !== '/images/series-logo.png')) ? (
                      <Image
                        src={editSeriesFormData.logoPreview || editingSeries.logo_url}
                        alt="Logo preview"
                        width={192}
                        height={192}
                        className="absolute inset-0 w-full h-full object-contain"
                        unoptimized
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    <div className="relative z-10 bg-black/50 rounded-lg px-4 py-2">
                      <svg className="w-8 h-8 text-white mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-white text-xs font-medium">Change logo</p>
                    </div>
                    <input
                      id="edit-logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleEditLogoUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Series Banner */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">Series Banner</label>
                  <div 
                    className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer h-64 flex flex-col items-center justify-center relative overflow-hidden"
                    onClick={() => document.getElementById('edit-banner-upload')?.click()}
                  >
                    {(editSeriesFormData.bannerPreview || (editingSeries?.banner_url && editingSeries.banner_url !== '/images/series-banner.png')) ? (
                      <Image
                        src={editSeriesFormData.bannerPreview || editingSeries.banner_url}
                        alt="Banner preview"
                        width={256}
                        height={256}
                        className="absolute inset-0 w-full h-full object-cover"
                        unoptimized
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    <div className="relative z-10 bg-black/50 rounded-lg px-4 py-2">
                      <svg className="w-8 h-8 text-white mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-white text-xs font-medium">Change banner</p>
                    </div>
                    <input
                      id="edit-banner-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleEditBannerUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column - Details */}
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Series Title</label>
                  <input
                    type="text"
                    value={editSeriesFormData.title}
                    onChange={(e) => {
                      const newTitle = e.target.value;
                      setEditSeriesFormData(prev => ({
                        ...prev,
                        title: newTitle,
                        // Auto-populate slug from title, but only if slug is empty or matches the previous auto-generated slug
                        slug: prev.slug === '' || prev.slug === slugify(prev.title) ? slugify(newTitle) : prev.slug
                      }));
                    }}
                    placeholder="Enter series title"
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* URL Slug */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">URL Slug</label>
                  <input
                    type="text"
                    value={editSeriesFormData.slug}
                    onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="dust-to-dust"
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <p className="text-gray-400 text-xs mt-1">Used in the URL (e.g., /dust-to-dust). Auto-generated from title, but you can customize it.</p>
                </div>

                {/* Content Type */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Content Type</label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="editContentType"
                        value="video"
                        checked={editSeriesFormData.contentType === 'video'}
                        onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, contentType: e.target.value as 'video' | 'audio' }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white">Video</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="editContentType"
                        value="audio"
                        checked={editSeriesFormData.contentType === 'audio'}
                        onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, contentType: e.target.value as 'video' | 'audio' }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white">Audio</span>
                    </label>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Description</label>
                  <textarea
                    value={editSeriesFormData.description}
                    onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter series description"
                    rows={3}
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                  />
                </div>

                {/* Content Settings */}
                <div className="space-y-3">
                  <label className="block text-white text-sm font-medium">Content Settings</label>
                  <div className="space-y-3 pl-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSeriesFormData.isDailyContent}
                        onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, isDailyContent: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white text-sm font-medium">Daily Content?</span>
                    </label>
                    <label className="flex flex-col gap-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editSeriesFormData.isOneOff}
                          onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, isOneOff: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-white text-sm font-medium">One-off</span>
                      </div>
                      <span className="text-gray-400 text-xs ml-6">A one-off piece of content with no additional episodes</span>
                    </label>
                    <label className="flex flex-col gap-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editSeriesFormData.isPremium}
                          onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, isPremium: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-white text-sm font-medium">Premium Series</span>
                      </div>
                      <span className="text-gray-400 text-xs ml-6">
                        Premium series require a paid subscription to access
                      </span>
                    </label>
                  </div>
                </div>

                {/* Rating and Tags - Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Rating */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">Rating</label>
                    <div className="relative">
                      <select 
                        value={editSeriesFormData.rating}
                        onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, rating: e.target.value as 'G' | 'PG' | 'PG-13' | 'R' | 'NR' }))}
                        className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
                      >
                        <option value="G">G</option>
                        <option value="PG">PG</option>
                        <option value="PG-13">PG-13</option>
                        <option value="R">R</option>
                        <option value="NR">NR</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">Tags</label>
                    <input
                      type="text"
                      value={editSeriesFormData.tags}
                      onChange={(e) => setEditSeriesFormData(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="drama, action"
                      className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Content Selection */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Select Content for Series</label>
                  <div className="bg-[#1a1a1a] rounded-md border border-gray-600 max-h-[280px] overflow-y-auto">
                    {allContentUnfiltered.filter(item => item.contentType === editSeriesFormData.contentType).map((item, idx) => (
                      <div key={`${item.id}-edit-${idx}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a2a2a] border-b border-gray-700 last:border-b-0">
                        <input
                          type="checkbox"
                          checked={editSeriesFormData.selectedContent.includes(item.id)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setEditSeriesFormData(prev => ({
                              ...prev,
                              selectedContent: isChecked
                                ? [...prev.selectedContent, item.id]
                                : prev.selectedContent.filter(id => id !== item.id)
                            }));
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <Image
                            src={item.thumbnail}
                            alt={item.title}
                            width={56}
                            height={32}
                            className="w-14 h-8 object-cover rounded flex-shrink-0"
                            unoptimized
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{item.title}</p>
                            <p className="text-gray-400 text-xs truncate">{item.contentType}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 text-xs mt-2">
                    {editSeriesFormData.selectedContent.length} content item(s) selected
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between gap-3 pt-2">
                  <button
                    onClick={handleDeleteSeriesFromEdit}
                    className="px-6 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors shadow-lg"
                  >
                    Delete Series
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditingSeries(null)}
                      className="px-6 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors border border-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveSeries}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-lg"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Content Modal */}
      {editingContent && (
        <EditContentModal
          editingContent={editingContent}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          series={series}
          onClose={() => setEditingContent(null)}
          onSave={handleSaveContent}
          onDelete={handleDeleteContentFromEdit}
        />
      )}
    </div>
  );
}
