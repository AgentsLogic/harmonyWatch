import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAuth, supabaseAdmin } from '@/lib/supabase';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';

/**
 * GET /api/content/premium-check?contentId=xxx&seriesId=xxx
 * Returns premium status and access information for content
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');
    const seriesId = searchParams.get('seriesId');

    if (!contentId && !seriesId) {
      return NextResponse.json(
        { error: 'Either contentId or seriesId is required' },
        { status: 400 }
      );
    }

    // Get authenticated user (optional - can be null for logged-out users)
    const accessToken = request.cookies.get('sb-access-token')?.value;
    let user: { id: string; user_type: string; subscription?: { is_active: boolean } } | null = null;

    if (accessToken) {
      const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(accessToken);
      
      if (!authError && authUser) {
        // Fetch user profile to get user_type
        // Subscription details are read from subscriptions table only
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('user_type')
          .eq('user_id', authUser.id)
          .single();

        if (profile) {
          // Use unified service to check subscription access
          const subscriptionAccess = await checkSubscriptionAccess(authUser.id);
          const hasActiveSubscription = subscriptionAccess.hasAccess;
          
          // Sync user role if needed (will downgrade if no active subscription)
          // Only sync if user_type is subscriber but no active subscription found
          if (!hasActiveSubscription && profile.user_type === 'subscriber') {
            // Check when user was last updated to prevent race conditions
            const { data: recentUpdate } = await supabaseAdmin
              .from('user_profiles')
              .select('updated_at')
              .eq('user_id', authUser.id)
              .single();
            
            let shouldSync = true;
            if (recentUpdate?.updated_at) {
              const updatedAt = new Date(recentUpdate.updated_at);
              const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
              if (updatedAt > fiveMinutesAgo) {
                // User was recently updated - might be a new subscription, don't sync yet
                shouldSync = false;
              }
            }
            
            if (shouldSync) {
              // Import sync function
              const { syncUserRoleFromSubscriptions } = await import('@/lib/services/subscription-service');
              await syncUserRoleFromSubscriptions(authUser.id);
              // Re-fetch profile to get updated user_type
              const { data: updatedProfile } = await supabaseAdmin
                .from('user_profiles')
                .select('user_type')
                .eq('user_id', authUser.id)
                .single();
              if (updatedProfile) {
                profile.user_type = updatedProfile.user_type;
              }
            }
          }

          user = {
            id: authUser.id,
            user_type: profile.user_type,
            subscription: {
              is_active: hasActiveSubscription
            }
          };
        }
      }
    }

    // Fetch content item if contentId provided
    let contentItem: { is_free_episode: boolean } | null = null;
    if (contentId) {
      const { data } = await supabaseAdmin
        .from('content_items')
        .select('is_free_episode')
        .eq('id', contentId)
        .single();
      
      if (data) {
        contentItem = { is_free_episode: data.is_free_episode || false };
      }
    }

    // Fetch series if seriesId provided
    let series: { is_premium: boolean } | null = null;
    if (seriesId) {
      const { data } = await supabaseAdmin
        .from('series')
        .select('is_premium')
        .eq('id', seriesId)
        .single();
      
      if (data) {
        series = { is_premium: data.is_premium || false };
      }
    }

    // Determine if content is premium
    let isPremium = false;
    if (contentItem?.is_free_episode === true) {
      isPremium = false; // Free episode overrides series premium status
    } else if (series?.is_premium === true) {
      isPremium = true;
    }

    // Determine if user can access
    let canAccess = true;
    if (isPremium) {
      if (!user) {
        canAccess = false; // No user, can't access premium
      } else if (user.user_type === 'admin' || user.user_type === 'staff') {
        canAccess = true; // Admins and staff always have access
      } else {
        // Only grant access if subscription is actually active (not just user_type)
        // This ensures expired subscriptions don't grant access
        canAccess = Boolean(user.subscription?.is_active);
      }
    }

    return NextResponse.json({
      isPremium,
      canAccess,
      userType: user?.user_type || null,
      hasActiveSubscription: user?.subscription?.is_active || false
    });
  } catch (error) {
    console.error('[API] Error checking premium status:', error);
    return NextResponse.json(
      { error: 'Failed to check premium status' },
      { status: 500 }
    );
  }
}

