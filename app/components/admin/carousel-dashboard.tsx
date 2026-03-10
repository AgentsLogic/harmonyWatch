"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { seriesService } from "@/lib/database";
import type { Series } from "@/lib/database.types";
import { compressImage, COMPRESSION_PRESETS } from "@/lib/utils/image-compression";

interface CarouselItem {
  id: string;
  series_id: string;
  sort_order: number;
  logo_url: string | null;
  subtitle: string | null;
  background_url: string | null;
  background_urls: string[] | null;
  badges: string[] | null;
  auto_badge_enabled: boolean;
  enable_video_preview: boolean;
  is_active: boolean;
  series: Series;
}

export default function CarouselDashboard() {
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItemSeriesId, setNewItemSeriesId] = useState<string>("");
  const [newItemLogoUrl, setNewItemLogoUrl] = useState<string>("");
  const [newItemSubtitle, setNewItemSubtitle] = useState<string>("");
  const [newItemBackgroundUrl, setNewItemBackgroundUrl] = useState<string>("");
  const [newItemBadges, setNewItemBadges] = useState<string>(""); // Comma-separated badges
  const [newItemAutoBadge, setNewItemAutoBadge] = useState<boolean>(false);
  const [newItemEnableVideoPreview, setNewItemEnableVideoPreview] = useState<boolean>(false);
  const [newItemLogoFile, setNewItemLogoFile] = useState<File | null>(null);
  const [newItemLogoPreview, setNewItemLogoPreview] = useState<string | null>(null);
  const [newItemBackgroundFile, setNewItemBackgroundFile] = useState<File | null>(null);
  const [newItemBackgroundPreview, setNewItemBackgroundPreview] = useState<string | null>(null);
  const [newItemBackgroundFiles, setNewItemBackgroundFiles] = useState<File[]>([]); // Multiple background files
  const [newItemBackgroundPreviews, setNewItemBackgroundPreviews] = useState<string[]>([]); // Multiple background previews
  const [saving, setSaving] = useState(false);
  
  // Edit form file states (keyed by carousel item id)
  const [editLogoFiles, setEditLogoFiles] = useState<Record<string, File | null>>({});
  const [editLogoPreviews, setEditLogoPreviews] = useState<Record<string, string | null>>({});
  const [editBackgroundFiles, setEditBackgroundFiles] = useState<Record<string, File | null>>({});
  const [editBackgroundPreviews, setEditBackgroundPreviews] = useState<Record<string, string | null>>({});
  const [editBackgroundFilesMultiple, setEditBackgroundFilesMultiple] = useState<Record<string, File[]>>({});
  const [editBackgroundPreviewsMultiple, setEditBackgroundPreviewsMultiple] = useState<Record<string, string[]>>({});

  // Load carousel items and series
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [carouselResponse, seriesData] = await Promise.all([
        fetch('/api/admin/carousel/items', { credentials: 'include' }),
        seriesService.getAll(),
      ]);

      if (!carouselResponse.ok) {
        throw new Error('Failed to fetch carousel items');
      }

      const carouselData = await carouselResponse.json();
      setCarouselItems(carouselData.items || []);
      setAllSeries(seriesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers for new item
  const handleNewLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setNewItemLogoFile(file);
      setNewItemLogoPreview(URL.createObjectURL(file));
      setNewItemLogoUrl(""); // Clear URL input when file is selected
    }
  };

  const handleNewBackgroundDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      // Single file upload - clear multiple backgrounds
      if (files.length === 1) {
        setNewItemBackgroundFile(files[0]);
        setNewItemBackgroundPreview(URL.createObjectURL(files[0]));
        // Clear multiple backgrounds when single is uploaded
        setNewItemBackgroundFiles([]);
        setNewItemBackgroundPreviews([]);
      } else {
        // Multiple files - add to multiple backgrounds array
        setNewItemBackgroundFiles(prev => [...prev, ...files]);
        setNewItemBackgroundPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
        // Clear single background when multiple are uploaded
        setNewItemBackgroundFile(null);
        setNewItemBackgroundPreview(null);
      }
      setNewItemBackgroundUrl(""); // Clear URL input when files are selected
    }
  };

  const handleNewBackgroundMultipleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setNewItemBackgroundFiles(prev => [...prev, ...files]);
      setNewItemBackgroundPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // File upload handlers for new item
  const handleNewLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setNewItemLogoFile(file);
      setNewItemLogoPreview(URL.createObjectURL(file));
      setNewItemLogoUrl(""); // Clear URL input when file is selected
    }
  };

  const handleNewBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      // Single file upload - clear multiple backgrounds
      if (files.length === 1) {
        setNewItemBackgroundFile(files[0]);
        setNewItemBackgroundPreview(URL.createObjectURL(files[0]));
        // Clear multiple backgrounds when single is uploaded
        setNewItemBackgroundFiles([]);
        setNewItemBackgroundPreviews([]);
      } else {
        // Multiple files - add to multiple backgrounds array
        setNewItemBackgroundFiles(prev => [...prev, ...files]);
        setNewItemBackgroundPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
        // Clear single background when multiple are uploaded
        setNewItemBackgroundFile(null);
        setNewItemBackgroundPreview(null);
      }
      setNewItemBackgroundUrl(""); // Clear URL input when files are selected
    }
  };

  const handleNewBackgroundMultipleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setNewItemBackgroundFiles(prev => [...prev, ...files]);
      setNewItemBackgroundPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const removeNewBackgroundPreview = (index: number) => {
    setNewItemBackgroundPreviews(prev => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]);
      newPreviews.splice(index, 1);
      return newPreviews;
    });
    setNewItemBackgroundFiles(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  // Upload file to storage
  const uploadFile = async (file: File, type: 'logo' | 'background'): Promise<string | null> => {
    try {
      // Compress image before upload - use appropriate preset based on type
      const preset = type === 'logo' ? COMPRESSION_PRESETS.logo : COMPRESSION_PRESETS.banner;
      const compressedFile = await compressImage(file, preset);
      
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('bucket', 'thumbnails');
      formData.append('path', `carousel-${type}-${Date.now()}.${compressedFile.name.split('.').pop()}`);

      const uploadResponse = await fetch('/api/upload/thumbnail', {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.ok) {
        const { url } = await uploadResponse.json();
        return url;
      } else {
        console.error('Failed to upload file');
        return null;
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  const handleAddItem = async () => {
    if (!newItemSeriesId) {
      alert('Please select a series');
      return;
    }

    try {
      setSaving(true);
      
      // Upload logo if file is selected
      let logoUrl = newItemLogoUrl || null;
      if (newItemLogoFile) {
        const uploadedUrl = await uploadFile(newItemLogoFile, 'logo');
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
        } else {
          alert('Failed to upload logo. Please try again.');
          return;
        }
      }

      // Upload backgrounds - support both single (legacy) and multiple
      let backgroundUrls: string[] = [];
      
      // Upload single background file (legacy support)
      if (newItemBackgroundFile) {
        const uploadedUrl = await uploadFile(newItemBackgroundFile, 'background');
        if (uploadedUrl) {
          backgroundUrls.push(uploadedUrl);
        } else {
          alert('Failed to upload background. Please try again.');
          return;
        }
      }
      
      // Upload multiple background files
      if (newItemBackgroundFiles.length > 0) {
        const uploadPromises = newItemBackgroundFiles.map(file => uploadFile(file, 'background'));
        const uploadedUrls = await Promise.all(uploadPromises);
        const validUrls = uploadedUrls.filter((url): url is string => url !== null);
        if (validUrls.length !== newItemBackgroundFiles.length) {
          alert('Some backgrounds failed to upload. Please try again.');
          return;
        }
        backgroundUrls.push(...validUrls);
      }
      
      // Use URL input if no files were uploaded
      if (backgroundUrls.length === 0 && newItemBackgroundUrl) {
        backgroundUrls.push(newItemBackgroundUrl);
      }
      
      // Fallback to legacy background_url if no multiple backgrounds
      const backgroundUrl = backgroundUrls.length > 0 ? backgroundUrls[0] : (newItemBackgroundUrl || null);

      // Parse badges from comma-separated string
      const badgesArray = newItemBadges
        ? newItemBadges.split(',').map(b => b.trim()).filter(b => b.length > 0)
        : [];

      console.log('handleAddItem - Badges array:', badgesArray);

      // Check if selected series is daily content
      const selectedSeries = allSeries.find(s => s.id === newItemSeriesId);
      const isDailySeries = selectedSeries?.is_daily_content || false;

      const response = await fetch('/api/admin/carousel/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          series_id: newItemSeriesId,
          logo_url: logoUrl,
          subtitle: newItemSubtitle || null,
          background_url: backgroundUrl, // Keep for backward compatibility
          background_urls: backgroundUrls.length > 0 ? backgroundUrls : null,
          badges: badgesArray.length > 0 ? badgesArray : [],
          auto_badge_enabled: isDailySeries ? newItemAutoBadge : false,
          enable_video_preview: newItemEnableVideoPreview,
          is_active: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create carousel item');
      }

      // Reset form
      setNewItemSeriesId("");
      setNewItemLogoUrl("");
      setNewItemLogoFile(null);
      setNewItemLogoPreview(null);
      setNewItemSubtitle("");
      setNewItemBackgroundUrl("");
      setNewItemBackgroundFile(null);
      setNewItemBackgroundPreview(null);
      setNewItemBackgroundFiles([]);
      setNewItemBackgroundPreviews([]);
      setNewItemBadges("");
      setNewItemAutoBadge(false);
      setNewItemEnableVideoPreview(false);

      // Reload data
      await loadData();
    } catch (err) {
      console.error('Error adding carousel item:', err);
      alert(err instanceof Error ? err.message : 'Failed to add carousel item');
    } finally {
      setSaving(false);
    }
  };

  // Drag and drop handlers for edit form
  const handleEditLogoDrop = (itemId: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setEditLogoFiles(prev => ({ ...prev, [itemId]: file }));
      setEditLogoPreviews(prev => ({ ...prev, [itemId]: URL.createObjectURL(file) }));
    }
  };

  const handleEditBackgroundDrop = (itemId: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setEditBackgroundFiles(prev => ({ ...prev, [itemId]: file }));
      setEditBackgroundPreviews(prev => ({ ...prev, [itemId]: URL.createObjectURL(file) }));
    }
  };

  // File upload handlers for edit form
  const handleEditLogoUpload = (itemId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditLogoFiles(prev => ({ ...prev, [itemId]: file }));
      setEditLogoPreviews(prev => ({ ...prev, [itemId]: URL.createObjectURL(file) }));
    }
  };

  const handleEditBackgroundUpload = (itemId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditBackgroundFiles(prev => ({ ...prev, [itemId]: file }));
      setEditBackgroundPreviews(prev => ({ ...prev, [itemId]: URL.createObjectURL(file) }));
    }
  };

  const handleUpdateItemWithFiles = async (
    id: string, 
    updates: Partial<CarouselItem>,
    logoFile?: File | null,
    backgroundFile?: File | null,
    backgroundFilesMultiple?: File[]
  ) => {
    try {
      setSaving(true);
      
      // Upload logo if file is provided directly or from state
      const logoToUpload = logoFile || editLogoFiles[id];
      if (logoToUpload) {
        const uploadedUrl = await uploadFile(logoToUpload, 'logo');
        if (uploadedUrl) {
          updates.logo_url = uploadedUrl;
        } else {
          alert('Failed to upload logo. Please try again.');
          return;
        }
      }

      // Upload backgrounds - support both single (legacy) and multiple
      let backgroundUrls: string[] = [];
      
      // If a single background file is uploaded, it replaces all multiple backgrounds
      const singleBgToUpload = backgroundFile || editBackgroundFiles[id];
      if (singleBgToUpload) {
        const uploadedUrl = await uploadFile(singleBgToUpload, 'background');
        if (uploadedUrl) {
          // Single background upload - clear multiple backgrounds and use only this one
          backgroundUrls = [uploadedUrl];
          updates.background_url = uploadedUrl; // Keep for backward compatibility
          updates.background_urls = backgroundUrls; // Set to single item array
        } else {
          alert('Failed to upload background. Please try again.');
          return;
        }
      } else {
        // No single background upload - handle multiple backgrounds
        const multipleBgToUpload = backgroundFilesMultiple || editBackgroundFilesMultiple[id];
        if (multipleBgToUpload && multipleBgToUpload.length > 0) {
          // Upload new multiple background files
          const uploadPromises = multipleBgToUpload.map(file => uploadFile(file, 'background'));
          const uploadedUrls = await Promise.all(uploadPromises);
          const validUrls = uploadedUrls.filter((url): url is string => url !== null);
          if (validUrls.length !== multipleBgToUpload.length) {
            alert('Some backgrounds failed to upload. Please try again.');
            return;
          }
          backgroundUrls.push(...validUrls);
        }
        
        // If updates already has background_urls from EditForm (existing URLs that weren't deleted)
        if (updates.background_urls && Array.isArray(updates.background_urls)) {
          // Filter out blob URLs (these are new uploads that need to be uploaded)
          const existingUrls = updates.background_urls.filter((url: string) => !url.startsWith('blob:'));
          // Combine existing URLs with newly uploaded ones
          backgroundUrls = [...existingUrls, ...backgroundUrls];
        }
        
        // Set the final background_urls array
        if (backgroundUrls.length > 0) {
          updates.background_urls = backgroundUrls;
          // Also set background_url for backward compatibility (use first one)
          if (!updates.background_url) {
            updates.background_url = backgroundUrls[0];
          }
        } else {
          // No backgrounds at all - clear both
          updates.background_url = null;
          updates.background_urls = null;
        }
      }

      console.log('handleUpdateItemWithFiles - Sending updates:', updates);
      
      const response = await fetch(`/api/admin/carousel/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update carousel item');
      }

      // Clear file states for this item
      setEditLogoFiles(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setEditLogoPreviews(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setEditBackgroundFiles(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setEditBackgroundPreviews(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setEditBackgroundFilesMultiple(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setEditBackgroundPreviewsMultiple(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });

      await loadData();
      setEditingId(null);
    } catch (err) {
      console.error('Error updating carousel item:', err);
      alert(err instanceof Error ? err.message : 'Failed to update carousel item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this carousel item?')) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/admin/carousel/items/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete carousel item');
      }

      await loadData();
    } catch (err) {
      console.error('Error deleting carousel item:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete carousel item');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;

    const items = [...carouselItems];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];

    // Update sort orders
    const updatedItems = items.map((item, idx) => ({
      ...item,
      sort_order: idx,
    }));

    // Update all items
    try {
      setSaving(true);
      await Promise.all(
        updatedItems.map((item) =>
          fetch(`/api/admin/carousel/items/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sort_order: item.sort_order }),
          })
        )
      );

      await loadData();
    } catch (err) {
      console.error('Error reordering carousel items:', err);
      alert('Failed to reorder carousel items');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === carouselItems.length - 1) return;

    const items = [...carouselItems];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];

    // Update sort orders
    const updatedItems = items.map((item, idx) => ({
      ...item,
      sort_order: idx,
    }));

    // Update all items
    try {
      setSaving(true);
      await Promise.all(
        updatedItems.map((item) =>
          fetch(`/api/admin/carousel/items/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sort_order: item.sort_order }),
          })
        )
      );

      await loadData();
    } catch (err) {
      console.error('Error reordering carousel items:', err);
      alert('Failed to reorder carousel items');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4">
        <p className="text-red-200">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Carousel Management</h1>
      </div>

      {/* Add New Item Form */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Add New Carousel Item</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Upload Areas */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Series *</label>
              <select
                value={newItemSeriesId}
                onChange={(e) => setNewItemSeriesId(e.target.value)}
                className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 text-white"
              >
                <option value="">Select a series</option>
                {allSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">Logo (Optional)</label>
              <div
                className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-gray-500 transition-colors cursor-pointer h-24 flex flex-col items-center justify-center relative overflow-hidden"
                onDrop={handleNewLogoDrop}
                onDragOver={handleDragOver}
                onClick={() => document.getElementById('new-logo-upload')?.click()}
              >
                {newItemLogoPreview ? (
                  <Image
                    src={newItemLogoPreview}
                    alt="Logo preview"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <>
                    <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-300 text-xs">Drag & drop or click</p>
                  </>
                )}
                <input
                  id="new-logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleNewLogoUpload}
                  className="hidden"
                />
              </div>
              {newItemLogoPreview && (
                <button
                  onClick={() => {
                    setNewItemLogoFile(null);
                    setNewItemLogoPreview(null);
                  }}
                  className="mt-2 text-sm text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Background Upload - Single (Legacy) */}
            <div>
              <label className="block text-sm font-medium mb-2">Background (Optional - Single)</label>
              <div
                className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-gray-500 transition-colors cursor-pointer h-32 flex flex-col items-center justify-center relative overflow-hidden"
                onDrop={handleNewBackgroundDrop}
                onDragOver={handleDragOver}
                onClick={() => document.getElementById('new-background-upload')?.click()}
              >
                {newItemBackgroundPreview ? (
                  <Image
                    src={newItemBackgroundPreview}
                    alt="Background preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <>
                    <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-300 text-xs">Drag & drop or click</p>
                  </>
                )}
                <input
                  id="new-background-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleNewBackgroundUpload}
                  className="hidden"
                />
              </div>
              {newItemBackgroundPreview && (
                <button
                  onClick={() => {
                    setNewItemBackgroundFile(null);
                    setNewItemBackgroundPreview(null);
                  }}
                  className="mt-2 text-sm text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Multiple Backgrounds Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">Multiple Backgrounds (Optional - Rotates Daily)</label>
              <div
                className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-gray-500 transition-colors cursor-pointer min-h-32 flex flex-col items-center justify-center relative"
                onDrop={handleNewBackgroundMultipleDrop}
                onDragOver={handleDragOver}
                onClick={() => document.getElementById('new-background-multiple-upload')?.click()}
              >
                <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-300 text-xs mb-2">Drag & drop multiple images or click to select</p>
                <p className="text-gray-400 text-xs">Backgrounds will rotate randomly each day</p>
                <input
                  id="new-background-multiple-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleNewBackgroundMultipleUpload}
                  className="hidden"
                />
              </div>
              {newItemBackgroundPreviews.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-400">Uploaded backgrounds ({newItemBackgroundPreviews.length}):</p>
                  <div className="grid grid-cols-3 gap-2">
                    {newItemBackgroundPreviews.map((preview, index) => (
                      <div key={index} className="relative aspect-video rounded overflow-hidden border border-gray-700">
                        <Image
                          src={preview}
                          alt={`Background ${index + 1}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        <button
                          onClick={() => removeNewBackgroundPreview(index)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Text Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Subtitle</label>
              <textarea
                value={newItemSubtitle}
                onChange={(e) => setNewItemSubtitle(e.target.value)}
                placeholder="Override series description (optional)"
                rows={4}
                className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Badges</label>
              <input
                type="text"
                value={newItemBadges}
                onChange={(e) => setNewItemBadges(e.target.value)}
                placeholder="Comma-separated badges (e.g., New, Featured, Limited)"
                className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 text-white"
              />
              <p className="text-xs text-gray-400 mt-1">Enter badges separated by commas. They will appear as pill-shaped badges above the description.</p>
            </div>

            {/* Enable Video Preview */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="newItemEnableVideoPreview"
                checked={newItemEnableVideoPreview}
                onChange={(e) => setNewItemEnableVideoPreview(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="newItemEnableVideoPreview" className="text-sm text-gray-300">
                Enable video preview
              </label>
            </div>

            {/* Auto Badge for Daily Series */}
            {(() => {
              const selectedSeries = allSeries.find(s => s.id === newItemSeriesId);
              const isDailySeries = selectedSeries?.is_daily_content || false;
              return isDailySeries ? (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newItemAutoBadge}
                      onChange={(e) => setNewItemAutoBadge(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Enable auto-badge: "Today's reading (date)"</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1 ml-6">Automatically adds a badge showing today's reading date based on user's calendar preference.</p>
                </div>
              ) : null;
            })()}
          </div>
        </div>

        <button
          onClick={handleAddItem}
          disabled={saving || !newItemSeriesId}
          className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white"
        >
          {saving ? 'Adding...' : 'Add Carousel Item'}
        </button>
      </div>

      {/* Carousel Items List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Carousel Items ({carouselItems.length})</h2>

        {carouselItems.length === 0 ? (
          <p className="text-gray-400">No carousel items yet. Add one above to get started.</p>
        ) : (
          carouselItems.map((item, index) => (
            <div
              key={item.id}
              className={`bg-[#1a1a1a] rounded-lg p-6 border ${
                item.is_active ? 'border-gray-800' : 'border-gray-900 opacity-60'
              }`}
            >
              <div className="flex gap-4">
                {/* Preview */}
                <div className="flex-shrink-0">
                  <div className="w-32 h-20 bg-gray-800 rounded overflow-hidden">
                    {item.series.thumbnail_url ? (
                      <img
                        src={item.series.thumbnail_url}
                        alt={item.series.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                        No thumbnail
                      </div>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold">{item.series.title}</h3>
                      {!item.is_active && (
                        <span className="text-xs text-gray-400">(Inactive)</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0 || saving}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded text-sm"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === carouselItems.length - 1 || saving}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded text-sm"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                      >
                        {editingId === item.id ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={saving}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-800 disabled:cursor-not-allowed rounded text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingId === item.id ? (
                    <EditForm
                      item={item}
                      allSeries={allSeries}
                      onSave={async (updates, logoFile, backgroundFile, backgroundFilesMultiple) => {
                        // Store files in parent state for upload
                        if (logoFile) {
                          setEditLogoFiles(prev => ({ ...prev, [item.id]: logoFile }));
                        }
                        if (backgroundFile) {
                          setEditBackgroundFiles(prev => ({ ...prev, [item.id]: backgroundFile }));
                        }
                        if (backgroundFilesMultiple && backgroundFilesMultiple.length > 0) {
                          setEditBackgroundFilesMultiple(prev => ({ ...prev, [item.id]: backgroundFilesMultiple }));
                        }
                        // Pass files directly to handleUpdateItem to avoid state timing issues
                        await handleUpdateItemWithFiles(item.id, updates, logoFile, backgroundFile, backgroundFilesMultiple);
                      }}
                      onCancel={() => {
                        // Clear file states when canceling
                        setEditLogoFiles(prev => {
                          const newState = { ...prev };
                          delete newState[item.id];
                          return newState;
                        });
                        setEditBackgroundFiles(prev => {
                          const newState = { ...prev };
                          delete newState[item.id];
                          return newState;
                        });
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <div className="text-sm text-gray-400 space-y-1">
                      <p>
                        <strong>Subtitle:</strong>{' '}
                        {item.subtitle || item.series.description || 'None (using series default)'}
                      </p>
                      {item.badges && item.badges.length > 0 && (
                        <p>
                          <strong>Badges:</strong>{' '}
                          {item.badges.join(', ')}
                        </p>
                      )}
                      {item.series.is_daily_content && (
                        <p>
                          <strong>Auto-badge:</strong>{' '}
                          {item.auto_badge_enabled ? 'Enabled' : 'Disabled'}
                        </p>
                      )}
                      <p>
                        <strong>Logo:</strong>{' '}
                        {item.logo_url || item.series.logo_url || 'None (using series default)'}
                      </p>
                      <p>
                        <strong>Background:</strong>{' '}
                        {item.background_url || item.series.banner_url || 'None (using series default)'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface EditFormProps {
  item: CarouselItem;
  allSeries: Series[];
  onSave: (updates: Partial<CarouselItem>, logoFile?: File | null, backgroundFile?: File | null, backgroundFilesMultiple?: File[]) => void;
  onCancel: () => void;
}

function EditForm({ item, allSeries, onSave, onCancel }: EditFormProps) {
  const [seriesId, setSeriesId] = useState(item.series_id);
  const [subtitle, setSubtitle] = useState(item.subtitle || "");
  const [badges, setBadges] = useState<string>(item.badges ? item.badges.join(', ') : "");
  const [autoBadgeEnabled, setAutoBadgeEnabled] = useState<boolean>(item.auto_badge_enabled || false);
  const [enableVideoPreview, setEnableVideoPreview] = useState<boolean>(item.enable_video_preview || false);
  const [isActive, setIsActive] = useState(item.is_active);

  // Reset auto-badge when series changes to non-daily
  useEffect(() => {
    const selectedSeries = allSeries.find(s => s.id === seriesId);
    const isDailySeries = selectedSeries?.is_daily_content || false;
    if (!isDailySeries && autoBadgeEnabled) {
      setAutoBadgeEnabled(false);
    }
  }, [seriesId, allSeries, autoBadgeEnabled]);
  
  // These will be managed by the parent component
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [backgroundFilesMultiple, setBackgroundFilesMultiple] = useState<File[]>([]);
  const [backgroundPreviewsMultiple, setBackgroundPreviewsMultiple] = useState<string[]>(item.background_urls || []);

  // Load existing images on mount
  useEffect(() => {
    if (item.logo_url) {
      setLogoPreview(item.logo_url);
    }
    if (item.background_url) {
      setBackgroundPreview(item.background_url);
    }
  }, [item.logo_url, item.background_url]);

  const handleLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleBackgroundDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      // Single file upload - clear multiple backgrounds
      if (files.length === 1) {
        setBackgroundFile(files[0]);
        setBackgroundPreview(URL.createObjectURL(files[0]));
        // Clear multiple backgrounds when single is uploaded
        setBackgroundFilesMultiple([]);
        setBackgroundPreviewsMultiple([]);
      } else {
        // Multiple files - add to multiple backgrounds array
        setBackgroundFilesMultiple(prev => [...prev, ...files]);
        setBackgroundPreviewsMultiple(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
        // Clear single background when multiple are uploaded
        setBackgroundFile(null);
        setBackgroundPreview(null);
      }
    }
  };

  const handleBackgroundMultipleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setBackgroundFilesMultiple(prev => [...prev, ...files]);
      setBackgroundPreviewsMultiple(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      // Single file upload - clear multiple backgrounds
      if (files.length === 1) {
        setBackgroundFile(files[0]);
        setBackgroundPreview(URL.createObjectURL(files[0]));
        // Clear multiple backgrounds when single is uploaded
        setBackgroundFilesMultiple([]);
        setBackgroundPreviewsMultiple([]);
      } else {
        // Multiple files - add to multiple backgrounds array
        setBackgroundFilesMultiple(prev => [...prev, ...files]);
        setBackgroundPreviewsMultiple(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
        // Clear single background when multiple are uploaded
        setBackgroundFile(null);
        setBackgroundPreview(null);
      }
    }
  };

  const handleBackgroundMultipleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setBackgroundFilesMultiple(prev => [...prev, ...files]);
      setBackgroundPreviewsMultiple(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    }
  };

  const removeBackgroundPreview = (index: number) => {
    setBackgroundPreviewsMultiple(prev => {
      const newPreviews = [...prev];
      // Only revoke if it's a blob URL (not a stored URL)
      if (newPreviews[index]?.startsWith('blob:')) {
        URL.revokeObjectURL(newPreviews[index]);
      }
      newPreviews.splice(index, 1);
      return newPreviews;
    });
    setBackgroundFilesMultiple(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleSave = () => {
    // Parse badges from comma-separated string
    const badgesArray = badges
      ? badges.split(',').map(b => b.trim()).filter(b => b.length > 0)
      : [];

    // Check if selected series is daily content
    const selectedSeries = allSeries.find(s => s.id === seriesId);
    const isDailySeries = selectedSeries?.is_daily_content || false;

    const updates: any = {
      series_id: seriesId,
      subtitle: subtitle || null,
      badges: badgesArray.length > 0 ? badgesArray : [],
      auto_badge_enabled: isDailySeries ? autoBadgeEnabled : false,
      enable_video_preview: enableVideoPreview,
      is_active: isActive,
    };
    
    // Handle background_urls: if single background is uploaded, it replaces all
    // Otherwise, use the multiple backgrounds array (which may be empty if all were deleted)
    if (backgroundFile) {
      // Single background upload - will replace all multiple backgrounds in parent handler
      // Don't set background_urls here, let parent handle it
    } else {
      // No single background upload - use multiple backgrounds array
      // Filter out blob URLs (these are new files that need to be uploaded)
      const existingUrls = backgroundPreviewsMultiple.filter((url: string) => !url.startsWith('blob:'));
      updates.background_urls = existingUrls.length > 0 ? existingUrls : null;
    }
    
    console.log('EditForm - Saving with updates:', updates);
    
    // Pass files to parent for upload (including multiple background files)
    onSave(updates, logoFile, backgroundFile, backgroundFilesMultiple);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column - Upload Areas */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Series</label>
            <select
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
              className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 text-white"
            >
              {allSeries.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.title}
                </option>
              ))}
            </select>
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Logo (Optional)</label>
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-gray-500 transition-colors cursor-pointer h-24 flex flex-col items-center justify-center relative overflow-hidden"
              onDrop={handleLogoDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById(`edit-logo-upload-${item.id}`)?.click()}
            >
              {logoPreview ? (
                <Image
                  src={logoPreview}
                  alt="Logo preview"
                  fill
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <>
                  <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-300 text-xs">Drag & drop or click</p>
                </>
              )}
              <input
                id={`edit-logo-upload-${item.id}`}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
            {logoPreview && (
              <button
                onClick={() => {
                  setLogoFile(null);
                  setLogoPreview(item.logo_url || null);
                }}
                className="mt-2 text-sm text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>

          {/* Background Upload - Single (Legacy) */}
          <div>
            <label className="block text-sm font-medium mb-2">Background (Optional - Single)</label>
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-gray-500 transition-colors cursor-pointer h-32 flex flex-col items-center justify-center relative overflow-hidden"
              onDrop={handleBackgroundDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById(`edit-background-upload-${item.id}`)?.click()}
            >
              {backgroundPreview ? (
                <Image
                  src={backgroundPreview}
                  alt="Background preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <>
                  <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-300 text-xs">Drag & drop or click</p>
                </>
              )}
              <input
                id={`edit-background-upload-${item.id}`}
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
            </div>
            {backgroundPreview && (
              <button
                onClick={() => {
                  setBackgroundFile(null);
                  setBackgroundPreview(item.background_url || null);
                }}
                className="mt-2 text-sm text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>

          {/* Multiple Backgrounds Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Multiple Backgrounds (Optional - Rotates Daily)</label>
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-gray-500 transition-colors cursor-pointer min-h-32 flex flex-col items-center justify-center relative"
              onDrop={handleBackgroundMultipleDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById(`edit-background-multiple-upload-${item.id}`)?.click()}
            >
              <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-300 text-xs mb-2">Drag & drop multiple images or click to select</p>
              <p className="text-gray-400 text-xs">Backgrounds will rotate randomly each day</p>
              <input
                id={`edit-background-multiple-upload-${item.id}`}
                type="file"
                accept="image/*"
                multiple
                onChange={handleBackgroundMultipleUpload}
                className="hidden"
              />
            </div>
            {backgroundPreviewsMultiple.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-400">Current backgrounds ({backgroundPreviewsMultiple.length}):</p>
                <div className="grid grid-cols-3 gap-2">
                  {backgroundPreviewsMultiple.map((preview, index) => (
                    <div key={index} className="relative aspect-video rounded overflow-hidden border border-gray-700">
                      <Image
                        src={preview}
                        alt={`Background ${index + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <button
                        onClick={() => removeBackgroundPreview(index)}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Text Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Subtitle</label>
            <textarea
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Override series description (optional)"
              rows={4}
              className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Badges</label>
            <input
              type="text"
              value={badges}
              onChange={(e) => setBadges(e.target.value)}
              placeholder="Comma-separated badges (e.g., New, Featured, Limited)"
              className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 text-white"
            />
            <p className="text-xs text-gray-400 mt-1">Enter badges separated by commas. They will appear as pill-shaped badges above the description.</p>
          </div>

          {/* Enable Video Preview */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`enableVideoPreview-${item.id}`}
              checked={enableVideoPreview}
              onChange={(e) => setEnableVideoPreview(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor={`enableVideoPreview-${item.id}`} className="text-sm text-gray-300">
              Enable video preview
            </label>
          </div>

          {/* Auto Badge for Daily Series */}
          {(() => {
            const selectedSeries = allSeries.find(s => s.id === seriesId);
            const isDailySeries = selectedSeries?.is_daily_content || false;
            return isDailySeries ? (
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoBadgeEnabled}
                    onChange={(e) => setAutoBadgeEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Enable auto-badge: "Today's reading (date)"</span>
                </label>
                <p className="text-xs text-gray-400 mt-1 ml-6">Automatically adds a badge showing today's reading date based on user's calendar preference.</p>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Active</span>
        </label>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

