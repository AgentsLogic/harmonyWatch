"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/env';
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";
import { useLoading } from "../contexts/loading-context";
import { BaseModal } from "./base-modal";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { shouldShowAppleSignIn } from "@/lib/utils/apple-signin-check";
import { nativeAppleSignIn } from "@/lib/utils/native-apple-signin";
import { HarmonySpinner } from "./harmony-spinner";

const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

type LoginStep = 'login' | 'forgot-password' | 'forgot-password-success' | 'reset-password';

type Props = {
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
  initialEmail?: string | null;
  redirectTo?: string | null;
  successMessage?: string | null;
  initialStep?: LoginStep | null;
};

export function LoginModal({ 
  isOpen, 
  onClose, 
  isAnimatingClose = false,
  initialEmail = null,
  redirectTo = null,
  successMessage = null,
  initialStep = null
}: Props) {
  const [currentStep, setCurrentStep] = useState<LoginStep>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [displaySuccessMessage, setDisplaySuccessMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [showAppleSignIn, setShowAppleSignIn] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const forgotPasswordEmailInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { login, refreshUser } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalInitialEmail } = useModal();
  const { showLoading } = useLoading();

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if Apple Sign In should be shown
  useEffect(() => {
    setShowAppleSignIn(shouldShowAppleSignIn());
  }, []);

  // Initialize step from props
  useEffect(() => {
    if (initialStep) {
      setCurrentStep(initialStep);
    }
  }, [initialStep]);

  // Initialize email from props
  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  // Initialize success message from props
  useEffect(() => {
    if (successMessage) {
      setDisplaySuccessMessage(successMessage);
    }
  }, [successMessage]);

  // Listen for password recovery event from Supabase
  useEffect(() => {
    if (!isOpen) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        console.log('[Login Modal] Password recovery detected');
        // User clicked the reset link - show reset password form
        setCurrentStep('reset-password');
        setError("");
        // Extract email from session if available
        if (session.user?.email) {
          setEmail(session.user.email);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isOpen]);

  // Check URL hash for password recovery token or errors when modal opens
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const hash = window.location.hash;
      
      // Check for error in hash (e.g., expired link)
      if (hash.includes('error=')) {
        const urlParams = new URLSearchParams(hash.substring(1));
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        
        if (error === 'access_denied' || error === 'otp_expired') {
          // Link expired or invalid
          setCurrentStep('forgot-password');
          setError(errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : 'Password reset link is invalid or has expired. Please request a new one.');
        }
        
        // Clean up the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      } else if (hash.includes('type=recovery') || hash.includes('access_token')) {
        // Password recovery link detected - Supabase will trigger PASSWORD_RECOVERY event
        // Clear the hash to clean up the URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [isOpen]);

  // Auto-focus removed - keyboard will only open when user taps input field

  // Clear error and reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setError("");
      if (initialStep) {
        setCurrentStep(initialStep);
      } else {
        setCurrentStep('login');
      }
    }
  }, [isOpen, initialStep]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setDisplaySuccessMessage(""); // Clear success message on new login attempt
    
    try {
      const result = await login(email, password);
      
      if (result.success && result.user) {
        // Users with free, subscriber, or admin accounts should go to home page
        const isFreeUser = result.user.user_type === 'free';
        const isSubscriber = result.user.user_type === 'subscriber';
        const isAdmin = result.user.user_type === 'admin';
        const hasActiveSubscription = result.user.subscription?.is_active === true;
        const userHasValidAccount = isFreeUser || isSubscriber || isAdmin || hasActiveSubscription;
        
        // Check if there's a redirect parameter
        const targetPath = redirectTo || (userHasValidAccount ? "/" : null);
        
        if (targetPath) {
          // Show global loading overlay FIRST to cover the entire page
          // This must happen before closing modal to prevent landing page flash
          showLoading();
          
          // Use requestAnimationFrame to ensure loading overlay is painted
          // Double RAF ensures it's definitely rendered before we do anything else
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Now close modal (loading overlay will cover everything)
              onClose(false);
              
              // Refresh user data and redirect
              // Use hard redirect (window.location.href) when on landing page to ensure
              // the redirect works even if user context hasn't updated yet
              // This fixes the bug where users stay on landing page after login in production
              const isOnLandingPage = pathname === '/landing';
              refreshUser()
                .then(() => {
                  // Small delay to ensure loading overlay is fully visible
                  setTimeout(() => {
                    if (isOnLandingPage) {
                      // Hard redirect for landing page - forces full page reload
                      // This ensures user context is properly initialized
                      window.location.href = targetPath;
                    } else {
                      // Client-side navigation for other pages
                      router.replace(targetPath);
                    }
                  }, 50);
                })
                .catch(err => {
                  console.error('Error refreshing user after login:', err);
                  // Still redirect even if refresh fails
                  setTimeout(() => {
                    if (isOnLandingPage) {
                      window.location.href = targetPath;
                    } else {
                      router.replace(targetPath);
                    }
                  }, 50);
                });
            });
          });
        } else {
          // User doesn't have a valid account - open signup modal at plans step
          onClose(false);
          setSignupModalInitialStep('plans');
          setIsSignupModalOpen(true);
        }
      } else {
        setError(result.error || "Login failed");
      }
    } catch (error) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUpClick = () => {
    onClose(false);
    setSignupModalInitialStep('email');
    setSignupModalInitialEmail(email);
    setIsSignupModalOpen(true);
  };

  const handleAppleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      
      // On native iOS, use native Apple Sign In (modal popup)
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        try {
        // Pass false for isSignupFlow since this is a login, not signup
          console.log('[Login Modal] Starting native Apple Sign In...');
        const result = await nativeAppleSignIn(false);
          console.log('[Login Modal] Native Apple Sign In result:', result);
        
        if (result.success) {
          // Refresh user data
          await refreshUser();
            // Reset loading state before navigation
            setIsLoading(false);
          // Handle redirect
          // Use hard redirect when on landing page to ensure redirect works
          const isOnLandingPage = pathname === '/landing';
          const targetPath = redirectTo || '/';
          onClose(false);
          if (isOnLandingPage) {
            window.location.href = targetPath;
          } else {
            router.push(targetPath);
          }
            return;
          } else {
            console.error('[Login Modal] Apple Sign In failed:', result.error);
            setIsLoading(false);
            
            // Show error to user - don't fall back to Safari for debugging
            if (result.error && !result.error.toLowerCase().includes('cancel')) {
              setError(result.error || 'Apple Sign In failed. Please try again.');
              alert(`Apple Sign In Error: ${result.error}\n\nPlease check the debug console (Ctrl+Shift+D) for more details.`);
        } else {
              // User cancelled, just reset loading state
              setError("");
            }
            return;
          }
        } catch (nativeError: any) {
          console.error('[Login Modal] Error in native Apple Sign In:', nativeError);
          setIsLoading(false);
          setError(`Native error: ${nativeError.message}`);
          alert(`Apple Sign In Exception: ${nativeError.message}\n\nPlease check the debug console (Ctrl+Shift+D) for more details.`);
          return;
        }
      } else {
        // On web, use standard OAuth redirect
        const next = redirectTo || '/';
        window.location.href = `/api/auth/apple?next=${encodeURIComponent(next)}`;
      }
    } catch (error: any) {
      console.error('Error initiating Apple Sign In:', error);
      setIsLoading(false);
      setError("Failed to initiate Apple Sign In. Please try again.");
      // Fallback to web OAuth
      const next = redirectTo || '/';
      window.location.href = `/api/auth/apple?next=${encodeURIComponent(next)}`;
    }
  };

  const handleForgotPasswordClick = () => {
    setCurrentStep('forgot-password');
    setError("");
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Redirect to password-reset page - Supabase will append hash fragments with recovery tokens
      // The password-reset page will detect the hash and open the login modal
      const redirectTo = `${window.location.origin}/password-reset`;
      console.log('[Forgot Password] Requesting password reset for:', email);
      console.log('[Forgot Password] Redirect URL:', redirectTo);
      
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo,
      });

      if (error) {
        console.error('[Forgot Password] Error:', error);
        
        // Handle specific error cases with user-friendly messages
        if (error.message.includes('rate limit') || error.message.includes('rate_limit')) {
          setError('Too many password reset requests. Please wait about 1 hour before requesting another password reset email.');
        } else if (error.message.includes('email')) {
          setError('Unable to send password reset email. Please check your email address and try again.');
        } else {
          setError(error.message);
        }
      } else {
        console.log('[Forgot Password] Success - email should be sent');
        setCurrentStep('forgot-password-success');
      }
    } catch (error) {
      console.error('[Forgot Password] Unexpected error:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Validate passwords
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long");
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        console.error('[Reset Password] Error:', error);
        setError(error.message);
      } else {
        console.log('[Reset Password] Success');
        // Show success message and redirect to login
        setDisplaySuccessMessage('Password reset successfully! You can now log in with your new password.');
        setCurrentStep('login');
        setNewPassword("");
        setConfirmPassword("");
        setError("");
      }
    } catch (error) {
      console.error('[Reset Password] Unexpected error:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

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
      minHeight="5xl"
      maxHeight="5xl"
      zIndex={111}
      backdropZIndex={110}
    >
      {/* Close/Back button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (currentStep === 'login') {
            onClose(false);
          } else {
            setCurrentStep('login');
            setError("");
          }
        }}
        className="fixed sm:absolute top-12 sm:top-4 left-4 sm:right-4 z-50 sm:z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
        aria-label={currentStep === 'login' ? "Close login" : "Back to login"}
      >
        {currentStep === 'login' ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        )}
      </button>

      {/* Login Form */}
      <div className="min-h-screen sm:min-h-0 sm:h-full flex items-center justify-center px-6 py-24 sm:py-8">
        {currentStep === 'login' && (
          <motion.div 
            className="w-full max-w-md mx-auto -translate-y-[100px] sm:translate-y-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {/* Title */}
            <h1 className="text-white text-2xl font-medium text-center mb-8">
              Welcome back
            </h1>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Success Message */}
              {displaySuccessMessage && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
                  {displaySuccessMessage}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
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
                  placeholder="Email@email.com"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Password Field */}
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full bg-red-600 text-white py-3 rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <HarmonySpinner size={24} className="mr-2" />
                    Loading...
                  </div>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            {/* Apple Sign In Button (Web and iOS) */}
            {showAppleSignIn && (
              <button
                type="button"
                onClick={handleAppleSignIn}
                disabled={isLoading}
                className="w-full bg-black text-white py-3 rounded-full font-medium hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center border border-gray-600 mt-4"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Continue with Apple
              </button>
            )}

            {/* Sign Up Link */}
            <div className="text-center mt-6">
              <p className="text-gray-400">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={handleSignUpClick}
                  className="text-red-600 hover:text-red-500 transition-colors cursor-pointer"
                >
                  Sign up
                </button>
              </p>
            </div>

            {/* Forgot Password Link */}
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={handleForgotPasswordClick}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Forgot your password?
              </button>
            </div>
          </motion.div>
        )}

        {/* Forgot Password Form */}
        {currentStep === 'forgot-password' && (
          <motion.div 
            className="w-full max-w-md mx-auto -translate-y-[100px] sm:translate-y-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {/* Title */}
            <h1 className="text-white text-2xl font-medium text-center mb-2">
              Forgot Password?
            </h1>
            <p className="text-gray-400 text-center mb-8">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {/* Form */}
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div>
                <input
                  ref={forgotPasswordEmailInputRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full bg-red-600 text-white py-3 rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <HarmonySpinner size={24} className="mr-2" />
                    Sending Reset Link...
                  </div>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* Forgot Password Success */}
        {currentStep === 'forgot-password-success' && (
          <motion.div 
            className="w-full max-w-md mx-auto -translate-y-[100px] sm:translate-y-0 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h1 className="text-white text-2xl font-medium mb-4">
              Check Your Email
            </h1>
            
            <p className="text-gray-400 mb-6">
              We've sent a password reset link to <strong className="text-white">{email}</strong>. 
              Please check your email and click the link to reset your password.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  setCurrentStep('login');
                  setError("");
                }}
                className="w-full bg-red-600 text-white py-3 rounded-full font-medium hover:bg-red-700 transition-colors"
              >
                Back to Login
              </button>
              
              <button
                onClick={() => {
                  setCurrentStep('forgot-password');
                  setEmail("");
                  setError("");
                }}
                className="w-full bg-gray-600 text-white py-3 rounded-full font-medium hover:bg-gray-700 transition-colors"
              >
                Try Different Email
              </button>
            </div>
          </motion.div>
        )}

        {/* Reset Password Form */}
        {currentStep === 'reset-password' && (
          <motion.div 
            className="w-full max-w-md mx-auto -translate-y-[100px] sm:translate-y-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {/* Title */}
            <h1 className="text-white text-2xl font-medium text-center mb-2">
              Reset Your Password
            </h1>
            <p className="text-gray-400 text-center mb-8">
              Enter your new password below.
            </p>

            {/* Form */}
            <form onSubmit={handleResetPasswordSubmit} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {displaySuccessMessage && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
                  {displaySuccessMessage}
                </div>
              )}

              {/* New Password Field */}
              <div>
                <input
                  ref={newPasswordInputRef}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                  minLength={6}
                />
              </div>

              {/* Confirm Password Field */}
              <div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 bg-[#fdfcfb] text-gray-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                  required
                  minLength={6}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !newPassword || !confirmPassword}
                className="w-full bg-red-600 text-white py-3 rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <HarmonySpinner size={24} className="mr-2" />
                    Resetting Password...
                  </div>
                ) : (
                  "Reset Password"
                )}
              </button>

              {/* Back to Login */}
              <button
                type="button"
                onClick={() => {
                  setCurrentStep('login');
                  setNewPassword("");
                  setConfirmPassword("");
                  setError("");
                }}
                className="w-full text-gray-400 hover:text-white transition-colors text-sm"
              >
                Back to Login
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </BaseModal>
  );
}

