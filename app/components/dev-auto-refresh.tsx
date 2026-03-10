'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * DevAutoRefresh Component
 * 
 * Automatically refreshes the WebView when Next.js HMR detects changes.
 * Only active in development mode.
 * 
 * Features:
 * - Listens for Next.js HMR events
 * - Detects when app comes to foreground and checks for updates
 * - Provides manual refresh fallback
 * - Works on both iOS and Android
 */
export function DevAutoRefresh() {
  const [isDev, setIsDev] = useState(false);
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    // Only run in development mode
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                         process.env.NEXT_PUBLIC_DEV === 'true';
    
    if (!isDevelopment) {
      return;
    }

    setIsDev(true);

    // Check if we're in a native app (Capacitor)
    const isNative = typeof window !== 'undefined' && 
                     Capacitor.isNativePlatform();

    if (!isNative) {
      // Not in native app, no need for WebView refresh
      return;
    }

    // Listen for Next.js HMR updates
    const handleHMRUpdate = () => {
      console.log('[DevAutoRefresh] HMR update detected');
      setRefreshAvailable(true);
      setLastUpdate(Date.now());
    };

    // Listen for HMR events from Next.js
    if (typeof window !== 'undefined' && (window as any).__NEXT_HMR__) {
      // Next.js HMR is available
      console.log('[DevAutoRefresh] HMR available, listening for updates');
    }

    // Listen for visibility changes (app coming to foreground)
    const handleVisibilityChange = () => {
      if (!document.hidden && refreshAvailable) {
        // App came to foreground and there's an update available
        console.log('[DevAutoRefresh] App returned to foreground with updates available');
        // Trigger refresh
        refreshWebView();
      }
    };

    // Listen for HMR messages (Next.js sends these)
    const handleMessage = (event: MessageEvent) => {
      // Check if this is an HMR update message
      if (event.data && typeof event.data === 'string') {
        if (event.data.includes('__NEXT_HMR__') || 
            event.data.includes('hot-update') ||
            event.data.includes('webpackHotUpdate')) {
          handleHMRUpdate();
        }
      }
    };

    // Listen for custom HMR events
    window.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also check periodically for updates (fallback)
    const checkInterval = setInterval(() => {
      // Check if HMR has updated by comparing build hash or timestamp
      // This is a simple fallback - Next.js HMR should handle most cases
      if (refreshAvailable && !document.hidden) {
        // Update is available and app is in foreground
        refreshWebView();
      }
    }, 5000); // Check every 5 seconds

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(checkInterval);
    };
  }, [refreshAvailable]);

  // Function to refresh the WebView
  const refreshWebView = () => {
    if (typeof window === 'undefined') return;

    try {
      // Try to use Capacitor's reload API if available
      if (Capacitor.isNativePlatform()) {
        // Use window.location.reload() as fallback
        // Capacitor doesn't have a built-in reload method
        window.location.reload();
        console.log('[DevAutoRefresh] WebView refreshed');
      } else {
        // Regular browser refresh
        window.location.reload();
      }
    } catch (error) {
      console.error('[DevAutoRefresh] Error refreshing WebView:', error);
    }
  };

  // Manual refresh button (for testing/debugging)
  if (!isDev) {
    return null;
  }

  // Show a small indicator when refresh is available
  // This is optional - can be removed if not needed
  return (
    <div style={{ display: 'none' }}>
      {/* Hidden component - refresh happens automatically */}
      {refreshAvailable && (
        <div
          style={{
            position: 'fixed',
            top: 10,
            right: 10,
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 9999,
            pointerEvents: 'none'
          }}
        >
          Update available - Refreshing...
        </div>
      )}
    </div>
  );
}
