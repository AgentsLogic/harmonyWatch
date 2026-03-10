"use client";

import { useRef, useState, useEffect } from "react";

interface VideoPlayerProps {
  video: {
    id: string;
    title: string;
    videoUrl: string;
    duration: string;
  };
  isPlaying: boolean;
  onPlayPause: (playing: boolean) => void;
  currentTime: string;
  onTimeUpdate: (time: string) => void;
}

export default function VideoPlayer({ 
  video, 
  isPlaying, 
  onPlayPause, 
  currentTime, 
  onTimeUpdate 
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isPlaying) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  }, [isPlaying]);

  const handlePlayPause = () => {
    onPlayPause(!isPlaying);
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const current = videoElement.currentTime;
    const duration = videoElement.duration;
    const progressPercent = (current / duration) * 100;
    setProgress(progressPercent);

    // Format time as MM:SS
    const minutes = Math.floor(current / 60);
    const seconds = Math.floor(current % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    onTimeUpdate(formattedTime);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newTime = (clickX / width) * videoElement.duration;
    
    videoElement.currentTime = newTime;
  };

  const formatTime = (timeString: string) => {
    // Convert "1:45" format to "01:45" for display
    const [minutes, seconds] = timeString.split(':');
    return `${minutes.padStart(2, '0')}:${seconds}`;
  };

  const getRemainingTime = () => {
    const [currentMins, currentSecs] = currentTime.split(':').map(Number);
    const [totalMins, totalSecs] = video.duration.split(':').map(Number);
    
    const currentTotal = currentMins * 60 + currentSecs;
    const totalTotal = totalMins * 60 + totalSecs;
    const remaining = totalTotal - currentTotal;
    
    const remainingMins = Math.floor(remaining / 60);
    const remainingSecs = remaining % 60;
    
    return `${remainingMins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full bg-black rounded-lg overflow-hidden mb-6">
      <video
        ref={videoRef}
        className="w-full h-auto"
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          // Auto-play with sound (browser permitting)
          if (videoRef.current) {
            videoRef.current.play().catch(() => {
              // Fallback to muted autoplay if unmuted fails
              setIsMuted(true);
              videoRef.current?.play();
            });
          }
        }}
      >
        <source src={video.videoUrl} type="video/webm" />
        Your browser does not support the video tag.
      </video>

      {/* Video Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between text-white">
          {/* Left Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            <button
              onClick={handleMuteToggle}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isMuted ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 mx-6">
            <div 
              className="relative h-1 bg-white/30 rounded-full cursor-pointer"
              onClick={handleSeek}
            >
              <div 
                className="absolute left-0 top-0 h-full bg-red-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{getRemainingTime()}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4">
            <span className="text-sm">{video.duration}</span>
            <button className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

