"use client";

import { useState, useEffect, useRef } from "react";
import { ContentModal } from "./content-modal";
import { useModal } from "../contexts/modal-context";
import { useUser } from "../contexts/user-context";
import { useRouter } from "next/navigation";

export function ModalRenderer() {
  const { isModalOpen, setIsModalOpen, selectedItem, setSelectedItem, sourcePosition, setSourcePosition } = useModal();
  const [isAnimatingClose, setIsAnimatingClose] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useUser();
  const router = useRouter();
  const prevModalOpen = useRef(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // URL cleanup when content modal closes
  useEffect(() => {
    const wasOpen = prevModalOpen.current;
    
    // Only run cleanup if modal was previously open and is now closed
    if (wasOpen && !isModalOpen && !isAnimatingClose) {
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        
        // Check if current URL is a series slug (not a short ID, not /settings, not /upgrade, etc.)
        // Series slugs are typically lowercase with hyphens, and don't match short ID patterns
        // Short IDs are typically alphanumeric without hyphens
        const isSlugPattern = pathname !== '/' && 
                              !pathname.startsWith('/settings') && 
                              !pathname.startsWith('/upgrade') &&
                              !pathname.startsWith('/signup') &&
                              !pathname.startsWith('/login') &&
                              !pathname.startsWith('/landing') &&
                              pathname.length > 1 &&
                              pathname.split('/').length === 2; // Only one segment after /
        
        if (isSlugPattern) {
          // This might be a series slug - clean it up
          if (user) {
            window.history.replaceState(null, '', '/');
          } else {
            router.replace('/landing');
          }
        }
      }
      prevModalOpen.current = false; // Reset after cleanup
    } else if (isModalOpen) {
      prevModalOpen.current = true; // Track that modal was open
    }
  }, [isModalOpen, isAnimatingClose, user, router]);

  const handleClose = (delayClose = false) => {
    if (delayClose) {
      if (isMobile) {
        // On mobile drag-to-dismiss, keep isOpen true during animation
        // The drag animation handles the visual transition, not the exit fade
        setIsAnimatingClose(true);
        setIsModalOpen(false); // Scale background back
        setTimeout(() => {
          setIsAnimatingClose(false);
          setSelectedItem(null);
          setSourcePosition(null);
        }, 200);
      } else {
        // On desktop backdrop click, let isOpen become false to trigger fade-out
        // but keep ContentModal mounted during animation
        setIsAnimatingClose(true);
        setIsModalOpen(false); // This triggers exit animation in BaseModal
        setTimeout(() => {
          setIsAnimatingClose(false);
          setSelectedItem(null);
          setSourcePosition(null);
        }, 200);
      }
    } else {
      // Immediate close (e.g., clicking X button on mobile, or other immediate close actions)
      setIsModalOpen(false);
      setIsAnimatingClose(false);
      setSelectedItem(null);
      setSourcePosition(null);
    }
  };

  // On mobile drag-to-dismiss, keep isOpen true during animation to prevent exit fade
  // On desktop backdrop click, isOpen becomes false to trigger fade-out
  const modalIsOpen = isMobile && isAnimatingClose ? true : isModalOpen;

  return (
    <ContentModal 
      item={selectedItem} 
      isOpen={modalIsOpen} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
      sourcePosition={sourcePosition}
    />
  );
}

