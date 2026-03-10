"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";
import LandingPage from "../landing/page";

export default function PasswordResetPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { setIsLoginModalOpen, setLoginModalInitialStep } = useModal();

  useEffect(() => {
    if (!userLoading) {
      // Always open login modal when on password-reset page
      // The modal will handle hash fragments (tokens or errors) internally
      setIsLoginModalOpen(true);
      setLoginModalInitialStep('reset-password');
      // Note: Don't clean up the hash here - let the modal process it first
      // The modal will clean up the hash after processing it
    }
  }, [userLoading, setIsLoginModalOpen, setLoginModalInitialStep]);

  // Render landing page as background
  // The login modal will appear on top
  if (!userLoading) {
    return <LandingPage />;
  }

  // Show loading while checking auth
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  );
}
