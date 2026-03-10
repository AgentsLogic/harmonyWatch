"use client";

import Image from "next/image";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useModal } from "../contexts/modal-context";
import { useUser } from "../contexts/user-context";
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

type NavButtonId = 'home' | 'bug' | 'search' | null;

// Derive active button from pathname (pure function)
const getActiveButton = (pathname: string | null): NavButtonId => {
  if (pathname === '/') return 'home';
  return null; // Video routes = no natural active button
};

// Check if pathname is a video route
const isVideoRoute = (pathname: string | null): boolean => {
  if (!pathname) return false;
  const knownRoutes = ['/', '/landing'];
  const knownPrefixes = ['/signup', '/login'];
  return !knownRoutes.includes(pathname) && 
         !knownPrefixes.some(p => pathname.startsWith(p));
};

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isVideoModalOpen, setIsVideoModalOpen, isVideoModalInPipMode, setIsBugModalOpen, setIsSearchModalOpen, isBugModalOpen, isSearchModalOpen } = useModal();
  const { user } = useUser();
  const queryClient = useQueryClient();
  
  // Simple state: what's highlighted
  const [highlight, setHighlight] = useState<NavButtonId>('home');
  const [mounted, setMounted] = useState(false);
  const prevPipModeRef = useRef(false);
  const userSetHomeRef = useRef(false); // Track when user explicitly sets highlight to 'home'

  // Mount effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync highlight with pathname
  useEffect(() => {
    if (!mounted) return;
    
    const activeButton = getActiveButton(pathname);
    
    if (activeButton) {
      // On known routes, highlight matches route
      setHighlight(activeButton);
      userSetHomeRef.current = false; // Reset flag when on known route
    } else if (isVideoRoute(pathname)) {
      // On video routes, clear highlight (unless modal is in PiP mode or user set it to home)
      // If modal is in PiP, keep current highlight (user might have clicked home)
      if (!isVideoModalInPipMode && !userSetHomeRef.current) {
        setHighlight(null);
      }
    }
  }, [pathname, mounted, isVideoModalInPipMode]);

  // Clear highlight when video modal opens (not in PiP mode)
  useEffect(() => {
    if (!mounted) return;
    
    // When video modal opens and is not in PiP mode, clear highlight
    // But preserve if user explicitly set it to home
    if (isVideoModalOpen && !isVideoModalInPipMode && !userSetHomeRef.current) {
      setHighlight(null);
    }
  }, [isVideoModalOpen, isVideoModalInPipMode, mounted]);

  // Remove highlight when PiP is re-expanded (PiP mode changes from true to false)
  useEffect(() => {
    if (!mounted) return;
    
    // Detect when PiP mode changes from true to false (video expanding from PiP)
    const wasInPip = prevPipModeRef.current;
    const isNowInPip = isVideoModalInPipMode;
    
    // If video was in PiP and is now expanded, remove highlight
    if (wasInPip && !isNowInPip && (isVideoRoute(pathname) || isVideoModalOpen)) {
      setHighlight(null);
      userSetHomeRef.current = false; // Reset flag when expanding from PiP
    }
    
    // Update ref for next comparison
    prevPipModeRef.current = isVideoModalInPipMode;
  }, [isVideoModalInPipMode, pathname, isVideoModalOpen, mounted]);

  // Reset highlight to home when bug modal closes
  useEffect(() => {
    if (!mounted) return;
    
    if (!isBugModalOpen && highlight === 'bug') {
      // When bug modal is dismissed, return highlight to home
      setHighlight('home');
      userSetHomeRef.current = false;
    }
  }, [isBugModalOpen, highlight, mounted]);

  // Reset highlight to home when search modal closes
  useEffect(() => {
    if (!mounted) return;
    
    if (!isSearchModalOpen && highlight === 'search') {
      // When search modal is dismissed, return highlight to home
      setHighlight('home');
      userSetHomeRef.current = false;
    }
  }, [isSearchModalOpen, highlight, mounted]);

  // Handlers
  const handleHomeClick = useCallback(() => {
    // Close other modals
    setIsBugModalOpen(false);
    setIsSearchModalOpen(false);
    
    // If video modal is open and not already in PiP, trigger PiP
    // This handles the case where pathname is '/' but modal is still open after expanding from PiP
    if ((isVideoModalOpen && !isVideoModalInPipMode) || isVideoRoute(pathname)) {
      // Trigger PiP, don't navigate
      // Set highlight to home when clicking home on video page
      setHighlight('home');
      userSetHomeRef.current = true; // Mark that user explicitly set it to home
      window.dispatchEvent(new CustomEvent('trigger-video-pip'));
    } else {
      setHighlight('home');
      userSetHomeRef.current = false; // Reset flag when navigating to home route
      
      // If already on home page, just update URL silently without reload
      // Otherwise, use replaceState to avoid page reload and scroll reset
      if (pathname === '/') {
        // Already on home, no navigation needed
        return;
      } else {
        // Update URL without triggering navigation/reload
        window.history.replaceState(null, '', '/');
      }
    }
  }, [pathname, isVideoModalOpen, isVideoModalInPipMode, setIsBugModalOpen, setIsSearchModalOpen]);

  const handleBugClick = useCallback(() => {
    // Close other modals (but not video modal - bug modal overlays on top)
    setIsSearchModalOpen(false);
    
    // Set highlight and open bug modal
    setHighlight('bug');
    setIsBugModalOpen(true);
  }, [setIsBugModalOpen, setIsSearchModalOpen]);


  const handleSearchClick = useCallback(() => {
    // Close other modals (but not video modal - search overlays on top)
    setIsBugModalOpen(false);
    
    // Set highlight to search and open search modal
    setHighlight('search');
    setIsSearchModalOpen(true);
  }, [setIsSearchModalOpen, setIsBugModalOpen]);

  // Early returns
  if (!mounted) return null;
  if (pathname?.startsWith('/signup') || pathname === '/landing') return null;

  // Highlight position (0, 1, or -1 for hidden)
  const positions: Record<string, number> = { home: 0, bug: 1 };
  const highlightPos = highlight ? positions[highlight] : -1;

  return (
    <motion.div
      className="fixed left-0 right-0 z-[103] flex sm:hidden items-center justify-between px-4 gap-4"
      style={{ bottom: 'calc(-10px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Mobile navigation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.0, ease: "easeOut" }}
    >
      {/* Main Navigation Bar */}
      <nav className="relative flex items-center bg-black/50 backdrop-blur-md rounded-full border border-white/10 h-[65px]">
        {/* Highlight - positioned based on button index, hidden when highlightPos is -1 */}
        {highlightPos >= 0 && (
          <motion.div
            className="absolute top-0 bottom-0 bg-white/10 rounded-full pointer-events-none"
            initial={false}
            animate={{
              x: `calc(${highlightPos} * 100%)`,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
            style={{
              width: 'calc(100% / 2)',
              height: '100%',
            }}
          />
        )}
        
        <NavButton icon="/icons/home.webp" label="Home" onClick={handleHomeClick} />
        <NavButton icon="/icons/bug.webp" label="Bug" onClick={handleBugClick} />
      </nav>

      {/* Search Button */}
      <div className="relative">
        {/* Highlight for search button */}
        {highlight === 'search' && (
          <motion.div
            className="absolute inset-0 bg-white/10 rounded-full pointer-events-none"
            initial={false}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
          />
        )}
        <button
          onClick={handleSearchClick}
          className="relative w-[65px] h-[65px] rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center active:opacity-80 z-10"
          aria-label="Search"
        >
          <Image src="/icons/search.webp" alt="Search" width={24} height={24} className="opacity-90" />
        </button>
      </div>
    </motion.div>
  );
}

// Simple nav button component
function NavButton({ icon, label, onClick, disabled = false }: { 
  icon: string; 
  label: string; 
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center active:opacity-80 px-5 py-2 rounded-full disabled:opacity-50 z-10 h-full"
      aria-label={label}
    >
      <Image src={icon} alt={label} width={24} height={24} className="opacity-90" />
    </button>
  );
}
