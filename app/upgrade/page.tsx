"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";
import Home from "../page";

export default function UpgradePage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep } = useModal();

  useEffect(() => {
    if (!userLoading) {
      if (user) {
        // Open signup modal with plans step
        setSignupModalInitialStep('plans');
        setIsSignupModalOpen(true);
      } else {
        // No user - redirect to landing
        router.push("/landing");
      }
    }
  }, [user, userLoading, router, setIsSignupModalOpen, setSignupModalInitialStep]);

  // Render homepage directly as background (like [shortId]/page.tsx pattern)
  // No router.replace('/') -- avoids flash, URL stays /upgrade while modal is open
  if (!userLoading && user) {
    return <Home />;
  }

  // Loading state while checking auth
  return null;
}
