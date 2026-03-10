"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/env';
import { useModal } from "../contexts/modal-context";

  const supabase = createClient(
    publicConfig.NEXT_PUBLIC_SUPABASE_URL,
    publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const hasValidSessionRef = useRef(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setIsLoginModalOpen, setLoginModalSuccessMessage } = useModal();

  useEffect(() => {
    // Check session immediately
    checkSession();

    // Also listen for auth state changes (in case hash fragments are being parsed)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) {
          hasValidSessionRef.current = true;
          setIsValidSession(true);
          setIsCheckingSession(false);
          setError("");
        }
      }
    });

    // Set a timeout to stop checking after 5 seconds
    const timeout = setTimeout(() => {
      if (!hasValidSessionRef.current) {
        setIsCheckingSession(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const checkSession = async () => {
    try {
      // First, try to get the session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        // If no session, check if we're on a recovery link by checking URL hash
        // Supabase automatically parses hash fragments, but we need to wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check again after waiting
        const { data: { session: retrySession }, error: retryError } = await supabase.auth.getSession();
        
        if (retryError || !retrySession) {
          setError("Invalid or expired reset link. Please request a new password reset.");
          setIsValidSession(false);
          hasValidSessionRef.current = false;
        } else {
          hasValidSessionRef.current = true;
          setIsValidSession(true);
        }
      } else {
        hasValidSessionRef.current = true;
        setIsValidSession(true);
      }
    } catch (error) {
      setError("Invalid or expired reset link. Please request a new password reset.");
      setIsValidSession(false);
    } finally {
      setIsCheckingSession(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate passwords
    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setError(error.message);
      } else {
        setIsSuccess(true);
        // Open login modal with success message after 3 seconds
        setTimeout(() => {
          setLoginModalSuccessMessage('Password reset successfully! You can now log in with your new password.');
          setIsLoginModalOpen(true);
          router.push('/');
        }, 3000);
      }
    } catch (error) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#c50000] mx-auto mb-4"></div>
            <p className="text-white text-lg">Verifying reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border border-white">
              <span className="text-black text-4xl font-serif font-bold">H</span>
            </div>
          </div>

          <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            
            <h1 className="text-white text-xl font-semibold mb-4">
              Invalid Reset Link
            </h1>
            
            <p className="text-gray-300 mb-6">
              {error}
            </p>
            
            <button
              onClick={() => router.push('/forgot-password')}
              className="w-full bg-[#c50000] hover:bg-[#a82e2e] text-white font-medium py-3 px-4 rounded-md transition-colors"
            >
              Request New Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border border-white">
              <span className="text-black text-4xl font-serif font-bold">H</span>
            </div>
          </div>

          <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h1 className="text-white text-xl font-semibold mb-4">
              Password Updated!
            </h1>
            
            <p className="text-gray-300 mb-6">
              Your password has been successfully updated. You can now log in with your new password.
            </p>
            
            <p className="text-sm text-gray-400">
              Redirecting to login page...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border border-white">
            <span className="text-black text-4xl font-serif font-bold">H</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-white text-3xl font-serif text-center mb-2">
          Reset Password
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Enter your new password below.
        </p>

        <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-[#c50000] focus:border-transparent"
                placeholder="Enter your new password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-[#c50000] focus:border-transparent"
                placeholder="Confirm your new password"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#c50000] hover:bg-[#a82e2e] disabled:bg-gray-600 text-white font-medium py-3 px-4 rounded-md transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Updating Password...
                </div>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => {
              setIsLoginModalOpen(true);
              router.push('/');
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#c50000] mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
