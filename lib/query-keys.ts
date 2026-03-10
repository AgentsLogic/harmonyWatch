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
    series: (contentId: string) => ['content', 'series', contentId] as const,
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
  
  // Landing Page
  landing: {
    all: ['landing'] as const,
    series: () => ['landing', 'series'] as const,
    modules: () => ['landing', 'modules'] as const,
    faqs: () => ['landing', 'faqs'] as const,
  },
};
