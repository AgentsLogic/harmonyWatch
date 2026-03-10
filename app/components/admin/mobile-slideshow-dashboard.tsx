"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { compressImage, COMPRESSION_PRESETS } from "@/lib/utils/image-compression";
import { HarmonySpinner } from "../harmony-spinner";

interface SlideshowImage {
  id: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function MobileSlideshowDashboard() {
  const [images, setImages] = useState<SlideshowImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(7);
  const [durationLoading, setDurationLoading] = useState(true);
  const [durationSaving, setDurationSaving] = useState(false);

  // Load images
  const loadImages = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/mobile-landing-slideshow', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load images');
      }

      const data = await response.json();
      setImages(data.images || []);
    } catch (err) {
      console.error('Error loading images:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  // Load duration setting
  const loadDuration = async () => {
    try {
      setDurationLoading(true);
      const response = await fetch('/api/landing-content?key=mobile_slideshow_duration', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.content?.content) {
          const parsed = parseInt(data.content.content, 10);
          if (!isNaN(parsed) && parsed > 0) {
            setDuration(parsed);
          }
        }
      }
    } catch (err) {
      console.error('Error loading duration:', err);
    } finally {
      setDurationLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
    loadDuration();
  }, []);

  // Upload file to storage
  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      // Compress image before upload
      const compressedFile = await compressImage(file, COMPRESSION_PRESETS.banner);
      
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('bucket', 'thumbnails');
      formData.append('path', `mobile-slideshow-${Date.now()}.${compressedFile.name.split('.').pop()}`);

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

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      // Upload to storage
      const imageUrl = await uploadFile(file);
      if (!imageUrl) {
        throw new Error('Failed to upload image');
      }

      // Create database record
      const response = await fetch('/api/admin/mobile-landing-slideshow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          image_url: imageUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save image');
      }

      // Reload images
      await loadImages();
      
      // Reset file input
      e.target.value = '';
    } catch (err) {
      console.error('Error uploading image:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/mobile-landing-slideshow/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          is_active: !currentActive,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update image');
      }

      await loadImages();
    } catch (err) {
      console.error('Error toggling active:', err);
      setError(err instanceof Error ? err.message : 'Failed to update image');
    } finally {
      setSaving(false);
    }
  };

  // Reorder images
  const handleReorder = async (id: string, newSortOrder: number) => {
    try {
      const response = await fetch(`/api/admin/mobile-landing-slideshow/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sort_order: newSortOrder,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder image');
      }

      await loadImages();
    } catch (err) {
      console.error('Error reordering image:', err);
      setError(err instanceof Error ? err.message : 'Failed to reorder image');
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const item = images[index];
    const prevItem = images[index - 1];
    handleReorder(item.id, prevItem.sort_order);
    handleReorder(prevItem.id, item.sort_order);
  };

  const handleMoveDown = (index: number) => {
    if (index === images.length - 1) return;
    const item = images[index];
    const nextItem = images[index + 1];
    handleReorder(item.id, nextItem.sort_order);
    handleReorder(nextItem.id, item.sort_order);
  };

  // Delete image
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this image?')) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/admin/mobile-landing-slideshow/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete image');
      }

      await loadImages();
    } catch (err) {
      console.error('Error deleting image:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete image');
    } finally {
      setSaving(false);
    }
  };

  // Save duration
  const handleSaveDuration = async () => {
    if (duration < 1 || duration > 30) {
      setError('Duration must be between 1 and 30 seconds');
      return;
    }

    try {
      setDurationSaving(true);
      setError(null);

      const response = await fetch('/api/landing-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          content_key: 'mobile_slideshow_duration',
          title: 'Mobile Slideshow Duration',
          content: duration.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save duration');
      }
    } catch (err) {
      console.error('Error saving duration:', err);
      setError(err instanceof Error ? err.message : 'Failed to save duration');
    } finally {
      setDurationSaving(false);
    }
  };

  if (loading || durationLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HarmonySpinner size={48} />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-6">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Duration Setting */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 mb-6">
        <h2 className="text-lg font-semibold mb-4">Slideshow Duration</h2>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-2">
              Duration (seconds): {duration}
            </label>
            <input
              type="range"
              min="1"
              max="30"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1s</span>
              <span>30s</span>
            </div>
          </div>
          <button
            onClick={handleSaveDuration}
            disabled={durationSaving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {durationSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 mb-6">
        <h2 className="text-lg font-semibold mb-4">Upload Image</h2>
        <div className="flex gap-4 items-center">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {uploading && (
            <div className="flex items-center gap-2 text-gray-400">
              <HarmonySpinner size={20} />
              <span>Uploading...</span>
            </div>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-2">
          Images will be automatically compressed before upload.
        </p>
      </div>

      {/* Image List */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">
          Slideshow Images ({images.length})
        </h2>
        
        {images.length === 0 ? (
          <p className="text-gray-400">
            No images uploaded. Upload images to create the slideshow.
          </p>
        ) : (
          <div className="space-y-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className="bg-[#0a0a0a] rounded-lg p-4 border border-gray-700 flex items-center gap-4"
              >
                {/* Reorder Buttons */}
                <div className="flex-shrink-0 flex gap-2">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || saving}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === images.length - 1 || saving}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
                
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-32 h-20 bg-gray-800 rounded overflow-hidden relative">
                  <Image
                    src={image.image_url}
                    alt={`Slideshow image ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                
                {/* Image Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-400 text-sm truncate">
                    {image.image_url.split('/').pop()}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Order: {image.sort_order}
                  </p>
                </div>
                
                {/* Toggle Active */}
                <button
                  onClick={() => handleToggleActive(image.id, image.is_active)}
                  disabled={saving}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    image.is_active
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  {image.is_active ? 'Active' : 'Inactive'}
                </button>
                
                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(image.id)}
                  disabled={saving}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
