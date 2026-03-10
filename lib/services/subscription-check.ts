import {
  getActiveSubscriptionCached,
  hasActiveSubscription,
  getUserSubscriptions,
  type UnifiedSubscription,
  type SubscriptionProvider,
} from './subscription-service';

export interface SubscriptionAccessResult {
  hasAccess: boolean;
  subscription: UnifiedSubscription | null;
  source: SubscriptionProvider | null;
}

/**
 * Main function for checking subscription access
 * Used across all endpoints for consistent subscription checking
 * Uses cached version for performance
 * 
 * NOTE: getActiveSubscription already filters expired subscriptions and handles
 * all edge cases (canceled but not expired, past_due in grace period, etc.).
 * If a subscription is returned, it's guaranteed to be active and not expired.
 * 
 * We still check status here for clarity, but the primary filtering happens in getActiveSubscription.
 */
export async function checkSubscriptionAccess(userId: string): Promise<SubscriptionAccessResult> {
  const subscription = await getActiveSubscriptionCached(userId);

  if (!subscription) {
    return {
      hasAccess: false,
      subscription: null,
      source: null,
    };
  }

  // getActiveSubscription already filtered expired subscriptions and handled edge cases
  // If we have a subscription here, it's active and not expired
  // We just need to verify the status is one that grants access
  const hasAccess = subscription.status === 'active' || 
                    subscription.status === 'trialing' ||
                    (subscription.status === 'canceled') || // Canceled but not expired (handled by getActiveSubscription)
                    (subscription.status === 'past_due'); // Past due but in grace period (handled by getActiveSubscription)

  return {
    hasAccess,
    subscription: hasAccess ? subscription : null,
    source: subscription.provider,
  };
}

// Re-export functions from subscription-service for convenience
export {
  getActiveSubscriptionCached,
  hasActiveSubscription,
  getUserSubscriptions,
  type UnifiedSubscription,
  type SubscriptionProvider,
} from './subscription-service';
