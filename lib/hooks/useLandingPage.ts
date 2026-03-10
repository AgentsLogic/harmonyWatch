"use client";

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { seriesService } from '../database';

// Type for landing page series
export interface LandingPageSeries {
  id: string;
  series_id: string;
  sort_order: number;
  series: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    content_type: 'video' | 'audio';
    episodes_count: number;
  };
}

// Type for landing page modules
export interface LandingPageModule {
  id: string;
  series_id: string;
  sort_order: number;
  logo_url_override: string | null;
  background_url_override: string | null;
  subtitle_override: string | null;
  hide_subtitle: boolean;
  button_text_override: string | null;
  logo_width: number | null;
  logo_height: number | null;
  series: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    logo_url: string | null;
    banner_url: string | null;
    content_type: 'video' | 'audio';
    episodes_count: number;
  };
}

// Type for landing page FAQs
export interface LandingPageFAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

async function fetchLandingSeries(): Promise<LandingPageSeries[]> {
  const response = await fetch('/api/landing-series');
  
  if (!response.ok) {
    throw new Error('Failed to fetch landing series');
  }
  
  const data = await response.json();
  const series = data.series || [];
  
  // Always fetch all video series for random selection
  const allSeries = await seriesService.getAll();
  const videoSeries = allSeries.filter(s => s.content_type === 'video');
  
  // Get configured series IDs to exclude from random selection
  const configuredSeriesIds = new Set(
    series.map((s: any) => {
      // Handle both direct series_id and nested series object
      return s.series_id || (s.series && s.series.id) || s.id;
    })
  );
  
  // Filter out already configured series
  const availableForRandom = videoSeries.filter(s => !configuredSeriesIds.has(s.id));
  
  // Determine how many random series we need (up to 4 total)
  const maxTotal = 4;
  const configuredCount = series.length;
  const randomNeeded = Math.max(0, maxTotal - configuredCount);
  
  // Get random series to fill remaining spots
  const shuffled = [...availableForRandom].sort(() => 0.5 - Math.random());
  const randomSeries = shuffled.slice(0, randomNeeded).map((s) => ({
    id: `random-${s.id}`,
    series_id: s.id,
    sort_order: 0,
    series: {
      id: s.id,
      title: s.title,
      description: s.description,
      thumbnail_url: s.thumbnail_url,
      content_type: s.content_type,
      episodes_count: s.episodes_count
    }
  }));
  
  // Combine configured and random series, then shuffle and limit to 4
  const combined = [...series, ...randomSeries];
  const finalShuffled = [...combined].sort(() => 0.5 - Math.random()).slice(0, maxTotal);
  
  return finalShuffled;
}

async function fetchLandingModules(): Promise<LandingPageModule[]> {
  const response = await fetch('/api/landing-modules');
  
  if (!response.ok) {
    throw new Error('Failed to fetch landing modules');
  }
  
  const data = await response.json();
  return data.modules || [];
}

async function fetchLandingFAQs(): Promise<LandingPageFAQ[]> {
  const response = await fetch('/api/landing-faqs');
  
  if (!response.ok) {
    throw new Error('Failed to fetch landing FAQs');
  }
  
  const data = await response.json();
  return data.faqs || [];
}

export function useLandingSeries() {
  return useQuery({
    queryKey: queryKeys.landing.series(),
    queryFn: fetchLandingSeries,
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData,
  });
}

export function useLandingModules() {
  return useQuery({
    queryKey: queryKeys.landing.modules(),
    queryFn: fetchLandingModules,
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData,
  });
}

export function useLandingFAQs() {
  return useQuery({
    queryKey: queryKeys.landing.faqs(),
    queryFn: fetchLandingFAQs,
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData,
  });
}
