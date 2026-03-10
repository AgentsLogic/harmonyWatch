"use client";

import { useState, useEffect, useRef } from "react";
import { SettingsModal } from "./settings-modal";
import { useModal } from "../contexts/modal-context";

export function SettingsModalRenderer() {
  const { isSettingsModalOpen, setIsSettingsModalOpen } = useModal();
  const [isAnimatingClose, setIsAnimatingClose] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const prevSettingsModalOpen = useRef(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update URL to homepage when modal closes
  // IMPORTANT: Only run when modal transitions from open→closed, not on initial mount
  // This prevents the URL from being changed when navigating directly to /settings or /settings/upgrade
  useEffect(() => {
    // Track previous state
    const wasOpen = prevSettingsModalOpen.current;

    // Only run cleanup if modal was previously open and is now closed (and animation finished)
    if (wasOpen && !isSettingsModalOpen && !isAnimatingClose) {
      // Modal is fully closed, update URL if we're on settings routes
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        if (pathname === '/settings' || pathname === '/settings/upgrade') {
          // Update URL to homepage silently
          window.history.replaceState(null, '', '/');
        } else if (pathname.endsWith('/settings')) {
          // Remove /settings from end of URL to return to base path (e.g., /01cj7ix/settings -> /01cj7ix)
          const basePath = pathname.slice(0, -9); // Remove '/settings' (9 chars)
          window.history.replaceState(null, '', basePath || '/');
        }
      }
      // Mark that we've cleaned up, so ref can be reset
      prevSettingsModalOpen.current = false;
    } else if (isSettingsModalOpen) {
      // Modal is open - update ref to track that it was open
      prevSettingsModalOpen.current = true;
    }
    // If modal is closed but was never open (initial mount), don't update ref
  }, [isSettingsModalOpen, isAnimatingClose]);

  const handleClose = (delayClose = false) => {
    if (delayClose) {
      if (isMobile) {
        // On mobile drag-to-dismiss, keep isOpen true during animation
        // The drag animation handles the visual transition, not the exit fade
        setIsAnimatingClose(true);
        setIsSettingsModalOpen(false); // Scale background back
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      } else {
        // On desktop backdrop click, let isOpen become false to trigger fade-out
        // but keep SettingsModal mounted during animation
        setIsAnimatingClose(true);
        setIsSettingsModalOpen(false); // This triggers exit animation in BaseModal
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      }
    } else {
      // Immediate close (e.g., clicking X button on mobile, or other immediate close actions)
      setIsSettingsModalOpen(false);
      setIsAnimatingClose(false);
    }
  };

  // On mobile drag-to-dismiss, keep isOpen true during animation to prevent exit fade
  // On desktop backdrop click, isOpen becomes false to trigger fade-out
  const modalIsOpen = isMobile && isAnimatingClose ? true : isSettingsModalOpen;

  return (
    <SettingsModal 
      isOpen={modalIsOpen} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
    />
  );
}

