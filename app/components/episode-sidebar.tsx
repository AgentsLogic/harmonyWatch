"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { formatDateForDisplay } from "../../lib/utils/date-helpers";
import { useUser } from "../contexts/user-context";
import { PremiumBadge } from "./premium-badge";

interface Episode {
  id: string | number;
  title: string;
  series: string;
  season: number;
  episode: number;
  duration: string;
  thumbnail: string;
  isCurrent: boolean;
  isToday?: boolean;
  calendarDate?: string; // new_calendar_date for daily content
  isFreeEpisode?: boolean; // Whether this episode is free (overrides series premium status)
}

interface EpisodeSidebarProps {
  episodes: Episode[];
  selectedSeason: number;
  onSeasonChange: (season: number) => void;
  isDailyContent?: boolean;
  selectedMonth?: string; // Format: "YYYY-MM"
  onMonthChange?: (month: string) => void;
  calendarType?: 'new' | 'old';
  onCalendarTypeChange?: (type: 'new' | 'old') => void;
  currentSeries?: any; // Series data to check premium status
  currentContentTitle?: string; // Title of the current content being played
}

export default function EpisodeSidebar({ 
  episodes, 
  selectedSeason, 
  onSeasonChange,
  isDailyContent = false,
  selectedMonth,
  onMonthChange,
  calendarType = 'new',
  onCalendarTypeChange,
  currentSeries,
  currentContentTitle
}: EpisodeSidebarProps) {
  const [hoveredEpisode, setHoveredEpisode] = useState<string | number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { user, hasActiveSubscription } = useUser();
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleEpisodeClick = (episode: Episode) => {
    // In a real app, this would navigate to the episode
    console.log("Navigate to episode:", episode);
  };

  // Generate month options for daily content (dates are cyclical, so just show unique months)
  const getMonthOptions = () => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Generate all 12 months of the year (dates are cyclical, so year doesn't matter)
    // Use current year for the value format, but we'll only match by month
    for (let month = 0; month < 12; month++) {
      const date = new Date(currentYear, month, 1);
      const monthValue = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'long' }); // Just month name, no year
      options.push({ value: monthValue, label: monthName });
    }
    
    return options;
  };

  return (
    <div className="bg-[#0a0a0a] rounded-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{currentContentTitle || currentSeries?.title || 'Episodes'}</h2>
          
          {/* Month Selector for Daily Content, Season Selector for Regular Series */}
          {isDailyContent && selectedMonth && onMonthChange ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => onMonthChange(e.target.value)}
                  className="appearance-none bg-[#0a0a0a] text-white px-3 py-2 pr-8 rounded-md border border-gray-600 focus:outline-none focus:border-gray-500"
                >
                  {getMonthOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {/* Calendar Type Toggle */}
              {onCalendarTypeChange && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarType === 'old'}
                    onChange={(e) => onCalendarTypeChange(e.target.checked ? 'old' : 'new')}
                    className="sr-only"
                  />
                  <div className={`relative w-14 h-7 rounded-full transition-colors ${
                    calendarType === 'old' ? 'bg-blue-600' : 'bg-gray-600'
                  }`}>
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      calendarType === 'old' ? 'translate-x-7' : 'translate-x-0'
                    }`} />
                  </div>
                  <span className="text-white text-sm font-medium">
                    {calendarType === 'new' ? 'New Calendar' : 'Old Calendar'}
                  </span>
                </label>
              )}
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => onSeasonChange(Number(e.target.value))}
                className="appearance-none bg-[#0a0a0a] text-white px-3 py-2 pr-8 rounded-md border border-gray-600 focus:outline-none focus:border-gray-500"
              >
                <option value={1}>Season 1</option>
                <option value={2}>Season 2</option>
                <option value={3}>Season 3</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Episodes List */}
      <div className="space-y-4">
        {episodes.map((episode, index) => (
          <div
            key={episode.id}
            className={`relative cursor-pointer transition-all duration-200 rounded-lg p-1 ${
              episode.isToday ? 'bg-white/5' : ''
            }`}
            onClick={() => handleEpisodeClick(episode)}
            onMouseEnter={() => !isMobile && setHoveredEpisode(episode.id)}
            onMouseLeave={() => setHoveredEpisode(null)}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden mb-3">
              <Image
                src={episode.thumbnail}
                alt={episode.title}
                fill
                className="object-cover"
                unoptimized
                onError={(e) => {
                  // Fallback to a default thumbnail if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.innerHTML = `
                    <div class="w-full h-full bg-gray-700 flex items-center justify-center">
                      <svg class="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  `;
                }}
              />
              
              {/* Duration Badge */}
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                {episode.duration}
              </div>

              {/* Play Button Overlay */}
              {hoveredEpisode === episode.id && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <button className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors">
                    <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Episode Info */}
            <div>
              {episode.calendarDate && (
                <p className="text-gray-400 text-xs mb-1">
                  {formatDateForDisplay(episode.calendarDate, 'default', calendarType || 'new')}
                </p>
              )}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-medium text-white">
                  {episode.episode}. {episode.title}
                </h3>
                {episode.isToday && (
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                    Today
                  </span>
                )}
                {/* Premium badge - only show for free users if episode is premium */}
                {(() => {
                  // Check if episode is premium (series is premium and episode is not free)
                  const isEpisodePremium = currentSeries && (currentSeries as any).is_premium && !episode.isFreeEpisode;
                  const shouldShow = isEpisodePremium && (!user || (!hasActiveSubscription && user.user_type !== 'admin'));
                  return shouldShow ? <PremiumBadge /> : null;
                })()}
              </div>
              <p className="text-gray-300 text-sm">
                {episode.series} | S{episode.season} E{episode.episode}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

