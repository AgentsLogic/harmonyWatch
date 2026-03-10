"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";
import { BaseModal } from "./base-modal";
import { HarmonySpinner } from "./harmony-spinner";
import { Capacitor } from "@capacitor/core";
import { useRevenueCat } from "@/lib/hooks/useRevenueCat";
import { compressImage, COMPRESSION_PRESETS } from "@/lib/utils/image-compression";
import { LinkAccountButton } from "./link-account-button";
import type { User } from "../contexts/user-context";

type Props = {
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
};

/**
 * Linked Accounts Section Component
 * Displays linked YouTube and Patreon accounts with link/unlink functionality
 */
function LinkedAccountsSection({ user, refreshUser }: { user: User | null; refreshUser: () => Promise<void> }) {
  const [linkedAccounts, setLinkedAccounts] = useState<Array<{
    id: string;
    platform: 'youtube' | 'patreon';
    external_user_id: string;
    external_username: string | null;
    external_email: string | null;
    status: string;
    linked_at: string;
    last_verified_at: string | null;
    subscription: {
      status: string;
      expires_at: string | null;
    } | null;
    metadata: any;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchLinkedAccounts();
    }
  }, [user]);

  const fetchLinkedAccounts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/linked-accounts', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setLinkedAccounts(data.linked_accounts || []);
      }
    } catch (error) {
      console.error('[Linked Accounts] Error fetching:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkChange = async () => {
    await fetchLinkedAccounts();
    await refreshUser();
  };

  const youtubeAccount = linkedAccounts.find(acc => acc.platform === 'youtube');
  const patreonAccount = linkedAccounts.find(acc => acc.platform === 'patreon');

  const getStatusBadge = (account: typeof linkedAccounts[0] | undefined) => {
    if (!account) return null;

    const subStatus = account.subscription?.status;
    const expiresAt = account.subscription?.expires_at;

    if (subStatus === 'active' || subStatus === 'trialing' || (subStatus === 'canceled' && expiresAt && new Date(expiresAt) > new Date())) {
      return (
        <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">
          Active
        </span>
      );
    }

    if (subStatus === 'past_due') {
      return (
        <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">
          Payment Issue
        </span>
      );
    }

    if (subStatus === 'expired' || (subStatus === 'canceled' && (!expiresAt || new Date(expiresAt) <= new Date()))) {
      return (
        <span className="px-2 py-1 bg-gray-600/20 text-gray-400 rounded text-xs">
          Expired
        </span>
      );
    }

    return (
      <span className="px-2 py-1 bg-gray-600/20 text-gray-400 rounded text-xs">
        Not a member
      </span>
    );
  };

  return (
    <div className="bg-[#1b1b1b] rounded-xl p-6">
      <h2 className="text-xl font-medium text-white mb-4">Linked Accounts</h2>
      <p className="text-sm text-gray-400 mb-4">
        Link your YouTube or Patreon membership to access HarmonyWatch content.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <HarmonySpinner size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* YouTube Account */}
          <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-medium">YouTube</span>
                  {getStatusBadge(youtubeAccount)}
                </div>
                {youtubeAccount && (
                  <p className="text-xs text-gray-400 truncate">
                    {youtubeAccount.external_username || youtubeAccount.external_user_id}
                  </p>
                )}
              </div>
            </div>
            <LinkAccountButton
              platform="youtube"
              isLinked={!!youtubeAccount}
              onLinkChange={handleLinkChange}
            />
          </div>

          {/* Patreon Account */}
          <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M0 0v24h24V0H0zm7.5 7.5h9v9h-9v-9z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-medium">Patreon</span>
                  {getStatusBadge(patreonAccount)}
                </div>
                {patreonAccount && (
                  <p className="text-xs text-gray-400 truncate">
                    {patreonAccount.external_username || patreonAccount.external_email || patreonAccount.external_user_id}
                  </p>
                )}
              </div>
            </div>
            <LinkAccountButton
              platform="patreon"
              isLinked={!!patreonAccount}
              onLinkChange={handleLinkChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsModal({ isOpen, onClose, isAnimatingClose = false }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showProfileSubMenu, setShowProfileSubMenu] = useState(false);
  const [showChoosePlanSubMenu, setShowChoosePlanSubMenu] = useState(false);
  const [profileFormData, setProfileFormData] = useState({
    display_name: '',
    avatar_url: '',
  });
  const [originalProfileData, setOriginalProfileData] = useState({
    display_name: '',
    avatar_url: '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user, logout, refreshUser } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setIsFooterContentModalOpen, setFooterContentKey } = useModal();

  const subscription = user?.subscription;

  // Check if this is a manually granted subscription (not paid via Stripe/Apple)
  const isManuallyGranted = subscription?.id?.startsWith('manual_') || false;
  // Check if this is a staff account
  const isStaff = user?.user_type === 'staff' || subscription?.id?.startsWith('staff_') || false;
  // Check if this is an admin account
  const isAdmin = user?.user_type === 'admin' || false;

  // Detect if user is on iOS
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const platform = Capacitor.getPlatform();
        setIsIOS(platform === 'ios');
      } catch {
        // Capacitor not available - check user agent as fallback
        setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
      }
    }
  }, []);

  // Determine subscription store type
  const subscriptionStore = subscription?.store || (isIOS ? 'app_store' : null);
  const isIOSSubscription = subscriptionStore === 'app_store';
  const isWebSubscription = subscriptionStore === 'stripe' || subscriptionStore === 'rc_billing' || subscriptionStore === 'promotional';

  // Initialize RevenueCat hook for restore purchases
  const { restorePurchases, isLoading: isRevenueCatLoading } = useRevenueCat(user?.id);

  const billingSummary = useMemo(() => {
    if (!subscription) {
      return null;
    }

    const endDate = subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "Pending";

    const isExpired = subscription.is_active === false || subscription.status === 'expired';
    const isCanceled = subscription.cancel_at_period_end === true ||
                      subscription.cancel_at !== null || 
                      subscription.canceled_at !== null ||
                      subscription.status === 'canceled';
    const willAutoRenew = subscription.cancel_at_period_end !== true;

    // Staff/Admin accounts show "Staff Account" or "Admin Account" instead of "Patron"
    const planLabel = isAdmin ? "Admin Account" : (isStaff ? "Staff Account" : "Patron");
    
    // For manual subscriptions, don't show price - just "Patron"
    // Staff/Admin accounts don't show price either
    // For paid subscriptions, show "$7/month" or "$70/year"
    const priceLabel = (isStaff || isAdmin || isManuallyGranted) 
      ? null 
      : (subscription.plan === "yearly" ? "$70/year" : subscription.plan === "monthly" ? "$7/month" : null);
    
    let statusMessage: string;
    
    // Simple logic: if subscription has a plan (monthly/yearly), it's a paid subscription
    const hasPaidPlan = subscription.plan === 'monthly' || subscription.plan === 'yearly';
    
    // Check if user is on free account
    const isFreeUser = user?.user_type === 'free';

    // Staff/Admin accounts show "Full Access"
    if (isStaff || isAdmin) {
      statusMessage = "Full Access";
    } else if (isFreeUser) {
      // Free users show "Limited Access"
      statusMessage = "Limited Access";
    } else if (isExpired) {
      statusMessage = subscription.current_period_end ? `Expired on ${endDate}` : 'Subscription expired';
    } else if (isCanceled) {
      statusMessage = `Expires ${endDate}`;
    } else if (isManuallyGranted && subscription.current_period_end) {
      // For manually granted subscriptions, show "You were gifted X days/minutes"
      const expiresAt = new Date(subscription.current_period_end);
      const now = new Date();
      const diffTime = expiresAt.getTime() - now.getTime();
      
      if (diffTime <= 0) {
        statusMessage = "Subscription expired";
      } else {
        // Calculate days, hours, and minutes
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
        
        if (diffDays > 0) {
          statusMessage = `You were gifted ${diffDays} ${diffDays === 1 ? 'day' : 'days'} of full access`;
        } else if (diffHours > 0) {
          statusMessage = `You were gifted ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} of full access`;
        } else if (diffMinutes > 0) {
          statusMessage = `You were gifted ${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} of full access`;
        } else {
          statusMessage = "You were gifted less than a minute of full access";
        }
      }
    } else if (hasPaidPlan && subscription.current_period_end) {
      // For paid subscriptions (monthly/yearly), don't show next payment date
      // Only show expiration if canceled
      if (!willAutoRenew) {
        statusMessage = `Expires ${endDate}`;
      } else {
        // Don't show "Active subscription" - return empty to hide status message
        statusMessage = "";
      }
    } else if (subscription.current_period_end) {
      // For other subscriptions (no plan), show days remaining
      const expiresAt = new Date(subscription.current_period_end);
      const now = new Date();
      const diffTime = expiresAt.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        statusMessage = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} remain`;
      } else {
        statusMessage = "Subscription expired";
      }
    } else {
      // Don't show "Active subscription" - return null to hide status message
      statusMessage = "";
    }

    return {
      planLabel,
      priceLabel,
      nextPaymentDate: endDate,
      statusMessage,
      isCanceled,
    };
  }, [subscription, isStaff, isAdmin, isManuallyGranted, user?.user_type]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  const openCustomerPortal = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);

    try {
      // Route based on subscription source
      if (isWebSubscription) {
        // Stripe subscription: Use Stripe Customer Portal
        const response = await fetch("/api/payments/create-billing-portal", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "Unable to open customer portal." }));
          const errorMessage = data.error ?? "Unable to open customer portal.";
          throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data.url) {
          window.location.href = data.url as string;
          return;
        }

        throw new Error("Customer portal URL was not provided.");
      } else if (isIOSSubscription) {
        // iOS subscription: Use RevenueCat portal or show instructions
        const managementUrl = user?.subscription?.management_url;
        if (managementUrl) {
          window.location.href = managementUrl;
          return;
        }

        const response = await fetch("/api/payments/create-revenuecat-portal", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "Unable to open customer portal." }));
          const errorMessage = data.error ?? "Unable to open customer portal.";
          
          if (data.isIOSSubscription) {
            setFeedbackMessage("iOS subscriptions must be managed through Apple Settings. Go to Settings → App Store → Subscriptions → Harmony.");
            setIsLoading(false);
            return;
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data.url) {
          window.location.href = data.url as string;
          return;
        }

        throw new Error("Customer portal URL was not provided.");
      } else {
        // No subscription or unknown type
        throw new Error("No active subscription found. Please subscribe to access the customer portal.");
      }
    } catch (error) {
      console.error('[Settings] Failed to open customer portal:', error);
      setFeedbackMessage(error instanceof Error ? error.message : "Unable to open customer portal.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    setIsLoading(true);
    setFeedbackMessage(null);

    try {
      if (action === "logout") {
        // Check if we're on the homepage (logout function will handle redirect)
        const isHomePage = typeof window !== 'undefined' && window.location.pathname === '/';
        
        await logout();
        onClose(false);
        
        // Only redirect if we're NOT on the homepage (logout function handles homepage redirect)
        if (!isHomePage) {
          router.push("/landing");
        }
        return;
      }

      if (action === "manage-ios-subscription") {
        // For iOS subscriptions, direct users to Apple's subscription management
        // RevenueCat Capacitor doesn't have showManageSubscriptions, so we provide instructions
        if (isIOS) {
          // On iOS, we can't programmatically open subscription management
          // But we can provide clear instructions
          setFeedbackMessage("To manage your subscription, go to Settings → App Store → Subscriptions → Harmony. You can cancel, change plans, or update your payment method there.");
        } else {
          // For web users with iOS subscriptions, provide instructions
          setFeedbackMessage("iOS subscriptions must be managed on an iOS device. Go to Settings → App Store → Subscriptions → Harmony.");
        }
        return;
      }

      if (action === "restore-purchases") {
        try {
          await restorePurchases();
          // Refresh user data to reflect restored purchases
          await refreshUser();
          setFeedbackMessage("Purchases restored successfully! Your subscription has been updated.");
        } catch (error) {
          console.error('[Settings] Failed to restore purchases:', error);
          const errorMessage = error instanceof Error ? error.message : "Failed to restore purchases";
          if (errorMessage.includes("cancelled") || errorMessage.includes("No purchases")) {
            setFeedbackMessage("No purchases found to restore. If you have an active subscription, it should already be active.");
          } else {
            setFeedbackMessage(errorMessage);
          }
        }
        return;
      }

      if (action === "contact-us") {
        // Open the same footer content modal that the landing page uses
        setFooterContentKey('contact_us');
        setIsFooterContentModalOpen(true);
        setIsLoading(false);
        return;
      }

      if (action === "debug-restore-subscription") {
        try {
          const response = await fetch("/api/payments/debug-restore-subscription", {
            method: "POST",
            credentials: "include",
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({ error: "Failed to check subscription." }));
            throw new Error(data.error ?? "Failed to check subscription.");
          }

          const data = await response.json();
          
          if (data.success) {
            // Refresh user data to reflect restored subscription
            await refreshUser();
            setFeedbackMessage(
              `✅ Subscription restored! Plan: ${data.subscription.plan || 'Unknown'}, ` +
              `Expires: ${data.subscription.expiresAt ? new Date(data.subscription.expiresAt).toLocaleDateString() : 'N/A'}`
            );
          } else {
            setFeedbackMessage(`❌ ${data.message || 'No active subscription found in RevenueCat.'}`);
          }
        } catch (error) {
          console.error('[Settings] Failed to debug restore subscription:', error);
          setFeedbackMessage(error instanceof Error ? error.message : "Failed to check subscription.");
        }
        return;
      }

      if (action === "cancel-membership") {
        await openCustomerPortal();
        return;
      }

      if (action === "manage-payment") {
        // Only for web subscriptions - iOS subscriptions use Apple's payment system
        if (isIOSSubscription) {
          setFeedbackMessage("Payment methods for iOS subscriptions are managed through Apple. Go to Settings → App Store → Apple ID → Payment & Shipping.");
          return;
        }

        const response = await fetch("/api/payments/create-billing-portal", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "Unable to open billing portal." }));
          const errorMessage = data.error ?? "Unable to open billing portal.";
          
          // Handle Web Billing requirement
          if (data.requiresWebBilling) {
            setFeedbackMessage("Billing portal is only available for Web Billing subscriptions. Please contact support if you believe this is an error.");
            setIsLoading(false);
            return;
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data.url) {
          window.location.href = data.url as string;
          return;
        }

        throw new Error("Billing portal URL was not provided.");
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Action: ${action}`);
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
      setFeedbackMessage(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setFeedbackMessage('Please select an image file');
      return;
    }

    setIsUploadingAvatar(true);
    setFeedbackMessage(null);

    try {
      // Compress image before upload
      const compressedFile = await compressImage(file, COMPRESSION_PRESETS.profile);
      
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('bucket', 'thumbnails');
      formData.append('path', `avatars/user-${user?.id}-${Date.now()}.${compressedFile.name.split('.').pop()}`);

      const uploadResponse = await fetch('/api/upload/thumbnail', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || 'Failed to upload avatar');
      }

      const { url } = await uploadResponse.json();
      setAvatarPreview(url);
      setProfileFormData(prev => ({ ...prev, avatar_url: url }));
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setFeedbackMessage(error instanceof Error ? error.message : 'Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);

    try {
      const updates: Promise<any>[] = [];

      // Update display name if changed
      if (profileFormData.display_name !== (user?.display_name || '')) {
        updates.push(
          fetch('/api/user/update-display-name', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ display_name: profileFormData.display_name || null }),
          })
        );
      }

      // Update avatar if changed
      if (profileFormData.avatar_url !== (user?.avatar_url || '')) {
        updates.push(
          fetch('/api/user/update-avatar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ avatar_url: profileFormData.avatar_url || null }),
          })
        );
      }

      if (updates.length === 0) {
        setFeedbackMessage('No changes to save');
        setIsLoading(false);
        return;
      }

      const results = await Promise.all(updates);
      
      // Check for errors
      for (const result of results) {
        if (!result.ok) {
          const data = await result.json().catch(() => ({ error: 'Update failed' }));
          throw new Error(data.error || 'Failed to update profile');
        }
      }

      // Refresh user data
      await refreshUser();
      
      // Update original data to match current form data (so button goes back to back arrow)
      setOriginalProfileData({
        display_name: profileFormData.display_name,
        avatar_url: profileFormData.avatar_url,
      });
      
      setFeedbackMessage('Profile updated successfully!');
      
      // Close sub-menu after a short delay
      setTimeout(() => {
        setShowProfileSubMenu(false);
      }, 1500);
    } catch (error) {
      console.error('Error saving profile:', error);
      setFeedbackMessage(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize profile form data when user data is available
  useEffect(() => {
    if (user && showProfileSubMenu) {
      const initialData = {
        display_name: user.display_name || '',
        avatar_url: user.avatar_url || '',
      };
      setProfileFormData(initialData);
      setOriginalProfileData(initialData);
      setAvatarPreview(user.avatar_url || null);
    }
  }, [user, showProfileSubMenu]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!showProfileSubMenu) return false;
    return (
      profileFormData.display_name !== originalProfileData.display_name ||
      profileFormData.avatar_url !== originalProfileData.avatar_url
    );
  }, [profileFormData, originalProfileData, showProfileSubMenu]);

  // Reset sub-menus when modal closes
  useEffect(() => {
    if (!isOpen && !isAnimatingClose) {
      setShowProfileSubMenu(false);
      setShowChoosePlanSubMenu(false);
      setAvatarPreview(null);
    }
  }, [isOpen, isAnimatingClose]);

  // Auto-fade feedback message after 5 seconds
  useEffect(() => {
    if (feedbackMessage) {
      setIsFadingOut(false);
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, 4500); // Start fade 500ms before clearing
      const clearTimer = setTimeout(() => {
        setFeedbackMessage(null);
        setIsFadingOut(false);
      }, 5000);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [feedbackMessage]);

  // Don't unmount if we're animating close - let BaseModal handle the exit animation
  if (!isOpen && !isAnimatingClose) return null;

  return (
    <BaseModal
      zIndex={110}
      backdropZIndex={109}
      isOpen={isOpen}
      onClose={onClose}
      isMobile={isMobile}
      enableDragToDismiss={true}
      showDragHandle={false}
      isAnimatingClose={isAnimatingClose}
      centerOnDesktop={true}
      maxWidth="2xl"
      fitContent={true}
      maxHeight="screen"
      className="bg-[#151515]"
    >
      {/* Header with Close button and Title */}
      <div className="relative px-6 pt-12 pb-8 sm:pt-6">
        {/* Close button - hidden when in sub-menu */}
        {!showProfileSubMenu && !showChoosePlanSubMenu && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(false);
            }}
            className="absolute top-12 left-4 sm:top-6 sm:right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Back/Save button - shown when in profile sub-menu */}
        {showProfileSubMenu && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasUnsavedChanges) {
                // Save changes
                handleSaveProfile();
              } else {
                // Go back
                setShowProfileSubMenu(false);
              }
            }}
            className="absolute top-12 left-4 sm:top-6 sm:left-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
            aria-label={showProfileSubMenu && hasUnsavedChanges ? "Save changes" : "Back to settings"}
          >
            {showProfileSubMenu && hasUnsavedChanges ? (
              // Save icon (floppy disk)
              <svg className="w-[17px] h-[17px]" fill="white" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 2H9v3h2z"/>
                <path d="M1.5 0h11.586a1.5 1.5 0 0 1 1.06.44l1.415 1.414A1.5 1.5 0 0 1 16 2.914V14.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 14.5v-13A1.5 1.5 0 0 1 1.5 0M1 1.5v13a.5.5 0 0 0 .5.5H2v-4.5A1.5 1.5 0 0 1 3.5 9h9a1.5 1.5 0 0 1 1.5 1.5V15h.5a.5.5 0 0 0 .5-.5V2.914a.5.5 0 0 0-.146-.353l-1.415-1.415A.5.5 0 0 0 13.086 1H13v4.5A1.5 1.5 0 0 1 11.5 7h-7A1.5 1.5 0 0 1 3 5.5V1H1.5a.5.5 0 0 0-.5.5m3 4a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V1H4zM3 15h10v-4.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5z"/>
              </svg>
            ) : (
              // Back arrow
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        )}

        {/* Back button - shown when in link membership sub-menu */}
        {showChoosePlanSubMenu && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowChoosePlanSubMenu(false);
            }}
            className="absolute top-12 left-4 sm:top-6 sm:left-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
            aria-label="Back to settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Title - centered horizontally, aligned vertically with close button */}
        <div className="flex items-center justify-center h-10 sm:h-10 sm:pt-0">
          <h1 className="text-[16px] font-normal text-white">
            {showProfileSubMenu ? "Edit Profile" : showChoosePlanSubMenu ? "Link Membership" : "Settings"}
          </h1>
        </div>
      </div>

          {/* Main Content */}
          <div className="px-6 pb-8">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Subscription Error - hidden when in profile sub-menu */}
              {!showProfileSubMenu && user?.subscription_error && (
                <div className="bg-yellow-900/40 border border-yellow-700 text-yellow-200 rounded-lg p-3">
                  {user.subscription_error}
                </div>
              )}

              {/* Billing Issue Warning - hidden when in profile sub-menu */}
              {!showProfileSubMenu && subscription?.has_billing_issue && subscription?.is_active && (
                <div className="bg-yellow-900/40 border border-yellow-700 text-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-200 mb-1">Payment Issue Detected</h3>
                      <p className="text-sm text-yellow-200/90 mb-2">
                        There was a problem processing your payment. Your subscription is still active, but please update your payment method to avoid interruption.
                      </p>
                      {subscription.grace_period_expires_at && (
                        <p className="text-xs text-yellow-200/70">
                          Grace period expires: {new Date(subscription.grace_period_expires_at).toLocaleDateString(undefined, {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      )}
                      {isIOSSubscription && (
                        <p className="text-xs text-yellow-200/70 mt-2">
                          To update your payment method, go to Settings → App Store → Apple ID → Payment & Shipping
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* User Profile Card - hidden when in sub-menu */}
              {!showProfileSubMenu && !showChoosePlanSubMenu && (
                <div className="bg-[#1b1b1b] rounded-xl p-6">
                  <div 
                    onClick={() => setShowProfileSubMenu(true)}
                    className="flex items-center justify-between cursor-pointer hover:bg-[#2a2a2a] rounded-lg p-2 -m-2 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0 relative">
                        {user?.avatar_url ? (
                          <>
                            <Image
                              src={user.avatar_url}
                              alt={user.display_name || "Profile"}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                // Show fallback icon
                                const parent = target.parentElement;
                                if (parent && !parent.querySelector('svg')) {
                                  parent.innerHTML = `
                                    <svg class="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                                    </svg>
                                  `;
                                }
                              }}
                            />
                            <svg className="w-8 h-8 text-gray-400 absolute inset-0 m-auto pointer-events-none" style={{ display: 'none' }} fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                            </svg>
                          </>
                        ) : (
                          <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {user?.display_name || user?.email?.split('@')[0] || 'Username Here'}
                        </p>
                        <p className="text-gray-400 text-sm">
                          {user?.email || 'Email@email.com'}
                        </p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Profile Edit Sub-Menu */}
              {showProfileSubMenu && (
                <div className="space-y-6 mb-[22px]">
                  {/* Avatar Upload Section */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0 relative">
                      {avatarPreview ? (
                        <>
                          <Image
                            src={avatarPreview}
                            alt="Profile"
                            width={96}
                            height={96}
                            className="w-full h-full object-cover"
                            unoptimized
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              // Show fallback icon
                              const parent = target.parentElement;
                              if (parent) {
                                const fallback = parent.querySelector('svg');
                                if (fallback) {
                                  fallback.style.display = 'block';
                                }
                              }
                            }}
                          />
                          <svg className="w-12 h-12 text-gray-400 absolute inset-0 m-auto pointer-events-none" style={{ display: 'none' }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                          </svg>
                        </>
                      ) : (
                        <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleAvatarFileSelect(file);
                          }
                        }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar || isLoading}
                        className="px-4 py-2 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#333333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                      >
                        {isUploadingAvatar ? 'Uploading...' : 'Change Photo'}
                      </button>
                      {avatarPreview && (
                        <button
                          onClick={() => {
                            setAvatarPreview(null);
                            setProfileFormData(prev => ({ ...prev, avatar_url: '' }));
                          }}
                          disabled={isLoading}
                          className="text-gray-400 text-xs hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Display Name Field */}
                  <div className="space-y-2">
                    <label className="text-white text-sm font-medium">Display Name</label>
                    <input
                      type="text"
                      value={profileFormData.display_name}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value.length <= 50) {
                          setProfileFormData(prev => ({ ...prev, display_name: value }));
                        }
                      }}
                      placeholder="Enter your display name"
                      maxLength={50}
                      disabled={isLoading}
                      className="w-full bg-[#1a1a1a] text-white placeholder-gray-500 rounded-lg px-4 py-3 focus:outline-none disabled:opacity-50"
                    />
                    <p className="text-gray-400 text-xs">
                      {profileFormData.display_name.length}/50 characters
                    </p>
                  </div>
                </div>
              )}

              {/* Subscription Status Card - hidden when in profile or choose plan sub-menu */}
              {!showProfileSubMenu && !showChoosePlanSubMenu && (
              <div className="bg-[#1b1b1b] rounded-xl p-6">
                {billingSummary && subscription?.is_active === true ? (
                  <div 
                    onClick={isLoading || isManuallyGranted ? undefined : openCustomerPortal}
                    className={`flex items-center justify-between py-4 px-4 rounded-lg transition-colors ${
                      isLoading ? 'opacity-50 cursor-not-allowed' : 
                      isManuallyGranted ? 'cursor-default' : 
                      'cursor-pointer hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <div>
                      <h2 className="text-2xl font-sans mb-3">
                        {billingSummary.planLabel}
                        {billingSummary.priceLabel && (
                          <span className="text-gray-400 text-base font-medium"> {billingSummary.priceLabel}</span>
                        )}
                      </h2>
                      {billingSummary.statusMessage && billingSummary.statusMessage !== "" && (
                        <p className="text-gray-300">
                          {billingSummary.statusMessage}
                        </p>
                      )}
                    </div>
                    {!isManuallyGranted && (
                      <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ) : user && user.signup_status !== 'complete' ? (
                  <div className="text-center">
                    <h2 className="text-2xl mb-3" style={{ fontFamily: 'janoSans' }}>Finish signing up</h2>
                    <p className="text-sm text-gray-400 mb-4">
                      Choose a plan to get started
                    </p>
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          sessionStorage.setItem('upgrade_origin', 'settings');
                          // Store that we came from current pathname for URL return logic
                          if (typeof window !== 'undefined') {
                            const currentPath = window.location.pathname;
                            sessionStorage.setItem('settings_upgrade_origin', currentPath);
                            // Append /upgrade to current path (e.g., /01cj7ix/settings -> /01cj7ix/settings/upgrade)
                            const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                            window.history.pushState({}, '', newPath);
                          }
                          setSignupModalInitialStep('plans');
                          setIsSignupModalOpen(true);
                        }}
                        className="w-full bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        Finish sign-up &gt;
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/auth/abort-signup', {
                              method: 'POST',
                              credentials: 'include',
                            });

                            if (response.ok) {
                              // Close modal and refresh user state
                              onClose();
                              window.location.reload();
                            } else {
                              console.error('Failed to restart signup');
                            }
                          } catch (error) {
                            console.error('Error restarting signup:', error);
                          }
                        }}
                        className="w-full bg-gray-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors cursor-pointer text-sm"
                      >
                        Restart signup
                      </button>
                    </div>
                  </div>
                ) : user?.user_type === 'free' ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl mb-0" style={{ fontFamily: 'janoSans' }}>Free Membership</h2>
                      <p className="text-sm text-gray-400">
                        Limited content access
                      </p>
                    </div>
                    <div className="text-right">
                      <button
                        onClick={() => {
                          sessionStorage.setItem('upgrade_origin', 'settings');
                          // Store that we came from current pathname for URL return logic
                          if (typeof window !== 'undefined') {
                            const currentPath = window.location.pathname;
                            sessionStorage.setItem('settings_upgrade_origin', currentPath);
                            // Append /upgrade to current path (e.g., /01cj7ix/settings -> /01cj7ix/settings/upgrade)
                            const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                            window.history.pushState({}, '', newPath);
                          }
                          setSignupModalInitialStep('plans');
                          setIsSignupModalOpen(true);
                        }}
                        className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        Upgrade
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-300">
                    <h2 className="text-2xl mb-3" style={{ fontFamily: 'janoSans' }}>No active subscription</h2>
                    <p className="text-sm">
                      Choose a plan to unlock full access to HarmonyWatch content.
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* Linked Accounts Card - only shown in choose plan sub-menu */}

              {/* Link Membership Sub-Menu */}
              {showChoosePlanSubMenu && (
                <div className="space-y-6 mb-[22px]">
                  {/* Linked Accounts Section */}
                  <LinkedAccountsSection user={user} refreshUser={refreshUser} />
                </div>
              )}

              {/* Settings Options Card - hidden when in profile or choose plan sub-menu */}
              {!showProfileSubMenu && !showChoosePlanSubMenu && (
              <div className="bg-[#1b1b1b] rounded-xl p-6">
                  {/* Main Settings Menu */}
                  <div className="space-y-2">
                    {/* iOS Subscription Management removed */}

                    {/* Restore Purchases - Show only on mobile for iOS users or users without active subscription */}
                    {isMobile && (isIOS || !subscription?.is_active) && (
                      <button
                        onClick={() => handleAction("restore-purchases")}
                        disabled={isLoading || isRevenueCatLoading}
                        className="w-full flex items-center justify-between py-4 px-4 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 focus:outline-none focus:ring-0 cursor-pointer"
                      >
                        <div className="flex flex-col items-start">
                          <span className="text-white">Restore Purchases</span>
                          <span className="text-xs text-gray-400 mt-1">Restore your subscription on this device</span>
                        </div>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    )}


                    {!subscription?.is_active && (
                      <button
                        onClick={() => {
                          sessionStorage.setItem('upgrade_origin', 'settings');
                          // Store that we came from current pathname for URL return logic
                          if (typeof window !== 'undefined') {
                            const currentPath = window.location.pathname;
                            sessionStorage.setItem('settings_upgrade_origin', currentPath);
                            // Append /upgrade to current path (e.g., /01cj7ix/settings -> /01cj7ix/settings/upgrade)
                            const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                            window.history.pushState({}, '', newPath);
                          }
                          setSignupModalInitialStep('plans');
                          setIsSignupModalOpen(true);
                          // REMOVED: onClose(false) -- keep settings open behind signup modal
                        }}
                        disabled={isLoading}
                        className="w-full flex items-center justify-between py-4 px-4 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 focus:outline-none focus:ring-0 cursor-pointer"
                      >
                        <span className="text-white">Choose a plan</span>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}

                    {/* Only show link membership button for free users without active subscriptions */}
                    {!subscription?.is_active && user?.user_type === 'free' && (
                      <button
                        onClick={() => setShowChoosePlanSubMenu(true)}
                        disabled={isLoading}
                        className="w-full flex items-center justify-between py-4 px-4 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 focus:outline-none focus:ring-0 cursor-pointer"
                      >
                        <span className="text-white">Link Patreon/Google membership</span>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}

                    <button
                      onClick={() => handleAction("contact-us")}
                      disabled={isLoading}
                      className="w-full flex items-center justify-between py-4 px-4 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 focus:outline-none focus:ring-0 cursor-pointer"
                    >
                      <span className="text-white">Contact us</span>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <button
                      onClick={() => handleAction("logout")}
                      disabled={isLoading}
                      className="w-full flex items-center justify-between py-4 px-4 rounded-lg hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 focus:outline-none focus:ring-0 cursor-pointer"
                    >
                      <span className="text-white">Logout</span>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
              </div>
              )}
            </div>
          </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none">
          <HarmonySpinner size={24} />
        </div>
      )}

      {/* Feedback Toast */}
      {feedbackMessage && !isLoading && (
        <div className={`fixed bottom-6 right-6 z-[101] transition-opacity duration-500 ${
          isFadingOut ? 'opacity-0' : 'opacity-100'
        } ${
          feedbackMessage === 'Profile updated successfully!' 
            ? '' 
            : 'bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg'
        }`}>
          {feedbackMessage === 'Profile updated successfully!' ? (
            <div className="w-12 h-12 rounded-full bg-[#1b1b1b] flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            feedbackMessage
          )}
        </div>
      )}
    </BaseModal>
  );
}

