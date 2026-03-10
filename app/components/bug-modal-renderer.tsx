"use client";

import { useState, useEffect } from "react";
import { BugModal } from "./bug-modal";
import { useModal } from "../contexts/modal-context";

export function BugModalRenderer() {
  const { isBugModalOpen, setIsBugModalOpen } = useModal();
  const [isAnimatingClose, setIsAnimatingClose] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleClose = (delayClose = false) => {
    if (delayClose) {
      if (isMobile) {
        setIsAnimatingClose(true);
        setIsBugModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      } else {
        setIsAnimatingClose(true);
        setIsBugModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      }
    } else {
      setIsBugModalOpen(false);
      setIsAnimatingClose(false);
    }
  };

  const modalIsOpen = isMobile && isAnimatingClose ? true : isBugModalOpen;

  return (
    <BugModal 
      isOpen={modalIsOpen} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
    />
  );
}
