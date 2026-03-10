"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface PipVideo {
  playbackId: string;
  title: string;
  contentId: string;
  currentTime: number;
  isPlaying: boolean;
  thumbnailUrl?: string | null;
}

interface PipContextType {
  pipVideo: PipVideo | null;
  enterPip: (video: PipVideo) => void;
  exitPip: () => void;
  updatePipTime: (time: number) => void;
  updatePipPlaying: (isPlaying: boolean) => void;
}

const PipContext = createContext<PipContextType | undefined>(undefined);

export function PipProvider({ children }: { children: ReactNode }) {
  const [pipVideo, setPipVideo] = useState<PipVideo | null>(null);

  const enterPip = useCallback((video: PipVideo) => {
    setPipVideo(video);
  }, []);

  const exitPip = useCallback(() => {
    setPipVideo(null);
  }, []);

  const updatePipTime = useCallback((time: number) => {
    setPipVideo(prev => prev ? { ...prev, currentTime: time } : null);
  }, []);

  const updatePipPlaying = useCallback((isPlaying: boolean) => {
    setPipVideo(prev => prev ? { ...prev, isPlaying } : null);
  }, []);

  return (
    <PipContext.Provider value={{ pipVideo, enterPip, exitPip, updatePipTime, updatePipPlaying }}>
      {children}
    </PipContext.Provider>
  );
}

export function usePip() {
  const context = useContext(PipContext);
  if (context === undefined) {
    throw new Error('usePip must be used within a PipProvider');
  }
  return context;
}

