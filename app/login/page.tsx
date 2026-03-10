"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useModal } from "../contexts/modal-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { 
    setIsLoginModalOpen,
    setLoginModalRedirectTo,
    setLoginModalSuccessMessage,
    setLoginModalInitialEmail
  } = useModal();

  useEffect(() => {
    // Extract URL parameters
    const redirectTo = searchParams.get('redirect');
    const verified = searchParams.get('verified');
    const passwordReset = searchParams.get('passwordReset');
    const email = searchParams.get('email');
    
    // Set modal state
    if (redirectTo) {
      setLoginModalRedirectTo(redirectTo);
    }
    
    if (verified === 'true') {
      setLoginModalSuccessMessage('Email verified successfully! You can now log in.');
    } else if (passwordReset === 'true') {
      setLoginModalSuccessMessage('Password reset successfully! You can now log in with your new password.');
    }
    
    if (email) {
      setLoginModalInitialEmail(email);
    }
    
    // Open modal and redirect to home
    setIsLoginModalOpen(true);
    router.push('/');
  }, [searchParams, router, setIsLoginModalOpen, setLoginModalRedirectTo, setLoginModalSuccessMessage, setLoginModalInitialEmail]);

  return null;
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
