import { cache } from 'react';
import { unstable_cache, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { epochSecondsToIso } from '@/lib/services/stripe';

export type SubscriptionProvider = 'stripe' | 'revenuecat_ios' | 'revenuecat_web' | 'revenuecat_android' | 'youtube' | 'patreon' | 'manual';
export type UnifiedSubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'incomplete';

export interface UnifiedSubscription {
  id: string;
  user_id: string;
  provider: SubscriptionProvider;
  external_id: string;
  status: UnifiedSubscriptionStatus;
  plan: 'monthly' | 'yearly' | null;
  current_period_start: string | null;
  current_period_end: string | null;
  expires_at: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  grace_period_expires_at: string | null;
  provider_data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertSubscriptionParams {
  user_id: string;
  provider: SubscriptionProvider;
  external_id: string;
  status: UnifiedSubscriptionStatus;
  plan?: 'monthly' | 'yearly' | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  expires_at?: string | null;
  cancel_at?: string | null;
  canceled_at?: string | null;
  grace_period_expires_at?: string | null;
  provider_data?: Record<string, any> | null;
}

/**
 * Map Stripe subscription status to unified status
 */
export function mapStripeStatus(stripeStatus: string): UnifiedSubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'expired';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'expired';
    case 'paused':
      return 'canceled';
    default:
      return 'expired';
  }
}

/**
 * Check if a unified subscription status grants access
 * Only 'active' and 'trialing' grant access
 */
export function isActiveSubscriptionStatus(status: UnifiedSubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Get provider priority for sorting (lower number = higher priority)
 * Priority: Stripe (1) > RevenueCat Web (2) > RevenueCat iOS (3) > RevenueCat Android (4) > YouTube (5) > Patreon (6) > Manual (7)
 */
function getProviderPriority(provider: SubscriptionProvider): number {
  const priorityMap: Record<SubscriptionProvider, number> = {
    stripe: 1,
    revenuecat_web: 2,
    revenuecat_ios: 3,
    revenuecat_android: 4,
    youtube: 5,
    patreon: 6,
    manual: 7,
  };
  return priorityMap[provider] ?? 999; // Unknown providers go last
}

/**
 * Get active subscription for a user with provider priority
 * Uses React.cache() for per-request deduplication
 * Provider priority: Stripe > RevenueCat Web > RevenueCat iOS > RevenueCat Android > YouTube > Patreon > Manual
 * 
 * IMPORTANT: Filters out expired subscriptions in application logic to handle:
 * - Canceled subscriptions that haven't expired yet (Stripe behavior)
 * - Past due subscriptions that are still in grace period
 * - Webhook delays that cause stale expiration dates
 */
export const getActiveSubscription = cache(async (userId: string): Promise<UnifiedSubscription | null> => {
  const now = new Date();
  
  // Fetch subscriptions with potentially active statuses
  // Include 'canceled' because Stripe subscriptions can be canceled but not yet expired
  // Include 'past_due' because they may still be in grace period
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'canceled', 'past_due'])
    .limit(10); // Get multiple to check expiration

  if (error) {
    console.error('[Subscription Service] Error fetching subscriptions:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  // Filter out expired subscriptions (application layer for clarity and correctness)
  const activeSubscriptions = data
    .filter((sub) => {
    // Determine expiration date (prefer expires_at, fallback to current_period_end)
    const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const expirationDate = expiresAt || periodEnd;
    
    // If no expiration date, use status-based logic
    if (!expirationDate) {
      // Only 'active' and 'trialing' grant access if no expiration date
      // A 'canceled' subscription with no expiration is definitely expired
      return sub.status === 'active' || sub.status === 'trialing';
    }
    
    // Check if expired
    if (expirationDate <= now) {
      return false; // Expired - don't grant access
    }
    
    // Not expired - check status
    // 'active' and 'trialing' always grant access if not expired
    if (sub.status === 'active' || sub.status === 'trialing') {
      return true;
    }
    
    // 'canceled' status: grant access if not expired (user paid until period end)
    // This handles Stripe's behavior where canceled subscriptions remain active until period_end
    if (sub.status === 'canceled' && expirationDate > now) {
      return true;
    }
    
    // 'past_due' status: grant access if not expired (grace period)
    if (sub.status === 'past_due' && expirationDate > now) {
      return true;
    }
    
    // All other statuses don't grant access
    return false;
  })
    .sort((a, b) => {
      // Sort by provider priority (lower number = higher priority)
      return getProviderPriority(a.provider as SubscriptionProvider) - getProviderPriority(b.provider as SubscriptionProvider);
    });

  // Return the highest priority active subscription
  if (activeSubscriptions.length > 0) {
    return activeSubscriptions[0] as UnifiedSubscription;
  }

  return null;
});

/**
 * Get active subscription with cross-request caching
 * Uses Next.js unstable_cache for 60-second TTL
 */
export async function getActiveSubscriptionCached(userId: string): Promise<UnifiedSubscription | null> {
  return unstable_cache(
    async (id: string) => {
      return getActiveSubscription(id);
    },
    [`subscription-${userId}`],
    {
      tags: ['subscription', `subscription-${userId}`],
      revalidate: 60, // 60 seconds
    }
  )(userId);
}

/**
 * Check if user has an active subscription
 * Note: getActiveSubscription() already filters out expired subscriptions, including canceled with future expires_at.
 * No need to re-check status here - if subscription is returned, it's valid.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const subscription = await getActiveSubscriptionCached(userId);
  return subscription !== null;
}

/**
 * Upsert a subscription record
 */
export async function upsertSubscription(params: UpsertSubscriptionParams): Promise<UnifiedSubscription> {
  const now = new Date().toISOString();

  const payload = {
    user_id: params.user_id,
    provider: params.provider,
    external_id: params.external_id,
    status: params.status,
    plan: params.plan ?? null,
    current_period_start: params.current_period_start ?? null,
    current_period_end: params.current_period_end ?? null,
    expires_at: params.expires_at ?? null,
    cancel_at: params.cancel_at ?? null,
    canceled_at: params.canceled_at ?? null,
    grace_period_expires_at: params.grace_period_expires_at ?? null,
    provider_data: params.provider_data ?? null,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payload, {
      onConflict: 'provider,external_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[Subscription Service] Error upserting subscription:', error);
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }

  // Invalidate cache immediately so next request gets fresh data
  // This ensures instant subscription activation after checkout
  try {
    revalidateTag(`subscription-${params.user_id}`);
    revalidateTag('subscription');
  } catch (cacheError) {
    // Gracefully handle if revalidateTag fails (e.g., in edge runtime or certain Next.js versions)
    // This is non-critical - cache will expire naturally after 60 seconds
    console.warn('[Subscription Service] Cache invalidation failed (non-critical):', cacheError);
  }

  return data as UnifiedSubscription;
}

/**
 * Batch upsert multiple subscription records in a single DB call.
 * Use for bulk operations (cron jobs) to avoid N+1 queries.
 * Invalidates caches for all affected users after the write.
 */
export async function batchUpsertSubscriptions(paramsList: UpsertSubscriptionParams[]): Promise<void> {
  if (paramsList.length === 0) return;

  const now = new Date().toISOString();
  const payloads = paramsList.map((params) => ({
    user_id: params.user_id,
    provider: params.provider,
    external_id: params.external_id,
    status: params.status,
    plan: params.plan ?? null,
    current_period_start: params.current_period_start ?? null,
    current_period_end: params.current_period_end ?? null,
    expires_at: params.expires_at ?? null,
    cancel_at: params.cancel_at ?? null,
    canceled_at: params.canceled_at ?? null,
    grace_period_expires_at: params.grace_period_expires_at ?? null,
    provider_data: params.provider_data ?? null,
    updated_at: now,
  }));

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payloads, { onConflict: 'provider,external_id', ignoreDuplicates: false });

  if (error) {
    console.error('[Subscription Service] Error batch upserting subscriptions:', error);
    throw new Error(`Failed to batch upsert subscriptions: ${error.message}`);
  }

  // Invalidate caches for all affected users
  const userIds = [...new Set(paramsList.map((p) => p.user_id))];
  try {
    revalidateTag('subscription');
    for (const userId of userIds) {
      revalidateTag(`subscription-${userId}`);
    }
  } catch (cacheError) {
    console.warn('[Subscription Service] Cache invalidation failed (non-critical):', cacheError);
  }
}

/**
 * Delete a subscription by provider and external_id
 */
export async function deleteSubscription(
  provider: SubscriptionProvider,
  externalId: string
): Promise<void> {
  // Get user_id before deleting so we can invalidate cache
  const { data: subscriptionToDelete } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .delete()
    .eq('provider', provider)
    .eq('external_id', externalId);

  if (error) {
    console.error('[Subscription Service] Error deleting subscription:', error);
    throw new Error(`Failed to delete subscription: ${error.message}`);
  }

  // Invalidate cache after deletion
  if (subscriptionToDelete?.user_id) {
    try {
      revalidateTag(`subscription-${subscriptionToDelete.user_id}`);
      revalidateTag('subscription');
    } catch (cacheError) {
      console.warn('[Subscription Service] Cache invalidation failed after delete (non-critical):', cacheError);
    }
  }
}

/**
 * Get all subscriptions for a user
 */
export async function getUserSubscriptions(userId: string): Promise<UnifiedSubscription[]> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Subscription Service] Error fetching user subscriptions:', error);
    return [];
  }

  return (data || []) as UnifiedSubscription[];
}

/**
 * Sync user role based on active subscriptions
 * This is the single function that updates user_type in user_profiles
 * Provider priority: Stripe > RevenueCat Web > RevenueCat iOS > RevenueCat Android > YouTube > Patreon > Manual
 */
export async function syncUserRoleFromSubscriptions(userId: string): Promise<void> {
  // Query subscriptions directly (bypass cache) to ensure we get the latest data
  // This is critical when syncing immediately after creating/updating a subscription
  const now = new Date();
  
  const { data: subscriptions, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'canceled', 'past_due'])
    .limit(10);

  // Filter out expired subscriptions (same logic as getActiveSubscription)
  let activeSubscriptions: any[] = [];
  let activeSubscription: UnifiedSubscription | null = null;
  let hasActiveSubscription = false;

  if (subError) {
    console.error('[Subscription Service] Error fetching subscriptions for sync:', subError);
    // Fall back to cached version if direct query fails
    activeSubscription = await getActiveSubscription(userId);
    // getActiveSubscription() already filters out expired subscriptions, including canceled with future expires_at
    // No need to re-check status - if subscription is returned, it's valid
    hasActiveSubscription = activeSubscription !== null;
  } else {
    // Filter subscriptions to find active ones
    activeSubscriptions = (subscriptions || [])
      .filter((sub) => {
    const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const expirationDate = expiresAt || periodEnd;
    
    if (!expirationDate) {
      return sub.status === 'active' || sub.status === 'trialing';
    }
    
    if (expirationDate <= now) {
      return false;
    }
    
    if (sub.status === 'active' || sub.status === 'trialing') {
      return true;
    }
    
    if (sub.status === 'canceled' && expirationDate > now) {
      return true;
    }
    
    if (sub.status === 'past_due' && expirationDate > now) {
      return true;
    }
    
      return false;
    })
      .sort((a, b) => {
        // Sort by provider priority (lower number = higher priority)
        return getProviderPriority(a.provider as SubscriptionProvider) - getProviderPriority(b.provider as SubscriptionProvider);
      });

    // Get the highest priority active subscription
    activeSubscription = activeSubscriptions.length > 0 ? activeSubscriptions[0] as UnifiedSubscription : null;
    // Filter already validated canceled+future expires_at subscriptions as active
    // No need to re-check status - if subscription passes filter, it's valid
    hasActiveSubscription = activeSubscription !== null;
  }

  // Get current profile to preserve signup_status
  const { data: currentProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('signup_status, user_type')
    .eq('user_id', userId)
    .maybeSingle();

  // Determine new user_type
  const newUserType = hasActiveSubscription ? 'subscriber' : 'free';

  // If downgrading to free, mark expired manual subscriptions as 'expired' in subscriptions table
  if (!hasActiveSubscription) {
    // Find all manual subscriptions that are expired but still marked as 'active'
    const { data: expiredManualSubs } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'manual')
      .eq('status', 'active');

    if (expiredManualSubs && expiredManualSubs.length > 0) {
      // Check each subscription to see if it's actually expired
      const expiredSubs = expiredManualSubs.filter((sub) => {
        const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
        const expirationDate = expiresAt || periodEnd;
        
        return expirationDate && expirationDate <= now;
      });

      // Update expired manual subscriptions to 'expired' status
      if (expiredSubs.length > 0) {
        const expiredSubIds = expiredSubs.map((sub) => sub.id);
        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update({ 
            status: 'expired',
            updated_at: new Date().toISOString()
          })
          .in('id', expiredSubIds);

        if (updateError) {
          console.error('[Subscription Service] Error updating expired subscriptions:', updateError);
          // Don't throw - this is non-critical, user role update is more important
        } else {
          console.log(`[Subscription Service] Marked ${expiredSubs.length} expired manual subscription(s) as 'expired'`);
        }
      }
    }
  }

  // Preserve signup_status if user has already completed signup
  // Only update signup_status to 'complete' if becoming a subscriber, never downgrade to 'pending'
  const signupStatus = hasActiveSubscription
    ? 'complete'
    : currentProfile?.signup_status === 'complete'
    ? 'complete'
    : 'pending';

  // Update user profile - only write user_type and signup_status
  // Subscription details (plan, dates, expiry) are stored in subscriptions table only
  const updateData: any = {
    user_type: newUserType,
    signup_status: signupStatus,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update(updateData)
    .eq('user_id', userId);

  if (error) {
    console.error('[Subscription Service] Error syncing user role:', error);
    throw new Error(`Failed to sync user role: ${error.message}`);
  }
}
