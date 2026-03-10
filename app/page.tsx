"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { HeroCarousel } from "./components/hero-carousel";
import { RowShelf } from "./components/row-shelf";
import type { MediaItem } from "./lib/data";
import { useCategories } from "@/lib/hooks/useCategories";
import { useRecentlyViewed } from "@/lib/hooks/useRecentlyViewed";
import { useCarouselItems } from "@/lib/hooks/useCarouselItems";
import { useModal } from "./contexts/modal-context";
import { useUser, type User } from "./contexts/user-context";
import { usePathname } from "next/navigation";
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useAudioPlayer } from "./components/audio-player-provider";
import { contentItemsService } from "@/lib/database";
import { useCalendarPreference } from "@/lib/hooks/useCalendarPreference";
import { CarouselSkeleton, RowShelfSkeleton } from "./components/skeleton";

export default function Home() {
  // Test change - added on 2025-10-17 for git workflow testing
  const { isModalOpen, setIsModalOpen, setSelectedItem, setSourcePosition, setVideoContentId, setIsVideoModalOpen, setIsLoginModalOpen, setLoginModalInitialStep } = useModal();
  const { setCurrentContent, setIsVisible: setAudioPlayerVisible } = useAudioPlayer();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const { categories, loading, error } = useCategories();
  // Check if we're on initial load with no data
  const isCategoriesLoading = loading && categories.length === 0;
  const { user, isLoading: userLoading, hasPlan } = useUser();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  // Only fetch recently viewed for users who have completed signup (not pending) AND have a valid account type
  // Also check if user should be redirected - if so, don't fetch (prevents API calls during redirect)
  const shouldFetchRecentlyViewed = user?.signup_status === 'complete' && 
                                     (user?.user_type === 'free' || user?.user_type === 'subscriber' || user?.user_type === 'admin') &&
                                     !userLoading; // Don't fetch while user data is still loading
  
  const { items: recentlyViewedItems, loading: recentlyViewedLoading } = useRecentlyViewed(shouldFetchRecentlyViewed ? (user?.id || null) : null);
  const { calendarType, isLoading: calendarPreferenceLoading } = useCalendarPreference();
  const router = useRouter();
  
  // Check for password reset hash and open login modal
  useEffect(() => {
    if (typeof window !== 'undefined' && pathname === '/') {
      const hash = window.location.hash;
      // Check if hash contains password recovery tokens or password-reset marker
      if (hash && (hash.includes('access_token') || hash.includes('type=recovery') || hash.includes('password-reset'))) {
        // Open login modal - it will detect PASSWORD_RECOVERY event and show reset form
        setIsLoginModalOpen(true);
        setLoginModalInitialStep('reset-password');
        // Clean up the hash from URL
        window.history.replaceState(null, '', '/');
      }
    }
  }, [pathname, setIsLoginModalOpen, setLoginModalInitialStep]);
  
  // Invalidate recently viewed cache when navigating to home page (browser back button, etc.)
  useEffect(() => {
    if (pathname === '/' && user?.id) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.recentlyViewed.byUser(user.id) 
      });
    }
  }, [pathname, user?.id, queryClient]);


  // Determine if carousel should be fetched
  const shouldFetchCarousel = !calendarPreferenceLoading && 
                               !userLoading && 
                               !!user && 
                               user.signup_status !== 'pending' && 
                               hasPlan;

  // Fetch carousel items using React Query
  // Use isFetching instead of isLoading to avoid showing spinner when cached data exists
  const { data: carouselItems = [], isFetching: carouselFetching, isLoading: carouselLoading } = useCarouselItems(
    calendarType,
    shouldFetchCarousel
  );
  
  // Show loading skeleton if we have no carousel items and either:
  // 1. Query is currently loading, OR
  // 2. We're waiting for conditions to be met (user/calendar loading, no user, no plan)
  const showCarouselLoading = carouselItems.length === 0 && (
    carouselLoading || 
    !shouldFetchCarousel
  );


  // Debug logging
  useEffect(() => {
    console.log('[Home] User:', user?.id, 'Loading:', recentlyViewedLoading, 'Items:', recentlyViewedItems.length);
  }, [user?.id, recentlyViewedLoading, recentlyViewedItems.length]);

  // Client-side protection: redirect to landing if user is not logged in, doesn't have a plan, or is pending
  // Unauthenticated users should never see the homepage
  // Authenticated users without a plan should also be redirected
  // Pending users (signup_status === 'pending') should never see the homepage, even if they have user_type === 'free'
  // Admins have full access to all pages without subscription
  // Use user data immediately if available (don't wait for userLoading to complete)
  const hasRedirectedRef = useRef(false);
  const prevUserRef = useRef<User | null | undefined>(undefined);
  
  useEffect(() => {
    // Track previous user state to detect logout transition
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;
    
    // Prevent multiple redirects
    if (hasRedirectedRef.current) {
      return;
    }
    
    // Check if we're on homepage or settings route (settings modal can be open from homepage)
    const isHomePageOrSettings = pathname === '/' || pathname === '/settings' || pathname.startsWith('/settings/');
    
    // If user data is already available, check immediately
    // Otherwise wait for loading to complete
    if (user !== null || !userLoading) {
      if (!user) {
        // User is not logged in - redirect to landing page
        // Only redirect if we're on homepage or settings route (came from homepage)
        if (isHomePageOrSettings) {
          hasRedirectedRef.current = true;
          // Always use window.location.href for hard redirect (more reliable than router.push)
          window.location.href = "/landing";
        }
        return;
      }
      
      // Admins have full access - never redirect admins
      if (user.user_type === 'admin') {
        // Admins have full access - no redirect needed
        return;
      }
      
      // Check if user is pending (signup_status === 'pending')
      // Pending users should never see the homepage, even if they have user_type === 'free'
      if (user.signup_status === 'pending') {
        // User is pending - redirect to landing page
        // Only redirect if we're on homepage or settings route (came from homepage)
        if (isHomePageOrSettings) {
          hasRedirectedRef.current = true;
          // Always use window.location.href for hard redirect (more reliable than router.push)
          window.location.href = "/landing";
        }
        return;
      }
      
      // Check if user has a plan (includes hasPlan check which already includes admin check)
      // But we already checked admin above, so this is for non-admins
      if (!hasPlan) {
        // User is logged in but doesn't have a plan - redirect to landing page
        // Only redirect if we're on homepage or settings route (came from homepage)
        if (isHomePageOrSettings) {
          hasRedirectedRef.current = true;
          // Always use window.location.href for hard redirect (more reliable than router.push)
          window.location.href = "/landing";
        }
      }
    }
  }, [user, userLoading, hasPlan, router, pathname]);

  // Enable audio on first user interaction
  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true);
      // Create a silent audio context to enable audio
      const audio = new Audio();
      audio.volume = 0;
      audio.play().catch(() => {});
    }
  };

  const handleCardClick = (item: MediaItem, event?: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    setSelectedItem(item);
    setIsModalOpen(true);
    
    // Push slug URL if available
    if (item.slug && typeof window !== 'undefined') {
      window.history.pushState({}, '', `/${item.slug}`);
    }
    
    // Get the source card position for animation
    if (event) {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      setSourcePosition({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      });
    }
  };

  // Handler for recently viewed items - routes directly to audio player or video page
  const handleRecentlyViewedClick = async (item: MediaItem, event?: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!item.content_type) {
      // Fallback to modal if content type is unknown
      handleCardClick(item, event);
      return;
    }

    if (item.content_type === 'audio') {
      // Mark user interaction for autoplay (trigger click event for existing listener)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('click'));
      }
      
      // Fetch full content details for audio player
      try {
        const contentItem = await contentItemsService.getById(item.id);
        if (!contentItem) {
          console.error('Content item not found:', item.id);
          return;
        }

        // Set content in audio player
        setCurrentContent({
          id: contentItem.id,
          title: contentItem.title,
          description: contentItem.description || '',
          duration: contentItem.duration || '0',
          thumbnail: contentItem.thumbnail_url || contentItem.mux_thumbnail_url || item.imageUrl,
          contentUrl: contentItem.content_url || undefined,
          muxPlaybackId: contentItem.mux_playback_id || undefined,
          contentType: 'audio'
        });
        
        // Show audio player
        setAudioPlayerVisible(true);
        
        // Update URL with short_id without navigating (for sharing/bookmarking)
        if (typeof window !== 'undefined') {
          if (contentItem.short_id) {
            const currentPath = window.location.pathname;
            if (currentPath !== `/${contentItem.short_id}`) {
              // Use pushState to update URL without triggering navigation
              window.history.pushState({}, '', `/${contentItem.short_id}`);
            }
          } else {
            // Log warning if short_id is missing (should be auto-generated on creation)
            console.warn('[HomePage] Audio content missing short_id:', contentItem.id, contentItem.title);
          }
        }
      } catch (error) {
        console.error('Failed to load audio content:', error);
      }
    } else if (item.content_type === 'video') {
      // Open video modal directly
      setVideoContentId(item.id);
      setIsVideoModalOpen(true);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
        <div className="text-center max-w-md p-8 bg-red-900/20 border border-red-600/50 rounded-lg">
          <p className="text-red-200 mb-4">❌ Error loading content</p>
          <p className="text-red-300 text-sm">{error}</p>
          <p className="text-gray-400 text-sm mt-4">
            Make sure the database has been set up. Visit{' '}
            <a href="/seed" className="text-blue-400 hover:underline">/seed</a> to initialize the database.
          </p>
        </div>
      </div>
    );
  }

  // Transform categories data to match MediaItem format for RowShelf
  const transformedCategories = categories.map(cat => ({
    id: cat.id,
    title: cat.title,
    items: cat.items.map(item => ({
      id: item.id,
      title: item.title,
      subtitle: item.description || undefined,
      imageUrl: item.thumbnail,
      backgroundUrl: item.banner_url || undefined,
      logoUrl: item.logo_url,
      seasonEpisode: item.badge || undefined,
      rating: item.rating,
      tags: item.tags,
      content_type: item.content_type,
      slug: (item as any).slug || undefined // Include slug from series data
    } as MediaItem))
  }));

  return (
    <div 
      className="min-h-screen bg-[#0f0f0f] text-white overscroll-contain overflow-visible px-0"
      onClick={handleUserInteraction}
      onKeyDown={handleUserInteraction}
    >
      {/* Full-bleed hero */}
      {carouselItems.length > 0 ? (
        <HeroCarousel items={carouselItems} onInfo={(item, e) => handleCardClick(item, e)} />
      ) : showCarouselLoading ? (
        <CarouselSkeleton />
      ) : null}
      
      {/* Constrained shelves */}
      <main className="relative z-[1] -mt-20 sm:-mt-28 mx-auto max-w-[1700px] px-4 sm:px-6 pb-16 overflow-visible">
        {/* Recently Viewed Section - Show immediately if items exist (uses cached data via placeholderData), or show skeleton while loading */}
        {/* Show Continue skeleton when categories are loading for synchronized appearance */}
        {isCategoriesLoading && user ? (
          <RowShelfSkeleton cardCount={6} />
        ) : user && shouldFetchRecentlyViewed ? (
          recentlyViewedItems && Array.isArray(recentlyViewedItems) && recentlyViewedItems.length > 0 ? (
            <RowShelf
              title="Continue"
              items={recentlyViewedItems}
              onCardClick={handleRecentlyViewedClick}
            />
          ) : recentlyViewedLoading ? (
            <RowShelfSkeleton cardCount={6} />
          ) : null
        ) : null}
        
        {isCategoriesLoading ? (
          <div className="space-y-8">
            {[...Array(3)].map((_, i) => (
              <RowShelfSkeleton key={i} cardCount={10} />
            ))}
          </div>
        ) : transformedCategories.length > 0 ? (
          transformedCategories.map((c, idx) => (
            <RowShelf
              key={c.id}
              title={c.title}
              items={c.items}
              className={idx === 0 ? "" : ""}
              onCardClick={handleCardClick}
            />
          ))
        ) : null}
      </main>
    </div>
  );
}
