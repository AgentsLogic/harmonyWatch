/**
 * @deprecated This video page is deprecated. Videos are now displayed in a modal.
 * This file is kept for backward compatibility but should not be used.
 * Use the VideoModal component instead.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import VideoPlayer from "../../components/video-player";
import VideoDetails from "../../components/video-details";
import CommentsSection from "../../components/comments-section";
import EpisodeSidebar from "../../components/episode-sidebar";
import MoreEpisodes from "../../components/more-episodes";
import { MuxVideoPlayer } from "../../components/mux-video-player";
import { useContentItems } from "../../../lib/hooks/useContentItems";
import type { ContentItem } from "../../../lib/hooks/useContentItems";
import { contentItemsService, seriesService } from "../../../lib/database";
import { fetchVideoProgress, saveVideoProgress, clearVideoProgress, isVideoCompleted } from "../../../lib/utils/video-progress";
import { useLoading } from "../../contexts/loading-context";


export default function VideoPage() {
  const params = useParams();
  const contentId = params.id as string;
  const { hideLoading, showLoading } = useLoading();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInPictureInPicture, setIsInPictureInPicture] = useState(false);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const [relatedEpisodes, setRelatedEpisodes] = useState<ContentItem[]>([]);
  const [currentSeries, setCurrentSeries] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false); // Track MuxVideoPlayer's custom fullscreen state
  const isPlayerFullscreenGuardRef = useRef(false); // Delayed guard to prevent isMobile thrashing during iOS rotation
  
  // Progress tracking state
  const [initialTime, setInitialTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  
  // Keep fullscreen guard ref in sync with state, with delayed clearing
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

  // Check if mobile and set mounted state
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
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

        if (!content.mux_playback_id) {
          hideLoading();
        }
        
        // Get all series to find which one contains this content
        const allSeries = await seriesService.getAll();
        const containingSeries = allSeries.find(s => 
          s.content_ids && s.content_ids.includes(contentId)
        );
        
        if (containingSeries) {
          setCurrentSeries(containingSeries);
          
          // Get related episodes from the same series
          if (containingSeries.content_ids && containingSeries.content_ids.length > 0) {
            const contentPromises = containingSeries.content_ids.map(id => 
              contentItemsService.getById(id)
            );
            const episodes = await Promise.all(contentPromises);
            const validEpisodes = episodes.filter((ep): ep is ContentItem => ep !== null);
            
            // Filter out the current episode
            const related = validEpisodes.filter(ep => ep.id !== contentId);
            setRelatedEpisodes(related);
          }
        }
        
      } catch (err) {
        console.error('Failed to load content:', err);
        setError("Failed to load content");
      } finally {
        setLoading(false);
      }
    };

    if (contentId) {
      loadContent();
    }
  }, [contentId]);

  // Load progress when content is loaded
  useEffect(() => {
    async function loadProgress() {
      if (currentContent?.id) {
        // This will return 0 if user not logged in (no error shown)
        const savedTime = await fetchVideoProgress(currentContent.id);
        setInitialTime(savedTime);
      }
    }
    loadProgress();
  }, [currentContent?.id]);

  // Handle time updates for progress tracking
  const handleTimeUpdate = useCallback(async (currentTime: number, duration: number) => {
    if (!currentContent?.id) return;
    
    setVideoDuration(duration);
    
    // Save progress if >5% watched (no-op if not logged in)
    await saveVideoProgress(currentContent.id, currentTime, duration);
    
    // Clear progress if video completed (>95%) (no-op if not logged in)
    if (isVideoCompleted(currentTime, duration)) {
      await clearVideoProgress(currentContent.id);
    }
  }, [currentContent?.id]);

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

  // Show loading state while data is being fetched
  if (loading || !contentId) {
    return <div className="min-h-screen bg-[#0f0f0f]" />;
  }

  if (error || !currentContent) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Content Not Found</h1>
          <p className="text-gray-400 mb-6">{error || "The requested video could not be found."}</p>
          <button 
            onClick={() => window.history.back()}
            className="bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-white/90 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Transform content data to match video page format
  const videoData = {
    id: currentContent.id,
    title: currentContent.title,
    series: currentSeries?.title || "Unknown Series",
    season: 1, // You can add season data to your content items if needed
    episode: 1, // You can add episode data to your content items if needed
    duration: currentContent.duration || "Unknown",
    currentTime: currentTime,
    rating: 5, // Default to 5 stars for now (you can map content ratings to numbers later)
    description: currentContent.description || "No description available",
    videoUrl: currentContent.mux_playback_id 
      ? `https://stream.mux.com/${currentContent.mux_playback_id}.m3u8`
      : "/dummy-videos/preview-dummy.webm", // Fallback to dummy video
    thumbnail: currentContent.mux_thumbnail_url || currentContent.thumbnail_url || "/images/content-1.png",
    muxPlaybackId: currentContent.mux_playback_id
  };

  // Transform related episodes to match episode sidebar format
  const episodesData = relatedEpisodes.slice(0, 3).map((episode, index) => ({
    id: episode.id,
    title: episode.title,
    series: currentSeries?.title || "Unknown Series",
    season: 1,
    episode: index + 1,
    duration: episode.duration || "Unknown",
    thumbnail: episode.thumbnail_url || "/images/content-1.png",
    isCurrent: false
  }));

  // Add current episode to the list
  const allEpisodes = [
    {
      id: currentContent.id,
      title: currentContent.title,
      series: currentSeries?.title || "Unknown Series",
      season: 1,
      episode: 1,
      duration: currentContent.duration || "Unknown",
      thumbnail: currentContent.thumbnail_url || "/images/content-1.png",
      isCurrent: true
    },
    ...episodesData
  ];

  // Fixed video player for mobile (rendered via portal outside ContentWrapper)
  const fixedVideoPlayer = mounted && isMobile && currentContent?.mux_playback_id ? (
    createPortal(
      <div className="fixed top-0 left-0 right-0 z-[70] bg-[#0f0f0f] w-full">
        {/* 60px black gap for iPhone status bar - positioned absolutely to ensure it's always visible */}
        {/* Hide this gap when in PiP mode to avoid black space in PiP window */}
        {!isInPictureInPicture && (
          <div 
            className="absolute top-0 left-0 right-0 bg-[#0f0f0f] z-[100]"
            style={{ height: '60px', width: '100%' }}
          />
        )}
        <div style={{ marginTop: isInPictureInPicture ? '0px' : '60px' }}>
          <MuxVideoPlayer
          playbackId={currentContent.mux_playback_id}
          title={currentContent.title}
          contentId={currentContent.id}
          initialTime={initialTime}
          videoDuration={videoDuration}
          onTimeUpdate={handleTimeUpdate}
          thumbnailUrl={currentContent.mux_thumbnail_url || currentContent.thumbnail_url}
          autoplay={true}
          onReady={hideLoading}
          onFullscreenChange={setIsPlayerFullscreen}
          onLoadingChange={(isBuffering) => {
            if (isBuffering) {
              showLoading();
            } else {
              hideLoading();
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={(error) => {
            setVideoError(error);
            console.error('Mux Player error:', error);
            hideLoading();
          }}
          onPictureInPictureChange={(isInPiP) => {
            setIsInPictureInPicture(isInPiP);
          }}
          className="w-full aspect-video"
        />
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      {fixedVideoPlayer}
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        {/* Video Player - Fixed at top on mobile, normal on desktop */}
        <div className="sm:pt-24">
          <div className="mx-auto max-w-[1700px] px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Main Content - Left Side */}
              <div className="lg:col-span-3">
                {/* Video Player */}
                <div className="w-full max-w-7xl mx-auto">
                  {currentContent.mux_playback_id ? (
                    <div className="hidden sm:block">
                      <MuxVideoPlayer
                        playbackId={currentContent.mux_playback_id}
                        title={currentContent.title}
                        contentId={currentContent.id}
                        initialTime={initialTime}
                        videoDuration={videoDuration}
                        onTimeUpdate={handleTimeUpdate}
                        thumbnailUrl={currentContent.mux_thumbnail_url || currentContent.thumbnail_url}
                        autoplay={true}
                        onReady={hideLoading}
                        onLoadingChange={(isBuffering) => {
                          if (isBuffering) {
                            showLoading();
                          } else {
                            hideLoading();
                          }
                        }}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onError={(error) => {
                          setVideoError(error);
                          console.error('Mux Player error:', error);
                          hideLoading();
                        }}
                        onFullscreenChange={setIsPlayerFullscreen}
                        className="w-full aspect-video"
                      />
                    </div>
                ) : (
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
                            // Try to fetch playback ID again
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
              )}
              </div>
              
              {/* Spacer on mobile to account for fixed video (16:9 aspect ratio) */}
              <div className="block sm:hidden" style={{ height: 'calc(100vw * 9 / 16)', minHeight: '56.25vw' }} />
              
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
              <div className="mt-8">
                <VideoDetails video={videoData} />
              </div>
              
              {/* Comments Section */}
              <CommentsSection contentId={currentContent?.id || null} />
            </div>
            
            {/* Episode Sidebar - Right Side */}
            <div className="lg:col-span-1">
              <EpisodeSidebar 
                episodes={allEpisodes}
                selectedSeason={selectedSeason}
                onSeasonChange={setSelectedSeason}
              />
              
              {/* More Episodes Section */}
              {relatedEpisodes.length > 3 && (
                <MoreEpisodes episodes={relatedEpisodes.slice(3).map((episode, index) => ({
                  id: episode.id,
                  title: episode.title,
                  series: currentSeries?.title || "Unknown Series",
                  season: 1,
                  episode: index + 4,
                  duration: episode.duration || "Unknown",
                  thumbnail: episode.thumbnail_url || "/images/content-1.png",
                  isCurrent: false,
                  muxPlaybackId: episode.mux_playback_id || undefined,
                  contentType: episode.content_type
                }))} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
