"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "../../contexts/modal-context";
import LandingPage from "../page";

export default function TermsOfServicePage() {
  const router = useRouter();
  const { setIsFooterContentModalOpen, setFooterContentKey } = useModal();

  useEffect(() => {
    // Open footer content modal with terms_of_service content
    setFooterContentKey('terms_of_service');
    setIsFooterContentModalOpen(true);
  }, [setIsFooterContentModalOpen, setFooterContentKey]);

  // Render landing page directly as background
  // URL stays as /landing/terms-of-service while modal is open
  return <LandingPage />;
}
