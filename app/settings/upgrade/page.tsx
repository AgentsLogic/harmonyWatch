"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../contexts/user-context";
import { useModal } from "../../contexts/modal-context";
import Home from "../../page";

export default function SettingsUpgradePage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { setIsSettingsModalOpen, setIsSignupModalOpen, setSignupModalInitialStep } = useModal();

  useEffect(() => {
    if (!userLoading) {
      if (user) {
        // Store origin pathname if coming from /settings (for URL return logic)
        if (typeof window !== 'undefined') {
          const referrer = document.referrer;
          // Check if we came from /settings by checking referrer or previous pathname
          // If referrer contains /settings, or if we navigated from /settings, store it
          if (referrer.includes('/settings') || sessionStorage.getItem('settings_upgrade_origin') === '/settings') {
            sessionStorage.setItem('settings_upgrade_origin', '/settings');
          }
        }
        // Open both modals -- homepage renders behind via <Home /> below
        setIsSettingsModalOpen(true);
        setSignupModalInitialStep('plans');
        setIsSignupModalOpen(true);
      } else {
        router.push("/landing");
      }
    }
  }, [user, userLoading, router, setIsSettingsModalOpen, setIsSignupModalOpen, setSignupModalInitialStep]);

  // Render homepage directly as background (like [shortId]/page.tsx pattern)
  // No router.replace('/') -- avoids flash, URL stays /settings/upgrade while modals are open
  if (!userLoading && user) {
    return <Home />;
  }

  // Loading state while checking auth
  return null;
}
