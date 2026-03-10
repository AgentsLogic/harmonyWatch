"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useModal } from "@/app/contexts/modal-context";
import { useUser } from "@/app/contexts/user-context";

function SuccessPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalSuccessParams } = useModal();
  
  useEffect(() => {
    // Extract query params
    const sessionId = searchParams.get("session_id"); // Stripe Checkout session ID
    const subscriptionId = searchParams.get("subscription_id"); // RevenueCat subscription ID
    const plan = searchParams.get("plan");
    
    // If we have a Stripe session_id, verify the subscription was created and update user
    // The webhook should have already processed it, but we'll verify and refresh to be sure
    if (sessionId) {
      // Verify checkout session and update subscription status if needed
      fetch(`/api/payments/verify-checkout-session?session_id=${sessionId}`, {
        credentials: 'include',
      })
        .then((response) => {
          if (response.ok) {
            console.log('[Success Page] Checkout session verified successfully');
          } else {
            console.error('[Success Page] Failed to verify checkout session:', response.status);
          }
        })
        .catch((error) => {
          console.error('[Success Page] Error verifying checkout session:', error);
        })
        .finally(() => {
          // Refresh user data to get updated subscription status
          refreshUser().catch((error) => {
            console.error('[Success Page] Failed to refresh user data:', error);
          });
        });
    }
    
    // Set success params
    setSignupModalSuccessParams({
      sessionId: sessionId || undefined,
      subscriptionId: subscriptionId || undefined,
      plan: plan || undefined,
    });
    
    // Open signup modal with success step
    setSignupModalInitialStep('success');
    setIsSignupModalOpen(true);
  }, [searchParams, setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalSuccessParams, refreshUser]);

  return null;
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-white">
          Loading...
        </div>
      }
    >
      <SuccessPageInner />
    </Suspense>
  );
}
