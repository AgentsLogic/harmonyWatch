"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "../../contexts/modal-context";
import LandingPage from "../page";

export default function ContactUsPage() {
  const router = useRouter();
  const { setIsFooterContentModalOpen, setFooterContentKey } = useModal();

  useEffect(() => {
    // Open footer content modal with contact_us content
    setFooterContentKey('contact_us');
    setIsFooterContentModalOpen(true);
  }, [setIsFooterContentModalOpen, setFooterContentKey]);

  // Render landing page directly as background
  // URL stays as /landing/contact-us while modal is open
  return <LandingPage />;
}
