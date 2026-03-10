"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useModal } from "../contexts/modal-context";
import { useAudioPlayer } from "../components/audio-player-provider";
import { useUser } from "../contexts/user-context";
import { contentItemsService, seriesService } from "@/lib/database";
import type { MediaItem } from "../lib/data";
import Home from "../page";

// Dynamically import landing page for unauthenticated users
const LandingPage = dynamic(() => import("../landing/page"), { ssr: false });

export default function ShortContentPage() {
  const params = useParams();
  const shortId = params.shortId as string;
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading: userLoading } = useUser();
  const { setVideoContentId, setIsVideoModalOpen, isVideoModalOpen, videoContentId, setSelectedItem, setIsModalOpen, isModalOpen } = useModal();
  const { setCurrentContent, setIsVisible: setAudioPlayerVisible, isVisible: isAudioPlayerVisible } = useAudioPlayer();
  const [isLoading, setIsLoading] = useState(true);
  const [contentType, setContentType] = useState<'audio' | 'video' | 'series' | 'unknown' | null>(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    const loadContent = async () => {
      // Wait for user loading to finish before deciding, but don't require authentication
      if (userLoading || !shortId || hasLoaded.current) return;

      try {
        // First, try to get content by short_id
        const content = await contentItemsService.getByShortId(shortId);
        
        if (content) {
          // Handle audio content
          if (content.content_type === 'audio') {
            // Set the current content in the audio player
            setCurrentContent({
              id: content.id,
              title: content.title,
              description: content.description || '',
              duration: content.duration || '0',
              thumbnail: content.thumbnail_url || content.mux_thumbnail_url || '/images/content-1.png',
              contentUrl: content.content_url || undefined,
              muxPlaybackId: content.mux_playback_id || undefined,
              contentType: 'audio'
            });
            // Show the audio player
            setAudioPlayerVisible(true);
            setContentType('audio');
            setIsLoading(false);
            hasLoaded.current = true;
            return;
          } 
          // Handle video content
          else if (content.content_type === 'video') {
            // Only open modal if it's not already open with this content
            // This prevents closing/reopening when navigating from homepage click
            if (!isVideoModalOpen || videoContentId !== content.id) {
              setVideoContentId(content.id);
              setIsVideoModalOpen(true);
            }
            setContentType('video');
            setIsLoading(false);
            hasLoaded.current = true;
            // Don't redirect - stay on this URL so refresh works
            return;
          } else {
            // Unknown content type, try slug lookup as fallback
          }
        }
        
        // If content not found by short_id, try series slug lookup
        const series = await seriesService.getBySlug(shortId);
        
        if (series) {
          // Build MediaItem from series data
          const mediaItem: MediaItem = {
            id: series.id,
            title: series.title,
            subtitle: series.description || undefined,
            imageUrl: series.thumbnail_url || '/images/content-1.png',
            backgroundUrl: series.banner_url || undefined,
            logoUrl: series.logo_url || undefined,
            rating: series.rating || undefined,
            tags: series.tags || undefined,
            content_type: series.content_type,
            isDailyContent: Boolean(series.is_daily_content) || undefined,
            isPremium: Boolean(series.is_premium) || undefined,
            slug: series.slug || undefined,
          };
          
          // Open content modal with series
          setSelectedItem(mediaItem);
          setIsModalOpen(true);
          setContentType('series');
          setIsLoading(false);
          hasLoaded.current = true;
          return;
        }
        
        // Neither content nor series found, redirect to home
        hasLoaded.current = true;
        router.replace('/');
      } catch (error) {
        console.error('Error loading content by short ID or slug:', error);
        hasLoaded.current = true;
        router.replace('/');
      }
    };

    loadContent();
  }, [shortId, router, setVideoContentId, setIsVideoModalOpen, setCurrentContent, setAudioPlayerVisible, isVideoModalOpen, videoContentId, setSelectedItem, setIsModalOpen, user, userLoading]);

  // Track audio player visibility state for URL cleanup
  const prevAudioPlayerVisibleRef = useRef(isAudioPlayerVisible);
  
  // Track content modal visibility state for URL cleanup (series)
  const prevContentModalOpenRef = useRef(isModalOpen);
  const hasCleanedSeriesUrl = useRef(false);

  // When content modal closes (series), update URL silently
  useEffect(() => {
    // Detect transition from open → closed
    if (contentType === 'series' && prevContentModalOpenRef.current && !isModalOpen && !isLoading) {
      if (!hasCleanedSeriesUrl.current) {
        // Only update URL if it's still the slug (not already changed by another component)
        const currentPath = window.location.pathname;
        if (currentPath === `/${shortId}` || currentPath === `/${shortId}/upgrade`) {
          if (user) {
            window.history.replaceState(null, '', '/');
          } else {
            // Unauthenticated user - redirect to landing
            router.replace('/landing');
          }
        }
        hasCleanedSeriesUrl.current = true;
      }
    }
    // Reset the flag when modal opens again
    if (isModalOpen) {
      hasCleanedSeriesUrl.current = false;
    }
    prevContentModalOpenRef.current = isModalOpen;
  }, [isModalOpen, contentType, isLoading, shortId, user, router]);

  // When video modal closes, update URL silently
  // For authenticated users: go to homepage (/)
  // For unauthenticated users: go to landing (/landing)
  // IMPORTANT: Only run ONCE when modal transitions from open→closed, not on every re-render.
  // Otherwise it keeps overwriting URLs set by other components (e.g., /settings, /settings/upgrade).
  const prevVideoModalOpenRef = useRef(isVideoModalOpen);
  const hasCleanedUrl = useRef(false);
  
  useEffect(() => {
    // Detect transition from open → closed
    if (contentType === 'video' && prevVideoModalOpenRef.current && !isVideoModalOpen && !isLoading) {
      if (!hasCleanedUrl.current) {
        // Only update URL if it's still the short ID (not already changed by another component)
        const currentPath = window.location.pathname;
        if (currentPath === `/${shortId}` || currentPath === `/${shortId}/upgrade`) {
          if (user) {
            window.history.replaceState(null, '', '/');
          } else {
            // Unauthenticated user - redirect to landing
            router.replace('/landing');
          }
        }
        hasCleanedUrl.current = true;
      }
    }
    // Reset the flag when modal opens again
    if (isVideoModalOpen) {
      hasCleanedUrl.current = false;
    }
    prevVideoModalOpenRef.current = isVideoModalOpen;
  }, [isVideoModalOpen, contentType, isLoading, shortId, user, router]);

  // When audio player closes, update URL silently (similar to video)
  const hasCleanedAudioUrl = useRef(false);
  
  useEffect(() => {
    // Detect transition from visible → hidden
    if (contentType === 'audio' && prevAudioPlayerVisibleRef.current && !isAudioPlayerVisible && !isLoading) {
      if (!hasCleanedAudioUrl.current) {
        // Only update URL if it's still the short ID (not already changed by another component)
        const currentPath = window.location.pathname;
        if (currentPath === `/${shortId}` || currentPath === `/${shortId}/upgrade`) {
          if (user) {
            window.history.replaceState(null, '', '/');
          } else {
            // Unauthenticated user - redirect to landing
            router.replace('/landing');
          }
        }
        hasCleanedAudioUrl.current = true;
      }
    }
    // Reset the flag when audio player becomes visible again
    if (isAudioPlayerVisible) {
      hasCleanedAudioUrl.current = false;
    }
    prevAudioPlayerVisibleRef.current = isAudioPlayerVisible;
  }, [isAudioPlayerVisible, contentType, isLoading, shortId, user, router]);

  // Handle browser back/forward button - close video modal or audio player when URL changes away from short ID
  // Use a ref to track if we've fully loaded to prevent closing during initial navigation
  const hasFullyLoaded = useRef(false);
  
  useEffect(() => {
    if ((contentType === 'video' || contentType === 'audio' || contentType === 'series') && !isLoading && shortId) {
      hasFullyLoaded.current = true;
    }
  }, [contentType, isLoading, shortId]);

  useEffect(() => {
    if (contentType === 'video' && isVideoModalOpen && hasFullyLoaded.current && shortId) {
      const handlePopState = () => {
        // Check if current pathname is still the short ID or upgrade variant
        const currentPath = window.location.pathname;
        // If pathname changed away from short ID (e.g., back to '/'), close modal
        // Only close if we're navigating away (not to upgrade variant)
        if (currentPath !== `/${shortId}` && currentPath !== `/${shortId}/upgrade`) {
          setIsVideoModalOpen(false);
        }
      };

      // Listen for popstate events (browser back/forward button)
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [contentType, isVideoModalOpen, shortId, setIsVideoModalOpen]);

  // Handle browser back/forward button for audio content
  useEffect(() => {
    if (contentType === 'audio' && isAudioPlayerVisible && hasFullyLoaded.current && shortId) {
      const handlePopState = () => {
        // Check if current pathname is still the short ID or upgrade variant
        const currentPath = window.location.pathname;
        // If pathname changed away from short ID (e.g., back to '/'), close audio player
        // Only close if we're navigating away (not to upgrade variant)
        if (currentPath !== `/${shortId}` && currentPath !== `/${shortId}/upgrade`) {
          setAudioPlayerVisible(false);
        }
      };

      // Listen for popstate events (browser back/forward button)
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [contentType, isAudioPlayerVisible, shortId, setAudioPlayerVisible]);

  // Handle browser back/forward button for series content
  useEffect(() => {
    if (contentType === 'series' && isModalOpen && hasFullyLoaded.current && shortId) {
      const handlePopState = () => {
        // Check if current pathname is still the slug or upgrade variant
        const currentPath = window.location.pathname;
        // If pathname changed away from slug (e.g., back to '/'), close content modal
        // Only close if we're navigating away (not to upgrade variant)
        if (currentPath !== `/${shortId}` && currentPath !== `/${shortId}/upgrade`) {
          setIsModalOpen(false);
        }
      };

      // Listen for popstate events (browser back/forward button)
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [contentType, isModalOpen, shortId, setIsModalOpen]);

  // While user auth state is loading, show nothing
  if (userLoading) {
    return null;
  }

  // For audio content: authenticated users see homepage, unauthenticated redirect to landing
  if (contentType === 'audio' && !isLoading) {
    if (user) {
      return <Home />;
    } else {
      // Audio requires authentication - redirect to landing
      return <LandingPage />;
    }
  }

  // For video content: show appropriate background behind the modal overlay
  if (contentType === 'video' && !isLoading) {
    if (user) {
      return <Home />;
    } else {
      // Unauthenticated users see landing page behind the video modal
      return <LandingPage />;
    }
  }

  // For series content: show appropriate background behind the content modal
  if (contentType === 'series' && !isLoading) {
    if (user) {
      return <Home />;
    } else {
      // Unauthenticated users see landing page behind the content modal
      return <LandingPage />;
    }
  }

  // Loading state while fetching content - show nothing, modal will handle loading
  return null;
}


