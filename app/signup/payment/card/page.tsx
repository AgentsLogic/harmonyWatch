"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/app/contexts/user-context";

type PlanId = "monthly" | "yearly" | "free";

const pricingMap: Record<PlanId, { label: string; amount: string }> = {
  monthly: { label: "Monthly", amount: "$7.00" },
  yearly: { label: "Yearly", amount: "$70.00" },
  free: { label: "Free", amount: "$0.00" },
};

function CardPaymentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: userLoading, getSessionToken } = useUser();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasAttemptedCreation = useRef(false);
  
  const plan = (searchParams.get("plan") as PlanId | null) ?? "monthly";

  // Fetch checkout session URL and redirect to Stripe's hosted checkout page
  useEffect(() => {
    // Early returns for edge cases
    if (plan === "free") {
      router.replace("/signup/success?plan=free");
      return;
    }

    if (userLoading) {
      return; // Wait for user context
    }

    if (!user) {
      setError("You must be signed in to subscribe. Please log in and try again.");
      setIsLoading(false);
      return;
    }

    // Prevent duplicate calls - only create checkout session once
    if (hasAttemptedCreation.current || checkoutUrl) {
      return;
    }

    hasAttemptedCreation.current = true;

    async function fetchCheckoutUrl() {
      setIsLoading(true);
      setError(null);

      try {
        const sessionToken = await getSessionToken();
        
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        const body: any = { plan };

        if (sessionToken) {
          headers["Authorization"] = `Bearer ${sessionToken}`;
        } else {
          const token = await getSessionToken();
          if (token) {
            body.accessToken = token;
          }
        }

        const response = await fetch("/api/payments/create-checkout-session", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(body),
        });

        if (response.status === 401) {
          throw new Error("You must be signed in to subscribe. Please log in and try again.");
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "Unable to create checkout session." }));
          throw new Error(data.error ?? "Unable to create checkout session.");
        }

        const data = await response.json();
        if (!data.url) {
          throw new Error("Stripe did not return a checkout URL.");
        }

        setCheckoutUrl(data.url);
        // Redirect to Stripe's hosted checkout page
        window.location.href = data.url;
      } catch (error) {
        const errorMessage = (error as Error).message ?? "Something went wrong";
        setError(errorMessage);
        console.error("[Stripe] Failed to create checkout session:", error);
        // Reset the flag on error so user can retry
        hasAttemptedCreation.current = false;
        setIsLoading(false);
      }
    }

    fetchCheckoutUrl();
  }, [plan, user, userLoading, getSessionToken, router]);

  const planDetails = pricingMap[plan] ?? pricingMap.monthly;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Progress Indicator */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <span className="text-white text-sm font-serif">Step 5</span>
          <div className="flex gap-2">
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-white text-2xl font-serif text-center mb-2">
          Enter your payment details
        </h1>
        <p className="text-[#b3b3b3] text-sm text-center mb-8">
          Plan: <span className="font-semibold text-white">{planDetails.label}</span> • {planDetails.amount}
        </p>

        {/* Error Message */}
        {error && (
          <div className="bg-[#1a1a1a] border border-[#c50000] text-[#c50000] px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && !error && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mb-4"></div>
            <p className="text-[#b3b3b3]">Loading secure checkout...</p>
          </div>
        )}

        {/* Back Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => router.back()}
            className="text-white text-sm hover:text-[#c50000] transition-colors cursor-pointer"
          >
            ← Back
          </button>
        </div>

        {/* Redirecting message */}
        {checkoutUrl && !error && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mb-4"></div>
            <p className="text-[#b3b3b3]">Redirecting to secure checkout...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CardPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-white">
          Loading payment module...
        </div>
      }
    >
      <CardPaymentPageInner />
    </Suspense>
  );
}
