# React Query Implementation Plan

## Overview

This document outlines the plan to implement React Query (TanStack Query) across the HarmonyWatch application to provide:
- Automatic caching with configurable stale times
- Request deduplication
- Background refetching
- Instant navigation (cached data shows immediately)
- Proper loading/error states

## Phase 1: Setup & Infrastructure

### 1.1 Install Dependencies
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### 1.2 Create Query Client Provider
**File:** `app/providers/query-provider.tsx`

```typescript
"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep unused data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Retry failed requests 2 times
        retry: 2,
        // Don't refetch on window focus for better UX
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
```

### 1.3 Wrap App with Provider
**File:** `app/layout.tsx`

Add `QueryProvider` as the outermost provider (or inside existing providers).

---

## Phase 2: Create Query Keys Factory

**File:** `lib/query-keys.ts`

Centralized query keys for cache management and invalidation:

```typescript
export const queryKeys = {
  // Carousel
  carousel: {
    all: ['carousel'] as const,
    items: (calendarType: 'new' | 'old') => ['carousel', 'items', calendarType] as const,
  },
  
  // Categories (shelves)
  categories: {
    all: ['categories'] as const,
    withContent: () => ['categories', 'with-content'] as const,
  },
  
  // Recently Viewed
  recentlyViewed: {
    all: ['recently-viewed'] as const,
    byUser: (userId: string) => ['recently-viewed', userId] as const,
  },
  
  // Content Items
  content: {
    all: ['content'] as const,
    lists: () => ['content', 'list'] as const,
    list: (filters?: Record<string, any>) => ['content', 'list', filters] as const,
    details: () => ['content', 'detail'] as const,
    detail: (id: string) => ['content', 'detail', id] as const,
  },
  
  // Series
  series: {
    all: ['series'] as const,
    lists: () => ['series', 'list'] as const,
    list: (filters?: Record<string, any>) => ['series', 'list', filters] as const,
    details: () => ['series', 'detail'] as const,
    detail: (id: string) => ['series', 'detail', id] as const,
    episodes: (seriesId: string) => ['series', seriesId, 'episodes'] as const,
  },
  
  // Comments
  comments: {
    all: ['comments'] as const,
    byContent: (contentId: string) => ['comments', 'content', contentId] as const,
    byContentPaginated: (contentId: string, page: number) => 
      ['comments', 'content', contentId, 'page', page] as const,
  },
  
  // User
  user: {
    all: ['user'] as const,
    profile: () => ['user', 'profile'] as const,
    preferences: () => ['user', 'preferences'] as const,
  },
  
  // Admin
  admin: {
    statistics: () => ['admin', 'statistics'] as const,
    users: (page?: number) => ['admin', 'users', page] as const,
    dailyContent: (seriesId: string) => ['admin', 'daily-content', seriesId] as const,
  },
};
```

---

## Phase 3: Convert Hooks to React Query

### 3.1 Carousel Items Hook (HIGH PRIORITY)
**File:** `lib/hooks/useCarouselItems.ts` (new file)

```typescript
"use client";

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getTodayDateString } from '../utils/date-helpers';
import type { MediaItem } from '@/app/lib/data';

async function fetchCarouselItems(calendarType: 'new' | 'old'): Promise<MediaItem[]> {
  const response = await fetch('/api/carousel/items', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch carousel items');
  }

  const data = await response.json();
  const todayDateStr = getTodayDateString(calendarType);

  // Transform API response to MediaItem format
  let transformedItems: MediaItem[] = data.items.map((item: any) => ({
    id: item.series_id,
    title: item.title,
    subtitle: item.subtitle || undefined,
    imageUrl: item.series.thumbnail_url || '/images/dummybg.webp',
    backgroundUrl: item.background_url || item.series.banner_url || undefined,
    backgroundUrls: item.background_urls || undefined,
    logoUrl: item.logo_url || item.series.logo_url || undefined,
    content_type: item.series.content_type || 'video',
    isDailyContent: item.series.is_daily_content || false,
    badges: item.badges || undefined,
    autoBadgeEnabled: item.auto_badge_enabled || false,
    enable_video_preview: item.enable_video_preview || false,
    rating: item.series.rating || item.rating || 'NR',
    tags: item.series.tags || item.tags || [],
    isPremium: item.series.is_premium || item.is_premium || false,
  }));

  // Fetch today's episodes for daily content series
  const dailyItems = transformedItems.filter(item => item.isDailyContent);
  
  if (dailyItems.length > 0) {
    const episodePromises = dailyItems.map(async (item) => {
      try {
        const episodesResponse = await fetch(
          `/api/admin/daily-content/${item.id}/episodes`,
          { credentials: 'include' }
        );
        
        if (episodesResponse.ok) {
          const episodesData = await episodesResponse.json();
          const episodes = episodesData.episodes || [];
          
          const todayEpisode = episodes.find((ep: any) => 
            ep.new_calendar_date === todayDateStr
          );

          if (todayEpisode) {
            return {
              ...item,
              todayEpisodeId: todayEpisode.id,
              todayEpisodeDescription: todayEpisode.description || item.subtitle,
            };
          }
        }
      } catch (error) {
        console.error(`Error fetching episodes for series ${item.id}:`, error);
      }
      return item;
    });

    const itemsWithEpisodes = await Promise.all(episodePromises);
    
    transformedItems = transformedItems.map(item => {
      const itemWithEpisode = itemsWithEpisodes.find(i => i.id === item.id);
      return itemWithEpisode || item;
    });
  }

  return transformedItems;
}

export function useCarouselItems(calendarType: 'new' | 'old', enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.carousel.items(calendarType),
    queryFn: () => fetchCarouselItems(calendarType),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### 3.2 Categories Hook (HIGH PRIORITY)
**File:** `lib/hooks/useCategories.ts` (refactor)

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { categoriesService, categoryContentService, categorySeriesService } from '../database';
import { supabaseAdmin } from '../supabase';

export interface CategoryItem {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  sort_order: number;
  badge?: string;
  isNew?: boolean;
  type?: string;
  rating?: string;
  tags?: string[];
  logo_url?: string;
  banner_url?: string;
  content_type?: 'video' | 'audio';
  itemType?: 'content' | 'series';
}

export interface CategoryWithItems {
  id: string;
  title: string;
  sort_order: number;
  items: CategoryItem[];
}

async function fetchCategoriesWithContent(): Promise<CategoryWithItems[]> {
  return await categoriesService.getAllWithContent();
}

export function useCategories() {
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading: loading, error } = useQuery({
    queryKey: queryKeys.categories.withContent(),
    queryFn: fetchCategoriesWithContent,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
  };

  // ... keep existing mutation functions (addCategory, updateCategory, etc.)
  // but call refresh() after successful mutations

  return {
    categories,
    loading,
    error: error?.message || null,
    refresh,
    // ... other functions
  };
}
```

### 3.3 Recently Viewed Hook (HIGH PRIORITY)
**File:** `lib/hooks/useRecentlyViewed.ts` (refactor)

```typescript
"use client";

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import type { MediaItem } from '@/app/lib/data';

async function fetchRecentlyViewed(): Promise<MediaItem[]> {
  const response = await fetch('/api/recently-viewed', {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch recently viewed: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

export function useRecentlyViewed(userId: string | null) {
  const { data: items = [], isLoading: loading, error } = useQuery({
    queryKey: queryKeys.recentlyViewed.byUser(userId || ''),
    queryFn: fetchRecentlyViewed,
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes (more frequent updates for recently viewed)
  });

  return {
    items,
    loading,
    error: error?.message || null,
  };
}
```

### 3.4 Content Items Hook (MEDIUM PRIORITY)
**File:** `lib/hooks/useContentItems.ts` (refactor)

Similar pattern - convert to `useQuery` for reads, `useMutation` for writes.

### 3.5 Comments Hook (MEDIUM PRIORITY)
**File:** `lib/hooks/useComments.ts` (refactor)

Use `useInfiniteQuery` for paginated comments:

```typescript
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useComments({ contentId, pageSize = 20 }) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading,
    error,
    hasNextPage: hasMore,
    fetchNextPage: loadMore,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.comments.byContent(contentId || ''),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch(
        `/api/comments/item/${contentId}?page=${pageParam}&pageSize=${pageSize}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to load comments');
      return response.json();
    },
    enabled: !!contentId,
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => 
      lastPage.hasMore ? pages.length + 1 : undefined,
  });

  const comments = data?.pages.flatMap(page => page.comments) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // ... mutations for add, update, delete comments

  return {
    comments,
    loading,
    error: error?.message || null,
    hasMore: !!hasMore,
    total,
    loadMore: () => loadMore(),
    refresh: () => queryClient.invalidateQueries({ 
      queryKey: queryKeys.comments.byContent(contentId || '') 
    }),
    // ... mutation functions
  };
}
```

---

## Phase 4: Update Page Components

### 4.1 Homepage (app/page.tsx)

**Before:**
```typescript
const [carouselItems, setCarouselItems] = useState<MediaItem[]>([]);
const [carouselLoading, setCarouselLoading] = useState(true);
const { categories, loading, error } = useCategories();

useEffect(() => {
  // ... fetch carousel items
}, [calendarType, ...]);
```

**After:**
```typescript
const { data: carouselItems = [], isLoading: carouselLoading } = useCarouselItems(
  calendarType,
  shouldFetch // enabled only when user is valid
);
const { categories, loading, error } = useCategories();
// No useEffect needed - React Query handles it
```

### 4.2 Admin Dashboard Pages

Convert admin statistics, user lists, and content lists to use React Query with appropriate stale times.

---

## Phase 5: Cache Invalidation Strategy

### 5.1 When to Invalidate

| Action | Invalidate Keys |
|--------|-----------------|
| Admin adds/edits carousel item | `queryKeys.carousel.all` |
| Admin adds/edits category | `queryKeys.categories.all` |
| User watches content | `queryKeys.recentlyViewed.byUser(userId)` |
| Admin adds/edits content | `queryKeys.content.all`, `queryKeys.categories.all` |
| User adds comment | `queryKeys.comments.byContent(contentId)` |

### 5.2 Optimistic Updates

For better UX, implement optimistic updates for:
- Adding comments (show immediately, rollback on error)
- Toggling reactions (update count immediately)
- Removing from recently viewed

---

## Phase 6: Migration Checklist

### High Priority (Homepage Performance)
- [ ] Install React Query
- [ ] Create QueryProvider
- [ ] Add to layout.tsx
- [ ] Create query-keys.ts
- [ ] Create useCarouselItems hook
- [ ] Refactor useCategories hook
- [ ] Refactor useRecentlyViewed hook
- [ ] Update app/page.tsx

### Medium Priority (Content & Comments)
- [ ] Refactor useContentItems hook
- [ ] Refactor useComments hook
- [ ] Update video-modal.tsx
- [ ] Update comments-section.tsx

### Lower Priority (Admin)
- [ ] Admin statistics
- [ ] Admin user list
- [ ] Admin content list
- [ ] Carousel dashboard

---

## Phase 7: Testing & Verification

### 7.1 Manual Testing
1. Navigate from video page to homepage - should be instant (no spinner)
2. Refresh homepage - data should load normally
3. Change calendar preference - carousel should update
4. Watch a video - should appear in "Continue" shelf on return

### 7.2 DevTools Verification
Use React Query DevTools to verify:
- Queries are cached correctly
- Stale times are working
- No duplicate requests

---

## Estimated Timeline

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Setup | 30 minutes |
| Phase 2: Query Keys | 15 minutes |
| Phase 3: Convert Hooks | 2-3 hours |
| Phase 4: Update Pages | 1-2 hours |
| Phase 5: Cache Invalidation | 30 minutes |
| Phase 6: Testing | 1 hour |
| **Total** | **5-7 hours** |

---

## Benefits After Implementation

1. **Instant Navigation**: Homepage shows cached data immediately when navigating back
2. **Request Deduplication**: Multiple components requesting same data = 1 API call
3. **Background Refresh**: Stale data updates silently in background
4. **Better Error Handling**: Automatic retries, consistent error states
5. **DevTools**: Easy debugging of cache state
6. **Less Code**: Remove manual useState/useEffect patterns
7. **Optimistic Updates**: Better perceived performance for mutations

---

## Rollback Plan

If issues arise:
1. React Query hooks are additive - old hooks can remain alongside
2. Can disable React Query by removing QueryProvider
3. Individual hooks can be reverted independently
