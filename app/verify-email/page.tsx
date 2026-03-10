"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/env';
import { useModal } from "../contexts/modal-context";

  const supabase = createClient(
    publicConfig.NEXT_PUBLIC_SUPABASE_URL,
    publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

function VerifyEmailForm() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setIsLoginModalOpen, setLoginModalSuccessMessage } = useModal();
  const token = searchParams.get('token');
  const type = searchParams.get('type');

  // Check if user is already authenticated and redirect to home
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // User is already authenticated - redirect to home
        router.push('/');
        return;
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (token && type === 'signup') {
      verifyEmail();
    } else {
      // No token - redirect to home since email verification is bypassed
      router.push('/');
    }
  }, [token, type, router]);

  const verifyEmail = async () => {
    if (!token) return;
    
    setIsVerifying(true);
    setVerificationStatus('pending');

    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'signup'
      });

      if (error) {
        setVerificationStatus('error');
        setErrorMessage(error.message);
      } else {
        setVerificationStatus('success');
        // Redirect directly to home page (email verification is bypassed)
        setTimeout(() => {
          router.push('/');
        }, 1000);
      }
    } catch (error) {
      setVerificationStatus('error');
      setErrorMessage('An unexpected error occurred');
    } finally {
      setIsVerifying(false);
    }
  };

  const resendVerification = async () => {
    setIsResending(true);
    setResendStatus('idle');

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: searchParams.get('email') || ''
      });

      if (error) {
        setResendStatus('error');
      } else {
        setResendStatus('success');
      }
    } catch (error) {
      setResendStatus('error');
    } finally {
      setIsResending(false);
    }
  };

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
        <h1 className="text-white text-3xl font-serif text-center mb-8">
          Verify Your Email
        </h1>

        <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
          {verificationStatus === 'pending' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#c50000] mx-auto mb-4"></div>
              <p className="text-white text-lg">Verifying your email...</p>
            </div>
          )}

          {verificationStatus === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-white text-xl font-semibold mb-2">Email Verified!</h2>
              <p className="text-gray-300 mb-4">
                Your email has been successfully verified. You can now log in to your account.
              </p>
              <p className="text-sm text-gray-400">
                Redirecting to login page...
              </p>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-white text-xl font-semibold mb-2">Verification Failed</h2>
              <p className="text-gray-300 mb-4">
                {errorMessage || 'There was an error verifying your email address.'}
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setLoginModalSuccessMessage('Email verified successfully! You can now log in.');
                    setIsLoginModalOpen(true);
                    router.push('/');
                  }}
                  className="w-full bg-[#c50000] hover:bg-[#a82e2e] text-white font-medium py-3 px-4 rounded-md transition-colors"
                >
                  Go to Login
                </button>
                
                <button
                  onClick={resendVerification}
                  disabled={isResending}
                  className="w-full bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 text-white font-medium py-3 px-4 rounded-md transition-colors"
                >
                  {isResending ? 'Sending...' : 'Resend Verification Email'}
                </button>
              </div>

              {resendStatus === 'success' && (
                <p className="text-green-400 text-sm mt-3">
                  Verification email sent! Check your inbox.
                </p>
              )}
              
              {resendStatus === 'error' && (
                <p className="text-red-400 text-sm mt-3">
                  Failed to resend verification email. Please try again.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
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
      <VerifyEmailForm />
    </Suspense>
  );
}
