"use client";

import { useState, useEffect, useRef } from "react";
import { SignupModal } from "./signup-modal";
import { useModal } from "../contexts/modal-context";

export function SignupModalRenderer() {
  const { 
    isSignupModalOpen, 
    setIsSignupModalOpen,
    signupModalInitialStep,
    signupModalInitialEmail,
    signupModalSuccessParams
  } = useModal();
  const [isAnimatingClose, setIsAnimatingClose] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const prevSignupModalOpen = useRef(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update URL when signup modal closes
  // IMPORTANT: Only run when modal transitions from open→closed, not on initial mount
  // This prevents the URL from being changed when navigating directly to /upgrade, /settings/upgrade, etc.
  useEffect(() => {
    // Track previous state
    const wasOpen = prevSignupModalOpen.current;

    // Only run cleanup if modal was previously open and is now closed (and animation finished)
    if (wasOpen && !isSignupModalOpen && !isAnimatingClose) {
      // Modal is fully closed, check if we need to return to previous URL
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        if (pathname === '/settings/upgrade' || pathname.endsWith('/settings/upgrade')) {
          // Check if we came from a settings path (could be /settings or /01cj7ix/settings)
          const originPath = sessionStorage.getItem('settings_upgrade_origin');
          if (originPath) {
            // Return to the origin path (e.g., /settings or /01cj7ix/settings)
            window.history.replaceState(null, '', originPath);
            sessionStorage.removeItem('settings_upgrade_origin'); // Clean up
          } else {
            // No origin stored, remove /upgrade to get base path
            const basePath = pathname.replace('/upgrade', '');
            window.history.replaceState(null, '', basePath || '/');
          }
        } else if (pathname.endsWith('/upgrade')) {
          // Remove /upgrade from end of URL to return to base path
          const basePath = pathname.slice(0, -8); // Remove '/upgrade' (8 chars)
          window.history.replaceState(null, '', basePath || '/');
        } else if (pathname.endsWith('/signup')) {
          // Remove /signup from end of URL to return to base path
          const basePath = pathname.slice(0, -7); // Remove '/signup' (7 chars)
          window.history.replaceState(null, '', basePath || '/');
        }
      }
      // Mark that we've cleaned up, so ref can be reset
      prevSignupModalOpen.current = false;
    } else if (isSignupModalOpen) {
      // Modal is open - update ref to track that it was open
      prevSignupModalOpen.current = true;
    }
    // If modal is closed but was never open (initial mount), don't update ref
  }, [isSignupModalOpen, isAnimatingClose]);

  const handleClose = (delayClose = false) => {
    if (delayClose) {
      if (isMobile) {
        // On mobile drag-to-dismiss, keep isOpen true during animation
        setIsAnimatingClose(true);
        setIsSignupModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      } else {
        // On desktop backdrop click, let isOpen become false to trigger fade-out
        setIsAnimatingClose(true);
        setIsSignupModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      }
    } else {
      // Immediate close
      setIsSignupModalOpen(false);
      setIsAnimatingClose(false);
    }
  };

  // On mobile drag-to-dismiss, keep isOpen true during animation
  const modalIsOpen = isMobile && isAnimatingClose ? true : isSignupModalOpen;

  return (
    <SignupModal 
      isOpen={modalIsOpen} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
      initialStep={signupModalInitialStep}
      initialEmail={signupModalInitialEmail}
      successParams={signupModalSuccessParams}
    />
  );
}


