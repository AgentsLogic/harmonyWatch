"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "../contexts/modal-context";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { setIsLoginModalOpen, setLoginModalInitialStep } = useModal();

  useEffect(() => {
    // Redirect to home and open login modal with forgot password step
    setLoginModalInitialStep('forgot-password');
    setIsLoginModalOpen(true);
    router.push('/');
  }, [router, setIsLoginModalOpen, setLoginModalInitialStep]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  );
}
