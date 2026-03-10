"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useRevenueCat } from "@/lib/hooks/useRevenueCat";
import { useUser } from "@/app/contexts/user-context";
import { useModal } from "@/app/contexts/modal-context";
import type { RevenueCatPackage } from "@/lib/services/revenuecat-web";
import { HarmonySpinner } from "@/app/components/harmony-spinner";

function PaymentSelectionContent() {
  const [selectedPayment, setSelectedPayment] = useState<"card" | "paypal" | "gift" | "appstore">("card");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalSuccessParams } = useModal();
  // More robust platform detection: check if native platform first, then get platform
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const platform = typeof window !== 'undefined' ? Capacitor.getPlatform() : 'web';
  const isIOS = isNative && platform === 'ios';
  const isAndroid = isNative && platform === 'android';
  
  // Initialize RevenueCat hook (iOS/Android - web uses Stripe Checkout)
  // Must be declared before useEffect that uses its values
  const { 
    offerings, 
    isLoading: isRevenueCatLoading, 
    error: revenueCatError,
    isInitialized,
    isAvailable,
    purchasePackage 
  } = useRevenueCat((isIOS || isAndroid) ? user?.id : undefined);
  
  // Debug logging for platform detection
  useEffect(() => {
    console.log('[Payment Page] Platform detection:', {
      isNative,
      platform,
      isIOS,
      isAndroid,
      isAvailable,
      isInitialized,
      hasOfferings: !!offerings
    });
  }, [isNative, platform, isIOS, isAndroid, isAvailable, isInitialized, offerings]);
  
  // Get selected plan from query params or sessionStorage
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  
  useEffect(() => {
    const planFromQuery = searchParams.get('plan') as "monthly" | "yearly" | null;
    const planFromStorage = sessionStorage.getItem('selectedPlan') as "monthly" | "yearly" | null;
    const plan = planFromQuery || planFromStorage || "monthly";
    setSelectedPlan(plan);
    if (plan) {
      sessionStorage.setItem('selectedPlan', plan);
    }
  }, [searchParams]);

  // Clear error when payment method or plan changes (user may want to try a different option)
  useEffect(() => {
    setError(null);
  }, [selectedPayment, selectedPlan]);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent multiple simultaneous purchase attempts
    if (isLoading) {
      console.warn('[Payment] Purchase already in progress, ignoring duplicate request');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Handle web credit card payments with Stripe Checkout
      if (selectedPayment === "card" && !isIOS && !isAndroid) {
        // Web users: Use Stripe Checkout
        const response = await fetch('/api/payments/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            plan: selectedPlan,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create checkout session');
        }

        const data = await response.json();
        if (data.url) {
          // Redirect to Stripe Checkout
          window.location.href = data.url;
          return;
        }

        throw new Error('Checkout session created but no URL provided');
      }

      // Handle iOS/Android App Store/Google Play payments with RevenueCat
      if (selectedPayment === "appstore" && (isIOS || isAndroid)) {
        if (!isAvailable || !isInitialized) {
          throw new Error("RevenueCat is not available or not initialized. Please try again.");
        }

        if (!offerings) {
          const errorMsg = revenueCatError 
            ? `RevenueCat error: ${revenueCatError}` 
            : "Subscription offerings are not available. Please ensure offerings are configured in RevenueCat dashboard.";
          throw new Error(errorMsg);
        }

        if (!offerings.availablePackages || offerings.availablePackages.length === 0) {
          throw new Error("No subscription packages found. Please configure packages ($rc_monthly, $rc_annual) in RevenueCat dashboard.");
        }

        // Filter out any invalid packages and log for debugging
        const validPackages = offerings.availablePackages.filter((pkg: any) => pkg && pkg.identifier);
        if (validPackages.length === 0) {
          console.error('[Payment] Invalid packages structure:', {
            totalPackages: offerings.availablePackages.length,
            packages: offerings.availablePackages.map((pkg: any) => ({
              hasPkg: !!pkg,
              identifier: pkg?.identifier,
              product: pkg?.product?.identifier,
            })),
          });
          throw new Error("No valid subscription packages found. Please check RevenueCat configuration.");
        }

        // Map plan to RevenueCat package identifier
        // Packages: "$rc_monthly" for monthly, "$rc_annual" for yearly
        const packageIdentifier = selectedPlan === "monthly" ? "$rc_monthly" : "$rc_annual";
        const packageToPurchase = validPackages.find(
          (pkg: any) => pkg.identifier === packageIdentifier
        );

        if (!packageToPurchase) {
          throw new Error(`Subscription package for ${selectedPlan} plan not found. Please contact support.`);
        }

        // Initiate purchase (RevenueCat handles App Store/Google Play subscription)
        const { customerInfo } = await purchasePackage(packageToPurchase);

        // Sync with backend immediately
        const syncResponse = await fetch('/api/payments/revenuecat-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            customerInfo: customerInfo,
            plan: selectedPlan,
          }),
        });

        if (!syncResponse.ok) {
          throw new Error('Purchase successful but failed to sync with server. Please contact support.');
        }

        // Refresh user data
        await refreshUser();

        // Open signup modal with success step
        // Note: originalAppUserId exists on the RevenueCat CustomerInfo type,
        // but our unified typing doesn't expose it, so we cast to any here.
        setSignupModalSuccessParams({
          subscriptionId: (customerInfo as any)?.originalAppUserId || undefined,
          plan: selectedPlan,
        });
        setSignupModalInitialStep('success');
        setIsSignupModalOpen(true);
        return;
      }

      // Handle invalid payment method combinations
      if (selectedPayment === "card" && (isIOS || isAndroid)) {
        throw new Error("Credit/Debit Card payments are not available on mobile devices. Please use App Store or Google Play subscription.");
      }

      if (selectedPayment === "appstore" && !isIOS && !isAndroid) {
        throw new Error("App Store/Google Play payments are only available on iOS/Android devices.");
      }

      // Handle other payment methods (paypal, gift) - not yet implemented
      if (selectedPayment === "paypal" || selectedPayment === "gift") {
        throw new Error(`${selectedPayment === "paypal" ? "PayPal" : "Gift Code"} payment method is not yet available. Please use Credit/Debit Card.`);
      }
      
      // Fallback (should not reach here)
      throw new Error("Invalid payment method selected");
    } catch (err) {
      // Log errors for debugging but don't show purchase failures to users
      // Users can simply try again or select a different payment method
      if (err instanceof Error) {
        console.error('[Payment] Error:', {
          message: err.message,
          name: err.name,
          stack: err.stack,
        });
        
        // Only show errors for critical non-purchase issues (like authentication)
        if (err.message.includes('authentication') || err.message.includes('login') || err.message.includes('401')) {
          setError(err.message);
        }
      } else if (typeof err === 'object' && err !== null) {
        const errObj = err as any;
        console.error('[Payment] Error object:', errObj);
        
        // Only show errors for critical non-purchase issues
        const errorMsg = errObj.message || errObj.error || JSON.stringify(err);
        if (errorMsg.includes('authentication') || errorMsg.includes('login') || errorMsg.includes('401')) {
          setError(errorMsg);
        }
      } else {
        console.error('[Payment] Error (unknown type):', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const paymentOptions = [
    // Credit/Debit Card option (web only - hidden on iOS/Android)
    ...(!isIOS && !isAndroid ? [{
      id: "card" as const,
      name: "Credit/Debit Card",
      selected: selectedPayment === "card",
      icon: (
        <div className="text-right">
          <div className="flex gap-1">
            {/* Visa */}
            <div className="w-8 h-5 bg-blue-600 rounded text-white text-xs flex items-center justify-center font-bold">V</div>
            {/* Mastercard */}
            <div className="w-8 h-5 bg-red-600 rounded text-white text-xs flex items-center justify-center font-bold">M</div>
            {/* Amex */}
            <div className="w-8 h-5 bg-blue-500 rounded text-white text-xs flex items-center justify-center font-bold">A</div>
            {/* Discover */}
            <div className="w-8 h-5 bg-orange-500 rounded text-white text-xs flex items-center justify-center font-bold">D</div>
          </div>
        </div>
      )
    }] : []),
    // Apple Pay / App Store subscription option (iOS only)
    ...(isIOS ? [{
      id: "appstore" as const,
      name: "Continue with Apple Pay",
      selected: selectedPayment === "appstore",
      icon: (
        <div className="w-12 h-8 bg-black rounded flex items-center justify-center">
          <svg className="w-8 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C1.79 15.25 2.18 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
        </div>
      )
    }] : []),
    // Google Play subscription option (Android only)
    ...(isAndroid ? [{
      id: "appstore" as const,
      name: "Continue with Google Play",
      selected: selectedPayment === "appstore",
      icon: (
        <div className="w-12 h-8 bg-white rounded flex items-center justify-center">
          <svg className="w-8 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L14.54,17.15L6.05,11.34L20.16,10.81M6.05,2.66L14.54,11.15L20.16,10.81L6.05,2.66Z"/>
          </svg>
        </div>
      )
    }] : []),
    {
      id: "paypal" as const,
      name: "Paypal",
      selected: selectedPayment === "paypal",
      icon: (
        <div className="w-12 h-8 bg-blue-600 rounded flex items-center justify-center">
          <span className="text-white text-xs font-bold">PP</span>
        </div>
      )
    },
    {
      id: "gift" as const,
      name: "Gift Code",
      selected: selectedPayment === "gift",
      icon: (
        <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>
      )
    }
  ];

  // Show simplified loading screen when loading secure checkout or App Store purchase
  if (isLoading && (selectedPayment === "card" || selectedPayment === "appstore")) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex items-center justify-center">
            <HarmonySpinner size={24} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-white text-sm font-serif">Step 4</span>
          <div className="flex gap-2">
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 border border-white rounded-full"></div>
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-white text-3xl font-serif text-center mb-4">
          Choose how to pay
        </h1>

        {/* Subtitle */}
        <p className="text-white text-sm text-center mb-8">
          Secured through encryption, cancel anytime.
        </p>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* RevenueCat Loading (iOS/Android) */}
        {(isIOS || isAndroid) && isAvailable && isRevenueCatLoading && !isInitialized && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg mb-6">
            Loading subscription options...
          </div>
        )}

        {/* Payment Options */}
        <div className="space-y-4 mb-8">
          {paymentOptions.map((option) => (
            <div
              key={option.id}
              onClick={() => setSelectedPayment(option.id)}
              className={`cursor-pointer transition-all duration-200 rounded-lg bg-white p-4 flex items-center justify-between ${
                option.selected ? "border-2 border-red-500" : "border border-gray-200"
              }`}
            >
              <span className="text-black font-medium">{option.name}</span>
              {option.icon}
            </div>
          ))}
        </div>

        {/* Back and Next Buttons */}
        <form onSubmit={handleNext} className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              setSignupModalInitialStep('plans');
              setIsSignupModalOpen(true);
            }}
            disabled={isLoading}
            className="px-8 py-4 border-2 border-white text-white rounded-lg font-serif font-bold text-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-red-600 text-white px-12 py-4 rounded-lg font-serif font-bold text-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <HarmonySpinner size={24} className="mr-2" />
                Processing...
              </div>
            ) : (
              "Next"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PaymentSelectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex items-center justify-center mb-4">
            <HarmonySpinner size={24} />
          </div>
          <h1 className="text-white text-2xl font-serif">Loading...</h1>
        </div>
      </div>
    }>
      <PaymentSelectionContent />
    </Suspense>
  );
}
