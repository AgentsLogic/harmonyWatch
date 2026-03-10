"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/data";

export type HoverData = {
  item: MediaItem;
  rect: DOMRect; // bounding rect of the hovered card
  element: HTMLElement; // reference to the hovered card element
};

type Props = {
  data: HoverData | null;
  onClose: () => void;
  onCardClick?: (item: MediaItem) => void;
};

export function HoverPreview({ data, onClose, onCardClick }: Props) {
  const [isClosing, setIsClosing] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [isMuted, setIsMuted] = useState(() => {
    // Get muted state from sessionStorage, default to false (unmuted)
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('video-muted');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // Update position synchronously to avoid flicker at previous location
  useLayoutEffect(() => {
    if (!data) return;

    const computeFromRect = (rect: DOMRect) => {
      const left = rect.left + rect.width / 2 - 198; // centered for 396px width
      const top = rect.top + rect.height / 2 - 132; // centered for 264px height
      setPosition({ left, top });
    };

    // Set immediately from provided rect to prevent flashing old position
    computeFromRect(data.rect);

    const updatePosition = () => {
      const rect = data.element.getBoundingClientRect();
      computeFromRect(rect);
    };

    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [data]);

  // Save muted state to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('video-muted', JSON.stringify(isMuted));
    }
  }, [isMuted]);

  // Auto-play video when preview opens
  useEffect(() => {
    if (data && videoRef.current) {
      // Set muted state based on user preference
      videoRef.current.muted = isMuted;
      
      videoRef.current.play().catch((error) => {
        console.log("Video autoplay failed:", error.message);
        // If autoplay fails, try with muted first, then respect user preference
        videoRef.current!.muted = true;
        videoRef.current!.play().then(() => {
          // Set to user's preferred state after a short delay
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.muted = isMuted;
            }
          }, 100);
        }).catch(console.error);
      });
    }
  }, [data, isMuted]);

  // Stop video when preview closes
  useEffect(() => {
    if (!data && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [data]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering card click
    setIsMuted(!isMuted);
  };

  const handleClose = () => {
    // Stop video immediately when closing
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200); // Quicker close animation
  };

  if (!data) return null;

  const { item } = data;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[50]">
      <div
        key={item.id}
        className="absolute w-[396px] rounded-[0.5rem] overflow-hidden bg-[#1c1c1c] text-white shadow-2xl border border-white/10 cursor-pointer will-change-transform will-change-opacity"
        style={{ 
          left: position.left, 
          top: position.top,
          transformOrigin: "center center",
          animation: isClosing ? "expandOut 0.2s ease-in forwards" : "expandIn 0.3s ease-out forwards"
        }}
        onMouseLeave={handleClose}
        onClick={() => onCardClick?.(item)}
      >
        {/* preview video with overlay */}
        <div className="relative w-full h-[198px]">
          <video
            ref={videoRef}
            src="/dummy-videos/preview-dummy.webm"
            className="w-full h-full object-cover"
            loop
            playsInline
          />
          {/* Bottom gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          {/* Title overlay */}
          <div className="absolute bottom-3 left-3 text-white font-semibold text-sm">
            {item.title}
          </div>
          {/* Mute/Unmute button */}
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center"
          >
            {isMuted ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
        </div>
         <div className="p-3">
           <div className="flex items-center gap-2">
             <button 
               onClick={() => onCardClick?.(item)}
               className="rounded-full bg-white text-black w-9 h-9 grid place-items-center hover:bg-white/90 transition-colors"
             >
               ▶
             </button>
             <button className="rounded-full border border-white/60 w-9 h-9 grid place-items-center hover:bg-white/10 transition-colors">＋</button>
             <button className="rounded-full border border-white/60 w-9 h-9 grid place-items-center hover:bg-white/10 transition-colors">👍</button>
           </div>
          <div className="mt-3 text-sm text-white/90">
            {item.rating || 'NR'} • 2 Seasons • HD
          </div>
          <div className="mt-2 text-sm text-white/80">
            {item.tags && item.tags.length > 0 ? item.tags.join(' • ') : 'No tags'}
          </div>
        </div>
      </div>
    </div>
  );
}