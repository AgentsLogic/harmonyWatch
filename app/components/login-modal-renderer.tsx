"use client";

import { useState, useEffect } from "react";
import { LoginModal } from "./login-modal";
import { useModal } from "../contexts/modal-context";

export function LoginModalRenderer() {
  const { 
    isLoginModalOpen, 
    setIsLoginModalOpen,
    loginModalInitialEmail,
    loginModalRedirectTo,
    loginModalSuccessMessage,
    loginModalInitialStep
  } = useModal();
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
        // On mobile drag-to-dismiss, keep isOpen true during animation
        setIsAnimatingClose(true);
        setIsLoginModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      } else {
        // On desktop backdrop click, let isOpen become false to trigger fade-out
        setIsAnimatingClose(true);
        setIsLoginModalOpen(false);
        setTimeout(() => {
          setIsAnimatingClose(false);
        }, 200);
      }
    } else {
      // Immediate close
      setIsLoginModalOpen(false);
      setIsAnimatingClose(false);
    }
  };

  // On mobile drag-to-dismiss, keep isOpen true during animation
  const modalIsOpen = isMobile && isAnimatingClose ? true : isLoginModalOpen;

  return (
    <LoginModal 
      isOpen={modalIsOpen} 
      isAnimatingClose={isAnimatingClose}
      onClose={handleClose}
      initialEmail={loginModalInitialEmail}
      redirectTo={loginModalRedirectTo}
      successMessage={loginModalSuccessMessage}
      initialStep={loginModalInitialStep}
    />
  );
}

