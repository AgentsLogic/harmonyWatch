"use client";

import { useModal } from "../contexts/modal-context";
import { useState, useEffect } from "react";

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const { isModalOpen, isSettingsModalOpen, isVideoModalOpen, isVideoModalInPipMode } = useModal();
  const [isMobile, setIsMobile] = useState(false);
  // Don't apply blur/scale if video modal is in PiP mode
  const shouldApplyBlurScale = isModalOpen || isSettingsModalOpen || (isVideoModalOpen && !isVideoModalInPipMode);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div 
      data-page-content
      className="relative z-[1] bg-black transition-[transform,filter] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] sm:!transform-none sm:!transition-none px-0"
      style={{
        transform: shouldApplyBlurScale ? 'scale(0.90)' : 'scale(1)',
        filter: isMobile && shouldApplyBlurScale ? 'blur(10px)' : 'blur(0px)',
      }}
    >
      {children}
    </div>
  );
}

