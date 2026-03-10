"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "../../contexts/user-context";
import { useModal } from "../../contexts/modal-context";
import Home from "../../page";

export default function ShortIdUpgradePage() {
  const params = useParams();
  const shortId = params.shortId as string;
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
  // No router.replace('/') -- avoids flash, URL stays /{shortId}/upgrade while modal is open
  if (!userLoading && user) {
    return <Home />;
  }

  // Loading state while checking auth
  return null;
}
