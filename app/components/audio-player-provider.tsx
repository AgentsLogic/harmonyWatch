"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface AudioContent {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
  contentUrl?: string; // Legacy Supabase URL
  muxPlaybackId?: string; // Mux playback ID
  contentType: 'audio';
}

interface AudioPlayerContextType {
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  currentContent: AudioContent | null;
  setCurrentContent: (content: AudioContent | null) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  /** Increments every time setCurrentContent is called — used to detect re-selection of the same content */
  contentSelectionCount: number;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('audioPlayerVisible');
      return stored === 'true';
    }
    return false;
  });

  const [currentContent, setCurrentContentState] = useState<AudioContent | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [contentSelectionCount, setContentSelectionCount] = useState(0);

  const handleSetIsVisible = (visible: boolean) => {
    setIsVisible(visible);
    localStorage.setItem('audioPlayerVisible', visible.toString());
  };

  const handleSetCurrentContent = useCallback((content: AudioContent | null) => {
    setCurrentContentState(content);
    if (content) {
      setContentSelectionCount(prev => prev + 1);
    }
  }, []);

  return (
    <AudioPlayerContext.Provider value={{ 
      isVisible, 
      setIsVisible: handleSetIsVisible, 
      currentContent, 
      setCurrentContent: handleSetCurrentContent,
      isExpanded,
      setIsExpanded,
      contentSelectionCount
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
