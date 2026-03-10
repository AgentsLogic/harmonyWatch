"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import Image from "next/image";
import VideoPlayer from "./video-player";
import VideoDetails from "./video-details";
import CommentsSection from "./comments-section";
import EpisodeSidebar from "./episode-sidebar";
import MoreEpisodes from "./more-episodes";
import { MuxVideoPlayer } from "./mux-video-player";
import { useContentItems } from "../../lib/hooks/useContentItems";
import type { ContentItem } from "../../lib/hooks/useContentItems";
import { contentItemsService, seriesService } from "../../lib/database";
import { fetchVideoProgress, saveVideoProgress, saveProgressImmediately, clearVideoProgress, isVideoCompleted, createProgressThrottle } from "../../lib/utils/video-progress";
import { useLoading } from "../contexts/loading-context";
import { useModal } from "../contexts/modal-context";
import { motion, AnimatePresence } from "framer-motion";
import { useBodyScrollLock } from "../../lib/hooks/useBodyScrollLock";
import { useCalendarPreference } from "../../lib/hooks/useCalendarPreference";
import { parseLocalDate, formatDateForDisplay, adjustDateForOldCalendar, getTodayDateString } from "../../lib/utils/date-helpers";
import { useUser } from "../contexts/user-context";
import { canUserAccessContent, isContentPremium } from "../../lib/utils/premium-access";
import { HarmonySpinner } from "./harmony-spinner";
import { VideoPlayerSkeleton, VideoDetailsSkeleton, EpisodeSidebarSkeleton } from "./skeleton";
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys';
import { useNativePlayer } from '../../lib/hooks/useNativePlayer';


// Bottom inset so PiP sits above the mobile nav bar (64px nav + safe area + gap)
const PIP_BOTTOM_INSET = 120;

type Props = {
  contentId: string | null;
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
};

export function VideoModal({ contentId, isOpen, onClose, isAnimatingClose = false }: Props) {
  const { hideLoading, showLoading } = useLoading();
  const { user, hasActiveSubscription, hasPlan, refreshUser } = useUser();
  const { setIsVideoModalOpen, setIsVideoModalInPipMode, isSearchModalOpen, isBugModalOpen, isSettingsModalOpen } = useModal();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  
  // Lock body scroll when modal is open or animating close (to prevent layout shift during fade-out)
  useBodyScrollLock(isOpen || isAnimatingClose);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [selectedSeason, setSelectedSeason] = useState(1);
  const { calendarType, updatePreference, isLoading: isLoadingCalendarPreference } = useCalendarPreference(); // Load from database
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // Initialize to current month (YYYY-MM format)
    // Will be adjusted when calendarType loads
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const [relatedEpisodes, setRelatedEpisodes] = useState<ContentItem[]>([]);
  const [allSortedEpisodes, setAllSortedEpisodes] = useState<ContentItem[]>([]); // Store all episodes for month filtering
  const [currentSeries, setCurrentSeries] = useState<any>(null);
  const [allSeries, setAllSeries] = useState<any[]>([]); // Store all series for mapping videos to series
  const [nextEpisodeInSeries, setNextEpisodeInSeries] = useState<ContentItem | null>(null); // Next episode in the same series
  const [todayEpisodeId, setTodayEpisodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isCapacitor, setIsCapacitor] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Native player detection (iOS or Android)
  const isNativePlayer = mounted && typeof window !== 'undefined' 
    && Capacitor.isNativePlatform() 
    && (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android');
  
  // Native player hook (active on iOS and Android)
  const nativePlayer = useNativePlayer();
  const nativePlayerPlaceholderRef = useRef<HTMLDivElement>(null);
  const [isCommentsOverlayDragging, setIsCommentsOverlayDragging] = useState(false);
  const [isCommentsOverlayClosing, setIsCommentsOverlayClosing] = useState(false);
  
  // Progress tracking state
  const [initialTime, setInitialTime] = useState<number>(0);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  
  // Custom drag state for video modal
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDraggingToDismiss, setIsDraggingToDismiss] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [dragDirection, setDragDirection] = useState<{ x: number; y: number } | null>(null);
  const [isSeeking, setIsSeeking] = useState(false); // Track if user is actively seeking
  const [isSnappingBack, setIsSnappingBack] = useState(false); // Track when snapping back to expanded view
  const [isExpandingFromPip, setIsExpandingFromPip] = useState(false); // Track when expanding from PiP to full screen
  const modalRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoContainerRef = useRef<HTMLDivElement>(null);
  const touchStartedOverTimelineRef = useRef<boolean>(false); // Track if touch started over timeline area
  
  
  // Picture-in-picture state
  const [isPipMode, setIsPipMode] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false); // Track MuxVideoPlayer's custom fullscreen state
  const isPlayerFullscreenGuardRef = useRef(false); // Delayed guard to prevent isMobile thrashing during iOS rotation
  const [isAndroidPictureInPicture, setIsAndroidPictureInPicture] = useState(false); // Track Android native PiP mode
  const [pipPosition, setPipPosition] = useState({ x: 0, y: 0 }); // Position for PiP window
  const [isDraggingPip, setIsDraggingPip] = useState(false);
  const pipDragStartXRef = useRef<number | null>(null);
  const pipDragStartYRef = useRef<number | null>(null);
  const pipDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pipDragCurrentPositionRef = useRef<{ x: number; y: number } | null>(null); // Current position during drag (for immediate updates)
  
  const dragThreshold = 80; // Lower threshold for easier dismissal
  const verticalThreshold = 20; // Lower threshold for more sensitive detection (was 40)
  
  // Keep fullscreen guard ref in sync with state, with delayed clearing
  // This prevents isMobile from thrashing during iOS rotation animation
  useEffect(() => {
    if (isPlayerFullscreen) {
      isPlayerFullscreenGuardRef.current = true;
    } else {
      // Delay clearing guard to cover iOS rotation animation (~300ms + buffer)
      const timeout = setTimeout(() => {
        isPlayerFullscreenGuardRef.current = false;
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [isPlayerFullscreen]);

  // Check if mobile and Capacitor, set mounted state
  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      // Don't change isMobile when video player is in custom fullscreen
      // On iOS, when device rotates to landscape, viewport width exceeds 640px
      // but we want to keep mobile layout/theme active
      // Use ref (not state) so the guard persists during iOS rotation exit animation
      if (isPlayerFullscreenGuardRef.current) return;
      setIsMobile(window.innerWidth < 640);
    };
    // Check if running in Capacitor native app
    try {
      setIsCapacitor(Capacitor.isNativePlatform());
    } catch {
      setIsCapacitor(false);
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // Disable custom PiP mode when Android native PiP activates
  // Native Android PiP controls should be used instead of custom web controls
  useEffect(() => {
    if (isAndroidPictureInPicture && isPipMode) {
      console.log('[VideoModal] Android native PiP activated - disabling custom PiP mode');
      setIsPipMode(false);
      // Reset PiP position when switching to native PiP
      setPipPosition({ x: 0, y: 0 });
    }
  }, [isAndroidPictureInPicture, isPipMode]);

  // Helper function to get display date
  // For Old Calendar: always return current date (we'll display current date but show content from 13 days ago)
  // For New Calendar: return the actual date
  const getDisplayDate = useCallback((dateStr: string | null | undefined): string | undefined => {
    if (!dateStr) return undefined;
    // Always return the dateStr as-is - we'll format it for display based on calendar type
    return dateStr;
  }, []);

  // Helper function to filter episodes by month and order them
  const filterEpisodesByMonth = useCallback((episodes: ContentItem[], month: string, excludeContentId: string | null) => {
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
    
      // Find today's episode in the filtered list
      let monthTodayEpisodeIndex = -1;
      let monthTodayEpisode: ContentItem | null = null;
      
      if (monthFilteredEpisodes.length > 0) {
        // For content selection:
        // - New Calendar: Find episode where new_calendar_date matches today
        // - Old Calendar: Find episode where new_calendar_date matches (today - 13 days)
        // But we always DISPLAY today's date, not the adjusted date
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // For Old Calendar, we need to find content that was scheduled for (today - 13 days)
        const contentSearchDateStr = calendarType === 'old' 
          ? adjustDateForOldCalendar(todayStr) // This subtracts 13 days, but we want to ADD 13 days to today to find the content
          : todayStr;
        
        // Actually, for Old Calendar: if today is Jan 3, we want content scheduled for Dec 21 (13 days ago)
        // So we need to find episodes where new_calendar_date = (today - 13 days)
        let searchDateStr: string;
        if (calendarType === 'old') {
          // Parse today's date and subtract 13 days to find which content to show
          const [year, month, day] = todayStr.split('-').map(Number);
          const searchDate = new Date(year, month - 1, day);
          searchDate.setDate(searchDate.getDate() - 13);
          searchDateStr = `${searchDate.getFullYear()}-${String(searchDate.getMonth() + 1).padStart(2, '0')}-${String(searchDate.getDate()).padStart(2, '0')}`;
        } else {
          searchDateStr = todayStr;
        }
        
        console.log('[Video Modal] Finding today episode - calendarType:', calendarType, 'today:', todayStr, 'searchDate:', searchDateStr);
        
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
      // Store today's episode ID for special styling
      setTodayEpisodeId(monthTodayEpisode.id);
      
      // Add today's episode first (even if it's the current content)
      orderedEpisodes.push(monthTodayEpisode);
      
      // Add episodes after today's date in this month
      for (let i = monthTodayEpisodeIndex + 1; i < monthFilteredEpisodes.length; i++) {
        if (monthFilteredEpisodes[i].id !== excludeContentId) {
          orderedEpisodes.push(monthFilteredEpisodes[i]);
        }
      }
      
      // Add episodes before today's date in this month (wrap around)
      for (let i = 0; i < monthTodayEpisodeIndex; i++) {
        if (monthFilteredEpisodes[i].id !== excludeContentId) {
          orderedEpisodes.push(monthFilteredEpisodes[i]);
        }
      }
    } else {
      // No today episode found, just use sorted order for the month
      setTodayEpisodeId(null);
      orderedEpisodes = monthFilteredEpisodes.filter(ep => ep.id !== excludeContentId);
    }
    
      setRelatedEpisodes(orderedEpisodes);
  }, [calendarType, contentId, getDisplayDate, setTodayEpisodeId]);

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
        console.log('[Video Modal] Setting month to current month:', currentMonth, 'calendarType:', calendarType);
        setSelectedMonth(currentMonth);
      }
    }
  }, [calendarType, currentSeries, isLoadingCalendarPreference]);

  // Re-filter episodes when month or calendar type changes (for daily content)
  useEffect(() => {
    const isDailyContent = currentSeries ? Boolean(currentSeries.is_daily_content) === true : false;
    if (allSortedEpisodes.length > 0 && isDailyContent) {
      filterEpisodesByMonth(allSortedEpisodes, selectedMonth, contentId);
    }
  }, [selectedMonth, calendarType, allSortedEpisodes, currentSeries, filterEpisodesByMonth, contentId]);

  // Get modal context for updating contentId
  const { setVideoContentId, setIsSignupModalOpen, setSignupModalInitialStep } = useModal();
  const [hasSwitchedToOldCalendarToday, setHasSwitchedToOldCalendarToday] = useState(false);

  // When Old Calendar is selected and episodes are loaded, switch to the correct "today" episode
  useEffect(() => {
    if (!isLoadingCalendarPreference && calendarType === 'old' && currentSeries && allSortedEpisodes.length > 0 && isOpen) {
      const isDailyContent = Boolean(currentSeries.is_daily_content) === true;
      if (isDailyContent && currentContent) {
        // For Old Calendar: if today is Jan 3, we want content from Nov 20 (13 days before)
        const today = new Date();
        const searchDate = new Date(today);
        searchDate.setDate(searchDate.getDate() - 13);
        const searchDateStr = `${searchDate.getFullYear()}-${String(searchDate.getMonth() + 1).padStart(2, '0')}-${String(searchDate.getDate()).padStart(2, '0')}`;
        
        console.log('[Video Modal] Checking Old Calendar switch - today:', today.toISOString().split('T')[0], 'searchDate:', searchDateStr, 'currentContent:', currentContent.id, 'new_calendar_date:', currentContent.new_calendar_date);
        
        // Check if current content's new_calendar_date matches what we're looking for
        if (currentContent.new_calendar_date !== searchDateStr) {
          const oldCalendarTodayEpisode = allSortedEpisodes.find(ep => {
            if (!ep.new_calendar_date) return false;
            return ep.new_calendar_date === searchDateStr;
          });
          
          console.log('[Video Modal] Found Old Calendar today episode:', oldCalendarTodayEpisode?.id, 'Current content ID:', currentContent.id);
          
          if (oldCalendarTodayEpisode && oldCalendarTodayEpisode.id !== currentContent.id && !hasSwitchedToOldCalendarToday) {
            console.log('[Video Modal] Old Calendar active - switching from', currentContent.id, 'to today episode', oldCalendarTodayEpisode.id);
            setHasSwitchedToOldCalendarToday(true);
            // Update the contentId FIRST so the loadContent effect will reload with the new ID
            setVideoContentId(oldCalendarTodayEpisode.id);
            // Then load the correct content directly
            contentItemsService.getById(oldCalendarTodayEpisode.id).then(correctContent => {
              if (correctContent) {
                console.log('[Video Modal] Loaded Old Calendar today episode:', correctContent.id);
                setCurrentContent(correctContent);
              }
            }).catch(err => {
              console.error('Failed to load Old Calendar today episode:', err);
              setHasSwitchedToOldCalendarToday(false);
            });
          } else if (!oldCalendarTodayEpisode) {
            console.warn('[Video Modal] No episode found for Old Calendar search date:', searchDateStr);
          }
        } else {
          // Current content matches Old Calendar's search date, no switch needed
          console.log('[Video Modal] Current content matches Old Calendar search date, no switch needed');
          // Reset flag if content is correct
          if (hasSwitchedToOldCalendarToday) {
            setHasSwitchedToOldCalendarToday(false);
          }
        }
      }
    }
    
    // Reset flag when calendar type changes back to 'new' or modal closes
    if (calendarType === 'new' || !isOpen) {
      setHasSwitchedToOldCalendarToday(false);
    }
  }, [calendarType, isLoadingCalendarPreference, currentSeries, allSortedEpisodes, currentContent, setVideoContentId, hasSwitchedToOldCalendarToday, isOpen]);

  // Load content data
  useEffect(() => {
    const loadContent = async () => {
      if (!contentId) return;
      
      try {
        setLoading(true);
        setError(null);
        showLoading();
        
        // Get the current content item directly from service
        const content = await contentItemsService.getById(contentId);
        if (!content) {
          setError("Content not found");
          return;
        }
        
        console.log("Loaded content:", content);
        console.log("Mux playback ID:", content.mux_playback_id);
        console.log("Mux asset ID:", content.mux_asset_id);
        
        // If content has mux_asset_id but no mux_playback_id, try to fetch it
        if (content.mux_asset_id && !content.mux_playback_id) {
          console.log('Content has asset ID but no playback ID, attempting to fetch...');
          try {
            const response = await fetch(`/api/upload/video-mux?assetId=${content.mux_asset_id}`);
            if (response.ok) {
              const assetData = await response.json();
              if (assetData.playbackId) {
                console.log('Found playback ID:', assetData.playbackId);
                content.mux_playback_id = assetData.playbackId;
              }
            }
          } catch (error) {
            console.error('Failed to fetch playback ID:', error);
          }
        }
        
        setCurrentContent(content);
        
        // Update URL with short_id when video opens (only if we're not already on that URL)
        // Use pushState instead of router.push to avoid mounting [shortId]/page.tsx
        // This keeps the current page component mounted and avoids race conditions with popstate handlers
        if (content.short_id && isOpen && typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          if (currentPath !== `/${content.short_id}`) {
            window.history.pushState({}, '', `/${content.short_id}`);
          }
        }
        
        if (!content.mux_playback_id) {
          hideLoading();
        }
        
        // Get all series to find which one contains this content
        const seriesList = await seriesService.getAll();
        setAllSeries(seriesList);
        const containingSeries = seriesList.find(s => 
          s.content_ids && s.content_ids.includes(contentId)
        );
        
        if (containingSeries) {
          setCurrentSeries(containingSeries);
          
          // Check premium access and validate subscription status (validates expiration server-side)
          // This ensures expired subscriptions are detected and user is downgraded
          if (content && isOpen) {
            try {
              const checkResponse = await fetch(
                `/api/content/premium-check?contentId=${content.id}&seriesId=${containingSeries.id}`,
                { credentials: 'include' }
              );
              
              if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                // If user was downgraded server-side, refresh user data
                if (!checkData.canAccess && user) {
                  // Refresh user to get updated subscription status
                  await refreshUser();
                }
              }
            } catch (error) {
              console.error('Failed to check premium access:', error);
              // On error, continue - don't block video loading
            }
          }
          
          // Debug: Log series data to check is_daily_content
          console.log('Containing series:', {
            id: containingSeries.id,
            title: containingSeries.title,
            is_daily_content: containingSeries.is_daily_content,
            is_daily_content_type: typeof containingSeries.is_daily_content
          });
          
          // Find the next episode in the series
          if (containingSeries.content_ids && containingSeries.content_ids.length > 0) {
            const currentIndex = containingSeries.content_ids.indexOf(contentId);
            if (currentIndex >= 0 && currentIndex < containingSeries.content_ids.length - 1) {
              // There's a next episode
              const nextEpisodeId = containingSeries.content_ids[currentIndex + 1];
              const nextEpisode = await contentItemsService.getById(nextEpisodeId);
              setNextEpisodeInSeries(nextEpisode);
            } else {
              // No next episode
              setNextEpisodeInSeries(null);
            }
          } else {
            setNextEpisodeInSeries(null);
          }
          
          // Get related episodes from the same series (for daily content only)
          if (containingSeries.content_ids && containingSeries.content_ids.length > 0) {
            // Check if this is a daily content series (handle type coercion)
            const isDailyContent = Boolean(containingSeries.is_daily_content) === true;
            
            if (isDailyContent) {
              // For daily content, fetch episodes with calendar dates and sort by date
              try {
                const response = await fetch(`/api/admin/daily-content/${containingSeries.id}/episodes`);
                if (response.ok) {
                  const data = await response.json();
                  const episodesWithDates = data.episodes || [];
                  
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
                  // Fallback: fetch all public videos
                  const allPublicVideos = await contentItemsService.getPublicVideos();
                  const filtered = allPublicVideos.filter(ep => ep.id !== contentId);
                  setRelatedEpisodes(filtered);
                }
              } catch (error) {
                console.error('Failed to fetch daily content episodes:', error);
                // Fallback: fetch all public videos
                const allPublicVideos = await contentItemsService.getPublicVideos();
                const filtered = allPublicVideos.filter(ep => ep.id !== contentId);
                setRelatedEpisodes(filtered);
              }
            } else {
              // For regular series, show all public videos instead of just series episodes
              const allPublicVideos = await contentItemsService.getPublicVideos();
              const filtered = allPublicVideos.filter(ep => ep.id !== contentId);
              setRelatedEpisodes(filtered);
            }
          } else {
            // No series episodes - no next episode
            setNextEpisodeInSeries(null);
            // No series - fetch all public videos
            const allPublicVideos = await contentItemsService.getPublicVideos();
            const filtered = allPublicVideos.filter(ep => ep.id !== contentId);
            setRelatedEpisodes(filtered);
          }
        } else {
          // Content is not part of a series - no next episode
          setNextEpisodeInSeries(null);
          
          // Check premium access for standalone content (validates expiration server-side)
          if (content && isOpen) {
            try {
              const checkResponse = await fetch(
                `/api/content/premium-check?contentId=${content.id}`,
                { credentials: 'include' }
              );
              
              if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                // If user was downgraded server-side, refresh user data
                if (!checkData.canAccess && user) {
                  // Refresh user to get updated subscription status
                  await refreshUser();
                }
              }
            } catch (error) {
              console.error('Failed to check premium access:', error);
              // On error, continue - don't block video loading
            }
          }
          
          // Content is not part of a series - fetch all public videos
          const allPublicVideos = await contentItemsService.getPublicVideos();
          const filtered = allPublicVideos.filter(ep => ep.id !== contentId);
          setRelatedEpisodes(filtered);
        }
        
        
      } catch (err) {
        console.error('Failed to load content:', err);
        setError("Failed to load content");
      } finally {
        setLoading(false);
      }
    };

    if (contentId && isOpen) {
      // Reset switch flag when contentId changes (new content loaded)
      setHasSwitchedToOldCalendarToday(false);
      loadContent();
    }
  }, [contentId, isOpen]);

  // Load progress when content is loaded
  useEffect(() => {
    async function loadProgress() {
      if (currentContent?.id) {
        setProgressLoaded(false);
        // This will return 0 if user not logged in (no error shown)
        const savedTime = await fetchVideoProgress(currentContent.id);
        
        // Check if this is premium preview content
        const isPremiumContent = isContentPremium(currentContent, currentSeries);
        const baseHasAccess = canUserAccessContent(user, currentContent, currentSeries);
        const hasFullAccess = baseHasAccess;
        const isPremiumPreview = isPremiumContent && user?.user_type === 'free' && !hasFullAccess;
        
        // For premium preview: if saved progress is at or past preview limit, reset to 0
        // This ensures users always start from the beginning when they return to premium content
        // Use a small buffer (0.5 seconds) to account for floating point precision
        if (isPremiumPreview && savedTime >= 299.5) {
          console.log('[VideoModal] Premium preview: saved progress is at limit, resetting to 0', { savedTime, isPremiumPreview });
          setInitialTime(0);
        } else {
          setInitialTime(savedTime);
        }
        setProgressLoaded(true);
      } else {
        setProgressLoaded(true);
      }
    }
    loadProgress();
  }, [currentContent?.id, currentSeries, user]);

  
  // Store last frame to prevent unnecessary updates
  const lastFrameRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const resizeDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const debouncedUpdateFrameRef = useRef<(() => void) | null>(null);
  const lastModalOpenStateRef = useRef(false);
  
  // iOS Native Player: Update frame when placeholder resizes (window resize, orientation change, etc.)
  useEffect(() => {
    if (!isNativePlayer || !isOpen || !nativePlayerPlaceholderRef.current || isPipMode) return;
    // Don't update frame before the player is initialized
    if (!nativePlayerInitializedRef.current) return;
    
    // Reset frame tracking when modal first opens (transition from closed to open)
    if (isOpen && !lastModalOpenStateRef.current) {
      lastFrameRef.current = null;
    }
    lastModalOpenStateRef.current = isOpen;
    
    const placeholder = nativePlayerPlaceholderRef.current;
    
    const updateFrame = () => {
      if (!nativePlayerInitializedRef.current) return;
      const rect = placeholder.getBoundingClientRect();
      
      // Only update if frame actually changed (avoid unnecessary updates)
      const newFrame = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      
      const lastFrame = lastFrameRef.current;
      if (lastFrame && 
          lastFrame.x === newFrame.x &&
          lastFrame.y === newFrame.y &&
          lastFrame.width === newFrame.width &&
          lastFrame.height === newFrame.height) {
        return; // No change, skip update
      }
      
      lastFrameRef.current = newFrame;
      nativePlayer.updateFrame(newFrame, false, 0);
    };
    
    // Debounced update function for ResizeObserver
    const debouncedUpdateFrame = () => {
      if (resizeDebounceTimeoutRef.current) {
        clearTimeout(resizeDebounceTimeoutRef.current);
      }
      resizeDebounceTimeoutRef.current = setTimeout(updateFrame, 50);
    };
    debouncedUpdateFrameRef.current = debouncedUpdateFrame;
    
    // Wait a bit after initialization to let layout settle before starting observer
    const initTimeoutId = setTimeout(() => {
      // Use ResizeObserver to watch for size/position changes
      const resizeObserver = new ResizeObserver(debouncedUpdateFrame);
      resizeObserverRef.current = resizeObserver;
      
      resizeObserver.observe(placeholder);
      
      // Also listen for window resize
      window.addEventListener('resize', debouncedUpdateFrame);
      window.addEventListener('orientationchange', debouncedUpdateFrame);
      
      // Initial update after delay
      updateFrame();
    }, 100); // Small delay to let layout settle
    
    return () => {
      clearTimeout(initTimeoutId);
      if (resizeDebounceTimeoutRef.current) {
        clearTimeout(resizeDebounceTimeoutRef.current);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (debouncedUpdateFrameRef.current) {
        window.removeEventListener('resize', debouncedUpdateFrameRef.current);
        window.removeEventListener('orientationchange', debouncedUpdateFrameRef.current);
        debouncedUpdateFrameRef.current = null;
      }
    };
  }, [isNativePlayer, isOpen, isPipMode, nativePlayer]);

  // Track previous PiP state to detect transitions (not re-renders)
  const prevIsPipModeRef = useRef(false);
  
  // iOS Native Player: Update frame when PiP mode TRANSITIONS (enter/exit only)
  useEffect(() => {
    // Don't do anything before the player is initialized
    if (!isNativePlayer || !nativePlayerInitializedRef.current) return;
    
    const wasPip = prevIsPipModeRef.current;
    prevIsPipModeRef.current = isPipMode;
    
    if (isPipMode) {
      // ENTERING or IN PiP mode: update frame to PiP position
      const placeholder = nativePlayerPlaceholderRef.current;
      if (!placeholder) return;
      
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const pipWidth = Math.min(650, windowWidth * 0.55);
      const pipHeight = pipWidth * (9 / 16);
      const pipX = pipPosition.x > 0 || pipPosition.y > 0 
        ? pipPosition.x 
        : windowWidth - pipWidth - 16;
      const pipY = pipPosition.x > 0 || pipPosition.y > 0 
        ? pipPosition.y 
        : windowHeight - pipHeight - PIP_BOTTOM_INSET;
      
      if (!wasPip) {
        // Apply PiP frame BEFORE setPipMode - native ignores updateFrame when isPipMode,
        // so we must set the frame first, then enable PiP mode.
        nativePlayer.updateFrame({
          x: pipX,
          y: pipY,
          width: pipWidth,
          height: pipHeight,
        }, true, 12);
        nativePlayer.setPipMode(true);
      }
      // When already in PiP (wasPip): don't call updateFrame - native owns position during drag
      
    } else if (wasPip && !isPipMode) {
      // EXITING PiP mode (transition from PiP → normal) — run ONCE
      nativePlayer.setPipMode(false);
      const placeholder = nativePlayerPlaceholderRef.current;
      if (placeholder) {
        const rect = placeholder.getBoundingClientRect();
        nativePlayer.updateFrame({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }, true, 0);
      }
    }
    // If !isPipMode && !wasPip → normal playback, do nothing (ResizeObserver handles inline frames)
  }, [isNativePlayer, isPipMode, pipPosition, nativePlayer]);

  // iOS Native Player: Update frame during PiP drag
  useEffect(() => {
    if (!isNativePlayer || !isPipMode || !isDraggingPip || !pipDragCurrentPositionRef.current) return;
    if (!nativePlayerInitializedRef.current) return;
    
    const windowWidth = window.innerWidth;
    const pipWidth = Math.min(650, windowWidth * 0.55);
    const pipHeight = pipWidth * (9 / 16);
    const pos = pipDragCurrentPositionRef.current;
    
    nativePlayer.updateFrame({
      x: pos.x,
      y: pos.y,
      width: pipWidth,
      height: pipHeight,
    }, false, 12);
  }, [isNativePlayer, isPipMode, isDraggingPip, pipDragCurrentPositionRef, nativePlayer]);

  // Track if native player has been initialized (stores content ID after successful playInline)
  const nativePlayerInitializedRef = useRef<string | null>(null);
  // Use refs for values needed inside the playInline timeout to avoid stale closures
  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;
  
  // iOS Native Player: Play inline on initial load, switch content on episode change
  // Waits for progress to load so startTime (saved position) is correct.
  useEffect(() => {
    if (!isNativePlayer || !isOpen || !currentContent?.mux_playback_id) {
      // Reset when modal closes
      if (!isOpen) {
        nativePlayerInitializedRef.current = null;
      }
      return;
    }
    if (!progressLoaded) {
      return; // Wait for progress to load so initialTime is correct
    }
    
    const isInitialLoad = nativePlayerInitializedRef.current === null;
    const contentChanged = nativePlayerInitializedRef.current !== null 
      && nativePlayerInitializedRef.current !== currentContent.id;
    
    console.log('[VideoModal] Native player effect:', { 
      isInitialLoad, 
      contentChanged, 
      currentContentId: currentContent.id,
      initializedId: nativePlayerInitializedRef.current 
    });
    
    let cancelled = false;
    
    if (isInitialLoad) {
      // DON'T set ref here — only set after playInline succeeds
      
      const doPlayInline = async () => {
        // Wait for placeholder to be ready AND have valid dimensions
        let placeholder = nativePlayerPlaceholderRef.current;
        let retries = 0;
        while (retries < 30 && !cancelled) {
          placeholder = nativePlayerPlaceholderRef.current;
          if (placeholder) {
            const rect = placeholder.getBoundingClientRect();
            // Check if placeholder has valid dimensions (layout has settled)
            if (rect.width > 0 && rect.height > 0) {
              break; // Placeholder is ready with valid dimensions
            }
          }
          await new Promise(r => setTimeout(r, 50));
          retries++;
        }
        
        if (cancelled || !placeholder) {
          console.log('[VideoModal] playInline cancelled or placeholder never ready');
          return;
        }
        
        const rect = placeholder.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          console.error('[VideoModal] Placeholder has invalid dimensions:', rect);
          return;
        }
        
        // Ensure mux_playback_id still exists
        if (!currentContent.mux_playback_id) {
          console.error('[VideoModal] Cannot play native player: mux_playback_id is missing');
          return;
        }
        
        console.log('[VideoModal] Calling playInline with frame:', { x: rect.x, y: rect.y, w: rect.width, h: rect.height });
        
        try {
          await nativePlayer.playInline({
            playbackId: currentContent.mux_playback_id,
            title: currentContent.title,
            startTime: initialTimeRef.current, // Use ref for latest value
            thumbnailUrl: currentContent.mux_thumbnail_url ?? currentContent.thumbnail_url ?? undefined,
            frame: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          });
          if (!cancelled) {
            // Only mark as initialized AFTER successful playInline
            nativePlayerInitializedRef.current = currentContent.id;
            console.log('[VideoModal] playInline succeeded');
          }
        } catch (error) {
          console.error('[VideoModal] Failed to play native player:', error);
          // Don't set ref — leave as null so next render retries
        }
      };
      
      doPlayInline();
      return () => { cancelled = true; };
      
    } else if (contentChanged) {
      // DON'T set ref here — only set after switchContent succeeds
      
      const doSwitchContent = async () => {
        if (!currentContent.mux_playback_id) {
          console.error('[VideoModal] Cannot switch native player content: mux_playback_id is missing');
          return;
        }
        
        console.log('[VideoModal] Calling switchContent');
        
        try {
          await nativePlayer.switchContent({
            playbackId: currentContent.mux_playback_id,
            title: currentContent.title,
            startTime: initialTimeRef.current,
            thumbnailUrl: currentContent.mux_thumbnail_url ?? currentContent.thumbnail_url ?? undefined,
          });
          if (!cancelled) {
            nativePlayerInitializedRef.current = currentContent.id;
            console.log('[VideoModal] switchContent succeeded');
          }
        } catch (error) {
          console.error('[VideoModal] Failed to switch, falling back to playInline:', error);
          // Fallback: reset ref so next render does playInline
          nativePlayerInitializedRef.current = null;
        }
      };
      
      doSwitchContent();
      return () => { cancelled = true; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlayer, isOpen, currentContent?.id, currentContent?.mux_playback_id, progressLoaded]);
  
  // iOS Native Player: Update frame during drag-to-dismiss (only when actually dragging)
  // NOTE: On Android, native code handles frame updates directly during drag for smooth tracking
  // This effect is kept for iOS compatibility and non-drag frame updates (window resize, etc.)
  useEffect(() => {
    if (!isNativePlayer || !isOpen || !nativePlayerPlaceholderRef.current || isPipMode) return;
    if (!nativePlayerInitializedRef.current) return;
    // Skip during drag - native code handles frame updates directly for smooth tracking
    if (dragX !== 0 || dragY !== 0) return;
    
    const placeholder = nativePlayerPlaceholderRef.current;
    const rect = placeholder.getBoundingClientRect();
    
    // Update frame to match placeholder position (for non-drag updates like window resize)
    nativePlayer.updateFrame({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }, false, 0);
  }, [isNativePlayer, isOpen, dragX, dragY, isPipMode, nativePlayer]);

  // Throttled save for native player (15s interval, matches desktop)
  const throttledNativeSave = useMemo(() => createProgressThrottle(
    async (contentId: string, t: number, d: number) => {
      await saveVideoProgress(contentId, t, d);
    },
    15000
  ), []);

  // Handle time updates for progress tracking
  const handleTimeUpdate = useCallback(async (currentTime: number, duration: number) => {
    if (!currentContent?.id) return;
    
    setVideoDuration(duration);
    lastNativeTimeRef.current = { currentTime, duration };
    
    if (isNativePlayer) {
      // Native: throttle saves to every 15 seconds (matches desktop)
      throttledNativeSave(currentContent.id, currentTime, duration);
    } else {
      // Desktop: MuxVideoPlayer already throttles before calling onTimeUpdate
      await saveVideoProgress(currentContent.id, currentTime, duration);
    }
    
    // Clear progress if video completed (>95%) (no-op if not logged in)
    if (isVideoCompleted(currentTime, duration)) {
      await clearVideoProgress(currentContent.id);
    }
  }, [currentContent?.id, isNativePlayer, throttledNativeSave]);

  // Use refs for callback values that change frequently, to keep the callbacks useEffect stable
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handleTimeUpdateRef = useRef(handleTimeUpdate);
  handleTimeUpdateRef.current = handleTimeUpdate;
  const pipPositionRef = useRef(pipPosition);
  pipPositionRef.current = pipPosition;
  const triggerPipModeRef = useRef<(() => void) | null>(null);
  const lastNativeTimeRef = useRef<{ currentTime: number; duration: number }>({ currentTime: 0, duration: 0 });
  const currentContentRef = useRef(currentContent);
  currentContentRef.current = currentContent;
  
  // iOS Native Player: Wire up event callbacks (runs ONCE when modal opens, cleans up when it closes)
  useEffect(() => {
    if (!isNativePlayer || !isOpen) return;
    
    console.log('[VideoModal] Wiring up native player callbacks');
    
    // Set up callbacks — use refs so they always call the latest version
    nativePlayer.setOnTimeUpdate((currentTime: number, duration: number) => {
      handleTimeUpdateRef.current(currentTime, duration);
    });
    nativePlayer.setOnStateChange((isPlaying: boolean) => {
      if (!isPlaying) {
        // Save on pause (match desktop behavior)
        const { currentTime, duration } = lastNativeTimeRef.current;
        const content = currentContentRef.current;
        if (content?.id && duration > 0) {
          saveProgressImmediately(content.id, currentTime, duration);
        }
      }
      setIsPlaying(isPlaying);
    });
    nativePlayer.setOnClosed((closedCurrentTime: number) => {
      // Save on close (match desktop behavior)
      const { duration } = lastNativeTimeRef.current;
      const content = currentContentRef.current;
      if (content?.id && duration > 0) {
        saveProgressImmediately(content.id, closedCurrentTime, duration);
      }
      onCloseRef.current();
    });
    nativePlayer.setOnEnded(() => {
      // Clear progress on video end (match desktop behavior)
      const content = currentContentRef.current;
      if (content?.id) {
        clearVideoProgress(content.id);
      }
    });
    nativePlayer.setOnFullscreenChange(setIsPlayerFullscreen);
    nativePlayer.setOnPipClose(() => {
      const { currentTime, duration } = lastNativeTimeRef.current;
      const content = currentContentRef.current;
      if (content?.id && duration > 0) {
        saveProgressImmediately(content.id, currentTime, duration);
      }
      onCloseRef.current();
    });
    nativePlayer.setOnPipTap(() => {
      // For iOS native: just exit PiP mode immediately
      // The PiP useEffect will call nativePlayer.setPipMode(false) + updateFrame(placeholder, animated: true)
      // The native player handles the visual animation from PiP position back to inline
      setIsPipMode(false);
      setPipPosition({ x: 0, y: 0 });
      setIsVideoModalInPipMode(false);
      setDragX(0);
      setDragY(0);
    });
    nativePlayer.setOnRequestPip(() => {
      // Chevron down in inline mode: enter custom PiP (not full close)
      console.log('[VideoModal] requestPip received, triggerPipModeRef.current =', !!triggerPipModeRef.current);
      triggerPipModeRef.current?.();
    });
    nativePlayer.setOnNativePipRestore(() => {
      // Modal should already be visible, just ensure state is correct
      setIsPlayerFullscreen(false);
    });
    
    // Native drag-to-dismiss handlers
    nativePlayer.setOnDragStart(() => {
      console.log('[VideoModal] Native drag start');
      setIsDraggingToDismiss(true);
      setIsDragging(true);
      touchStartTimeRef.current = Date.now();
    });
    
    nativePlayer.setOnDragMove((deltaX: number, deltaY: number) => {
      // Constrain: only allow downward movement, no upward
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const playerHeight = viewportWidth * (9 / 16);
      
      const constrainedDeltaX = 0; // No horizontal movement
      const constrainedDeltaY = Math.max(0, Math.min(deltaY, viewportHeight - playerHeight));
      
      setDragX(constrainedDeltaX);
      setDragY(constrainedDeltaY);
      
      if (constrainedDeltaY > 0) {
        setDragDirection({ x: 0, y: 1 });
      }
      
      // Native iOS/Android code moves the player view directly at 60fps during drag.
      // No updateFrame() call here — the JS→native bridge round-trip is too slow.
    });
    
    nativePlayer.setOnDragEnd((deltaX: number, deltaY: number) => {
      console.log('[VideoModal] Native drag end, deltaY:', deltaY);
      
      const windowHeight = window.innerHeight;
      const constrainedDeltaY = Math.max(0, deltaY);
      const verticalDragPercentage = (constrainedDeltaY / windowHeight) * 100;
      const minVerticalDragPercentage = 20;
      
      // Calculate velocity
      const MIN_VELOCITY = 0.5;
      const MIN_VELOCITY_DISTANCE = 50;
      let verticalVelocity = 0;
      
      if (touchStartTimeRef.current !== null) {
        const timeDelta = Date.now() - touchStartTimeRef.current;
        if (timeDelta > 0) {
          verticalVelocity = constrainedDeltaY / timeDelta;
        }
      }
      
      const meetsVelocityThreshold = verticalVelocity >= MIN_VELOCITY && constrainedDeltaY >= MIN_VELOCITY_DISTANCE;
      const meetsDistanceThreshold = verticalDragPercentage >= minVerticalDragPercentage;
      
      if (meetsVelocityThreshold || meetsDistanceThreshold) {
        // Trigger PiP mode
        triggerPipModeRef.current?.();
      } else {
        // Snap back
        setIsDragging(false);
        setIsDraggingToDismiss(false);
        setIsSnappingBack(true);
        setDragX(0);
        setDragY(0);
        setDragDirection(null);
        
        // Move native player back to original position
        if (nativePlayerInitializedRef.current && nativePlayerPlaceholderRef.current) {
          const rect = nativePlayerPlaceholderRef.current.getBoundingClientRect();
          nativePlayer.updateFrame({
            x: rect.x,
            y: 60,
            width: rect.width,
            height: rect.height,
          }, true, 0);
        }
        
        setTimeout(() => {
          dragStartXRef.current = null;
          dragStartYRef.current = null;
          touchStartTimeRef.current = null;
          setIsSnappingBack(false);
        }, 400);
      }
    });
    
    // Cleanup: stop native player when modal closes or component unmounts
    return () => {
      console.log('[VideoModal] Cleaning up: stopping native player');
      nativePlayer.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativePlayer, isOpen]);

  // Memoize callbacks to prevent Media Session useEffect from re-running
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    // Store video element reference when it plays
    const muxVideo = document.querySelector('mux-video') as any;
    if (muxVideo) {
      videoElementRef.current = muxVideo.shadowRoot?.querySelector('video') || muxVideo.querySelector('video') || null;
    }
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Hide loading overlay on error
  useEffect(() => {
    if (error) {
      hideLoading();
    }
  }, [error, hideLoading]);

  useEffect(() => {
    return () => {
      hideLoading();
    };
  }, [hideLoading]);

  // Reset drag state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDragX(0);
      setDragY(0);
      dragStartXRef.current = null;
      dragStartYRef.current = null;
      touchStartTimeRef.current = null;
      setIsDragging(false);
      setIsScrolling(false);
      setIsDraggingToDismiss(false);
      setIsClosing(false);
      setDragDirection(null);
      setIsPipMode(false);
      setPipPosition({ x: 0, y: 0 });
      setIsDraggingPip(false);
      setIsSnappingBack(false);
      setIsExpandingFromPip(false);
      setIsPlayerFullscreen(false); // Reset player fullscreen state
      pipDragStartXRef.current = null;
      pipDragStartYRef.current = null;
      pipDragOffsetRef.current = null;
      pipDragCurrentPositionRef.current = null;
      // Reset PiP mode in modal context
      setIsVideoModalInPipMode(false);
    }
  }, [isOpen, setIsVideoModalInPipMode]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
        setCurrentContent(null);
        setRelatedEpisodes([]);
        setAllSortedEpisodes([]);
        setCurrentSeries(null);
        setTodayEpisodeId(null);
        setHasSwitchedToOldCalendarToday(false); // Reset switch flag when modal closes
        // Don't reset calendar type - it's persisted in database
        // Reset to current month when modal closes
        const now = new Date();
        setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      setError(null);
      setVideoError(null);
      setInitialTime(0);
      setVideoDuration(0);
      setLoading(true);
    }
  }, [isOpen]);

  // Custom drag handlers for video modal
  const handleClose = () => {
    // Don't close video modal if any overlaying modals are open
    if (isSearchModalOpen || isBugModalOpen || isSettingsModalOpen) {
      return;
    }
    
    // Update URL to homepage silently when closing (only if not already on homepage)
    // Use window.history.replaceState to avoid page refresh
    if (pathname !== '/' && 
        (pathname.startsWith('/video/') || 
         (pathname.length === 8 && pathname.startsWith('/')))) {
      window.history.replaceState(null, '', '/');
    }
    
    // On desktop, trigger fade-out animation when clicking outside
    // On mobile, close immediately (drag-to-dismiss handles animation)
    if (!isMobile) {
      onClose(true); // delayClose=true triggers fade-out animation
    } else {
      onClose(false); // Immediate close on mobile
    }
  };

  // Helper function to check if touch is over timeline/progress bar area
  const isTouchOverTimeline = (clientX: number, clientY: number): boolean => {
    // Find the video player element (try multiple methods)
    let videoPlayer: Element | null = null;
    
    // Method 1: Use videoElementRef if available
    if (videoElementRef.current) {
      videoPlayer = videoElementRef.current.closest('media-theme-notflix') || 
                    videoElementRef.current.closest('mux-player');
    }
    
    // Method 2: Find by querying the modal
    if (!videoPlayer && modalRef.current) {
      videoPlayer = modalRef.current.querySelector('media-theme-notflix') ||
                    modalRef.current.querySelector('mux-player');
    }
    
    // Method 3: Fallback to document query
    if (!videoPlayer) {
      videoPlayer = document.querySelector('media-theme-notflix') ||
                    document.querySelector('mux-player');
    }
    
    if (!videoPlayer) return false;
    
    // Get the bounding rect of the video player
    const playerRect = videoPlayer.getBoundingClientRect();
    
    // Timeline/control bar is at the bottom of the video player
    // Use a larger area (bottom 15% of height) to include time display and fullscreen button
    const timelineAreaHeight = playerRect.height * 0.15; // Bottom 15% of video player
    const timelineTop = playerRect.bottom - timelineAreaHeight;
    
    // Check if touch is within the video player horizontal bounds and in the timeline area
    const isInPlayerHorizontalBounds = clientX >= playerRect.left && clientX <= playerRect.right;
    const isInTimelineArea = clientY >= timelineTop && clientY <= playerRect.bottom;
    
    return isInPlayerHorizontalBounds && isInTimelineArea;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isOpen || !isMobile) return;
    // Disable drag-to-dismiss when custom fullscreen is enabled
    if (isPlayerFullscreen) return;
    const touch = e.touches[0];
    
    // Check if touch started over timeline area
    touchStartedOverTimelineRef.current = isTouchOverTimeline(touch.clientX, touch.clientY);
    
    // Reset ALL drag-related state on new touch to ensure clean slate
    dragStartXRef.current = touch.clientX;
    dragStartYRef.current = touch.clientY;
    touchStartTimeRef.current = Date.now();
    setIsDragging(true);
    setDragDirection(null);
    setIsScrolling(false);
    setIsDraggingToDismiss(false);
    setIsSeeking(false);
    setDragX(0);
    setDragY(0);
    
    // Don't prevent default or stop propagation initially
    // We'll determine if it's a drag gesture in onTouchMove
    // If it becomes a drag-to-dismiss, we'll prevent propagation then
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || dragStartXRef.current === null || dragStartYRef.current === null) {
      return;
    }
    // Disable drag-to-dismiss when custom fullscreen is enabled
    if (isPlayerFullscreen) {
      // Reset drag state if we enter fullscreen during a drag
      if (isDraggingToDismiss) {
        setIsDraggingToDismiss(false);
        setDragY(0);
        setDragX(0);
      }
      return;
    }
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - dragStartXRef.current;
    const deltaY = currentY - dragStartYRef.current;
    
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    // Don't allow drag-to-dismiss if touch started over timeline area
    if (touchStartedOverTimelineRef.current) {
      // If touch started over timeline, don't allow drag-to-dismiss
      // This prevents conflict with seeking gestures
      return;
    }
    
    // Early detection: If there's clear vertical movement down with minimal horizontal, start drag-to-dismiss immediately
    // This makes the gesture more responsive and consistent
    // Check this FIRST, before seeking or scroll detection, to prioritize drag-to-dismiss
    // Lowered threshold to 5px and more lenient ratio for even earlier detection
    const earlyDetectionCheck = !isDraggingToDismiss && !isSeeking && !isScrolling && deltaY > 0 && absDeltaY >= 5 && absDeltaY > absDeltaX * 1.1;
    if (earlyDetectionCheck) {
      setIsDraggingToDismiss(true);
      setIsScrolling(false); // Clear scroll state if we're dragging to dismiss
      e.preventDefault();
      e.stopPropagation();
      // Continue to main drag logic below to handle proper drag updates
    }
    
    // If user starts dragging horizontally first (seeking), disable drag-to-dismiss for this gesture
    // Make seeking detection much stricter - require significant horizontal movement AND horizontal must be clearly dominant
    // Only detect seeking if we haven't already started dragging to dismiss
    const seekingCheck = !isSeeking && !isDraggingToDismiss && absDeltaX >= 30 && absDeltaX > absDeltaY * 1.5;
    if (seekingCheck) {
      setIsSeeking(true);
      // Cancel any drag tracking to prevent interference
      dragStartXRef.current = null;
      dragStartYRef.current = null;
      setIsDragging(false);
      // Don't prevent default - let the video player handle seeking
      return;
    }
    
    // If user is actively seeking AND we haven't started dragging to dismiss, don't allow drag-to-dismiss
    // But if we're already dragging to dismiss, allow it to continue even if there's some horizontal movement
    if (isSeeking && !isDraggingToDismiss) {
      return;
    }
    
    // IMPORTANT: Check for drag-to-dismiss BEFORE scroll detection
    // This ensures vertical drags are detected even if they could be scrolling
    // Only detect scrolling if we're clearly NOT dragging to dismiss
    if (isDraggingToDismiss) {
      // Already dragging to dismiss, skip scroll detection
    } else if (absDeltaX < verticalThreshold && absDeltaY > verticalThreshold * 1.5) {
      // Only set scrolling if vertical movement is significantly more than threshold
      // This prevents scroll from blocking drag-to-dismiss on borderline cases
      setIsScrolling(true);
      return;
    }
    
    if (isScrolling && !isDraggingToDismiss) {
      return;
    }
    
    // If we're already dragging to dismiss, continue updating the drag position
    // Don't check for vertical/horizontal ratios - just continue the drag
    if (isDraggingToDismiss) {
      // Continue drag-to-dismiss regardless of finger position
      // This allows the user to deviate from the original path without stopping
    } else {
      // Only trigger drag-to-dismiss if the drag is primarily VERTICAL (not horizontal)
      // This prevents dismissing when user is seeking horizontally on the video player
      // Made more lenient: allow more horizontal movement and lower vertical threshold
      const isPrimarilyVertical = absDeltaY >= absDeltaX * 0.7; // More lenient: Y must be at least 70% of X
      const hasSignificantVerticalMovement = absDeltaY >= verticalThreshold;
      const hasMinimalHorizontalMovement = absDeltaX < verticalThreshold * 2; // Allow more horizontal movement (was 1.5x)
      
      // Only allow drag-to-dismiss if:
      // 1. Movement is primarily vertical (more Y than X)
      // 2. Vertical movement is significant
      // 3. Horizontal movement is minimal (not seeking)
      // 4. User is not actively seeking
      // 5. Touch did NOT start over timeline area
      const mainDetectionCheck = isPrimarilyVertical && hasSignificantVerticalMovement && hasMinimalHorizontalMovement && !isSeeking && !touchStartedOverTimelineRef.current;
      if (mainDetectionCheck) {
        setIsDraggingToDismiss(true);
      }
    }
    
    // If we're dragging to dismiss (either just started or already in progress), update the drag position
    // This allows the drag to continue even if the finger deviates from the original path
    if (isDraggingToDismiss) {
      // Prevent video controls from receiving touch events during drag-to-dismiss
      e.preventDefault();
      e.stopPropagation();
      
      // Constrain drag to keep player within screen bounds during drag
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate player dimensions (16:9 aspect ratio, full width on mobile)
      const playerWidth = viewportWidth;
      const playerHeight = viewportWidth * (9 / 16); // 16:9 aspect ratio
      
      // Player is fixed at top-0 left-0 right-0, so it spans full width
      // When we translate by (dragX, dragY), the element moves from its origin
      // The element's bounding box after translate will be:
      // - Left: dragX
      // - Right: dragX + playerWidth  
      // - Top: dragY
      // - Bottom: dragY + playerHeight
      // To keep it fully visible:
      // - Left edge >= 0: dragX >= 0
      // - Right edge <= viewportWidth: dragX + playerWidth <= viewportWidth, so dragX <= 0
      // - Top edge >= 0: dragY >= 0
      // - Bottom edge <= viewportHeight: dragY + playerHeight <= viewportHeight, so dragY <= viewportHeight - playerHeight
      // Since playerWidth = viewportWidth, dragX must be 0 for full horizontal visibility
      // For vertical, we can allow movement down but not up
      const minDragX = 0; // Can't move left (would push right edge off screen)
      const maxDragX = 0; // Can't move right (would push left edge off screen)
      const minDragY = 0; // Can't move up (would push bottom edge off screen)
      const maxDragY = viewportHeight - playerHeight; // Can move down until bottom edge hits bottom
      
      // Clamp deltaX and deltaY to keep player fully within bounds
      const constrainedDeltaX = Math.max(minDragX, Math.min(maxDragX, deltaX));
      const constrainedDeltaY = Math.max(minDragY, Math.min(maxDragY, deltaY));
      
      setDragX(constrainedDeltaX);
      setDragY(constrainedDeltaY);
      
      const totalDistance = Math.sqrt(constrainedDeltaX * constrainedDeltaX + constrainedDeltaY * constrainedDeltaY);
      if (totalDistance > 0) {
        setDragDirection({
          x: constrainedDeltaX / totalDistance,
          y: constrainedDeltaY / totalDistance
        });
      }
    } else if (absDeltaY >= 5 && absDeltaY >= absDeltaX * 0.7 && absDeltaX < verticalThreshold * 2) {
      // Small vertical drag - scale it proportionally and constrain
      // Lower threshold (5px instead of 10px) and more lenient ratio for earlier detection
      const scale = absDeltaY / verticalThreshold;
      const scaledDeltaX = deltaX * scale;
      const scaledDeltaY = deltaY * scale;
      
      // Constrain scaled values too
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const playerWidth = viewportWidth;
      const playerHeight = viewportWidth * (9 / 16);
      
      const minDragX = 0;
      const maxDragX = 0;
      const minDragY = 0;
      const maxDragY = viewportHeight - playerHeight;
      
      const constrainedDeltaX = Math.max(minDragX, Math.min(maxDragX, scaledDeltaX));
      const constrainedDeltaY = Math.max(minDragY, Math.min(maxDragY, scaledDeltaY));
      
      setDragX(constrainedDeltaX);
      setDragY(constrainedDeltaY);
      setIsDraggingToDismiss(true);
      // Prevent video controls from receiving touch events during drag-to-dismiss
      e.preventDefault();
      e.stopPropagation();
    } else if (isDraggingToDismiss) {
      // Continue preventing propagation during active drag-to-dismiss
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Extract PiP trigger logic into reusable function
  const triggerPipMode = useCallback(() => {
      // Calculate PiP position (bottom right corner)
      const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const pipWidth = Math.min(650, windowWidth * 0.55); // PiP width (max 650px or 55% of screen)
              const pipHeight = pipWidth * (9 / 16); // Maintain 16:9 aspect ratio
      const pipX = windowWidth - pipWidth - 16; // 16px from right edge
      const pipY = windowHeight - pipHeight - PIP_BOTTOM_INSET; // Above bottom nav
      
      // Calculate transform to move from current position to PiP position
      const currentPlayerWidth = windowWidth;
      const currentPlayerHeight = windowWidth * (9 / 16);
      const scale = pipWidth / currentPlayerWidth;
      
      // Calculate the center point of the current player
      const currentCenterX = windowWidth / 2;
      const currentCenterY = 60 + (currentPlayerHeight / 2); // 60px is the top margin
      
      // Calculate the center point of the PiP
      const pipCenterX = pipX + (pipWidth / 2);
      const pipCenterY = pipY + (pipHeight / 2);
      
      // Calculate the translation needed
      const translateX = pipCenterX - currentCenterX;
      const translateY = pipCenterY - currentCenterY;
      
      setDragX(translateX);
      setDragY(translateY);
      setIsDragging(false);
      setIsPipMode(true);
      
      // Store PiP position for later use
      setPipPosition({ x: pipX, y: pipY });
      
      // Set PiP mode in modal context to remove blur/scale from homepage
      setIsVideoModalInPipMode(true);
      
      // Update URL to homepage silently when entering PiP
      if (pathname !== '/' && 
          (pathname.startsWith('/video/') || 
           (pathname.length === 8 && pathname.startsWith('/')))) {
        window.history.replaceState(null, '', '/');
      }
      
      // Invalidate recently viewed cache when entering PiP mode (user goes back to home)
      if (user?.id) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.recentlyViewed.byUser(user.id) 
        });
      }
      
      setTimeout(() => {
        dragStartXRef.current = null;
        dragStartYRef.current = null;
        touchStartTimeRef.current = null;
        setIsDragging(false);
        setIsDraggingToDismiss(false);
        setIsScrolling(false);
        setIsSeeking(false);
        setDragDirection(null);
      }, 400);
  }, [pathname, setIsVideoModalInPipMode, user?.id, queryClient]);
  
  // Keep triggerPipMode ref in sync
  triggerPipModeRef.current = triggerPipMode;

  // Listen for custom event to trigger PiP mode from mobile nav
  useEffect(() => {
    if (!isOpen) return;
    
    const handleTriggerPip = () => {
      triggerPipMode();
    };
    
    window.addEventListener('trigger-video-pip', handleTriggerPip);
    
    return () => {
      window.removeEventListener('trigger-video-pip', handleTriggerPip);
    };
  }, [isOpen, triggerPipMode]);

  // Listen for event to exit custom PiP when Android app is minimized (to transition to native PiP)
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    
    const handleExitCustomPipForNative = () => {
      console.log('[VideoModal] Exit custom PiP for native PiP requested');
      if (isPipMode) {
        // Exit custom PiP mode - reset to expanded state
        setIsPipMode(false);
        setDragX(0);
        setDragY(0);
        setPipPosition({ x: 0, y: 0 });
        setIsVideoModalInPipMode(false);
        console.log('[VideoModal] Custom PiP exited, ready for native PiP');
      }
    };
    
    window.addEventListener('exit-custom-pip-for-native', handleExitCustomPipForNative);
    
    return () => {
      window.removeEventListener('exit-custom-pip-for-native', handleExitCustomPipForNative);
    };
  }, [isOpen, isMobile, isPipMode]);

  // Prevent main scroll container from scrolling when dragging PiP
  useEffect(() => {
    if (!isMobile || !isPipMode || isAndroidPictureInPicture) return;
    
    const mainScrollContainer = document.getElementById('main-scroll-container');
    if (!mainScrollContainer) return;
    
    // Only prevent scrolling on the main container, not on the PiP container itself
    const preventScroll = (e: TouchEvent) => {
      // Check if the touch target is inside the PiP container
      const pipContainer = pipVideoContainerRef.current;
      if (pipContainer && e.target && pipContainer.contains(e.target as Node)) {
        // This touch is on the PiP container - allow it to bubble to our handlers
        // Only prevent if we're actively dragging (not just touching)
        if (isDraggingPip) {
          // We're dragging - prevent scroll but let PiP handlers work
          // The PiP handlers already called preventDefault, so this is just a safety net
          return;
        }
        // Not dragging yet - let the touch event reach PiP handlers first
        return;
      }
      
      // Touch is outside PiP container - check if we're dragging PiP
      // If we are, prevent scrolling on the main container
      if (isDraggingPip) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    // Only prevent on touchmove (when actually dragging), not touchstart
    // This allows the PiP touch handlers to work first
    mainScrollContainer.addEventListener('touchmove', preventScroll, { passive: false, capture: false });
    
    // Set touch-action CSS to prevent scrolling when actively dragging
    const updateTouchAction = () => {
      if (isDraggingPip) {
        mainScrollContainer.style.touchAction = 'none';
        mainScrollContainer.style.overflow = 'hidden';
      } else {
        mainScrollContainer.style.touchAction = '';
        mainScrollContainer.style.overflow = '';
      }
    };
    
    // Update when isDraggingPip changes
    updateTouchAction();
    
    return () => {
      mainScrollContainer.removeEventListener('touchmove', preventScroll);
      mainScrollContainer.style.touchAction = '';
      mainScrollContainer.style.overflow = '';
    };
  }, [isMobile, isPipMode, isAndroidPictureInPicture, isDraggingPip]);

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile) return;
    // Disable drag-to-dismiss when custom fullscreen is enabled
    if (isPlayerFullscreen) {
      // Reset any drag state
      setIsDraggingToDismiss(false);
      setDragY(0);
      setDragX(0);
      dragStartXRef.current = null;
      dragStartYRef.current = null;
      setIsDragging(false);
      setIsSeeking(false);
      setIsScrolling(false);
      return;
    }
    e.stopPropagation();
    
    // Reset ALL states when touch ends to ensure clean state for next gesture
    setIsSeeking(false);
    
    if (isScrolling && !isDraggingToDismiss) {
      // Only treat as scroll if we weren't dragging to dismiss
      dragStartXRef.current = null;
      dragStartYRef.current = null;
      setIsDragging(false);
      setIsScrolling(false);
      setIsDraggingToDismiss(false);
      return;
    }
    
    const windowHeight = window.innerHeight;
    const verticalDragPercentage = (Math.abs(dragY) / windowHeight) * 100;
    const minVerticalDragPercentage = 20; // Require at least 20% of viewport height
    
    // Calculate velocity for quick swipe detection
    const MIN_VELOCITY = 0.5; // pixels per millisecond (~500px/sec)
    const MIN_VELOCITY_DISTANCE = 50; // minimum pixels for velocity trigger
    let verticalVelocity = 0;
    let timeDelta = 0;
    let triggerReason: 'velocity' | 'distance' | null = null;
    
    if (touchStartTimeRef.current !== null) {
      timeDelta = Date.now() - touchStartTimeRef.current;
      if (timeDelta > 0) {
        verticalVelocity = Math.abs(dragY) / timeDelta;
      }
    }
    
    // Check if either velocity threshold OR distance threshold is met
    const meetsVelocityThreshold = verticalVelocity >= MIN_VELOCITY && Math.abs(dragY) >= MIN_VELOCITY_DISTANCE;
    const meetsDistanceThreshold = verticalDragPercentage >= minVerticalDragPercentage;
    
    if (meetsVelocityThreshold || meetsDistanceThreshold) {
      triggerReason = meetsVelocityThreshold ? 'velocity' : 'distance';
      triggerPipMode();
    } else {
      // Snap back - reset all states for next gesture
      // Stop dragging immediately so transition can take effect
      setIsDragging(false);
      setIsDraggingToDismiss(false);
      setIsScrolling(false);
      setIsSeeking(false);
      setIsSnappingBack(true); // Enable smooth snap-back transition
      
      // Smoothly animate back to original position (transition will handle this)
      setDragX(0);
      setDragY(0);
      setDragDirection(null);
      
      // Clear refs and snap-back state after transition completes
      setTimeout(() => {
        dragStartXRef.current = null;
        dragStartYRef.current = null;
        touchStartTimeRef.current = null;
        setIsSnappingBack(false);
      }, 400); // Match transition duration
    }
  };

  // Calculate custom transform for video modal
  // Use total drag distance instead of just dragY for any direction
  const totalDragDistance = Math.sqrt(dragX * dragX + dragY * dragY);
  const maxDragDistance = typeof window !== 'undefined'
    ? Math.sqrt(window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight)
    : 1000;
  const dragProgress = Math.min(totalDragDistance / (maxDragDistance * 0.5), 1);
  
  // Calculate scale and position for PiP mode
  let scale = 1;
  let finalX = dragX;
  let finalY = dragY;
  
  // If expanding from PiP, animate back to center (dragX/dragY will animate to 0)
  if (isExpandingFromPip) {
    // During expansion, use the current dragX/dragY (which will animate to 0)
    // Keep scale at 1 for full screen
    // marginTop is already set to 60px during expansion, so transform calculation is correct
    finalX = dragX;
    finalY = dragY;
    scale = 1;
  } else if (isPipMode) {
    // In PiP mode, calculate scale and position
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 1000;
    const pipWidth = Math.min(650, windowWidth * 0.55);
    const pipHeight = pipWidth * (9 / 16); // Maintain 16:9 aspect ratio
    const currentPlayerWidth = windowWidth;
    scale = pipWidth / currentPlayerWidth;
    
    // Use stored pipPosition if it exists (user has dragged), otherwise calculate default bottom-right position
    // During active drag, use the ref for immediate updates without re-render delay
    let pipX: number;
    let pipY: number;
    if (isDraggingPip && pipDragCurrentPositionRef.current) {
      // Use current drag position from ref (immediate, no re-render delay)
      pipX = pipDragCurrentPositionRef.current.x;
      pipY = pipDragCurrentPositionRef.current.y;
    } else if (pipPosition.x > 0 || pipPosition.y > 0) {
      // Use stored position from user drag (after drag ends)
      pipX = pipPosition.x;
      pipY = pipPosition.y;
    } else {
      // Calculate default bottom-right position (initial PiP entry)
      pipX = windowWidth - pipWidth - 16; // 16px from right edge
      pipY = windowHeight - pipHeight - PIP_BOTTOM_INSET; // Above bottom nav
    }
    
    // Calculate center points for transform
    const currentPlayerHeight = windowWidth * (9 / 16);
    const currentCenterX = windowWidth / 2;
    const currentCenterY = 60 + (currentPlayerHeight / 2);
    const pipCenterX = pipX + (pipWidth / 2);
    const pipCenterY = pipY + (pipHeight / 2);
    finalX = pipCenterX - currentCenterX;
    finalY = pipCenterY - currentCenterY;
  } else if (isDragging || isDraggingToDismiss) {
    // During drag, scale down slightly
    scale = 1 - (dragProgress * 0.2); // Scale down to 0.8
  }
  
  // Fade modal content to 0 immediately when dragging starts (any drag distance > 0)
  // Keep faded out while closing or in PiP mode, fade back in when drag returns to 0
  const modalOpacity = ((isDragging || isClosing || isPipMode) && totalDragDistance > 0) ? 0 : 1;
  const videoOpacity = 1; // Video player stays fully visible

  // Animation variants for Framer Motion
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 1,
        ease: [0.4, 0, 0.2, 1] as const,
      }
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1] as const,
      }
    }
  };

  // Helper function to render custom modal container
  const renderCustomModal = (children: React.ReactNode, overflowClass: string = "overflow-y-auto overflow-x-hidden") => {
    // In PiP mode on mobile, don't render the modal container (only the video player is visible)
    if (isPipMode && isMobile) {
      return null;
    }
    
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop - only on desktop, hide in PiP mode */}
            {!isMobile && !isPipMode && (
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={backdropVariants}
                transition={{ duration: 0.4 }}
                className="fixed inset-0 z-[103] bg-black/80"
                onClick={handleClose}
              />
            )}

            {/* Modal container - hide in PiP mode on mobile */}
            {/* z-[104] ensures video modal is above content modal (z-[102]) */}
            <motion.div
              ref={modalRef}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={modalVariants}
              data-video-modal="true"
              className={`fixed inset-0 z-[104] flex items-start justify-center pt-0 pb-0 px-0 ${overflowClass} overscroll-contain`}
              style={{ 
                scrollbarGutter: 'unset',
                pointerEvents: isPipMode ? 'none' : 'auto',
                opacity: isPipMode ? 0 : 1,
              }}
              onClick={handleClose}
            >
              {/* Modal content */}
              <motion.div
                className={`relative w-full min-h-full bg-[#1c1c1c] rounded-none shadow-2xl`}
                onClick={(e) => e.stopPropagation()}
              style={{
                // For native player drag: don't move the web content - native view handles movement
                // Only apply CSS transform for web player drag or non-drag states
                transform: (isNativePlayer && isDraggingToDismiss) 
                  ? 'none' 
                  : `translate(${dragX}px, ${dragY}px) scale(${scale})`,
                opacity: modalOpacity,
                transformOrigin: 'center center',
                transition: isDragging 
                  ? 'opacity 0.1s ease-out' 
                  : (dragX !== 0 || dragY !== 0 
                    ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.1s ease-out' 
                    : 'opacity 0.1s ease-out'),
              }}
              >
                {/* Drag handle indicator - only on mobile */}
                {isMobile && (
                  <div
                    className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/30 rounded-full cursor-grab active:cursor-grabbing touch-none z-10"
                  />
                )}

                {children}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  };

  // Transform content data to match video page format
  const videoData = {
    id: currentContent?.id || "",
    title: currentContent?.title || "",
    series: currentSeries?.title || "Unknown Series",
    season: 1, // You can add season data to your content items if needed
    episode: 1, // You can add episode data to your content items if needed
    duration: currentContent?.duration || "Unknown",
    currentTime: currentTime,
    rating: currentContent?.rating || currentSeries?.rating || 'NR', // Use actual rating string (G, PG, etc.)
    description: currentContent?.description || "No description available",
    videoUrl: currentContent?.mux_playback_id 
      ? `https://stream.mux.com/${currentContent.mux_playback_id}.m3u8`
      : "/dummy-videos/preview-dummy.webm", // Fallback to dummy video
    thumbnail: currentContent?.mux_thumbnail_url || currentContent?.thumbnail_url || "/images/content-1.png",
    muxPlaybackId: currentContent?.mux_playback_id
  };

  // Helper function to find which series a content item belongs to
  const findSeriesForContent = useCallback((contentId: string) => {
    return allSeries.find(s => s.content_ids && s.content_ids.includes(contentId));
  }, [allSeries]);
  
  // Transform related episodes to match episode sidebar format
  // For daily content, the first episode is today's episode
  const isDailyContent = currentSeries ? Boolean(currentSeries.is_daily_content) === true : false;
  
  // For EpisodeSidebar: only show the next episode in the series (if it exists)
  // For daily content, use the existing logic
  const nextEpisodeForSidebar = isDailyContent 
    ? null // Daily content uses existing logic below
    : nextEpisodeInSeries 
      ? [{
          id: nextEpisodeInSeries.id,
          title: nextEpisodeInSeries.title,
          series: currentSeries?.title || "Unknown Series",
          season: 1,
          episode: 1,
          duration: nextEpisodeInSeries.duration || "Unknown",
          thumbnail: nextEpisodeInSeries.thumbnail_url || "/images/content-1.png",
          isCurrent: false,
          isToday: false,
          calendarDate: getDisplayDate(nextEpisodeInSeries.new_calendar_date),
          isFreeEpisode: nextEpisodeInSeries.is_free_episode || false
        }]
      : [];
  
  // For daily content, use the existing episode data logic
  const episodesData = isDailyContent 
    ? relatedEpisodes.slice(0, 10).map((episode, index) => {
        const episodeSeries = findSeriesForContent(episode.id);
        return {
          id: episode.id,
          title: episode.title,
          series: episodeSeries?.title || "Standalone",
          season: 1,
          episode: index + 1,
          duration: episode.duration || "Unknown",
          thumbnail: episode.thumbnail_url || "/images/content-1.png",
          isCurrent: episode.id === contentId,
          isToday: index === 0 && episode.id === todayEpisodeId,
          calendarDate: getDisplayDate(episode.new_calendar_date),
          isFreeEpisode: episode.is_free_episode || false
        };
      })
    : [];

  // Final episodes list for EpisodeSidebar
  const allEpisodes = isDailyContent ? episodesData : nextEpisodeForSidebar;

  // Check premium access (must be declared before fixedVideoPlayer)
  const baseHasAccess = canUserAccessContent(user, currentContent, currentSeries);
  const isPremiumContent = isContentPremium(currentContent, currentSeries);
  // Free users can preview premium content (first 5 minutes), but don't have full access
  const hasFullAccess = baseHasAccess;
  // Premium preview: content is premium AND (user is free OR no user) AND doesn't have full access
  // Allow non-logged-in users to preview premium content
  const isPremiumPreview = isPremiumContent && (!user || user.user_type === 'free') && !hasFullAccess;

  // Fixed video player for mobile (rendered via portal outside modal content but above modal container)
  // Z-index [105] is above modal container [100] but below mobile nav [101] and loading overlay [9999]
  // Apply same drag transform as modal so video player moves with modal during drag-to-dismiss
  // Drag handlers are only on the video player, not the scrollable content
  // Check access before rendering mobile video player (allow premium preview for free users)
  const fixedVideoPlayer = mounted && isMobile && currentContent?.mux_playback_id && isOpen && (hasFullAccess || isPremiumPreview) ? (
    createPortal(
      <>
        {/* 60px black gap for iPhone status bar - fades out on drag, separate from video container, hidden when player is fullscreen or in Android PiP or iOS native PiP */}
        {!isPlayerFullscreen && !isAndroidPictureInPicture && !(isNativePlayer && isPipMode) && (
          <div 
            className="fixed top-0 left-0 right-0 z-[108] bg-[#0f0f0f] w-full"
            style={{
              height: '60px',
              opacity: modalOpacity,
              transition: 'opacity 0.7s ease-out',
              pointerEvents: 'none',
            }}
          />
        )}
        <div 
          ref={pipVideoContainerRef}
          className={`fixed top-0 left-0 right-0 z-[107] bg-[#0f0f0f] w-full ${isMobile ? 'overflow-visible' : 'overflow-hidden'}`}
          onTouchStartCapture={isPipMode && !isAndroidPictureInPicture ? (e) => {
            // Check if the touch target is one of our PiP control buttons
            const target = e.target as HTMLElement;
            const isButton = target.closest('button') !== null;
            
            // If not a button, start PiP drag detection
            if (!isButton) {
              e.preventDefault(); // Prevent default scroll behavior
              e.stopPropagation();
              const touch = e.touches[0];
              pipDragStartXRef.current = touch.clientX;
              pipDragStartYRef.current = touch.clientY;
              // Store offset between touch position and PiP position
              pipDragOffsetRef.current = {
                x: touch.clientX - pipPosition.x,
                y: touch.clientY - pipPosition.y
              };
              setIsDraggingPip(false); // Will be set to true on move if movement exceeds threshold
            }
          } : onTouchStart}
          onTouchMoveCapture={isPipMode && !isAndroidPictureInPicture ? (e) => {
            if (pipDragStartXRef.current === null || pipDragStartYRef.current === null || pipDragOffsetRef.current === null) {
              return;
            }
            
            // Always prevent default to stop page scrolling when touching PiP
            e.preventDefault();
            e.stopPropagation();
            
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - pipDragStartXRef.current);
            const deltaY = Math.abs(touch.clientY - pipDragStartYRef.current);
            const TAP_THRESHOLD = 5; // pixels
            
            // If movement exceeds threshold, it's a drag
            if (deltaX > TAP_THRESHOLD || deltaY > TAP_THRESHOLD) {
              if (!isDraggingPip) {
                setIsDraggingPip(true);
              }
              
              // Calculate new position
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              const pipWidth = Math.min(650, windowWidth * 0.55);
              const pipHeight = pipWidth * (9 / 16);
              
              const newX = touch.clientX - pipDragOffsetRef.current.x;
              const newY = touch.clientY - pipDragOffsetRef.current.y;
              
              // Apply screen boundaries (keep PiP above bottom nav)
              const minX = 0;
              const maxX = windowWidth - pipWidth;
              const minY = 0;
              const maxY = windowHeight - pipHeight - PIP_BOTTOM_INSET;
              
              const clampedX = Math.max(minX, Math.min(maxX, newX));
              const clampedY = Math.max(minY, Math.min(maxY, newY));
              
              // Update ref immediately for smooth dragging (no re-render delay)
              pipDragCurrentPositionRef.current = { x: clampedX, y: clampedY };
              // Force re-render by updating state (but use ref value in transform)
              setPipPosition({ x: clampedX, y: clampedY });
            }
          } : onTouchMove}
          onTouchEndCapture={isPipMode && !isAndroidPictureInPicture ? (e) => {
            if (pipDragStartXRef.current === null || pipDragStartYRef.current === null) {
              return;
            }
            
            const target = e.target as HTMLElement;
            const isButton = target.closest('button') !== null;
            
            if (isDraggingPip) {
              // This was a drag, don't expand to full screen
              // Finalize position: sync ref value to state
              if (pipDragCurrentPositionRef.current) {
                setPipPosition(pipDragCurrentPositionRef.current);
              }
              setIsDraggingPip(false);
              pipDragStartXRef.current = null;
              pipDragStartYRef.current = null;
              pipDragOffsetRef.current = null;
              pipDragCurrentPositionRef.current = null;
              e.preventDefault(); // Prevent any default scroll behavior
              e.stopPropagation();
            } else if (!isButton) {
              // This was a tap (minimal movement), expand to full screen smoothly
              e.stopPropagation();
              
              // Calculate current PiP position for smooth transition
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              const pipWidth = Math.min(650, windowWidth * 0.55);
              const pipHeight = pipWidth * (9 / 16);
              const currentPlayerWidth = windowWidth;
              const currentPlayerHeight = windowWidth * (9 / 16);
              const currentCenterX = windowWidth / 2;
              const currentCenterY = 60 + (currentPlayerHeight / 2);
              
              // Get current PiP position
              const currentPipX = pipPosition.x > 0 || pipPosition.y > 0 
                ? pipPosition.x 
                : windowWidth - pipWidth - 16;
              const currentPipY = pipPosition.x > 0 || pipPosition.y > 0 
                ? pipPosition.y 
                : windowHeight - pipHeight - PIP_BOTTOM_INSET;
              
              const pipCenterX = currentPipX + (pipWidth / 2);
              const pipCenterY = currentPipY + (pipHeight / 2);
              
              // Calculate transform to animate from PiP to center
              const translateX = pipCenterX - currentCenterX;
              const translateY = pipCenterY - currentCenterY;
              
              // Set initial position and start expansion
              setDragX(translateX);
              setDragY(translateY);
              setIsExpandingFromPip(true);
              
              // Animate to center
              setTimeout(() => {
                setDragX(0);
                setDragY(0);
              }, 10);
              
              // Complete expansion after transition
              setTimeout(() => {
                setIsPipMode(false);
                setPipPosition({ x: 0, y: 0 });
                setIsVideoModalInPipMode(false);
                setIsExpandingFromPip(false);
                pipDragStartXRef.current = null;
                pipDragStartYRef.current = null;
                pipDragOffsetRef.current = null;
              }, 400); // Match transition duration
            }
          } : onTouchEnd}
          onClick={isPipMode ? (e) => {
            // Check if the click target is one of our PiP control buttons
            const target = e.target as HTMLElement;
            const isButton = target.closest('button') !== null;
            
            // Only restore full screen if not clicking on a button
            if (!isButton) {
              e.stopPropagation();
              
              // Calculate current PiP position for smooth transition
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              const pipWidth = Math.min(650, windowWidth * 0.55);
              const pipHeight = pipWidth * (9 / 16);
              const currentPlayerWidth = windowWidth;
              const currentPlayerHeight = windowWidth * (9 / 16);
              const currentCenterX = windowWidth / 2;
              const currentCenterY = 60 + (currentPlayerHeight / 2);
              
              // Get current PiP position
              const currentPipX = pipPosition.x > 0 || pipPosition.y > 0 
                ? pipPosition.x 
                : windowWidth - pipWidth - 16;
              const currentPipY = pipPosition.x > 0 || pipPosition.y > 0 
                ? pipPosition.y 
                : windowHeight - pipHeight - PIP_BOTTOM_INSET;
              
              const pipCenterX = currentPipX + (pipWidth / 2);
              const pipCenterY = currentPipY + (pipHeight / 2);
              
              // Calculate transform to animate from PiP to center
              const translateX = pipCenterX - currentCenterX;
              const translateY = pipCenterY - currentCenterY;
              
              // Set initial position and start expansion
              setDragX(translateX);
              setDragY(translateY);
              setIsExpandingFromPip(true);
              
              // Animate to center
              setTimeout(() => {
                setDragX(0);
                setDragY(0);
              }, 10);
              
              // Complete expansion after transition
              setTimeout(() => {
                setIsPipMode(false);
                setPipPosition({ x: 0, y: 0 });
                setIsVideoModalInPipMode(false);
                setIsExpandingFromPip(false);
              }, 400); // Match transition duration
            }
          } : undefined}
          style={{
            // Ensure container doesn't block native Android PiP controls
            // Hide web container entirely when native player is in PiP mode (native player handles PiP visuals)
            pointerEvents: (isNativePlayer && isPipMode) ? 'none' : (isAndroidPictureInPicture ? 'auto' : undefined),
            // Transform and positioning
            // For native player drag: don't move the video container - native view handles movement
            transform: (isNativePlayer && (isPipMode || isDraggingToDismiss)) ? 'none' : `translate(${finalX}px, ${finalY}px) scale(${scale})`,
            opacity: (isNativePlayer && (isPipMode || isDraggingToDismiss)) ? 0 : videoOpacity,
            transition: (isNativePlayer && isPipMode) ? 'none' : ((isDragging || isDraggingPip) ? 'none' : (finalX !== 0 || finalY !== 0 || isPipMode || isSnappingBack || isExpandingFromPip ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none')),
            // Touch action: prevent scrolling when dragging to dismiss or when dragging PiP
            // Allow pan gestures when in PiP mode (for dragging PiP)
            touchAction: (isDraggingToDismiss && (dragX !== 0 || dragY !== 0) && !isPipMode) || (isPipMode && pipDragStartXRef.current !== null) 
              ? 'none' 
              : (isPipMode && !isAndroidPictureInPicture) 
                ? 'pan-x pan-y' 
                : 'auto',
            marginTop: (isPipMode && !isExpandingFromPip) ? '0' : (isPlayerFullscreen || isAndroidPictureInPicture ? '0' : '60px'),
            overflow: isMobile ? 'visible' : 'hidden', // Allow thumb to extend below on mobile
            borderBottomLeftRadius: isPipMode ? '12px' : 0,
            borderBottomRightRadius: isPipMode ? '12px' : 0,
            borderRadius: isPipMode ? '12px' : 0,
            boxShadow: isPipMode ? '0 4px 20px rgba(0, 0, 0, 0.5)' : 'none',
            cursor: isPipMode ? 'pointer' : 'default',
          }}
        >
        <div
          style={{
            // Disable pointer events when dragging starts to prevent controls from interfering
            // This allows drag-to-dismiss to work even when touching video controls
            pointerEvents: (isDragging || isDraggingToDismiss) ? 'none' : 'auto',
            // Prevent touch actions on video controls when dragging
            touchAction: (isDragging || isDraggingToDismiss) ? 'none' : 'auto',
            position: 'relative',
          }}
        >
          {isNativePlayer ? (
            // iOS Native Player: Render placeholder div (native player overlays on top)
            <div
              ref={nativePlayerPlaceholderRef}
              className="w-full aspect-video"
              style={{
                pointerEvents: 'none', // Let native player handle all interactions
                backgroundColor: 'transparent', // No black background - native player is visible
                opacity: 0, // Always invisible - native player is on top
              }}
            />
          ) : (
            // Web Player: Render MuxVideoPlayer
            <MuxVideoPlayer
              key={`mux-video-${currentContent.id}`}
              playbackId={currentContent.mux_playback_id}
              title={currentContent.title}
              contentId={currentContent.id}
              initialTime={initialTime}
              videoDuration={videoDuration}
              onTimeUpdate={handleTimeUpdate}
              thumbnailUrl={currentContent.mux_thumbnail_url || currentContent.thumbnail_url}
              autoplay={true}
              muted={false}
              onReady={hideLoading}
              onLoadingChange={(isBuffering) => {
                if (isBuffering) {
                  showLoading();
                } else {
                  hideLoading();
                }
              }}
              onPlay={handlePlay}
              onPause={handlePause}
              onError={(error) => {
                setVideoError(error);
                console.error('Mux Player error:', error);
                hideLoading();
              }}
              className={`w-full aspect-video ${isPipMode ? 'hide-mux-controls' : ''}`}
              isPipMode={isPipMode}
              isPremiumPreview={isPremiumPreview}
              previewLimitSeconds={300}
              onPreviewLimitReached={() => {
                setIsPlaying(false);
              }}
              onUpgradeClick={() => {
                // Update URL silently based on user status
                if (typeof window !== 'undefined') {
                  const currentPath = window.location.pathname;
                  if (!user) {
                    // Not logged in - append /signup to current path
                    const newPath = currentPath.endsWith('/signup') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}signup`;
                    window.history.pushState({}, '', newPath);
                  } else {
                    // Logged in - append /upgrade to current path
                    const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                    window.history.pushState({}, '', newPath);
                  }
                }
                if (!user) {
                  // Not logged in - open signup at email step (not plans, which auto-redirects to login)
                  setSignupModalInitialStep(null);
                } else {
                  // Logged in but no plan - open upgrade modal at plans step
                  setSignupModalInitialStep('plans');
                }
                setIsSignupModalOpen(true);
              }}
              onFullscreenChange={setIsPlayerFullscreen}
              onPictureInPictureChange={setIsAndroidPictureInPicture}
              onTriggerPipMode={triggerPipMode}
            />
          )}
        
        {/* PiP Mode Simplified Controls - Render outside container to avoid pointer-events issues */}
        {/* Hide custom PiP controls when Android native PiP is active or iOS native player is active - use native controls instead */}
        {isPipMode && !isAndroidPictureInPicture && !isNativePlayer && (
          <>
            {/* Play/Pause Button - Top Left */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // Find video element within the PiP container
                const container = pipVideoContainerRef.current;
                if (!container) return;
                
                const muxVideo = container.querySelector('mux-video') as HTMLMediaElement | null;
                const videoElement = container.querySelector('video') as HTMLVideoElement | null;
                const targetElement = (muxVideo || videoElement) as HTMLMediaElement | null;
                
                if (targetElement) {
                  if (targetElement.paused) {
                    targetElement.play().catch(() => {});
                    setIsPlaying(true);
                  } else {
                    targetElement.pause();
                    setIsPlaying(false);
                  }
                }
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // Find video element within the PiP container
                const container = pipVideoContainerRef.current;
                if (!container) return;
                
                const muxVideo = container.querySelector('mux-video') as HTMLMediaElement | null;
                const videoElement = container.querySelector('video') as HTMLVideoElement | null;
                const targetElement = (muxVideo || videoElement) as HTMLMediaElement | null;
                
                if (targetElement) {
                  if (targetElement.paused) {
                    targetElement.play().catch(() => {});
                    setIsPlaying(true);
                  } else {
                    targetElement.pause();
                    setIsPlaying(false);
                  }
                }
              }}
              onTouchStartCapture={(e) => {
                e.stopPropagation();
              }}
              onTouchEndCapture={(e) => {
                e.stopPropagation();
              }}
              className="absolute top-2 left-2 z-[9999] rounded-full flex items-center justify-center text-white transition-colors"
              style={{
                pointerEvents: 'auto',
                width: '100px',
                height: '100px',
                touchAction: 'manipulation',
                zIndex: 9999,
              }}
            >
              {isPlaying ? (
                <svg className="w-[60px] h-[60px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-[60px] h-[60px] ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            
            {/* Close Button - Top Right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsPipMode(false);
                setDragX(0);
                setDragY(0);
                setPipPosition({ x: 0, y: 0 });
                setIsVideoModalInPipMode(false);
                // Close the modal
                onClose(false);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onTouchStartCapture={(e) => {
                e.stopPropagation();
              }}
              onTouchEndCapture={(e) => {
                e.stopPropagation();
              }}
              className="absolute z-50 rounded-full flex items-center justify-center text-white transition-colors"
              style={{
                top: '-4.5px',
                right: '-4.5px',
                pointerEvents: 'auto',
                width: '125px',
                height: '125px',
              }}
            >
              <svg className="w-[60px] h-[60px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </>
        )}
        </div>
      </div>
      </>,
      document.body
    )
  ) : null;

  if (!isOpen || !contentId) return null;

  // Determine what content to show
  const isLoadingState = loading || !currentContent;
  const showError = error && !currentContent;

  return (
    <>
      {fixedVideoPlayer}
      {renderCustomModal(
        <>
        {/* Close button - only visible on mobile */}
        {!isLoadingState && !showError && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(false);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            className="absolute top-12 left-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center text-lg sm:hidden"
            style={{
              opacity: modalOpacity,
              transition: 'opacity 0.7s ease-out',
            }}
          >
            ✕
          </button>
        )}

        <div className="min-h-screen bg-[#0f0f0f] text-white">
          <AnimatePresence mode="wait">
            {/* Show loading skeleton */}
            {isLoadingState && (
              <motion.div
                key="loading"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="sm:pt-24"
              >
                <div className="mx-auto max-w-[1700px] px-4 sm:px-6" style={{ paddingLeft: '20px', paddingRight: '20px' }}>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Main Content - Left Side */}
                    <div className="lg:col-span-3 space-y-8">
                      {/* Video Player Skeleton */}
                      <VideoPlayerSkeleton />
                      
                      {/* Video Details Skeleton */}
                      <VideoDetailsSkeleton />
                    </div>
                    
                    {/* Episode Sidebar - Right Side */}
                    <div className="lg:col-span-1">
                      <EpisodeSidebarSkeleton episodeCount={5} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Show error state */}
            {showError && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="min-h-screen flex items-center justify-center"
              >
                <div className="text-center px-6">
                  <h1 className="text-2xl font-bold mb-4">Content Not Found</h1>
                  <p className="text-gray-400 mb-6">{error || "The requested video could not be found."}</p>
                  <button 
                    onClick={() => onClose(false)}
                    className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-white/90 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            )}

            {/* Show actual content */}
            {!isLoadingState && !showError && currentContent && (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <>
                  {/* Video Player - Fixed at top on mobile, normal on desktop */}
                  <div className="sm:pt-24">
                    <div className="mx-auto max-w-[1700px] px-4 sm:px-6" style={{ paddingLeft: '20px', paddingRight: '20px' }}>
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Main Content - Left Side */}
                        <div className="lg:col-span-3">
                  {/* Premium Access Check - Only show if user has no access at all (not even preview) */}
                  {!hasFullAccess && !isPremiumPreview ? (
                    <div className="w-full bg-[#1a1a1a] rounded-lg p-12 text-center">
                      <div className="max-w-md mx-auto">
                        <h2 className="text-2xl font-bold text-white mb-4">Premium Content</h2>
                        <p className="text-gray-400 mb-6">
                          This content requires a premium subscription to watch.
                        </p>
                        <button
                          onClick={() => {
                            // Update URL silently by appending /upgrade to current path
                            if (typeof window !== 'undefined') {
                              const currentPath = window.location.pathname;
                              const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                              window.history.pushState({}, '', newPath);
                            }
                            setSignupModalInitialStep('plans');
                            setIsSignupModalOpen(true);
                          }}
                          className="bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 transition-colors"
                        >
                          Upgrade to Premium
                        </button>
                      </div>
                    </div>
                  ) : (
                  /* Video Player - Stays visible, no fade */
                  <div className="w-full mx-auto">
                    {currentContent.mux_playback_id && !isMobile && !isNativePlayer ? (
                      <div 
                        className="w-full"
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                        style={{
                          touchAction: isDragging ? 'none' : 'pan-y',
                        }}
                      >
                        <div
                          style={{
                            pointerEvents: (isDragging || isDraggingToDismiss) ? 'none' : 'auto',
                          }}
                        >
                          <MuxVideoPlayer
                          key={`mux-video-${currentContent.id}`}
                          playbackId={currentContent.mux_playback_id}
                          title={currentContent.title}
                          contentId={currentContent.id}
                          initialTime={initialTime}
                          videoDuration={videoDuration}
                          onTimeUpdate={handleTimeUpdate}
                          thumbnailUrl={currentContent.mux_thumbnail_url || currentContent.thumbnail_url}
                          autoplay={true}
                          muted={false}
                          onReady={hideLoading}
                          onLoadingChange={(isBuffering) => {
                            if (isBuffering) {
                              showLoading();
                            } else {
                              hideLoading();
                            }
                          }}
                          onPlay={handlePlay}
                          onPause={handlePause}
                          onError={(error) => {
                            setVideoError(error);
                            console.error('Mux Player error:', error);
                            hideLoading();
                          }}
                          className="w-full aspect-video"
                          isPremiumPreview={isPremiumPreview}
                          previewLimitSeconds={300}
                          onPreviewLimitReached={() => {
                            setIsPlaying(false);
                          }}
                          onUpgradeClick={() => {
                            if (!user) {
                              // Not logged in - open signup at email step (not plans, which auto-redirects to login)
                              setSignupModalInitialStep(null);
                            } else {
                              // Logged in but no plan - open upgrade modal at plans step
                              setSignupModalInitialStep('plans');
                            }
                            setIsSignupModalOpen(true);
                          }}
                          onFullscreenChange={setIsPlayerFullscreen}
                        />
                        </div>
                      </div>
                    ) : !currentContent.mux_playback_id ? (
                      <div className="w-full aspect-video max-h-[85vh] bg-gray-900 flex items-center justify-center rounded-lg shadow-2xl">
                        <div className="text-center text-white max-w-md">
                          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <h3 className="text-xl font-semibold mb-2">Video Not Available</h3>
                          <p className="text-gray-400 mb-4">
                            {currentContent.mux_asset_id ? (
                              <>
                                This video has been uploaded to Mux but is missing playback information.
                                <br />
                                <span className="text-sm text-gray-500 mt-2 block">
                                  Asset ID: {currentContent.mux_asset_id}
                                </span>
                              </>
                            ) : (
                              "This video needs to be uploaded to Mux for playback."
                            )}
                          </p>
                          <div className="space-y-2">
                            <button 
                              onClick={() => window.open('/admin', '_blank')}
                              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors block w-full"
                            >
                              Go to Admin Panel
                            </button>
                            {currentContent.mux_asset_id && (
                              <button 
                                onClick={() => {
                                  // Reload content
                                  window.location.reload();
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors block w-full"
                              >
                                Retry Loading
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  )}
                  
                  {/* Spacer on mobile to account for fixed video (16:9 aspect ratio) + 60px status bar gap */}
                  <div className="block sm:hidden" style={{ height: 'calc(100vw * 9 / 16 + 60px)', minHeight: 'calc(56.25vw + 60px)' }} />
                  
                  {/* Content below video - fades out on drag, Mux player stays visible */}
                  {(hasFullAccess || isPremiumPreview) && (
                  <div
                    style={{
                      opacity: modalOpacity,
                      transition: 'none',
                    }}
                  >
                    {/* Video Error Display */}
                    {videoError && (
                      <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
                        <div className="flex items-center gap-2 text-red-400">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <span className="font-medium">Video Playback Error</span>
                        </div>
                        <p className="mt-2 text-red-300 text-sm">{videoError}</p>
                      </div>
                    )}
                    
                    {/* Video Details */}
                    <div className="mt-[13px] sm:mt-8">
                      <VideoDetails 
                        video={videoData} 
                        isOneOff={currentSeries ? Boolean((currentSeries as any).is_one_off) === true : false}
                        isPremiumPreview={isPremiumPreview}
                      />
                    </div>
                    
                    {/* Comments Section */}
                    <CommentsSection 
                      contentId={currentContent?.id || null} 
                      onDragStateChange={(isDragging, dragY) => {
                        const wasDragging = isCommentsOverlayDragging;
                        setIsCommentsOverlayDragging(isDragging && dragY > 0);
                        
                        // Track when overlay finishes closing (was dragging, now stopped with dragY = 0)
                        if (wasDragging && !isDragging && dragY === 0) {
                          setIsCommentsOverlayClosing(true);
                          // Reset after a brief moment to allow instant appearance
                          setTimeout(() => setIsCommentsOverlayClosing(false), 50);
                        }
                      }}
                    />
                  </div>
                  )}
                </div>
                
                {/* Episode Sidebar - Right Side - fades out on drag */}
                {/* Only show EpisodeSidebar if there's a next episode in the series (or if it's daily content) */}
                {allEpisodes && allEpisodes.length > 0 && (
                  <div 
                    className="lg:col-span-1"
                    style={{
                      opacity: modalOpacity,
                      transition: 'opacity 0.7s ease-out',
                    }}
                  >
                    {/* Banner for non-logged-in users or free users without subscription */}
                    {(!user || (user && user.user_type === 'free' && !hasActiveSubscription)) && (
                      <div className="bg-[#0f0f0f] rounded-lg py-0 mb-6" style={{ paddingLeft: '0px', paddingRight: '0px' }}>
                        <div className="relative h-28 rounded-lg overflow-hidden p-0 m-0">
                          <Image
                            src="/images/Plan-Page-desktop.jpg"
                            alt=""
                            fill
                            className="object-cover"
                            unoptimized
                            style={{ opacity: 1 }}
                          />
                          <div className="absolute inset-0 w-full h-full bg-black/40 flex items-center justify-between pr-4" style={{ paddingLeft: '0px' }}>
                            <div className="flex-1 pr-5 pl-5">
                              <p className="text-white text-[16px] font-medium leading-[18px] text-left" style={{ fontFamily: 'janoSans', letterSpacing: '0.5px' }}>
                                {!user 
                                  ? "Stories & Shows Rooted in Orthodox Christianity" 
                                  : "Upgrade to access all episodes"
                                }
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                // Update URL silently by appending /upgrade or /signup to current path
                                if (typeof window !== 'undefined') {
                                  const currentPath = window.location.pathname;
                                  if (!user) {
                                    const newPath = currentPath.endsWith('/signup') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}signup`;
                                    window.history.pushState({}, '', newPath);
                                  } else {
                                    const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                                    window.history.pushState({}, '', newPath);
                                  }
                                }
                                if (!user) {
                                  // Not logged in - open signup modal
                                  setSignupModalInitialStep(null);
                                  setIsSignupModalOpen(true);
                                } else {
                                  // Logged in but no plan - open upgrade modal
                                  setSignupModalInitialStep('plans');
                                  setIsSignupModalOpen(true);
                                }
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-full text-base font-medium transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer"
                            >
                              {!user ? "Signup" : "Upgrade"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <EpisodeSidebar 
                      episodes={allEpisodes}
                      selectedSeason={selectedSeason}
                      onSeasonChange={setSelectedSeason}
                      isDailyContent={isDailyContent}
                      selectedMonth={selectedMonth}
                      onMonthChange={setSelectedMonth}
                      calendarType={calendarType}
                      onCalendarTypeChange={updatePreference}
                      currentSeries={currentSeries}
                      currentContentTitle={currentContent?.title}
                    />
                    
                    {/* More Episodes Section */}
                    {(() => {
                      // Filter out the next episode from MoreEpisodes (if it exists)
                      const nextEpisodeId = nextEpisodeInSeries?.id;
                      const videosForMoreEpisodes = relatedEpisodes.filter(ep => {
                        if (isDailyContent) {
                          // For daily content, show episodes after the first 10
                          return true;
                        }
                        // For regular content, exclude the next episode in series
                        return ep.id !== nextEpisodeId && ep.id !== contentId;
                      });
                      
                      const startIndex = isDailyContent ? 10 : 0;
                      const episodesToShow = videosForMoreEpisodes.slice(startIndex);
                      
                      return episodesToShow.length > 0 ? (
                        <MoreEpisodes 
                          calendarType={calendarType}
                          episodes={episodesToShow.map((episode, index) => {
                            const episodeSeries = findSeriesForContent(episode.id);
                            return {
                              id: episode.id,
                              title: episode.title,
                              series: episodeSeries?.title || "Standalone",
                              season: 1,
                              episode: (isDailyContent ? 11 : 1) + index,
                              duration: episode.duration || "Unknown",
                              thumbnail: episode.thumbnail_url || "/images/content-1.png",
                              isCurrent: false,
                              isToday: false,
                              calendarDate: episode.new_calendar_date || undefined,
                              muxPlaybackId: episode.mux_playback_id || undefined,
                              contentType: episode.content_type,
                              isFreeEpisode: episode.is_free_episode || false,
                              seriesIsPremium: episodeSeries ? Boolean((episodeSeries as any).is_premium) : false
                            };
                          })} />
                      ) : null;
                    })()}
                  </div>
                )}
                
                {/* More Episodes Section - Show when EpisodeSidebar is hidden */}
                {(!allEpisodes || allEpisodes.length === 0) && (() => {
                  const videosForMoreEpisodes = relatedEpisodes.filter(ep => ep.id !== contentId);
                  return videosForMoreEpisodes.length > 0 ? (
                    <div 
                      className="lg:col-span-1"
                      style={{
                        opacity: modalOpacity,
                        transition: 'opacity 0.7s ease-out',
                      }}
                    >
                      {/* Banner for non-logged-in users or users without plan */}
                      {(!user || (user && !hasPlan)) && (
                        <div className="bg-[#0f0f0f] rounded-lg py-0 mb-6" style={{ paddingLeft: '0px', paddingRight: '0px' }}>
                          <div className="relative h-28 rounded-lg overflow-hidden p-0 m-0">
                            <Image
                              src="/images/Plan-Page-desktop.jpg"
                              alt=""
                              fill
                              className="object-cover"
                              unoptimized
                              style={{ opacity: 1 }}
                            />
                            <div className="absolute inset-0 w-full h-full bg-black/40 flex items-center justify-between pr-4" style={{ paddingLeft: '0px' }}>
                              <div className="flex-1 pr-3 pl-2">
                                <p className="text-white text-[16px] font-medium leading-[18px] text-left" style={{ fontFamily: 'janoSans', letterSpacing: '0.5px' }}>
                                  {!user 
                                    ? "Stories & Shows Rooted in Orthodox Christianity" 
                                    : "Upgrade to access all episodes"
                                  }
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  // Update URL silently by appending /upgrade or /signup to current path
                                  if (typeof window !== 'undefined') {
                                    const currentPath = window.location.pathname;
                                    if (!user) {
                                      const newPath = currentPath.endsWith('/signup') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}signup`;
                                      window.history.pushState({}, '', newPath);
                                    } else {
                                      const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                                      window.history.pushState({}, '', newPath);
                                    }
                                  }
                                  if (!user) {
                                    // Not logged in - open signup modal
                                    setSignupModalInitialStep(null);
                                    setIsSignupModalOpen(true);
                                  } else {
                                    // Logged in but no plan - open upgrade modal
                                    setSignupModalInitialStep('plans');
                                    setIsSignupModalOpen(true);
                                  }
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-full text-base font-medium transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer"
                              >
                                {!user ? "Signup" : "Upgrade"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      <MoreEpisodes 
                        calendarType={calendarType}
                        episodes={videosForMoreEpisodes.map((episode, index) => {
                          const episodeSeries = findSeriesForContent(episode.id);
                          return {
                            id: episode.id,
                            title: episode.title,
                            series: episodeSeries?.title || "Standalone",
                            season: 1,
                            episode: index + 1,
                            duration: episode.duration || "Unknown",
                            thumbnail: episode.thumbnail_url || "/images/content-1.png",
                            isCurrent: false,
                            isToday: false,
                            calendarDate: episode.new_calendar_date || undefined,
                            muxPlaybackId: episode.mux_playback_id || undefined,
                            contentType: episode.content_type,
                            isFreeEpisode: episode.is_free_episode || false,
                            seriesIsPremium: episodeSeries ? Boolean((episodeSeries as any).is_premium) : false
                          };
                        })} />
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
                </>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>,
        "overflow-y-auto overflow-x-hidden"
      )}
    </>
  );
}

