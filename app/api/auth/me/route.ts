import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { publicConfig, serverConfig } from '@/lib/env';
import { isActiveSubscriptionStatus, planFromPriceId, assertStripeClient, epochSecondsToIso } from '@/lib/services/stripe';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';
import { syncUserRoleFromSubscriptions } from '@/lib/services/subscription-service';
import { supabaseAdmin } from '@/lib/supabase';
import type { UserSubscription } from '@/app/contexts/user-context';

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

// Helper function to set auth cookies
function setAuthCookies(response: NextResponse, accessToken: string, refreshToken?: string) {
  response.cookies.set('sb-access-token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days (matches login route)
    path: '/'
  });

  if (refreshToken) {
    response.cookies.set('sb-refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 90, // 90 days (matches login route)
      path: '/'
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get tokens from cookies
    let accessToken = request.cookies.get('sb-access-token')?.value;
    const refreshToken = request.cookies.get('sb-refresh-token')?.value;

    // If no access token but we have refresh token, try to refresh
    if (!accessToken && refreshToken) {
      try {
        const { data: { session }, error: refreshError } = await supabaseAuth.auth.refreshSession({
          refresh_token: refreshToken
        });

        if (!refreshError && session?.access_token) {
          accessToken = session.access_token;
        }
      } catch (refreshErr) {
        console.error('Token refresh error (no access token):', refreshErr);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 401 }
      );
    }

    // Set the session for this request using anon key
    let { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    let refreshedSession: { access_token: string; refresh_token?: string } | null = null;

    if (authError) {
      // Handle expired or invalid tokens gracefully
      if (authError.message?.includes('expired') || authError.code === 'bad_jwt') {
        // Try to refresh if we have refresh token
        if (refreshToken) {
          try {
            const { data: { session }, error: refreshError } = await supabaseAuth.auth.refreshSession({
              refresh_token: refreshToken
            });

            if (!refreshError && session?.access_token && session?.user) {
              // Successfully refreshed - use new tokens
              accessToken = session.access_token;
              refreshedSession = {
                access_token: session.access_token,
                refresh_token: session.refresh_token
              };
              
              // Retry getting user with new token
              const { data: { user: refreshedUser }, error: retryError } = await supabaseAuth.auth.getUser(session.access_token);
              
              if (!retryError && refreshedUser) {
                user = refreshedUser;
                authError = null;
              }
            }
          } catch (refreshErr) {
            console.error('Token refresh error:', refreshErr);
          }
        }

        // If refresh failed or no refresh token, return expired error
        if (authError) {
          const response = NextResponse.json(
            { error: 'Session expired', expired: true },
            { status: 401 }
          );
          response.cookies.delete('sb-access-token');
          if (refreshToken) {
            response.cookies.delete('sb-refresh-token');
          }
          return response;
        }
      } else {
        // Log other auth errors but don't expose details
        console.error('Auth error:', authError.message || 'Unknown auth error');
        return NextResponse.json(
          { error: 'Invalid session' },
          { status: 401 }
        );
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Get user profile with user_type and profile fields using service role
    // Subscription details are read from subscriptions table only
    console.log('[ME DEBUG v2] Step 1: Querying user_profiles for user_id:', user.id);
    const { data: profile, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('user_type, display_name, avatar_url, bio, signup_status')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('[ME DEBUG v2] Profile fetch error:', JSON.stringify(profileError));
      
      // Try raw fetch fallback to diagnose
      try {
        const rawUrl = `${publicConfig.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${user.id}&select=user_type,display_name,avatar_url,bio,signup_status`;
        const rawResponse = await fetch(rawUrl, {
          headers: {
            'Authorization': `Bearer ${serverConfig.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': serverConfig.SUPABASE_SERVICE_ROLE_KEY,
            'Accept': 'application/vnd.pgrst.object+json',
          },
        });
        const rawBody = await rawResponse.text();
        console.log('[ME DEBUG v2] Raw fetch result:', rawResponse.status, rawBody);
      } catch (rawErr) {
        console.error('[ME DEBUG v2] Raw fetch also failed:', rawErr);
      }

      // If profile doesn't exist, create a default one
      if (profileError.code === 'PGRST116') {
        console.log('Creating default profile for user:', user.id);
        const { data: newProfile, error: createError } = await supabaseService
          .from('user_profiles')
          .insert({
            user_id: user.id,
            user_type: 'free',
            display_name: user.email?.split('@')[0] || 'User',
            signup_status: 'pending',
          })
          .select('user_type, display_name, avatar_url, bio, signup_status')
          .single();

        if (createError) {
          console.error('Error creating profile:', createError);
          return NextResponse.json(
            { error: 'Failed to create user profile' },
            { status: 500 }
          );
        }

        return NextResponse.json(
          { 
            user: {
              id: user.id,
              email: user.email,
              user_type: newProfile.user_type,
              signup_status: newProfile.signup_status,
              display_name: newProfile.display_name,
              avatar_url: newProfile.avatar_url,
              bio: newProfile.bio,
              created_at: user.created_at,
              last_login: user.last_sign_in_at
            }
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    // Use unified subscription service to check subscription access
    // Management URLs are fetched on-demand via /api/payments/create-revenuecat-portal
    const subscriptionAccess = await checkSubscriptionAccess(user.id);

    // Build subscription object from unified service result
    let subscription: UserSubscription | null = null;
    
    if (subscriptionAccess.subscription) {
      const unifiedSub = subscriptionAccess.subscription;
      
      // Map unified subscription to UserSubscription format
      subscription = {
        id: `${unifiedSub.provider}_${unifiedSub.external_id}`,
        status: unifiedSub.status,
        plan: unifiedSub.plan,
        current_period_start: unifiedSub.current_period_start,
        current_period_end: unifiedSub.current_period_end,
        cancel_at: unifiedSub.cancel_at,
        canceled_at: unifiedSub.cancel_at,
        is_active: subscriptionAccess.hasAccess,
        cancel_at_period_end: unifiedSub.cancel_at !== null,
        store: unifiedSub.provider === 'stripe' ? 'stripe' as const :
               unifiedSub.provider === 'revenuecat_web' ? 'rc_billing' as const :
               unifiedSub.provider === 'revenuecat_ios' ? 'app_store' as const :
               unifiedSub.provider === 'revenuecat_android' ? 'play_store' as const :
               unifiedSub.provider === 'youtube' ? 'youtube' as const :
               unifiedSub.provider === 'patreon' ? 'patreon' as const : null,
        has_billing_issue: unifiedSub.status === 'past_due',
        grace_period_expires_at: unifiedSub.grace_period_expires_at,
      };
      
      // NOTE: management_url is now fetched on-demand via /api/payments/create-revenuecat-portal
      // We don't fetch it here to avoid unnecessary API calls on every auth check
      if (unifiedSub.provider === 'revenuecat_web' || unifiedSub.provider === 'revenuecat_ios' || unifiedSub.provider === 'revenuecat_android') {
        subscription.management_url = null; // Fetched on-demand when user clicks "Manage Subscription"
      }
    } else if (profile.user_type === 'staff') {
      // Staff users get a virtual subscription that never expires
      subscription = {
        id: `staff_${user.id}`,
        status: 'active',
        plan: 'monthly',
        current_period_start: new Date().toISOString(),
        current_period_end: null, // Never expires
        cancel_at: null,
        canceled_at: null,
        is_active: true,
        cancel_at_period_end: false,
      };
    }

    // Lightweight sync check: If user_type is 'subscriber' but subscription check shows no access,
    // downgrade user_type to 'free' (with race condition protection)
    // This handles cases where subscriptions expired but user_type wasn't updated yet
    if (profile.user_type === 'subscriber' && !subscriptionAccess.hasAccess) {
      try {
        // Check when user was last updated to prevent race conditions with webhooks
        const { data: recentUpdate } = await supabaseService
          .from('user_profiles')
          .select('updated_at')
          .eq('user_id', user.id)
          .single();
        
        let shouldDowngrade = true;
        if (recentUpdate?.updated_at) {
          const updatedAt = new Date(recentUpdate.updated_at);
          const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
          if (updatedAt > thirtySecondsAgo) {
            // User was recently updated - might be a new subscription, don't downgrade yet
            // This prevents race conditions with webhooks that are updating user_type
            // 30 seconds is enough for in-flight webhooks to commit, but not so long that
            // expired subscriptions cause delays
            shouldDowngrade = false;
          }
        }
        
        if (shouldDowngrade) {
          // Full sync: marks expired subscriptions as 'expired' in subscriptions table
          // and downgrades user_type to 'free' in user_profiles
          try {
            await syncUserRoleFromSubscriptions(user.id);
            
            // Refresh profile to get updated user_type
            const { data: updatedProfile } = await supabaseService
              .from('user_profiles')
              .select('user_type')
              .eq('user_id', user.id)
              .single();
            
            if (updatedProfile) {
              profile.user_type = updatedProfile.user_type;
            } else {
              // Fallback: assume downgrade happened
              profile.user_type = 'free';
            }
            
            // Invalidate cache so next request gets fresh data
            try {
              const { revalidateTag } = await import('next/cache');
              revalidateTag(`subscription-${user.id}`);
              revalidateTag('subscription');
            } catch (cacheError) {
              // Non-critical - cache will expire naturally
              console.warn('[Auth/me] Cache invalidation failed after sync (non-critical):', cacheError);
            }
            
            console.log('[Auth/me] ✅ Auto-synced user subscription (expired subscription detected)');
          } catch (syncError) {
            // If sync fails, fall back to lightweight downgrade
            console.error('[Auth/me] Error in full sync, attempting lightweight downgrade:', syncError);
            const { error: updateError } = await supabaseService
              .from('user_profiles')
              .update({
                user_type: 'free',
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', user.id);
            
            if (!updateError) {
              profile.user_type = 'free';
              console.log('[Auth/me] ✅ Fallback: Auto-downgraded user from subscriber to free');
            } else {
              console.error('[Auth/me] Error in fallback downgrade:', updateError);
            }
          }
        }
      } catch (syncError) {
        // Don't block the request if sync fails - just log it
        console.error('[Auth/me] Error in lightweight sync check:', syncError);
      }
    }

    // Note: All subscription status is now handled by the unified service
    // Webhooks are the source of truth for subscription status - they update the subscriptions table
    // Management URLs are fetched on-demand via /api/payments/create-revenuecat-portal

    // Create response with user data
    const response = NextResponse.json(
      { 
        user: {
          id: user.id,
          email: user.email,
          user_type: profile.user_type,
          signup_status: profile.signup_status,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          created_at: user.created_at,
          last_login: user.last_sign_in_at,
          subscription,
        }
      },
      { status: 200 }
    );

    // Update cookies if tokens were refreshed
    if (refreshedSession) {
      setAuthCookies(response, refreshedSession.access_token, refreshedSession.refresh_token);
    }

    return response;
  } catch (error) {
    // Handle network errors (like DNS resolution failures)
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error('Network error connecting to Supabase:', error.message);
        return NextResponse.json(
          { error: 'Unable to connect to authentication service' },
          { status: 503 }
        );
      }
    }
    
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
