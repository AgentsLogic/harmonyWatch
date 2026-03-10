"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useModal } from "../contexts/modal-context";

function SignupPageInner() {
  const searchParams = useSearchParams();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalInitialEmail } = useModal();

  useEffect(() => {
    // Extract email from URL parameter
    const emailParam = searchParams.get('email');
    
    // Open signup modal with email step
    if (emailParam) {
      setSignupModalInitialEmail(emailParam);
    }
    setSignupModalInitialStep('email');
    setIsSignupModalOpen(true);
  }, [searchParams, setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalInitialEmail]);

  return null;
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignupPageInner />
    </Suspense>
  );
}
