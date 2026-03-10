export type TranscriptSnippet = {
  start: number; // seconds
  text: string;
};

export type MediaItem = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  backgroundUrl?: string;
  backgroundUrls?: string[]; // Multiple backgrounds that rotate
  logoUrl?: string;
  runtimeMinutes?: number;
  seasonEpisode?: string; // e.g., S1:E3
  transcript?: TranscriptSnippet[];
  rating?: string; // G, PG, PG-13, R, NR
  tags?: string[]; // Array of tags
  content_type?: 'video' | 'audio'; // Content type for series
  progressPercentage?: number; // Progress percentage (0-100) for recently viewed items
  duration?: string; // Duration string (e.g., "1:23:45")
  short_id?: string; // Short ID for URL routing
  slug?: string; // Series slug for URL routing
  // Daily content fields
  isDailyContent?: boolean; // Whether this series is daily content
  todayEpisodeId?: string; // ID of today's episode (for daily series)
  todayEpisodeDescription?: string; // Description of today's episode (for daily series)
  // Badges
  badges?: string[]; // Array of badge text labels
  autoBadgeEnabled?: boolean; // Whether to auto-add "Today's reading" badge for daily series
  // Premium
  isPremium?: boolean; // Whether this series is premium (requires subscription)
};

export type Category = {
  id: string;
  title: string;
  items: MediaItem[];
};

export const featured: MediaItem[] = [
  {
    id: "dust-to-dust",
    title: "Dust to Dust",
    subtitle:
      "In the unforgiving deserts of 4th century Egypt, the founders of Monasticism seek death to the world and everlasting life in Christ.",
    imageUrl: "/images/dummybg.webp",
    backgroundUrl: "/images/Dust to Dust BG .png",
    logoUrl: "/images/Dust to Dust Logo .png",
    runtimeMinutes: 92,
    transcript: [
      { start: 0, text: "The desert wind carries the prayers of the saints." },
      { start: 12, text: "To live is Christ, to die is gain." },
      { start: 28, text: "We return to dust, and yet we rise." },
    ],
  },
  {
    id: "revolt",
    title: "DEATH TO THE WORLD",
    subtitle: "A countercultural movement of beauty and repentance.",
    imageUrl: "/images/dummybg.webp",
    backgroundUrl: "/George_Barret_-_A_classical_landscape_with_fishermen_and_a_washerwoman,_a_hilltop_villa_and_mountains_beyond.jpg",
    logoUrl: "/images/Dust to Dust Logo .png",
    runtimeMinutes: 54,
    transcript: [
      { start: 0, text: "Revolt against the passions." },
      { start: 14, text: "Beauty will save the world." },
    ],
  },
];

export const categories: Category[] = [
  {
    id: "recent",
    title: "Recently Added",
    items: [
      { id: "recent-1", title: "Dust to Dust", imageUrl: "/images/content-1.png", seasonEpisode: "S1, E1" },
      { id: "recent-2", title: "DEATH TO THE WORLD", imageUrl: "/images/content-2.png", seasonEpisode: "S1, E2" },
      { id: "recent-3", title: "Stories of Saints", imageUrl: "/images/content-3.png", seasonEpisode: "S1, E3" },
      { id: "recent-4", title: "Desert Hymns", imageUrl: "/images/content-2.png", seasonEpisode: "S1, E4" },
      { id: "recent-5", title: "Pilgrim", imageUrl: "/images/content-1.png", seasonEpisode: "S1, E5" },
      { id: "recent-6", title: "Revolt", imageUrl: "/images/content-3.png", seasonEpisode: "S1, E6" },
      { id: "recent-7", title: "Silent Light", imageUrl: "/images/content-1.png", seasonEpisode: "S1, E7" },
      { id: "recent-8", title: "Cenobites", imageUrl: "/images/content-2.png", seasonEpisode: "S2, E1" },
      { id: "recent-9", title: "Anchorite", imageUrl: "/images/content-3.png", seasonEpisode: "S2, E2" },
    ],
  },
  {
    id: "continue",
    title: "Continue Watching",
    items: [
      { id: "cont-1", title: "Dust to Dust", imageUrl: "/images/content-1.png", seasonEpisode: "S1, E1" },
      { id: "cont-2", title: "DEATH TO THE WORLD", imageUrl: "/images/content-2.png", seasonEpisode: "S1, E2" },
      { id: "cont-3", title: "Stories of Saints", imageUrl: "/images/content-3.png", seasonEpisode: "S1, E3" },
      { id: "cont-4", title: "Desert Hymns", imageUrl: "/images/content-2.png", seasonEpisode: "S1, E4" },
      { id: "cont-5", title: "Pilgrim", imageUrl: "/images/content-1.png", seasonEpisode: "S1, E5" },
      { id: "cont-6", title: "Revolt", imageUrl: "/images/content-3.png", seasonEpisode: "S1, E6" },
      { id: "cont-7", title: "Silent Light", imageUrl: "/images/content-1.png", seasonEpisode: "S1, E7" },
    ],
  },
  {
    id: "cat-1",
    title: "Category 1",
    items: [
      { id: "cat1-1", title: "Dust to Dust", imageUrl: "/images/content-1.png" },
      { id: "cat1-2", title: "Stories of Saints", imageUrl: "/images/content-2.png" },
      { id: "cat1-3", title: "Revolt", imageUrl: "/images/content-3.png" },
      { id: "cat1-4", title: "Desert Hymns", imageUrl: "/images/content-2.png" },
      { id: "cat1-5", title: "Pilgrim", imageUrl: "/images/content-1.png" },
      { id: "cat1-6", title: "Silent Light", imageUrl: "/images/content-1.png" },
      { id: "cat1-7", title: "Anchorite", imageUrl: "/images/content-3.png" },
    ],
  },
  {
    id: "cat-2",
    title: "Category 2",
    items: [
      { id: "cat2-1", title: "Dust to Dust", imageUrl: "/images/content-1.png" },
      { id: "cat2-2", title: "Stories of Saints", imageUrl: "/images/content-2.png" },
      { id: "cat2-3", title: "Revolt", imageUrl: "/images/content-3.png" },
      { id: "cat2-4", title: "Desert Hymns", imageUrl: "/images/content-2.png" },
      { id: "cat2-5", title: "Pilgrim", imageUrl: "/images/content-1.png" },
      { id: "cat2-6", title: "Silent Light", imageUrl: "/images/content-1.png" },
      { id: "cat2-7", title: "Anchorite", imageUrl: "/images/content-3.png" },
    ],
  },
];


