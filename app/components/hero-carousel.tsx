"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { MediaItem } from "../lib/data";
import { useModal } from "../contexts/modal-context";
import { useAudioPlayer } from "./audio-player-provider";
import { contentItemsService } from "../../lib/database";
import { useCalendarPreference } from "../../lib/hooks/useCalendarPreference";
import { formatDateForDisplay } from "../../lib/utils/date-helpers";
import { useUser } from "../contexts/user-context";
import { PremiumBadge } from "./premium-badge";
import MuxVideo from '@mux/mux-video-react';
import { useContentItems } from "../../lib/hooks/useContentItems";
import { usePreviewMute } from "../hooks/usePreviewMute";
import { usePip } from "../contexts/pip-context";

type Props = {
  items: MediaItem[];
  autoMs?: number;
  onInfo?: (item: MediaItem, event?: React.MouseEvent<HTMLButtonElement>) => void;
};

export function HeroCarousel({ items, autoMs = 6000, onInfo }: Props) {
  const router = useRouter();
  const { setVideoContentId, setIsVideoModalOpen, isVideoModalOpen } = useModal();
  const { setCurrentContent, setIsVisible: setAudioPlayerVisible } = useAudioPlayer();
  const { calendarType } = useCalendarPreference();
  const { user, hasActiveSubscription } = useUser();
  const { getSeriesContent } = useContentItems();
  const { isMuted: isPreviewMuted, toggleMute: togglePreviewMute } = usePreviewMute();
  const { pipVideo } = usePip();
  const isPipMode = pipVideo !== null;
  
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // State for first item preview video
  const [showPreviewVideo, setShowPreviewVideo] = useState(false);
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewVideoRef = useRef<HTMLDivElement>(null);
  const previewVideoElementRef = useRef<any>(null);
  const previewStartTimeRef = useRef<number>(0); // Track where preview started (20% of duration)
  const audioFadedOutRef = useRef<boolean>(false); // Track if audio has been faded out on scroll
  const playedVideosRef = useRef<Set<string>>(new Set()); // Track which items have already played their video
  
  // Handle play button click
  const handlePlay = async () => {
    const active = items[index] ?? items[0];
    
    // For daily content series, play today's episode
    if (active.isDailyContent && active.todayEpisodeId) {
      try {
        const episode = await contentItemsService.getById(active.todayEpisodeId);
        if (!episode) {
          console.error('Episode not found:', active.todayEpisodeId);
          return;
        }

        if (episode.content_type === 'audio') {
          // Mark user interaction for autoplay (trigger click event for existing listener)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('click'));
          }
          
          // Set content in audio player
          setCurrentContent({
            id: episode.id,
            title: episode.title,
            description: episode.description || '',
            duration: episode.duration || '0',
            thumbnail: episode.thumbnail_url || episode.mux_thumbnail_url || active.imageUrl,
            contentUrl: episode.content_url || undefined,
            muxPlaybackId: episode.mux_playback_id || undefined,
            contentType: 'audio'
          });
          
          // Show audio player
          setAudioPlayerVisible(true);
          
          // Update URL with short_id without navigating (for sharing/bookmarking)
          if (typeof window !== 'undefined') {
            if (episode.short_id) {
              const currentPath = window.location.pathname;
              if (currentPath !== `/${episode.short_id}`) {
                // Use pushState to update URL without triggering navigation
                window.history.pushState({}, '', `/${episode.short_id}`);
              }
            } else {
              // Log warning if short_id is missing (should be auto-generated on creation)
              console.warn('[HeroCarousel] Audio episode missing short_id:', episode.id, episode.title);
            }
          }
        } else if (episode.content_type === 'video') {
          // Open video modal
          setVideoContentId(episode.id);
          setIsVideoModalOpen(true);
        }
      } catch (error) {
        console.error('Error loading daily episode:', error);
      }
    } else {
      // For non-daily content, try to get first episode if it's a series, otherwise play the content item directly
      try {
        // Try to get series content first
        const seriesContent = await getSeriesContent(active.id);
        
        if (seriesContent && seriesContent.length > 0) {
          // It's a series - get the first episode
          const firstEpisode = seriesContent[0];
          
          if (firstEpisode.content_type === 'audio') {
            // Mark user interaction for autoplay
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('click'));
            }
            
            // Set content in audio player
            setCurrentContent({
              id: firstEpisode.id,
              title: firstEpisode.title,
              description: firstEpisode.description || '',
              duration: firstEpisode.duration || '0',
              thumbnail: firstEpisode.thumbnail_url || firstEpisode.mux_thumbnail_url || active.imageUrl,
              contentUrl: firstEpisode.content_url || undefined,
              muxPlaybackId: firstEpisode.mux_playback_id || undefined,
              contentType: 'audio'
            });
            
            // Show audio player
            setAudioPlayerVisible(true);
            
            // Update URL with short_id if available
            if (typeof window !== 'undefined') {
              if (firstEpisode.short_id) {
                const currentPath = window.location.pathname;
                if (currentPath !== `/${firstEpisode.short_id}`) {
                  window.history.pushState({}, '', `/${firstEpisode.short_id}`);
                }
              } else {
                // Log warning if short_id is missing (should be auto-generated on creation)
                console.warn('[HeroCarousel] Audio episode missing short_id:', firstEpisode.id, firstEpisode.title);
              }
            }
          } else if (firstEpisode.content_type === 'video') {
            // Open video modal with first episode
            setVideoContentId(firstEpisode.id);
            setIsVideoModalOpen(true);
          }
        } else {
          // Not a series or has no episodes - treat as one-off content item
          const contentItem = await contentItemsService.getById(active.id);
          
          if (contentItem) {
            if (contentItem.content_type === 'audio') {
              // Mark user interaction for autoplay
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('click'));
              }
              
              // Set content in audio player
              setCurrentContent({
                id: contentItem.id,
                title: contentItem.title,
                description: contentItem.description || '',
                duration: contentItem.duration || '0',
                thumbnail: contentItem.thumbnail_url || contentItem.mux_thumbnail_url || active.imageUrl,
                contentUrl: contentItem.content_url || undefined,
                muxPlaybackId: contentItem.mux_playback_id || undefined,
                contentType: 'audio'
              });
              
              // Show audio player
              setAudioPlayerVisible(true);
              
              // Update URL with short_id if available
              if (typeof window !== 'undefined') {
                if (contentItem.short_id) {
                  const currentPath = window.location.pathname;
                  if (currentPath !== `/${contentItem.short_id}`) {
                    window.history.pushState({}, '', `/${contentItem.short_id}`);
                  }
                } else {
                  // Log warning if short_id is missing (should be auto-generated on creation)
                  console.warn('[HeroCarousel] Audio content missing short_id:', contentItem.id, contentItem.title);
                }
              }
            } else if (contentItem.content_type === 'video') {
              // Open video modal with content item
              setVideoContentId(contentItem.id);
              setIsVideoModalOpen(true);
            }
          }
        }
      } catch (error) {
        console.error('Error loading content for play:', error);
        // Fallback: try to open modal with active.id
        if (active.id) {
          setVideoContentId(active.id);
          setIsVideoModalOpen(true);
        }
      }
    }
  };
  
  // Timing constants (adjust these to change animation speeds)
  const BACKGROUND_CROSSFADE_DURATION = 1200; // ms - how long background crossfade takes
  const CONTENT_FADE_OUT_DURATION = 0.35; // seconds - how fast content fades out on swipe
  const CONTENT_FADE_IN_DURATION = 0.30; // seconds - how fast content fades in on release
  const AUTO_CONTENT_FADE_OUT_DURATION = .7; // seconds - how fast content fades out on auto-transition
  const AUTO_CONTENT_FADE_IN_DURATION = .7; // seconds - how fast content fades in on auto-transition
  const INITIAL_FADE_IN_DURATION = 1.0; // seconds - how fast background and content fade in on initial load
  const AUTO_TRANSITION_CROSSFADE_DURATION = 2 // seconds - how long auto-transition crossfade takes
  
  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const wasVideoPlayingRef = useRef<boolean>(false);
  
  // Swipe state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDistance, setDragDistance] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isInitialFadeIn, setIsInitialFadeIn] = useState(true);
  const [loadedBackgroundImages, setLoadedBackgroundImages] = useState<Set<string>>(new Set());
  
  const active = items[index] ?? items[0];
  
  // Select random background from backgroundUrls array if available (changes on each render/refresh)
  // For now, this simulates daily rotation by changing on refresh
  // Later can be changed to use date-based seed for consistent daily rotation
  const activeBackgroundUrl = useMemo(() => {
    if (active?.backgroundUrls && active.backgroundUrls.length > 0) {
      const randomIndex = Math.floor(Math.random() * active.backgroundUrls.length);
      return active.backgroundUrls[randomIndex];
    }
    return active?.backgroundUrl;
  }, [active?.backgroundUrls, active?.backgroundUrl, index]); // Re-select on index change (refresh)

  // Fade in on initial load
  useEffect(() => {
    // Start fade-in after component mounts
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
      // Set showContent to true in next frame to ensure smooth transition
      requestAnimationFrame(() => {
        setShowContent(true);
      });
      // Mark initial fade-in as complete after animation duration
      setTimeout(() => {
        setIsInitialFadeIn(false);
      }, INITIAL_FADE_IN_DURATION * 1000);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Track if we've already loaded preview data to prevent infinite loops
  const previewDataLoadedRef = useRef(false);
  
  // Load preview video for any item with enable_video_preview enabled
  // Video will auto-start after 1 second delay
  useEffect(() => {
    if (items.length === 0) return;
    
    // Skip loading preview video on mobile - videos don't auto-play and restart button is hidden
    // Check window width directly to avoid race condition with isMobile state
    const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 640;
    if (isMobileDevice) return;
    
    // Get the current active item
    const activeItem = items[index];
    
    // Check if current item has video preview enabled
    if (!(activeItem as any)?.enable_video_preview) {
      // If current item doesn't have preview enabled, reset preview state
      if (previewPlaybackId) {
        setShowPreviewVideo(false);
        setPreviewPlaybackId(null);
        setIsLoadingPreview(false);
        setIsPreviewPlaying(false);
        previewDataLoadedRef.current = false;
        previewStartTimeRef.current = 0;
      }
      return;
    }
    
    // Prevent re-loading if we've already loaded the preview data for this item
    if (previewDataLoadedRef.current || previewPlaybackId) return;
    
    // Only for video content
    if (activeItem.content_type !== 'video') return;
    
    // Mark as loading to prevent duplicate loads
    previewDataLoadedRef.current = true;
    
    // Load preview video data immediately so restart button is available
    const loadPreviewData = async () => {
      // Double-check mobile before loading (in case window was resized)
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        previewDataLoadedRef.current = false;
        return;
      }
      console.log('[HeroCarousel] Loading preview video data for item with preview enabled');
      setIsLoadingPreview(true);
      
      try {
        // Check if this item's video has already been played
        const hasPlayed = playedVideosRef.current.has(activeItem.id);
        
        // Try to get series content first (most carousel items are series)
        try {
          const contentItems = await getSeriesContent(activeItem.id);
          if (contentItems.length > 0) {
            const firstEpisode = contentItems[0];
            if (firstEpisode.content_type === 'video' && firstEpisode.mux_playback_id) {
              console.log('[HeroCarousel] Setting playback ID from series:', firstEpisode.mux_playback_id);
              setPreviewPlaybackId(firstEpisode.mux_playback_id);
              // Only auto-start video if it hasn't been played before and not on mobile
              if (!hasPlayed && !isMobile) {
                setTimeout(() => {
                  setShowPreviewVideo(true);
                }, 1000);
              } else {
                console.log('[HeroCarousel] Auto-start skipped: already played or on mobile');
              }
              return; // Success, exit early
            }
          }
        } catch (seriesError) {
          // Not a series or series lookup failed - try as individual content item
          console.log('[HeroCarousel] Series lookup failed, trying as individual content item:', seriesError);
        }
        
        // Fallback: try as individual content item
        const contentItem = await contentItemsService.getById(activeItem.id);
        if (contentItem && contentItem.content_type === 'video' && contentItem.mux_playback_id) {
          console.log('[HeroCarousel] Setting playback ID from content item:', contentItem.mux_playback_id);
          setPreviewPlaybackId(contentItem.mux_playback_id);
          // Only auto-start video if it hasn't been played before and not on mobile
          if (!hasPlayed && !isMobile) {
            setTimeout(() => {
              setShowPreviewVideo(true);
            }, 1000);
          } else {
            console.log('[HeroCarousel] Auto-start skipped: already played or on mobile');
          }
        } else {
          console.warn('[HeroCarousel] No video playback ID found for item:', activeItem.id);
        }
      } catch (error) {
        console.error('[HeroCarousel] Failed to load preview video:', error);
        // Reset the ref on error so we can retry
        previewDataLoadedRef.current = false;
      } finally {
        setIsLoadingPreview(false);
      }
    };
    
    loadPreviewData();
    
    // Cleanup: reset ref if component unmounts or index changes
    return () => {
      // Reset will be handled by the index change effect
    };
  }, [index, items.length, items[index]?.id, getSeriesContent, previewPlaybackId, isMobile]);

  // Track previous index to detect when user navigates away from a slide
  const prevIndexRef = useRef<number | null>(null);
  
  // Mark video as "seen" when user navigates away from a slide with video preview
  useEffect(() => {
    // Only mark as seen if index actually changed (not on initial mount)
    if (prevIndexRef.current !== null && prevIndexRef.current !== index) {
      const previousItem = items[prevIndexRef.current];
      
      // If the previous slide had video preview enabled, mark it as seen
      // This prevents auto-play when returning to it
      if (previousItem && (previousItem as any)?.enable_video_preview) {
        playedVideosRef.current.add(previousItem.id);
        console.log('[HeroCarousel] Marked video as seen for item:', previousItem.id);
      }
    }
    
    // Update previous index (set to current index after first render)
    prevIndexRef.current = index;
  }, [index, items]);

  // Setup video element when preview is ready (similar to row-shelf)
  useEffect(() => {
    if (!showPreviewVideo || !previewPlaybackId || items.length === 0) return;
    
    // Check if current item has video preview enabled
    const activeItem = items[index];
    if (!(activeItem as any)?.enable_video_preview) {
      // If preview not enabled, hide video
      if (showPreviewVideo) {
        setShowPreviewVideo(false);
      }
      return;
    }
    
    // On mobile, don't show video unless it's actually playing (prevents black screen)
    if (isMobile && !isPreviewPlaying) {
      // Hide video on mobile if it's not playing
      if (showPreviewVideo) {
        setShowPreviewVideo(false);
      }
      return;
    }

    const container = previewVideoRef.current;
    if (!container) return;

    let retryCount = 0;
    const maxRetries = 50;
    let canPlayHandler: ((e: Event) => void) | null = null;
    let playHandler: ((e: Event) => void) | null = null;
    let timeUpdateHandler: ((e: Event) => void) | null = null;
    let playStateHandler: ((e: Event) => void) | null = null;
    let pauseStateHandler: ((e: Event) => void) | null = null;
    let endedHandler: ((e: Event) => void) | null = null;
    let setupTimer: NodeJS.Timeout | null = null;

    // Wait a bit for MuxVideo component to render
    setupTimer = setTimeout(() => {
      const findAndSetupVideo = () => {
        const muxVideoElement = container.querySelector('mux-video') as any;
        // Try multiple ways to find the video element
        let video: HTMLVideoElement | null = null;
        
        if (muxVideoElement) {
          // Try shadow root first
          video = muxVideoElement.shadowRoot?.querySelector('video') as HTMLVideoElement;
          // If not in shadow root, try direct query
          if (!video) {
            video = muxVideoElement.querySelector('video') as HTMLVideoElement;
          }
        }
        
        // Fallback: try container directly
        if (!video) {
          video = container.querySelector('video') as HTMLVideoElement;
        }
        
        if (video) {
          console.log('[HeroCarousel] Video element found, setting up playback');
          previewVideoElementRef.current = video;
          
          // Set mute state from hook
          video.muted = isPreviewMuted;
          
          // Set preload to auto for faster loading
          video.preload = 'auto';
          
          // Don't auto-play - wait for user to click restart button
          // Video will start when restart button is clicked
          
          // Setup mute state handlers
          canPlayHandler = () => {
            // Always ensure muted for autoplay, then respect user preference
            if (video!.paused) {
              // Video hasn't started yet, ensure muted for autoplay
              video!.muted = true;
            } else {
              // Video is playing, use user preference
              video!.muted = isPreviewMuted;
            }
            // Don't auto-play - wait for user to click restart button
          };
          playHandler = () => {
            // Once video starts playing, respect user's mute preference
            video!.muted = isPreviewMuted;
          };
          
          video.addEventListener('canplay', canPlayHandler);
          video.addEventListener('play', playHandler);
          
          // Setup time tracking to stop 30 seconds after starting point (20% into video)
          timeUpdateHandler = () => {
            // Check if 30 seconds have elapsed from the start time
            const elapsedFromStart = video!.currentTime - previewStartTimeRef.current;
            if (elapsedFromStart >= 30) {
              // Fade out video and fade in background
              const videoContainer = container as HTMLElement;
              
              if (videoContainer) {
                videoContainer.style.transition = 'opacity 0.5s ease-out';
                videoContainer.style.opacity = '0';
              }
              
              // Check if audio is unmuted (not muted)
              const isUnmuted = !video!.muted;
              
              if (isUnmuted) {
                // Fade out audio volume smoothly over 0.5 seconds
                // Use setInterval with fewer updates to prevent crackling
                const fadeDuration = 500; // milliseconds
                const updateInterval = 20; // Update every 20ms (50fps) instead of every frame
                const startVolume = video!.volume;
                const startTime = Date.now();
                let fadeInterval: NodeJS.Timeout | null = null;
                
                fadeInterval = setInterval(() => {
                  const elapsed = Date.now() - startTime;
                  const progress = Math.min(elapsed / fadeDuration, 1);
                  
                  // Use smoother ease-out curve (quadratic instead of cubic)
                  const easedProgress = 1 - Math.pow(1 - progress, 2);
                  const newVolume = startVolume * (1 - easedProgress);
                  
                  // Clamp volume to valid range
                  video!.volume = Math.max(0, Math.min(1, newVolume));
                  
                  if (progress >= 1) {
                    // Fade complete, pause video
                    if (fadeInterval) clearInterval(fadeInterval);
                    video!.pause();
                    setIsPreviewPlaying(false);
                    setShowPreviewVideo(false);
                    // Mark this item's video as played
                    const activeItem = items[index];
                    if (activeItem) {
                      playedVideosRef.current.add(activeItem.id);
                      console.log('[HeroCarousel] Marked video as played for item:', activeItem.id);
                    }
                    // Reset volume for next play
                    video!.volume = startVolume;
                    // Keep previewPlaybackId so restart button remains visible
                  }
                }, updateInterval);
              } else {
                // Audio is muted, just pause immediately after fade
                setTimeout(() => {
                  video!.pause();
                  setIsPreviewPlaying(false);
                  setShowPreviewVideo(false);
                  // Mark this item's video as played
                  const activeItem = items[index];
                  if (activeItem) {
                    playedVideosRef.current.add(activeItem.id);
                    console.log('[HeroCarousel] Marked video as played for item:', activeItem.id);
                  }
                  // Keep previewPlaybackId so restart button remains visible
                }, 500);
              }
            }
          };
          video.addEventListener('timeupdate', timeUpdateHandler);
          
          // Track playing state
          playStateHandler = () => {
            setIsPreviewPlaying(true);
          };
          pauseStateHandler = () => {
            setIsPreviewPlaying(false);
          };
          endedHandler = () => {
            // Video ended naturally - mark as played and show background
            console.log('[HeroCarousel] Video ended naturally');
            setIsPreviewPlaying(false);
            setShowPreviewVideo(false);
            const activeItem = items[index];
            if (activeItem) {
              playedVideosRef.current.add(activeItem.id);
              console.log('[HeroCarousel] Marked video as played for item:', activeItem.id);
            }
          };
          if (playStateHandler) video.addEventListener('play', playStateHandler);
          if (pauseStateHandler) video.addEventListener('pause', pauseStateHandler);
          if (endedHandler) video.addEventListener('ended', endedHandler);
          
          // Check initial playing state
          if (!video.paused) {
            setIsPreviewPlaying(true);
          }
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(findAndSetupVideo, 100);
        } else {
          console.warn('[HeroCarousel] Could not find video element after', maxRetries, 'retries');
        }
      };

      findAndSetupVideo();
    }, 200); // Wait 200ms for MuxVideo to render

    return () => {
      if (setupTimer) clearTimeout(setupTimer);
      
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
        if (canPlayHandler) video.removeEventListener('canplay', canPlayHandler);
        if (playHandler) video.removeEventListener('play', playHandler);
        if (timeUpdateHandler) video.removeEventListener('timeupdate', timeUpdateHandler);
        // Remove play/pause listeners for playing state tracking
        if (playStateHandler) video.removeEventListener('play', playStateHandler);
        if (pauseStateHandler) video.removeEventListener('pause', pauseStateHandler);
        // Remove ended handler
        if (endedHandler) video.removeEventListener('ended', endedHandler);
      }
    };
  }, [showPreviewVideo, previewPlaybackId, index, isPreviewMuted]);

  // Reset preview when carousel changes to a different item
  useEffect(() => {
    if (items.length === 0) return;
    
    const activeItem = items[index];
    
    // Always reset preview state when index changes (to prevent showing wrong video)
    setShowPreviewVideo(false);
    setPreviewPlaybackId(null);
    setIsLoadingPreview(false);
    setIsPreviewPlaying(false);
    previewDataLoadedRef.current = false; // Reset so preview can load again
    previewStartTimeRef.current = 0; // Reset start time
    wasVideoPlayingRef.current = false; // Reset video playing ref
    audioFadedOutRef.current = false; // Reset audio fade state
    
    // If new item has preview enabled, it will load in the preview loading useEffect
  }, [index, items]);

  // Update video muted state when isPreviewMuted changes (for synchronization only - don't restart)
  useEffect(() => {
    if (!showPreviewVideo || !previewPlaybackId || items.length === 0 || !isPreviewPlaying) return;
    
    // Check if current item has video preview enabled
    const activeItem = items[index];
    if (!(activeItem as any)?.enable_video_preview) return;

    const container = previewVideoRef.current;
    if (!container) return;

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
      
      if (video && !video.paused) {
        // Only update muted state if video is already playing - don't restart
        video.muted = isPreviewMuted;
        console.log('[HeroCarousel] Updated video muted state to:', isPreviewMuted);
      }
    };

    // Try to update immediately
    updateVideoMutedState();

    // Also try after a short delay in case video element isn't ready yet
    const timeout = setTimeout(updateVideoMutedState, 100);

    return () => clearTimeout(timeout);
  }, [isPreviewMuted, showPreviewVideo, previewPlaybackId, index, isPreviewPlaying]);

  // Auto-start video when showPreviewVideo becomes true (after 1 second delay)
  useEffect(() => {
    if (!showPreviewVideo || !previewPlaybackId || items.length === 0) return;
    
    // Don't auto-play on mobile - user must manually click restart button
    if (isMobile) return;
    
    // Check if current item has video preview enabled
    const activeItem = items[index];
    if (!(activeItem as any)?.enable_video_preview) return;

    const container = previewVideoRef.current;
    if (!container) return;

    // Wait a bit for video element to be ready, then start playing at 20%
    const startTimer = setTimeout(() => {
      const startVideoAt20Percent = () => {
        const muxVideoElement = container.querySelector('mux-video') as any;
        let video: HTMLVideoElement | null = null;
        
        if (muxVideoElement) {
          video = muxVideoElement.shadowRoot?.querySelector('video') || 
                  muxVideoElement.querySelector('video') || 
                  container.querySelector('video') as HTMLVideoElement;
        } else {
          video = container.querySelector('video') as HTMLVideoElement;
        }
        
        if (video && video.paused) {
          // Always mute for autoplay (browsers require this)
          video.muted = true;
          console.log('[HeroCarousel] Setting muted=true for autoplay');
          
          // Wait for video metadata to load to get duration
          const startAt20Percent = () => {
            if (video!.duration && video!.duration > 0) {
              // Calculate 20% of video duration
              const startTime = video!.duration * 0.2;
              previewStartTimeRef.current = startTime;
              video!.currentTime = startTime;
              console.log('[HeroCarousel] Starting preview at 20%:', startTime, 'of', video!.duration);
            } else {
              // If duration not available yet, try again
              setTimeout(startAt20Percent, 100);
              return;
            }
            
            // Ensure video is muted before attempting autoplay
            if (!video!.muted) {
              video!.muted = true;
            }
            
            // Auto-start video when showPreviewVideo becomes true
            video!.play().then(() => {
              // After video starts, respect user's mute preference
              video!.muted = isPreviewMuted;
              console.log('[HeroCarousel] Video started, applying user mute preference:', isPreviewMuted);
            }).catch((err) => {
              console.log('[HeroCarousel] Auto-start play failed:', err);
            });
          };
          
          if (video.readyState >= 2) {
            // Metadata already loaded
            startAt20Percent();
          } else {
            // Wait for metadata
            video.addEventListener('loadedmetadata', startAt20Percent, { once: true });
          }
        }
      };

      // Try to start immediately
      startVideoAt20Percent();

      // Also try after a short delay in case video element isn't ready yet
      setTimeout(startVideoAt20Percent, 100);
    }, 200); // Wait 200ms for video element to render

    return () => clearTimeout(startTimer);
  }, [showPreviewVideo, previewPlaybackId, index, isPreviewMuted, isMobile]);

  const next = () => setIndex((i) => (i + 1) % items.length);
  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);

  // Handle dot click - stop video if playing and transition to selected item
  const handleDotClick = (targetIndex: number) => {
    // If clicking the same dot, do nothing
    if (targetIndex === index) return;
    
    // Stop video if currently playing
    if (isPreviewPlaying && showPreviewVideo && previewVideoRef.current) {
      const container = previewVideoRef.current;
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
        // Pause the video
        video.pause();
        setIsPreviewPlaying(false);
      }
      
      // Reset preview state
      setShowPreviewVideo(false);
      setPreviewPlaybackId(null);
      setIsLoadingPreview(false);
      previewDataLoadedRef.current = false;
      wasVideoPlayingRef.current = false;
      audioFadedOutRef.current = false;
    }
    
    // Change to the selected index
    setIndex(targetIndex);
  };

  // Auto-advance with crossfade transition
  const autoAdvance = () => {
    if (items.length <= 1) return;
    
    const nextIndex = (index + 1) % items.length;
    
    // Start transition
    setIsTransitioning(true);
    setTransitionTargetIndex(nextIndex);
    
    // Fade out old content first (using AUTO_CONTENT_FADE_OUT_DURATION)
    setShowContent(false);
    
    // After fade-out completes, start fade-in of new content
    setTimeout(() => {
      setShowContent(true);
    }, AUTO_CONTENT_FADE_OUT_DURATION * 1000);
    
    // Change index only after background transition completes
    // This prevents the background from being interrupted by key changes
    setTimeout(() => {
      setIndex(nextIndex);
      setIsTransitioning(false);
      setTransitionTargetIndex(null);
    }, AUTO_TRANSITION_CROSSFADE_DURATION * 1000);
  };

  // Auto-advance timer - only runs if video is NOT playing and video modal is NOT open
  // Note: Auto-advance RESUMES when video enters PIP mode (video is no longer blocking the carousel)
  useEffect(() => {
    if (items.length <= 1) return;
    // Pause auto-advance while dragging or transitioning
    if (isDragging || isTransitioning) return;
    
    // Disable auto-advance when video modal is open
    if (isVideoModalOpen) {
      console.log('[HeroCarousel] Video modal is open, preventing auto-advance');
      // Clear any existing timer
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    
    // When video is in PIP mode, allow auto-advance to resume (video is no longer blocking the carousel)
    if (isPipMode) {
      console.log('[HeroCarousel] Video is in PIP mode, resuming auto-advance');
    }
    
    // Check if current item has video preview enabled and is playing
    const activeItem = items[index];
    const hasVideoPreview = (activeItem as any)?.enable_video_preview === true;
    const isVideoPlaying = hasVideoPreview && showPreviewVideo && isPreviewPlaying;
    
    // If video is playing, DO NOT set a timer - prevent transitions while video is playing
    if (isVideoPlaying) {
      console.log('[HeroCarousel] Video is playing, preventing auto-advance');
      // Clear any existing timer
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    
    // Clear any existing timer
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Video is not playing, video modal is not open, and not in PIP mode - set normal auto-advance timer
    console.log('[HeroCarousel] Setting auto-advance timer:', autoMs);
    timerRef.current = window.setTimeout(() => {
      console.log('[HeroCarousel] Auto-advance timer fired');
      autoAdvance();
    }, autoMs);
    
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [index, items.length, autoMs, isDragging, isTransitioning, showPreviewVideo, isPreviewPlaying, isVideoModalOpen, isPipMode]);

  // When video stops playing, wait 10 seconds before transitioning
  useEffect(() => {
    if (items.length <= 1) return;
    if (isDragging || isTransitioning) return;
    
    const activeItem = items[index];
    const hasVideoPreview = (activeItem as any)?.enable_video_preview === true;
    const isVideoPlaying = hasVideoPreview && showPreviewVideo && isPreviewPlaying;
    
    // Check if video just stopped playing (was playing, now not playing)
    const wasPlaying = wasVideoPlayingRef.current;
    const justStopped = wasPlaying && !isVideoPlaying;
    
    // Update ref for next check
    wasVideoPlayingRef.current = isVideoPlaying;
    
    // Only act when video just stopped playing
    if (!justStopped) return;
    
    console.log('[HeroCarousel] Video stopped playing, waiting 10 seconds before transition');
    
    // Clear any existing timer
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Wait 10 seconds after video stops, then transition
    timerRef.current = window.setTimeout(() => {
      console.log('[HeroCarousel] 10 seconds after video stopped, transitioning');
      autoAdvance();
    }, 10000);
    
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPreviewPlaying, index, items.length, isDragging, isTransitioning, showPreviewVideo]);

  const dots = useMemo(() => new Array(items.length).fill(0), [items.length]);

  // Touch handlers for swipe
  const minSwipeDistance = 50; // Minimum distance in pixels to trigger swipe
  const touchStartYRef = useRef<number | null>(null);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    // Only enable on mobile (touch devices)
    if (!isMobile) return; 
    
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    touchStartYRef.current = e.targetTouches[0].clientY;
    setIsDragging(true);
    setDragDistance(0);
    isHorizontalSwipeRef.current = null; // Reset direction detection
    setIsHorizontalSwipe(false);
    
    // Clear auto-advance timer
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null || touchStartYRef.current === null) return;
    
    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;
    const deltaX = Math.abs(currentX - touchStart);
    const deltaY = Math.abs(currentY - touchStartYRef.current);
    
    // Determine swipe direction early (after 5px of movement)
    if (isHorizontalSwipeRef.current === null) {
      if (deltaX > 5 || deltaY > 5) {
        // Lock direction once we have enough movement
        isHorizontalSwipeRef.current = deltaX > deltaY;
        
        // If horizontal, disable scrolling on the main container and fade content
        if (isHorizontalSwipeRef.current === true) {
          setIsHorizontalSwipe(true);
          const scrollContainer = document.getElementById('main-scroll-container');
          if (scrollContainer) {
            scrollContainer.style.overflow = 'hidden';
            scrollContainer.style.touchAction = 'none';
          }
        }
      } else {
        // Not enough movement yet, wait
        return;
      }
    }
    
    // If it's a horizontal swipe, prevent default to stop vertical scrolling
    if (isHorizontalSwipeRef.current === true) {
      e.preventDefault();
      e.stopPropagation();
      const distance = touchStart - currentX;
      setDragDistance(distance);
      setTouchEnd(currentX);
    }
    // If it's vertical, don't interfere - let it scroll normally
  };

  const onTouchEnd = () => {
    // Re-enable scrolling on the main container
    const scrollContainer = document.getElementById('main-scroll-container');
    if (scrollContainer) {
      scrollContainer.style.overflow = '';
      scrollContainer.style.touchAction = '';
    }
    
    if (!touchStart || !touchEnd) {
      setIsDragging(false);
      setDragDistance(0);
      touchStartYRef.current = null;
      isHorizontalSwipeRef.current = null;
      setIsHorizontalSwipe(false);
      return;
    }
    
    // Only process swipe if it was determined to be horizontal
    let isLeftSwipe = false;
    let isRightSwipe = false;
    
    if (isHorizontalSwipeRef.current === true) {
      const distance = touchStart - touchEnd;
      isLeftSwipe = distance > minSwipeDistance;
      isRightSwipe = distance < -minSwipeDistance;

      if (isLeftSwipe || isRightSwipe) {
        // Calculate target index before changing
        const targetIndex = isLeftSwipe 
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
        
        // Start transition and track target
        setIsTransitioning(true);
        setTransitionTargetIndex(targetIndex);
        setShowContent(false);
        
        // Change slide immediately (content is already faded from drag)
        if (isLeftSwipe) {
          next();
        } else {
          prev();
        }
        
        // Reset showContent to trigger fade-in animation when slide changes
        setShowContent(false);
        // Start content fade-in after component remounts with new slide
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setShowContent(true);
          });
        });
        
        // Complete transition after background crossfade completes
        setTimeout(() => {
          setIsTransitioning(false);
          setTransitionTargetIndex(null);
        }, BACKGROUND_CROSSFADE_DURATION);
      }
    }
    
    // Reset touch state
    setTouchStart(null);
    setTouchEnd(null);
    setDragDistance(0);
    touchStartYRef.current = null;
    isHorizontalSwipeRef.current = null;
    setIsHorizontalSwipe(false);
    setIsDragging(false);
    
    // Reset transition target and content visibility if swipe didn't complete
    if (!isLeftSwipe && !isRightSwipe) {
      setTransitionTargetIndex(null);
      setShowContent(true);
    }
  };

  // Parallax scroll effect - match content modal's approach
  const [scrollY, setScrollY] = useState(0);
  const imageRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Get the main scroll container (same approach as content modal)
    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer) return;

    const handleScroll = () => {
      // Use scroll container's scrollTop directly (like content modal)
      const scrollTop = scrollContainer.scrollTop;
      setScrollY(scrollTop);
    };

    // Listen to scroll container's scroll event (like content modal)
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      // Ensure scrolling is re-enabled on cleanup
      scrollContainer.style.overflow = '';
      scrollContainer.style.touchAction = '';
    };
  }, []);

  // Stop preview video and fade back to background when scrolled 80% past carousel
  useEffect(() => {
    if (!showPreviewVideo || !previewPlaybackId || items.length === 0) return;
    
    // Check if current item has video preview enabled
    const activeItem = items[index];
    if (!(activeItem as any)?.enable_video_preview) return;
    
    if (!carouselRef.current) return;

    // Carousel height is 90vh, so 30% down is 0.3 * 0.9 = 27% of viewport height
    const carouselHeight = window.innerHeight * 0.9; // 90vh
    const threshold = carouselHeight * 0.3; // 30% of carousel height

    if (scrollY > threshold && !audioFadedOutRef.current) {
      console.log('[HeroCarousel] Scrolled past 30% of carousel, fading out audio but keeping video playing');
      audioFadedOutRef.current = true; // Mark as faded to prevent repeated fades
      
      // Get video element for audio fade-out (but keep video playing)
      const container = previewVideoRef.current;
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
        // Check if audio is unmuted (not muted)
        const isUnmuted = !video.muted;
        
        if (isUnmuted && video.volume > 0) {
          // Store original volume before fading (only if not already stored)
          if (!video.dataset.originalVolume) {
            video.dataset.originalVolume = video.volume.toString();
          }
          
          // Fade out audio volume smoothly over 0.5 seconds
          // Use setInterval with fewer updates to prevent crackling
          const fadeDuration = 500; // milliseconds
          const updateInterval = 20; // Update every 20ms (50fps) instead of every frame
          const startVolume = video.volume;
          const startTime = Date.now();
          let fadeInterval: NodeJS.Timeout | null = null;
          
          fadeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / fadeDuration, 1);
            
            // Use smoother ease-out curve (quadratic instead of cubic)
            const easedProgress = 1 - Math.pow(1 - progress, 2);
            const newVolume = startVolume * (1 - easedProgress);
            
            // Clamp volume to valid range
            video!.volume = Math.max(0, Math.min(1, newVolume));
            
            if (progress >= 1) {
              // Fade complete - keep volume at 0, video continues playing
              if (fadeInterval) clearInterval(fadeInterval);
              video!.volume = 0; // Keep volume at 0 after fade
            }
          }, updateInterval);
        }
        // If audio is already muted or volume is 0, do nothing - video continues playing
      }
    } else if (scrollY <= threshold && audioFadedOutRef.current) {
      // Reset flag and fade audio back in when scrolled back up
      audioFadedOutRef.current = false;
      
      // Fade audio volume back in if it was faded out
      const container = previewVideoRef.current;
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
        
        if (video && video.dataset.originalVolume) {
          const targetVolume = parseFloat(video.dataset.originalVolume);
          const currentVolume = video.volume;
          
          // Only fade in if volume is currently low (was faded out)
          if (currentVolume < targetVolume * 0.1) {
            // Fade in audio volume smoothly over 0.5 seconds
            const fadeDuration = 500; // milliseconds
            const updateInterval = 20; // Update every 20ms (50fps)
            const startTime = Date.now();
            let fadeInterval: NodeJS.Timeout | null = null;
            
            fadeInterval = setInterval(() => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / fadeDuration, 1);
              
              // Use smoother ease-out curve (quadratic)
              const easedProgress = 1 - Math.pow(1 - progress, 2);
              const newVolume = currentVolume + (targetVolume - currentVolume) * easedProgress;
              
              // Clamp volume to valid range
              video!.volume = Math.max(0, Math.min(1, newVolume));
              
              if (progress >= 1) {
                // Fade complete - restore to original volume
                if (fadeInterval) clearInterval(fadeInterval);
                video!.volume = targetVolume;
                delete video.dataset.originalVolume;
              }
            }, updateInterval);
          } else {
            // Volume wasn't faded, just restore immediately
            video.volume = targetVolume;
            delete video.dataset.originalVolume;
          }
        }
      }
    }
  }, [scrollY, showPreviewVideo, previewPlaybackId, index]);

  // Stop carousel video when other previews start (hover or content modal)
  useEffect(() => {
    const handleStopCarouselPreview = () => {
      if (!showPreviewVideo || !isPreviewPlaying || items.length === 0) return;
      
      // Check if current item has video preview enabled
      const activeItem = items[index];
      if (!(activeItem as any)?.enable_video_preview) return;
      
      console.log('[HeroCarousel] Stopping carousel preview due to other preview starting');
      
      const container = previewVideoRef.current;
      if (!container) return;

      // Fade out video and fade in background
      container.style.transition = 'opacity 0.5s ease-out';
      container.style.opacity = '0';

      // Get video element for audio fade-out
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
        // Check if audio is unmuted (not muted)
        const isUnmuted = !video.muted;
        
        if (isUnmuted) {
          // Fade out audio volume smoothly over 0.5 seconds
          // Use setInterval with fewer updates to prevent crackling
          const fadeDuration = 500; // milliseconds
          const updateInterval = 20; // Update every 20ms (50fps) instead of every frame
          const startVolume = video.volume;
          const startTime = Date.now();
          let fadeInterval: NodeJS.Timeout | null = null;
          
          fadeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / fadeDuration, 1);
            
            // Use smoother ease-out curve (quadratic instead of cubic)
            const easedProgress = 1 - Math.pow(1 - progress, 2);
            const newVolume = startVolume * (1 - easedProgress);
            
            // Clamp volume to valid range
            video!.volume = Math.max(0, Math.min(1, newVolume));
            
            if (progress >= 1) {
              // Fade complete, pause video
              if (fadeInterval) clearInterval(fadeInterval);
              video!.pause();
              setIsPreviewPlaying(false);
              setShowPreviewVideo(false);
              // Reset volume for next play
              video!.volume = startVolume;
              // Keep previewPlaybackId so restart button remains visible
            }
          }, updateInterval);
        } else {
          // Audio is muted, just pause immediately after fade
          setTimeout(() => {
            video!.pause();
            setIsPreviewPlaying(false);
            setShowPreviewVideo(false);
            // Keep previewPlaybackId so restart button remains visible
          }, 500);
        }
      }
    };

    // Listen for custom events from row-shelf (hover) and content-modal (open)
    window.addEventListener('harmonywatch_stop_carousel_preview', handleStopCarouselPreview);

    return () => {
      window.removeEventListener('harmonywatch_stop_carousel_preview', handleStopCarouselPreview);
    };
  }, [showPreviewVideo, isPreviewPlaying, index]);
  
  // Reset video state when video modal opens or closes
  useEffect(() => {
    if (isVideoModalOpen) {
      // Modal opened - stop carousel preview
      if (showPreviewVideo && previewVideoRef.current) {
        const container = previewVideoRef.current;
        const muxVideoElement = container.querySelector('mux-video') as any;
        let video: HTMLVideoElement | null = null;
        
        if (muxVideoElement) {
          video = muxVideoElement.shadowRoot?.querySelector('video') || 
                  muxVideoElement.querySelector('video') || 
                  container.querySelector('video') as HTMLVideoElement;
        } else {
          video = container.querySelector('video') as HTMLVideoElement;
        }
        
        if (video && !video.paused) {
          video.pause();
        }
        setIsPreviewPlaying(false);
        setShowPreviewVideo(false);
      }
    } else {
      // Modal closed - reset video state to prevent black screen on mobile
      // On mobile, don't auto-show video after modal closes
      if (isMobile) {
        setShowPreviewVideo(false);
        setIsPreviewPlaying(false);
        // Reset preview data so it can be loaded fresh if needed
        previewDataLoadedRef.current = false;
      }
    }
  }, [isVideoModalOpen, isMobile, showPreviewVideo]);
  
  // Cleanup: re-enable scrolling when dragging stops
  useEffect(() => {
    if (!isDragging) {
      const scrollContainer = document.getElementById('main-scroll-container');
      if (scrollContainer) {
        scrollContainer.style.overflow = '';
        scrollContainer.style.touchAction = '';
      }
    }
  }, [isDragging]);

  // Ensure image is loaded before showing it
  const ensureImageLoaded = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (loadedBackgroundImages.has(url)) {
        resolve();
        return;
      }
      
      const img = new window.Image();
      img.onload = () => {
        setLoadedBackgroundImages(prev => new Set(prev).add(url));
        resolve();
      };
      img.onerror = () => {
        resolve(); // Resolve anyway to not block
      };
      img.src = url;
    });
  }, [loadedBackgroundImages]);

  // Calculate swipe progress and target slide for crossfade
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const swipeProgress = isDragging ? Math.min(1, Math.abs(dragDistance) / screenWidth) : (isTransitioning ? 1 : 0);
  
  let targetItem: MediaItem | undefined = undefined;
  if (isTransitioning && transitionTargetIndex !== null) {
    // During auto-transition, use the tracked target index
    targetItem = items[transitionTargetIndex];
  } else if (isDragging && dragDistance !== 0) {
    // During drag, calculate based on direction
    if (dragDistance > 0) {
      // Swiping left - show next slide
      const nextIndex = (index + 1) % items.length;
      targetItem = items[nextIndex];
    } else {
      // Swiping right - show previous slide
      const prevIndex = (index - 1 + items.length) % items.length;
      targetItem = items[prevIndex];
    }
  }
  
  // Use target item for content during transition so new content appears early
  // But only after fade-out completes - during fade-out, show old content
  const contentItem = (isTransitioning && targetItem && showContent) ? targetItem : active;

  // Preload target image when dragging starts
  useEffect(() => {
    if (isDragging && targetItem) {
      const targetBgUrl = targetItem.backgroundUrls && targetItem.backgroundUrls.length > 0
        ? targetItem.backgroundUrls[0]
        : targetItem.backgroundUrl;
      if (targetBgUrl) {
        ensureImageLoaded(targetBgUrl);
      }
    }
  }, [isDragging, targetItem, ensureImageLoaded]);

  // Calculate adjacent slides for preloading
  const nextIndex = items.length > 0 ? (index + 1) % items.length : 0;
  const prevIndex = items.length > 0 ? (index - 1 + items.length) % items.length : 0;
  const nextItem = items[nextIndex];
  const prevItem = items[prevIndex];

  return (
    <section 
      ref={carouselRef}
      className="relative w-full overflow-hidden h-[90vh]" 
      aria-label="Featured"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Background images with crossfade */}
      <div className="absolute inset-0">
        {/* Current background */}
        {activeBackgroundUrl && (
          <motion.div
            ref={imageRef}
            key={`${active.id}-${activeBackgroundUrl}`}
            className="absolute inset-0"
            style={{
              scale: 1.15,
              y: scrollY * 0.25,
            }}
            initial={false}
            animate={{
              opacity: isInitialLoad 
                ? 0
                : (isTransitioning && transitionTargetIndex === index) 
                  ? 1  // New active (target) - stay visible
                : (isDragging || isTransitioning) 
                  ? (isTransitioning 
                      ? (transitionTargetIndex !== null && transitionTargetIndex !== index ? 0 : 1)  // Fade out if not target, stay visible if target
                      : 1 - swipeProgress)  // Manual swipe fade
                  : (showPreviewVideo && items.length > 0 && (items[index] as any)?.enable_video_preview && (!isMobile || isPreviewPlaying)) 
                    ? 0  // Fade out background when preview video is showing (and playing on mobile)
                    : 1,
            }}
            transition={{
              duration: (isInitialLoad || isInitialFadeIn) 
                ? INITIAL_FADE_IN_DURATION 
                : isTransitioning 
                  ? AUTO_TRANSITION_CROSSFADE_DURATION
                  : showPreviewVideo && items.length > 0 && (items[index] as any)?.enable_video_preview && (!isMobile || isPreviewPlaying)
                    ? 0.5  // Fade duration when switching to preview (and playing on mobile)
                    : 0,
              ease: "easeOut",
            }}
          >
            <Image
              src={activeBackgroundUrl}
              alt={active.title}
              fill
              sizes="100vw"
              priority
              className="object-cover"
              unoptimized
            />
          </motion.div>
        )}

        {/* Preview Video Overlay - Only for first item after 1 second */}
        {/* Positioned exactly like the background image, replacing it - behind overlays and content */}
        {/* Only show if current item has video preview enabled */}
        {showPreviewVideo && previewPlaybackId && (items[index] as any)?.enable_video_preview && (
          <motion.div
            ref={previewVideoRef}
            key={`preview-video-${active.id}`}
            className="absolute inset-0 pointer-events-none"
            style={{
              scale: 1.15,
              y: scrollY * 0.25,
              zIndex: 0,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <MuxVideo
              playbackId={previewPlaybackId}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                pointerEvents: 'none',
              }}
              muted={isPreviewMuted}
              playsInline
              crossOrigin="anonymous"
              preload="auto"
            />
          </motion.div>
        )}
        
        {/* Target background (during swipe or transition) */}
        {/* Keep target visible during transition even after index changes, until transition completes */}
        {(isDragging || isTransitioning) && targetItem && (isTransitioning || targetItem.id !== active.id) && (() => {
          // Get random background for target item
          const targetBackgroundUrl = targetItem.backgroundUrls && targetItem.backgroundUrls.length > 0
            ? targetItem.backgroundUrls[Math.floor(Math.random() * targetItem.backgroundUrls.length)]
            : targetItem.backgroundUrl;
          
          return targetBackgroundUrl ? (
            <motion.div
              key={`target-${targetItem.id}-${targetBackgroundUrl}`}
              className="absolute inset-0"
              style={{
                scale: 1.15,
                y: scrollY * 0.25,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: isTransitioning 
                  ? 1 
                  : (loadedBackgroundImages.has(targetBackgroundUrl) 
                      ? Math.max(0, Math.min(1, swipeProgress))
                      : 0), // Stay at 0 until image is loaded
              }}
              transition={{
                duration: isTransitioning ? AUTO_TRANSITION_CROSSFADE_DURATION : 0,
                ease: "easeOut",
              }}
            >
              <Image
                src={targetBackgroundUrl}
                alt={targetItem.title}
                fill
                sizes="100vw"
                className="object-cover"
                unoptimized
                onLoad={() => {
                  if (targetBackgroundUrl) {
                    setLoadedBackgroundImages(prev => new Set(prev).add(targetBackgroundUrl));
                  }
                }}
              />
            </motion.div>
          ) : null;
        })()}
        
        {/* Preload adjacent backgrounds to prevent flashing - always render to ensure they're loaded */}
        {nextItem && nextItem.id !== active.id && (() => {
          const nextBackgroundUrl = nextItem.backgroundUrls && nextItem.backgroundUrls.length > 0
            ? nextItem.backgroundUrls[0] // Use first one for preload
            : nextItem.backgroundUrl;
          return nextBackgroundUrl ? (
            <div className="absolute inset-0 opacity-0 pointer-events-none" style={{ zIndex: -1 }}>
              <Image
                src={nextBackgroundUrl}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
                unoptimized
                priority={false}
              />
            </div>
          ) : null;
        })()}
        {prevItem && prevItem.id !== active.id && (() => {
          const prevBackgroundUrl = prevItem.backgroundUrls && prevItem.backgroundUrls.length > 0
            ? prevItem.backgroundUrls[0] // Use first one for preload
            : prevItem.backgroundUrl;
          return prevBackgroundUrl ? (
            <div className="absolute inset-0 opacity-0 pointer-events-none" style={{ zIndex: -1 }}>
              <Image
                src={prevBackgroundUrl}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
                unoptimized
                priority={false}
              />
            </div>
          ) : null;
        })()}
      </div>

      {/* top fade to black for status bar transition - mobile only */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[100px] bg-gradient-to-b from-black to-transparent sm:hidden" />
      {/* subtle overall darkening for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/20" />
      {/* larger bottom fade to page background (extended by ~100px) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] bg-gradient-to-b from-transparent to-[#0f0f0f]" />

      {/* Mute/Unmute button or Restart button - shown when preview video is available */}
      {/* Positioned on the right side (aligned horizontally with profile image in header), at the same vertical level as play/info buttons */}
      {/* Show restart button when video is available but not playing, or when background is showing */}
      {/* Only show if current item has video preview enabled */}
      {/* Hidden on mobile */}
      {previewPlaybackId && items.length > 0 && (items[index] as any)?.enable_video_preview && !isMobile && (
        <div className="absolute inset-x-0 bottom-32 sm:bottom-36 z-30 pointer-events-none">
          <div className="mx-auto max-w-[1700px] px-4 sm:px-6">
            <div className="flex justify-end">
              {showPreviewVideo && isPreviewPlaying ? (
                // Mute/Unmute button when video is playing
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreviewMute();
                  }}
                  className="pointer-events-auto w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-black/15 hover:bg-black/50 active:bg-black/70 transition-colors flex items-center justify-center cursor-pointer"
                  aria-label={isPreviewMuted ? "Unmute video" : "Mute video"}
                >
                  {isPreviewMuted ? (
                    <svg className="w-6 h-6 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
              ) : (
                // Restart button when video is not playing (background is showing)
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // If video container doesn't exist yet, we need to show it first
                    if (!showPreviewVideo) {
                      setShowPreviewVideo(true);
                      // Wait a bit for the video element to render
                      setTimeout(() => {
                        const container = previewVideoRef.current;
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
                          // Start at 20% of video duration
                          if (video.duration && video.duration > 0) {
                            const startTime = video.duration * 0.2;
                            previewStartTimeRef.current = startTime;
                            video.currentTime = startTime;
                          } else {
                            // If duration not available, wait for it
                            const waitForDuration = () => {
                              if (video!.duration && video!.duration > 0) {
                                const startTime = video!.duration * 0.2;
                                previewStartTimeRef.current = startTime;
                                video!.currentTime = startTime;
                              } else {
                                  setTimeout(waitForDuration, 100);
                              }
                            };
                            video.addEventListener('loadedmetadata', waitForDuration, { once: true });
                          }
                          // Mute for autoplay, then apply user preference after play starts
                          video.muted = true;
                          video.play().then(() => {
                            video!.muted = isPreviewMuted;
                            console.log('[HeroCarousel] Restart: Video started, applying user mute preference:', isPreviewMuted);
                          }).catch((err) => {
                            console.log('[HeroCarousel] Restart play failed:', err);
                          });
                          setIsPreviewPlaying(true);
                        }
                      }, 300);
                    } else {
                      // Video container exists, restart immediately
                      const container = previewVideoRef.current;
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
                        // Start at 20% of video duration
                        if (video.duration && video.duration > 0) {
                          const startTime = video.duration * 0.2;
                          previewStartTimeRef.current = startTime;
                          video.currentTime = startTime;
                        } else {
                          // If duration not available, wait for it
                          const waitForDuration = () => {
                            if (video!.duration && video!.duration > 0) {
                              const startTime = video!.duration * 0.2;
                              previewStartTimeRef.current = startTime;
                              video!.currentTime = startTime;
                            } else {
                              setTimeout(waitForDuration, 100);
                            }
                          };
                          video.addEventListener('loadedmetadata', waitForDuration, { once: true });
                        }
                        // Mute for autoplay, then apply user preference after play starts
                        video.muted = true;
                        video.play().then(() => {
                          video!.muted = isPreviewMuted;
                          console.log('[HeroCarousel] Restart: Video started, applying user mute preference:', isPreviewMuted);
                        }).catch((err) => {
                          console.log('[HeroCarousel] Restart play failed:', err);
                        });
                        setIsPreviewPlaying(true);
                        setShowPreviewVideo(true); // Ensure video is visible
                      }
                    }
                  }}
                  className="pointer-events-auto w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-black/15 hover:bg-black/50 active:bg-black/70 transition-colors flex items-center justify-center cursor-pointer"
                  aria-label="Restart preview"
                >
                  <svg className="w-6 h-6 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* content */}
      <div className="absolute inset-x-0 bottom-32 sm:bottom-36 text-white">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6">
          <motion.div 
            className="max-w-none text-center sm:text-left"
            key={isTransitioning && targetItem && showContent ? targetItem.id : active.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ 
              opacity: isInitialLoad 
                ? 0
                : (isDragging && isHorizontalSwipe) || !showContent 
                  ? 0 
                  : 1,
              y: isInitialLoad 
                ? -20
                : (isDragging && isHorizontalSwipe) || !showContent 
                  ? 20  // Fade down and out
                  : 0   // Fade up and in
            }}
            transition={{
              duration: (isInitialLoad || isInitialFadeIn)
                ? INITIAL_FADE_IN_DURATION 
                : isDragging 
                  ? CONTENT_FADE_OUT_DURATION 
                  : isTransitioning
                    ? (!showContent ? AUTO_CONTENT_FADE_OUT_DURATION : AUTO_CONTENT_FADE_IN_DURATION)
                    : CONTENT_FADE_IN_DURATION,
              ease: "easeInOut",
            }}
          >
            {contentItem?.logoUrl ? (
              <div className="flex justify-center sm:justify-start h-[110px] sm:h-[160px]">
                <div className="w-auto h-full">
                  <Image
                    src={contentItem.logoUrl}
                    alt={contentItem.title + " logo"}
                    width={520}
                    height={200}
                    className="w-auto h-full object-contain"
                    priority
                    unoptimized
                  />
                </div>
              </div>
            ) : (
              <h1 className="text-[2.25rem] font-bold tracking-wide leading-tight">{contentItem?.title}</h1>
            )}
            {/* Badges */}
            {(() => {
              // Combine manual badges with auto-badge if enabled
              const allBadges = [...(contentItem?.badges || [])];
              
              // Add auto-badge for daily series if enabled
              if (contentItem?.autoBadgeEnabled && contentItem?.isDailyContent) {
                const today = new Date();
                // Always show current date for the badge (not adjusted for calendar type)
                // Format with ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
                const day = today.getDate();
                const month = today.toLocaleDateString('default', { month: 'long' });
                const ordinalSuffix = (n: number): string => {
                  if (n > 3 && n < 21) return 'th';
                  switch (n % 10) {
                    case 1: return 'st';
                    case 2: return 'nd';
                    case 3: return 'rd';
                    default: return 'th';
                  }
                };
                const formattedDate = `${month} ${day}${ordinalSuffix(day)}`;
                allBadges.unshift(formattedDate);
              }
              
              // Add Premium badge if item is premium and user is free
              const showPremiumBadge = contentItem?.isPremium && (!user || (!hasActiveSubscription && user.user_type !== 'admin'));
              
              return (allBadges.length > 0 || showPremiumBadge) ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                  {showPremiumBadge && <PremiumBadge />}
                  {allBadges.map((badge, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 rounded-full bg-white/10 text-white text-sm font-medium border border-white/20"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null;
            })()}
            {(contentItem?.subtitle || contentItem?.todayEpisodeDescription) && (
              <p className="mt-3 text-[1rem] text-white leading-relaxed max-w-[520px] h-[72px] sm:h-[80px] mx-auto sm:mx-0 line-clamp-3 overflow-hidden">
                {contentItem.isDailyContent && contentItem.todayEpisodeDescription 
                  ? contentItem.todayEpisodeDescription 
                  : contentItem.subtitle}
              </p>
            )}
            <div className="mt-4 flex items-center gap-3 justify-center sm:justify-start">
              {/* Play button */}
              <button 
                onClick={handlePlay}
                className="inline-flex items-center gap-2 rounded-[8px] bg-white text-black px-4 py-2 font-semibold shadow-sm hover:shadow transition-shadow cursor-pointer"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="normal-case">play</span>
              </button>
              {/* Info button - circular outline with "i" */}
              <button
                onClick={(e) => active && onInfo?.(active, e)}
                className="w-9 h-9 grid place-items-center rounded-full border-2 border-white text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg width="50" height="50" viewBox="0 0 38 38" fill="currentColor" aria-hidden>
                  <path d="M11 10h2v8h-2z" />
                  <path d="M11 6h2v2h-2z" />
                </svg>
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* arrows removed intentionally */}

      {/* dots */}
      <div className="absolute right-6 bottom-6 flex gap-2 z-50 pointer-events-auto items-center transition-transform duration-300 ease-in-out hover:scale-150 cursor-pointer">
        {dots.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => handleDotClick(i)}
            className={
              "h-2 w-2 rounded-full cursor-pointer transition-opacity hover:opacity-100 " + 
              (i === index ? "bg-white" : "bg-white/50")
            }
          />
        ))}
      </div>
    </section>
  );
}


