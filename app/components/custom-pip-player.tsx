"use client";

import { useEffect, useRef, useState } from 'react';
import { usePip } from '../contexts/pip-context';
import { MuxVideoPlayer } from './mux-video-player';
import { useRouter } from 'next/navigation';

export function CustomPipPlayer() {
  const { pipVideo, exitPip, updatePipTime, updatePipPlaying } = usePip();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Handle drag
  useEffect(() => {
    if (!pipVideo || !pipRef.current) return;

    const handleMouseDown = (e: MouseEvent | TouchEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      
      setIsDragging(true);
      const rect = pipRef.current!.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      setDragOffset({
        x: clientX - rect.left,
        y: clientY - rect.top,
      });
    };

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newX = Math.max(0, Math.min(window.innerWidth - 200, clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 120, clientY - dragOffset.y));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const pipElement = pipRef.current;
    if (pipElement) {
      pipElement.addEventListener('mousedown', handleMouseDown);
      pipElement.addEventListener('touchstart', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      if (pipElement) {
        pipElement.removeEventListener('mousedown', handleMouseDown);
        pipElement.removeEventListener('touchstart', handleMouseDown);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [pipVideo, isDragging, dragOffset]);

  if (!pipVideo) return null;

  return (
    <div
      ref={pipRef}
      className="fixed z-[100] bg-black rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '200px',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      {/* Header with controls */}
      <div className="flex items-center justify-between p-2 bg-black/80 backdrop-blur-sm">
        <span className="text-white text-xs font-medium truncate flex-1" title={pipVideo.title}>
          {pipVideo.title}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={exitPip}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video player */}
      <div className="w-full custom-pip-player" style={{ aspectRatio: '16/9' }}>
        <MuxVideoPlayer
          playbackId={pipVideo.playbackId}
          title={pipVideo.title}
          contentId={pipVideo.contentId}
          initialTime={pipVideo.currentTime}
          videoDuration={0}
          thumbnailUrl={pipVideo.thumbnailUrl}
          autoplay={pipVideo.isPlaying}
          onTimeUpdate={(currentTime, duration) => updatePipTime(currentTime)}
          onPlay={() => updatePipPlaying(true)}
          onPause={() => updatePipPlaying(false)}
          className="w-full h-full"
        />
        {/* Custom styles to hide all controls except play button */}
        <style dangerouslySetInnerHTML={{
          __html: `
            .custom-pip-player media-theme-notflix [part*="bottom"],
            .custom-pip-player mux-player [part*="bottom"],
            .custom-pip-player media-theme-notflix [part*="bar"],
            .custom-pip-player mux-player [part*="bar"],
            .custom-pip-player media-theme-notflix media-seek-backward-button,
            .custom-pip-player media-theme-notflix media-seek-forward-button,
            .custom-pip-player mux-player media-seek-backward-button,
            .custom-pip-player mux-player media-seek-forward-button,
            .custom-pip-player media-theme-notflix button:not(media-play-button),
            .custom-pip-player mux-player button:not(media-play-button) {
              display: none !important;
            }
            /* Keep only the center play button visible */
            .custom-pip-player media-theme-notflix media-play-button,
            .custom-pip-player mux-player media-play-button {
              display: flex !important;
            }
          `
        }} />
      </div>
    </div>
  );
}

