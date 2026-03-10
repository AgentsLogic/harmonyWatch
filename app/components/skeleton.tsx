"use client";

/**
 * Base skeleton component with pulse animation
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[#1a1a1a] rounded ${className}`} />
  );
}

/**
 * Skeleton placeholder for the hero carousel
 * Matches the 90vh height and includes title, subtitle, and button shapes
 * Positioned exactly like the real carousel content
 */
export function CarouselSkeleton() {
  return (
    <section className="relative w-full overflow-hidden h-[90vh] bg-[#0f0f0f]" aria-label="Loading carousel">
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0f0f0f]/50 to-[#0f0f0f]" />
      
      {/* Bottom gradient overlay (matches carousel) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] bg-gradient-to-b from-transparent to-[#0f0f0f]" />
      
      {/* Content area - matches carousel positioning exactly */}
      <div className="absolute inset-x-0 bottom-32 sm:bottom-36 text-white">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6">
          <div className="max-w-none text-center sm:text-left">
            {/* Logo/Title - matches h-[110px] sm:h-[160px] */}
            <div className="flex justify-center sm:justify-start h-[110px] sm:h-[160px]">
              <Skeleton className="h-full w-64 sm:w-80" />
            </div>
            
            {/* Badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            
            {/* Subtitle - matches h-[72px] sm:h-[80px] max-w-[520px] */}
            <div className="mt-3 mx-auto sm:mx-0">
              <Skeleton className="h-[72px] sm:h-[80px] w-full max-w-[520px]" />
            </div>
            
            {/* Buttons - matches mt-4 gap-3 */}
            <div className="mt-4 flex items-center gap-3 justify-center sm:justify-start">
              <Skeleton className="h-10 w-24 rounded-[8px]" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Dots indicator - matches right-6 bottom-6 */}
      <div className="absolute right-6 bottom-6 flex gap-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-2 w-2 rounded-full" />
        ))}
      </div>
    </section>
  );
}

/**
 * Skeleton placeholder for a single content card
 * Matches RowShelf card dimensions exactly (300px for video, 169px for audio)
 * Uses video dimensions as default (most common)
 * Uses consistent skeleton color (#1a1a1a) matching carousel skeletons
 */
export function CardSkeleton() {
  return (
    <div className="shrink-0 flex flex-col transition-transform duration-300 relative" style={{ width: '300px' }}>
      <div className="overflow-hidden relative w-full aspect-video rounded-[0.5rem] bg-[#1a1a1a] animate-pulse" />
    </div>
  );
}

/**
 * Skeleton placeholder for a full row shelf
 * Includes title bar and card skeletons
 * Matches RowShelf structure exactly
 * @param cardCount - Number of card skeletons to show (default: 8)
 */
export function RowShelfSkeleton({ cardCount = 8 }: { cardCount?: number }) {
  return (
    <section className="mt-6 sm:mt-8 overflow-visible">
      {/* Title - matches RowShelf heading structure */}
      <div className="mx-auto max-w-[1700px] px-4 sm:px-6">
        <Skeleton className="h-[1.275rem] w-48 mb-[-10px] -ml-[16px] sm:-ml-[24px]" />
      </div>
      
      {/* Cards row - matches RowShelf scroller structure */}
      <div className="group relative -mx-[calc(50vw-50%)] px-0" style={{ overflowY: 'visible', overflowX: 'visible' }}>
        <div 
          className="no-scrollbar flex gap-4 scroll-smooth pr-0 py-6"
          style={{ 
            paddingLeft: 21, // leftGapPx (16) + 5, matching initial RowShelf value
            overflowX: 'auto',
            overflowY: 'visible',
            clipPath: 'none',
            contain: 'none'
          }}
        >
          {[...Array(cardCount)].map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Skeleton placeholder for video player
 * Matches MuxVideoPlayer aspect-video dimensions
 */
export function VideoPlayerSkeleton() {
  return (
    <div className="w-full aspect-video rounded-xl overflow-hidden bg-[#1a1a1a] animate-pulse" />
  );
}

/**
 * Skeleton placeholder for video details section
 * Includes title, badges, description
 * Matches VideoDetails component structure
 */
export function VideoDetailsSkeleton() {
  return (
    <div className="mb-8">
      {/* Title - matches text-2xl sm:text-3xl */}
      <Skeleton className="h-8 sm:h-9 w-3/4 mb-3 sm:mb-2" />
      
      {/* Badges Row - matches flex gap-2 mb-4 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      
      {/* Description - matches line-clamp-3 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for episode sidebar
 * Includes header with title/selector and episode list items
 * Matches EpisodeSidebar component structure
 * @param episodeCount - Number of episode skeletons to show (default: 5)
 */
export function EpisodeSidebarSkeleton({ episodeCount = 5 }: { episodeCount?: number }) {
  return (
    <div className="bg-[#0a0a0a] rounded-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
      
      {/* Episodes List */}
      <div className="space-y-4">
        {[...Array(episodeCount)].map((_, i) => (
          <div key={i} className="rounded-lg p-1">
            {/* Thumbnail - matches aspect-video */}
            <Skeleton className="w-full aspect-video rounded-lg mb-3" />
            
            {/* Episode info */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
