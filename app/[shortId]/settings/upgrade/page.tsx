"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "../../../contexts/user-context";
import { useModal } from "../../../contexts/modal-context";
import { useAudioPlayer } from "../../../components/audio-player-provider";
import { contentItemsService, seriesService } from "@/lib/database";
import type { MediaItem } from "../../../lib/data";
import Home from "../../../page";

export default function ShortIdSettingsUpgradePage() {
  const params = useParams();
  const shortId = params.shortId as string;
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { setIsSettingsModalOpen, setIsSignupModalOpen, setSignupModalInitialStep, setVideoContentId, setIsVideoModalOpen, isVideoModalOpen, videoContentId, setSelectedItem, setIsModalOpen } = useModal();
  const { setCurrentContent, setIsVisible: setAudioPlayerVisible } = useAudioPlayer();
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
          // Handle video content - open video modal if not already open with this content
          if (content.content_type === 'video') {
            if (!isVideoModalOpen || videoContentId !== content.id) {
              setVideoContentId(content.id);
              setIsVideoModalOpen(true);
            }
            setContentType('video');
            setIsLoading(false);
            hasLoaded.current = true;
            return;
          } else if (content.content_type === 'audio') {
            // Handle audio content - set content in audio player
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
  }, [shortId, router, setVideoContentId, setIsVideoModalOpen, setCurrentContent, setAudioPlayerVisible, isVideoModalOpen, videoContentId, setSelectedItem, setIsModalOpen, userLoading]);

  useEffect(() => {
    if (!userLoading) {
      if (user) {
        // Store origin pathname for URL return logic
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          // Store the settings path (e.g., /01cj7ix/settings) as origin
          const settingsPath = currentPath.replace('/upgrade', '');
          sessionStorage.setItem('settings_upgrade_origin', settingsPath);
        }
        // Open both settings and signup modals
        setIsSettingsModalOpen(true);
        setSignupModalInitialStep('plans');
        setIsSignupModalOpen(true);
      } else {
        router.push("/landing");
      }
    }
  }, [user, userLoading, router, setIsSettingsModalOpen, setIsSignupModalOpen, setSignupModalInitialStep]);

  // While user auth state is loading, show nothing
  if (userLoading) {
    return null;
  }

  // For video, audio, or series content: show appropriate background behind the modals
  if ((contentType === 'video' || contentType === 'audio' || contentType === 'series') && !isLoading && user) {
    return <Home />;
  }

  // Loading state or not authenticated
  return null;
}
