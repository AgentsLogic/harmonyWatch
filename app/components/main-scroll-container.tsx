"use client";

import { useEffect, useRef, ReactNode } from "react";

/**
 * Main scroll container that wraps page content
 * Syncs container scroll to window.scrollY for backward compatibility
 * This allows components using window.scrollY to continue working
 */
export function MainScrollContainer({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Detect Android immediately (don't wait for useEffect)
  const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent || '');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Sync container scroll to window.scrollY for backward compatibility
    // This allows TopBanner, HeroCarousel, etc. to continue using window.scrollY
    const handleScroll = () => {
      // Update window.scrollY to match container scroll
      // We can't directly set window.scrollY, but we can create a proxy
      const scrollTop = container.scrollTop;
      
      // Create a proxy for window.scrollY
      try {
        Object.defineProperty(window, 'scrollY', {
          get: () => scrollTop,
          configurable: true,
          enumerable: true,
        });
        // Also update pageYOffset for compatibility
        Object.defineProperty(window, 'pageYOffset', {
          get: () => scrollTop,
          configurable: true,
          enumerable: true,
        });
      } catch (e) {
        // If we can't override, dispatch custom event as fallback
        window.dispatchEvent(new CustomEvent('scrollsync', { detail: { scrollY: scrollTop } }));
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial sync

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="main-scroll-container"
      className={`fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-contain ${isAndroid ? 'no-scrollbar' : ''}`}
      style={{
        paddingTop: 0,
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
        scrollbarGutter: isAndroid ? 'auto' : 'stable',
        // Hide scrollbar immediately on Android (no flash)
        ...(isAndroid ? {
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } : {}),
        // Allow bounce scroll
        overscrollBehavior: 'auto',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

