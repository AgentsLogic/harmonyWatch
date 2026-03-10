"use client";

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import type { MediaItem } from '@/app/lib/data';

async function fetchRecentlyViewed(): Promise<MediaItem[]> {
  const response = await fetch('/api/recently-viewed', {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    let errorMessage = `Failed to fetch recently viewed: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // If response isn't JSON, use default error message
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  
  // Safety check: ensure data is an object
  if (!data || typeof data !== 'object') {
    console.warn('[useRecentlyViewed] Invalid response format, defaulting to empty array');
    return [];
  }

  if (data.items && Array.isArray(data.items)) {
    return data.items;
  }
  
  return [];
}

export function useRecentlyViewed(userId: string | null) {
  const { data: items = [], isLoading: loading, error } = useQuery({
    queryKey: queryKeys.recentlyViewed.byUser(userId || ''),
    queryFn: fetchRecentlyViewed,
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes (more frequent updates for recently viewed)
    // Use placeholderData to show cached data immediately while refetching
    placeholderData: (previousData) => previousData,
  });

  return {
    items,
    loading,
    error: error?.message || null,
  };
}
