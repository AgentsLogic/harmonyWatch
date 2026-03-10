"use client";

import Image from 'next/image';
import { cropThumbnailForContent } from "@/lib/utils/image-crop";

interface EditContentModalProps {
  editingContent: any;
  editFormData: {
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
  };
  setEditFormData: (data: any) => void;
  series: any[];
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function EditContentModal({
  editingContent,
  editFormData,
  setEditFormData,
  series,
  onClose,
  onSave,
  onDelete
}: EditContentModalProps) {
  const handleEditContentThumbnailUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Crop image based on content type
        const contentType = editingContent?.content_type || editFormData.contentType || 'video';
        const croppedFile = await cropThumbnailForContent(file, contentType);
        
        setEditFormData((prev: any) => ({
          ...prev,
          thumbnailFile: croppedFile,
          thumbnailPreview: URL.createObjectURL(croppedFile)
        }));
      } catch (error) {
        console.error('Failed to crop thumbnail:', error);
        // Fallback to original file if cropping fails
        setEditFormData((prev: any) => ({
          ...prev,
          thumbnailFile: file,
          thumbnailPreview: URL.createObjectURL(file)
        }));
      }
    }
  };

  const handleEditContentThumbnailDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      try {
        // Crop image based on content type
        const contentType = editingContent?.content_type || editFormData.contentType || 'video';
        const croppedFile = await cropThumbnailForContent(file, contentType);
        
        setEditFormData((prev: any) => ({
          ...prev,
          thumbnailFile: croppedFile,
          thumbnailPreview: URL.createObjectURL(croppedFile)
        }));
      } catch (error) {
        console.error('Failed to crop thumbnail:', error);
        // Fallback to original file if cropping fails
        setEditFormData((prev: any) => ({
          ...prev,
          thumbnailFile: file,
          thumbnailPreview: URL.createObjectURL(file)
        }));
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-6xl mx-4 max-h-[85vh] overflow-y-auto">
        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-6">Edit Content</h2>
        
        {/* Form - Two Column Layout */}
        <div className="grid grid-cols-2 gap-8">
          {/* Left Column - Upload Areas */}
          <div className="space-y-6">
            {/* Content Type - Display Only */}
            <div>
              <label className="block text-white text-sm font-medium mb-3">Content Type</label>
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  editingContent.content_type === 'video' ? 'bg-blue-600' : 'bg-orange-600'
                }`}>
                  {editingContent.content_type === 'video' ? (
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  ) : (
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  )}
                </div>
                <span className="text-gray-300 capitalize">{editingContent.content_type}</span>
              </div>
            </div>

            {/* Content Display Area */}
            <div>
              <label className="block text-white text-sm font-medium mb-3">Content File</label>
              <div className="border border-gray-600 rounded-lg p-4 h-64 flex flex-col items-center justify-center relative overflow-hidden bg-gray-800">
                {editingContent.content_type === 'video' && editingContent.mux_playback_id ? (
                  // Show Mux video
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-red-600 rounded-lg flex items-center justify-center mb-3">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <p className="text-white font-medium mb-1">Mux Video</p>
                    <p className="text-gray-400 text-sm mb-2">Playback ID: {editingContent.mux_playback_id}</p>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                        Ready
                      </span>
                    </div>
                  </div>
                ) : editingContent.content_type === 'video' ? (
                  // Show regular video file
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-purple-600 rounded-lg flex items-center justify-center mb-3">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <p className="text-white font-medium mb-1">Video File</p>
                    <p className="text-gray-400 text-sm">Standard video content</p>
                  </div>
                ) : (
                  // Show audio file
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    {(editingContent.mux_playback_id || editingContent.mux_asset_id) ? (
                      // Show Mux audio
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-orange-600 rounded-lg flex items-center justify-center mb-3">
                          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                        <p className="text-white font-medium mb-1">Mux Audio</p>
                        <p className="text-gray-400 text-sm mb-2">
                          {editingContent.original_filename || 'No filename available'}
                        </p>
                        <div className="flex gap-2">
                          <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                            Ready
                          </span>
                        </div>
                      </div>
                    ) : editingContent.content_url ? (
                      // Show actual audio file with player
                      <div className="w-full max-w-sm">
                        <div className="w-16 h-16 bg-orange-600 rounded-lg flex items-center justify-center mb-3 mx-auto">
                          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                        <p className="text-white font-medium mb-2 text-center">Audio File</p>
                        <audio
                          src={editingContent.content_url}
                          controls
                          className="w-full mb-2"
                        />
                        <p className="text-gray-400 text-xs text-center break-all">
                          {editingContent.content_url.split('/').pop()}
                        </p>
                      </div>
                    ) : (
                      // Show generic audio icon if no file
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-orange-600 rounded-lg flex items-center justify-center mb-3">
                          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                        <p className="text-white font-medium mb-1">Audio File</p>
                        <p className="text-gray-400 text-sm">No audio file uploaded</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Thumbnail Upload */}
            <div>
              <label className="block text-white text-sm font-medium mb-3">Content Thumbnail</label>
              <div 
                className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer h-48 flex flex-col items-center justify-center relative overflow-hidden"
                onDrop={handleEditContentThumbnailDrop}
                onDragOver={handleDragOver}
                onClick={() => document.getElementById('edit-content-thumbnail-upload')?.click()}
              >
                {(editFormData.thumbnailPreview || editingContent.thumbnail_url) && (
                  <Image
                    src={editFormData.thumbnailPreview || editingContent.thumbnail_url}
                    alt={editingContent.title}
                    width={192}
                    height={192}
                    className="absolute inset-0 w-full h-full object-cover"
                    unoptimized
                  />
                )}
                <div className="relative z-10 bg-black/50 rounded-lg px-4 py-2">
                  <svg className="w-8 h-8 text-white mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-white text-xs font-medium">Change thumbnail</p>
                </div>
                <input
                  id="edit-content-thumbnail-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleEditContentThumbnailUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-white text-sm font-medium mb-1.5">Title</label>
              <input
                type="text"
                value={editFormData.title}
                onChange={(e) => setEditFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                placeholder="Enter content title"
                className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-white text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={editFormData.description}
                onChange={(e) => setEditFormData((prev: any) => ({ ...prev, description: e.target.value }))}
                placeholder="Enter content description"
                rows={3}
                className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 resize-none transition-colors"
              />
            </div>

            {/* Daily Episode Date - Only show if selected series is daily content */}
            {editFormData.seriesId && (() => {
              const selectedSeries = series.find(s => s.id === editFormData.seriesId);
              const isDailySeries = selectedSeries && (selectedSeries as any).is_daily_content === true;
              
              return isDailySeries ? (
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Daily Episode Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={editFormData.dailyEpisodeDate || ''}
                      onChange={(e) => {
                        const selectedDate = e.target.value;
                        setEditFormData((prev: any) => ({ ...prev, dailyEpisodeDate: selectedDate || null }));
                      }}
                      className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                      onClick={(e) => {
                        // Ensure the entire input is clickable
                        e.currentTarget.showPicker?.();
                      }}
                    />
                  </div>
                  {editFormData.dailyEpisodeDate && (() => {
                    // Parse date string directly to avoid timezone issues
                    const [year, month, day] = editFormData.dailyEpisodeDate.split('-').map(Number);
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
                <label className="block text-white text-sm font-medium mb-1.5">Rating</label>
                <div className="relative">
                  <select 
                    value={editFormData.rating}
                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, rating: e.target.value }))}
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

              {/* Series Selection */}
              <div>
                <label className="block text-white text-sm font-medium mb-1.5">Series</label>
                <div className="relative">
                  <select 
                    value={editFormData.seriesId}
                    onChange={(e) => {
                      const newSeriesId = e.target.value;
                      // Reset dailyEpisodeDate when series changes (unless it's still a daily series)
                      const newSeries = series.find(s => s.id === newSeriesId);
                      const isStillDailySeries = newSeries && (newSeries as any).is_daily_content === true;
                      setEditFormData((prev: any) => ({ 
                        ...prev, 
                        seriesId: newSeriesId,
                        // Only reset if the new series is not a daily series
                        dailyEpisodeDate: isStillDailySeries ? prev.dailyEpisodeDate : null
                      }));
                    }}
                    className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 appearance-none transition-colors"
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

            {/* Free Episode Toggle - Only show if parent series is premium */}
            {editFormData.seriesId && (() => {
              const selectedSeries = series.find(s => s.id === editFormData.seriesId);
              const isParentSeriesPremium = selectedSeries ? (selectedSeries as any).is_premium !== undefined ? (selectedSeries as any).is_premium : true : false;
              
              if (isParentSeriesPremium) {
                return (
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.isFreeEpisode}
                        onChange={(e) => setEditFormData((prev: any) => ({ ...prev, isFreeEpisode: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white text-sm font-medium">Free Episode</span>
                    </label>
                    <p className="text-gray-400 text-xs mt-1 ml-6">
                      Allow free users to watch this episode even though the series is premium
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            {/* Tags */}
            <div>
              <label className="block text-white text-sm font-medium mb-1.5">Tags</label>
              <input
                type="text"
                value={editFormData.tags}
                onChange={(e) => setEditFormData((prev: any) => ({ ...prev, tags: e.target.value }))}
                placeholder="drama, action"
                className="w-full bg-[#1a1a1a] text-white px-4 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
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
                    setEditFormData((prev: any) => ({
                      ...prev,
                      saints: [...prev.saints, newSaint]
                    }));
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
                >
                  + Add Saint
                </button>
              </div>
              
              {editFormData.saints && editFormData.saints.length > 0 && (
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {editFormData.saints.map((saint: any, index: number) => (
                    <div key={saint.id} className="bg-[#1a1a1a] border border-gray-700 rounded-md p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white text-sm font-medium">Saint {index + 1}</h4>
                        <button
                          type="button"
                          onClick={() => {
                            setEditFormData((prev: any) => ({
                              ...prev,
                              saints: prev.saints.filter((s: any) => s.id !== saint.id)
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
                            setEditFormData((prev: any) => ({
                              ...prev,
                              saints: prev.saints.map((s: any) => 
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
                                setEditFormData((prev: any) => ({
                                  ...prev,
                                  saints: prev.saints.map((s: any) => 
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
                              const input = document.getElementById(`edit-saint-picture-${saint.id}`) as HTMLInputElement;
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
                            id={`edit-saint-picture-${saint.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setEditFormData((prev: any) => ({
                                  ...prev,
                                  saints: prev.saints.map((s: any) => 
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
                            setEditFormData((prev: any) => ({
                              ...prev,
                              saints: prev.saints.map((s: any) => 
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
              
              {(!editFormData.saints || editFormData.saints.length === 0) && (
                <p className="text-gray-500 text-xs">No saints added. Click "Add Saint" to add one.</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between gap-3 pt-2">
              <button
                onClick={onDelete}
                className="px-6 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors shadow-lg"
              >
                Delete Content
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors border border-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={onSave}
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
  );
}

