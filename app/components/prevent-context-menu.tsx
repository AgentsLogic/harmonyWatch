"use client";

import { useEffect } from "react";

/**
 * Component to prevent context menu (long press) on mobile devices
 * This disables the copy/paste menu that appears when holding down on text/images
 */
export function PreventContextMenu() {
  useEffect(() => {
    // Check if device is mobile (screen width < 640px, same as Tailwind's sm breakpoint)
    const checkMobile = () => window.innerWidth < 640;
    
    // Check if it's actually a mobile device (not just a touch-enabled desktop)
    const isMobileDevice = checkMobile();
    
    // Only prevent on mobile devices
    if (!isMobileDevice) {
      return;
    }

    const handleContextMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      
      // Allow context menu for input fields and textareas (they may have special menus)
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      
      // Allow context menu for video/audio controls (they have native controls)
      // But only if clicking on the controls themselves, not the media element
      if (target.closest('video, audio, mux-video, mux-player')) {
        // Only prevent if not on controls
        const isControl = target.closest('[class*="control"], [class*="button"], button, [role="button"]');
        if (isControl) {
          return; // Allow context menu on controls
        }
      }
      
      // Prevent context menu (right-click or long-press menu)
      e.preventDefault();
      return false;
    };

    const handleSelectStart = (e: Event) => {
      // Prevent text selection on mobile
      const target = e.target as HTMLElement;
      
      // Allow selection in input fields, textareas, and contenteditable elements
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      
      e.preventDefault();
      return false;
    };

    const handleDragStart = (e: DragEvent) => {
      // Prevent dragging images and other elements on mobile
      const target = e.target as HTMLElement;
      
      // Allow dragging in specific cases if needed (like file upload areas)
      // For now, prevent all dragging
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
        e.preventDefault();
        return false;
      }
    };

    // Add event listeners
    document.addEventListener('contextmenu', handleContextMenu, { passive: false });
    document.addEventListener('selectstart', handleSelectStart, { passive: false });
    document.addEventListener('dragstart', handleDragStart, { passive: false });

    return () => {
      // Cleanup event listeners
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, []);

  return null;
}
