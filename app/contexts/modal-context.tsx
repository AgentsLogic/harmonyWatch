"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { MediaItem } from "../lib/data";

interface ModalContextType {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  selectedItem: MediaItem | null;
  setSelectedItem: (item: MediaItem | null) => void;
  sourcePosition: { x: number; y: number; width: number; height: number } | null;
  setSourcePosition: (pos: { x: number; y: number; width: number; height: number } | null) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  isVideoModalOpen: boolean;
  setIsVideoModalOpen: (open: boolean) => void;
  isVideoModalInPipMode: boolean;
  setIsVideoModalInPipMode: (inPip: boolean) => void;
  videoContentId: string | null;
  setVideoContentId: (id: string | null) => void;
  isSignupModalOpen: boolean;
  setIsSignupModalOpen: (open: boolean) => void;
  signupModalInitialStep: 'email' | 'plans' | 'success' | null;
  setSignupModalInitialStep: (step: 'email' | 'plans' | 'success' | null) => void;
  signupModalInitialEmail: string | null;
  setSignupModalInitialEmail: (email: string | null) => void;
  signupModalSuccessParams: { sessionId?: string; subscriptionId?: string; plan?: string } | null;
  setSignupModalSuccessParams: (params: { sessionId?: string; subscriptionId?: string; plan?: string } | null) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  loginModalInitialEmail: string | null;
  setLoginModalInitialEmail: (email: string | null) => void;
  loginModalRedirectTo: string | null;
  setLoginModalRedirectTo: (redirect: string | null) => void;
  loginModalSuccessMessage: string | null;
  setLoginModalSuccessMessage: (message: string | null) => void;
  loginModalInitialStep: 'login' | 'forgot-password' | 'forgot-password-success' | 'reset-password' | null;
  setLoginModalInitialStep: (step: 'login' | 'forgot-password' | 'forgot-password-success' | 'reset-password' | null) => void;
  previewStartTime: number | null;
  setPreviewStartTime: (time: number | null) => void;
  isFooterContentModalOpen: boolean;
  setIsFooterContentModalOpen: (open: boolean) => void;
  footerContentKey: string | null;
  setFooterContentKey: (key: string | null) => void;
  footerContent: Record<string, { title: string; content: string }> | null;
  setFooterContent: (content: Record<string, { title: string; content: string }> | null) => void;
  refreshFooterContent: (forceRefresh?: boolean) => Promise<void>;
  isBugModalOpen: boolean;
  setIsBugModalOpen: (open: boolean) => void;
  isSearchModalOpen: boolean;
  setIsSearchModalOpen: (open: boolean) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [sourcePosition, setSourcePosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isVideoModalInPipMode, setIsVideoModalInPipMode] = useState(false);
  const [videoContentId, setVideoContentId] = useState<string | null>(null);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [signupModalInitialStep, setSignupModalInitialStep] = useState<'email' | 'plans' | 'success' | null>(null);
  const [signupModalInitialEmail, setSignupModalInitialEmail] = useState<string | null>(null);
  const [signupModalSuccessParams, setSignupModalSuccessParams] = useState<{ sessionId?: string; subscriptionId?: string; plan?: string } | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalInitialEmail, setLoginModalInitialEmail] = useState<string | null>(null);
  const [loginModalRedirectTo, setLoginModalRedirectTo] = useState<string | null>(null);
  const [loginModalSuccessMessage, setLoginModalSuccessMessage] = useState<string | null>(null);
  const [loginModalInitialStep, setLoginModalInitialStep] = useState<'login' | 'forgot-password' | 'forgot-password-success' | 'reset-password' | null>(null);
  const [previewStartTime, setPreviewStartTime] = useState<number | null>(null);
  const [isFooterContentModalOpen, setIsFooterContentModalOpen] = useState(false);
  const [footerContentKey, setFooterContentKey] = useState<string | null>(null);
  const [footerContent, setFooterContent] = useState<Record<string, { title: string; content: string }> | null>(null);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Function to load/refresh footer content
  const loadFooterContent = async (forceRefresh = false) => {
    try {
      // Only use cache-busting when explicitly refreshing (e.g., after admin update)
      const url = forceRefresh ? `/api/landing-content?_t=${Date.now()}` : '/api/landing-content';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // Convert array to object keyed by content_key for easy lookup
        const contentMap: Record<string, { title: string; content: string }> = {};
        if (data.content && Array.isArray(data.content)) {
          data.content.forEach((item: { content_key: string; title: string; content: string }) => {
            contentMap[item.content_key] = {
              title: item.title,
              content: item.content,
            };
          });
        }
        setFooterContent(contentMap);
      }
    } catch (error) {
      console.error('Error loading footer content:', error);
      // Don't set error state - just fail silently, modal will fetch on demand
    }
  };

  // Preload all footer content on initial mount
  useEffect(() => {
    loadFooterContent();
  }, []);

  return (
    <ModalContext.Provider value={{ 
      isModalOpen, 
      setIsModalOpen,
      selectedItem,
      setSelectedItem,
      sourcePosition,
      setSourcePosition,
      isSettingsModalOpen,
      setIsSettingsModalOpen,
      isVideoModalOpen,
      setIsVideoModalOpen,
      isVideoModalInPipMode,
      setIsVideoModalInPipMode,
      videoContentId,
      setVideoContentId,
      isSignupModalOpen,
      setIsSignupModalOpen,
      signupModalInitialStep,
      setSignupModalInitialStep,
      signupModalInitialEmail,
      setSignupModalInitialEmail,
      signupModalSuccessParams,
      setSignupModalSuccessParams,
      isLoginModalOpen,
      setIsLoginModalOpen,
      loginModalInitialEmail,
      setLoginModalInitialEmail,
      loginModalRedirectTo,
      setLoginModalRedirectTo,
      loginModalSuccessMessage,
      setLoginModalSuccessMessage,
      loginModalInitialStep,
      setLoginModalInitialStep,
      previewStartTime,
      setPreviewStartTime,
      isFooterContentModalOpen,
      setIsFooterContentModalOpen,
      footerContentKey,
      setFooterContentKey,
      footerContent,
      setFooterContent,
      refreshFooterContent: loadFooterContent,
      isBugModalOpen,
      setIsBugModalOpen,
      isSearchModalOpen,
      setIsSearchModalOpen
    }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}

