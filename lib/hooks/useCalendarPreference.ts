"use client";

import { useState, useCallback } from 'react';
import { useUser } from '@/app/contexts/user-context';

const SESSION_STORAGE_KEY = 'harmony_calendar_preference';

/**
 * Hook to manage user's calendar type preference (New Calendar vs Old Calendar)
 * 
 * NOTE: Currently uses sessionStorage instead of database persistence.
 * The API endpoint exists but is not called to avoid unnecessary requests.
 * To re-enable database persistence, uncomment the API calls below.
 */
export function useCalendarPreference() {
  const { user } = useUser();
  
  // Load from sessionStorage (session-only, resets on new browser session)
  const [calendarType, setCalendarType] = useState<'new' | 'old'>(() => {
    if (typeof window === 'undefined') return 'old';
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return (stored === 'new' || stored === 'old') ? stored : 'old';
  });
  
  // No loading state needed since sessionStorage is synchronous
  const isLoading = false;

  // Update preference in sessionStorage
  // Future: Can add API call here to persist to database if needed
  const updatePreference = useCallback((newType: 'new' | 'old') => {
    setCalendarType(newType);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, newType);
    }
    
    // FUTURE: Uncomment to re-enable database persistence
    // if (user?.id) {
    //   fetch('/api/user/preferences/calendar-type', {
    //     method: 'PUT',
    //     headers: { 'Content-Type': 'application/json' },
    //     credentials: 'include',
    //     body: JSON.stringify({ preferred_calendar_type: newType }),
    //   }).catch(err => console.error('Failed to persist calendar preference:', err));
    // }
  }, [user?.id]);

  return {
    calendarType,
    updatePreference,
    isLoading,
  };
}


