"use client";

import { useState, useEffect, useCallback } from 'react';

const PREVIEW_MUTE_STORAGE_KEY = 'harmonywatch_preview_muted';
const PREVIEW_MUTE_CHANGE_EVENT = 'harmonywatch_preview_mute_change';

export function usePreviewMute() {
  const [isMuted, setIsMutedState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PREVIEW_MUTE_STORAGE_KEY);
      // If there's a stored value, use it; otherwise default to muted (true)
      if (stored !== null) {
        return stored === 'true';
      }
      return true; // Default to muted
    }
    return true; // Default to muted
  });

  // Sync with localStorage changes (for cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PREVIEW_MUTE_STORAGE_KEY) {
        setIsMutedState(e.newValue === 'true');
      }
    };

    // Sync with custom event (for same-tab sync)
    const handleCustomChange = (e: CustomEvent) => {
      if (e.detail !== undefined) {
        setIsMutedState(e.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(PREVIEW_MUTE_CHANGE_EVENT as any, handleCustomChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(PREVIEW_MUTE_CHANGE_EVENT as any, handleCustomChange);
    };
  }, []);

  const setIsMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PREVIEW_MUTE_STORAGE_KEY, String(muted));
      // Dispatch custom event to sync all hook instances in the same tab
      window.dispatchEvent(new CustomEvent(PREVIEW_MUTE_CHANGE_EVENT, { detail: muted }));
    }
  }, []);

  const toggleMute = useCallback(() => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
  }, [isMuted, setIsMuted]);

  return { isMuted, setIsMuted, toggleMute };
}

