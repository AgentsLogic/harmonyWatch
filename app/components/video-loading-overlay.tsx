"use client";

import { useEffect, useState } from "react";
import { useLoading } from "../contexts/loading-context";
import { HarmonySpinner } from "./harmony-spinner";

export function VideoLoadingOverlay() {
  const { isLoading } = useLoading();
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
      // Small delay to ensure DOM is ready before fade in
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      // Fade out before removing from DOM
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1a1a1a] transition-opacity duration-300"
      style={{
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div className="flex flex-col items-center justify-center">
        <HarmonySpinner size={24} />
      </div>
    </div>
  );
}

