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
    slug: item.series.slug || undefined, // Include series slug for URL routing
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
          
          // Find today's episode based on calendar type
          const todayEpisode = episodes.find((ep: any) => 
            ep.new_calendar_date === todayDateStr
          );

          // If no exact match, find the closest episode (next available)
          if (!todayEpisode && episodes.length > 0) {
            // Sort episodes by new_calendar_date
            const sortedEpisodes = [...episodes].sort((a: any, b: any) => {
              return a.new_calendar_date.localeCompare(b.new_calendar_date);
            });
            
            const nextEpisode = sortedEpisodes.find((ep: any) => {
              return ep.new_calendar_date >= todayDateStr;
            });
            
            if (nextEpisode) {
              return {
                ...item,
                todayEpisodeId: nextEpisode.id,
                todayEpisodeDescription: nextEpisode.description || item.subtitle,
              };
            }
            
            // If no future episode, use the last one (wrap around)
            const lastEpisode = sortedEpisodes[sortedEpisodes.length - 1];
            return {
              ...item,
              todayEpisodeId: lastEpisode.id,
              todayEpisodeDescription: lastEpisode.description || item.subtitle,
            };
          }

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
    // Use placeholderData to show cached data immediately while refetching
    placeholderData: (previousData) => previousData,
  });
}
