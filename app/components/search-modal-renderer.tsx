"use client";

import { useState, useEffect } from "react";
import { SearchModal } from "./search-modal";
import { useModal } from "../contexts/modal-context";

export function SearchModalRenderer() {
  const { isSearchModalOpen, setIsSearchModalOpen } = useModal();
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
        setIsSearchModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      } else {
        setIsAnimatingClose(true);
        setIsSearchModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      }
    } else {
      setIsSearchModalOpen(false);
      setIsAnimatingClose(false);
    }
  };

  const modalIsOpen = isMobile && isAnimatingClose ? true : isSearchModalOpen;

  return (
    <SearchModal 
      isOpen={modalIsOpen} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
    />
  );
}
