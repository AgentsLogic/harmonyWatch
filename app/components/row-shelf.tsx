"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { HoverPreview, type HoverData } from "./hover-preview";
import { publicConfig } from "@/lib/env";
import type { MediaItem } from "../lib/data";
import { useUser } from "@/app/contexts/user-context";
import { PremiumBadge } from "./premium-badge";
import MuxVideo from '@mux/mux-video-react';
import { useContentItems } from "@/lib/hooks/useContentItems";
import { contentItemsService } from "@/lib/database";
import { useModal } from "@/app/contexts/modal-context";
import { usePreviewMute } from "@/app/hooks/usePreviewMute";
import { clearVideoProgress } from "@/lib/utils/video-progress";
import { useAudioPlayer } from "./audio-player-provider";
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

type Props = {
  title: string;
  items: MediaItem[];
  className?: string;
  onCardClick?: (item: MediaItem, event?: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => void;
};

export function RowShelf({ title, items, className, onCardClick }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headingContainerRef = useRef<HTMLDivElement | null>(null);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const [leftGapPx, setLeftGapPx] = useState<number>(16);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const hoverEnabled = publicConfig.NEXT_PUBLIC_ENABLE_HOVER_PREVIEW;
  const pathname = usePathname();
  const { user, hasActiveSubscription } = useUser();
  const { getSeriesContent } = useContentItems();
  const { setPreviewStartTime, setVideoContentId, setIsVideoModalOpen } = useModal();
  const { isMuted: isPreviewMuted, toggleMute: togglePreviewMute } = usePreviewMute();
  const { setCurrentContent, setIsVisible: setAudioPlayerVisible } = useAudioPlayer();
  const queryClient = useQueryClient();
  
  // State for hover preview video
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const previewVideoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previewTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previewCurrentTimes = useRef<Map<string, number>>(new Map()); // Track current time per card
  const [scaledCardId, setScaledCardId] = useState<string | null>(null); // Track which card should be scaled
  const scaleTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map()); // Timeouts for scale delay
  const [detailsPosition, setDetailsPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const detailsHoverRef = useRef<boolean>(false); // Track if mouse is over details card
  const muteButtonHoverRef = useRef<Map<string, boolean>>(new Map()); // Track if mouse is over mute button for each card
  const removeButtonHoverRef = useRef<Map<string, boolean>>(new Map()); // Track if mouse is over remove button for each card
  const removeButtonHideTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // Timeout for hiding remove button when leaving
  const hoveredCardIdForRemoveRef = useRef<string | null>(null); // Ref to track current hovered card ID (for timeout callbacks)
  const videoStopTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // Timeout for stopping video when leaving card
  const cardCollapseTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // Timeout for collapsing card when leaving details
  const [hoveredCardIdForRemove, setHoveredCardIdForRemove] = useState<string | null>(null); // Track which card is hovered to show remove button
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set()); // Track removed items to filter them out
  const [isMobile, setIsMobile] = useState(false); // Track if device is mobile
  const [isDragging, setIsDragging] = useState(false); // Track if user is dragging on mobile
  
  // Initial fade-in animation state
  const INITIAL_FADE_IN_DURATION = 1.0; // seconds - matches hero carousel
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showContent, setShowContent] = useState(false);
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fade in on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
      // Set showContent to true in next frame to ensure smooth transition
      requestAnimationFrame(() => {
        setShowContent(true);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Memoized function to set hover data
  const handleHover = useCallback((item: MediaItem, rect: DOMRect, element: HTMLElement) => {
    setHoverData({ item, rect, element });
  }, []);

  // Handle video preview on card hover
  const handleCardHover = useCallback(async (item: MediaItem) => {
    // Disable hover preview on mobile
    if (isMobile) return;
    
    // Only show preview for video content
    if (item.content_type !== 'video') {
      console.log('[RowShelf Preview] Not video content, skipping:', item.content_type);
      return;
    }

    console.log('[RowShelf Preview] Starting preview for:', item.id, item.title);
    
    // Stop carousel preview if it's playing
    window.dispatchEvent(new CustomEvent('harmonywatch_stop_carousel_preview'));
    
    setHoveredCardId(item.id);
    setIsLoadingPreview(true);

    try {
      // Check if this is an individual content item (recently viewed items have progressPercentage)
      // or if it's from "Continue" section
      const isIndividualContent = item.progressPercentage !== undefined || title.startsWith("Continue");
      
      if (isIndividualContent) {
        // This is an individual content item - fetch it directly
        console.log('[RowShelf Preview] Detected individual content item, fetching directly');
        const contentItem = await contentItemsService.getById(item.id);
        if (contentItem && contentItem.content_type === 'video' && contentItem.mux_playback_id) {
          console.log('[RowShelf Preview] Setting playback ID from content item:', contentItem.mux_playback_id);
          setPreviewPlaybackId(contentItem.mux_playback_id);
        } else {
          console.log('[RowShelf Preview] No video playback ID found for content item:', item.id);
        }
      } else {
        // This might be a series - try to get series content first
        try {
          const contentItems = await getSeriesContent(item.id);
          console.log('[RowShelf Preview] Fetched content items (as series):', contentItems.length);
          
          if (contentItems.length > 0) {
            // It's a series - get first episode
            const firstEpisode = contentItems[0];
            console.log('[RowShelf Preview] First episode:', {
              id: firstEpisode.id,
              contentType: firstEpisode.content_type,
              muxPlaybackId: firstEpisode.mux_playback_id
            });
            
            if (firstEpisode.content_type === 'video' && firstEpisode.mux_playback_id) {
              console.log('[RowShelf Preview] Setting playback ID from series:', firstEpisode.mux_playback_id);
              setPreviewPlaybackId(firstEpisode.mux_playback_id);
              return;
            }
          }
        } catch (seriesError) {
          // Series lookup failed - try as individual content item
          console.log('[RowShelf Preview] Series lookup failed, trying as individual content item:', seriesError);
        }
        
        // Fallback: try as individual content item
        console.log('[RowShelf Preview] Trying as individual content item');
        const contentItem = await contentItemsService.getById(item.id);
        if (contentItem && contentItem.content_type === 'video' && contentItem.mux_playback_id) {
          console.log('[RowShelf Preview] Setting playback ID from content item:', contentItem.mux_playback_id);
          setPreviewPlaybackId(contentItem.mux_playback_id);
        } else {
          console.log('[RowShelf Preview] No video playback ID found for item:', item.id);
        }
      }
    } catch (error) {
      console.error('[RowShelf Preview] Failed to load preview video:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getSeriesContent, title, isMobile]);

  // Handle mouse leave - cleanup preview
  const handleCardLeave = useCallback((itemId: string, immediate: boolean = false) => {
    // Don't stop video if mouse is over details card
    if (!immediate && detailsHoverRef.current && scaledCardId === itemId) {
      return;
    }
    
    setHoveredCardId(null);
    setPreviewPlaybackId(null);
    setIsLoadingPreview(false);
    
    // Clear any timeouts
    const timeout = previewTimeouts.current.get(itemId);
    if (timeout) {
      clearTimeout(timeout);
      previewTimeouts.current.delete(itemId);
    }
    
    // Clear video stop timeout
    const stopTimeout = videoStopTimeoutRef.current.get(itemId);
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      videoStopTimeoutRef.current.delete(itemId);
    }
    
    // Don't clear previewCurrentTimes - keep it for when card is clicked
  }, [scaledCardId]);

  // Handle card click - store preview time before opening modal
  const handleCardClickWithPreview = useCallback((item: MediaItem, event?: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    // Check if click came from mute button or remove button - if so, don't open modal
    if (event && 'target' in event) {
      const target = event.target as HTMLElement;
      const clickedMuteButton = target.closest('button[aria-label*="Mute"]') || 
                       target.closest('button[aria-label*="Unmute"]') ||
                       target.closest('svg')?.parentElement?.closest('button[aria-label*="Mute"]') ||
                       target.closest('svg')?.parentElement?.closest('button[aria-label*="Unmute"]');
      const clickedRemoveButton = target.closest('button[aria-label*="Remove from Continue"]') ||
                       target.closest('svg')?.parentElement?.closest('button[aria-label*="Remove from Continue"]');
      if (clickedMuteButton || clickedRemoveButton) {
        return; // Don't open modal if mute button or remove button was clicked
      }
    }
    
    // Get the current preview time if this card was being hovered
    const previewTime = previewCurrentTimes.current.get(item.id);
    if (previewTime !== undefined && previewTime > 0) {
      console.log('[RowShelf] Storing preview start time:', previewTime, 'for item:', item.id);
      setPreviewStartTime(previewTime);
    } else {
      setPreviewStartTime(null);
    }
    
    // Collapse the card and stop preview video
    if (scaledCardId === item.id) {
      setScaledCardId(null);
      handleCardLeave(item.id, true);
    }
    
    // Clear any pending timeouts
    const scaleTimeout = scaleTimeouts.current.get(item.id);
    if (scaleTimeout) {
      clearTimeout(scaleTimeout);
      scaleTimeouts.current.delete(item.id);
    }
    const collapseTimeout = cardCollapseTimeoutRef.current.get(item.id);
    if (collapseTimeout) {
      clearTimeout(collapseTimeout);
      cardCollapseTimeoutRef.current.delete(item.id);
    }
    
    // Call the original onCardClick handler
    onCardClick?.(item, event);
  }, [onCardClick, setPreviewStartTime, scaledCardId, handleCardLeave]);

  // Handle play button click - open video modal or audio player with first episode
  const handlePlayButtonClick = useCallback(async (item: MediaItem, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    // Collapse the card and stop preview video before opening modal
    if (scaledCardId === item.id) {
      setScaledCardId(null);
      handleCardLeave(item.id, true);
    }
    
    // Clear any pending timeouts
    const scaleTimeout = scaleTimeouts.current.get(item.id);
    if (scaleTimeout) {
      clearTimeout(scaleTimeout);
      scaleTimeouts.current.delete(item.id);
    }
    const collapseTimeout = cardCollapseTimeoutRef.current.get(item.id);
    if (collapseTimeout) {
      clearTimeout(collapseTimeout);
      cardCollapseTimeoutRef.current.delete(item.id);
    }
    
    try {
      // Check if this is audio content (either series or individual item)
      const isAudioContent = item.content_type === 'audio';
      
      if (isAudioContent) {
        // For audio content, get the first episode and open audio player
        const seriesContent = await getSeriesContent(item.id);
        if (seriesContent && seriesContent.length > 0) {
          // Find first audio episode
          const firstAudioEpisode = seriesContent.find(ep => ep.content_type === 'audio');
          if (firstAudioEpisode) {
            // Mark user interaction for autoplay (trigger click event for existing listener)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('click'));
            }
            
            // Set the current content in the audio player
            setCurrentContent({
              id: firstAudioEpisode.id,
              title: firstAudioEpisode.title,
              description: firstAudioEpisode.description || '',
              duration: firstAudioEpisode.duration || '0',
              thumbnail: firstAudioEpisode.thumbnail_url || item.imageUrl || '/images/content-1.png',
              contentUrl: firstAudioEpisode.content_url || undefined,
              muxPlaybackId: firstAudioEpisode.mux_playback_id || undefined,
              contentType: 'audio'
            });
            // Show the audio player
            setAudioPlayerVisible(true);
            
            // Update URL with short_id if available
            if (typeof window !== 'undefined') {
              if (firstAudioEpisode.short_id) {
                const currentPath = window.location.pathname;
                if (currentPath !== `/${firstAudioEpisode.short_id}`) {
                  window.history.pushState({}, '', `/${firstAudioEpisode.short_id}`);
                }
              } else {
                // Log warning if short_id is missing (should be auto-generated on creation)
                console.warn('[RowShelf] Audio episode missing short_id:', firstAudioEpisode.id, firstAudioEpisode.title);
              }
            }
          }
        } else if (item.id) {
          // If it's already an individual audio content item, fetch it and open directly
          const audioContent = await contentItemsService.getById(item.id);
          if (audioContent && audioContent.content_type === 'audio') {
            // Mark user interaction for autoplay
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('click'));
            }
            
            // Set the current content in the audio player
            setCurrentContent({
              id: audioContent.id,
              title: audioContent.title,
              description: audioContent.description || '',
              duration: audioContent.duration || '0',
              thumbnail: audioContent.thumbnail_url || item.imageUrl || '/images/content-1.png',
              contentUrl: audioContent.content_url || undefined,
              muxPlaybackId: audioContent.mux_playback_id || undefined,
              contentType: 'audio'
            });
            // Show the audio player
            setAudioPlayerVisible(true);
            
            // Update URL with short_id if available
            if (typeof window !== 'undefined') {
              if (audioContent.short_id) {
                const currentPath = window.location.pathname;
                if (currentPath !== `/${audioContent.short_id}`) {
                  window.history.pushState({}, '', `/${audioContent.short_id}`);
                }
              } else {
                // Log warning if short_id is missing (should be auto-generated on creation)
                console.warn('[RowShelf] Audio content missing short_id:', audioContent.id, audioContent.title);
              }
            }
          }
        }
      } else {
        // For video content, open video modal
        const seriesContent = await getSeriesContent(item.id);
        if (seriesContent && seriesContent.length > 0) {
          // Find first video episode
          const firstVideoEpisode = seriesContent.find(ep => ep.content_type === 'video');
          if (firstVideoEpisode) {
            setVideoContentId(firstVideoEpisode.id);
            setIsVideoModalOpen(true);
          }
        } else if (item.content_type === 'video' && item.id) {
          // If it's already a video content item, open it directly
          setVideoContentId(item.id);
          setIsVideoModalOpen(true);
        }
      }
    } catch (error) {
      console.error('[RowShelf] Error opening content:', error);
    }
  }, [getSeriesContent, setVideoContentId, setIsVideoModalOpen, scaledCardId, handleCardLeave, setCurrentContent, setAudioPlayerVisible]);

  // Handle remove from Continue list
  const handleRemoveFromContinue = useCallback(async (item: MediaItem, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Remove from UI immediately (optimistic update)
    setRemovedItems(prev => new Set(prev).add(item.id));
    
    try {
      // Clear progress - wait for it to complete
      // Audio uses /api/playback/progress, video uses /api/video-progress
      if (item.content_type === 'audio') {
        // Clear audio progress from user_playback_progress table
        const response = await fetch(`/api/playback/progress?contentItemId=${item.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[RowShelf] Error clearing audio progress:', response.status, errorText);
          // Revert optimistic update on error
          setRemovedItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(item.id);
            return newSet;
          });
          return;
        }
      } else {
        // Clear video progress from playback_progress table
        await clearVideoProgress(item.id);
      }
      
      // Invalidate React Query cache to refresh the recently viewed list
      if (user?.id) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.recentlyViewed.byUser(user.id) 
        });
      }
    } catch (error) {
      console.error('[RowShelf] Error clearing progress:', error);
      // Revert optimistic update on error
      setRemovedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
    }
  }, [user?.id, queryClient]);

  // Handle info button click - open content modal
  const handleInfoButtonClick = useCallback((item: MediaItem, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    // Collapse the card and stop preview video before opening modal
    if (scaledCardId === item.id) {
      setScaledCardId(null);
      handleCardLeave(item.id, true);
    }
    
    // Clear any pending timeouts
    const scaleTimeout = scaleTimeouts.current.get(item.id);
    if (scaleTimeout) {
      clearTimeout(scaleTimeout);
      scaleTimeouts.current.delete(item.id);
    }
    const collapseTimeout = cardCollapseTimeoutRef.current.get(item.id);
    if (collapseTimeout) {
      clearTimeout(collapseTimeout);
      cardCollapseTimeoutRef.current.delete(item.id);
    }
    
    handleCardClickWithPreview(item, e as any);
  }, [handleCardClickWithPreview, scaledCardId, handleCardLeave]);

  // Dynamically align first card with the left edge of the main content container
  useEffect(() => {
    const updateLeftGap = () => {
      const el = headingContainerRef.current;
      if (!el) return;
      
      // Check if parent containers have transforms that might affect calculation
      // Wait for transforms to be cleared
      const checkForTransforms = (): boolean => {
        let parent: HTMLElement | null = el.parentElement;
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          const transform = style.transform;
          // Check if transform is anything other than 'none' or 'matrix(1, 0, 0, 1, 0, 0)'
          if (transform && transform !== 'none' && !transform.includes('matrix(1, 0, 0, 1, 0, 0)')) {
            // Has a transform - wait and retry
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      };
      
      const performCalculation = () => {
        // Double-check transforms one more time before calculating
        if (checkForTransforms()) {
          // Still has transforms, wait a bit more
          setTimeout(() => {
            if (!checkForTransforms()) {
              const rect = el.getBoundingClientRect();
              setLeftGapPx(Math.max(0, Math.floor(rect.left)));
            }
          }, 50);
          return;
        }
        
        const rect = el.getBoundingClientRect();
        // Use the distance from viewport left to container left as padding
        setLeftGapPx(Math.max(0, Math.floor(rect.left)));
      };
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          performCalculation();
        });
      });
    };
    
    // Initial calculation - wait for layout and transforms to settle
    // Use multiple delays to catch different timing issues
    const timeout1 = setTimeout(() => {
      updateLeftGap();
    }, 100); // Wait for initial render
    
    const timeout2 = setTimeout(() => {
      updateLeftGap();
    }, 350); // After swipe transition completes (300ms transition + buffer)
    
    const timeout3 = setTimeout(() => {
      updateLeftGap();
    }, 500); // Final check after all animations
    
    window.addEventListener("resize", updateLeftGap);
    
    // Also recalculate when page becomes visible (handles navigation back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          updateLeftGap();
        }, 150);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener("resize", updateLeftGap);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [pathname]); // Recalculate when pathname changes (handles navigation back)

  // Update details position when card is scaled
  useEffect(() => {
    if (!scaledCardId) {
      setDetailsPosition(null);
      return;
    }

    const updatePosition = () => {
      const cardElement = cardRefs.current.get(scaledCardId);
      if (cardElement) {
        // Get the button element inside (the actual card that's scaled)
        const buttonElement = cardElement.querySelector('button[data-card]') as HTMLElement;
        const elementToMeasure = buttonElement || cardElement;
        
        const rect = elementToMeasure.getBoundingClientRect();
        // getBoundingClientRect() includes the CSS transform scale, so rect.width is already 125% of original
        // Position details card directly at bottom of card with no gap
        setDetailsPosition({
          top: rect.bottom,
          left: rect.left,
          width: rect.width // This should already be the scaled width (125%)
        });
      }
    };

    // Initial position - wait for scale animation to complete (300ms duration)
    // Add a small buffer to ensure transform is fully applied
    const initialTimeout = setTimeout(() => {
      requestAnimationFrame(updatePosition);
    }, 350); // 300ms animation + 50ms buffer
    
    // Update on scroll (both window and container scroll)
    const handleScroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updatePosition); // Double RAF for smooth updates
      });
    };
    
    // Update on resize
    const handleResize = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updatePosition);
      });
    };

    // Listen to both window scroll and the scroller container scroll
    // Also listen to the main scroll container
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    // Also listen to the main scroll container
    const mainScrollContainer = document.getElementById('main-scroll-container');
    if (mainScrollContainer) {
      mainScrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      clearTimeout(initialTimeout);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (scroller) {
        scroller.removeEventListener('scroll', handleScroll);
      }
      if (mainScrollContainer) {
        mainScrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [scaledCardId]);

  // Cleanup hover data on unmount
  useEffect(() => {
    return () => {
      hoverTimer.current && window.clearTimeout(hoverTimer.current);
      setHoverData(null);
      // Cleanup all preview timeouts
      previewTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      previewTimeouts.current.clear();
      // Cleanup all scale timeouts
      scaleTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      scaleTimeouts.current.clear();
      // Cleanup all video stop timeouts
      videoStopTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      videoStopTimeoutRef.current.clear();
      // Cleanup all card collapse timeouts
      cardCollapseTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      cardCollapseTimeoutRef.current.clear();
    };
  }, []);

  // Handle video unmuting and time tracking for preview videos
  useEffect(() => {
    if (!hoveredCardId || !previewPlaybackId) return;

    const container = previewVideoRefs.current.get(hoveredCardId);
    if (!container) return;

    let retryCount = 0;
    const maxRetries = 50;
    let timeUpdateHandler: ((e: Event) => void) | null = null;
    let canPlayHandler: ((e: Event) => void) | null = null;
    let playHandler: ((e: Event) => void) | null = null;

    const findAndSetupVideo = () => {
      const muxVideoElement = container.querySelector('mux-video') as any;
      const video = muxVideoElement?.querySelector('video') || container.querySelector('video') as HTMLVideoElement;
      
      if (video) {
        // Set mute state from localStorage
        video.muted = isPreviewMuted;
        
        // Set preload to auto for faster loading
        video.preload = 'auto';
        
        // Try to play immediately if possible
        video.play().catch((err: unknown) => {
          // Ignore autoplay errors - video will play when ready
          console.log('[RowShelf Preview] Autoplay attempt:', err);
        });
        
        // Setup mute state handlers (only unmute if not muted)
        canPlayHandler = () => {
          video.muted = isPreviewMuted;
          // Try to play when video can play
          video.play().catch(() => {});
        };
        playHandler = () => {
          video.muted = isPreviewMuted;
        };
        
        video.addEventListener('canplay', canPlayHandler);
        video.addEventListener('play', playHandler);
        
        // Setup time tracking to stop at 60 seconds (1 minute) and track current time
        timeUpdateHandler = () => {
          // Store current time for resume functionality
          previewCurrentTimes.current.set(hoveredCardId, video.currentTime);
          
          if (video.currentTime >= 60) {
            // Fade out video and fade in thumbnail
            const videoContainer = container.querySelector('[data-preview-video]') as HTMLElement;
            const thumbnail = container.parentElement?.querySelector('img') as HTMLElement;
            
            if (videoContainer) {
              videoContainer.style.transition = 'opacity 0.5s ease-out';
              videoContainer.style.opacity = '0';
            }
            
            if (thumbnail) {
              thumbnail.style.transition = 'opacity 0.5s ease-in';
              thumbnail.style.opacity = '1';
            }
            
            // Stop video after fade completes
            setTimeout(() => {
              video.pause();
              handleCardLeave(hoveredCardId);
            }, 500);
          }
        };
        video.addEventListener('timeupdate', timeUpdateHandler);
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(findAndSetupVideo, 100);
      }
    };

    findAndSetupVideo();

    return () => {
      const muxVideoElement = container.querySelector('mux-video') as any;
      const video = muxVideoElement?.querySelector('video') || container.querySelector('video') as HTMLVideoElement;
      if (video) {
        if (canPlayHandler) video.removeEventListener('canplay', canPlayHandler);
        if (playHandler) video.removeEventListener('play', playHandler);
        if (timeUpdateHandler) video.removeEventListener('timeupdate', timeUpdateHandler);
      }
    };
  }, [hoveredCardId, previewPlaybackId, handleCardLeave, isPreviewMuted]);

  // Update video muted state when isPreviewMuted changes (for synchronization)
  useEffect(() => {
    if (!hoveredCardId || !previewPlaybackId) return;

    const container = previewVideoRefs.current.get(hoveredCardId);
    if (!container) return;

    const updateVideoMutedState = () => {
      const muxVideoElement = container.querySelector('mux-video') as any;
      const video = muxVideoElement?.querySelector('video') || container.querySelector('video') as HTMLVideoElement;
      
      if (video) {
        video.muted = isPreviewMuted;
        console.log('[RowShelf] Updated video muted state to:', isPreviewMuted, 'for card:', hoveredCardId);
      }
    };

    // Try to update immediately
    updateVideoMutedState();

    // Also try after a short delay in case video element isn't ready yet
    const timeout = setTimeout(updateVideoMutedState, 100);

    return () => clearTimeout(timeout);
  }, [isPreviewMuted, hoveredCardId, previewPlaybackId]);

  // Check scroll position and update arrow visibility
  const updateScrollButtons = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    
    const scrollLeft = scroller.scrollLeft;
    const scrollWidth = scroller.scrollWidth;
    const clientWidth = scroller.clientWidth;
    
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  // Update scroll buttons on mount and items change
  useEffect(() => {
    updateScrollButtons();
  }, [items]);

  // Add scroll event listener and track drag state on mobile
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    
    scroller.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    
    // Track drag state on mobile to hide arrows during drag
    if (isMobile) {
      const handleTouchStart = () => {
        setIsDragging(true);
      };
      
      const handleTouchEnd = () => {
        // Small delay to ensure scroll has finished
        setTimeout(() => {
          setIsDragging(false);
        }, 100);
      };
      
      scroller.addEventListener('touchstart', handleTouchStart, { passive: true });
      scroller.addEventListener('touchend', handleTouchEnd, { passive: true });
      scroller.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    
    return () => {
      scroller.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
        scroller.removeEventListener('touchstart', handleTouchStart);
        scroller.removeEventListener('touchend', handleTouchEnd);
        scroller.removeEventListener('touchcancel', handleTouchEnd);
      };
    }
    
    return () => {
      scroller.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [isMobile]);

  const scrollByCards = (dir: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // Scroll by a full viewport width of the shelf for strong paging behavior
    const amount = scroller.clientWidth;
    scroller.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  // Filter out removed items
  const filteredItems = items.filter(m => !removedItems.has(m.id));
  
  // Don't render if no items after filtering
  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <motion.section 
      className={"mt-6 sm:mt-8 overflow-visible " + (className ?? "")}
      initial={{ opacity: 0 }}
      animate={{ 
        opacity: isInitialLoad ? 0 : (showContent ? 1 : 0)
      }}
      transition={{
        duration: INITIAL_FADE_IN_DURATION,
        ease: "easeOut",
      }}
    >
      <div ref={headingContainerRef} className="mx-auto max-w-[1700px] px-4 sm:px-6">
        <h2 className="text-[1.275rem] font-semibold text-white mb-[-10px] -ml-[16px] sm:-ml-[24px]">{title}</h2>
      </div>
      <div className="group relative -mx-[calc(50vw-50%)] px-0" style={{ overflowY: 'visible', overflowX: 'visible' }}>
        <div
          ref={scrollerRef}
          className="no-scrollbar flex gap-4 scroll-smooth pr-0 py-6"
          style={{ 
            paddingLeft: leftGapPx + 5,
            overflowX: 'auto',
            overflowY: 'visible',
            clipPath: 'none',
            contain: 'none'
          }}
        >
          {filteredItems.map((m, index) => (
            <motion.div
              key={m.id + title}
              ref={(el) => {
                if (el) {
                  cardRefs.current.set(m.id, el);
                } else {
                  cardRefs.current.delete(m.id);
                }
              }}
              className={`shrink-0 flex flex-col transition-transform duration-300 relative ${
                !title.startsWith("Continue") && scaledCardId === m.id ? 'scale-125 z-50' : 'z-0'
              }`}
              style={{ 
                width: m.content_type === 'audio' ? '169px' : '300px',
                ...(scaledCardId === m.id && !title.startsWith("Continue") ? {
                  isolation: 'isolate',
                  contain: 'none',
                } : {})
              }}
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: isInitialLoad ? 0 : (showContent ? 1 : 0)
              }}
              transition={{
                duration: INITIAL_FADE_IN_DURATION,
                delay: index * 0.05, // Stagger animation for each thumbnail
                ease: "easeOut",
              }}
              onMouseEnter={() => {
                // Disable hover effects on mobile
                if (isMobile) return;
                
                // Only scale if not in "Continue" section
                if (!title.startsWith("Continue")) {
                  // Clear any existing collapse timeout when re-entering card
                  const collapseTimeout = cardCollapseTimeoutRef.current.get(m.id);
                  if (collapseTimeout) {
                    clearTimeout(collapseTimeout);
                    cardCollapseTimeoutRef.current.delete(m.id);
                  }
                  
                  // If card is already scaled, keep it scaled (don't wait 1 second again)
                  if (scaledCardId === m.id) {
                    return;
                  }
                  
                  // Clear any existing timeout
                  const existingTimeout = scaleTimeouts.current.get(m.id);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                  }
                  // Set scale after 1 second delay
                  const timeout = setTimeout(() => {
                    setScaledCardId(m.id);
                  }, 1000);
                  scaleTimeouts.current.set(m.id, timeout);
                }
              }}
              onMouseLeave={(e) => {
                // Disable hover effects on mobile
                if (isMobile) return;
                
                // Don't collapse if mouse is over details card
                if (detailsHoverRef.current && scaledCardId === m.id) {
                  return;
                }
                
                // Check if mouse is moving to details card by checking relatedTarget
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (relatedTarget) {
                  // Check if the related target is the details card or within it
                  const detailsCard = document.querySelector('[data-details-card]') as HTMLElement;
                  if (detailsCard && (detailsCard.contains(relatedTarget) || relatedTarget === detailsCard)) {
                    return; // Mouse is moving to details card, don't collapse
                  }
                }
                
                // Clear timeout for scaling
                const timeout = scaleTimeouts.current.get(m.id);
                if (timeout) {
                  clearTimeout(timeout);
                  scaleTimeouts.current.delete(m.id);
                }
                
                // Add a small delay before collapsing to allow mouse to move back to card
                // Clear any existing collapse timeout
                const existingCollapseTimeout = cardCollapseTimeoutRef.current.get(m.id);
                if (existingCollapseTimeout) {
                  clearTimeout(existingCollapseTimeout);
                }
                
                // Set timeout to collapse card
                const collapseTimeout = setTimeout(() => {
                  // Double-check: only collapse if mouse is not over details card and not back on card
                  if (!detailsHoverRef.current && scaledCardId === m.id) {
                    // Check if mouse is actually over the card element
                    const cardElement = cardRefs.current.get(m.id);
                    if (cardElement) {
                      const rect = cardElement.getBoundingClientRect();
                      const mouseX = e.clientX;
                      const mouseY = e.clientY;
                      const isOverCard = mouseX >= rect.left && mouseX <= rect.right && 
                                        mouseY >= rect.top && mouseY <= rect.bottom;
                      if (!isOverCard) {
                        // Stop video when collapsing card (if not over details)
                        if (m.content_type === 'video' && !detailsHoverRef.current) {
                          handleCardLeave(m.id, true);
                        }
                        setScaledCardId(null);
                      }
                    } else {
                      // Stop video when collapsing card (if not over details)
                      if (m.content_type === 'video' && !detailsHoverRef.current) {
                        handleCardLeave(m.id, true);
                      }
                      setScaledCardId(null);
                    }
                  }
                  cardCollapseTimeoutRef.current.delete(m.id);
                }, 150); // 150ms delay to allow mouse to move back to card
                
                cardCollapseTimeoutRef.current.set(m.id, collapseTimeout);
              }}
            >
              <div 
                className="relative group"
                onMouseEnter={() => {
                  // Disable hover effects on mobile
                  if (isMobile) return;
                  
                  if (title.startsWith("Continue")) {
                    // Cancel any pending hide timeout when mouse re-enters card
                    const existingTimeout = removeButtonHideTimeoutRef.current.get(m.id);
                    if (existingTimeout) {
                      clearTimeout(existingTimeout);
                      removeButtonHideTimeoutRef.current.delete(m.id);
                    }
                    // Mark that mouse is over card (not just button)
                    removeButtonHoverRef.current.set(m.id, true);
                    hoveredCardIdForRemoveRef.current = m.id;
                    setHoveredCardIdForRemove(m.id);
                  }
                }}
                onMouseLeave={(e) => {
                  // Disable hover effects on mobile
                  if (isMobile) return;
                  
                  if (title.startsWith("Continue")) {
                    // Check if mouse is moving to remove button by checking relatedTarget
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    const removeButton = document.querySelector(`button[aria-label="Remove from Continue list"][data-item-id="${m.id}"]`) as HTMLElement;
                    
                    // If mouse is moving to remove button, don't hide
                    if (relatedTarget && removeButton && (removeButton.contains(relatedTarget) || relatedTarget === removeButton)) {
                      return;
                    }
                    
                    // Mark that mouse left the card (not over card anymore)
                    removeButtonHoverRef.current.set(m.id, false);
                    
                      // Clear any existing hide timeout
                      const existingTimeout = removeButtonHideTimeoutRef.current.get(m.id);
                      if (existingTimeout) {
                        clearTimeout(existingTimeout);
                      }
                      // Add a delay to allow mouse to move to remove button
                      const hideTimeout = setTimeout(() => {
                      // Double-check that mouse is not over remove button
                        const stillOverRemoveButton = removeButtonHoverRef.current.get(m.id);
                      // Only hide if this card is still the one that should be hidden
                      // (check current hovered state via ref to avoid hiding a different card that was hovered after)
                      if (!stillOverRemoveButton && hoveredCardIdForRemoveRef.current === m.id) {
                        hoveredCardIdForRemoveRef.current = null;
                          setHoveredCardIdForRemove(null);
                        }
                        removeButtonHideTimeoutRef.current.delete(m.id);
                      }, 150); // Increased delay to prevent flashing
                      removeButtonHideTimeoutRef.current.set(m.id, hideTimeout);
                  }
                }}
              >
               <button
                 data-card
                 className={`${
                   !title.startsWith("Continue") && scaledCardId === m.id 
                     ? 'rounded-t-[0.5rem]' 
                     : 'rounded-[0.5rem]'
                 } overflow-hidden relative ${
                   m.content_type === 'audio' ? 'w-full aspect-square' : 'w-full aspect-video'
                 } bg-[#2a2a2a] text-left outline-none ring-0 transition-all duration-200 ${
                   !title.startsWith("Continue") && scaledCardId === m.id ? '' : 'hover:shadow-[0_0_24px_0_rgba(255,255,255,0.35)]'
                 } focus-visible:ring-2 focus-visible:ring-white cursor-pointer`}
                 style={{ position: 'relative' }}
                 onClick={(e) => handleCardClickWithPreview(m, e)}
                onMouseEnter={(e) => {
                  // Disable hover effects on mobile
                  if (isMobile) return;
                  
                  console.log('[RowShelf] Mouse enter on card:', {
                    id: m.id,
                    title: m.title,
                    content_type: m.content_type,
                    hoverEnabled
                  });
                  
                  // Cancel any pending collapse timeout when re-entering button
                  const collapseTimeout = cardCollapseTimeoutRef.current.get(m.id);
                  if (collapseTimeout) {
                    clearTimeout(collapseTimeout);
                    cardCollapseTimeoutRef.current.delete(m.id);
                  }
                  
                  // Cancel any pending video stop timeout when re-entering card (from mute button leave)
                  const stopTimeout = videoStopTimeoutRef.current.get(m.id);
                  if (stopTimeout) {
                    clearTimeout(stopTimeout);
                    videoStopTimeoutRef.current.delete(m.id);
                  }
                  
                  // Handle video preview with 0.5 second delay (scaling is 1 second)
                  if (m.content_type === 'video') {
                    console.log('[RowShelf] Scheduling video preview with 0.5 second delay');
                    // Clear any existing timeout for this card
                    const existingTimeout = previewTimeouts.current.get(m.id);
                    if (existingTimeout) {
                      clearTimeout(existingTimeout);
                    }
                    // Delay video preview by 0.5 seconds
                    const videoTimeout = setTimeout(() => {
                      console.log('[RowShelf] Calling handleCardHover for video content');
                      handleCardHover(m);
                    }, 500);
                    previewTimeouts.current.set(m.id, videoTimeout);
                  } else {
                    console.log('[RowShelf] Not video content, skipping preview:', m.content_type);
                  }
                  
                  // Handle hover preview (for the popup preview)
                  if (!hoverEnabled) return;
                  const target = e.currentTarget as HTMLElement;
                  const rect = target.getBoundingClientRect();
                  hoverTimer.current && window.clearTimeout(hoverTimer.current);
                  hoverTimer.current = window.setTimeout(() => {
                    handleHover(m, rect, target);
                  }, 500);
                }}
                onMouseLeave={() => {
                  // Disable hover effects on mobile
                  if (isMobile) return;
                  
                  hoverTimer.current && window.clearTimeout(hoverTimer.current);
                  hoverTimer.current = null;
                  // Don't immediately hide - let the preview handle mouse leave
                  
                  // Don't stop video if mouse is moving to mute button or details card
                  const isOverMuteButton = muteButtonHoverRef.current.get(m.id);
                  if (isOverMuteButton || detailsHoverRef.current) {
                    return;
                  }
                  
                  // Cleanup video preview timeout
                  if (m.content_type === 'video') {
                    const videoTimeout = previewTimeouts.current.get(m.id);
                    if (videoTimeout) {
                      clearTimeout(videoTimeout);
                      previewTimeouts.current.delete(m.id);
                    }
                    
                    // Add a small delay before stopping video to allow mouse to move to details card or mute button
                    // Clear any existing stop timeout
                    const existingStopTimeout = videoStopTimeoutRef.current.get(m.id);
                    if (existingStopTimeout) {
                      clearTimeout(existingStopTimeout);
                    }
                    
                    // Set a timeout to stop video, but it will be cancelled if mouse enters details or mute button
                    const stopTimeout = setTimeout(() => {
                      // Only stop if mouse is not over details card or mute button
                      if (!detailsHoverRef.current && !muteButtonHoverRef.current.get(m.id)) {
                        handleCardLeave(m.id, true);
                      }
                      videoStopTimeoutRef.current.delete(m.id);
                    }, 100); // 100ms delay to allow mouse to move to details card or mute button
                    
                    videoStopTimeoutRef.current.set(m.id, stopTimeout);
                  }
                }}
              >
                {/* Thumbnail image - always shown */}
                {m.imageUrl ? (
                  <Image
                    src={m.imageUrl}
                    alt={m.title}
                    width={640}
                    height={360}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-[#2a2a2a] flex items-center justify-center">
                    <span className="text-gray-500 text-sm">No image</span>
                  </div>
                )}
                {/* Preview video - overlays thumbnail when ready */}
                {hoveredCardId === m.id && previewPlaybackId && m.content_type === 'video' ? (
                  <div 
                    ref={(el) => {
                      if (el) {
                        previewVideoRefs.current.set(m.id, el);
                      } else {
                        previewVideoRefs.current.delete(m.id);
                      }
                    }}
                    className="absolute inset-0 w-full h-full z-20 pointer-events-none"
                    style={{ 
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0
                    }}
                  >
                    <MuxVideo
                      data-preview-video
                      playbackId={previewPlaybackId}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        opacity: hoveredCardId === m.id && previewPlaybackId ? 1 : 0,
                        transition: 'opacity 0.5s ease-in'
                      }}
                      autoPlay="any"
                      muted={isPreviewMuted}
                      playsInline
                      crossOrigin="anonymous"
                      preload="auto"
                      streamType="on-demand"
                    />
                    {/* Series logo in bottom left corner - only shown when expanded */}
                    {m.logoUrl && scaledCardId === m.id && (
                      <div className="absolute bottom-3 left-3 z-30 h-10 w-auto max-w-[70%]">
                        <Image
                          src={m.logoUrl}
                          alt={m.title + " Logo"}
                          width={300}
                          height={40}
                          className="h-full w-auto object-contain"
                          unoptimized
                        />
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Premium badge - only show for free users */}
                {m.isPremium && (!user || (!hasActiveSubscription && user.user_type !== 'admin')) && (
                  <div className="absolute top-2 right-2 z-10">
                    <PremiumBadge />
                  </div>
                )}
                
                {/* Progress bar for Continue items */}
                {title.startsWith("Continue") && m.progressPercentage !== undefined && m.progressPercentage > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#2a2a2a]/80">
                    <div 
                      className="h-full bg-red-600 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, m.progressPercentage))}%` }}
                    />
                  </div>
                )}
              </button>
              </div>
              {/* Remove button for Continue items - appears on hover for this specific card - positioned outside button to avoid nesting */}
              {title.startsWith("Continue") && (
                <button
                  data-item-id={m.id}
                  onClick={(e) => handleRemoveFromContinue(m, e)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={() => {
                    // Mark that mouse is over remove button
                    removeButtonHoverRef.current.set(m.id, true);
                    // Cancel any pending hide timeout
                    const existingTimeout = removeButtonHideTimeoutRef.current.get(m.id);
                    if (existingTimeout) {
                      clearTimeout(existingTimeout);
                      removeButtonHideTimeoutRef.current.delete(m.id);
                    }
                    // Ensure button stays visible
                    hoveredCardIdForRemoveRef.current = m.id;
                    setHoveredCardIdForRemove(m.id);
                  }}
                  onMouseLeave={(e) => {
                    // Mark that mouse left remove button
                    removeButtonHoverRef.current.set(m.id, false);
                    
                    // Check if mouse is moving back to the card
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    const cardElement = cardRefs.current.get(m.id);
                    if (relatedTarget && cardElement && (cardElement.contains(relatedTarget) || relatedTarget === cardElement)) {
                      // Mouse is moving back to card, keep button visible
                      return;
                    }
                    
                    // Clear any existing hide timeout
                    const existingTimeout = removeButtonHideTimeoutRef.current.get(m.id);
                    if (existingTimeout) {
                      clearTimeout(existingTimeout);
                    }
                    // Hide button after a delay, but only if mouse is not back on card
                    const hideTimeout = setTimeout(() => {
                      // Check again if mouse is back on card
                      if (cardElement) {
                        const rect = cardElement.getBoundingClientRect();
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        const isOverCard = mouseX >= rect.left && mouseX <= rect.right && 
                                            mouseY >= rect.top && mouseY <= rect.bottom;
                        if (isOverCard) {
                          // Mouse is back on card, keep button visible
                          removeButtonHideTimeoutRef.current.delete(m.id);
                          return;
                        }
                      }
                      const stillOverRemoveButton = removeButtonHoverRef.current.get(m.id);
                      // Only hide if this card is still the one that should be hidden
                      // (check current hovered state via ref to avoid hiding a different card that was hovered after)
                      if (!stillOverRemoveButton && hoveredCardIdForRemoveRef.current === m.id) {
                        hoveredCardIdForRemoveRef.current = null;
                        setHoveredCardIdForRemove(null);
                      }
                      removeButtonHideTimeoutRef.current.delete(m.id);
                    }, 150); // Increased delay to prevent flashing
                    removeButtonHideTimeoutRef.current.set(m.id, hideTimeout);
                  }}
                  className={`absolute top-2 right-2 z-30 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    hoveredCardIdForRemove === m.id 
                      ? 'opacity-100 pointer-events-auto' 
                      : 'opacity-0 pointer-events-none'
                  }`}
                  style={{ position: 'absolute' }}
                  aria-label="Remove from Continue list"
                >
                  <svg 
                    className="w-5 h-5 text-white" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M6 18L18 6M6 6l12 12" 
                    />
                  </svg>
                </button>
              )}
              {/* Mute/Unmute button in bottom right corner - only shown when expanded and content is video - positioned outside button to avoid nesting */}
              {scaledCardId === m.id && m.content_type === 'video' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    togglePreviewMute();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={() => {
                    // Mark that mouse is over mute button to prevent video from stopping
                    muteButtonHoverRef.current.set(m.id, true);
                    // Cancel any pending video stop
                    const stopTimeout = videoStopTimeoutRef.current.get(m.id);
                    if (stopTimeout) {
                      clearTimeout(stopTimeout);
                      videoStopTimeoutRef.current.delete(m.id);
                    }
                  }}
                  onMouseLeave={() => {
                    // Mark that mouse left mute button
                    muteButtonHoverRef.current.set(m.id, false);
                    // Add a small delay before stopping video to allow mouse to move back to card
                    const existingStopTimeout = videoStopTimeoutRef.current.get(m.id);
                    if (existingStopTimeout) {
                      clearTimeout(existingStopTimeout);
                    }
                    const stopTimeout = setTimeout(() => {
                      // Only stop if mouse is not back on card or details
                      if (!detailsHoverRef.current && !muteButtonHoverRef.current.get(m.id)) {
                        handleCardLeave(m.id, true);
                      }
                      videoStopTimeoutRef.current.delete(m.id);
                    }, 100);
                    videoStopTimeoutRef.current.set(m.id, stopTimeout);
                  }}
                  className="absolute bottom-3 right-3 z-30 w-8 h-8 rounded-full bg-black/15 hover:bg-black/50 transition-colors flex items-center justify-center cursor-pointer"
                  aria-label={isPreviewMuted ? "Unmute video" : "Mute video"}
                  style={{ position: 'absolute' }}
                >
                    {isPreviewMuted ? (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                </button>
              )}
              {/* Details section - shows when scaled (not for Continue watching) - rendered via portal to escape clipping */}
              {typeof window !== 'undefined' && !title.startsWith("Continue watching") && scaledCardId === m.id && detailsPosition && createPortal(
                <div 
                  data-details-card
                  className="fixed pt-3 pb-4 px-3 bg-[#2a2a2a] rounded-b-lg cursor-pointer"
                  style={{ 
                    top: `${detailsPosition.top}px`,
                    left: `${detailsPosition.left}px`,
                    width: `${detailsPosition.width}px`,
                    pointerEvents: 'auto', // Enable pointer events to detect hover
                    animation: 'slideInFromTop 0.3s ease-out forwards',
                    zIndex: 10 // Lower than video (z-20) and thumbnail so it slides from behind
                  }}
                  onClick={(e) => {
                    // Only open modal if clicking on the card itself, not on buttons
                    if ((e.target as HTMLElement).closest('button')) {
                      return; // Buttons handle their own clicks
                    }
                    
                    // Collapse the card and stop preview video before opening modal
                    if (scaledCardId === m.id) {
                      setScaledCardId(null);
                      handleCardLeave(m.id, true);
                    }
                    
                    // Clear any pending timeouts
                    const scaleTimeout = scaleTimeouts.current.get(m.id);
                    if (scaleTimeout) {
                      clearTimeout(scaleTimeout);
                      scaleTimeouts.current.delete(m.id);
                    }
                    const collapseTimeout = cardCollapseTimeoutRef.current.get(m.id);
                    if (collapseTimeout) {
                      clearTimeout(collapseTimeout);
                      cardCollapseTimeoutRef.current.delete(m.id);
                    }
                    
                    handleCardClickWithPreview(m, e as any);
                  }}
                  onMouseEnter={() => {
                    detailsHoverRef.current = true;
                    // Cancel any pending video stop when entering details
                    if (m.content_type === 'video') {
                      const stopTimeout = videoStopTimeoutRef.current.get(m.id);
                      if (stopTimeout) {
                        clearTimeout(stopTimeout);
                        videoStopTimeoutRef.current.delete(m.id);
                      }
                    }
                    // Cancel any pending collapse when entering details
                    const collapseTimeout = cardCollapseTimeoutRef.current.get(m.id);
                    if (collapseTimeout) {
                      clearTimeout(collapseTimeout);
                      cardCollapseTimeoutRef.current.delete(m.id);
                    }
                  }}
                  onMouseLeave={(e) => {
                    detailsHoverRef.current = false;
                    
                    // Check if mouse is moving back to the card
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    const cardElement = cardRefs.current.get(m.id);
                    if (relatedTarget && cardElement && (cardElement.contains(relatedTarget) || relatedTarget === cardElement)) {
                      // Mouse is moving back to card, don't collapse or stop video
                      return;
                    }
                    
                    // Add a small delay before stopping video and collapsing
                    // This allows mouse to move back to the card
                    const existingCollapseTimeout = cardCollapseTimeoutRef.current.get(m.id);
                    if (existingCollapseTimeout) {
                      clearTimeout(existingCollapseTimeout);
                    }
                    
                    const collapseTimeout = setTimeout(() => {
                      // Check again if mouse is back on card
                      if (cardElement) {
                        const rect = cardElement.getBoundingClientRect();
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        const isOverCard = mouseX >= rect.left && mouseX <= rect.right && 
                                            mouseY >= rect.top && mouseY <= rect.bottom;
                        if (isOverCard) {
                          // Mouse is back on card, don't collapse
                          cardCollapseTimeoutRef.current.delete(m.id);
                          return;
                        }
                      }
                      
                      // Stop video when leaving details (only if not back on card)
                      // Check if this card's video is still playing (hoveredCardId matches)
                      if (m.content_type === 'video' && hoveredCardId === m.id && !detailsHoverRef.current) {
                        handleCardLeave(m.id, true);
                      }
                      // Collapse card when leaving details (only if not back on card)
                      if (scaledCardId === m.id && !detailsHoverRef.current) {
                        setScaledCardId(null);
                      }
                      cardCollapseTimeoutRef.current.delete(m.id);
                    }, 150); // 150ms delay to allow mouse to move back to card
                    
                    cardCollapseTimeoutRef.current.set(m.id, collapseTimeout);
                  }}
                >
                  {/* Action buttons - Play and Info */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Play button - circular white */}
                    <button
                      onClick={(e) => handlePlayButtonClick(m, e)}
                      className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-white/90 transition-colors cursor-pointer"
                      aria-label="Play video"
                    >
                      <svg 
                        className="w-6 h-6 text-black ml-0.5" 
                        fill="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </button>
                    {/* Info button - grey circle with (i) */}
                    <button
                      onClick={(e) => handleInfoButtonClick(m, e)}
                      className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors cursor-pointer"
                      aria-label="More information"
                    >
                      <span className="text-white text-base font-bold">i</span>
                    </button>
                  </div>
                  {/* Rating and Tags */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {/* Rating */}
                    {m.rating && (
                      <span className="bg-white text-black text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap">
                        Rated {m.rating}
                      </span>
                    )}
                    {/* Tags */}
                    {m.tags && m.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {m.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="text-white/60 text-xs">
                            {tag}
                            {idx < Math.min(m.tags!.length, 3) - 1 && <span className="mx-1.5 text-white/40">•</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Series description */}
                  {m.subtitle && (
                    <div className="text-white/70 text-sm leading-relaxed line-clamp-3">
                      {m.subtitle}
                    </div>
                  )}
                </div>,
                document.body
              )}
              {/* Only show titles for "Continue" section */}
              {title.startsWith("Continue") && (
                <>
                  {/* Content title */}
                  <div className="text-white text-[0.9rem] font-semibold px-1 mt-2">
                    {m.title}
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>
        {hoverEnabled && (
          <HoverPreview data={hoverData} onClose={() => setHoverData(null)} onCardClick={onCardClick} />
        )}
        {/* arrows - only show on desktop */}
        {canScrollLeft && !isMobile && (
          <button
            aria-label="Scroll left"
            onClick={() => scrollByCards(-1)}
            className="absolute left-[20px] top-1/2 -translate-y-1/2 grid place-items-center text-white opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto z-10 cursor-pointer"
          >
            <span
              aria-hidden
              className="absolute -z-10 pointer-events-none"
              style={{
                width: "120px",
                height: "120px",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                borderRadius: "9999px",
                background:
                  "radial-gradient(closest-side, rgba(15,15,15,0.9) 0%, rgba(15,15,15,0.5) 55%, rgba(15,15,15,0.2) 75%, rgba(15,15,15,0) 100%)",
                filter: "blur(2px)",
              }}
            />
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
        )}
        {canScrollRight && !isMobile && (
          <button
            aria-label="Scroll right"
            onClick={() => scrollByCards(1)}
            className="absolute right-[20px] top-1/2 -translate-y-1/2 grid place-items-center text-white opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto z-10 cursor-pointer"
          >
            <span
              aria-hidden
              className="absolute -z-10 pointer-events-none"
              style={{
                width: "120px",
                height: "120px",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                borderRadius: "9999px",
                background:
                  "radial-gradient(closest-side, rgba(15,15,15,0.9) 0%, rgba(15,15,15,0.5) 55%, rgba(15,15,15,0.2) 75%, rgba(15,15,15,0) 100%)",
                filter: "blur(2px)",
              }}
            />
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="m8.59 16.59 1.41 1.41 6-6-6-6-1.41 1.41L13.17 12z"/>
            </svg>
          </button>
        )}
      </div>
    </motion.section>
  );
}


