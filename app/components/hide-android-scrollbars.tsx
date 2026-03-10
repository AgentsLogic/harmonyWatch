"use client";

import { useEffect } from 'react';

/**
 * Hides all scrollbars on Android by injecting CSS
 * Uses user agent detection (works without Capacitor being loaded)
 */
export function HideAndroidScrollbars() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const ua = navigator.userAgent || '';
    // Detect Android WebView (Capacitor app)
    const isAndroidWebView = /Android/i.test(ua) && (/wv\)/.test(ua) || /; wv\)/.test(ua));
    // Also detect regular Android Chrome in case of testing
    const isAndroid = isAndroidWebView || (/Android/i.test(ua) && /Version\/[.0-9]+ Chrome/i.test(ua));
    
    if (isAndroid || document.documentElement.classList.contains('android')) {
      // Add class to html element
      document.documentElement.classList.add('android');
      
      // Inject CSS to hide all scrollbars
      const styleId = 'hide-android-scrollbars';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          /* Hide all scrollbars on Android */
          .android *,
          .android *::before,
          .android *::after {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          .android *::-webkit-scrollbar,
          .android *::-webkit-scrollbar-track,
          .android *::-webkit-scrollbar-thumb {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            background: transparent !important;
          }
          .android,
          .android html,
          .android body {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          .android::-webkit-scrollbar,
          .android html::-webkit-scrollbar,
          .android body::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  return null;
}
