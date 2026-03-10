"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useModal } from "../contexts/modal-context";
import { usePageCache } from "../contexts/page-cache-context";

export function SwipeNavigation({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isModalOpen, isSettingsModalOpen, isVideoModalOpen } = useModal();
  const { getCachedPage } = usePageCache();
  const isModalOpenRef = useRef(isModalOpen);
  const isSettingsModalOpenRef = useRef(isSettingsModalOpen);
  const isVideoModalOpenRef = useRef(isVideoModalOpen);
  const isAnyModalOpen = isModalOpen || isSettingsModalOpen || isVideoModalOpen;
  const [isMobile, setIsMobile] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [cachedPageHtml, setCachedPageHtml] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeProgressRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathnameHistoryRef = useRef<string[]>([]);
  
  // Keep refs in sync with state
  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
    isSettingsModalOpenRef.current = isSettingsModalOpen;
    isVideoModalOpenRef.current = isVideoModalOpen;
  }, [isModalOpen, isSettingsModalOpen, isVideoModalOpen]);
  
  // Swipe threshold - percentage of screen width
  const SWIPE_THRESHOLD = 0.3; // 30% of screen width
  const EDGE_THRESHOLD = 20; // pixels from left edge to start swipe
  const MAX_SWIPE_DISTANCE = 0.9; // max 90% of screen width

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Track pathname history for cache lookup
  useEffect(() => {
    // Always update the last entry if it's the same pathname (for back navigation)
    // Or add new pathname if different
    const lastPathname = pathnameHistoryRef.current[pathnameHistoryRef.current.length - 1];
    if (lastPathname !== pathname) {
      pathnameHistoryRef.current.push(pathname);
      // Keep only last 5 pathnames
      if (pathnameHistoryRef.current.length > 5) {
        pathnameHistoryRef.current.shift();
      }
    }
  }, [pathname]);

  // When swiping starts, get the previous pathname from history and retrieve cached page
  useEffect(() => {
    if (isSwiping && isMobile && !isAnyModalOpen && pathnameHistoryRef.current.length > 1) {
      const previousPathname = pathnameHistoryRef.current[pathnameHistoryRef.current.length - 2];
      const cached = getCachedPage(previousPathname);
      if (cached) {
        setCachedPageHtml(cached.html);
      } else {
        setCachedPageHtml(null);
      }
    } else if (!isSwiping) {
      setCachedPageHtml(null);
    }
  }, [isSwiping, isMobile, isAnyModalOpen, getCachedPage]);

  useEffect(() => {
    // Disable swipe navigation when modal is open or on homepage (no page to go back to)
    const isHomepage = pathname === '/';
    if (!isMobile || isAnyModalOpen || isHomepage) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Don't handle if modal is open or on homepage (check ref for latest value)
      if (isModalOpenRef.current || isSettingsModalOpenRef.current || isVideoModalOpenRef.current || pathname === '/') {
        e.stopPropagation();
        return;
      }
      
      // Check if touch target is within a modal element
      const target = e.target as HTMLElement;
      if (!target) return;
      
      // Check for data attribute first (most reliable)
      const modalElement = target.closest('[data-content-modal="true"]');
      if (modalElement) {
        e.stopPropagation();
        return;
      }
      
      // Check computed z-index as fallback
      let element: HTMLElement | null = target;
      while (element && element !== document.body) {
        const zIndex = window.getComputedStyle(element).zIndex;
        if (zIndex && (parseInt(zIndex) >= 99)) {
          e.stopPropagation();
          return;
        }
        element = element.parentElement;
      }

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      // Only start swipe if touch begins near the left edge
      if (startX <= EDGE_THRESHOLD) {
        touchStartX.current = startX;
        touchStartY.current = startY;
        setIsSwiping(true);
        setSwipeProgress(0);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Don't handle if modal is open or on homepage (check ref for latest value)
      if (isModalOpenRef.current || isSettingsModalOpenRef.current || isVideoModalOpenRef.current || pathname === '/') {
        // Reset if modal opened during swipe or on homepage
        if (isSwiping) {
          swipeProgressRef.current = 0;
          setSwipeProgress(0);
          setIsSwiping(false);
          touchStartX.current = null;
          touchStartY.current = null;
        }
        e.stopPropagation();
        return;
      }

      if (!isSwiping || touchStartX.current === null || touchStartY.current === null) return;

      // Check if touch target is within a modal element
      const target = e.target as HTMLElement;
      if (!target) return;
      
      // Check for data attribute first (most reliable)
      const modalElement = target.closest('[data-content-modal="true"]');
      if (modalElement) {
        // Reset if touch moved to modal
        swipeProgressRef.current = 0;
        setSwipeProgress(0);
        setIsSwiping(false);
        touchStartX.current = null;
        touchStartY.current = null;
        e.stopPropagation();
        return;
      }
      
      // Check computed z-index as fallback
      let element: HTMLElement | null = target;
      while (element && element !== document.body) {
        const zIndex = window.getComputedStyle(element).zIndex;
        if (zIndex && (parseInt(zIndex) >= 99)) {
          swipeProgressRef.current = 0;
          setSwipeProgress(0);
          setIsSwiping(false);
          touchStartX.current = null;
          touchStartY.current = null;
          e.stopPropagation();
          return;
        }
        element = element.parentElement;
      }

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = Math.abs(touch.clientY - touchStartY.current);

      // Only proceed if horizontal movement is greater than vertical (prevent conflicts with scrolling)
      if (deltaX > 0 && deltaX > deltaY) {
        e.preventDefault(); // Prevent page scroll during swipe
        const screenWidth = window.innerWidth;
        const progress = Math.min(deltaX / screenWidth, MAX_SWIPE_DISTANCE);
        swipeProgressRef.current = progress;
        setSwipeProgress(progress);
      } else if (deltaX <= 0) {
        // Reset if swiping back left
        swipeProgressRef.current = 0;
        setSwipeProgress(0);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Don't handle if modal is open or on homepage (check ref for latest value)
      if (isModalOpenRef.current || isSettingsModalOpenRef.current || isVideoModalOpenRef.current || pathname === '/') {
        if (isSwiping) {
          swipeProgressRef.current = 0;
          setSwipeProgress(0);
          setIsSwiping(false);
          touchStartX.current = null;
          touchStartY.current = null;
        }
        e.stopPropagation();
        return;
      }
      
      // Check if touch target is within a modal element
      if (e.target) {
        const target = e.target as HTMLElement;
        const modalElement = target.closest('[data-content-modal="true"]');
        if (modalElement) {
          if (isSwiping) {
            swipeProgressRef.current = 0;
            setSwipeProgress(0);
            setIsSwiping(false);
            touchStartX.current = null;
            touchStartY.current = null;
          }
          e.stopPropagation();
          return;
        }
      }

      if (!isSwiping) return;

      const finalProgress = swipeProgressRef.current;

      if (finalProgress >= SWIPE_THRESHOLD) {
        // Swipe threshold met - navigate back
        // Reset immediately before navigation to ensure transform is cleared
        swipeProgressRef.current = 0;
        setSwipeProgress(0);
        setIsSwiping(false);
        router.back();
      } else {
        // Swipe threshold not met - snap back
        swipeProgressRef.current = 0;
        setSwipeProgress(0);
        setIsSwiping(false);
      }

      touchStartX.current = null;
      touchStartY.current = null;
    };

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isMobile, isSwiping, router, pathname]); // Added pathname to deps to disable on homepage

  // Reset swipe state when pathname changes or modal opens/closes
  useEffect(() => {
    swipeProgressRef.current = 0;
    setSwipeProgress(0);
    setIsSwiping(false);
    setCachedPageHtml(null);
  }, [pathname, isAnyModalOpen]);

  return (
    <>
      {/* Previous page preview - actual cached content */}
          {isMobile && isSwiping && swipeProgress > 0 && !isAnyModalOpen && cachedPageHtml && (
        <div
          className="fixed inset-0 z-[0] overflow-hidden pointer-events-none"
          style={{
            transform: `scale(${0.96 + swipeProgress * 0.02})`,
            opacity: 0.3 + swipeProgress * 0.4, // Slightly darker to show it's behind
            transition: 'none',
            backgroundColor: '#000', // Dark background behind content
          }}
          dangerouslySetInnerHTML={{ __html: cachedPageHtml }}
        />
      )}
      {/* Fallback to visual representation if no cache */}
          {isMobile && isSwiping && swipeProgress > 0 && !isAnyModalOpen && !cachedPageHtml && (
        <div
          className="fixed inset-0 z-[0]"
          style={{
            transform: `scale(${0.96 + swipeProgress * 0.02})`,
            opacity: 0.4 + swipeProgress * 0.5,
            transition: 'none',
            pointerEvents: 'none',
          }}
        >
          {/* Previous page representation - darkened to show it's behind */}
          <div className="w-full h-full bg-black" />
          {/* Subtle shadow to create depth */}
          <div
            className="absolute inset-0"
            style={{
              boxShadow: `inset ${swipeProgress * 20}px 0 ${swipeProgress * 30}px rgba(0, 0, 0, 0.5)`,
            }}
          />
        </div>
      )}
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{
              transform: isMobile && isSwiping && !isAnyModalOpen ? `translateX(${swipeProgress * 100}%)` : 'translateX(0)',
              transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: isMobile && isSwiping ? 1 : 'auto',
              position: 'relative',
              boxShadow: isMobile && isSwiping && swipeProgress > 0 && !isAnyModalOpen
            ? `-${swipeProgress * 10}px 0 ${swipeProgress * 20}px rgba(0, 0, 0, 0.3)` 
            : 'none',
        }}
      >
        {children}
      </div>
    </>
  );
}

