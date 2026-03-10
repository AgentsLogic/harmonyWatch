import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with anon key for auth operations
const supabaseAuth = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Initialize Supabase client with service role key for database operations
const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch user's recently viewed content
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from Supabase auth
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Check user profile to see if signup is complete and user has valid account
    // Pending users and users without valid account types shouldn't have recently viewed content
    const { data: userProfile, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('signup_status, user_type')
      .eq('user_id', user.id)
      .single();

    // If user is pending, profile doesn't exist, or doesn't have a valid account type, return empty array
    if (profileError || !userProfile || userProfile.signup_status === 'pending') {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Check if user has a valid account type (free, subscriber, or admin)
    // Users without a valid account type shouldn't access recently viewed content
    const hasValidAccountType = userProfile.user_type === 'free' || 
                                 userProfile.user_type === 'subscriber' || 
                                 userProfile.user_type === 'admin';
    
    if (!hasValidAccountType) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Fetch video progress records with percentage
    const { data: videoProgress, error: videoError } = await supabaseService
      .from('playback_progress')
      .select('content_id, last_updated, percentage_watched')
      .eq('user_id', user.id)
      .order('last_updated', { ascending: false })
      .limit(20);

    // If there's an error fetching video progress, log it but continue with empty array
    if (videoError) {
      console.error('Error fetching video progress:', videoError);
    }

    // Fetch audio progress records with percentage
    // Filter out completed items (is_completed = true or progress_percentage >= 95)
    const { data: audioProgress, error: audioError } = await supabaseService
      .from('user_playback_progress')
      .select('content_item_id, last_played, progress_percentage, is_completed')
      .eq('user_id', user.id)
      .eq('is_completed', false)
      .lt('progress_percentage', 95)
      .order('last_played', { ascending: false })
      .limit(20);

    // If there's an error fetching audio progress, log it but continue with empty array
    if (audioError) {
      console.error('Error fetching audio progress:', audioError);
    }

    // If both queries failed, return empty array instead of continuing
    if (videoError && audioError) {
      console.error('Both video and audio progress queries failed, returning empty array');
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Combine and deduplicate by content ID, keeping the most recent timestamp and progress
    const viewedMap = new Map<string, { contentId: string; lastViewed: string; progressPercentage: number }>();

    // Add video progress (filter out completed items >= 95%)
    if (videoProgress && Array.isArray(videoProgress)) {
      videoProgress.forEach((item) => {
        // Safety checks for required fields
        if (!item?.content_id || !item?.last_updated) return;
        
        const progressPercentage = Number(item.percentage_watched) || 0;
        // Skip completed items (shouldn't exist, but safety check)
        if (progressPercentage >= 95) return;
        
        // Safe date parsing with fallback
        let lastUpdatedDate: Date;
        try {
          lastUpdatedDate = new Date(item.last_updated);
          if (isNaN(lastUpdatedDate.getTime())) return; // Invalid date
        } catch {
          return; // Skip if date parsing fails
        }
        
        const existing = viewedMap.get(item.content_id);
        if (!existing) {
          viewedMap.set(item.content_id, {
            contentId: item.content_id,
            lastViewed: item.last_updated,
            progressPercentage: progressPercentage
          });
        } else {
          try {
            const existingDate = new Date(existing.lastViewed);
            if (!isNaN(existingDate.getTime()) && lastUpdatedDate > existingDate) {
              viewedMap.set(item.content_id, {
                contentId: item.content_id,
                lastViewed: item.last_updated,
                progressPercentage: progressPercentage
              });
            }
          } catch {
            // If date comparison fails, keep existing entry
          }
        }
      });
    }

    // Add audio progress (already filtered at DB level, but add safety check)
    if (audioProgress && Array.isArray(audioProgress)) {
      audioProgress.forEach((item) => {
        // Safety checks for required fields
        if (!item?.content_item_id || !item?.last_played) return;
        
        const progressPercentage = Number(item.progress_percentage) || 0;
        const isCompleted = item.is_completed === true;
        // Skip completed items (shouldn't exist due to DB filter, but safety check)
        if (isCompleted || progressPercentage >= 95) return;
        
        // Safe date parsing with fallback
        let lastPlayedDate: Date;
        try {
          lastPlayedDate = new Date(item.last_played);
          if (isNaN(lastPlayedDate.getTime())) return; // Invalid date
        } catch {
          return; // Skip if date parsing fails
        }
        
        const existing = viewedMap.get(item.content_item_id);
        if (!existing) {
          viewedMap.set(item.content_item_id, {
            contentId: item.content_item_id,
            lastViewed: item.last_played,
            progressPercentage: progressPercentage
          });
        } else {
          try {
            const existingDate = new Date(existing.lastViewed);
            if (!isNaN(existingDate.getTime()) && lastPlayedDate > existingDate) {
              viewedMap.set(item.content_item_id, {
                contentId: item.content_item_id,
                lastViewed: item.last_played,
                progressPercentage: progressPercentage
              });
            }
          } catch {
            // If date comparison fails, keep existing entry
          }
        }
      });
    }

    // Convert to array and sort by most recent (with safe date handling)
    const viewedItems = Array.from(viewedMap.values())
      .filter(item => {
        // Filter out items with invalid dates
        try {
          const date = new Date(item.lastViewed);
          return !isNaN(date.getTime());
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        try {
          const dateA = new Date(a.lastViewed).getTime();
          const dateB = new Date(b.lastViewed).getTime();
          if (isNaN(dateA) || isNaN(dateB)) return 0;
          return dateB - dateA;
        } catch {
          return 0;
        }
      })
      .slice(0, 20);

    if (viewedItems.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Fetch full content item details
    const contentIds = viewedItems.map(item => item.contentId).filter(id => id); // Filter out any null/undefined IDs
    
    // If no valid content IDs, return empty array
    if (contentIds.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }
    
    const { data: contentItems, error: contentError } = await supabaseService
      .from('content_items')
      .select('*')
      .in('id', contentIds);

    // If error fetching content items, return empty array instead of error (graceful degradation)
    if (contentError) {
      console.error('Error fetching content items:', contentError);
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    if (!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Fetch all series to find which series each content item belongs to
    const { data: allSeries, error: seriesError } = await supabaseService
      .from('series')
      .select('id, title, content_ids')
      .not('content_ids', 'is', null);

    // Create a map of content_id -> series_title
    const contentToSeriesMap = new Map<string, string>();
    if (allSeries && !seriesError) {
      allSeries.forEach((series) => {
        if (series.content_ids && Array.isArray(series.content_ids)) {
          series.content_ids.forEach((contentId: string) => {
            // Only set if not already set (first series wins if content is in multiple)
            if (!contentToSeriesMap.has(contentId)) {
              contentToSeriesMap.set(contentId, series.title);
            }
          });
        }
      });
    }

    // Create a map of content items by ID for quick lookup
    const contentMap = new Map();
    contentItems.forEach((item) => {
      contentMap.set(item.id, item);
    });

    // Transform to MediaItem format, preserving order from viewedItems
    const mediaItems = viewedItems
      .map((viewedItem) => {
        // Safety check for viewedItem
        if (!viewedItem?.contentId) return null;
        
        const contentItem = contentMap.get(viewedItem.contentId);
        if (!contentItem || !contentItem.id) return null;

        // Prefer mux_thumbnail_url, then stream_thumbnail_url, then thumbnail_url
        const thumbnailUrl = contentItem.mux_thumbnail_url || 
                            contentItem.stream_thumbnail_url || 
                            contentItem.thumbnail_url || 
                            '/images/content-1.png'; // Fallback to default

        // Get series title if this content belongs to a series
        const seriesTitle = contentToSeriesMap.get(contentItem.id);
        
        // Get progress percentage for this content
        const progressData = viewedMap.get(contentItem.id);
        const progressPercentage = progressData?.progressPercentage || 0;

        return {
          id: contentItem.id,
          title: contentItem.title || 'Untitled',
          subtitle: contentItem.description || undefined,
          imageUrl: thumbnailUrl,
          backgroundUrl: undefined, // content_items doesn't have banner_url
          logoUrl: undefined, // content_items doesn't have logo_url
          rating: contentItem.rating || undefined,
          tags: Array.isArray(contentItem.tags) ? contentItem.tags : undefined,
          content_type: contentItem.content_type || 'video',
          seasonEpisode: seriesTitle || undefined,
          progressPercentage: progressPercentage > 0 ? progressPercentage : undefined
        };
      })
      .filter((item) => item !== null);

    // Add caching headers for better performance
    // Cache for 2 minutes (recently viewed changes frequently)
    // But allow revalidation in background
    const headers = {
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
    };
    return NextResponse.json({ items: mediaItems }, { status: 200, headers });

  } catch (error) {
    console.error('Recently viewed GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

