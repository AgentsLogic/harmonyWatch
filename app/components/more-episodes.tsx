"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { formatDateForDisplay } from "../../lib/utils/date-helpers";
import MuxVideo from '@mux/mux-video-react';
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";

interface Episode {
  id: string | number;
  title: string;
  series: string;
  season: number;
  episode: number;
  duration: string;
  thumbnail: string;
  isCurrent?: boolean;
  isToday?: boolean;
  calendarDate?: string; // new_calendar_date for daily content
  muxPlaybackId?: string; // Mux playback ID for video preview
  contentType?: 'video' | 'audio'; // Content type
  isFreeEpisode?: boolean; // Whether this episode is free (overrides series premium status)
  seriesIsPremium?: boolean; // Whether the episode's series is premium
}

interface MoreEpisodesProps {
  episodes: Episode[];
  calendarType?: 'new' | 'old';
}

export default function MoreEpisodes({ episodes, calendarType }: MoreEpisodesProps) {
  const [hoveredEpisode, setHoveredEpisode] = useState<string | number | null>(null);
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(null);
  const [showingVideo, setShowingVideo] = useState<string | number | null>(null); // Track which video is showing (includes fade-out delay)
  const [videoReady, setVideoReady] = useState<Map<string | number, boolean>>(new Map()); // Track when video is ready
  const previewVideoRefs = useRef<Map<string | number, HTMLDivElement>>(new Map());
  const videoTimeUpdateHandlers = useRef<Map<string | number, (e: Event) => void>>(new Map());
  const videoStartTimes = useRef<Map<string | number, number>>(new Map()); // Store start time (20%) for each episode
  const fadeOutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { user, hasActiveSubscription } = useUser();
  const { setVideoContentId, setIsVideoModalOpen } = useModal();
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Function to clean title by removing series/episode number (e.g., "Title | S1 E1" -> "Title")
  const cleanTitle = (title: string): string => {
    // Remove pattern like " | S1 E1", " | S1E1", "|S1 E1", or similar variations
    // Handles cases with or without spaces around the pipe and between S/E
    // Matches: " | S1 E1", "|S1E1", " | S1E1", "| S1 E1", etc.
    return title.replace(/\s*\|\s*S\d+\s*E\d+.*$/i, '').trim();
  };

  const handleEpisodeClick = (episode: Episode) => {
    // Only open video modal for video content
    if (episode.contentType === 'video') {
      setVideoContentId(episode.id.toString());
      setIsVideoModalOpen(true);
    }
    // For audio content, you might want to handle it differently
    // (e.g., open audio player instead of video modal)
  };

  // Handle video preview on hover
  const handleEpisodeHover = useCallback((episode: Episode) => {
    // Disable hover preview on mobile
    if (isMobile) return;
    
    const previousHovered = hoveredEpisode;
    
    // If hovering a different episode, clean up the previous one
    if (previousHovered !== null && previousHovered !== episode.id) {
      // Clear video ready for previous episode
      setVideoReady(prev => {
        const newMap = new Map(prev);
        newMap.delete(previousHovered);
        return newMap;
      });
      setShowingVideo(null);
    }
    
    // Clear any pending fade-out timeout when hovering a new episode
    if (fadeOutTimeoutRef.current) {
      clearTimeout(fadeOutTimeoutRef.current);
      fadeOutTimeoutRef.current = null;
    }
    
    setHoveredEpisode(episode.id);
    
    // Only show preview for video content with playback ID
    if (episode.contentType === 'video' && episode.muxPlaybackId) {
      setPreviewPlaybackId(episode.muxPlaybackId);
      setShowingVideo(episode.id); // Show video container immediately
    } else {
      setPreviewPlaybackId(null);
      setShowingVideo(null);
    }
  }, [hoveredEpisode, isMobile]);

  const handleEpisodeLeave = useCallback(() => {
    // Clear any pending fade-out timeout
    if (fadeOutTimeoutRef.current) {
      clearTimeout(fadeOutTimeoutRef.current);
      fadeOutTimeoutRef.current = null;
    }
    
    const currentHovered = hoveredEpisode;
    
    // Start fade out by clearing video ready state (this triggers opacity transition)
    setVideoReady(prev => {
      const newMap = new Map(prev);
      if (currentHovered !== null) {
        newMap.delete(currentHovered);
      }
      return newMap;
    });
    
    // Clear hover state immediately (stops new interactions)
    setHoveredEpisode(null);
    setPreviewPlaybackId(null);
    
    // Wait for fade transition to complete before unmounting video
    fadeOutTimeoutRef.current = setTimeout(() => {
      if (currentHovered !== null) {
        setShowingVideo(null);
        setVideoReady(prev => {
          const newMap = new Map(prev);
          newMap.delete(currentHovered);
          return newMap;
        });
      }
      fadeOutTimeoutRef.current = null;
    }, 500); // Match transition duration
  }, [hoveredEpisode]);

  // Setup video preview: start at 20% and loop 15 seconds
  useEffect(() => {
    if (!hoveredEpisode || !previewPlaybackId) {
      // Cleanup when no preview
      videoTimeUpdateHandlers.current.forEach((handler, episodeId) => {
        const container = previewVideoRefs.current.get(episodeId);
        if (container) {
          const muxVideoElement = container.querySelector('mux-video') as any;
          const video = muxVideoElement?.querySelector('video') || container.querySelector('video') as HTMLVideoElement;
          if (video && handler) {
            video.removeEventListener('timeupdate', handler);
          }
        }
      });
      videoTimeUpdateHandlers.current.clear();
      videoStartTimes.current.clear();
      return;
    }

    const container = previewVideoRefs.current.get(hoveredEpisode);
    if (!container) return;

    let retryCount = 0;
    const maxRetries = 50;

    const findAndSetupVideo = () => {
      const muxVideoElement = container.querySelector('mux-video') as any;
      const video = muxVideoElement?.querySelector('video') || container.querySelector('video') as HTMLVideoElement;
      
      if (video) {
        // Always mute the preview video
        video.muted = true;
        video.preload = 'auto';

        // Wait for metadata to get duration
        let metadataRetryCount = 0;
        const setupStartTime = () => {
          if (video.duration && !isNaN(video.duration) && video.duration > 0 && isFinite(video.duration)) {
            // Calculate 20% of duration
            const startTime = Math.max(0, video.duration * 0.2);
            // Ensure we don't go past the video duration
            const loopEndTime = Math.min(video.duration, startTime + 15);
            
            // Store start time for this episode
            videoStartTimes.current.set(hoveredEpisode, startTime);
            
            // Set initial position to 20%
            video.currentTime = startTime;
            
            // Wait for video to be ready before showing it
            const canPlayHandler = () => {
              setVideoReady(prev => {
                const newMap = new Map(prev);
                newMap.set(hoveredEpisode, true);
                return newMap;
              });
              video.removeEventListener('canplay', canPlayHandler);
            };
            video.addEventListener('canplay', canPlayHandler);
            
            // Try to play
            video.play().catch((err: unknown) => {
              console.log('[MoreEpisodes Preview] Autoplay attempt:', err);
            });

            // Create time update handler to loop the 15-second segment
            const timeUpdateHandler = (e: Event) => {
              const v = e.target as HTMLVideoElement;
              const storedStartTime = videoStartTimes.current.get(hoveredEpisode);
              
              if (storedStartTime !== undefined && v.duration > 0) {
                const loopEndTime = Math.min(v.duration, storedStartTime + 15);
                
                // If we've reached the end of the 15-second segment, loop back to start
                if (v.currentTime >= loopEndTime || v.currentTime < storedStartTime) {
                  v.currentTime = storedStartTime;
                }
              }
            };

            // Store handler for cleanup
            videoTimeUpdateHandlers.current.set(hoveredEpisode, timeUpdateHandler);
            video.addEventListener('timeupdate', timeUpdateHandler);
          } else {
            // Duration not ready yet, wait a bit and retry
            if (metadataRetryCount < maxRetries) {
              metadataRetryCount++;
              setTimeout(setupStartTime, 100);
            } else {
              console.warn('[MoreEpisodes Preview] Could not get video duration after max retries');
            }
          }
        };

        // Try to setup immediately if metadata is ready
        if (video.readyState >= 1) { // HAVE_METADATA
          setupStartTime();
        } else {
          // Wait for loadedmetadata event
          const metadataHandler = () => {
            setupStartTime();
            video.removeEventListener('loadedmetadata', metadataHandler);
          };
          video.addEventListener('loadedmetadata', metadataHandler);
        }
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(findAndSetupVideo, 100);
      }
    };

    findAndSetupVideo();

    // Cleanup on unmount or when hover changes
    return () => {
      const handler = videoTimeUpdateHandlers.current.get(hoveredEpisode);
      if (handler && container) {
        const muxVideoElement = container.querySelector('mux-video') as any;
        const video = muxVideoElement?.querySelector('video') || container.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.removeEventListener('timeupdate', handler);
        }
      }
      videoTimeUpdateHandlers.current.delete(hoveredEpisode);
      // Clear video ready state
      setVideoReady(prev => {
        const newMap = new Map(prev);
        newMap.delete(hoveredEpisode);
        return newMap;
      });
    };
  }, [hoveredEpisode, previewPlaybackId]);

  return (
    <div className="mt-0 px-0">
      {/* Episodes List */}
      <div className="space-y-4">
        {episodes.map((episode) => (
          <div
            key={episode.id}
            className="relative cursor-pointer transition-all duration-200"
            onClick={() => handleEpisodeClick(episode)}
            onMouseEnter={() => !isMobile && handleEpisodeHover(episode)}
            onMouseLeave={handleEpisodeLeave}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden mb-2">
              <Image
                src={episode.thumbnail}
                alt={episode.title}
                fill
                className="object-cover"
                unoptimized
                onError={(e) => {
                  // Fallback to a default thumbnail if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.innerHTML = `
                    <div class="w-full h-full bg-gray-700 flex items-center justify-center">
                      <svg class="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  `;
                  }
                }}
              />
              
              {/* Video Preview - overlays thumbnail when hovering over video content */}
              {showingVideo === episode.id && previewPlaybackId && episode.contentType === 'video' ? (
                <div 
                  ref={(el) => {
                    if (el) {
                      previewVideoRefs.current.set(episode.id, el);
                    } else {
                      previewVideoRefs.current.delete(episode.id);
                    }
                  }}
                  className="absolute inset-0 w-full h-full z-30 pointer-events-none"
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 30
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
                      opacity: videoReady.get(episode.id) ? 1 : 0,
                      transition: 'opacity 0.5s ease-in-out'
                    }}
                    autoPlay="any"
                    muted={true}
                    playsInline
                    crossOrigin="anonymous"
                    preload="auto"
                    streamType="on-demand"
                  />
                </div>
              ) : null}
              
              {/* Lock icon / Preview badge for premium episodes - upper left corner */}
              {(() => {
                const isEpisodePremium = episode.seriesIsPremium && !episode.isFreeEpisode;
                const shouldShow = isEpisodePremium && (!user || (!hasActiveSubscription && user.user_type !== 'admin'));
                const isHovered = hoveredEpisode === episode.id;
                
                return shouldShow ? (
                  <div className="absolute top-2 left-2 z-30">
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
              
              {/* Duration Badge */}
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded z-10">
                {episode.duration}
              </div>
            </div>

            {/* Episode Info */}
            <div>
              {episode.calendarDate && (
                <p className="text-gray-400 text-xs mb-1">
                  {formatDateForDisplay(episode.calendarDate, 'default', calendarType)}
                </p>
              )}
              <h3 className="font-medium text-white mb-1">
                {cleanTitle(episode.title)}
              </h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
