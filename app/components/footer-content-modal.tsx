"use client";

import { useEffect, useState, useRef } from "react";
import { BaseModal } from "./base-modal";
import { useModal } from "../contexts/modal-context";

// Helper function to detect and extract email addresses from HTML
const extractEmails = (html: string | undefined | null): string[] => {
  if (!html || typeof html !== 'string') {
    return [];
  }
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return html.match(emailRegex) || [];
};

// Helper function to preserve text formatting (convert line breaks to HTML)
const preserveTextFormatting = (text: string | undefined | null): string => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // If text already contains HTML tags, assume it's HTML and return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }
  
  // Otherwise, convert plain text formatting to HTML
  // Escape HTML special characters first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Convert double line breaks to paragraphs
  html = html.split(/\n\s*\n/).map(paragraph => {
    if (paragraph.trim()) {
      // Convert single line breaks within paragraphs to <br>
      const withBreaks = paragraph.trim().replace(/\n/g, '<br>');
      return `<p style="margin-bottom: 1em;">${withBreaks}</p>`;
    }
    return '';
  }).filter(p => p).join('');
  
  // If no paragraphs were created, just convert line breaks to <br>
  if (!html) {
    html = text.replace(/\n/g, '<br>');
  }
  
  return html;
};

// Helper function to replace emails in HTML with clickable elements
const replaceEmailsWithClickable = (html: string | undefined | null): string => {
  if (!html || typeof html !== 'string') {
    return '';
  }
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  return html.replace(emailRegex, (email) => {
    return `<span class="email-link-wrapper" data-email="${email}" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; text-decoration: underline; color: #3b82f6; transition: opacity 0.2s;">${email}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></span>`;
  });
};

interface FooterContentModalProps {
  contentKey: string | null;
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
}

export function FooterContentModal({
  contentKey,
  isOpen,
  onClose,
  isAnimatingClose = false,
}: FooterContentModalProps) {
  const { footerContent: cachedContent } = useModal();
  const [content, setContent] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen && contentKey) {
      // Always fetch fresh content when modal opens to ensure we have the latest data
      // Use cached content as a fallback only if fetch fails
      loadContent();
    } else {
      setContent(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contentKey]);

  const loadContent = async () => {
    if (!contentKey) return;

    try {
      setLoading(true);
      setError(null);

      // Add cache-busting parameter to ensure fresh data
      const url = `/api/landing-content?key=${encodeURIComponent(contentKey)}&_t=${Date.now()}`;
      console.log('[FooterContentModal] Fetching:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      // Log for debugging
      console.log('[FooterContentModal] API Response:', { 
        ok: response.ok, 
        status: response.status, 
        contentKey,
        url,
        hasContent: !!data.content,
        contentType: typeof data.content,
        isArray: Array.isArray(data.content),
        dataKeys: data ? Object.keys(data) : [],
        data 
      });
      
      // Handle 404 or missing content
      if (!response.ok) {
        // API returned an error status
        throw new Error(data.error || `Failed to load content (${response.status})`);
      }

      if (!data.content || (Array.isArray(data.content) && data.content.length === 0)) {
        // Content is missing or empty array
        throw new Error(data.error || "Content not found");
      }
      
      // Ensure data.content is an object with title and content properties
      if (typeof data.content === 'object' && !Array.isArray(data.content)) {
      setContent(data.content);
      } else {
        throw new Error("Invalid content format");
      }
    } catch (err) {
      console.error("Error loading footer content:", err);
      // Fallback to cached content if fetch fails
      if (cachedContent && cachedContent[contentKey]) {
        setContent(cachedContent[contentKey]);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load content");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (delayClose = false) => {
    onClose(delayClose);
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  // Process content to preserve formatting and make emails clickable
  const rawContent = content?.content || '';
  const formattedContent = preserveTextFormatting(rawContent);
  const emails = rawContent ? extractEmails(rawContent) : [];
  let processedContent = formattedContent ? replaceEmailsWithClickable(formattedContent) : '';
  
  // If contact_us, remove emails from content since we display them centered
  if (contentKey === 'contact_us' && emails.length > 0) {
    emails.forEach((email) => {
      // Remove the clickable email wrapper
      const emailRegex = new RegExp(`<span class="email-link-wrapper"[^>]*data-email="${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>.*?</span>`, 'gi');
      processedContent = processedContent.replace(emailRegex, '');
      // Also remove plain email if it wasn't wrapped
      processedContent = processedContent.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    });
    // Clean up any extra whitespace or line breaks left behind
    processedContent = processedContent.replace(/\n\s*\n/g, '\n').trim();
  }

  // Set up click handlers for email links after content is rendered
  useEffect(() => {
    if (!contentRef.current || !content) return;

    const emailLinks = contentRef.current.querySelectorAll('.email-link-wrapper');
    emailLinks.forEach((link) => {
      const email = link.getAttribute('data-email');
      if (email) {
        const clickHandler = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          handleCopyEmail(email);
        };
        link.addEventListener('click', clickHandler);
        
        // Store handler for cleanup
        (link as any)._clickHandler = clickHandler;
      }
    });

    return () => {
      emailLinks.forEach((link) => {
        const handler = (link as any)._clickHandler;
        if (handler) {
          link.removeEventListener('click', handler);
        }
      });
    };
  }, [content, processedContent]);

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isMobile={isMobile}
      enableDragToDismiss={isMobile}
      showDragHandle={isMobile}
      className="bg-[#1a1a1a] text-white"
      maxWidth="2xl"
      fitContent={true}
      maxHeight="screen"
      centerOnDesktop={true}
      overflowClassName="overflow-y-auto overflow-x-hidden"
      isAnimatingClose={isAnimatingClose}
      zIndex={112}
      backdropZIndex={111}
    >
      {/* Header with Close button and Title */}
      <div className="relative px-6 pt-12 pb-8 sm:pt-6">
        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose(false);
          }}
          className="absolute top-12 left-4 sm:top-6 sm:right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title - centered horizontally, aligned vertically with close button */}
        <div className="flex items-center justify-center h-10 sm:h-10 sm:pt-0">
          <h1 className="text-[16px] font-normal text-white">
            {content?.title || 'Loading...'}
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4">
            <p className="text-red-200">{error}</p>
          </div>
        ) : content ? (
          <>
            {/* Show emails centered if contact_us */}
            {contentKey === 'contact_us' && emails.length > 0 && (
              <div className="flex flex-col items-center mb-6">
                {emails.map((email, index) => (
                  <button
                    key={index}
                    onClick={() => handleCopyEmail(email)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/30 text-white transition-colors cursor-pointer mb-2"
                  >
                    <span>{email}</span>
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      className="flex-shrink-0"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    {copiedEmail === email && (
                      <span className="text-green-400 text-sm ml-2">Copied!</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div
              ref={contentRef}
              className="text-white whitespace-pre-wrap"
              style={{
                fontFamily: 'janoSans',
                fontSize: '16px',
                lineHeight: '1.6',
              }}
              dangerouslySetInnerHTML={{ __html: processedContent }}
            />
          </>
        ) : null}
      </div>
    </BaseModal>
  );
}
