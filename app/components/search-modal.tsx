"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BaseModal } from "./base-modal";
import Image from "next/image";
import type { MediaItem } from "../lib/data";
import { useModal } from "../contexts/modal-context";
import { useAudioPlayer } from "./audio-player-provider";
import { contentItemsService } from "@/lib/database";

type Props = {
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
};

export function SearchModal({ isOpen, onClose, isAnimatingClose = false }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { setVideoContentId, setIsVideoModalOpen, isVideoModalOpen, setIsVideoModalInPipMode, setSourcePosition } = useModal();
  const { setCurrentContent, setIsVisible: setAudioPlayerVisible } = useAudioPlayer();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        // Transform API results to MediaItem format
        const transformedResults: MediaItem[] = (data.results || []).map((result: any) => {
          const item: MediaItem = {
            id: String(result.id || ''),
            title: String(result.title || ''),
            subtitle: result.subtitle ? String(result.subtitle) : undefined,
            imageUrl: String(result.imageUrl || '/images/dummybg.webp'),
            content_type: result.content_type || 'video',
            rating: result.rating || undefined,
            tags: Array.isArray(result.tags) ? result.tags : undefined,
            duration: result.duration ? String(result.duration) : undefined,
            isDailyContent: result.isDailyContent || undefined,
            short_id: result.short_id ? String(result.short_id) : undefined,
          };
          return item;
        });
        setSearchResults(transformedResults);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Debounce search - wait 300ms after user stops typing
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  };

  // Handle result click - navigate to content
  // Note: Search results now only return individual episodes, not series
  const handleResultClick = useCallback(async (item: MediaItem, event?: React.MouseEvent) => {
    if (!item.content_type) {
      // No content type - skip this item
      return;
    }

    // Capture source position for animation
    if (event && event.currentTarget) {
      try {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        setSourcePosition({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        });
      } catch (err) {
        // Silently fail if element is removed
      }
    }

    if (item.content_type === 'audio') {
      // Handle audio content
      try {
        const audioContent = await contentItemsService.getById(item.id);
        if (audioContent && audioContent.content_type === 'audio') {
          // Close video modal if it's playing
          if (isVideoModalOpen) {
            setIsVideoModalInPipMode(false);
            setIsVideoModalOpen(false);
          }
          
          // Mark user interaction for autoplay
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('click'));
          }
          
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
          setAudioPlayerVisible(true);
          
          // Update URL with short_id
          if (typeof window !== 'undefined' && audioContent.short_id) {
            const currentPath = window.location.pathname;
            if (currentPath !== `/${audioContent.short_id}`) {
              window.history.pushState({}, '', `/${audioContent.short_id}`);
            }
          }
          
          // Close search modal after all state is set
          onClose();
        }
      } catch (error) {
        console.error('Error loading audio content:', error);
      }
    } else if (item.content_type === 'video') {
      // Handle video content - all search results are now individual episodes
      try {
        // Close search modal first
        onClose();
        
        // If video modal is already open, just update the contentId for smooth transition
        if (isVideoModalOpen) {
          // Just update the content ID - the video modal will detect the change and load new content
          setVideoContentId(item.id);
        } else {
          // Video modal is closed - open it with new content
          setVideoContentId(item.id);
          setIsVideoModalOpen(true);
        }
        
        // Update URL with short_id
        if (typeof window !== 'undefined' && 'short_id' in item && item.short_id) {
          const currentPath = window.location.pathname;
          if (currentPath !== `/${item.short_id}`) {
            window.history.pushState({}, '', `/${item.short_id}`);
          }
        }
      } catch (error) {
        console.error('Error loading video content:', error);
        // Fallback: try as individual content
        onClose();
        if (isVideoModalOpen) {
          setVideoContentId(item.id);
        } else {
          setVideoContentId(item.id);
          setIsVideoModalOpen(true);
        }
      }
    }
  }, [setVideoContentId, setIsVideoModalOpen, setCurrentContent, setAudioPlayerVisible, setSourcePosition, onClose, isVideoModalOpen, setIsVideoModalInPipMode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isMobile={isMobile}
      enableDragToDismiss={true}
      showDragHandle={false}
      isAnimatingClose={isAnimatingClose}
      centerOnDesktop={true}
      zIndex={105}
      backdropZIndex={104}
      maxWidth="2xl"
      fitContent={true}
      maxHeight="screen"
      overflowClassName="overflow-y-auto overflow-x-hidden"
      className="bg-[#151515]"
    >
      <div className="bg-[#151515] text-white min-h-full sm:min-h-0 sm:rounded-t-2xl sm:rounded-b-2xl flex flex-col sm:max-h-[calc(100vh-200px)]">
        {/* Fixed Header: Close button + Title + Search input */}
        <div className="flex-shrink-0">
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(!isMobile);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            className="absolute top-12 left-4 sm:top-4 sm:right-4 z-50 w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center text-lg sm:text-base"
          >
            ✕
          </button>

          {/* Search heading - centered and aligned with X button */}
          <h2 className="absolute top-14 left-1/2 -translate-x-1/2 sm:top-4 z-40 text-[16px] font-normal text-white">
            Search
          </h2>

          {/* Search input */}
          <div className="px-6 sm:px-8 mt-[90px] sm:mt-[77px]">
            <div className="relative mb-4">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Image src="/icons/search.webp" alt="Search" width={20} height={20} className="opacity-60" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={handleInputChange}
                placeholder="What do you want to watch?"
                className="w-full pl-12 pr-4 py-3 bg-black/50 rounded-lg text-white placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Scrollable Results Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 sm:px-8 pb-6 sm:pb-8">
          {isSearching && (
            <div className="text-center py-8 text-gray-400">
              Searching...
            </div>
          )}

          {!isSearching && searchQuery && searchResults.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              No results found for &quot;{searchQuery}&quot;
            </div>
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="flex gap-3 sm:gap-4 p-2 sm:p-3 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group"
                  onClick={(e) => handleResultClick(result, e)}
                >
                  {/* Thumbnail */}
                  <div className={`${result.content_type === 'audio' ? 'w-[80px] h-[80px] sm:w-[100px] sm:h-[100px]' : 'w-[120px] h-[80px] sm:w-[160px] sm:h-[100px]'} rounded overflow-hidden flex-shrink-0 relative`}>
                    <Image
                      src={result.imageUrl || '/images/dummybg.webp'}
                      alt={result.title}
                      width={result.content_type === 'audio' ? 100 : 160}
                      height={100}
                      className="w-full h-full object-cover"
                      unoptimized
                      onError={(e) => {
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
                    {/* Play button overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="text-white font-semibold text-sm sm:text-base line-clamp-1">
                      {result.title}
                    </h3>
                    {result.subtitle && (
                      <p className="text-white/70 text-xs sm:text-sm leading-relaxed line-clamp-2 mt-1">
                        {result.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Duration */}
                  {'duration' in result && result.duration && (
                    <div className="text-white/60 text-xs sm:text-sm flex-shrink-0 self-center">
                      {result.duration}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
