"use client";

import { useEffect } from "react";

/**
 * Component to lock scroll position and prevent overscroll bounce
 * Prevents the scroll container from scrolling beyond bounds
 */
export function ScrollLock() {
  useEffect(() => {
    // Get the main scroll container
    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer) return;
    
    // Lock scroll position to prevent overscroll (only prevent negative values)
    const lockScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      
      // If scroll position goes negative (overscroll above top), lock it to 0
      if (scrollTop < 0) {
        scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      
      // Prevent overscroll beyond content
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      if (scrollTop > maxScroll) {
        scrollContainer.scrollTo({ top: maxScroll, behavior: 'auto' });
      }
    };
    
    // Track touch start position
    let touchStartY = 0;
    
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
      }
    };
    
    // Prevent pull-down gesture when at top
    const handleTouchMove = (e: TouchEvent) => {
      const scrollTop = scrollContainer.scrollTop;
      
      // If we're at the top and user is pulling down, prevent it
      if (scrollTop === 0 && e.touches.length > 0) {
        const touch = e.touches[0];
        const currentY = touch.clientY;
        
        // If touch is moving down (pulling down gesture), prevent default
        if (currentY > touchStartY) {
          e.preventDefault();
        }
      }
    };
    
    // Lock on scroll container scroll
    scrollContainer.addEventListener('scroll', lockScroll, { passive: false });
    
    // Track touch start and prevent pull-down on the container
    scrollContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // Also lock on initial load
    lockScroll();
    
    return () => {
      scrollContainer.removeEventListener('scroll', lockScroll);
      scrollContainer.removeEventListener('touchstart', handleTouchStart);
      scrollContainer.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return null;
}

