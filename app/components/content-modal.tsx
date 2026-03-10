"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MediaItem } from "../lib/data";
import { useContentItems } from "../../lib/hooks/useContentItems";
import { useAudioPlayer } from "./audio-player-provider";
import { useLoading } from "../contexts/loading-context";
import { useUser } from "../contexts/user-context";
import { PremiumBadge } from "./premium-badge";
import { canUserAccessContent } from "../../lib/utils/premium-access";
import { useModal } from "../contexts/modal-context";
import { BaseModal } from "./base-modal";
import { seriesService, contentItemsService } from "../../lib/database";
import type { ContentItem } from "../../lib/hooks/useContentItems";
import { useCalendarPreference } from "../../lib/hooks/useCalendarPreference";
import { parseLocalDate, formatDateForDisplay, adjustDateForOldCalendar, getTodayDateString } from "../../lib/utils/date-helpers";
import MuxVideo from '@mux/mux-video-react';
import { usePreviewMute } from "@/app/hooks/usePreviewMute";

type Props = {
  item: MediaItem | null;
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  sourcePosition?: { x: number; y: number; width: number; height: number } | null;
  isAnimatingClose?: boolean;
};

type Episode = {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
  contentUrl?: string; // Legacy audio/video file URL
  muxPlaybackId?: string; // Mux playback ID
  contentType?: 'video' | 'audio';
  calendarDate?: string; // new_calendar_date for daily content
  isFreeEpisode?: boolean; // Whether this episode is free (overrides series premium status)
  shortId?: string; // Short ID for URL navigation
};

export function ContentModal({ item, isOpen, onClose, sourcePosition, isAnimatingClose = false }: Props) {
  const [selectedSeason, setSelectedSeason] = useState("Season 1");
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { isMuted: isPreviewMuted, toggleMute: togglePreviewMute } = usePreviewMute();
  
  // Stop carousel preview when content modal opens
  useEffect(() => {
    if (isOpen) {
      window.dispatchEvent(new CustomEvent('harmonywatch_stop_carousel_preview'));
    }
  }, [isOpen]);
  // Keep isMuted for banner video (non-preview)
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('videoMuted');
      return stored === 'true';
    }
    return false;
  });
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [todayEpisodeId, setTodayEpisodeId] = useState<string | null>(null);
  const [currentSeries, setCurrentSeries] = useState<any>(null);
  const { calendarType, updatePreference, isLoading: isLoadingCalendarPreference } = useCalendarPreference(); // Load from database
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // Initialize to current month (YYYY-MM format)
    // Will be adjusted when calendarType loads
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [allSortedEpisodes, setAllSortedEpisodes] = useState<ContentItem[]>([]); // Store all episodes for month filtering
  const [hoveredEpisodeId, setHoveredEpisodeId] = useState<string | null>(null); // Track which episode is being hovered
  
  // Helper to check if URL is a video file
  const isVideoUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov)$/i.test(url);
  };
  const [scrollY, setScrollY] = useState(0); // Track scroll position for parallax
  const [hasDragged, setHasDragged] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [showPreviewVideo, setShowPreviewVideo] = useState(false);
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previewTimeUpdateRef = useRef<((e: Event) => void) | null>(null);
  const previewPlayHandlerRef = useRef<((e: Event) => void) | null>(null);
  const previewPauseHandlerRef = useRef<((e: Event) => void) | null>(null);
  const previewEndedHandlerRef = useRef<((e: Event) => void) | null>(null);
  const previewStartTimeRef = useRef<number | null>(null); // Track when preview video started playing
  
  // Get content items hook
  const { getSeriesContent } = useContentItems();
  
  // Get audio player context
  const { setIsVisible: setAudioPlayerVisible, setCurrentContent, isExpanded } = useAudioPlayer();
  
  // Get loading context
  const { showLoading } = useLoading();
  
  // Get modal context for video modal
  const { setVideoContentId, setIsVideoModalOpen, setIsSignupModalOpen, setSignupModalInitialStep, previewStartTime, setPreviewStartTime } = useModal();
  
  // Get user context for premium badge
  const { user, hasActiveSubscription } = useUser();

  // Handle play button click for content
  const handlePlayContent = (episode: Episode, e?: React.MouseEvent) => {
    // Prevent click if user was dragging
    if (hasDragged) {
      e?.preventDefault();
      e?.stopPropagation();
      return;
    }
    
    // Check premium access
    // Create a ContentItem-like object for the check
    const episodeContentItem = {
      id: episode.id,
      is_free_episode: episode.isFreeEpisode || false
    } as any;
    
    // Check if user has full access
    const baseHasAccess = canUserAccessContent(user, episodeContentItem, currentSeries);
    
    // Allow access if:
    // 1. User has full access (subscriber/admin/staff)
    // 2. User is free (they can preview premium content)
    // 3. No user (non-logged-in users can preview premium content)
    // 4. Content is not premium (anyone can access)
    const hasAccess = baseHasAccess || user?.user_type === 'free' || !user;
    
    if (!hasAccess) {
      // Show upgrade prompt
      setIsSignupModalOpen(true);
      setSignupModalInitialStep('plans');
      return;
    }
    
    if (episode.contentType === 'audio') {
      // Mark user interaction for autoplay (trigger click event for existing listener)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('click'));
      }
      
      // Set the current content in the audio player
      setCurrentContent({
        id: episode.id,
        title: episode.title,
        description: episode.description,
        duration: episode.duration,
        thumbnail: episode.thumbnail,
        contentUrl: episode.contentUrl,
        muxPlaybackId: episode.muxPlaybackId,
        contentType: 'audio'
      });
      // Show the audio player
      setAudioPlayerVisible(true);
      
      // Update URL with short_id without navigating (for sharing/bookmarking)
      if (typeof window !== 'undefined') {
        if (episode.shortId) {
          const currentPath = window.location.pathname;
          if (currentPath !== `/${episode.shortId}`) {
            // Use pushState to update URL without triggering navigation
            window.history.pushState({}, '', `/${episode.shortId}`);
          }
        } else {
          // Log warning if short_id is missing (should be auto-generated on creation)
          console.warn('[ContentModal] Audio episode missing shortId:', episode.id, episode.title);
        }
      }
    } else if (episode.contentType === 'video') {
      // Stop audio completely before opening video
      if (typeof window !== 'undefined') {
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            // Clear the source to prevent background playback
            if (audio.src) {
              audio.src = '';
              audio.load();
            }
          }
        });
        // Also destroy any HLS instances
        if ((window as any).hlsInstances) {
          (window as any).hlsInstances.forEach((hls: any) => {
            if (hls && typeof hls.destroy === 'function') {
              hls.destroy();
            }
          });
        }
      }
      // Hide audio player
      setAudioPlayerVisible(false);
      
      // Open video modal instead of navigating
      setVideoContentId(episode.id);
      setIsVideoModalOpen(true);
      // Close the content modal
      onClose(false);
    }
  };

  // Helper function to convert duration to minutes
  const formatDurationToMinutes = (duration: string | null | undefined): string => {
    if (!duration || (typeof duration === 'string' && duration.trim() === '')) {
      return "Unknown";
    }
    
    const durationStr = String(duration).trim();
    
    // Check if it contains a colon (time format) - parse this FIRST before trying seconds
    if (durationStr.includes(':')) {
      const timeParts = durationStr.split(':').filter(part => part.trim() !== '');
      
      if (timeParts.length === 2) {
        // MM:SS format
        const minutes = parseInt(timeParts[0], 10);
        const seconds = parseInt(timeParts[1], 10);
        if (!isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && seconds >= 0) {
          const totalMinutes = minutes + Math.round(seconds / 60);
          return totalMinutes > 0 ? `${totalMinutes} min${totalMinutes !== 1 ? 's' : ''}` : "Unknown";
        }
      } else if (timeParts.length === 3) {
        // HH:MM:SS format
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        const seconds = parseInt(timeParts[2], 10);
        if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds) && hours >= 0 && minutes >= 0 && seconds >= 0) {
          const totalMinutes = hours * 60 + minutes + Math.round(seconds / 60);
          return totalMinutes > 0 ? `${totalMinutes} min${totalMinutes !== 1 ? 's' : ''}` : "Unknown";
        }
      }
    } else {
      // Try to parse as seconds (number string) - only if no colon
      const secondsAsNumber = parseFloat(durationStr);
      if (!isNaN(secondsAsNumber) && secondsAsNumber > 0) {
        const minutes = Math.round(secondsAsNumber / 60);
        return minutes > 0 ? `${minutes} min${minutes !== 1 ? 's' : ''}` : "Unknown";
      }
    }
    
    // If we can't parse it, return Unknown
    return "Unknown";
  };

  // Helper function to get display date (adjusted for Old Calendar)
  const getDisplayDate = useCallback((dateStr: string | null | undefined): string | undefined => {
    if (!dateStr) return undefined;
    if (calendarType === 'old') {
      return adjustDateForOldCalendar(dateStr);
    }
    return dateStr;
  }, [calendarType]);

  // Helper function to filter episodes by month and order them
  const filterEpisodesByMonth = useCallback((episodes: ContentItem[], month: string) => {
    const currentMonthStr = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    // Always use new_calendar_date for sorting and filtering
    const sortedEpisodes = episodes.sort((a, b) => {
      const dateA = a.new_calendar_date || '';
      const dateB = b.new_calendar_date || '';
      return dateA.localeCompare(dateB);
    });
    
    // Filter episodes to selected month (ignore year - dates are cyclical)
    // Extract just the month number from selectedMonth (format: "YYYY-MM")
    const selectedMonthNum = parseInt(currentMonthStr.split('-')[1], 10);
    const monthFilteredEpisodes = sortedEpisodes.filter(ep => {
      if (!ep.new_calendar_date) return false;
      
      if (calendarType === 'old') {
        // For Old Calendar: Add 13 days to episode date to get display date, then match by month only
        const epDate = parseLocalDate(ep.new_calendar_date);
        const displayDate = new Date(epDate);
        displayDate.setDate(displayDate.getDate() + 13);
        const displayMonth = displayDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
        return displayMonth === selectedMonthNum;
      } else {
        // For New Calendar: Match by month only (ignore year)
        const [, epMonth] = ep.new_calendar_date.split('-').map(Number);
        return epMonth === selectedMonthNum;
      }
    });
    
    console.log('[Content Modal] Month filtering:', {
      calendarType,
      selectedMonth: currentMonthStr,
      totalEpisodes: sortedEpisodes.length,
      filteredEpisodes: monthFilteredEpisodes.length
    });
    
    // Find today's episode in the filtered list
    let monthTodayEpisodeIndex = -1;
    let monthTodayEpisode: ContentItem | null = null;
    
    if (monthFilteredEpisodes.length > 0) {
      // Get today's date string (always use current date for display)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      // For content selection:
      // - New Calendar: Find episode where new_calendar_date = today
      // - Old Calendar: Find episode where new_calendar_date = (today - 13 days)
      let searchDateStr: string;
      if (calendarType === 'old') {
        // If today is Jan 3, we want content from Nov 20 (13 days before)
        const searchDate = new Date(today);
        searchDate.setDate(searchDate.getDate() - 13);
        searchDateStr = `${searchDate.getFullYear()}-${String(searchDate.getMonth() + 1).padStart(2, '0')}-${String(searchDate.getDate()).padStart(2, '0')}`;
      } else {
        searchDateStr = todayStr;
      }
      
      console.log('[Content Modal] Finding today episode - calendarType:', calendarType, 'today:', todayStr, 'searchDate:', searchDateStr);
      
      // Compare against new_calendar_date (which is the actual episode date in the database)
      monthTodayEpisodeIndex = monthFilteredEpisodes.findIndex(ep => {
        if (!ep.new_calendar_date) return false;
        return ep.new_calendar_date === searchDateStr;
      });
      
      if (monthTodayEpisodeIndex >= 0) {
        monthTodayEpisode = monthFilteredEpisodes[monthTodayEpisodeIndex];
      } else {
          // Find next closest future episode in this month
          // For comparison, we need to use the "display date" (episode date + 13 days for Old Calendar)
          for (let i = 0; i < monthFilteredEpisodes.length; i++) {
            const ep = monthFilteredEpisodes[i];
            if (!ep.new_calendar_date) continue;
            
            let epDisplayDateStr: string;
            if (calendarType === 'old') {
              // For Old Calendar, add 13 days to episode date to get display date
              const epDate = parseLocalDate(ep.new_calendar_date);
              epDate.setDate(epDate.getDate() + 13);
              epDisplayDateStr = `${epDate.getFullYear()}-${String(epDate.getMonth() + 1).padStart(2, '0')}-${String(epDate.getDate()).padStart(2, '0')}`;
            } else {
              epDisplayDateStr = ep.new_calendar_date;
            }
            
            if (epDisplayDateStr >= todayStr) {
              monthTodayEpisodeIndex = i;
              monthTodayEpisode = ep;
              break;
            }
          }
        
        // If no future episode found in this month, use first episode of the month
        if (monthTodayEpisodeIndex === -1) {
          monthTodayEpisodeIndex = 0;
          monthTodayEpisode = monthFilteredEpisodes[0];
        }
      }
    }
    
    // Reorder: today's episode first, then rest in order
    let orderedEpisodes: ContentItem[] = [];
    
    if (monthTodayEpisode && monthTodayEpisodeIndex >= 0 && monthFilteredEpisodes.length > 0) {
      // Store today's episode ID for highlighting
      setTodayEpisodeId(monthTodayEpisode.id);
      
      // Add today's episode first
      orderedEpisodes.push(monthTodayEpisode);
      
      // Add episodes after today's date in this month
      for (let i = monthTodayEpisodeIndex + 1; i < monthFilteredEpisodes.length; i++) {
        orderedEpisodes.push(monthFilteredEpisodes[i]);
      }
      
      // Add episodes before today's date in this month (wrap around)
      for (let i = 0; i < monthTodayEpisodeIndex; i++) {
        orderedEpisodes.push(monthFilteredEpisodes[i]);
      }
    } else {
      // No today episode found, just use sorted order for the month
      setTodayEpisodeId(null);
      orderedEpisodes = monthFilteredEpisodes;
    }
    
    // Transform to Episode format
    const episodeData: Episode[] = orderedEpisodes.map((content) => ({
      id: content.id,
      title: content.title, // Remove episode number for daily content
      description: content.description || "No description available",
      duration: formatDurationToMinutes(content.duration),
      thumbnail: content.thumbnail_url || "/images/content-1.png",
      contentUrl: content.content_url || undefined,
      muxPlaybackId: content.mux_playback_id || undefined,
      contentType: content.content_type,
      calendarDate: content.new_calendar_date || undefined, // Store the date, we'll format it for display based on calendar type
      isFreeEpisode: content.is_free_episode || false,
      shortId: content.short_id || undefined
    }));
    
    setEpisodes(episodeData);
  }, [calendarType, getDisplayDate, setTodayEpisodeId]);

  // Adjust selected month when calendar type loads or changes (for Old Calendar, show month based on displayed dates)
  useEffect(() => {
    if (isLoadingCalendarPreference) return; // Wait for calendar preference to load
    
    const isDailyContent = currentSeries ? Boolean(currentSeries.is_daily_content) === true : false;
    if (isDailyContent) {
      // Only set to current month if selectedMonth hasn't been manually set yet
      // This allows users to select past months without it being reset
      const today = new Date();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      // Only update if selectedMonth is not set or matches current month (initial state)
      if (!selectedMonth || selectedMonth === currentMonth) {
        console.log('[Content Modal] Setting month to current month:', currentMonth, 'calendarType:', calendarType);
        setSelectedMonth(currentMonth);
      }
    }
  }, [calendarType, currentSeries, isLoadingCalendarPreference]);

  // Re-filter episodes when month or calendar type changes (for daily content)
  useEffect(() => {
    const isDailyContent = currentSeries ? Boolean(currentSeries.is_daily_content) === true : false;
    if (allSortedEpisodes.length > 0 && isDailyContent) {
      filterEpisodesByMonth(allSortedEpisodes, selectedMonth);
    }
  }, [selectedMonth, calendarType, allSortedEpisodes, currentSeries, filterEpisodesByMonth]);

  // Load episodes when modal opens and item changes
  useEffect(() => {
    const loadEpisodes = async () => {
      if (isOpen && item && item.id) {
        setIsLoadingEpisodes(true);
        try {
          // Try to get series directly first (in case item.id is a series ID)
          // If that fails, find which series contains this content (in case item.id is a content ID)
          let containingSeries = await seriesService.getById(item.id);
          
          if (!containingSeries) {
            // Item.id is not a series ID, try to find which series contains this content
            const allSeries = await seriesService.getAll();
            containingSeries = allSeries.find(s => 
              s.content_ids && s.content_ids.includes(item.id)
            ) || null;
          }
          
          if (containingSeries) {
            setCurrentSeries(containingSeries);
            
            // Debug: Log series data to check is_daily_content
            console.log('Content Modal - Containing series:', {
              id: containingSeries.id,
              title: containingSeries.title,
              is_daily_content: containingSeries.is_daily_content,
              is_daily_content_type: typeof containingSeries.is_daily_content
            });
            
            // Check if this is a daily content series
            const isDailyContent = Boolean(containingSeries.is_daily_content) === true;
            
            console.log('Content Modal - Is daily content:', isDailyContent);
            
            if (isDailyContent) {
              // For daily content, fetch episodes with calendar dates and sort by date
              try {
                console.log('Content Modal - Fetching daily content episodes for series:', containingSeries.id);
                const response = await fetch(`/api/admin/daily-content/${containingSeries.id}/episodes`);
                console.log('Content Modal - Daily content API response status:', response.status);
                if (response.ok) {
                  const data = await response.json();
                  const episodesWithDates = data.episodes || [];
                  console.log('Content Modal - Episodes with dates:', episodesWithDates.length);
                  
                  // Get full content details for each episode
                  const contentPromises = episodesWithDates.map((ep: any) => 
                    contentItemsService.getById(ep.id)
                  );
                  const fullEpisodes = await Promise.all(contentPromises);
                  const validEpisodes = fullEpisodes.filter((ep) => ep !== null) as ContentItem[];
                  
                  // Store all episodes for month filtering (will be sorted in filterEpisodesByMonth)
                  // Don't filter here - let the useEffect handle it after month is adjusted for calendar type
                  setAllSortedEpisodes(validEpisodes);
                } else {
                  // Fallback to regular episode loading if API fails
                  const contentItems = await getSeriesContent(item.id);
                  const episodeData: Episode[] = contentItems.map((content, index) => ({
                    id: content.id,
                    title: `${index + 1}. ${content.title}`,
                    description: content.description || "No description available",
                    duration: formatDurationToMinutes(content.duration),
                    thumbnail: content.thumbnail_url || "/images/content-1.png",
                    contentUrl: content.content_url || undefined,
                    muxPlaybackId: content.mux_playback_id || undefined,
                    contentType: content.content_type,
                    isFreeEpisode: content.is_free_episode || false,
                    shortId: content.short_id || undefined
                  }));
                  setEpisodes(episodeData);
                  setTodayEpisodeId(null);
                }
              } catch (error) {
                console.error('Failed to fetch daily content episodes:', error);
                // Fallback to regular episode loading
                const contentItems = await getSeriesContent(item.id);
                const episodeData: Episode[] = contentItems.map((content, index) => ({
                  id: content.id,
                  title: `${index + 1}. ${content.title}`,
                  description: content.description || "No description available",
                  duration: formatDurationToMinutes(content.duration),
                  thumbnail: content.thumbnail_url || "/images/content-1.png",
                  contentUrl: content.content_url || undefined,
                  muxPlaybackId: content.mux_playback_id || undefined,
                  contentType: content.content_type,
                  shortId: content.short_id || undefined
                }));
                setEpisodes(episodeData);
                setTodayEpisodeId(null);
              }
            } else {
              // Regular series - use existing logic
              const contentItems = await getSeriesContent(item.id);
              const episodeData: Episode[] = contentItems.map((content, index) => ({
                id: content.id,
                title: `${index + 1}. ${content.title}`,
                description: content.description || "No description available",
                duration: formatDurationToMinutes(content.duration),
                thumbnail: content.thumbnail_url || "/images/content-1.png",
                contentUrl: content.content_url || undefined,
                muxPlaybackId: content.mux_playback_id || undefined,
                contentType: content.content_type
              }));
              setEpisodes(episodeData);
              setTodayEpisodeId(null);
            }
          } else {
            // No series found, use regular loading
            const contentItems = await getSeriesContent(item.id);
            const episodeData: Episode[] = contentItems.map((content, index) => ({
              id: content.id,
              title: `${index + 1}. ${content.title}`,
              description: content.description || "No description available",
              duration: formatDurationToMinutes(content.duration),
              thumbnail: content.thumbnail_url || "/images/content-1.png",
              contentUrl: content.content_url || undefined,
              muxPlaybackId: content.mux_playback_id || undefined,
              contentType: content.content_type
            }));
            setEpisodes(episodeData);
            setTodayEpisodeId(null);
          }
        } catch (error) {
          console.error('Failed to load episodes:', error);
          setEpisodes([]);
          setTodayEpisodeId(null);
        } finally {
          setIsLoadingEpisodes(false);
        }
      } else {
        setEpisodes([]);
        setTodayEpisodeId(null);
        setAllSortedEpisodes([]);
        // Don't reset calendar type - it's persisted in database
        setIsLoadingEpisodes(false);
        // Reset to current month when modal closes
        const now = new Date();
        setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      }
    };

    loadEpisodes();
  }, [isOpen, item?.id]); // Remove getSeriesContent from dependencies

  useEffect(() => {
    if (isOpen) {
      // Start with loading state
      setIsLoadingEpisodes(true);
      // Reset scroll position and parallax offset when opening
      requestAnimationFrame(() => {
        if (modalRef.current) {
          modalRef.current.scrollTo({ top: 0, behavior: 'auto' });
        }
        setScrollY(0);
      });
    } else {
      setIsLoadingEpisodes(false);
      setScrollY(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !item?.id) {
      return;
    }
    if (modalRef.current) {
      modalRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    setScrollY(0);
  }, [item?.id, isOpen]);

  // Handle preview video for series with video content
  useEffect(() => {
    // Reset preview state when modal closes
    if (!isOpen) {
      setShowPreviewVideo(false);
      setPreviewPlaybackId(null);
      setIsPreviewPlaying(false);
      previewStartTimeRef.current = null; // Reset start time
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      // Remove timeupdate listener
      const container = previewVideoContainerRef.current;
      if (container && previewTimeUpdateRef.current) {
        const muxVideoElement = container.querySelector('mux-video') as any;
        let video: HTMLVideoElement | null = null;
        
        if (muxVideoElement) {
          video = muxVideoElement.shadowRoot?.querySelector('video') || 
                  muxVideoElement.querySelector('video') || 
                  container.querySelector('video') as HTMLVideoElement;
        } else {
          video = container.querySelector('video') as HTMLVideoElement;
        }

        if (video) {
          video.removeEventListener('timeupdate', previewTimeUpdateRef.current);
        }
        previewTimeUpdateRef.current = null;
      }
      return;
    }

    // Check if we have episodes and first episode is a video
    if (episodes.length > 0 && !isLoadingEpisodes) {
      const firstEpisode = episodes[0];
      
      console.log('[ContentModal Preview] Checking preview conditions:', {
        episodesCount: episodes.length,
        firstEpisode: {
          id: firstEpisode.id,
          contentType: firstEpisode.contentType,
          muxPlaybackId: firstEpisode.muxPlaybackId,
          title: firstEpisode.title
        },
        currentSeries: currentSeries ? { id: currentSeries.id, title: currentSeries.title } : null
      });
      
      // Show preview for all series with video content (including one-off)
      if (firstEpisode.contentType === 'video' && firstEpisode.muxPlaybackId) {
        console.log('[ContentModal Preview] Setting preview video:', firstEpisode.muxPlaybackId);
        setPreviewPlaybackId(firstEpisode.muxPlaybackId);
        setShowPreviewVideo(true);
        
        // Set timeout to switch back to banner after 60 seconds (fallback)
        previewTimeoutRef.current = setTimeout(() => {
          console.log('[ContentModal Preview] Timeout reached, switching back to banner');
          // Keep showPreviewVideo true so restart button remains visible
          previewStartTimeRef.current = null; // Reset start time
          setIsPreviewPlaying(false);
          setShowPreviewVideo(false);
          
          // Stop video and cleanup
          const container = previewVideoContainerRef.current;
          if (container) {
            const muxVideoElement = container.querySelector('mux-video') as any;
            let video: HTMLVideoElement | null = null;
            
            if (muxVideoElement) {
              video = muxVideoElement.shadowRoot?.querySelector('video') || 
                      muxVideoElement.querySelector('video') || 
                      container.querySelector('video') as HTMLVideoElement;
            } else {
              video = container.querySelector('video') as HTMLVideoElement;
            }

            if (video) {
              video.pause();
              if (previewTimeUpdateRef.current) {
                video.removeEventListener('timeupdate', previewTimeUpdateRef.current);
              }
            }
            previewTimeUpdateRef.current = null;
          }
        }, 60000); // 60 seconds
      } else {
        console.log('[ContentModal Preview] Preview conditions not met, hiding preview');
        setShowPreviewVideo(false);
        setPreviewPlaybackId(null);
        setIsPreviewPlaying(false);
      }
    } else {
      console.log('[ContentModal Preview] No episodes or still loading:', {
        episodesCount: episodes.length,
        isLoadingEpisodes
      });
    }

    // Cleanup on unmount
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      const container = previewVideoContainerRef.current;
      if (container && previewTimeUpdateRef.current) {
        const muxVideoElement = container.querySelector('mux-video') as any;
        let video: HTMLVideoElement | null = null;
        
        if (muxVideoElement) {
          video = muxVideoElement.shadowRoot?.querySelector('video') || 
                  muxVideoElement.querySelector('video') || 
                  container.querySelector('video') as HTMLVideoElement;
        } else {
          video = container.querySelector('video') as HTMLVideoElement;
        }

        if (video) {
          video.removeEventListener('timeupdate', previewTimeUpdateRef.current);
        }
        previewTimeUpdateRef.current = null;
      }
    };
  }, [episodes, isLoadingEpisodes, isOpen, currentSeries]);

  // Handle preview video time tracking and unmute
  useEffect(() => {
    if (!showPreviewVideo || !previewVideoContainerRef.current) {
      console.log('[ContentModal Preview] Time tracking not active:', {
        showPreviewVideo,
        hasContainer: !!previewVideoContainerRef.current
      });
      return;
    }

    // Wait for video element to be available
    const container = previewVideoContainerRef.current;
    let retryCount = 0;
    const maxRetries = 50; // 5 seconds max wait
    let canPlayHandler: ((e: Event) => void) | null = null;
    
    const findVideo = () => {
      // MuxVideo renders as a custom element, so we need to find the video inside it
      const muxVideoElement = container.querySelector('mux-video') as any;
      let video: HTMLVideoElement | null = null;
      
      if (muxVideoElement) {
        video = muxVideoElement.shadowRoot?.querySelector('video') || 
                muxVideoElement.querySelector('video') || 
                container.querySelector('video') as HTMLVideoElement;
      } else {
        video = container.querySelector('video') as HTMLVideoElement;
      }

      if (video) {
        console.log('[ContentModal Preview] Video element found, setting up time tracking and unmuting');
        
        // Set initial time from hover preview if available
        if (previewStartTime !== null && previewStartTime > 0) {
          console.log('[ContentModal Preview] Resuming from hover preview time:', previewStartTime);
          video.currentTime = previewStartTime;
          previewStartTimeRef.current = previewStartTime; // Set start time for 60-second tracking
          // Clear the preview start time after using it
          setPreviewStartTime(null);
        }
        
        // Set mute state from localStorage
        video.muted = isPreviewMuted;
        
        // Also set mute state on canplay event (when video is ready)
        canPlayHandler = () => {
          video.muted = isPreviewMuted;
          // Set initial time again on canplay in case it wasn't set yet
          if (previewStartTime !== null && previewStartTime > 0 && video.currentTime < previewStartTime) {
            video.currentTime = previewStartTime;
            setPreviewStartTime(null);
          }
          console.log('[ContentModal Preview] Video can play, mute state:', isPreviewMuted);
        };
        video.addEventListener('canplay', canPlayHandler);
        
        // Also set mute state when video starts playing
        const handlePlay = () => {
          video.muted = isPreviewMuted;
          setIsPreviewPlaying(true);
          // Track start time when video begins playing
          previewStartTimeRef.current = video.currentTime;
          console.log('[ContentModal Preview] Video playing, mute state:', isPreviewMuted, 'start time:', previewStartTimeRef.current);
        };
        previewPlayHandlerRef.current = handlePlay;
        video.addEventListener('play', handlePlay);
        
        // Track pause events
        const handlePause = () => {
          setIsPreviewPlaying(false);
          console.log('[ContentModal Preview] Video paused');
        };
        previewPauseHandlerRef.current = handlePause;
        video.addEventListener('pause', handlePause);
        
        // Track ended events
        const handleEnded = () => {
          setIsPreviewPlaying(false);
          console.log('[ContentModal Preview] Video ended');
        };
        previewEndedHandlerRef.current = handleEnded;
        video.addEventListener('ended', handleEnded);
        
        // Create timeupdate handler
        const handleTimeUpdate = () => {
          // Ensure start time is set (should be set when video starts playing)
          if (previewStartTimeRef.current === null) {
            previewStartTimeRef.current = video.currentTime;
            return;
          }
          
          // Check if 60 seconds have elapsed from the start time
          const elapsedFromStart = video.currentTime - previewStartTimeRef.current;
          if (elapsedFromStart >= 60) {
            console.log('[ContentModal Preview] 60 seconds reached, switching to banner');
            
            // Remove the timeupdate listener immediately to prevent multiple triggers
            if (previewTimeUpdateRef.current) {
              video.removeEventListener('timeupdate', previewTimeUpdateRef.current);
              previewTimeUpdateRef.current = null;
            }
            
            // Pause video immediately
            video.pause();
            setIsPreviewPlaying(false);
            setShowPreviewVideo(false);
            
            // Fade out video and fade in banner
            const videoContainer = container.querySelector('[data-preview-video]') as HTMLElement;
            if (videoContainer) {
              videoContainer.style.transition = 'opacity 0.5s ease-out';
              videoContainer.style.opacity = '0';
            }
            
            // Reset start time and clear timeout
            previewStartTimeRef.current = null;
            if (previewTimeoutRef.current) {
              clearTimeout(previewTimeoutRef.current);
              previewTimeoutRef.current = null;
            }
          }
        };

        previewTimeUpdateRef.current = handleTimeUpdate;
        video.addEventListener('timeupdate', handleTimeUpdate);
      } else if (retryCount < maxRetries) {
        retryCount++;
        // Retry after a short delay if video not found yet
        setTimeout(findVideo, 100);
      } else {
        console.warn('[ContentModal Preview] Video element not found after max retries', {
          containerHTML: container.innerHTML.substring(0, 200)
        });
      }
    };

    findVideo();

    return () => {
      const muxVideoElement = container.querySelector('mux-video') as any;
      let video: HTMLVideoElement | null = null;
      
      if (muxVideoElement) {
        video = muxVideoElement.shadowRoot?.querySelector('video') || 
                muxVideoElement.querySelector('video') || 
                container.querySelector('video') as HTMLVideoElement;
      } else {
        video = container.querySelector('video') as HTMLVideoElement;
      }

      if (video) {
        if (canPlayHandler) {
          video.removeEventListener('canplay', canPlayHandler);
        }
        if (previewPlayHandlerRef.current) {
          video.removeEventListener('play', previewPlayHandlerRef.current);
        }
        if (previewPauseHandlerRef.current) {
          video.removeEventListener('pause', previewPauseHandlerRef.current);
        }
        if (previewEndedHandlerRef.current) {
          video.removeEventListener('ended', previewEndedHandlerRef.current);
        }
        if (previewTimeUpdateRef.current) {
          video.removeEventListener('timeupdate', previewTimeUpdateRef.current);
        }
      }
      previewTimeUpdateRef.current = null;
      previewPlayHandlerRef.current = null;
      previewPauseHandlerRef.current = null;
      previewEndedHandlerRef.current = null;
    };
  }, [showPreviewVideo, previewPlaybackId, previewStartTime, setPreviewStartTime, isPreviewMuted]);

  // Update video muted state when isPreviewMuted changes (for synchronization)
  useEffect(() => {
    if (!showPreviewVideo || !previewVideoContainerRef.current) return;

    const container = previewVideoContainerRef.current;
    
    const updateVideoMutedState = () => {
      const muxVideoElement = container.querySelector('mux-video') as any;
      let video: HTMLVideoElement | null = null;
      
      if (muxVideoElement) {
        video = muxVideoElement.shadowRoot?.querySelector('video') || 
                muxVideoElement.querySelector('video') || 
                container.querySelector('video') as HTMLVideoElement;
      } else {
        video = container.querySelector('video') as HTMLVideoElement;
      }
      
      if (video) {
        video.muted = isPreviewMuted;
        console.log('[ContentModal] Updated video muted state to:', isPreviewMuted);
      }
    };

    // Try to update immediately
    updateVideoMutedState();

    // Also try after a short delay in case video element isn't ready yet
    const timeout = setTimeout(updateVideoMutedState, 100);

    return () => clearTimeout(timeout);
  }, [isPreviewMuted, showPreviewVideo]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // Track scroll position for parallax effect
  useEffect(() => {
    if (!modalRef.current) return;

    const handleScroll = () => {
      if (modalRef.current) {
        const scrollTop = modalRef.current.scrollTop;
        setScrollY(scrollTop);
      }
    };

    const modalElement = modalRef.current;
    modalElement.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      modalElement.removeEventListener('scroll', handleScroll);
    };
  }, [isOpen]);


  // Handle restart preview video
  const handleRestartPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If video container doesn't exist yet, we need to show it first
    if (!showPreviewVideo) {
      setShowPreviewVideo(true);
      // Wait a bit for the video element to render
      setTimeout(() => {
        const container = previewVideoContainerRef.current;
        if (!container) return;
        
        const muxVideoElement = container.querySelector('mux-video') as any;
        let video: HTMLVideoElement | null = null;
        
        if (muxVideoElement) {
          video = muxVideoElement.shadowRoot?.querySelector('video') || 
                  muxVideoElement.querySelector('video') || 
                  container.querySelector('video') as HTMLVideoElement;
        } else {
          video = container.querySelector('video') as HTMLVideoElement;
        }
        
        if (video) {
          // Start from the beginning
          video.currentTime = 0;
          
          // Mute for autoplay, then apply user preference after play starts
          video.muted = true;
          video.play().then(() => {
            video!.muted = isPreviewMuted;
            // Set start time when play succeeds
            previewStartTimeRef.current = video!.currentTime;
            console.log('[ContentModal] Restart: Video started, applying user mute preference:', isPreviewMuted, 'start time:', previewStartTimeRef.current);
          }).catch((err) => {
            console.log('[ContentModal] Restart play failed:', err);
          });
          setIsPreviewPlaying(true);
        }
      }, 300);
    } else {
      // Video container exists, restart immediately
      const container = previewVideoContainerRef.current;
      if (!container) return;
      
      const muxVideoElement = container.querySelector('mux-video') as any;
      let video: HTMLVideoElement | null = null;
      
      if (muxVideoElement) {
        video = muxVideoElement.shadowRoot?.querySelector('video') || 
                muxVideoElement.querySelector('video') || 
                container.querySelector('video') as HTMLVideoElement;
      } else {
        video = container.querySelector('video') as HTMLVideoElement;
      }
      
      if (video) {
        // Start from the beginning
        video.currentTime = 0;

        // Mute for autoplay, then apply user preference after play starts
        video.muted = true;
        video.play().then(() => {
          video!.muted = isPreviewMuted;
          console.log('[ContentModal] Restart: Video started, applying user mute preference:', isPreviewMuted);
        }).catch((err) => {
          console.log('[ContentModal] Restart play failed:', err);
        });
        setIsPreviewPlaying(true);
        setShowPreviewVideo(true); // Ensure video is visible
      }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  // Save mute state to session storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('videoMuted', isMuted.toString());
    }
  }, [isMuted]);

  // Handle video autoplay
  useEffect(() => {
    if (isOpen && videoRef.current) {
      const video = videoRef.current;
      
      const playVideo = async () => {
        // Set mute state based on user preference
        video.muted = isMuted;
        
        try {
          await video.play();
        } catch (error) {
          // If unmuted autoplay fails, try muted
          if (!isMuted) {
            video.muted = true;
            try {
              await video.play();
            } catch (mutedError) {
              console.log('Video autoplay failed');
            }
          }
        }
      };
      
      playVideo();
    }
  }, [isOpen, isMuted]);

  // Don't unmount if we're animating close - let BaseModal handle the exit animation
  if ((!isOpen && !isAnimatingClose) || !item) return null;

  // Check if this is a one-off series to determine if modal should fit content
  const isOneOff = currentSeries ? Boolean((currentSeries as any).is_one_off) === true : false;
  // Check if this is daily content (has month selector)
  const isDailyContent = currentSeries ? Boolean(currentSeries.is_daily_content) === true : false;
  // For regular series (not one-off, not daily), use fitContent since we removed the season selector
  const shouldFitContent = isOneOff || (!isDailyContent && currentSeries);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isMobile={isMobile}
      enableDragToDismiss={true}
      showDragHandle={false}
      sourcePosition={sourcePosition}
      dataAttribute="data-content-modal"
      overflowClassName={isExpanded ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}
      onDragStateChange={setHasDragged}
      modalRef={modalRef}
      isAnimatingClose={isAnimatingClose}
      fitContent={shouldFitContent}
      zIndex={102}
      backdropZIndex={101}
    >
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          // On desktop, trigger fade-out animation; on mobile, immediate close
          onClose(!isMobile);
        }}
        onTouchStart={(e) => e.stopPropagation()}
        className="absolute top-12 left-4 sm:top-4 sm:right-4 z-50 w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center text-lg sm:text-base"
      >
        ✕
      </button>
              {/* Hero video or image container */}
              <div className={`relative h-[66vh] sm:h-[557px] w-full overflow-hidden rounded-none sm:rounded-t-2xl`}>
                {/* 1. Base layer: Banner (Image or Video) - Always present as fallback */}
                <div className="absolute inset-0 w-full h-full">
                  {isVideoUrl(item.backgroundUrl) ? (
                    <video
                      ref={videoRef}
                      src={item.backgroundUrl || "/dummy-videos/preview-dummy.webm"}
                      className="w-full h-full object-cover"
                      style={{
                        transform: `scale(1.15) translateY(${scrollY * 0.25}px)`,
                        transformOrigin: 'center center',
                        opacity: (showPreviewVideo && isPreviewPlaying) ? 0 : 1,
                        transition: 'opacity 0.5s ease-in'
                      }}
                      autoPlay
                      loop
                      playsInline
                      muted={isMuted}
                    />
                  ) : (
                    <Image
                      src={item.backgroundUrl || "/dummy-videos/preview-dummy.webm"}
                      alt={item.title}
                      fill
                      className="object-cover"
                      style={{
                        transform: `scale(1.15) translateY(${scrollY * 0.25}px)`,
                        transformOrigin: 'center center',
                        opacity: (showPreviewVideo && isPreviewPlaying) ? 0 : 1,
                        transition: 'opacity 0.5s ease-in'
                      }}
                      unoptimized
                    />
                  )}
                </div>

                {/* 2. Top layer: Preview Video (Mux) - if available */}
                {previewPlaybackId && (
                  <div ref={previewVideoContainerRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                    <MuxVideo
                      data-preview-video
                      playbackId={previewPlaybackId}
                      style={{
                        transform: `scale(1.15) translateY(${scrollY * 0.25}px)`,
                        transformOrigin: 'center center',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        opacity: (showPreviewVideo && isPreviewPlaying) ? 1 : 0,
                        transition: 'opacity 0.5s ease-in'
                      }}
                      autoPlay="any"
                      muted={isPreviewMuted}
                      playsInline
                      crossOrigin="anonymous"
                    />
                  </div>
                )}

                {/* 3. Controls Layer - Always present if playbackId exists, regardless of showPreviewVideo */}
                {previewPlaybackId && (
                  <div className="absolute inset-0 w-full h-full z-40 pointer-events-none">
                    {/* Mute/Unmute button or Restart button - top right on mobile, bottom right on desktop */}
                    {isPreviewPlaying && showPreviewVideo ? (
                      // Mute/Unmute button when video is playing
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePreviewMute();
                        }}
                        className="absolute top-12 right-4 sm:top-4 sm:right-4 z-20 w-10 h-10 rounded-full bg-black/15 hover:bg-black/50 transition-colors flex items-center justify-center cursor-pointer pointer-events-auto"
                        aria-label={isPreviewMuted ? "Unmute video" : "Mute video"}
                      >
                        {isPreviewMuted ? (
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      // Restart button when video is not playing (background is showing)
                      // Show whenever previewPlaybackId exists and video is not playing
                      <button
                        onClick={handleRestartPreview}
                        className="absolute top-12 right-4 sm:top-4 sm:right-4 w-10 h-10 rounded-full bg-black/15 hover:bg-black/50 transition-colors flex items-center justify-center cursor-pointer pointer-events-auto"
                        aria-label="Restart preview"
                      >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
          <div className="absolute bottom-0 left-0 right-0 h-[88vh] sm:h-[576px] bg-gradient-to-b from-transparent via-[#1c1c1c]/40 to-[#1c1c1c] z-30" />
          {/* Mute/Unmute button - top right on mobile, bottom right on desktop - only show for banner videos, not preview */}
          {isVideoUrl(item.backgroundUrl) && !showPreviewVideo && !previewPlaybackId && (
            <button
              onClick={toggleMute}
              onTouchStart={(e) => e.stopPropagation()}
              className="absolute top-12 right-4 sm:top-4 sm:right-4 w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center z-40"
            >
              {isMuted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Content */}
        <div className={`pt-4 sm:p-6 sm:pb-6 -mt-[38.5vh] sm:-mt-80 px-4 relative z-35 ${
          // Use same padding for one-off and regular series (since season selector is removed)
          // Only daily content needs extra padding for the month selector
          isDailyContent ? 'pb-32' : 'pb-8'
        }`}>
          {/* Title and metadata */}
          <div className="mb-4 pl-0 sm:pl-[14px]">
            <div className="mb-2">
              <Image
                src={item.logoUrl || "/images/SOS-logo.png"}
                alt={item.title + " Logo"}
                width={600}
                height={180}
                className="h-[160px] sm:h-36 w-auto object-contain"
                unoptimized
              />
            </div>
            <button 
              className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-white/90 transition-colors flex items-center gap-2 mb-6"
              onClick={() => {
                // For one-off series, navigate directly to the content's play page
                const isOneOff = currentSeries ? Boolean((currentSeries as any).is_one_off) === true : false;
                if (isOneOff && episodes.length > 0) {
                  const firstEpisode = episodes[0];
                  handlePlayContent(firstEpisode);
                }
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Play
            </button>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {/* Premium badge - only show for free users - moved to left of rating */}
              {((item.isPremium || (currentSeries && (currentSeries as any).is_premium)) && (!user || (!hasActiveSubscription && user.user_type !== 'admin'))) && (
                <PremiumBadge />
              )}
              <div className="inline-block bg-white/20 text-white px-3 py-1 rounded text-sm">
                Rated {(currentSeries?.rating || item.rating || 'NR')}
              </div>
              <div className="text-white/80 text-sm">
                {(() => {
                  const tags = currentSeries?.tags || item.tags || [];
                  return tags && tags.length > 0 ? tags.join(' | ') : 'No tags available';
                })()}
              </div>
            </div>
            {(() => {
              const isOneOff = currentSeries ? Boolean((currentSeries as any).is_one_off) === true : false;
              return (
                <p className={`text-white/90 leading-relaxed max-w-full sm:max-w-[72%] ${isOneOff ? 'mb-2' : 'mb-4'}`}>
                  {item.subtitle || "No description available"}
                </p>
              );
            })()}
          </div>

          {/* Month selector for daily content only - no season selector for regular series */}
          {(() => {
            const isDailyContent = currentSeries ? Boolean(currentSeries.is_daily_content) === true : false;
            const isOneOff = currentSeries ? Boolean((currentSeries as any).is_one_off) === true : false;
            
            // Don't show selectors for one-off series
            if (isOneOff) return null;
            
            // Only show selector for daily content, not for regular series
            if (!isDailyContent) return null;
            
            // Generate month options for daily content (dates are cyclical, so just show unique months)
            const getMonthOptions = () => {
              const options: { value: string; label: string }[] = [];
              const now = new Date();
              const currentYear = now.getFullYear();
              
              // Generate all 12 months of the year (dates are cyclical, so year doesn't matter)
              // Use current year for the value format, but we'll only match by month
              for (let month = 0; month < 12; month++) {
                const date = new Date(currentYear, month, 1);
                const monthValue = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
                const monthName = date.toLocaleString('default', { month: 'long' }); // Just month name, no year
                options.push({ value: monthValue, label: monthName });
              }
              
              return options;
            };
            
            // Only show selectors if we have series data
            if (!currentSeries) return null;
            
            return (
              <div className="mb-6 pl-0 sm:pl-[14px] flex items-center gap-3">
                {/* Only show month selector and calendar toggle for daily content */}
                {isDailyContent && (
                  <>
                    <select 
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-[#1c1c1c] text-white border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-white/50"
                    >
                      {getMonthOptions().map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {/* Calendar Type Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={calendarType === 'old'}
                        onChange={(e) => updatePreference(e.target.checked ? 'old' : 'new')}
                        className="sr-only"
                      />
                      <div className={`relative w-14 h-7 rounded-full transition-colors ${
                        calendarType === 'old' ? 'bg-blue-600' : 'bg-gray-600'
                      }`}>
                        <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                          calendarType === 'old' ? 'translate-x-7' : 'translate-x-0'
                        }`} />
                      </div>
                      <span className="text-white text-sm font-medium">
                        {calendarType === 'new' ? 'New Calendar' : 'Old Calendar'}
                      </span>
                    </label>
                  </>
                )}
              </div>
            );
          })()}

          {/* Episodes list */}
          <div className="space-y-4" style={{ marginTop: '0px' }}>
            {episodes.length > 0 && (
              episodes.map((episode, index) => {
                const isTodayEpisode = episode.id === todayEpisodeId;
                const isOneOff = currentSeries ? Boolean((currentSeries as any).is_one_off) === true : false;
                
                // Remove number prefix from title for one-off content (e.g., "1. Title" -> "Title")
                const displayTitle = isOneOff 
                  ? episode.title.replace(/^\d+\.\s*/, '') 
                  : episode.title;
                
                return (
                  <div 
                    key={episode.id} 
                    onClick={(e) => handlePlayContent(episode, e)}
                    onMouseEnter={() => !isMobile && setHoveredEpisodeId(episode.id)}
                    onMouseLeave={() => setHoveredEpisodeId(null)}
                    className={`flex gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group ${
                      isTodayEpisode ? 'bg-white/5' : ''
                    }`}
                  >
                    <div className={`${episode.contentType === 'audio' ? 'w-[100px] h-[100px] sm:w-[136px] sm:h-[136px]' : 'w-[150px] h-[100px] sm:w-[217px] sm:h-[136px]'} rounded overflow-hidden flex-shrink-0 relative`}>
                      <Image
                        src={episode.thumbnail}
                        alt={episode.title}
                        width={episode.contentType === 'audio' ? 136 : 217}
                        height={136}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                      {/* Lock icon / Preview badge for premium episodes - upper left corner */}
                      {(() => {
                        const isEpisodePremium = currentSeries && (currentSeries as any).is_premium && !episode.isFreeEpisode;
                        const shouldShow = isEpisodePremium && (!user || (!hasActiveSubscription && user.user_type !== 'admin'));
                        const isHovered = hoveredEpisodeId === episode.id;
                        
                        return shouldShow ? (
                          <div className="absolute top-2 left-2 z-10">
                            {/* Lock icon - shows when not hovered */}
                            <div 
                              className={`transition-all duration-300 ${
                                isHovered ? 'opacity-0 scale-0' : 'opacity-100 scale-100'
                              }`}
                              style={{ transformOrigin: 'top left' }}
                            >
                              <svg 
                                className="w-5 h-5 text-white drop-shadow-lg" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                                />
                              </svg>
                            </div>
                            {/* Preview badge - shows when hovered */}
                            <div 
                              className={`absolute top-0 left-0 transition-all duration-300 ${
                                isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
                              }`}
                              style={{ transformOrigin: 'top left' }}
                            >
                              <span className="inline-block text-white px-3 py-1 rounded text-sm whitespace-nowrap drop-shadow-lg">
                                Free Preview
                              </span>
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {/* Play button overlay */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayContent(episode, e);
                          }}
                          className="text-white hover:text-white/80 transition-colors flex items-center justify-center cursor-pointer"
                        >
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      {episode.calendarDate && (
                        <p className="text-white/50 text-xs mb-1">
                          {formatDateForDisplay(episode.calendarDate, 'default', calendarType || 'new')}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-white font-semibold">{displayTitle}</h3>
                        {isTodayEpisode && (
                          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                            Today
                          </span>
                        )}
                      </div>
                      {!isOneOff && (
                        <p className="text-white/70 text-sm leading-relaxed line-clamp-2">
                          {episode.description}
                        </p>
                      )}
                    </div>
                    <div className="text-white/60 text-sm flex-shrink-0 self-center">
                      {episode.duration}
                    </div>
                  </div>
                );
              })
            )}
            {episodes.length === 0 && !isLoadingEpisodes && (
              <div className="text-white/60 text-center py-8">
                No episodes available for this series.
              </div>
            )}
          </div>
        </div>
    </BaseModal>
  );
}
