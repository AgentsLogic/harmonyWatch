import { Capacitor } from '@capacitor/core';

/**
 * Determines if Apple Sign In should be shown based on platform
 * Returns true for web browsers and iOS native app
 * Returns false for Android native app
 */
export function shouldShowAppleSignIn(): boolean {
  if (typeof window === 'undefined') return false; // SSR
  
  try {
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    
    // Show on web OR iOS native
    return !isNative || platform === 'ios';
  } catch {
    // Capacitor not available = web browser
    return true;
  }
}








