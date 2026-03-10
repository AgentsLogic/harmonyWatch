"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useModal } from "../../contexts/modal-context";

export default function VideoPage() {
  const params = useParams();
  const contentId = params.id as string;
  const router = useRouter();
  const { setVideoContentId, setIsVideoModalOpen } = useModal();

  // When accessing /video/[id] route, open the modal and redirect to home
  useEffect(() => {
    if (contentId) {
      // Open video modal and redirect to home
      setVideoContentId(contentId);
      setIsVideoModalOpen(true);
      router.replace('/');
    }
  }, [contentId, router, setVideoContentId, setIsVideoModalOpen]);

  // Loading state while redirecting - show nothing, modal will handle loading
  return null;
}

