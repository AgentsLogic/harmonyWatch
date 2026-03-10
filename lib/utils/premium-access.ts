import type { User } from '@/app/contexts/user-context';
import type { ContentItem, Series } from '@/lib/hooks/useContentItems';

/**
 * Determines if content requires premium access
 * @param contentItem - The content item (episode) to check
 * @param series - The series the content belongs to (optional)
 * @returns true if content requires premium, false otherwise
 */
export function isContentPremium(
  contentItem: ContentItem | null | undefined,
  series: Series | null | undefined
): boolean {
  // If no content item, not premium
  if (!contentItem) {
    return false;
  }

  // If episode is explicitly marked as free, it's not premium
  if (contentItem.is_free_episode === true) {
    return false;
  }

  // If series exists and is premium, content is premium (unless is_free_episode overrides)
  if (series && series.is_premium === true) {
    return true;
  }

  // Default: not premium
  return false;
}

/**
 * Determines if a user can access content
 * @param user - The user object (can be null for logged-out users)
 * @param contentItem - The content item to check access for
 * @param series - The series the content belongs to (optional)
 * @returns true if user can access, false otherwise
 */
export function canUserAccessContent(
  user: User | null | undefined,
  contentItem: ContentItem | null | undefined,
  series: Series | null | undefined
): boolean {
  // If content is not premium, anyone can access
  if (!isContentPremium(contentItem, series)) {
    return true;
  }

  // If no user, they can't access premium content
  if (!user) {
    return false;
  }

  // Admins and staff always have access
  if (user.user_type === 'admin' || user.user_type === 'staff') {
    return true;
  }

  // Check if user has active subscription
  // Subscription object is the source of truth - it's already checked for expiration
  // by the unified subscription service, so if is_active is true, subscription is valid
  let hasActiveSubscription = false;
  
  if (user.subscription) {
    // Check if subscription is marked as active
    // The subscription object from /api/auth/me already has expiration checked
    // by checkSubscriptionAccess, so is_active === true means it's valid
    const isActive = user.subscription.is_active === true;
    
    // Double-check expiration date as defensive programming
    let isNotExpired = true;
    if (user.subscription.current_period_end) {
      const expirationDate = new Date(user.subscription.current_period_end);
      const now = new Date();
      isNotExpired = expirationDate > now;
    }
    
    // Subscription is active only if both conditions are met
    hasActiveSubscription = isActive && isNotExpired;
  }
  
  // REMOVED: Unsafe fallback that granted access based on user_type alone
  // This was a security issue - user_type can be stale and doesn't check expiration
  // If subscription object is null/expired, user should NOT have access
  // The /api/auth/me endpoint will auto-downgrade user_type when it detects mismatch

  // Subscribers can access premium content
  return hasActiveSubscription;
}

/**
 * Determines if premium badge should be shown to user
 * @param user - The user object (can be null for logged-out users)
 * @param contentItem - The content item to check (optional, for episodes)
 * @param series - The series to check (optional, for series-level badges)
 * @returns true if badge should be shown, false otherwise
 */
export function shouldShowPremiumBadge(
  user: User | null | undefined,
  contentItem: ContentItem | null | undefined,
  series: Series | null | undefined
): boolean {
  // Don't show badge if user is admin, staff, or subscriber
  if (user) {
    if (user.user_type === 'admin' || user.user_type === 'staff') {
      return false;
    }
    if (user.user_type === 'subscriber' || user.subscription?.is_active) {
      return false;
    }
  }

  // Show badge if content/series is premium
  if (contentItem) {
    return isContentPremium(contentItem, series);
  }

  if (series) {
    return series.is_premium === true;
  }

  return false;
}

