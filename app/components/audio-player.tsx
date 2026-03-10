"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAudioPlayer } from "./audio-player-provider";
import { useUser } from "../contexts/user-context";
import { useCalendarPreference } from "@/lib/hooks/useCalendarPreference";
import { formatDateForDisplay } from "@/lib/utils/date-helpers";
import Hls from 'hls.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { destroyMusicControls, initMusicControls, isMusicControlsAvailable, updateElapsed, updatePlaybackState } from "@/lib/cordova/music-controls";
import { useModal } from "../contexts/modal-context";
import { Capacitor } from '@capacitor/core';

export default function AudioPlayer() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { isVisible, setIsVisible, currentContent, isExpanded, setIsExpanded, contentSelectionCount } = useAudioPlayer();
  const { user, hasActiveSubscription } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, isVideoModalOpen, isVideoModalInPipMode, setIsVideoModalOpen, setIsVideoModalInPipMode } = useModal();
  const queryClient = useQueryClient();
  
  // Progress tracking refs
  const lastSavedPosition = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedProgress = useRef<boolean>(false);
  const musicControlsCleanupRef = useRef<(() => void) | null>(null);
  const lastCheckedContentId = useRef<string | null>(null);
  
  // Track user interaction for autoplay policy
  // Don't initialize from sessionStorage - start fresh on each page load
  // This prevents autoplay on refresh
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Cache for series data to avoid repeated API calls
  interface SeriesData {
    seriesTitle: string | null;
    isDailyContent: boolean;
    newCalendarDate: string | null;
    oldCalendarDate: string | null;
    seriesThumbnailUrl: string | null;
  }
  const seriesDataCache = useRef<Map<string, SeriesData>>(new Map());

  // Helper function to fetch series data for a content item
  const getSeriesDataForContent = useCallback(async (contentId: string): Promise<SeriesData> => {
    // Check cache first
    if (seriesDataCache.current.has(contentId)) {
      return seriesDataCache.current.get(contentId)!;
    }

    try {
      const response = await fetch(`/api/content-items/${contentId}/series`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // If not found or error, cache default values
        const defaultData: SeriesData = {
          seriesTitle: null,
          isDailyContent: false,
          newCalendarDate: null,
          oldCalendarDate: null,
          seriesThumbnailUrl: null
        };
        seriesDataCache.current.set(contentId, defaultData);
        return defaultData;
      }

      const data = await response.json();
      const seriesData: SeriesData = {
        seriesTitle: data.seriesTitle || null,
        isDailyContent: data.isDailyContent || false,
        newCalendarDate: data.newCalendarDate || null,
        oldCalendarDate: data.oldCalendarDate || null,
        seriesThumbnailUrl: data.seriesThumbnailUrl || null
      };
      
      // Cache the result
      seriesDataCache.current.set(contentId, seriesData);
      return seriesData;
    } catch (error) {
      console.error('[AudioPlayer] Failed to fetch series data:', error);
      // Cache default values to avoid repeated failed requests
      const defaultData: SeriesData = {
        seriesTitle: null,
        isDailyContent: false,
        newCalendarDate: null,
        oldCalendarDate: null,
        seriesThumbnailUrl: null
      };
      seriesDataCache.current.set(contentId, defaultData);
      return defaultData;
    }
  }, []);

  // Drag state for mobile dismiss (horizontal for compact, vertical for expanded)
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasDraggedRef = useRef(false);
  const dragThreshold = 80;
  // Track when user is seeking on the slider to prevent drag-to-dismiss
  const [isSeeking, setIsSeeking] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // Helper function to fully stop and clean up audio
  const stopAudioCompletely = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      // Clear the source to prevent any background playback
      if (audio.src) {
        audio.src = '';
        audio.load(); // Reset the audio element
      }
      // Also destroy HLS instance if it exists
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);
  const [seriesTitle, setSeriesTitle] = useState<string | null>(null);
  const [isDailyContent, setIsDailyContent] = useState(false);
  const [newCalendarDate, setNewCalendarDate] = useState<string | null>(null);
  const [oldCalendarDate, setOldCalendarDate] = useState<string | null>(null);
  const [seriesThumbnailUrl, setSeriesThumbnailUrl] = useState<string | null>(null);
  const [showTextInsteadOfThumbnail, setShowTextInsteadOfThumbnail] = useState(false);
  
  // Get user's calendar preference
  const { calendarType } = useCalendarPreference();

  // Handle hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Track user interaction for autoplay policy
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUserInteraction = () => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
    };

    // Listen for any user interaction
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true });
    window.addEventListener('keydown', handleUserInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, [hasUserInteracted]);

  // Keep audio active in standalone mode when app goes to background
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handleVisibilityChange = () => {
      const audio = audioRef.current;
      if (!audio) return;
      
      // Detect standalone mode
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (window.navigator as any).standalone === true;
      
      if (isStandalone && document.hidden && isPlaying) {
        // App went to background - ensure audio stays active
        // This helps Media Session API work in standalone mode
        console.log('[MediaSession] App went to background in standalone mode, keeping audio active');
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Function to clean title by removing series/episode number (e.g., "Title | S1 E1" -> "Title", "1. Title" -> "Title")
  const cleanTitle = (title: string | undefined | null): string => {
    if (!title) return "No content selected";
    // First, remove number prefix (e.g., "1. Title" -> "Title")
    let cleaned = title.replace(/^\d+\.\s*/, '');
    // Then remove pattern like " | S1 E1", " | S1E1", "|S1 E1", or similar variations
    // Handles cases with or without spaces around the pipe and between S/E
    // Matches: " | S1 E1", "|S1E1", " | S1E1", "| S1 E1", etc.
    cleaned = cleaned.replace(/\s*\|\s*S\d+\s*E\d+.*$/i, '').trim();
    return cleaned;
  };

  // Save progress to database
  const saveProgress = useCallback(async (position: number, audioDuration: number) => {
    if (!user || !currentContent?.id || !audioDuration) {
      console.log('Cannot save progress - missing user, content, or duration');
      return;
    }
    
    // Only save if position changed significantly (>2 seconds)
    if (Math.abs(position - lastSavedPosition.current) < 2) {
      console.log('Position change too small, not saving');
      return;
    }

    console.log('Saving progress:', { position, duration: audioDuration, contentId: currentContent.id });

    try {
      const response = await fetch('/api/playback/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          contentItemId: currentContent.id,
          currentPosition: position,
          duration: audioDuration,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Progress saved successfully:', data);
        lastSavedPosition.current = position;
      } else {
        console.error('Failed to save progress:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
      // Don't block playback on save error
    }
  }, [user, currentContent]);

  // Fetch progress when content loads
  const fetchProgress = useCallback(async () => {
    if (!user || !currentContent?.id) {
      console.log('No user or content ID for progress fetch');
      return null;
    }

    try {
      const response = await fetch(
        `/api/playback/progress?contentItemId=${currentContent.id}`,
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Progress fetch response:', data);
        if (data.currentPosition && data.currentPosition > 5) {
          console.log('Found saved progress:', data.currentPosition);
          return data.currentPosition;
        }
      } else {
        console.error('Progress fetch failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
    return null;
  }, [user, currentContent]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      
      // Update Media Session position state when duration is loaded
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration || 0,
            playbackRate: audio.playbackRate || 1.0,
            position: audio.currentTime || 0,
          });
        } catch (error) {
          // setPositionState may not be supported on all platforms
        }
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      // Update Media Session position state for Android system controls
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration || 0,
            playbackRate: audio.playbackRate || 1.0,
            position: audio.currentTime || 0,
          });
        } catch (error) {
          // setPositionState may not be supported on all platforms
          // Silently fail - this is expected on some browsers
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Save progress when audio ends (will reset to 0 in API)
      if (audio.duration) {
        saveProgress(audio.duration, audio.duration);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      // Update Media Session playback state (for web-app compatibility)
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      // Update Media Session playback state (for web-app compatibility)
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
        navigator.mediaSession.playbackState = 'paused';
      }
      // Save progress immediately when paused
      if (audio.currentTime && audio.duration) {
        saveProgress(audio.currentTime, audio.duration);
      }
    };

    const handleLoadStart = () => {
      setIsLoading(true);
    };

    const handleError = (e: Event) => {
      setIsLoading(false);
      const audio = e.target as HTMLAudioElement;
      const error = audio.error;
      
      // Log detailed error information
      if (error) {
        console.error('Audio playback error:', {
          code: error.code,
          message: error.message,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src,
          currentSrc: audio.currentSrc
        });
      } else {
        // Error object is null - log what we can
        console.error('Audio playback error (no error details available):', {
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src,
          currentSrc: audio.currentSrc
        });
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('error', handleError);
    };
  }, [currentContent, saveProgress]);

  // Integrate with Cordova lock-screen controls when available
  useEffect(() => {
    // Set up music controls for lock screen
    if (!currentContent || !isMounted || !isMusicControlsAvailable()) {
      if (musicControlsCleanupRef.current) {
        musicControlsCleanupRef.current();
        musicControlsCleanupRef.current = null;
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    let cancelled = false;

    // Fetch series title and update Music Controls
    getSeriesDataForContent(currentContent.id).then(seriesData => {
      if (cancelled) return;

      const audio = audioRef.current;
      if (!audio) return;

      musicControlsCleanupRef.current = initMusicControls(
        {
          title: cleanTitle(currentContent.title) || "HarmonyWatch",
          artist: seriesData.seriesTitle || "HarmonyWatch", // Use series title instead of description
          cover: currentContent.thumbnail || null,
          duration: duration || audio.duration || 0,
          elapsed: audio.currentTime || 0,
          isPlaying,
        },
        (action, position) => {
          const player = audioRef.current;
          if (!player) return;

          switch (action) {
            case "music-controls-play":
              setIsVisible(true);
              player
                .play()
                .catch((error) => console.warn("[MusicControls] play failed", error));
              break;
            case "music-controls-pause":
              player.pause();
              break;
            case "music-controls-seek-to":
              if (typeof position === "number" && !Number.isNaN(position)) {
                player.currentTime = position;
                updateElapsed(position, !player.paused);
              }
              break;
            case "music-controls-next":
            case "music-controls-previous":
              console.info(`[MusicControls] ${action} received but no playlist handler is implemented.`);
              break;
            case "music-controls-destroy":
              const audio = audioRef.current;
              if (audio && !audio.paused) {
                audio.pause();
                setIsPlaying(false);
              }
              setIsVisible(false);
              removeShortIdFromUrl();
              break;
            default:
              break;
          }
        }
      );
    });

    return () => {
      cancelled = true;
      if (musicControlsCleanupRef.current) {
        musicControlsCleanupRef.current();
        musicControlsCleanupRef.current = null;
      }
    };
  }, [currentContent, duration, isMounted, isPlaying, setIsVisible, getSeriesDataForContent]);

  useEffect(() => {
    if (!isMusicControlsAvailable()) return;
    updatePlaybackState(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    if (!isMusicControlsAvailable()) return;
    updateElapsed(currentTime, isPlaying);
  }, [currentTime, isPlaying]);

  useEffect(() => {
    return () => {
      musicControlsCleanupRef.current?.();
      musicControlsCleanupRef.current = null;
      destroyMusicControls();
    };
  }, []);

  // Set up Media Session API for iOS lockscreen controls
  useEffect(() => {
    if (!currentContent || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      // Media Session API not available - this is expected on some platforms
      return;
    }

    // Detect if running in standalone/web-app mode (iOS)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true ||
                        document.referrer.includes('android-app://');

    console.log('[MediaSession] Setting up Media Session API', { isStandalone, hasMediaSession: !!navigator.mediaSession });

    let cancelled = false;

    // Fetch series title and update MediaSession metadata
    getSeriesDataForContent(currentContent.id).then(seriesData => {
      if (cancelled || !navigator.mediaSession) return;

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cleanTitle(currentContent.title) || 'Untitled',
          artist: seriesData.seriesTitle || 'Harmony', // Use series title instead of description
          album: 'HarmonyWatch', // Add album for better Android system controls display
          artwork: currentContent.thumbnail ? [
            { src: currentContent.thumbnail, sizes: '96x96', type: 'image/png' },
            { src: currentContent.thumbnail, sizes: '128x128', type: 'image/png' },
            { src: currentContent.thumbnail, sizes: '192x192', type: 'image/png' },
            { src: currentContent.thumbnail, sizes: '256x256', type: 'image/png' },
            { src: currentContent.thumbnail, sizes: '384x384', type: 'image/png' },
            { src: currentContent.thumbnail, sizes: '512x512', type: 'image/png' }
          ] : []
        });
        console.log('[MediaSession] Metadata set successfully', { seriesTitle: seriesData.seriesTitle });
        
        // Set initial position state when metadata is set (for Android system controls)
        const audio = audioRef.current;
        if (audio && audio.duration) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate || 1.0,
              position: audio.currentTime || 0,
            });
          } catch (error) {
            // setPositionState may not be supported on all platforms - silently fail
          }
        }
      } catch (error) {
        console.error('[MediaSession] Failed to set metadata:', error);
      }
    });

    // Handle media session action events (play/pause from lockscreen)
    // Note: In iOS standalone mode, these handlers may not be called when device is locked
    // This is a known limitation of iOS PWAs
    if (navigator.mediaSession) {
      try {
        navigator.mediaSession.setActionHandler('play', async () => {
        const audio = audioRef.current;
        if (!audio) {
          console.warn('[MediaSession] Audio element not available');
          return;
        }
        
        console.log('[MediaSession] Play handler called', { isStandalone, readyState: audio.readyState });
        
        try {
          // For standalone/web-app mode, ensure audio is loaded and ready
          if (isStandalone && audio.readyState < 2) {
            console.log('[MediaSession] Standalone mode: Loading audio...');
            audio.load();
            
            // Wait longer for standalone mode
            await new Promise<void>((resolve) => {
              const handleCanPlay = () => {
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('canplaythrough', handleCanPlay);
                audio.removeEventListener('loadeddata', handleCanPlay);
                console.log('[MediaSession] Audio ready in standalone mode');
                resolve();
              };
              audio.addEventListener('canplay', handleCanPlay, { once: true });
              audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
              audio.addEventListener('loadeddata', handleCanPlay, { once: true });
              // Longer timeout for standalone mode
              setTimeout(() => {
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('canplaythrough', handleCanPlay);
                audio.removeEventListener('loadeddata', handleCanPlay);
                console.warn('[MediaSession] Timeout waiting for audio in standalone mode');
                resolve();
              }, 3000);
            });
          } else if (!isStandalone && audio.readyState < 2) {
            // Regular mode handling
            if (audio.readyState === 0) {
              audio.load();
            }
            
            await new Promise<void>((resolve) => {
              const handleCanPlay = () => {
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('canplaythrough', handleCanPlay);
                resolve();
              };
              audio.addEventListener('canplay', handleCanPlay, { once: true });
              audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
              setTimeout(() => {
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('canplaythrough', handleCanPlay);
                resolve();
              }, 2000);
            });
          }
          
          // Update React state before playing
          setIsPlaying(true);
          
          // Update Media Session playback state BEFORE playing (important for standalone)
          if (navigator.mediaSession) {
            navigator.mediaSession.playbackState = 'playing';
          }
          
          // For standalone mode, ensure audio context is active
          if (isStandalone) {
            // Force audio to be "active" by setting volume (triggers user interaction context)
            const currentVolume = audio.volume;
            audio.volume = currentVolume;
          }
          
          // Attempt to play with error handling
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
          
          console.log('[MediaSession] Play successful from lock screen', { isStandalone });
        } catch (error) {
          console.error('[MediaSession] Play failed from lock screen:', error, { isStandalone });
          setIsPlaying(false);
          // Try to update Media Session playback state
          if (navigator.mediaSession) {
            navigator.mediaSession.playbackState = 'paused';
          }
        }
      });

        navigator.mediaSession.setActionHandler('pause', () => {
          const audio = audioRef.current;
          if (!audio) {
            console.warn('[MediaSession] Audio element not available');
            return;
          }
          
          console.log('[MediaSession] Pause handler called', { isStandalone });
          
          try {
            // Update React state immediately
            setIsPlaying(false);
            
            // Update Media Session playback state BEFORE pausing (important for standalone)
            if (navigator.mediaSession) {
              navigator.mediaSession.playbackState = 'paused';
            }
            
            audio.pause();
            
            console.log('[MediaSession] Pause successful from lock screen', { isStandalone });
            
            // Save progress asynchronously without blocking
            // Use setTimeout to ensure it doesn't interfere with background audio
            setTimeout(() => {
              if (audio.currentTime && audio.duration) {
                saveProgress(audio.currentTime, audio.duration).catch(err => {
                  console.error('[MediaSession] Failed to save progress:', err);
                });
              }
            }, 100);
          } catch (error) {
            console.error('[MediaSession] Pause failed from lock screen:', error, { isStandalone });
          }
        });

        // Add skip forward/backward handlers for Android system controls
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const audio = audioRef.current;
          if (audio) {
            const newTime = Math.min(audio.currentTime + (details.seekOffset || 10), audio.duration);
            audio.currentTime = newTime;
            setCurrentTime(newTime);
            
            // Update position state after seeking
            try {
              navigator.mediaSession.setPositionState({
                duration: audio.duration || 0,
                playbackRate: audio.playbackRate || 1.0,
                position: newTime,
              });
            } catch (error) {
              // setPositionState may not be supported on all platforms
            }
          }
        });

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const audio = audioRef.current;
          if (audio) {
            const newTime = Math.max(audio.currentTime - (details.seekOffset || 10), 0);
            audio.currentTime = newTime;
            setCurrentTime(newTime);
            
            // Update position state after seeking
            try {
              navigator.mediaSession.setPositionState({
                duration: audio.duration || 0,
                playbackRate: audio.playbackRate || 1.0,
                position: newTime,
              });
            } catch (error) {
              // setPositionState may not be supported on all platforms
            }
          }
        });
        
        // Add seekto handler for Android system controls (when user drags progress bar)
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          const audio = audioRef.current;
          if (audio && details.seekTime !== undefined) {
            const seekTime = Math.max(0, Math.min(details.seekTime, audio.duration || 0));
            audio.currentTime = seekTime;
            setCurrentTime(seekTime);
            
            // Update position state after seeking
            try {
              navigator.mediaSession.setPositionState({
                duration: audio.duration || 0,
                playbackRate: audio.playbackRate || 1.0,
                position: seekTime,
              });
            } catch (error) {
              // setPositionState may not be supported on all platforms
            }
          }
        });

        console.log('[MediaSession] All action handlers registered successfully', { isStandalone });
      } catch (error) {
        console.error('[MediaSession] Failed to set action handlers:', error, { isStandalone });
      }
    }

    // Cleanup
    return () => {
      cancelled = true;
      if (navigator.mediaSession) {
        navigator.mediaSession.metadata = null;
        // Clear action handlers to prevent memory leaks
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [currentContent, saveProgress, getSeriesDataForContent]);

  // Update audio source when content changes and fetch progress
  useEffect(() => {
    const audio = audioRef.current;
    const contentId = currentContent?.id;
    if (!audio || !contentId || !currentContent) return;

    // Don't load/play audio if the player is not visible
    if (!isVisible) return;

    // If player becomes visible with the same content that was previously dismissed,
    // reset the checked ID to allow reload and auto-play
    if (lastCheckedContentId.current === contentId) {
      lastCheckedContentId.current = null;
    }

    // Skip if we've already checked this content ID
    if (lastCheckedContentId.current === contentId) {
      return;
    }

    // Mark this content ID as checked
    lastCheckedContentId.current = contentId;

    // Check premium access before loading audio
    const checkAccess = async () => {
      try {
        // Use premium check API
        const response = await fetch(
          `/api/content/premium-check?contentId=${contentId}`,
          { credentials: 'include' }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (!data.canAccess) {
            // User doesn't have access - show upgrade prompt and close player
            const audio = audioRef.current;
            if (audio && !audio.paused) {
              audio.pause();
              setIsPlaying(false);
            }
            setIsVisible(false);
            removeShortIdFromUrl();
            setIsSignupModalOpen(true);
            setSignupModalInitialStep('plans');
            lastCheckedContentId.current = null; // Reset so we can check again if content changes
            return false;
          }
        }
      } catch (error) {
        console.error('Failed to check premium access:', error);
        // On error, allow playback (fail open)
      }
      return true;
    };

    // Check access first, then load audio if access granted
    checkAccess().then(hasAccess => {
      if (!hasAccess) return; // Don't load audio if no access
      
      // Cleanup previous HLS instance if it exists
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Capture content values to avoid stale closures
      const muxPlaybackId = currentContent.muxPlaybackId;
      const contentUrl = currentContent.contentUrl;
      
      // Support both Mux playback ID and legacy contentUrl
      let audioUrl: string;
      let isHls = false;
      
      if (muxPlaybackId) {
        // Mux audio: use HLS playlist
        audioUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8`;
        isHls = true;
      } else if (contentUrl) {
        // Legacy Supabase URL
        audioUrl = contentUrl;
      } else {
        return; // No audio URL available
      }

    setCurrentTime(0);
    setIsPlaying(false);
    hasLoadedProgress.current = false;
    audio.volume = volume / 100;

    // HTML5 Audio Path (all platforms: iOS, Android, Web)
    // Handle HLS streams with hls.js
    if (isHls && Hls.isSupported()) {
      console.log('[Audio Player] Using HLS.js for Mux audio playback');
      const hls = new Hls();
      hlsRef.current = hls;
      
      hls.loadSource(audioUrl);
      hls.attachMedia(audio);
      
      hls.on(Hls.Events.MANIFEST_PARSED, async () => {
        console.log('[Audio Player] HLS manifest parsed, ready to play');
        // Fetch and resume from saved progress
        const savedPosition = await fetchProgress();
        if (savedPosition && savedPosition > 0) {
          console.log('Setting audio position to:', savedPosition);
          audio.currentTime = savedPosition;
          setCurrentTime(savedPosition);
          hasLoadedProgress.current = true;
          
          // Auto-play if user has interacted with the page (clicked to play audio)
          if (hasUserInteracted) {
            setTimeout(() => {
              audio.play().catch(error => {
                console.error('Auto-play failed:', error);
              });
            }, 100);
          }
        } else {
          // No saved progress, start from beginning
          // Auto-play if user has interacted with the page (clicked to play audio)
          if (hasUserInteracted) {
            audio.play().catch(error => {
              console.error('Auto-play failed:', error);
            });
          }
        }
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('[Audio Player] HLS fatal error:', data);
          setIsLoading(false);
        }
      });
      
      // Cleanup HLS instance
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        if (audio.currentTime && audio.duration) {
          saveProgress(audio.currentTime, audio.duration);
        }
      };
    } else if (isHls && audio.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari/iOS)
      console.log('[Audio Player] Using native HLS support');
      audio.src = audioUrl;
      audio.load();
      
      const handleCanPlayiOS = async () => {
        const savedPosition = await fetchProgress();
        console.log('[iOS HLS] Ready to play. Saved position:', savedPosition);
        
        // Auto-play if user has interacted with the page (clicked to play audio)
        if (hasUserInteracted) {
          // Always start playback first on iOS
          const playPromise = audio.play().catch(error => {
            console.error('Auto-play failed:', error);
          });
          
          // If there's a saved position, seek after playback starts
          if (savedPosition && savedPosition > 0) {
            console.log('[iOS HLS] Will seek to position after playback starts:', savedPosition);
            
            let seekAttempts = 0;
            const maxSeekAttempts = 3;
            
            const attemptSeek = () => {
              seekAttempts++;
              console.log(`[iOS HLS] Seek attempt ${seekAttempts}/${maxSeekAttempts}`);
              
              audio.currentTime = savedPosition;
              setCurrentTime(savedPosition);
              hasLoadedProgress.current = true;
              
              // Check if seek worked after a delay
              setTimeout(() => {
                const actualTime = audio.currentTime;
                console.log(`[iOS HLS] Seek attempt ${seekAttempts} result: wanted ${savedPosition}, got ${actualTime}`);
                
                // If seek didn't work and we haven't exceeded attempts, try again
                if (Math.abs(actualTime - savedPosition) > 2 && seekAttempts < maxSeekAttempts) {
                  console.log('[iOS HLS] Seek failed, retrying...');
                  attemptSeek();
                }
              }, 300);
            };
            
            // Wait for play to actually start playing, then try seeking
            const handlePlaying = () => {
              console.log('[iOS HLS] Audio is playing, attempting seek');
              setTimeout(() => attemptSeek(), 200);
              audio.removeEventListener('playing', handlePlaying);
            };
            
            audio.addEventListener('playing', handlePlaying, { once: true });
            
            // Fallback timeout in case playing event doesn't fire
            setTimeout(() => {
              audio.removeEventListener('playing', handlePlaying);
            }, 3000);
          }
        } else {
          // No user interaction - don't auto-play, but still set position if saved
          if (savedPosition && savedPosition > 0) {
            audio.currentTime = savedPosition;
            setCurrentTime(savedPosition);
            hasLoadedProgress.current = true;
          }
        }
      };

      audio.addEventListener('canplay', handleCanPlayiOS, { once: true });

      return () => {
        audio.removeEventListener('canplay', handleCanPlayiOS);
        if (audio.currentTime && audio.duration) {
          saveProgress(audio.currentTime, audio.duration);
        }
      };
    } else {
      // Regular audio file (legacy Supabase)
      console.log('[Audio Player] Using regular audio playback');
      audio.src = audioUrl;
      audio.load();
      
      const handleCanPlay = async () => {
        const savedPosition = await fetchProgress();
        if (savedPosition && savedPosition > 0) {
          console.log('Setting audio position to:', savedPosition);
          audio.currentTime = savedPosition;
          setCurrentTime(savedPosition);
          hasLoadedProgress.current = true;
          
          // Auto-play if user has interacted with the page (clicked to play audio)
          if (hasUserInteracted) {
            setTimeout(() => {
              audio.play().catch(error => {
                console.error('Auto-play failed:', error);
              });
            }, 100);
          }
        } else {
          // No saved progress, start from beginning
          // Auto-play if user has interacted with the page (clicked to play audio)
          if (hasUserInteracted) {
            audio.play().catch(error => {
              console.error('Auto-play failed:', error);
            });
          }
        }
      };

      audio.addEventListener('canplay', handleCanPlay, { once: true });

      return () => {
        audio.removeEventListener('canplay', handleCanPlay);
        if (audio.currentTime && audio.duration) {
          saveProgress(audio.currentTime, audio.duration);
        }
      };
    }
    }); // Close checkAccess promise
    
    // Return cleanup function for useEffect
    return () => {
      // Reset checked content ID when effect re-runs (content changed)
      lastCheckedContentId.current = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      // Cleanup HTML5 audio
      if (audio.currentTime && audio.duration) {
        saveProgress(audio.currentTime, audio.duration);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContent?.id, hasUserInteracted, isVisible]); // Include isVisible to handle same content being selected again after dismiss

  // Reset checked content ID when player is dismissed, so same content can be reloaded and auto-played
  useEffect(() => {
    if (!isVisible) {
      lastCheckedContentId.current = null;
    }
  }, [isVisible]);

  // Close video modal completely (including PiP mode) when audio starts playing
  useEffect(() => {
    if (isVisible && currentContent && isVideoModalOpen) {
      // If video is in PiP mode or just open, close it completely
      if (isVideoModalInPipMode) {
        // Exit PiP mode first
        setIsVideoModalInPipMode(false);
      }
      // Close the video modal completely
      setIsVideoModalOpen(false);
    }
  }, [isVisible, currentContent, isVideoModalOpen, isVideoModalInPipMode, setIsVideoModalOpen, setIsVideoModalInPipMode]);

  // Stop audio completely when video modal opens
  useEffect(() => {
    if (isVideoModalOpen) {
      // Always stop audio when video opens, even if currentContent is null
      // This handles the case where audio is playing but player was dismissed
      stopAudioCompletely();
      setIsVisible(false);
    }
  }, [isVideoModalOpen, stopAudioCompletely]);

  // Expand audio player when same content is re-selected while minimized
  // contentSelectionCount increments every time setCurrentContent is called externally
  const lastSelectionCountRef = useRef<number>(0);
  
  useEffect(() => {
    if (!isMobile || !currentContent || !isVisible) return;
    
    // Skip the initial mount (first selection)
    if (lastSelectionCountRef.current === 0) {
      lastSelectionCountRef.current = contentSelectionCount;
      return;
    }
    
    // Only act if contentSelectionCount actually changed (user tapped content)
    if (contentSelectionCount !== lastSelectionCountRef.current) {
      lastSelectionCountRef.current = contentSelectionCount;
      
      // If same content re-selected and player is minimized, expand it
      if (!isExpanded) {
        setIsExpanding(true);
        setIsExpanded(true);
        setTimeout(() => setIsExpanding(false), 400);
      }
    }
  }, [contentSelectionCount, isMobile, currentContent, isVisible, isExpanded]);

  // Continuous save every 10 seconds while playing
  useEffect(() => {
    if (!isPlaying || !duration) return;

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set up periodic save
    const scheduleSave = async () => {
      saveTimeoutRef.current = setTimeout(async () => {
        // HTML5 Audio (all platforms)
        const audio = audioRef.current;
        if (audio && audio.currentTime && audio.duration) {
          saveProgress(audio.currentTime, audio.duration);
        }
        // Schedule next save
        if (isPlaying) {
          scheduleSave();
        }
      }, 10000); // Save every 10 seconds
    };

    scheduleSave();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isPlaying, duration, saveProgress]);

  const handlePlayPause = async () => {
    // Mark user interaction when play button is clicked
    if (!hasUserInteracted) {
      setHasUserInteracted(true);
    }

    // HTML5 Audio (all platforms)
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
        setIsLoading(false);
      });
    }
  };

  const handlePrevious = async () => {
    // HTML5 Audio (all platforms)
    const audio = audioRef.current;
    if (!audio) return;
    
    // Go back 10 seconds
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  };

  const handleNext = async () => {
    // HTML5 Audio (all platforms)
    const audio = audioRef.current;
    if (!audio) return;
    
    // Skip forward 10 seconds
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
  };

  const handleProgressChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);

    // HTML5 Audio (all platforms)
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = newTime;
    
    // Update Media Session position state after seeking (for Android system controls)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration || 0,
          playbackRate: audio.playbackRate || 1.0,
          position: newTime,
        });
      } catch (error) {
        // setPositionState may not be supported on all platforms
      }
    }
  };

  // Seek to a position based on touch/click X coordinate relative to a container
  const seekFromClientX = useCallback((clientX: number, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = fraction * (duration || 0);
    setCurrentTime(newTime);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = newTime;
      // Update Media Session position state
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration || 0,
            playbackRate: audio.playbackRate || 1.0,
            position: newTime,
          });
        } catch (error) {
          // setPositionState may not be supported on all platforms
        }
      }
    }
  }, [duration]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseInt(e.target.value);
    audio.volume = newVolume / 100;
    setVolume(newVolume);
  };

  // Helper function to remove short ID from URL when player closes
  const removeShortIdFromUrl = () => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      // Check if pathname looks like a short ID (7-8 character alphanumeric, not a known route)
      const isShortIdRoute = pathname !== '/' && 
        pathname.length >= 7 && 
        pathname.length <= 9 && 
        /^\/[a-z0-9]+$/i.test(pathname) &&
        !pathname.startsWith('/landing') && 
        !pathname.startsWith('/signup') && 
        !pathname.startsWith('/login') &&
        !pathname.startsWith('/video') &&
        !pathname.startsWith('/admin') &&
        !pathname.startsWith('/settings');
      
      if (isShortIdRoute) {
        // Replace URL with home page
        window.history.replaceState({}, '', '/');
      }
    }
  };

  const handleClose = () => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setIsPlaying(false);
    }
    setIsVisible(false);
    removeShortIdFromUrl();
    
    // Invalidate recently viewed cache when closing audio player
    if (user?.id) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.recentlyViewed.byUser(user.id) 
      });
    }
  };

  // Touch handlers for mobile drag-to-dismiss
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || !isVisible) return;
    // Don't start drag-to-dismiss if user is seeking on slider
    if (isSeeking) return;
    const touch = e.touches[0];
    setDragStartX(touch.clientX);
    setDragStartY(touch.clientY);
    setIsDragging(true);
    hasDraggedRef.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || dragStartX === null || dragStartY === null) return;
    // Don't process drag-to-dismiss if user is seeking on slider
    if (isSeeking) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartX;
    const deltaY = touch.clientY - dragStartY;
    
    if (isExpanded) {
      // Vertical drag for expanded mode
      if (deltaY > 10) {
        setDragY(deltaY);
        hasDraggedRef.current = true;
        e.preventDefault();
      }
    } else {
      // Horizontal drag for compact mode
      if (Math.abs(deltaX) > 10) {
        setDragX(deltaX);
        hasDraggedRef.current = true;
        e.preventDefault();
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile) return;
    // Don't process drag-to-dismiss if user was seeking on slider
    if (isSeeking) {
      // Reset drag state but don't dismiss
      setDragX(0);
      setDragY(0);
      setDragStartX(null);
      setDragStartY(null);
      setIsDragging(false);
      return;
    }
    
    if (isExpanded || isExpandedDismissing) {
      // Vertical drag - contract if threshold exceeded
      if (dragY > dragThreshold) {
        // Stop dragging first so transition can work
        setIsDragging(false);
        
        // Animate the expanded view sliding down, then switch back to compact bar
        const targetY = window.innerHeight;
        setIsExpandedDismissing(true);
        setDragY(targetY);
        
        // After animation completes, switch back to compact bar and clean up
        setTimeout(() => {
          setIsExpanded(false);
          setIsVisible(true); // Show compact bar when dismissing expanded view
          setIsExpandedDismissing(false);
          setDragY(0);
          setDragStartY(null);
        }, 400); // Match transition duration
      } else {
        // Not past threshold, just reset drag
        setDragY(0);
        setDragStartY(null);
        setIsDragging(false);
      }
    } else {
      // Horizontal drag - close if threshold exceeded
      const absDragX = Math.abs(dragX);
      if (absDragX > dragThreshold) {
        // Stop dragging first so transition can work
        setIsDragging(false);
        
        // Animate the bar off-screen in the direction it was dragged
        const targetX = dragX > 0 ? window.innerWidth : -window.innerWidth;
        setIsDismissingHorizontally(true);
        setDragX(targetX);
        
        // Stop audio completely immediately
        stopAudioCompletely();
        
        // After animation completes, hide the bar and clean up
        setTimeout(() => {
          setIsVisible(false);
          setIsDismissingHorizontally(false);
          setDragX(0);
          setDragStartX(null);
          removeShortIdFromUrl();
          
          // Invalidate recently viewed cache when dragging to dismiss audio player
          if (user?.id) {
            queryClient.invalidateQueries({ 
              queryKey: queryKeys.recentlyViewed.byUser(user.id) 
            });
          }
        }, 400); // Match transition duration
      } else {
        // Not past threshold, just reset drag
        setDragX(0);
        setDragStartX(null);
        setIsDragging(false);
      }
    }
    
    // Reset hasDragged after a delay
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 100);
  };

  // Handle tap to expand (on mobile only)
  const handleExpand = (e?: React.MouseEvent) => {
    if (!isMobile || hasDraggedRef.current) return;
    
    // Don't collapse if clicking on interactive elements (for web-app compatibility)
    if (e) {
      const target = e.target as HTMLElement;
      // Check if the click was on a button, input, or any element with stopPropagation
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('[role="button"]')
      ) {
        return; // Don't handle expand/collapse for interactive elements
      }
    }
    
    if (!isExpanded) {
      // Starting to expand - set both states simultaneously
      setIsExpanding(true);
      setIsExpanded(true);
      // Clear expanding state after animation completes
      setTimeout(() => setIsExpanding(false), 400);
    } else {
      // Contracting
      setIsExpandedDismissing(true);
      setIsExpanded(false);
      setTimeout(() => {
        setIsExpandedDismissing(false);
      }, 400); // Match transition duration (0.4s)
    }
  };

  const [hasAnimatedCompactIn, setHasAnimatedCompactIn] = useState(false);
  const [hasAnimatedExpandedIn, setHasAnimatedExpandedIn] = useState(false);
  const [isExpandedDismissing, setIsExpandedDismissing] = useState(false);
  const [isDismissingHorizontally, setIsDismissingHorizontally] = useState(false);

  // Prevent body scrolling when audio player is expanded on mobile
  // Track lock state with ref to avoid race conditions
  const scrollLockRef = useRef(false);
  
  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container');
    const shouldLock = isMobile && (isExpanded || isExpandedDismissing);
    
    if (shouldLock && !scrollLockRef.current) {
      // Lock scrolling when expanded or dismissing
      scrollLockRef.current = true;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      if (scrollContainer) {
        scrollContainer.style.overflow = 'hidden';
      }
    } else if (!shouldLock && scrollLockRef.current) {
      // Unlock scrolling immediately when collapsed (synchronously, no delay)
      scrollLockRef.current = false;
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (scrollContainer) {
        // Remove inline style to restore className overflow-y-auto
        scrollContainer.style.removeProperty('overflow');
      }
    }
    
    return () => {
      // Ensure cleanup happens immediately on unmount
      if (scrollLockRef.current) {
        scrollLockRef.current = false;
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        const container = document.getElementById('main-scroll-container');
        if (container) {
          container.style.removeProperty('overflow');
        }
      }
    };
  }, [isMobile, isExpanded, isExpandedDismissing]);

  const showCompactBar = isVisible && (!isMobile || !isExpanded) && !!currentContent;

  // Reset compact entry animation when player is hidden
  useEffect(() => {
    if (!isVisible) {
      setHasAnimatedCompactIn(false);
    }
  }, [isVisible]);

  // Trigger one-time slide-up animation when compact bar first becomes visible
  useEffect(() => {
    if (showCompactBar && isMobile && !isExpanded && !hasAnimatedCompactIn) {
      const id = window.requestAnimationFrame(() => {
        setHasAnimatedCompactIn(true);
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [showCompactBar, isMobile, isExpanded, hasAnimatedCompactIn]);

  // Reset expanded entry animation when leaving expanded state
  useEffect(() => {
    if (!isExpanded) {
      setHasAnimatedExpandedIn(false);
      setShowTextInsteadOfThumbnail(false); // Reset to thumbnail view when collapsing
    }
  }, [isExpanded]);

  // Fetch series data when content changes
  useEffect(() => {
    if (currentContent?.id) {
      getSeriesDataForContent(currentContent.id).then(data => {
        setSeriesTitle(data.seriesTitle);
        setIsDailyContent(data.isDailyContent);
        setNewCalendarDate(data.newCalendarDate);
        setOldCalendarDate(data.oldCalendarDate);
        setSeriesThumbnailUrl(data.seriesThumbnailUrl);
      });
      setShowTextInsteadOfThumbnail(false); // Reset to thumbnail view when content changes
    } else {
      setSeriesTitle(null);
      setIsDailyContent(false);
      setNewCalendarDate(null);
      setOldCalendarDate(null);
      setSeriesThumbnailUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContent?.id]); // getSeriesDataForContent is stable (useCallback with empty deps)

  // Trigger slide-up animation when expanded view first appears
  useEffect(() => {
    if (isMobile && isExpanded && !hasAnimatedExpandedIn) {
      const id = window.requestAnimationFrame(() => {
        setHasAnimatedExpandedIn(true);
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [isMobile, isExpanded, hasAnimatedExpandedIn]);

  return (
    <>
      {/* Hidden audio element (always mounted so both compact and expanded controls work) */}
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        // @ts-ignore - webkit-playsinline is needed for iOS
        webkit-playsinline="true"
        style={{ display: 'none' }}
      />

      {showCompactBar && (
        <div 
          className={`fixed left-0 right-0 z-[104] border-t border-gray-700 ${isMobile ? 'rounded-2xl overflow-hidden' : 'bg-[#1a1a1a]'} ${isExpanding ? 'animate-slideUp' : ''}`} 
      style={{ 
            width: isMobile ? '360px' : undefined,
            left: isMobile ? '50%' : undefined,
            right: isMobile ? 'auto' : undefined,
            bottom: isMobile ? '100px' : '0',
        top: isMobile ? 'auto' : undefined,
            height: isMobile ? 'auto' : undefined,
            padding: '1rem',
            transform: (() => {
              const translateX = !isExpanded && isMobile ? dragX : 0;
              const enterOffsetY =
                isMobile && !isExpanded && isVisible && !hasAnimatedCompactIn ? 80 : 0;
              // On mobile: Center the element (50% left, then translate -50% of its width)
              // Then apply drag and enter animations
              if (isMobile) {
                const transforms = [`translateX(calc(-50% + ${translateX}px))`];
                if (enterOffsetY !== 0) {
                  transforms.push(`translateY(${enterOffsetY}px)`);
                }
                return transforms.join(' ');
              }
              // Desktop: No transform needed (full width via left-0 right-0)
              return undefined;
            })(),
        transition: (() => {
          if (isDragging || isExpanding) return 'none';
          // Allow smooth animation when dismissing horizontally
          if (isDismissingHorizontally) {
            return 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
          }
              return 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        })(),
            touchAction: isMobile && isDragging ? 'pan-x' : undefined,
      }}
      onTouchStart={isMobile ? onTouchStart : undefined}
      onTouchMove={isMobile ? onTouchMove : undefined}
      onTouchEnd={isMobile ? onTouchEnd : undefined}
      onClick={isMobile ? (e) => handleExpand(e) : undefined}
      >
      {/* Blurred background for mobile (compact only) */}
      {isMobile && !isExpanded && currentContent?.thumbnail && (
        <>
          {/* Solid base background */}
          <div className="absolute inset-0 -z-20 rounded-2xl bg-[#1a1a1a]" />
          <div 
            className="absolute inset-0 -z-10 rounded-2xl overflow-hidden"
            style={{
              backgroundImage: `url(${currentContent.thumbnail})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(40px)',
              transform: 'scale(1.2)', // Scale up to prevent blur edges from showing
              overflow: 'hidden',
            }}
          >
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-black/30" />
          </div>
        </>
      )}
      {/* Fallback background when no thumbnail (compact only) */}
      {isMobile && !isExpanded && !currentContent?.thumbnail && (
        <div className="absolute inset-0 -z-10 rounded-2xl bg-[#1a1a1a]" />
      )}
      
      {/* Desktop/Compact Mobile Layout */}
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 relative w-full">
          {/* Left Side - Album Art & Content Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
              <Image
                src={currentContent?.thumbnail || "/images/content-1.png"}
                alt={currentContent?.title || "Audio Content"}
                width={56}
                height={56}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
             <div className="min-w-0 flex-1">
               <h3 className="text-white font-medium text-sm truncate">
                 {cleanTitle(currentContent?.title)}
               </h3>
               <p className="text-gray-300 text-xs truncate">
                 {seriesTitle || "Select audio content to play"}
               </p>
             </div>
          </div>

          {/* Center - Playback Controls & Progress (Desktop only) */}
          {!isMobile && (
          <div className="flex flex-col items-center gap-2 flex-1 max-w-md">
            {/* Playback Controls */}
            <div className="flex items-center gap-4">
              {/* Previous Button */}
              <button
                onClick={handlePrevious}
                disabled={!currentContent}
                className="text-gray-400 hover:text-white transition-colors p-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Image
                  src="/icons/backward.webp"
                  alt="Previous 10 seconds"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                  unoptimized
                />
              </button>

              {/* Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                disabled={!currentContent || isLoading}
                className="bg-white text-black rounded-full p-2 hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              {/* Next Button */}
              <button
                onClick={handleNext}
                disabled={!currentContent}
                className="text-gray-400 hover:text-white transition-colors p-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Image
                  src="/icons/forward.webp"
                  alt="Next 10 seconds"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                  unoptimized
                />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-2 w-full">
              <span className="text-gray-400 text-xs w-8 text-right">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1 relative">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleProgressChange}
                  disabled={!currentContent || isLoading}
                  className="w-full h-1 cursor-pointer"
                  style={{
                    '--progress': duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
                  } as React.CSSProperties & { '--progress': string }}
                />
                {/* Invisible touch overlay for larger tap target on mobile */}
                {isMobile && (
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: '-20px', height: '44px', cursor: 'pointer' }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setIsSeeking(true);
                      seekFromClientX(e.touches[0].clientX, e.currentTarget);
                    }}
                    onTouchMove={(e) => {
                      e.stopPropagation();
                      seekFromClientX(e.touches[0].clientX, e.currentTarget);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      setIsSeeking(false);
                    }}
                    onTouchCancel={() => setIsSeeking(false)}
                  />
                )}
              </div>
              <span className="text-gray-400 text-xs w-8">
                {formatTime(duration)}
              </span>
            </div>
          </div>
          )}

          {/* Right Side - Volume Control & Close */}
          <div className="flex items-center gap-3 min-w-0 flex-1 justify-end">
            {!isMobile ? (
              <>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                  <div className="w-20">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={handleVolumeChange}
                      className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider slider-expanded"
                      style={{
                        '--progress': `${volume}%`
                      } as React.CSSProperties & { '--progress': string }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white transition-colors p-1 cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              // Mobile Compact Mode - only play button
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayPause();
                }}
                disabled={!currentContent || isLoading}
                className="bg-white text-black rounded-full p-2 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Expanded mobile overlay on its own layer */}
      {isMobile && (isExpanded || isExpandedDismissing) && (
        <div
          className="fixed inset-0 z-[105] flex flex-col p-6 pb-8 overflow-hidden"
          style={{
            transform: (() => {
              // On first mount, slide the expanded view up from completely off-screen
              if (!hasAnimatedExpandedIn && dragY === 0) {
                return 'translateY(100%)';
              }
              // During drag, follow the finger vertically
              if (dragY !== 0) {
                return `translateY(${dragY}px)`;
              }
              return undefined;
            })(),
            transition: isDragging
              ? 'none'
              : 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Blurred background for expanded mobile view */}
          {currentContent?.thumbnail && (
            <>
              {/* Solid base background */}
              <div className="absolute inset-0 -z-20 bg-[#1a1a1a]" />
              <div 
                className="absolute inset-0 -z-10 overflow-hidden"
                style={{
                  backgroundImage: `url(${currentContent.thumbnail})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(40px)',
                  transform: 'scale(1.2)', // Scale up to prevent blur edges from showing
                  overflow: 'hidden',
                }}
              >
                {/* Dark overlay for readability */}
                <div className="absolute inset-0 bg-black/30" />
              </div>
            </>
          )}
          {/* Fallback background when no thumbnail */}
          {!currentContent?.thumbnail && (
            <div className="absolute inset-0 -z-10 bg-[#1a1a1a]" />
          )}
          <div className="flex flex-col h-full">
            {/* Header with back button, series title, and menu */}
            <div className="flex items-center justify-between mb-6" style={{ marginTop: '39px' }}>
              <button
                onClick={() => {
                  setIsExpandedDismissing(true);
                  setIsExpanded(false);
                  setTimeout(() => {
                    setIsExpandedDismissing(false);
                  }, 400);
                }}
                className="text-white p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {seriesTitle && (
                <p 
                  className="text-sm text-center flex-1 px-4"
                  style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 200 }}
                >
                  {seriesTitle}
                </p>
              )}
              {!seriesTitle && <div className="flex-1" />}
              <button className="text-white p-2">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </button>
            </div>

            {/* Large Album Art or Text View */}
            <div className="flex justify-center mb-6">
              <div 
                className="relative w-[85vw] h-[85vw] max-w-[400px] max-h-[400px] rounded-2xl overflow-hidden"
                style={{
                  perspective: '1000px',
                  transformStyle: 'preserve-3d',
                  backgroundColor: 'transparent',
                  boxShadow: showTextInsteadOfThumbnail 
                    ? 'none' 
                    : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  transition: showTextInsteadOfThumbnail
                    ? 'box-shadow 0s ease-in-out'
                    : 'box-shadow 0.5s ease-in-out 0.3s'
                }}
              >
                {/* Thumbnail View */}
                <div 
                  className={`absolute inset-0 flex items-center justify-center cursor-pointer hover:opacity-90 ${
                    showTextInsteadOfThumbnail ? 'opacity-0 pointer-events-none' : 'opacity-100'
                  }`}
                  style={{
                    transform: showTextInsteadOfThumbnail ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transition: showTextInsteadOfThumbnail 
                      ? 'transform 0.6s ease-in-out, opacity 0.3s ease-in-out'
                      : 'transform 0.6s ease-in-out, opacity 0.3s ease-in-out'
                  }}
                  onClick={() => setShowTextInsteadOfThumbnail(!showTextInsteadOfThumbnail)}
                >
                  <Image
                    src={currentContent?.thumbnail || "/images/content-1.png"}
                    alt={cleanTitle(currentContent?.title) || "Audio Content"}
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
                {/* Text View */}
                <div 
                  className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:opacity-90 ${
                    showTextInsteadOfThumbnail ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                  style={{
                    transform: showTextInsteadOfThumbnail ? 'rotateY(0deg) scale(1.05)' : 'rotateY(-180deg)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transition: showTextInsteadOfThumbnail
                      ? 'transform 0.7s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease-in-out'
                      : 'transform 0.6s ease-in-out, opacity 0.3s ease-in-out'
                  }}
                  onClick={() => setShowTextInsteadOfThumbnail(!showTextInsteadOfThumbnail)}
                >
                  {currentContent?.description && (
                    <p 
                      className="text-white text-sm leading-relaxed overflow-y-auto"
                      style={{
                        backgroundColor: 'transparent',
                        textShadow: 'none'
                      }}
                    >
                      {currentContent.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Song Info Container - Title + Description / Series Thumbnail */}
            <div 
              className="relative mb-4"
              style={{
                perspective: '1000px',
                transformStyle: 'preserve-3d',
                minHeight: '80px'
              }}
            >
              {/* Title + Description View */}
              <div 
                className={`flex flex-col items-start px-4 cursor-pointer hover:opacity-80 ${
                  showTextInsteadOfThumbnail ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
                style={{
                  transform: showTextInsteadOfThumbnail ? 'rotateX(180deg)' : 'rotateX(0deg) scale(1.05)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transition: showTextInsteadOfThumbnail
                    ? 'transform 0.6s ease-in-out, opacity 0.3s ease-in-out'
                    : 'transform 0.7s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease-in-out',
                  position: 'absolute',
                  inset: 0,
                  width: '100%'
                }}
                onClick={() => setShowTextInsteadOfThumbnail(!showTextInsteadOfThumbnail)}
              >
                <h3 className="text-white font-bold text-base text-left mb-0">
                  {cleanTitle(currentContent?.title)}
                </h3>
                {/* Description - first line only, truncated if too long */}
                {currentContent?.description && (
                  <p 
                    className="text-sm text-left px-0 line-clamp-1 font-extralight"
                    style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 200 }}
                  >
                    {currentContent.description.split('\n')[0].trim()}
                  </p>
                )}
                {/* Date for daily content series */}
                {isDailyContent && (calendarType === 'new' ? newCalendarDate : oldCalendarDate) && (
                  <p className="text-gray-400 text-sm text-left">
                    {formatDateForDisplay(
                      calendarType === 'new' ? newCalendarDate : oldCalendarDate,
                      'default',
                      calendarType
                    )}
                  </p>
                )}
              </div>

              {/* Series Thumbnail View */}
              <div 
                className={`flex items-center justify-start gap-3 ${
                  showTextInsteadOfThumbnail ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{
                  transform: showTextInsteadOfThumbnail ? 'rotateX(0deg) scale(1.05)' : 'rotateX(-180deg)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transition: showTextInsteadOfThumbnail
                    ? 'transform 0.7s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease-in-out'
                    : 'transform 0.6s ease-in-out, opacity 0.3s ease-in-out',
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  paddingLeft: '1rem'
                }}
              >
                {seriesThumbnailUrl ? (
                  <div 
                    className="relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                    onClick={() => setShowTextInsteadOfThumbnail(!showTextInsteadOfThumbnail)}
                  >
                    <Image
                      src={seriesThumbnailUrl}
                      alt={seriesTitle || "Series"}
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div 
                    className="relative w-14 h-14 rounded-lg overflow-hidden bg-[#1a1a1a] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                    onClick={() => setShowTextInsteadOfThumbnail(!showTextInsteadOfThumbnail)}
                  >
                    <span className="text-gray-500 text-xs text-center px-2">No Series</span>
                  </div>
                )}
                <h3 
                  className="text-white font-bold text-base text-left cursor-pointer hover:opacity-80 transition-opacity flex-1 min-w-0"
                  onClick={() => setShowTextInsteadOfThumbnail(!showTextInsteadOfThumbnail)}
                >
                  {cleanTitle(currentContent?.title)}
                </h3>
              </div>
            </div>
          </div>

          {/* Audio Controls Container - Positioned at 65vh from viewport top */}
          <div className="fixed left-0 right-0 px-6" style={{ top: '65vh' }}>
            {/* Progress Bar */}
            <div className="mb-6 px-2">
              <div className="w-full relative">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleProgressChange}
                  disabled={!currentContent || isLoading}
                  className="w-full h-1"
                  style={{
                    '--progress': duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
                  } as React.CSSProperties & { '--progress': string }}
                />
                {/* Invisible touch overlay for larger tap target on mobile */}
                <div
                  className="absolute left-0 right-0"
                  style={{ top: '-20px', height: '44px', cursor: 'pointer' }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setIsSeeking(true);
                    seekFromClientX(e.touches[0].clientX, e.currentTarget);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                    seekFromClientX(e.touches[0].clientX, e.currentTarget);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    setIsSeeking(false);
                  }}
                  onTouchCancel={() => setIsSeeking(false)}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-white text-xs">{formatTime(currentTime)}</span>
                <span className="text-white text-xs">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-6">
                {/* Previous Button */}
                <button
                  onClick={handlePrevious}
                  disabled={!currentContent}
                  className="text-white hover:text-gray-300 transition-colors p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Image
                    src="/icons/backward.webp"
                    alt="Previous 10 seconds"
                    width={32}
                    height={32}
                    className="w-8 h-8"
                    unoptimized
                  />
                </button>

                {/* Play/Pause Button - Larger */}
                <button
                  onClick={handlePlayPause}
                  disabled={(!currentContent?.contentUrl && !currentContent?.muxPlaybackId) || isLoading}
                  className="bg-white text-black rounded-full p-4 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isLoading ? (
                    <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : isPlaying ? (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                {/* Next Button */}
                <button
                  onClick={handleNext}
                  disabled={!currentContent}
                  className="text-white hover:text-gray-300 transition-colors p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Image
                    src="/icons/forward.webp"
                    alt="Next 10 seconds"
                    width={32}
                    height={32}
                    className="w-8 h-8"
                    unoptimized
                  />
                </button>
              </div>
          </div>
        </div>
      )}
    </>
  );
}
