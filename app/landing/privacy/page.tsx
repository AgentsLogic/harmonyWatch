"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "../../contexts/modal-context";
import LandingPage from "../page";

export default function PrivacyPage() {
  const router = useRouter();
  const { setIsFooterContentModalOpen, setFooterContentKey } = useModal();

  useEffect(() => {
    // Open footer content modal with privacy_policy content
    setFooterContentKey('privacy_policy');
    setIsFooterContentModalOpen(true);
  }, [setIsFooterContentModalOpen, setFooterContentKey]);

  // Render landing page directly as background
  // URL stays as /landing/privacy while modal is open
  return <LandingPage />;
}
