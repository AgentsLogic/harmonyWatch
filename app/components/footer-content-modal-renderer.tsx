"use client";

import { useState, useEffect, useRef } from "react";
import { FooterContentModal } from "./footer-content-modal";
import { useModal } from "../contexts/modal-context";

// Map content keys to URL paths
const contentKeyToPath: Record<string, string> = {
  'about_us': '/landing/about-us',
  'refund_policy': '/landing/request-data-deletion',
  'terms_of_service': '/landing/terms-of-service',
  'privacy_policy': '/landing/privacy',
  'contact_us': '/landing/contact-us',
};

export function FooterContentModalRenderer() {
  const { 
    isFooterContentModalOpen, 
    setIsFooterContentModalOpen, 
    footerContentKey,
    setFooterContentKey 
  } = useModal();
  const [isAnimatingClose, setIsAnimatingClose] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Note: URL cleanup is handled in handleClose to prevent race conditions
  // No need for separate cleanup useEffect

  // Handle browser back/forward button - close modal when URL changes away from footer link
  useEffect(() => {
    if (isFooterContentModalOpen && footerContentKey) {
      const expectedPath = contentKeyToPath[footerContentKey];
      
      if (expectedPath) {
        const handlePopState = () => {
          const currentPath = window.location.pathname;
          // If pathname changed away from expected path, close modal
          if (currentPath !== expectedPath) {
            setIsFooterContentModalOpen(false);
            setFooterContentKey(null);
          }
        };

        // Listen for popstate events (browser back/forward button)
        window.addEventListener('popstate', handlePopState);

        return () => {
          window.removeEventListener('popstate', handlePopState);
        };
      }
    }
  }, [isFooterContentModalOpen, footerContentKey, setIsFooterContentModalOpen, setFooterContentKey]);

  const handleClose = (delayClose = false) => {
    // Clean up URL immediately when closing to prevent race condition with landing page detection
    if (typeof window !== 'undefined' && footerContentKey) {
      const expectedPath = contentKeyToPath[footerContentKey];
      if (expectedPath && window.location.pathname === expectedPath) {
        window.history.replaceState(null, '', '/landing');
      }
    }
    
    if (delayClose) {
      if (isMobile) {
        setIsAnimatingClose(true);
        setIsFooterContentModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
          setFooterContentKey(null);
        }, 200);
      } else {
        setIsAnimatingClose(true);
        setIsFooterContentModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
          setFooterContentKey(null);
        }, 200);
      }
    } else {
      setIsFooterContentModalOpen(false);
      setIsAnimatingClose(false);
      setFooterContentKey(null);
    }
  };

  const modalIsOpen = isMobile && isAnimatingClose ? true : isFooterContentModalOpen;

  return (
    <FooterContentModal
      contentKey={footerContentKey}
      isOpen={modalIsOpen}
      onClose={handleClose}
      isAnimatingClose={isAnimatingClose}
    />
  );
}
