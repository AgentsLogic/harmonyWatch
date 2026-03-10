"use client";

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useContentItems } from '@/lib/hooks/useContentItems';
import { EditContentModal } from './edit-content-modal';
import { compressImage, COMPRESSION_PRESETS } from '@/lib/utils/image-compression';

interface Episode {
  id: string;
  title: string;
  thumbnail_url: string | null;
  new_calendar_date: string;
  old_calendar_date: string | null;
  content_type: 'video' | 'audio';
  duration: string | null;
}

interface DailyContentCalendarProps {
  seriesId: string;
  seriesTitle: string;
  onBack: () => void;
  onEditContent?: (contentId: string) => void;
}

export default function DailyContentCalendar({ seriesId, seriesTitle, onBack, onEditContent }: DailyContentCalendarProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editingContent, setEditingContent] = useState<any>(null);
  const [assigningDate, setAssigningDate] = useState<Date | null>(null);
  const [seriesContent, setSeriesContent] = useState<any[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const { series, getContentById, updateContent, deleteContent, updateSeries, getSeriesById, getSeriesContent } = useContentItems();
  
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

  // Fetch episodes for this series
  useEffect(() => {
    const fetchEpisodes = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/daily-content/${seriesId}/episodes`);
        if (response.ok) {
          const data = await response.json();
          setEpisodes(data.episodes || []);
        }
      } catch (error) {
        console.error('Failed to fetch episodes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEpisodes();
  }, [seriesId]);

  // Fetch series content when assigning
  useEffect(() => {
    const fetchSeriesContent = async () => {
      if (assigningDate) {
        try {
          const content = await getSeriesContent(seriesId);
          // Filter out content that already has a calendar date assigned
          const availableContent = content.filter(item => !item.new_calendar_date);
          setSeriesContent(availableContent);
        } catch (error) {
          console.error('Failed to fetch series content:', error);
          setSeriesContent([]);
        }
      }
    };

    fetchSeriesContent();
  }, [assigningDate, seriesId, getSeriesContent]);

  // Create a map of date -> episode for quick lookup
  const episodesByDate = useMemo(() => {
    const map = new Map<string, Episode>();
    episodes.forEach(episode => {
      if (episode.new_calendar_date) {
        map.set(episode.new_calendar_date, episode);
      }
    });
    return map;
  }, [episodes]);

  // Get calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay();
    
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const days: Array<{ date: Date; episode: Episode | null }> = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ date: new Date(year, month, -firstDayOfWeek + i + 1), episode: null });
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const episode = episodesByDate.get(dateStr) || null;
      days.push({ date, episode });
    }
    
    return days;
  }, [currentDate, episodesByDate]);

  const handleEpisodeClick = async (episode: Episode) => {
    // Open the edit content modal
    try {
      const contentData = await getContentById(episode.id);
      if (contentData) {
        console.log('[Daily Content Calendar] Edit Content - Loaded content data:', {
          id: contentData.id,
          title: contentData.title,
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
        
        console.log('[Daily Content Calendar] Setting editFormData tags:', {
          tagsRaw: contentData.tags,
          tagsString: tagsString
        });
        
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

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleRemoveFromDay = async (episode: Episode, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening edit modal
    
    if (confirm(`Remove "${episode.title}" from this day?`)) {
      try {
        const success = await updateContent(episode.id, {
          new_calendar_date: null,
          old_calendar_date: null
        });
        
        if (success) {
          // Refresh episodes
          const response = await fetch(`/api/admin/daily-content/${seriesId}/episodes`);
          if (response.ok) {
            const data = await response.json();
            setEpisodes(data.episodes || []);
          }
        }
      } catch (error) {
        console.error('Failed to remove content from day:', error);
      }
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{seriesTitle}</h1>
            <p className="text-gray-400 text-sm">Daily Content Calendar</p>
          </div>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button
            onClick={goToToday}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Today
          </button>
        </div>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {dayNames.map(day => (
            <div key={day} className="text-center text-gray-400 text-sm font-medium py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((day, index) => {
            const isCurrentMonth = day.date.getMonth() === currentDate.getMonth();
            const isToday = day.date.toDateString() === new Date().toDateString();
            const hasEpisode = day.episode !== null;

            return (
              <div
                key={index}
                className={`
                  min-h-[100px] rounded-lg border transition-colors
                  ${isCurrentMonth ? 'bg-[#0a0a0a] border-gray-700' : 'bg-[#050505] border-gray-800 opacity-50'}
                  ${isToday ? 'ring-2 ring-blue-500' : ''}
                  ${isCurrentMonth ? 'cursor-pointer hover:border-blue-500 hover:bg-[#121212]' : ''}
                `}
                onClick={() => {
                  if (hasEpisode && day.episode) {
                    handleEpisodeClick(day.episode);
                  } else if (isCurrentMonth) {
                    // Open assign content modal for blank days
                    setAssigningDate(day.date);
                  }
                }}
              >
                <div className="p-2">
                  <div className={`
                    text-sm font-medium mb-1
                    ${isCurrentMonth ? 'text-white' : 'text-gray-600'}
                    ${isToday ? 'text-blue-400' : ''}
                  `}>
                    {day.date.getDate()}
                  </div>
                  
                  {hasEpisode && day.episode && (
                    <div className="space-y-1 group relative">
                      <div className="relative w-full aspect-video rounded overflow-hidden">
                        <Image
                          src={day.episode.thumbnail_url || '/images/content-1.png'}
                          alt={day.episode.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        {/* Remove icon - appears on hover */}
                        <button
                          onClick={(e) => handleRemoveFromDay(day.episode!, e)}
                          className="absolute top-1 right-1 p-1.5 bg-red-600/90 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Remove from this day"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-xs text-gray-300 truncate" title={day.episode.title}>
                        {day.episode.title}
                      </p>
                      {day.episode.duration && (
                        <p className="text-xs text-gray-500">{day.episode.duration}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Episode Count */}
      <div className="text-center text-gray-400 text-sm">
        {episodes.length} episode{episodes.length !== 1 ? 's' : ''} scheduled
      </div>

      {/* Assign Content Modal */}
      {assigningDate && (
        <AssignContentModal
          date={assigningDate}
          seriesContent={seriesContent}
          loading={assignLoading}
          onClose={() => {
            setAssigningDate(null);
            setSeriesContent([]);
          }}
          onAssign={async (contentId: string) => {
            setAssignLoading(true);
            try {
              const dateStr = `${assigningDate.getFullYear()}-${String(assigningDate.getMonth() + 1).padStart(2, '0')}-${String(assigningDate.getDate()).padStart(2, '0')}`;
              
              // Parse date string directly to avoid timezone issues
              const [year, month, day] = dateStr.split('-').map(Number);
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
              
              const newCalendarDate = formatDate(selectedDate);
              const oldCalendarDate = formatDate(oldDate);
              
              const success = await updateContent(contentId, {
                new_calendar_date: newCalendarDate,
                old_calendar_date: oldCalendarDate
              });
              
              if (success) {
                // Refresh episodes
                const response = await fetch(`/api/admin/daily-content/${seriesId}/episodes`);
                if (response.ok) {
                  const data = await response.json();
                  setEpisodes(data.episodes || []);
                }
                setAssigningDate(null);
                setSeriesContent([]);
              }
            } catch (error) {
              console.error('Failed to assign content:', error);
            } finally {
              setAssignLoading(false);
            }
          }}
        />
      )}

      {/* Edit Content Modal Overlay */}
      {editingContent && (
        <EditContentModal
          editingContent={editingContent}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          series={series}
          onClose={() => {
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
          }}
          onSave={async () => {
            if (!editingContent) return;

            try {
              const tagsArray = editFormData.tags ? editFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
              
              console.log('[Daily Content Calendar] Saving tags:', {
                tagsString: editFormData.tags,
                tagsArray: tagsArray,
                tagsArrayLength: tagsArray.length
              });
              
              let thumbnailUrl = editingContent.thumbnail_url;
              
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
                }
              }
              
              let newCalendarDate: string | null = null;
              let oldCalendarDate: string | null = null;
              
              if (editFormData.dailyEpisodeDate) {
                newCalendarDate = editFormData.dailyEpisodeDate;
                const [year, month, day] = editFormData.dailyEpisodeDate.split('-').map(Number);
                const oldDate = new Date(year, month - 1, day - 13);
                const formatDate = (date: Date) => {
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, '0');
                  const d = String(date.getDate()).padStart(2, '0');
                  return `${y}-${m}-${d}`;
                };
                oldCalendarDate = formatDate(oldDate);
              }

              const saintsData = await Promise.all(
                editFormData.saints.map(async (saint) => {
                  let pictureUrl = saint.pictureUrl || null;
                  
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
              
              const updates: any = {
                title: editFormData.title,
                description: editFormData.description,
                content_type: editFormData.contentType,
                rating: editFormData.rating,
                // Ensure tags is always an array (Supabase TEXT[] expects array, not null)
                tags: Array.isArray(tagsArray) && tagsArray.length > 0 ? tagsArray : [],
                thumbnail_url: thumbnailUrl,
                updated_at: new Date().toISOString(),
                ...(newCalendarDate && { new_calendar_date: newCalendarDate }),
                ...(oldCalendarDate && { old_calendar_date: oldCalendarDate }),
                saints: saintsData.length > 0 ? saintsData : null
              };

              const success = await updateContent(editingContent.id, updates);
              
              if (success && editFormData.seriesId) {
                try {
                  const newSeries = await getSeriesById(editFormData.seriesId);
                  if (newSeries) {
                    const currentContentIds = newSeries.content_ids || [];
                    if (!currentContentIds.includes(editingContent.id)) {
                      await updateSeries(editFormData.seriesId, {
                        content_ids: [...currentContentIds, editingContent.id]
                      });
                    }
                  }
                } catch (error) {
                  console.error('Failed to update series relationship:', error);
                }
              }
              
              if (success) {
                for (const s of series) {
                  if (s.content_ids && s.content_ids.includes(editingContent.id)) {
                    if (s.id !== editFormData.seriesId) {
                      const updatedContentIds = s.content_ids.filter(id => id !== editingContent.id);
                      await updateSeries(s.id, {
                        content_ids: updatedContentIds
                      });
                    }
                  }
                }
                
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
                
                // Refresh episodes
                const response = await fetch(`/api/admin/daily-content/${seriesId}/episodes`);
                if (response.ok) {
                  const data = await response.json();
                  setEpisodes(data.episodes || []);
                }
              }
            } catch (error) {
              console.error('Failed to save content:', error);
            }
          }}
          onDelete={async () => {
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
                  
                  // Refresh episodes
                  const response = await fetch(`/api/admin/daily-content/${seriesId}/episodes`);
                  if (response.ok) {
                    const data = await response.json();
                    setEpisodes(data.episodes || []);
                  }
                }
              } catch (error) {
                console.error('Failed to delete content:', error);
              }
            }
          }}
        />
      )}
    </div>
  );
}

// Assign Content Modal Component
function AssignContentModal({
  date,
  seriesContent,
  loading,
  onClose,
  onAssign
}: {
  date: Date;
  seriesContent: any[];
  loading: boolean;
  onClose: () => void;
  onAssign: (contentId: string) => void;
}) {
  const [selectedContentId, setSelectedContentId] = useState<string>('');

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#242424] rounded-lg p-8 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-2">Assign Content to Date</h2>
        <p className="text-gray-400 text-sm mb-6">{formatDate(date)}</p>
        
        {seriesContent.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">No available content to assign.</p>
            <p className="text-gray-500 text-sm">All content in this series already has calendar dates assigned.</p>
          </div>
        ) : (
          <>
            {/* Content Selection */}
            <div className="mb-6">
              <label className="block text-white text-sm font-medium mb-3">Select Content</label>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {seriesContent.map((content) => (
                  <button
                    key={content.id}
                    onClick={() => setSelectedContentId(content.id)}
                    className={`w-full p-4 rounded-lg border transition-colors text-left ${
                      selectedContentId === content.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 bg-[#1a1a1a] hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20 rounded overflow-hidden flex-shrink-0">
                        <Image
                          src={content.thumbnail_url || '/images/content-1.png'}
                          alt={content.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium mb-1 truncate">{content.title}</h3>
                        {content.description && (
                          <p className="text-gray-400 text-sm line-clamp-2">{content.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            content.content_type === 'video' 
                              ? 'bg-blue-600/20 text-blue-400' 
                              : 'bg-orange-600/20 text-orange-400'
                          }`}>
                            {content.content_type}
                          </span>
                          {content.duration && (
                            <span className="text-gray-500 text-xs">{content.duration}</span>
                          )}
                          {content.tags && Array.isArray(content.tags) && content.tags.length > 0 && (
                            <span className="text-gray-400 text-xs">
                              {content.tags.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedContentId === content.id && (
                        <div className="flex-shrink-0">
                          <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-6 py-2.5 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors border border-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedContentId && onAssign(selectedContentId)}
                disabled={!selectedContentId || loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Assigning...' : 'Assign to Date'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

