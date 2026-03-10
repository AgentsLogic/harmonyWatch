"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useUser } from "../contexts/user-context";
import { useRevenueCat } from "@/lib/hooks/useRevenueCat";
import { useModal } from "../contexts/modal-context";
import { BaseModal } from "./base-modal";
import { motion } from "framer-motion";
import { OrbitProgress } from "react-loading-indicators";
import { HarmonySpinner } from "./harmony-spinner";
import { nativeAppleSignIn } from "@/lib/utils/native-apple-signin";

type SignupStep = 'email' | 'password' | 'plans' | 'success';

type Props = {
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
  initialStep?: SignupStep | null;
  initialEmail?: string | null;
  successParams?: { sessionId?: string; subscriptionId?: string; plan?: string } | null;
};

export function SignupModal({ 
  isOpen, 
  onClose, 
  isAnimatingClose = false,
  initialStep = null,
  initialEmail = null,
  successParams = null
}: Props) {
  const [currentStep, setCurrentStep] = useState<SignupStep>('email');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"free" | "monthly" | "yearly">("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"verifying" | "verified" | "failed">("verifying");
  const [isAppleSignInLoading, setIsAppleSignInLoading] = useState(false);
  const [errorOpacity, setErrorOpacity] = useState(1);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<typeof user>(null);
  const router = useRouter();
  const { user, register, refreshUser, isLoading: userLoading, hasPlan } = useUser();
  
  // Keep userRef in sync with latest user value
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const { setIsLoginModalOpen, setLoginModalRedirectTo, isVideoModalOpen } = useModal();
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
    if (isOpen && currentStep === 'plans') {
      console.log('[Signup Modal] Platform detection:', {
        isNative,
        platform,
        isIOS,
        isAndroid,
        isAvailable,
        isInitialized,
        hasOfferings: !!offerings
      });
    }
  }, [isOpen, currentStep, isNative, platform, isIOS, isAndroid, isAvailable, isInitialized, offerings]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize step from props
  useEffect(() => {
    if (initialStep) {
      setCurrentStep(initialStep);
    }
  }, [initialStep]);

  // Initialize email from props or user context
  useEffect(() => {
    if (isOpen) {
      if (initialEmail) {
        setEmail(initialEmail);
      } else {
        // For pending users, try to get email from user context first
        if (user?.email && user?.signup_status === 'pending') {
          setEmail(user.email);
          // Also save to sessionStorage for consistency
          sessionStorage.setItem('signup_email', user.email);
        } else {
          // Restore from sessionStorage
          const storedEmail = sessionStorage.getItem('signup_email');
          if (storedEmail) {
            setEmail(storedEmail);
          }
        }
      }
    }
  }, [initialEmail, user, isOpen]);

  // Restore password from sessionStorage
  useEffect(() => {
    const storedPassword = sessionStorage.getItem('signup_password');
    if (storedPassword) {
      setPassword(storedPassword);
    }
  }, []);

  // Handle success step verification
  useEffect(() => {
    if (currentStep === 'success') {
      async function verifyPayment() {
        const sessionId = successParams?.sessionId;
        const subscriptionId = successParams?.subscriptionId;
        
        if (!sessionId && !subscriptionId) {
          setVerificationStatus("verified");
          return;
        }

        if (subscriptionId) {
          setVerificationStatus("verified");
          return;
        }

        if (sessionId) {
          try {
            const response = await fetch(`/api/payments/verify-checkout-session?session_id=${sessionId}`);
            
            if (!response.ok) {
              console.error("Failed to verify checkout session");
              setVerificationStatus("failed");
              return;
            }

            const data = await response.json();
            
            if (data.status === "complete" && data.paymentStatus === "paid") {
              setVerificationStatus("verified");
            } else {
              console.error("Session not complete or payment not paid:", data);
              setVerificationStatus("failed");
            }
          } catch (error) {
            console.error("Error verifying checkout session:", error);
            setVerificationStatus("failed");
          }
        }
      }

      verifyPayment();
    }
  }, [currentStep, successParams]);

  // Refresh user data after payment verification
  useEffect(() => {
    if (currentStep === 'success' && verificationStatus === "verified") {
      refreshUser();
    }
  }, [currentStep, verificationStatus, refreshUser]);

  // Reset selected plan to monthly if free user on desktop (since free option is hidden)
  // But only if signup is complete - during signup, allow free plan selection
  useEffect(() => {
    if (user && user.user_type === 'free' && user.signup_status === 'complete' && !isMobile && selectedPlan === 'free') {
      setSelectedPlan('monthly');
    }
  }, [user, isMobile, selectedPlan]);

  // Auto-redirect after success
  // Only redirect if we're not currently loading (purchase in progress)
  useEffect(() => {
    if (currentStep === 'success' && verificationStatus === "verified" && !isLoading) {
      const timer = setTimeout(() => {
        // Check if user has a plan OR is a free user (free users should have access)
        const userHasAccess = hasPlan || user?.user_type === 'free' || user?.user_type === 'subscriber' || user?.user_type === 'admin';
        
        if (userHasAccess) {
          onClose(false);
          // Use window.location.href for Capacitor (more reliable than router.push)
          // Check if we're in a Capacitor environment
          const isCapacitor = typeof window !== 'undefined' && Capacitor.isNativePlatform();
          if (isCapacitor) {
            window.location.href = "/";
          } else {
            router.push("/");
          }
        } else {
          setCurrentStep('plans');
        }
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [currentStep, verificationStatus, hasPlan, user?.user_type, isLoading, onClose, router]);

  // Redirect to login if user is not authenticated on plans step
  // Add a delay and refresh to allow user context to sync after Apple Sign-In
  useEffect(() => {
    if (currentStep === 'plans' && !userLoading && !user) {
      // First, try refreshing the user context (in case session exists but context not updated)
      refreshUser();
      
      // Wait longer and check the ref (which has the latest value) instead of closure
      const timer = setTimeout(() => {
        // Check the ref for the most current user value
        if (!userRef.current) {
          setLoginModalRedirectTo('/signup/plans');
          setIsLoginModalOpen(true);
          onClose(false);
        }
      }, 1500); // Increased delay to allow refresh to complete
      return () => clearTimeout(timer);
    }
  }, [currentStep, user, userLoading, onClose, setLoginModalRedirectTo, setIsLoginModalOpen, refreshUser]);

  // Clear error when plan selection changes
  useEffect(() => {
    if (currentStep === 'plans') {
      setError("");
    }
  }, [selectedPlan, currentStep]);

  // Auto-focus removed - keyboard will only open when user taps input field

  // Auto-clear error message after 3 seconds (fade out)
  useEffect(() => {
    if (error) {
      // Reset opacity when new error appears
      setErrorOpacity(1);
      
      // Start fade out after 2 seconds
      const fadeTimer = setTimeout(() => {
        setErrorOpacity(0);
      }, 2000);
      
      // Clear error after fade completes
      const clearTimer = setTimeout(() => {
        setError('');
        setErrorOpacity(1);
      }, 3000);
      
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [error]);

  const handleEmailStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!email) {
      setError("Please enter your email");
      return;
    }
    
    // Save email and move to password step
    sessionStorage.setItem('signup_email', email);
    setCurrentStep('password');
  };

  const handlePasswordStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    try {
      if (!password) {
        setError("Please enter a password");
        setIsLoading(false);
        return;
      }
      
      sessionStorage.setItem('signup_email', email);
      sessionStorage.setItem('signup_password', password);
      
      // Check if user is already logged in and pending
      // If so, update their password instead of creating a new account
      if (user && user.signup_status === 'pending' && user.email === email) {
        // User is pending - update password instead of registering
        const response = await fetch('/api/auth/update-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok && data.success && data.user) {
          // Password updated successfully, refresh user data
          // The session is already set via cookies from the API response
          await refreshUser();
          setCurrentStep('plans');
        } else {
          setError(data.error || "Failed to update password");
        }
      } else {
        // Try to register - the register API will handle pending users by updating password
        const result = await register(email, password, 'free');
        
        if (result.success) {
          setCurrentStep('plans');
        } else {
          // If registration fails with "already exists", it might be a pending user
          // The register API should handle this, but if it doesn't, try update-password as fallback
          if (result.error?.includes('already exists')) {
            const response = await fetch('/api/auth/update-password', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({ email, password }),
            });

            const updateData = await response.json();

            if (response.ok && updateData.success && updateData.user) {
              // Password updated successfully, refresh user data
              await refreshUser();
              setCurrentStep('plans');
            } else {
              setError(updateData.error || "Failed to update password");
            }
          } else {
            setError(result.error || "Registration failed");
          }
        }
      }
    } catch (error) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignUp = async () => {
    try {
      // On native iOS, use native Apple Sign In (modal popup)
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        setIsAppleSignInLoading(true);
        try {
          // Pass true for isSignupFlow since we're going to payment page
          console.log('[Signup Modal] Starting native Apple Sign In...');
          const result = await nativeAppleSignIn(true);
          console.log('[Signup Modal] Native Apple Sign In result:', result);
        
          if (result.success) {
            // Refresh user data
            await refreshUser();
            // Reset loading state before navigation
            setIsAppleSignInLoading(false);
            // Close modal and redirect to plan selection page
            onClose(false);
            router.push('/signup/plans');
            return;
          } else {
            console.error('[Signup Modal] Apple Sign In failed:', result.error);
            setIsAppleSignInLoading(false);
            
            // Check if user cancelled (error 1001 or contains "cancel")
            const isCancelled = result.error?.includes('1001') || 
                              result.error?.toLowerCase().includes('cancel') ||
                              result.error?.toLowerCase().includes('cancelled');
            
            if (isCancelled) {
              // Show user-friendly cancellation message
              setError('Canceled');
            } else {
              // Show generic error for other failures
              setError('Apple Sign In failed. Please try again.');
            }
            // If cancelled, just reset loading state and don't redirect
            return;
          }
        } catch (nativeError: any) {
          console.error('[Signup Modal] Error in native Apple Sign In:', nativeError);
          setIsAppleSignInLoading(false);
          
          // Check if user cancelled (error 1001 or contains "cancel")
          const isCancelled = nativeError.message?.includes('1001') || 
                             nativeError.message?.toLowerCase().includes('cancel') ||
                             nativeError.message?.toLowerCase().includes('cancelled');
          
          if (isCancelled) {
            // Show user-friendly cancellation message
            setError('Canceled');
          } else {
            // Show generic error for other failures
            setError(nativeError.message || 'Apple Sign In failed. Please try again.');
          }
          return;
        }
      } else {
        // On web, use standard OAuth redirect
        window.location.href = '/api/auth/apple?next=/signup/payment';
      }
    } catch (error) {
      console.error('Error initiating Apple Sign In:', error);
      setIsAppleSignInLoading(false);
      // Fallback to web OAuth
      window.location.href = '/api/auth/apple?next=/signup/payment';
    }
  };

  const handlePlansStep = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLoading) {
      console.warn('[Plan Selection] Purchase already in progress, ignoring duplicate request');
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      // For free plan, update user type immediately (no payment needed)
      if (selectedPlan === "free") {
        const response = await fetch('/api/auth/update-user-type', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ userType: "free" }),
        });

        if (!response.ok) {
          const data = await response.json();
          
          if (response.status === 401) {
            setLoginModalRedirectTo('/signup/plans');
            setIsLoginModalOpen(true);
            onClose(false);
            return;
          }
          
          throw new Error(data.error || "Failed to update plan");
        }

        await refreshUser();
        
        // For free users, set verification status immediately since no payment verification is needed
        setVerificationStatus("verified");
        setCurrentStep('success');
        return;
      }
      
      // For paid plans (monthly/yearly), route based on platform
      if (selectedPlan === "monthly" || selectedPlan === "yearly") {
        // Debug logging for platform routing
        console.log('[Signup Modal] Plan selection routing:', {
          selectedPlan,
          isNative,
          platform,
          isIOS,
          isAndroid,
          willGoToStripe: !isIOS && !isAndroid,
          willUseRevenueCat: isIOS || isAndroid
        });
        
        // Web users: Go directly to Stripe Checkout
        if (!isIOS && !isAndroid) {
          try {
            // Read and clear the upgrade origin
            const upgradeOrigin = sessionStorage.getItem('upgrade_origin');
            sessionStorage.removeItem('upgrade_origin'); // Clean up
            
            // Create Stripe Checkout session
            const response = await fetch('/api/payments/create-checkout-session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                plan: selectedPlan,
                return_to: upgradeOrigin || 'signup',
              }),
            });

            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || 'Failed to create checkout session');
            }

            const data = await response.json();
            if (data.url) {
              // Redirect directly to Stripe Checkout
              window.location.href = data.url;
              return;
            }

            throw new Error('Checkout session created but no URL provided');
          } catch (error) {
            console.error('[Signup Modal] Failed to create Stripe Checkout session:', error);
            setError(error instanceof Error ? error.message : 'Failed to start checkout. Please try again.');
            setIsLoading(false);
            return;
          }
        }

        // iOS/Android users: Use RevenueCat (App Store/Google Play subscriptions)
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

        const validPackages = offerings.availablePackages.filter((pkg: any) => pkg && pkg.identifier);
        if (validPackages.length === 0) {
          throw new Error("No valid subscription packages found. Please check RevenueCat configuration.");
        }

        const packageIdentifier = selectedPlan === "monthly" ? "$rc_monthly" : "$rc_annual";
        const packageToPurchase = validPackages.find(
          (pkg: any) => pkg.identifier === packageIdentifier
        );

        if (!packageToPurchase) {
          throw new Error(`Subscription package for ${selectedPlan} plan not found. Please contact support.`);
        }

        // Purchase package - this will show the Apple subscription dialog on iOS
        // The function will wait for the user to complete or cancel the purchase
        const { customerInfo } = await purchasePackage(packageToPurchase);

        // Only proceed if purchase was successful (if cancelled, purchasePackage will throw)
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

        // Refresh user data to get updated subscription status
        await refreshUser();
        
        // Set verification status and move to success step
        setVerificationStatus("verified");
        setCurrentStep('success');
        return;
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error('[Plan Selection] Error:', {
          message: err.message,
          name: err.name,
          stack: err.stack,
        });
        
        // Handle purchase cancellation gracefully - don't show error, just stay on plans page
        if (err.message.includes('cancelled') || err.message.includes('canceled') || err.message.includes('Purchase was cancelled')) {
          setError(""); // Clear any previous errors
          // Stay on plans step - don't redirect
          setIsLoading(false);
          return;
        }
        
        if (err.message.includes('authentication') || err.message.includes('login') || err.message.includes('401')) {
          setError(err.message);
        } else {
          // Show error for other purchase failures
          setError(err.message || 'Failed to complete purchase. Please try again.');
        }
      } else if (typeof err === 'object' && err !== null) {
        const errObj = err as any;
        console.error('[Plan Selection] Error object:', errObj);
        
        const errorMsg = errObj.message || errObj.error || JSON.stringify(err);
        
        // Handle purchase cancellation gracefully
        if (errorMsg.includes('cancelled') || errorMsg.includes('canceled') || errorMsg.includes('Purchase was cancelled')) {
          setError(""); // Clear any previous errors
          // Stay on plans step - don't redirect
          setIsLoading(false);
          return;
        }
        
        if (errorMsg.includes('authentication') || errorMsg.includes('login') || errorMsg.includes('401')) {
          setError(errorMsg);
        } else {
          setError(errorMsg || 'Failed to complete purchase. Please try again.');
        }
      } else {
        console.error('[Plan Selection] Error (unknown type):', err);
        setError('Failed to complete purchase. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccessNext = () => {
    if (hasPlan) {
      onClose(false);
      router.push("/");
    } else {
      setCurrentStep('plans');
    }
  };

  const plans = [
    {
      id: "monthly" as const,
      name: "Monthly",
      price: "$7/mo",
      selected: selectedPlan === "monthly",
    },
    {
      id: "yearly" as const,
      name: "Yearly",
      price: "$80/year",
      selected: selectedPlan === "yearly",
    },
    {
      id: "free" as const,
      name: "Free limited account",
      price: "",
      selected: selectedPlan === "free",
    }
  ];

  // Don't unmount if we're animating close
  if (!isOpen && !isAnimatingClose) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isMobile={isMobile}
      enableDragToDismiss={true}
      showDragHandle={false}
      isAnimatingClose={isAnimatingClose}
      centerOnDesktop={true}
      maxWidth="4xl"
      fitContent={true}
      minHeight={currentStep === 'plans' ? undefined : "5xl"}
      zIndex={111}
      backdropZIndex={110}
      maxHeight={currentStep === 'plans' ? undefined : "5xl"}
      backgroundImage={(currentStep === 'plans' || currentStep === 'success') ? (isMobile ? '/images/Plan%20Page.jpg' : '/images/Plan-Page-desktop.jpg') : undefined}
      backgroundImagePosition={(currentStep === 'plans' || currentStep === 'success') ? 'top center' : undefined}
      backdropClassName="bg-black/60"
    >
      {/* Close button - Always show X button in top-left */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose(false);
        }}
        className="absolute top-12 left-4 sm:top-6 sm:right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
        aria-label="Close"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Step 1: Email */}
      {currentStep === 'email' && (
        <div className="min-h-screen sm:min-h-0 sm:h-full flex items-center justify-center px-6 py-24 sm:py-8">
          <motion.div 
            className="w-full max-w-md mx-auto -translate-y-[100px] sm:translate-y-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {/* Title */}
            <h1 className="text-white text-2xl font-medium text-center mb-8">
              Enter your email
            </h1>

            {/* Form */}
            <form onSubmit={handleEmailStep} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div 
                  className="text-gray-400 text-sm text-center transition-opacity duration-1000 ease-out"
                  style={{ opacity: errorOpacity }}
                >
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div>
                <input
                  ref={emailInputRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Next Button */}
              <button
                type="submit"
                disabled={!email}
                className="w-full bg-red-600 text-white py-3 rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </form>

            {/* Apple Sign In Button (iOS Only) */}
            {isIOS && (
              <>
                {/* Divider with "or" */}
                <div className="flex items-center my-4">
                  <div className="flex-1 border-t border-gray-600"></div>
                  <span className="px-4 text-gray-400 text-sm">or</span>
                  <div className="flex-1 border-t border-gray-600"></div>
                </div>
                <button
                  type="button"
                  onClick={handleAppleSignUp}
                  disabled={isAppleSignInLoading}
                  className="w-full bg-black text-white py-3 rounded-full font-medium hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
                >
                {isAppleSignInLoading ? (
                  <div className="flex items-center">
                    <HarmonySpinner size={24} className="mr-2" />
                    Signing in...
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    Continue with Apple
                  </>
                )}
              </button>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* Step 2: Password */}
      {currentStep === 'password' && (
        <div className="min-h-screen sm:min-h-0 sm:h-full flex items-center justify-center px-6 py-24 sm:py-8">
          <motion.div 
            className="w-full max-w-md mx-auto -translate-y-[100px] sm:translate-y-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {/* Title */}
            <h1 className="text-white text-2xl font-medium text-center mb-8">
              Create a password
            </h1>

            {/* Form */}
            <form onSubmit={handlePasswordStep} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Password Field */}
              <div>
                <input
                  ref={passwordInputRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Next Button */}
              <button
                type="submit"
                disabled={isLoading || !password}
                className="w-full bg-red-600 text-white py-3 rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <HarmonySpinner size={24} className="mr-2" />
                    Loading...
                  </div>
                ) : (
                  "Next"
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Step 3: Plans */}
      {currentStep === 'plans' && (
        <div 
          className="min-h-screen sm:min-h-0 flex flex-col items-center justify-center px-6 pt-8 sm:pt-8 pb-0 relative"
        >
          {/* Dark Overlay for text readability - reduced opacity to show background */}
          <div className="absolute inset-0 bg-black/30 z-0"></div>
          
          {userLoading ? (
            <div className="flex items-center justify-center min-h-[400px] relative z-10">
              <div className="w-full max-w-md text-center">
                <div className="flex items-center justify-center mb-4">
                  <HarmonySpinner size={24} />
                </div>
                <h1 className="text-white text-2xl font-serif">Loading...</h1>
              </div>
            </div>
          ) : isLoading && (selectedPlan === "monthly" || selectedPlan === "yearly") ? (
            <div className="flex items-center justify-center min-h-[400px] relative z-10">
              <div className="w-full max-w-md text-center">
                <div className="flex items-center justify-center">
                  <HarmonySpinner size={24} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Content with Sticky Button */}
              <div 
                className="flex-1 z-10 flex items-center justify-center sm:mt-[9px]"
                style={{
                  marginBottom: '0px',
                  position: 'static',
                  gap: '0px',
                  boxSizing: 'content-box',
                  paddingBottom: '0px',
                }}
              >
                <motion.div 
                  className="w-full max-w-md mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  {/* Logo */}
                  <div className="flex justify-center mb-[5px]">
                    <img 
                      src="/images/harmony-white-logo.png" 
                      alt="Harmony logo" 
                      className="h-[115px] w-[115px]"
                      style={{ width: '115px', height: '115px' }}
                    />
                  </div>

                  {/* Title */}
                  <h1 className="text-white text-[25px] font-medium text-center mb-2" style={{ fontFamily: 'janoSans', fontSize: '25px', fontWeight: 500 }}>
                    Become a Member
                  </h1>

                  {/* Subtitle */}
                  <p className="text-white/80 text-center mb-5" style={{ fontSize: '15px', fontWeight: 400, marginBottom: '20px' }}>
                    Stream Orthodox content, cancel anytime.
                  </p>

                  {/* Benefits List */}
                  <div className="space-y-3 mb-[45px] sm:mb-[15px] flex flex-col mx-auto" style={{ width: 'fit-content' }}>
                    <div className="flex items-center text-white" style={{ marginBottom: '5px' }}>
                      <svg className="text-green-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ width: '15px', height: '15px' }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[13px]" style={{ fontSize: '15px' }}>Ad-Free</span>
                    </div>
                    <div className="flex items-center text-white" style={{ marginBottom: '5px' }}>
                      <svg className="text-green-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ width: '15px', height: '15px' }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[15px]">Unlimited Access</span>
                    </div>
                    <div className="flex items-center text-white" style={{ marginBottom: '5px' }}>
                      <svg className="text-green-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ width: '15px', height: '15px' }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[15px]">Weekly Shows</span>
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
                      {error}
                    </div>
                  )}

                  {/* RevenueCat Loading (iOS/Android) */}
                  {(isIOS || isAndroid) && isAvailable && isRevenueCatLoading && !isInitialized && (selectedPlan === "monthly" || selectedPlan === "yearly") && (
                    <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg mb-6">
                      Loading subscription options...
                    </div>
                  )}

                  {/* Plan Options */}
                  <div className="space-y-4 mb-8">
                    {/* Monthly Plan */}
                    <div
                      onClick={() => setSelectedPlan("monthly")}
                      className={`relative cursor-pointer transition-all duration-200 rounded-[25px] bg-[#2a2a2a] border-2 border-transparent p-4 flex items-center justify-between`}
                      style={{
                        borderRadius: '25px',
                        height: '78px',
                        marginBottom: '7px',
                        backgroundColor: selectedPlan === "monthly" ? 'rgba(30, 30, 30, 1)' : 'rgb(42, 42, 42)',
                        boxShadow: selectedPlan === "monthly" ? '0 0 10px rgba(255, 255, 255, 0.3)' : 'none'
                      }}
                    >
                      <div className="flex-1">
                        <div className="text-white text-sm mb-1" style={{ fontSize: '13px', fontWeight: 500 }}>Monthly</div>
                        <div className="text-white text-2xl font-semibold" style={{ fontSize: '17px' }}>$7/mo</div>
                      </div>
                      <div className={`w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center ${
                        selectedPlan === "monthly" 
                          ? "bg-white border-white" 
                          : "border-gray-400 bg-transparent"
                      }`}
                      style={{
                        width: selectedPlan === "monthly" ? '13px' : '17px',
                        height: selectedPlan === "monthly" ? '13px' : '17px',
                        borderColor: selectedPlan === "monthly" ? undefined : 'rgba(48, 48, 48, 1)'
                      }}
                      >
                      </div>
                    </div>

                    {/* Yearly Plan */}
                    <div
                      onClick={() => setSelectedPlan("yearly")}
                      className={`relative cursor-pointer transition-all duration-200 rounded-[25px] bg-[#2a2a2a] border-2 border-transparent p-4 flex items-center justify-between`}
                      style={{
                        borderRadius: '25px',
                        height: '78px',
                        marginBottom: '7px',
                        backgroundColor: selectedPlan === "yearly" ? 'rgba(30, 30, 30, 1)' : 'rgb(42, 42, 42)',
                        boxShadow: selectedPlan === "yearly" ? '0 0 10px rgba(255, 255, 255, 0.3)' : 'none'
                      }}
                    >
                      <div className="flex-1">
                        <div className="text-white text-sm mb-1" style={{ fontSize: '13px', fontWeight: 500 }}>Yearly</div>
                        <div className="text-white text-2xl font-semibold" style={{ fontSize: '17px' }}>$80/year</div>
                      </div>
                      <div className={`w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center ${
                        selectedPlan === "yearly" 
                          ? "bg-white border-white" 
                          : "border-gray-400 bg-transparent"
                      }`}
                      style={{
                        width: selectedPlan === "yearly" ? '13px' : '17px',
                        height: selectedPlan === "yearly" ? '13px' : '17px',
                        borderColor: selectedPlan === "yearly" ? undefined : 'rgba(48, 48, 48, 1)'
                      }}
                      >
                      </div>
                    </div>

                    {/* Free Plan - Hide on desktop if user is already on free account AND signup is complete */}
                    {/* During signup (signup_status === 'pending'), always show free option */}
                    {!(user && user.user_type === 'free' && user.signup_status === 'complete' && !isMobile) && (
                      <div
                        onClick={() => setSelectedPlan("free")}
                        className="relative cursor-pointer transition-all duration-200 p-4 flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="text-white text-[13px]" style={{ fontSize: '17px' }}>Free limited account</div>
                        </div>
                        <div className={`w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center ${
                          selectedPlan === "free" 
                            ? "bg-white border-white" 
                            : "border-gray-400 bg-transparent"
                        }`}
                        style={{
                          width: selectedPlan === "free" ? '13px' : '17px',
                          height: selectedPlan === "free" ? '13px' : '17px',
                          borderColor: selectedPlan === "free" ? undefined : 'rgba(48, 48, 48, 1)'
                        }}
                        >
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Sticky Continue Button */}
              <div className="fixed inset-x-0 bottom-[-10px] px-6 py-4 z-20 sm:relative sm:bottom-0 sm:z-auto mb-[19px] sm:mb-[29px]">
                <div className="max-w-md mx-auto flex items-center justify-center">
                  <form onSubmit={handlePlansStep} className="inline-block w-full sm:w-auto">
                    <button
                      type="submit"
                      disabled={isLoading || ((isIOS || isAndroid) && isAvailable && (isRevenueCatLoading || !isInitialized) && (selectedPlan === "monthly" || selectedPlan === "yearly"))}
                      className="w-full sm:w-auto bg-red-600 text-white px-12 py-4 rounded-full font-serif font-bold text-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center">
                          <HarmonySpinner size={24} className="mr-2" />
                          Loading...
                        </div>
                      ) : (
                        "Continue"
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Success */}
      {currentStep === 'success' && (
        <div className="min-h-screen sm:min-h-0 sm:h-full flex flex-col items-center justify-center relative">
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/60 z-0"></div>
          
          {/* Content container */}
          <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12">
            {/* Thank You Text */}
            <h1 className="text-white text-4xl sm:text-5xl font-bold mb-3 text-center">
              Thank You
            </h1>
            
            {/* Subtitle */}
            <p className="text-white text-base sm:text-lg mb-6 text-center">
              We're preparing your account
            </p>
            
            {/* Loading Indicator */}
            <div className="flex justify-center">
              <OrbitProgress color="#ffffff" size="small" text="" textColor="" />
            </div>
          </div>
        </div>
      )}
    </BaseModal>
  );
}


