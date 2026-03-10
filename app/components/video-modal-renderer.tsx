"use client";

import { useState, useEffect, useRef } from "react";
import { VideoModal } from "./video-modal";
import { useModal } from "../contexts/modal-context";
import { useAudioPlayer } from "./audio-player-provider";

export function VideoModalRenderer() {
  const { isVideoModalOpen, setIsVideoModalOpen, videoContentId, isVideoModalInPipMode } = useModal();
  const { setIsVisible: setAudioPlayerVisible, currentContent } = useAudioPlayer();
  const [isAnimatingClose, setIsAnimatingClose] = useState(false);
  const prevVideoModalOpen = useRef(false);

  // Handle browser back/forward button - close video modal when URL changes away from video
  // This handler lives here (not in [shortId]/page.tsx) because VideoModalRenderer is always mounted
  // and won't be affected by route component mount/unmount race conditions
  useEffect(() => {
    if (!isVideoModalOpen || isVideoModalInPipMode) return;

    const handlePopState = () => {
      const currentPath = window.location.pathname;
      // If URL changed to homepage or landing, close the video modal
      // Don't close if URL still has a shortId/slug suffix (e.g., /settings, /upgrade appended)
      if (currentPath === '/' || currentPath === '/landing') {
        setIsVideoModalOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isVideoModalOpen, isVideoModalInPipMode, setIsVideoModalOpen]);

  // Close audio player when video modal opens
  useEffect(() => {
    if (isVideoModalOpen && !prevVideoModalOpen.current) {
      // Video modal just opened - close audio player
      setAudioPlayerVisible(false);
      
      // Also stop audio completely if it's playing
      if (typeof window !== 'undefined') {
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            // Clear the source to prevent background playback
            if (audio.src) {
              audio.src = '';
              audio.load();
            }
          }
        });
        // Also destroy any HLS instances
        if ((window as any).hlsInstances) {
          (window as any).hlsInstances.forEach((hls: any) => {
            if (hls && typeof hls.destroy === 'function') {
              hls.destroy();
            }
          });
        }
      }
      
      // Remove audio short ID from URL to make room for video URL
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        // Check if pathname looks like a short ID (7-8 character alphanumeric, not a known route)
        const isShortIdRoute = pathname !== '/' && 
          pathname.length >= 7 && 
          pathname.length <= 9 && 
          /^\/[a-z0-9]+$/i.test(pathname) &&
          !pathname.startsWith('/landing') && 
          !pathname.startsWith('/signup') && 
          !pathname.startsWith('/login') &&
          !pathname.startsWith('/video') &&
          !pathname.startsWith('/admin') &&
          !pathname.startsWith('/settings');
        
        if (isShortIdRoute) {
          // Replace URL with home page to make room for video URL
          window.history.replaceState({}, '', '/');
        }
      }
    }
    prevVideoModalOpen.current = isVideoModalOpen;
  }, [isVideoModalOpen, setAudioPlayerVisible, currentContent]);

  const handleClose = (delayClose = false) => {
    if (delayClose) {
      setIsAnimatingClose(true);
      setIsVideoModalOpen(false);
      setTimeout(() => {
        setIsAnimatingClose(false);
      }, 400);
    } else {
      setIsVideoModalOpen(false);
      setIsAnimatingClose(false);
    }
  };

  return (
    <VideoModal 
      contentId={videoContentId}
      isOpen={isVideoModalOpen || isAnimatingClose} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
    />
  );
}

