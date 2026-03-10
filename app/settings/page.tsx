"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";
import Home from "../page";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { setIsSettingsModalOpen } = useModal();

  useEffect(() => {
    if (!userLoading) {
      if (user) {
        setIsSettingsModalOpen(true);
        // No router.replace('/') -- Home renders directly below
      } else {
        router.push("/landing");
      }
    }
  }, [user, userLoading, router, setIsSettingsModalOpen]);

  if (!userLoading && user) {
    return <Home />;
  }

  return null;
}
