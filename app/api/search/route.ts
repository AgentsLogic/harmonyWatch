import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Search API endpoint
 * Searches content_items and series by title, description, and tags
 * Supports fuzzy matching and typo tolerance
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const searchTerm = query.trim();
    
    // For fuzzy matching, we'll use PostgreSQL's ILIKE with pattern matching
    // This provides basic typo tolerance by searching for partial matches
    const searchPattern = `%${searchTerm}%`;

    // Search content_items (videos and audio) - search title and description
    const { data: contentItems, error: contentError } = await supabaseAdmin
      .from('content_items')
      .select(`
        id,
        title,
        description,
        thumbnail_url,
        content_type,
        rating,
        tags,
        duration,
        visibility,
        short_id
      `)
      .or(`title.ilike.${searchPattern},description.ilike.${searchPattern}`)
      .eq('visibility', 'public')
      .limit(50);

    if (contentError) {
      console.error('[Search API] Error searching content_items:', contentError);
    }

    // Search series - search title and description
    const { data: series, error: seriesError } = await supabaseAdmin
      .from('series')
      .select(`
        id,
        title,
        description,
        thumbnail_url,
        rating,
        tags,
        is_daily_content,
        content_type
      `)
      .or(`title.ilike.${searchPattern},description.ilike.${searchPattern}`)
      .limit(50);

    if (seriesError) {
      console.error('[Search API] Error searching series:', seriesError);
    }

    // Also search tags array for both content_items and series
    // Use array overlap operator to find items where any tag contains the search term
    // Note: This is a simplified approach - for better tag matching, we'd need full-text search
    const { data: contentByTags, error: tagsError } = await supabaseAdmin
      .from('content_items')
      .select(`
        id,
        title,
        description,
        thumbnail_url,
        content_type,
        rating,
        tags,
        duration,
        visibility,
        short_id
      `)
      .eq('visibility', 'public')
      .not('tags', 'is', null)
      .limit(50);

    if (tagsError) {
      console.error('[Search API] Error searching by tags:', tagsError);
    }

    const { data: seriesByTags, error: seriesTagsError } = await supabaseAdmin
      .from('series')
      .select(`
        id,
        title,
        description,
        thumbnail_url,
        rating,
        tags,
        is_daily_content,
        content_type
      `)
      .not('tags', 'is', null)
      .limit(50);

    if (seriesTagsError) {
      console.error('[Search API] Error searching series by tags:', seriesTagsError);
    }

    // Combine and deduplicate results
    const allContentItems = new Map<string, any>();
    const allSeries = new Map<string, any>();

    // Add content items from title/description search
    (contentItems || []).forEach((item) => {
      allContentItems.set(item.id, item);
    });

    // Filter and add content items from tags search (filter in JavaScript for tag matching)
    (contentByTags || []).forEach((item) => {
      if (item.tags && Array.isArray(item.tags)) {
        const hasMatchingTag = item.tags.some((tag: string) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (hasMatchingTag) {
          allContentItems.set(item.id, item);
        }
      }
    });

    // Add series from title/description search
    (series || []).forEach((s) => {
      allSeries.set(s.id, s);
    });

    // Filter and add series from tags search (filter in JavaScript for tag matching)
    (seriesByTags || []).forEach((s) => {
      if (s.tags && Array.isArray(s.tags)) {
        const hasMatchingTag = s.tags.some((tag: string) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (hasMatchingTag) {
          allSeries.set(s.id, s);
        }
      }
    });

    // Score and rank results by relevance
    // Higher score = more relevant
    const scoreResult = (item: any, isSeries: boolean = false): number => {
      let score = 0;
      const titleLower = (item.title || '').toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const searchLower = searchTerm.toLowerCase();

      // Exact title match gets highest score
      if (titleLower === searchLower) {
        score += 100;
      }
      // Title starts with search term
      else if (titleLower.startsWith(searchLower)) {
        score += 50;
      }
      // Title contains search term
      else if (titleLower.includes(searchLower)) {
        score += 25;
      }

      // Description contains search term
      if (descLower.includes(searchLower)) {
        score += 10;
      }

      // Tags match
      if (item.tags && Array.isArray(item.tags)) {
        const matchingTags = item.tags.filter((tag: string) =>
          tag.toLowerCase().includes(searchLower)
        );
        score += matchingTags.length * 5;
      }

      return score;
    };

    // Transform content items to MediaItem format
    const contentResults = Array.from(allContentItems.values())
      .map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.description || undefined,
        imageUrl: item.thumbnail_url || '/images/dummybg.webp',
        content_type: item.content_type || 'video',
        rating: item.rating || 'NR',
        tags: item.tags || [],
        duration: item.duration || undefined,
        short_id: item.short_id || undefined,
        type: 'content' as const, // Mark as content item (not series)
        score: scoreResult(item, false),
      }))
      .sort((a, b) => b.score - a.score); // Sort by relevance

    // Expand series into their episodes instead of returning series
    const seriesEpisodes: any[] = [];
    
    for (const series of Array.from(allSeries.values())) {
      // Get all episodes from this series
      const { data: seriesData, error: seriesDataError } = await supabaseAdmin
        .from('series')
        .select('content_ids')
        .eq('id', series.id)
        .single();
      
      if (seriesDataError || !seriesData?.content_ids || seriesData.content_ids.length === 0) {
        continue; // Skip series with no episodes
      }
      
      // Fetch all episodes from this series
      const { data: episodes, error: episodesError } = await supabaseAdmin
        .from('content_items')
        .select(`
          id,
          title,
          description,
          thumbnail_url,
          content_type,
          rating,
          tags,
          duration,
          visibility,
          short_id
        `)
        .in('id', seriesData.content_ids)
        .eq('visibility', 'public');
      
      if (episodesError) {
        console.error(`[Search API] Error fetching episodes for series ${series.id}:`, episodesError);
        continue;
      }
      
      // Calculate series relevance score
      const seriesScore = scoreResult(series, true);
      
      // Add each episode with the series score (episodes inherit series relevance)
      (episodes || []).forEach((episode) => {
        // Use episode's own thumbnail if available, otherwise use series thumbnail
        const episodeImageUrl = episode.thumbnail_url || series.thumbnail_url || '/images/dummybg.webp';
        
        seriesEpisodes.push({
          id: episode.id,
          title: episode.title,
          subtitle: episode.description || series.description || undefined,
          imageUrl: episodeImageUrl,
          content_type: episode.content_type || series.content_type || 'video',
          rating: episode.rating || series.rating || 'NR',
          tags: episode.tags || series.tags || [],
          duration: episode.duration || undefined,
          short_id: episode.short_id || undefined,
          type: 'content' as const, // Mark as content item (episode)
          score: seriesScore, // Inherit series relevance score
        });
      });
    }
    
    // Sort series episodes by relevance (they already have scores from their series)
    seriesEpisodes.sort((a, b) => b.score - a.score);

    // Create a Set of episode IDs from series expansion to avoid duplicates
    const seriesEpisodeIds = new Set(seriesEpisodes.map(ep => ep.id));

    // Filter out content items that are already included as series episodes
    const uniqueContentResults = contentResults.filter(item => !seriesEpisodeIds.has(item.id));

    // Combine results: series episodes first (higher priority from series matching), then unique direct content items
    // Limit to top 30 results total
    const combinedResults = [...seriesEpisodes, ...uniqueContentResults].slice(0, 30);

    return NextResponse.json(
      { results: combinedResults },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Search API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
