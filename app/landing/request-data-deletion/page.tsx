"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "../../contexts/modal-context";
import LandingPage from "../page";

export default function RequestDataDeletionPage() {
  const router = useRouter();
  const { setIsFooterContentModalOpen, setFooterContentKey } = useModal();

  useEffect(() => {
    // Open footer content modal with refund_policy content (displayed as "Request Data Deletion")
    setFooterContentKey('refund_policy');
    setIsFooterContentModalOpen(true);
  }, [setIsFooterContentModalOpen, setFooterContentKey]);

  // Render landing page directly as background
  // URL stays as /landing/request-data-deletion while modal is open
  return <LandingPage />;
}
