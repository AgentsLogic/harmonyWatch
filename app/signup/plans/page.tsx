"use client";

import { useEffect } from "react";
import { useModal } from "../../contexts/modal-context";

export default function PlanSelectionPage() {
  const { setIsSignupModalOpen, setSignupModalInitialStep } = useModal();

  useEffect(() => {
    // Open signup modal with plans step
    setSignupModalInitialStep('plans');
    setIsSignupModalOpen(true);
  }, [setIsSignupModalOpen, setSignupModalInitialStep]);

  return null;
}
