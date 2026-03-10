"use client";

import MuxVideo from '@mux/mux-video-react';
import MediaThemeNotflix from 'player.style/notflix/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { createProgressThrottle, saveProgressImmediately, isVideoCompleted, clearVideoProgress } from '@/lib/utils/video-progress';
import { useUser } from '../contexts/user-context';
import Image from 'next/image';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { HarmonySpinner } from './harmony-spinner';

interface MuxVideoPlayerProps {
  playbackId: string;
  title: string;
  contentId: string;  // NEW: For progress tracking
  initialTime?: number;  // NEW: Auto-resume from this time
  videoDuration?: number;  // NEW: For progress calculations
  onTimeUpdate?: (currentTime: number, duration: number) => void;  // NEW
  thumbnailUrl?: string | null;
  autoplay?: boolean;
  muted?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onReady?: () => void;
  onLoadingChange?: (isLoading: boolean) => void;
  className?: string;
  isPipMode?: boolean;  // If true, hide all controls (for PiP mode)
  // Premium preview props
  isPremiumPreview?: boolean;  // If true, user is watching premium content as free user
  previewLimitSeconds?: number;  // Time limit for preview (default: 300 = 5 minutes)
  onPreviewLimitReached?: () => void;  // Callback when preview limit is reached
  onUpgradeClick?: () => void;  // Callback when user clicks upgrade button
  onFullscreenChange?: (isFullscreen: boolean) => void;  // Callback when custom fullscreen mode changes
  onPictureInPictureChange?: (isInPictureInPicture: boolean) => void;  // Callback when PiP mode changes
  onTriggerPipMode?: () => void;  // Callback to trigger custom PiP mode
}

export function MuxVideoPlayer({
  playbackId,
  title,
  contentId,
  initialTime = 0,
  videoDuration = 0,
  onTimeUpdate,
  thumbnailUrl,
  autoplay = false,
  muted = false,
  onPlay,
  onPause,
  onEnded,
  onError,
  onReady,
  onLoadingChange,
  className = "w-full aspect-video",
  isPipMode = false,
  isPremiumPreview = false,
  previewLimitSeconds = 300, // 5 minutes default
  onPreviewLimitReached,
  onUpgradeClick,
  onFullscreenChange,
  onPictureInPictureChange,
  onTriggerPipMode
}: MuxVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const muxVideoRef = useRef<any>(null);
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [hasSetInitialTime, setHasSetInitialTime] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showCenterButton, setShowCenterButton] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [qualityControlOpacity, setQualityControlOpacity] = useState(1);
  const qualityControlRef = useRef<HTMLDivElement>(null);
  const showQualityMenuRef = useRef(false);
  const isQualityControlHoveredRef = useRef(false);
  const [qualityControlHovered, setQualityControlHovered] = useState(false);
  const [previewLimitReached, setPreviewLimitReached] = useState(false);
  const [isCustomFullscreen, setIsCustomFullscreen] = useState(false);
  const isCustomFullscreenRef = useRef(false);
  const isExitingFullscreenRef = useRef(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const fullscreenDimsRef = useRef({ w: 0, h: 0 });
  const [showFullscreenBackdrop, setShowFullscreenBackdrop] = useState(false);
  const backdropTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [landscapeDirection, setLandscapeDirection] = useState<'left' | 'right'>('right'); // Default to right rotation
  const [isInFullscreen, setIsInFullscreen] = useState(false); // Track if we're in fullscreen
  const [isAutoRotateEnabled, setIsAutoRotateEnabled] = useState<boolean | null>(null); // Track system auto-rotate setting
  const [isIOSNative, setIsIOSNative] = useState(false); // Track if running on iOS native app
  const [isAndroidNative, setIsAndroidNative] = useState(false); // Track if running on Android native app
  const usesNativeRotation = isIOSNative || isAndroidNative; // Both platforms use native rotation for fullscreen
  const currentTiltRef = useRef<{ gamma: number | null; beta: number | null }>({ gamma: null, beta: null }); // Track current device tilt for manual fullscreen
  const mediaThemeRef = useRef<HTMLElement | null>(null);
  // Quality control state
  const [availableRenditions, setAvailableRenditions] = useState<Array<{ id: string; width?: number; height?: number; bitrate?: number; label: string }>>([]);
  const [currentRendition, setCurrentRendition] = useState<{ id: string; label: string } | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const handleQualityChangeRef = useRef<((renditionId: string) => void) | null>(null);
  
  // Quality change via component re-mount (works on iOS)
  const [qualityParams, setQualityParams] = useState('');
  const [remountKey, setRemountKey] = useState(0);
  const storedTimeRef = useRef<number>(0);
  const wasPlayingBeforeQualityChangeRef = useRef<boolean>(false);
  
  // HTML5 Picture-in-Picture state
  const [isInPictureInPicture, setIsInPictureInPicture] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  
  

  const handleLoadStart = () => {
    setIsLoading(true);
    onLoadingChange?.(true);
    setError(null);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
    onLoadingChange?.(false);
    
    // Set muted state after it can play (all platforms)
    if (videoRef.current) {
      const videoElement = videoRef.current;
      // Use prop value if provided, otherwise default to false
      videoElement.muted = muted ?? false;
    }
    
    // Restore playback position after quality change remount
    if (storedTimeRef.current > 0 && videoRef.current) {
      console.log('[Quality Control] Restoring position after quality change:', storedTimeRef.current);
      videoRef.current.currentTime = storedTimeRef.current;
      storedTimeRef.current = 0;
      
      // Resume playback if it was playing before quality change
      if (wasPlayingBeforeQualityChangeRef.current) {
        console.log('[Quality Control] Resuming playback after quality change');
        videoRef.current.play().catch(err => {
          console.log('[Quality Control] Could not auto-resume:', err);
        });
        wasPlayingBeforeQualityChangeRef.current = false;
      }
    }
    
    // IMPORTANT: Notify Android that video is ready/playing EARLY
    // This is needed because the 'play' event fires too late (after onUserLeaveHint)
    // By setting this when the video can play AND is not paused, we ensure PiP can trigger
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const videoElement = videoRef.current;
      // Check if video is playing or about to play (autoplay)
      if (videoElement && (!videoElement.paused || autoplay)) {
        console.log('[MuxVideoPlayer] Video ready/playing - notifying Android for PiP', {
          paused: videoElement.paused,
          autoplay,
          readyState: videoElement.readyState
        });
        if ((window as any).AndroidFullScreen?.setVideoPlaying) {
          try {
            (window as any).AndroidFullScreen.setVideoPlaying(true);
            console.log('[MuxVideoPlayer] Set Android video playing state to true (from handleCanPlay)');
          } catch (err) {
            console.error('[MuxVideoPlayer] Error setting video playing state:', err);
          }
        }
      }
    }
    
    onReady?.();
  };

  const handleError = (event: any) => {
    const errorMessage = 'Failed to load Mux video';
    setError(errorMessage);
    setIsLoading(false);
    onLoadingChange?.(false);
    onError?.(errorMessage);
    console.error('Mux Player error:', event);
  };

  // Check if mobile and detect native platforms
  useEffect(() => {
    const checkMobile = () => {
      // On native platforms (iOS and Android), when in custom fullscreen, always use mobile theme
      // (even though viewport is landscape and width > 640px, we want mobile player)
      const isNative = Capacitor.isNativePlatform();
      if (isNative && isCustomFullscreenRef.current) {
        setIsMobile(true);
        return;
      }
      
      // Don't change isMobile during custom fullscreen or during exit rotation
      // to prevent theme reload and shadow DOM thrashing
      if (isCustomFullscreenRef.current || isExitingFullscreenRef.current) return;
      setIsMobile(window.innerWidth < 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect native platforms (skip CSS rotation on native, use native rotation instead)
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    setIsIOSNative(isNative && Capacitor.getPlatform() === 'ios');
    setIsAndroidNative(isNative && Capacitor.getPlatform() === 'android');
  }, []);

  // Check if HTML5 Picture-in-Picture is supported
  useEffect(() => {
    const checkPiPSupport = () => {
      if (typeof document === 'undefined') return;
      
      // Check if PiP API is available
      const hasPiPAPI = 'pictureInPictureEnabled' in document || 
                       ('requestPictureInPicture' in HTMLVideoElement.prototype);
      
      if (hasPiPAPI) {
        const supported = document.pictureInPictureEnabled !== false; // Check if not explicitly disabled
        setIsPiPSupported(supported);
        // Only log once when video element is ready
        if (videoRef.current) {
        console.log('[MuxVideoPlayer] HTML5 PiP support check:', {
          hasPiPAPI,
          pictureInPictureEnabled: document.pictureInPictureEnabled,
          videoElementReady: !!videoRef.current,
          supported
        });
        }
      } else {
        console.log('[MuxVideoPlayer] HTML5 PiP API not available in this browser');
        setIsPiPSupported(false);
      }
    };
    
    // Check immediately (can determine support without video element)
    checkPiPSupport();
    
    // If video element is already ready, we're done
    if (videoRef.current) {
      return; // No need for intervals
    }
    
    // Also check when video element becomes available
    const checkInterval = setInterval(() => {
      if (videoRef.current) {
        checkPiPSupport();
        clearInterval(checkInterval);
        clearInterval(interval); // Also clear the other interval
      }
    }, 500);
    
    // Also check periodically in case video element isn't ready yet (max 20 seconds)
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts++;
      if (videoRef.current) {
        // Video element is ready, check and stop
      checkPiPSupport();
        clearInterval(interval);
        clearInterval(checkInterval);
      } else if (attempts >= maxAttempts) {
        // Max attempts reached, stop checking
        clearInterval(interval);
      }
      // Don't call checkPiPSupport() here - only when video element is ready
    }, 1000);
    
    return () => {
      clearInterval(checkInterval);
      clearInterval(interval);
    };
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isCustomFullscreenRef.current = isCustomFullscreen;
  }, [isCustomFullscreen]);

  // Notify parent when custom fullscreen mode changes
  useEffect(() => {
    onFullscreenChange?.(isCustomFullscreen);
  }, [isCustomFullscreen, onFullscreenChange]);

  // Delayed backdrop removal to prevent exit-from-landscape flash
  useEffect(() => {
    if (isCustomFullscreen) {
      setShowFullscreenBackdrop(true);
      isExitingFullscreenRef.current = false; // Clear exit guard on re-entry
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
    } else {
      // Set exit guard to prevent isMobile thrashing during iOS rotation
      isExitingFullscreenRef.current = true;
      // Delay backdrop removal to cover iOS rotation animation
      backdropTimeoutRef.current = setTimeout(() => {
        setShowFullscreenBackdrop(false);
        isExitingFullscreenRef.current = false; // Lift isMobile guard after rotation completes
      }, 500); // Covers the ~300ms iOS rotation + buffer
    }
    return () => {
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
    };
  }, [isCustomFullscreen]);

  // Reset orientation tracking when exiting fullscreen to allow same direction to trigger again
  const orientationTrackingRef = useRef<{
    currentOrientation: 'portrait' | 'landscape-left' | 'landscape-right';
    debounceTimeout: NodeJS.Timeout | null;
  } | null>(null);

  // Hide/show status bar and navigation bar on fullscreen toggle
  useEffect(() => {
    const handleFullscreenUI = async () => {
      // Only apply on mobile native platforms
      if (!isMobile || !Capacitor.isNativePlatform()) return;
      
      try {
        if (isCustomFullscreen) {
          // Entering fullscreen - hide UI
          await StatusBar.hide();
          
          // Android: Use unified setCustomFullscreen method (handles rotation + immersive mode)
          if (Capacitor.getPlatform() === 'android') {
            if ((window as any).AndroidFullScreen && (window as any).AndroidFullScreen.setCustomFullscreen) {
              (window as any).AndroidFullScreen.setCustomFullscreen(true);
            }
          }
          
          // iOS: Use orientation bridge
          if (Capacitor.getPlatform() === 'ios') {
            if ((window as any).iOSOrientation) {
              (window as any).iOSOrientation.setCustomFullscreen(true);
            }
          }
        } else {
          // Exiting fullscreen - show UI
          await StatusBar.show();
          
          // Android: Use unified setCustomFullscreen method (handles rotation + immersive mode)
          if (Capacitor.getPlatform() === 'android') {
            if ((window as any).AndroidFullScreen && (window as any).AndroidFullScreen.setCustomFullscreen) {
              (window as any).AndroidFullScreen.setCustomFullscreen(false);
            }
          }
          
          // iOS: Lock orientation back to portrait
          if (Capacitor.getPlatform() === 'ios') {
            if ((window as any).iOSOrientation) {
              (window as any).iOSOrientation.setCustomFullscreen(false);
            }
          }
        }
      } catch (error) {
        console.error('Error toggling fullscreen UI:', error);
      }
    };

    handleFullscreenUI();
  }, [isCustomFullscreen, isMobile]);

  // Detect native landscape via matchMedia (iOS and Android both use native rotation)
  useEffect(() => {
    // When not in fullscreen, reset isLandscape and skip listener setup
    if (!isMobile || !isCustomFullscreen) {
      // Delay resetting isLandscape when exiting fullscreen to prevent video reload
      // This matches the backdrop removal delay to keep video playing during exit animation
      if (!isCustomFullscreen && isLandscape) {
        // We're exiting fullscreen - delay the reset to prevent video reload
        const timeout = setTimeout(() => {
          setIsLandscape(false);
        }, 500); // Match the backdrop removal delay
        return () => clearTimeout(timeout);
      }
      setIsLandscape(false); // Reset on exit to prevent stale state on re-entry
      return;
    }
    // Only use matchMedia on native platforms (iOS and Android both use native rotation)
    const isNative = Capacitor.isNativePlatform();
    if (!isNative) return;

    const mql = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent) => {
      setIsLandscape(e.matches);
    };
    // Set initial value
    setIsLandscape(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [isMobile, isCustomFullscreen, isLandscape]);

  // Check system auto-rotate setting on mount
  useEffect(() => {
    if (!isMobile || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    
    const checkAutoRotate = () => {
      if ((window as any).AndroidFullScreen && (window as any).AndroidFullScreen.isAutoRotateEnabled) {
        const enabled = (window as any).AndroidFullScreen.isAutoRotateEnabled();
        setIsAutoRotateEnabled(enabled);
      } else {
        // If method not available, assume enabled (fallback)
        setIsAutoRotateEnabled(true);
      }
    };
    
    // Check immediately
    checkAutoRotate();
    
    // Also check periodically in case user changes setting
    const interval = setInterval(checkAutoRotate, 2000);
    
    return () => clearInterval(interval);
  }, [isMobile]);

  // Track device orientation using accelerometer and auto-enter/exit fullscreen on rotation
  // We use DeviceOrientationEvent because the screen is locked to portrait,
  // so screen.orientation events don't fire
  // NOTE: Auto-rotation only works if system auto-rotate is enabled
  useEffect(() => {
    // Only on mobile native platforms (specifically Android where screen is locked to portrait)
    if (!isMobile || !Capacitor.isNativePlatform()) return;
    
    // Only skip if we've confirmed auto-rotate is disabled (not if it's null/unknown)
    // If isAutoRotateEnabled is null, we'll still try to set up orientation tracking
    // This allows it to work even if the check hasn't completed yet
    if (isAutoRotateEnabled === false) {
      console.log('[MuxVideoPlayer] Auto-rotate is disabled, skipping orientation tracking');
      return;
    }
    
    console.log('[MuxVideoPlayer] Setting up orientation tracking', {
      isAutoRotateEnabled,
      isMobile,
      platform: Capacitor.getPlatform(),
      hasDeviceOrientationEvent: !!window.DeviceOrientationEvent
    });
    
    // Initialize tracking ref if not exists
    if (!orientationTrackingRef.current) {
      orientationTrackingRef.current = {
        currentOrientation: 'portrait',
        debounceTimeout: null
      };
    }
    
    const tracking = orientationTrackingRef.current;
    let debounceTimeout = tracking.debounceTimeout;
    let currentOrientation = tracking.currentOrientation;
    
    // Use native Android sensor data if available, otherwise fall back to DeviceOrientationEvent
    const useNativeSensor = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && 
                            typeof (window as any).AndroidFullScreen !== 'undefined' &&
                            typeof (window as any).AndroidFullScreen.getOrientationData === 'function';
    
    const handleDeviceOrientation = (event: DeviceOrientationEvent | { gamma: number | null; beta: number | null }) => {
      // gamma: left-to-right tilt in degrees (-90 to 90)
      // positive gamma = tilted right, negative gamma = tilted left
      // beta: front-to-back tilt in degrees (-180 to 180)
      // beta near 0 = device upright, beta > 0 = tilted back, beta < 0 = tilted forward
      if (event.gamma === null && event.beta === null) return;
      
      // Always track current tilt for manual fullscreen (even if auto-rotate is disabled)
      currentTiltRef.current = {
        gamma: event.gamma,
        beta: event.beta !== null ? event.beta : null
      };
      
      // Read thresholds dynamically from localStorage (allows real-time adjustment via debug panel)
      const getThreshold = (key: string, defaultValue: number): number => {
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = parseFloat(stored);
            if (!isNaN(parsed)) return parsed;
          }
        }
        return defaultValue;
      };
      
      const LANDSCAPE_THRESHOLD = getThreshold('orientation_debug_landscape_threshold', 50);
      const PORTRAIT_THRESHOLD = getThreshold('orientation_debug_portrait_threshold', 20);
      
      const gamma = event.gamma ?? 0;
      const absGamma = Math.abs(gamma);
      const beta = event.beta !== null && event.beta !== undefined ? event.beta : 90;
      
      // Check if device is being held upright (not flat)
      // Beta ≈ 90° when upright, ≈ 0° when flat face-up, ≈ ±180° when flat face-down
      // Device is "upright" if beta is between 45° and 135°
      const isDeviceUpright = beta > 45 && beta < 135;
      
      let newOrientation: 'portrait' | 'landscape-left' | 'landscape-right' = currentOrientation;
      
      // Determine orientation based on left-right tilt (gamma)
      // Beta is only used to prevent false portrait detection when device is flat
      if (absGamma > LANDSCAPE_THRESHOLD) {
        // Device is tilted enough to be landscape
        if (gamma > 0) {
          newOrientation = 'landscape-right';
        } else {
          newOrientation = 'landscape-left';
        }
      } else if (absGamma < PORTRAIT_THRESHOLD && isDeviceUpright) {
        // Device is upright AND not tilted left/right → portrait
        // Only exit to portrait if device is actually being held upright (not flat)
        // This prevents exiting fullscreen when tilting the device backwards
        newOrientation = 'portrait';
      }
      // If between thresholds or device is flat, keep current orientation (hysteresis)
      
      // Only act on orientation change
      if (newOrientation !== currentOrientation) {
        // Clear any pending debounce
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
          debounceTimeout = null;
          tracking.debounceTimeout = null;
        }
        
        // Update tracking immediately
        currentOrientation = newOrientation;
        tracking.currentOrientation = newOrientation;
        
        // Handle portrait exit immediately (no debounce) for consistent behavior
        if (newOrientation === 'portrait') {
          // Rotated back to portrait - exit fullscreen immediately
          if (isCustomFullscreenRef.current) {
            setIsCustomFullscreen(false);
          }
        } else {
          // Rotated to landscape - enter fullscreen with debounce
          // Prevent entering fullscreen when in PiP mode
          if (isPipMode) {
            // Don't enter fullscreen if we're in PiP mode
            return;
          }
          
          debounceTimeout = setTimeout(() => {
            // Double-check PiP mode hasn't changed during debounce
            if (isPipMode) {
              debounceTimeout = null;
              tracking.debounceTimeout = null;
              return;
            }
            
            // Rotated to landscape - enter fullscreen
            // NOTE: Keep isLandscape = false because the SCREEN is still portrait (locked)
            // The CSS rotation will be applied since !isLandscape is true
            // 
            // Rotation direction mapping:
            // - Device tilted RIGHT (gamma > 0) → video rotates CLOCKWISE (90deg) → 'right'
            // - Device tilted LEFT (gamma < 0) → video rotates COUNTERCLOCKWISE (-90deg) → 'left'
            if (newOrientation === 'landscape-left') {
              // Device tilted left → video rotates counterclockwise
              setLandscapeDirection('left');
            } else {
              // Device tilted right → video rotates clockwise
              setLandscapeDirection('right');
            }
            if (!isCustomFullscreenRef.current) {
              // On native platforms (iOS and Android), immediately set landscape to true so video fills screen
              // Native platforms will rotate natively via AppDelegate/MainActivity
              const isNative = Capacitor.isNativePlatform();
              if (isNative) {
                setIsLandscape(true);
                // Force isMobile to true on native when entering fullscreen
                // This prevents desktop theme from loading when native rotates to landscape
                setIsMobile(true);
              }
              
              // Capture full screen dimensions before entering fullscreen
              // Use screen.width/height instead of window.innerWidth/Height to account for status bar
              fullscreenDimsRef.current = { w: screen.width, h: screen.height };
              setIsCustomFullscreen(true);
            }
            debounceTimeout = null;
            tracking.debounceTimeout = null;
          }, 150); // 150ms debounce for landscape entry
          tracking.debounceTimeout = debounceTimeout;
        }
      }
    };
    
    // Use native Android sensor data if available, otherwise fall back to DeviceOrientationEvent
    if (useNativeSensor) {
      console.log('[MuxVideoPlayer] Using native Android sensor for orientation data');
      const interval = setInterval(() => {
        if ((window as any).AndroidFullScreen && (window as any).AndroidFullScreen.getOrientationData) {
          try {
            const data = (window as any).AndroidFullScreen.getOrientationData();
            if (data) {
              const { gamma, beta } = JSON.parse(data);
              handleDeviceOrientation({ gamma, beta });
            }
          } catch (err) {
            console.error('[MuxVideoPlayer] Error getting orientation data:', err);
          }
        }
      }, 16); // ~60fps
      
      return () => {
        clearInterval(interval);
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
          tracking.debounceTimeout = null;
        }
      };
    } else if (window.DeviceOrientationEvent) {
      // Fallback to DeviceOrientationEvent for iOS/web
      let listenerAdded = false;
      
      const addListener = () => {
        if (listenerAdded) return;
        console.log('[MuxVideoPlayer] Adding DeviceOrientationEvent listener');
      window.addEventListener('deviceorientation', handleDeviceOrientation);
        listenerAdded = true;
      };
      
      // Request permission for DeviceOrientationEvent (required on iOS 13+ and some Android versions)
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        console.log('[MuxVideoPlayer] Requesting DeviceOrientationEvent permission...');
        (DeviceOrientationEvent as any).requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              console.log('[MuxVideoPlayer] DeviceOrientationEvent permission granted');
              addListener();
            } else {
              console.warn('[MuxVideoPlayer] DeviceOrientationEvent permission denied:', response);
            }
          })
          .catch((error: Error) => {
            console.error('[MuxVideoPlayer] Error requesting DeviceOrientationEvent permission:', error);
            // Fallback: try to add listener anyway
            addListener();
          });
      } else {
        // Permission API not available (likely Android or older iOS)
        console.log('[MuxVideoPlayer] DeviceOrientationEvent permission API not available');
        // On Android WebView, DeviceOrientationEvent might require user interaction first
        // Try adding listener immediately, and also on first user interaction
        addListener();
        
        // Also add on first user interaction (required on some Android WebViews)
        const addOnInteraction = () => {
          if (!listenerAdded) {
            console.log('[MuxVideoPlayer] Adding DeviceOrientationEvent listener on user interaction');
            addListener();
          }
          // Remove after first interaction
          document.removeEventListener('touchstart', addOnInteraction);
          document.removeEventListener('click', addOnInteraction);
        };
        document.addEventListener('touchstart', addOnInteraction, { once: true });
        document.addEventListener('click', addOnInteraction, { once: true });
      }
      
      // Test if events are actually firing (for debugging)
      const testHandler = (event: DeviceOrientationEvent) => {
        console.log('[MuxVideoPlayer] DeviceOrientationEvent is firing!', {
          gamma: event.gamma,
          beta: event.beta,
          alpha: event.alpha
        });
        window.removeEventListener('deviceorientation', testHandler);
      };
      window.addEventListener('deviceorientation', testHandler);
      // Remove test handler after 10 seconds
      setTimeout(() => {
        window.removeEventListener('deviceorientation', testHandler);
      }, 10000);
    
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        tracking.debounceTimeout = null;
      }
        if (window.DeviceOrientationEvent && listenerAdded) {
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
      }
    };
    } else {
      console.warn('[MuxVideoPlayer] DeviceOrientationEvent not supported and native sensor not available');
      return () => {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
          tracking.debounceTimeout = null;
        }
      };
    }
  }, [isMobile, isAutoRotateEnabled, isPipMode]);

  // Track device tilt even when auto-rotate is disabled (for manual fullscreen)
  useEffect(() => {
    if (!isMobile || !Capacitor.isNativePlatform()) return;
    
    // Only track tilt if auto-rotate is disabled (we need it for manual fullscreen)
    if (isAutoRotateEnabled !== false) return;
    
    // Use native Android sensor data if available, otherwise fall back to DeviceOrientationEvent
    const useNativeSensor = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && 
                            typeof (window as any).AndroidFullScreen !== 'undefined' &&
                            typeof (window as any).AndroidFullScreen.getOrientationData === 'function';
    
    if (useNativeSensor) {
      console.log('[MuxVideoPlayer] Using native Android sensor for manual fullscreen tilt tracking');
      const interval = setInterval(() => {
        if ((window as any).AndroidFullScreen && (window as any).AndroidFullScreen.getOrientationData) {
          try {
            const data = (window as any).AndroidFullScreen.getOrientationData();
            if (data) {
              const { gamma, beta } = JSON.parse(data);
              // Track current tilt for manual fullscreen
              currentTiltRef.current = {
                gamma: gamma,
                beta: beta !== null ? beta : null
              };
            }
          } catch (err) {
            console.error('[MuxVideoPlayer] Error getting native orientation data for manual fullscreen:', err);
          }
        }
      }, 100); // Poll at 10fps (less frequent than main tracking)
      
      return () => clearInterval(interval);
    } else {
      // Fall back to DeviceOrientationEvent
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma === null) return;
      // Track current tilt for manual fullscreen
      currentTiltRef.current = {
        gamma: event.gamma,
        beta: event.beta !== null ? event.beta : null
      };
    };
    
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleDeviceOrientation);
    }
    
    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
      }
    };
    }
  }, [isMobile, isAutoRotateEnabled]);

  // Reset orientation tracking when exiting fullscreen to allow same direction to trigger again
  useEffect(() => {
    if (!isMobile || !Capacitor.isNativePlatform()) return;
    
    if (!isCustomFullscreen && orientationTrackingRef.current) {
      // Reset orientation tracking when exiting fullscreen
      // This allows the same landscape direction to trigger again
      orientationTrackingRef.current.currentOrientation = 'portrait';
      if (orientationTrackingRef.current.debounceTimeout) {
        clearTimeout(orientationTrackingRef.current.debounceTimeout);
        orientationTrackingRef.current.debounceTimeout = null;
      }
    }
  }, [isCustomFullscreen, isMobile]);

  // Track if renditions have been fetched for this playbackId
  const renditionsFetchedRef = useRef<string | null>(null);

  // Fetch available renditions from server-side API
  useEffect(() => {
    if (!playbackId || isLoading) return;
    
    // Only fetch once per playbackId
    if (renditionsFetchedRef.current === playbackId) return;

    const fetchRenditions = async () => {
      try {
        const response = await fetch(`/api/video/renditions?playbackId=${playbackId}`);
        
        if (!response.ok) {
          console.warn('[Quality Control] Failed to fetch renditions:', response.status);
          return;
        }

        const data = await response.json();
        
        if (data.renditions && data.renditions.length > 0) {
          // Map API renditions to component format, filtering out any existing "auto"
          const renditions = data.renditions
            .filter((r: { id: string }) => r.id !== 'auto') // Remove any existing "auto" from API
            .map((r: { id: string; width?: number; height?: number; bitrate?: number; label: string }) => ({
              id: r.id,
              width: r.width,
              height: r.height,
              bitrate: r.bitrate,
              label: r.label
            }));
          
          // Add "Auto" option at the beginning
          const autoRendition = { id: 'auto', label: 'Auto' };
          setAvailableRenditions([autoRendition, ...renditions]);
          
          // Set initial rendition to Auto (only on first fetch)
          setCurrentRendition(autoRendition);
          
          // Mark as fetched for this playbackId
          renditionsFetchedRef.current = playbackId;
        }
      } catch (error) {
        console.error('[Quality Control] Error fetching renditions:', error);
      }
    };

    fetchRenditions();
  }, [playbackId, isLoading]);

  // Set muted state after video loads (all platforms)
  useEffect(() => {
    if (videoRef.current) {
      const videoElement = videoRef.current;
      // Use prop value if provided, otherwise default to false
      const shouldBeMuted = muted ?? false;
      videoElement.muted = shouldBeMuted;
    }
  }, [muted]);

  // Click outside handler for quality menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Use composedPath to check across shadow DOM boundaries
      const composedPath = event.composedPath?.() || [];
      
      for (const el of composedPath) {
        if (el instanceof Element) {
          // Check for regular quality menu
          if (qualityMenuRef.current && (el === qualityMenuRef.current || qualityMenuRef.current.contains(el))) {
            return; // Don't close - clicked inside regular menu
          }
          // Check for quality elements (in shadow DOM - both fullscreen and desktop)
          if (el.id === 'quality-menu-fullscreen' || 
              el.id === 'quality-control-fullscreen-container' ||
              el.id === 'quality-button-fullscreen' ||
              el.id === 'quality-menu-desktop' ||
              el.id === 'quality-control-desktop-container' ||
              el.id === 'quality-button-desktop' ||
              el.classList?.contains('quality-control-desktop') ||
              el.classList?.contains('quality-menu-desktop')) {
            return; // Don't close - clicked inside quality menu
          }
        }
      }
      
      setShowQualityMenu(false);
    };

    if (showQualityMenu) {
      // Small delay to avoid immediate closure from the click that opened the menu
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('touchstart', handleClickOutside, true);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside, true);
        document.removeEventListener('touchstart', handleClickOutside, true);
      };
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [showQualityMenu]);
  
  // Set muted state when video starts playing (for autoplay scenarios, all platforms)
  useEffect(() => {
    if (isPlaying && videoRef.current) {
      const videoElement = videoRef.current;
      const shouldBeMuted = muted ?? false;
      videoElement.muted = shouldBeMuted;
    }
  }, [isPlaying, muted]);

  // Function to schedule button hide (matching Mux controls timing)
  const scheduleHide = useCallback(() => {
    if (!isMobile || !isPlaying) return;
    
    // Clear any existing timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    // Hide after 2 seconds to match Mux controls fade-out timing exactly
    hideTimeoutRef.current = setTimeout(() => {
      setShowCenterButton(false);
    }, 2000);
  }, [isMobile, isPlaying]);

  // Handle button visibility with fade out (like Mux controls)
  useEffect(() => {
    if (!isMobile) return;

    // Clear any existing timeouts
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }

    if (isPlaying) {
      // When playing, show button and schedule fade out immediately
      setShowCenterButton(true);
      // Schedule hide immediately to match Mux controls timing
      scheduleHide();
      return () => {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
        if (interactionTimeoutRef.current) {
          clearTimeout(interactionTimeoutRef.current);
        }
      };
    } else {
      // When paused, always show button
      setShowCenterButton(true);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, [isPlaying, isMobile, scheduleHide]);

  // Handle initial tap when controls are hidden - only reveal controls, don't trigger actions
  const handleRevealTap = useCallback((e: React.TouchEvent) => {
    if (!isMobile || showCenterButton) return;
    
    // Prevent event from reaching MediaThemeNotflix touch handlers
    e.preventDefault();
    e.stopPropagation();
    
    // iOS activation: Use first touch to activate video element
    // This enables custom controls to work - we're in a user gesture context here
    if (videoRef.current) {
      const videoElement = videoRef.current;
      // Track if we've already activated (only do this once)
      if (!videoElement.dataset.iosActivated) {
        videoElement.dataset.iosActivated = 'true';
        
        // If video is playing (autoplay), do a brief pause/play to activate controls
        // This works because we're in a user gesture context (user just touched screen)
        if (!videoElement.paused) {
          videoElement.pause();
          setTimeout(() => {
            if (videoElement) {
              videoElement.play().catch(() => {
                // Ignore errors
              });
            }
          }, 10);
        } else {
          // If paused, just try to play (this activates controls)
          videoElement.play().catch(() => {
            // Ignore errors
          });
        }
      }
    }
    
    // Clear debounce timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
    
    // Show controls immediately (this is the reveal tap)
    setShowCenterButton(true);
    
    // If playing, schedule hide after interaction
    if (isPlaying) {
      // Debounce to avoid too many calls when scheduling hide
      interactionTimeoutRef.current = setTimeout(() => {
        // Schedule hide again after interaction
        scheduleHide();
      }, 100);
    }
    // If paused, button stays visible (no auto-hide)
  }, [isMobile, isPlaying, scheduleHide, showCenterButton]);

  // Show button on user interaction (touch/mouse move) - debounced
  const handleUserInteraction = useCallback(() => {
    if (!isMobile) return;
    
    // If controls are hidden, this shouldn't be called (handleRevealTap handles it)
    // This is for when controls are already visible
    if (!showCenterButton) return;
    
    // Clear debounce timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
    
    // Show immediately
    setShowCenterButton(true);
    
    // If playing, schedule hide after interaction
    if (isPlaying) {
      // Debounce to avoid too many calls when scheduling hide
      interactionTimeoutRef.current = setTimeout(() => {
        // Schedule hide again after interaction
        scheduleHide();
      }, 100);
    }
    // If paused, button stays visible (no auto-hide)
  }, [isMobile, isPlaying, scheduleHide, showCenterButton]);

  const handlePlay = () => {
    // Prevent playing if preview limit reached
    if (isPremiumPreview && previewLimitReached) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      return;
    }
    setIsPlaying(true);
    onPlay?.();
  };

  const handlePause = () => {
    setIsPlaying(false);
    onPause?.();
  };



  const handleEnded = () => {
    setIsPlaying(false);
    onEnded?.();
  };

  // Quality change handler - works on iOS via component remount
  const handleQualityChange = useCallback((renditionId: string) => {
    console.log('[Quality Control] handleQualityChange called, renditionId:', renditionId);
    
    // Find the selected rendition
    const selectedRendition = availableRenditions.find(r => r.id === renditionId);
    if (!selectedRendition) {
      console.warn('[Quality Control] Rendition not found:', renditionId);
      return;
    }

    // Get video element to store current state
    let videoElement = videoRef.current;
    if (!videoElement || videoElement.tagName !== 'VIDEO') {
      const mediaTheme = document.querySelector('media-theme-notflix');
      if (mediaTheme?.shadowRoot) {
        videoElement = mediaTheme.shadowRoot.querySelector('video');
      }
      if (!videoElement) {
        videoElement = document.querySelector('video');
      }
    }

    // Store current playback state for restoration after remount
    if (videoElement) {
      storedTimeRef.current = videoElement.currentTime;
      wasPlayingBeforeQualityChangeRef.current = !videoElement.paused;
      console.log('[Quality Control] Storing state - time:', storedTimeRef.current, 'wasPlaying:', wasPlayingBeforeQualityChangeRef.current);
    }

    // Build quality params for the playbackId
    let newQualityParams = '';
    if (renditionId !== 'auto' && selectedRendition.height) {
      newQualityParams = `min_resolution=${selectedRendition.height}p&max_resolution=${selectedRendition.height}p`;
    }
    
    console.log('[Quality Control] Setting quality params:', newQualityParams || '(auto)');
    
    // Update state - this triggers MuxVideo remount with new playbackId
    setQualityParams(newQualityParams);
    setCurrentRendition(selectedRendition);
    setShowQualityMenu(false);
    setRemountKey(k => k + 1); // Force component remount
    
    console.log('[Quality Control] Quality change initiated, component will remount');
  }, [availableRenditions]);

  // Keep ref updated with latest handleQualityChange function
  useEffect(() => {
    handleQualityChangeRef.current = handleQualityChange;
  }, [handleQualityChange]);

  // Style and position Notflix theme's center play button on mobile
  useEffect(() => {
    if (!isMobile) return;
    
    let intervalId: NodeJS.Timeout;
    let observers: MutationObserver[] = [];
    let isStyled = false;
    let lastOpacity = '';
    
    const styleNotflixButton = () => {
      // Skip styling if in PiP mode (controls should be hidden)
      // isInPictureInPicture includes Android native PiP mode (set via androidpipchange event)
      if (isInPictureInPicture || isPipMode) {
        return;
      }
      
      // Find MediaThemeNotflix component
      const mediaTheme = videoRef.current?.closest('media-theme-notflix') as any;
      if (!mediaTheme) {
        return;
      }

      // Try multiple ways to find the center play button
      let centerButton: HTMLElement | null = null;
      
      if (mediaTheme.shadowRoot) {
        // Try various selectors - Media Chrome uses different parts
        const selectors = [
          '[part="center play button"]',
          '[part="centerPlayButton"]',
          'media-play-button',
          'button[aria-label*="play" i]',
          'button[aria-label*="Play" i]',
          '.center-play-button',
          '[class*="center"]',
          '[class*="play-button"]',
          'button.center',
          'media-control-bar button'
        ];
        
        for (const selector of selectors) {
          centerButton = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
          if (centerButton) {
            break;
          }
        }
        
        // If still not found, try finding by position (centered button)
        if (!centerButton) {
          const allButtons = mediaTheme.shadowRoot.querySelectorAll('button') as NodeListOf<HTMLElement>;
          allButtons.forEach((btn: HTMLElement) => {
            const rect = btn.getBoundingClientRect();
            const parentRect = mediaTheme.getBoundingClientRect();
            const centerX = parentRect.left + parentRect.width / 2;
            const centerY = parentRect.top + parentRect.height / 2;
            const btnCenterX = rect.left + rect.width / 2;
            const btnCenterY = rect.top + rect.height / 2;
            
            // If button is roughly centered, it's likely the center play button
            if (Math.abs(btnCenterX - centerX) < 100 && Math.abs(btnCenterY - centerY) < 100) {
              centerButton = btn;
            }
          });
        }
      }

      // Find skip buttons first (needed for hiding logic)
      let skipBackButton: HTMLElement | null = null;
      let skipForwardButton: HTMLElement | null = null;
      if (mediaTheme.shadowRoot) {
        skipBackButton = mediaTheme.shadowRoot.querySelector(
          'media-seek-backward-button, ' +
          '[part*="seek-backward"], ' +
          'button[aria-label*="backward" i], ' +
          'button[aria-label*="rewind" i]'
        ) as HTMLElement;
        
        skipForwardButton = mediaTheme.shadowRoot.querySelector(
          'media-seek-forward-button, ' +
          '[part*="seek-forward"], ' +
          'button[aria-label*="forward" i], ' +
          'button[aria-label*="skip" i]'
        ) as HTMLElement;
      }

      if (centerButton) {
        const currentOpacity = centerButton.style.getPropertyValue('opacity');
        const targetOpacity = showCenterButton ? '1' : '0';
        
        // Only update if opacity changed or button not yet styled
        const needsUpdate = !isStyled || currentOpacity !== targetOpacity;
        
        if (needsUpdate) {
          // media-play-button is a web component, might need to access its shadow DOM
          let buttonElement = centerButton;
          if (centerButton.shadowRoot) {
            // If it has shadow DOM, find the actual button inside
            const innerButton = centerButton.shadowRoot.querySelector('button') as HTMLElement;
            if (innerButton) {
              buttonElement = innerButton;
            }
          }
          
          // Apply all styles with !important
          buttonElement.style.setProperty('width', '67px', 'important');
          buttonElement.style.setProperty('height', '67px', 'important');
          buttonElement.style.setProperty('min-width', '67px', 'important');
          buttonElement.style.setProperty('min-height', '67px', 'important');
          buttonElement.style.setProperty('border-radius', '50%', 'important');
          buttonElement.style.setProperty('background-color', 'rgba(0, 0, 0, 0.3)', 'important');
          buttonElement.style.setProperty('opacity', targetOpacity, 'important');
          buttonElement.style.setProperty('transition', 'opacity 0.3s ease-out', 'important');
          buttonElement.style.setProperty('pointer-events', showCenterButton ? 'auto' : 'none', 'important');
          buttonElement.style.setProperty('visibility', showCenterButton ? 'visible' : 'hidden', 'important');
          buttonElement.style.setProperty('display', 'flex', 'important');
          buttonElement.style.setProperty('align-items', 'center', 'important');
          buttonElement.style.setProperty('justify-content', 'center', 'important');
          buttonElement.style.setProperty('position', 'absolute', 'important');
          buttonElement.style.setProperty('left', '50%', 'important');
          buttonElement.style.setProperty('top', '50%', 'important');
          buttonElement.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
          buttonElement.style.setProperty('z-index', '20', 'important');
          buttonElement.style.setProperty('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', 'important');
          
          // Also style the web component itself
          centerButton.style.setProperty('width', '67px', 'important');
          centerButton.style.setProperty('height', '67px', 'important');
          centerButton.style.setProperty('position', 'absolute', 'important');
          centerButton.style.setProperty('left', '50%', 'important');
          centerButton.style.setProperty('top', '50%', 'important');
          centerButton.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
          centerButton.style.setProperty('z-index', '20', 'important');
          centerButton.style.setProperty('background-color', 'rgba(0, 0, 0, 0.3)', 'important');
          
          // Style the icon - check both shadow DOM and regular DOM
          // Need to find all SVGs (play and pause might be different elements)
          const allIcons: (SVGSVGElement | HTMLElement)[] = [
            ...Array.from(buttonElement.querySelectorAll('svg')),
            ...(centerButton.shadowRoot ? Array.from(centerButton.shadowRoot.querySelectorAll('svg')) : [])
          ];
          
          // Style all icons (both play and pause)
          allIcons.forEach((icon) => {
            // Make play and pause icons the same size - smaller than current play, larger than current pause
            if (icon instanceof SVGSVGElement || icon instanceof HTMLElement) {
              icon.style.setProperty('width', '34px', 'important');
              icon.style.setProperty('height', '34px', 'important');
              icon.style.setProperty('min-width', '34px', 'important');
              icon.style.setProperty('min-height', '34px', 'important');
              icon.style.setProperty('max-width', '34px', 'important');
              icon.style.setProperty('max-height', '34px', 'important');
              icon.style.setProperty('fill', 'white', 'important');
              icon.style.setProperty('color', 'white', 'important');
              icon.style.width = '34px';
              icon.style.height = '34px';
              if ('fill' in icon.style) {
                (icon.style as any).fill = 'white';
              }
              if ('color' in icon.style) {
                icon.style.color = 'white';
              }
              
              // Also set fill and size on all paths inside
              const paths = icon.querySelectorAll('path');
              paths.forEach((path) => {
                const pathElement = path as SVGPathElement | HTMLElement;
                if (pathElement instanceof SVGPathElement || (pathElement as any) instanceof HTMLElement) {
                  pathElement.style.setProperty('fill', 'white', 'important');
                  if ('fill' in pathElement.style) {
                    (pathElement.style as any).fill = 'white';
                  }
                }
              });
              
              // Set viewBox to ensure consistent sizing
              if (icon.hasAttribute('viewBox')) {
                icon.setAttribute('viewBox', icon.getAttribute('viewBox') || '0 0 24 24');
              }
            }
          });
          
          // Also style any icon containers or wrappers
          const iconContainers = [
            ...buttonElement.querySelectorAll('[class*="icon"], [class*="Icon"]'),
            ...(centerButton.shadowRoot ? centerButton.shadowRoot.querySelectorAll('[class*="icon"], [class*="Icon"]') : [])
          ] as HTMLElement[];
          
          iconContainers.forEach((container: HTMLElement) => {
            container.style.setProperty('width', '34px', 'important');
            container.style.setProperty('height', '34px', 'important');
            container.style.setProperty('max-width', '34px', 'important');
            container.style.setProperty('max-height', '34px', 'important');
          });
          
          isStyled = true;
          lastOpacity = targetOpacity;
        }
      }

      // Hide skip ahead/back buttons on mobile
      if (mediaTheme.shadowRoot && (skipBackButton || skipForwardButton)) {
        const hideSkipButton = (button: HTMLElement | null) => {
          if (!button) return;
          
          button.style.setProperty('display', 'none', 'important');
          button.style.setProperty('visibility', 'hidden', 'important');
          button.style.setProperty('opacity', '0', 'important');
          button.style.setProperty('pointer-events', 'none', 'important');
          
          // Also hide inner button if it has shadow root
          if (button.shadowRoot) {
            const innerButton = button.shadowRoot.querySelector('button') as HTMLElement;
            if (innerButton) {
              innerButton.style.setProperty('display', 'none', 'important');
              innerButton.style.setProperty('visibility', 'hidden', 'important');
              innerButton.style.setProperty('opacity', '0', 'important');
            }
          }
        };

        hideSkipButton(skipBackButton);
        hideSkipButton(skipForwardButton);
      }

      // Style timeline/progress bar to be in controls area on mobile (run every time to catch late-loading elements)
      if (mediaTheme.shadowRoot && isMobile) {
        // Find and style the progress bar/timeline - try multiple approaches
        const progressBarSelectors = [
          'media-time-range',
          'media-progress-range',
          '[part*="progress"]',
          '[part*="timeline"]',
          '[part*="time-range"]',
          'input[type="range"]',
          '.progress-bar',
          'media-control-bar media-time-range',
          'media-control-bar input[type="range"]'
        ];
        
        let progressBar: HTMLElement | null = null;
        for (const selector of progressBarSelectors) {
          try {
            progressBar = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
            if (progressBar) break;
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // If not found, try finding by looking for range inputs in all shadow roots
        if (!progressBar) {
          const rangeInputs = mediaTheme.shadowRoot.querySelectorAll('input[type="range"]');
          if (rangeInputs.length > 0) {
            progressBar = rangeInputs[0] as HTMLElement;
          }
        }
        
        // Also check nested shadow roots
        if (!progressBar) {
          const allElements = mediaTheme.shadowRoot.querySelectorAll('*');
          allElements.forEach((el: Element) => {
            if (el.shadowRoot) {
              const rangeInput = el.shadowRoot.querySelector('input[type="range"]') as HTMLElement;
              if (rangeInput) {
                progressBar = rangeInput;
              }
            }
          });
        }
        
        if (progressBar) {
          // Position timeline below volume and fullscreen buttons (at the very bottom)
          // In custom fullscreen, move up 20px and use 85% width
          const bottomValue = isCustomFullscreen ? '20px' : '0';
          const leftValue = isCustomFullscreen ? '7.5%' : '0';
          const widthValue = isCustomFullscreen ? '85%' : '100%';
          progressBar.style.setProperty('position', 'absolute', 'important');
          progressBar.style.setProperty('bottom', bottomValue, 'important');
          progressBar.style.setProperty('left', leftValue, 'important');
          progressBar.style.setProperty('right', 'auto', 'important');
          progressBar.style.setProperty('width', widthValue, 'important');
          progressBar.style.setProperty('z-index', '999', 'important');
          progressBar.style.setProperty('display', 'block', 'important');
          progressBar.style.setProperty('visibility', 'visible', 'important');
          progressBar.style.setProperty('opacity', '1', 'important');
          progressBar.style.setProperty('height', '4px', 'important'); // Make it a thin bar
          progressBar.style.setProperty('margin', '0', 'important');
          progressBar.style.setProperty('padding', '0', 'important');
          
          // Also try to set on the element directly (not just style property)
          if (progressBar instanceof HTMLElement) {
            progressBar.style.position = 'absolute';
            progressBar.style.bottom = bottomValue;
            progressBar.style.left = leftValue;
            progressBar.style.right = 'auto';
            progressBar.style.width = widthValue;
            progressBar.style.zIndex = '30';
            progressBar.style.display = 'block';
            progressBar.style.visibility = 'visible';
            progressBar.style.opacity = '1';
            progressBar.style.height = '4px';
          }
          
          // Style the progress bar container if it exists
          const progressContainer = progressBar.closest('[part*="bottom"], [part*="bar"], media-control-bar');
          if (progressContainer) {
            (progressContainer as HTMLElement).style.setProperty('position', 'absolute', 'important');
            (progressContainer as HTMLElement).style.setProperty('bottom', bottomValue, 'important'); // Match progress bar position
            (progressContainer as HTMLElement).style.setProperty('left', leftValue, 'important');
            (progressContainer as HTMLElement).style.setProperty('right', 'auto', 'important');
            (progressContainer as HTMLElement).style.setProperty('width', widthValue, 'important');
            (progressContainer as HTMLElement).style.setProperty('z-index', '999', 'important');
            (progressContainer as HTMLElement).style.setProperty('display', 'flex', 'important');
            (progressContainer as HTMLElement).style.setProperty('flex-direction', 'column', 'important');
            (progressContainer as HTMLElement).style.setProperty('visibility', 'visible', 'important');
            (progressContainer as HTMLElement).style.setProperty('opacity', '1', 'important');
            (progressContainer as HTMLElement).style.setProperty('overflow', 'visible', 'important'); // Allow thumb to extend
            (progressContainer as HTMLElement).style.setProperty('height', 'auto', 'important'); // Allow container to extend for thumb
            (progressContainer as HTMLElement).style.setProperty('min-height', '12px', 'important'); // Minimum height to accommodate thumb
          }
        }
        
        // Find and show time display (current time / total time) if it exists
        const timeDisplaySelectors = [
          'media-time-display',
          '[part*="time-display"]',
          '[part*="time"]',
          '.time-display'
        ];
        
        let timeDisplay: HTMLElement | null = null;
        for (const selector of timeDisplaySelectors) {
          timeDisplay = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
          if (timeDisplay) break;
        }
        
        if (timeDisplay && isMobile) {
          // In custom fullscreen, move up 20px and position within 85% width area
          const timeBottomValue = isCustomFullscreen ? '28px' : '8px'; // 20px + 8px = 28px in fullscreen
          const timeLeftValue = isCustomFullscreen ? '7.5%' : '8px'; // Within 85% width area (7.5% left margin)
          timeDisplay.style.setProperty('display', 'flex', 'important');
          timeDisplay.style.setProperty('visibility', 'visible', 'important');
          timeDisplay.style.setProperty('opacity', '1', 'important');
          timeDisplay.style.setProperty('position', 'absolute', 'important');
          timeDisplay.style.setProperty('bottom', timeBottomValue, 'important');
          timeDisplay.style.setProperty('left', timeLeftValue, 'important');
          timeDisplay.style.setProperty('z-index', '31', 'important');
          timeDisplay.style.setProperty('color', 'white', 'important');
          timeDisplay.style.setProperty('font-size', '16px', 'important'); // Increased from 12px
          timeDisplay.style.setProperty('font-weight', '500', 'important');
        }

        // Find and position mute/volume button
        const muteButtonSelectors = [
          'media-mute-button',
          'media-volume-button',
          '[part*="mute"]',
          '[part*="volume"]',
          'button[aria-label*="mute" i]',
          'button[aria-label*="volume" i]'
        ];
        
        let muteButton: HTMLElement | null = null;
        for (const selector of muteButtonSelectors) {
          try {
            muteButton = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
            if (muteButton) break;
          } catch (e) {
            // Continue
          }
        }
        
        if (muteButton && isMobile) {
          let buttonElement = muteButton;
          if (muteButton.shadowRoot) {
            const innerButton = muteButton.shadowRoot.querySelector('button') as HTMLElement;
            if (innerButton) buttonElement = innerButton;
          }
          
          // Increase mute button size
          buttonElement.style.setProperty('width', '48px', 'important');
          buttonElement.style.setProperty('height', '48px', 'important');
          buttonElement.style.setProperty('min-width', '48px', 'important');
          buttonElement.style.setProperty('min-height', '48px', 'important');
          
          // Increase SVG icon size inside mute button
          const muteIcons = [
            ...buttonElement.querySelectorAll('svg'),
            ...(muteButton.shadowRoot ? Array.from(muteButton.shadowRoot.querySelectorAll('svg')) : [])
          ];
          muteIcons.forEach((icon: Element) => {
            const svgIcon = icon as SVGSVGElement;
            svgIcon.style.setProperty('width', '25px', 'important');
            svgIcon.style.setProperty('height', '25px', 'important');
            svgIcon.style.setProperty('min-width', '25px', 'important');
            svgIcon.style.setProperty('min-height', '25px', 'important');
            svgIcon.style.setProperty('max-width', '25px', 'important');
            svgIcon.style.setProperty('max-height', '25px', 'important');
            svgIcon.style.width = '25px';
            svgIcon.style.height = '25px';
          });
          
          // In custom fullscreen, position within 85% width area (right edge at 7.5%)
          const muteRightValue = isCustomFullscreen ? '7.5%' : '0px';
          muteButton.style.setProperty('position', 'fixed', 'important');
          muteButton.style.setProperty('top', '8px', 'important');
          muteButton.style.setProperty('right', muteRightValue, 'important');
          muteButton.style.setProperty('z-index', '50', 'important');
          muteButton.style.setProperty('display', 'flex', 'important');
          muteButton.style.setProperty('visibility', 'visible', 'important');
          muteButton.style.setProperty('opacity', '1', 'important');
          muteButton.style.setProperty('width', '48px', 'important');
          muteButton.style.setProperty('height', '48px', 'important');
        }
        
        // Find and style fullscreen button
        const fullscreenButtonSelectors = [
          'media-fullscreen-button',
          '[part*="fullscreen"]',
          'button[aria-label*="fullscreen" i]',
          'button[aria-label*="full screen" i]',
          'button[title*="fullscreen" i]'
        ];
        
        let fullscreenButton: HTMLElement | null = null;
        for (const selector of fullscreenButtonSelectors) {
          try {
            fullscreenButton = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
            if (fullscreenButton) break;
          } catch (e) {
            // Continue
          }
        }
        
        if (fullscreenButton && isMobile) {
          let buttonElement = fullscreenButton;
          if (fullscreenButton.shadowRoot) {
            const innerButton = fullscreenButton.shadowRoot.querySelector('button') as HTMLElement;
            if (innerButton) buttonElement = innerButton;
          }
          
          // Increase fullscreen button size
          buttonElement.style.setProperty('width', '48px', 'important');
          buttonElement.style.setProperty('height', '48px', 'important');
          buttonElement.style.setProperty('min-width', '48px', 'important');
          buttonElement.style.setProperty('min-height', '48px', 'important');
          
          // Increase SVG icon size inside fullscreen button
          const fullscreenIcons = [
            ...buttonElement.querySelectorAll('svg'),
            ...(fullscreenButton.shadowRoot ? Array.from(fullscreenButton.shadowRoot.querySelectorAll('svg')) : [])
          ];
          fullscreenIcons.forEach((icon: Element) => {
            const svgIcon = icon as SVGSVGElement;
            svgIcon.style.setProperty('width', '25px', 'important');
            svgIcon.style.setProperty('height', '25px', 'important');
            svgIcon.style.setProperty('min-width', '25px', 'important');
            svgIcon.style.setProperty('min-height', '25px', 'important');
            svgIcon.style.setProperty('max-width', '25px', 'important');
            svgIcon.style.setProperty('max-height', '25px', 'important');
            svgIcon.style.width = '25px';
            svgIcon.style.height = '25px';
          });
          
          // In custom fullscreen, move up 20px and position within 85% width area
          const fullscreenBottomValue = isCustomFullscreen ? '28px' : '8px'; // 20px + 8px = 28px in fullscreen
          const fullscreenRightValue = isCustomFullscreen ? '7.5%' : '8px'; // Within 85% width area (7.5% right margin)
          fullscreenButton.style.setProperty('position', 'absolute', 'important');
          fullscreenButton.style.setProperty('bottom', fullscreenBottomValue, 'important');
          fullscreenButton.style.setProperty('right', fullscreenRightValue, 'important');
          fullscreenButton.style.setProperty('width', '48px', 'important');
          fullscreenButton.style.setProperty('height', '48px', 'important');
          fullscreenButton.style.setProperty('display', 'flex', 'important');
          fullscreenButton.style.setProperty('visibility', 'visible', 'important');
          fullscreenButton.style.setProperty('opacity', '1', 'important');
          
          // Helper function to get current orientation data on-demand
          const getCurrentOrientationData = (): { gamma: number | null; beta: number | null } => {
            // Try native Android sensor first (most reliable)
            if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && 
                typeof (window as any).AndroidFullScreen !== 'undefined' &&
                typeof (window as any).AndroidFullScreen.getOrientationData === 'function') {
              try {
                const data = (window as any).AndroidFullScreen.getOrientationData();
                if (data) {
                  const parsed = JSON.parse(data);
                  return { gamma: parsed.gamma, beta: parsed.beta };
                }
              } catch (err) {
                console.warn('[MuxVideoPlayer] Error getting native orientation data:', err);
              }
            }
            
            // Fall back to currentTiltRef (updated by orientation tracking)
            if (currentTiltRef.current.gamma !== null) {
              return currentTiltRef.current;
            }
            
            // Last resort: return null (will use default direction)
            return { gamma: null, beta: null };
          };
          
          // Intercept fullscreen button click to toggle custom fullscreen
          const handleFullscreenClick = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Prevent entering fullscreen when in PiP mode
            if (isPipMode && !isCustomFullscreenRef.current) {
              // Don't allow entering fullscreen from PiP mode
              return;
            }
            
            // When entering fullscreen manually, detect current tilt direction
            setIsCustomFullscreen(prev => {
              const enteringFullscreen = !prev;
              
              if (enteringFullscreen) {
                // On native platforms (iOS and Android), immediately set landscape to true so video fills screen
                // Native platforms will rotate natively via AppDelegate/MainActivity
                const isNative = Capacitor.isNativePlatform();
                if (isNative) {
                  setIsLandscape(true);
                  // Force isMobile to true on native when entering fullscreen
                  // This prevents desktop theme from loading when native rotates to landscape
                  setIsMobile(true);
                }
                
                // Capture screen dimensions BEFORE entering fullscreen
                // This is critical for the CSS rotation math (width/height swap) on web platform
                fullscreenDimsRef.current = { w: screen.width, h: screen.height };
                console.log('[MuxVideoPlayer] Manual fullscreen - captured dims:', fullscreenDimsRef.current);
                
                // Get current orientation data on-demand
                const orientationData = getCurrentOrientationData();
                const gamma = orientationData.gamma;
                
                if (gamma !== null) {
                  // Device tilted right (gamma > 0) → video rotates clockwise → 'right'
                  // Device tilted left (gamma < 0) → video rotates counterclockwise → 'left'
                  if (gamma > 0) {
                    setLandscapeDirection('right');
                  } else if (gamma < 0) {
                    setLandscapeDirection('left');
                  }
                  // If gamma is near 0, keep default direction
                } else {
                  // No orientation data available, use default direction
                  console.log('[MuxVideoPlayer] No orientation data available for manual fullscreen, using default direction');
                }
              }
              
              return enteringFullscreen;
            });
            
            return false;
          };
          
          // Remove existing listeners and add our custom handler
          // Store handler reference to allow proper cleanup
          (buttonElement as any)._customFullscreenHandler = handleFullscreenClick;
          buttonElement.removeEventListener('click', (buttonElement as any)._customFullscreenHandler);
          buttonElement.addEventListener('click', handleFullscreenClick, true);
        }
        
        // Hide other buttons except center play button, mute button, fullscreen button, quality button, and PiP button
        // Skip buttons are now hidden on mobile
        const allButtons = mediaTheme.shadowRoot.querySelectorAll('button');
        const qualityButton = mediaTheme.shadowRoot.getElementById('quality-button-mobile');
        const pipButton = mediaTheme.shadowRoot.getElementById('pip-button-mobile');
        allButtons.forEach((btn: Element) => {
          const isMuteButton = btn === muteButton;
          const isFullscreenButton = btn === fullscreenButton;
          const isQualityButton = btn === qualityButton;
          const isPipButton = btn === pipButton;
          if (btn !== centerButton && !isMuteButton && !isFullscreenButton && !isQualityButton && !isPipButton) {
            (btn as HTMLElement).style.setProperty('display', 'none', 'important');
          }
        });
      }
    };

    // Try immediately
    styleNotflixButton();
    
          // Also try on interval to catch late-loading elements (stop after button is found and styled)
          intervalId = setInterval(() => {
            if (!isStyled) {
              styleNotflixButton();
            } else {
              // Only update opacity if state changed
              const mediaTheme = videoRef.current?.closest('media-theme-notflix') as any;
              if (mediaTheme?.shadowRoot) {
                const targetOpacity = showCenterButton ? '1' : '0';
                
                // Update center play button
                const centerButton = mediaTheme.shadowRoot.querySelector('media-play-button') as HTMLElement;
                if (centerButton && lastOpacity !== targetOpacity) {
                  centerButton.style.setProperty('opacity', targetOpacity, 'important');
                  centerButton.style.setProperty('pointer-events', showCenterButton ? 'auto' : 'none', 'important');
                  centerButton.style.setProperty('visibility', showCenterButton ? 'visible' : 'hidden', 'important');
                  lastOpacity = targetOpacity;
                  
                  // Re-apply icon sizing to ensure play and pause are same size
                  const allIcons = centerButton.shadowRoot?.querySelectorAll('svg') || [];
                  allIcons.forEach((iconElement) => {
                    const svgIcon = iconElement as SVGSVGElement;
                    svgIcon.style.setProperty('width', '34px', 'important');
                    svgIcon.style.setProperty('height', '34px', 'important');
                    svgIcon.style.setProperty('max-width', '34px', 'important');
                    svgIcon.style.setProperty('max-height', '34px', 'important');
                    svgIcon.style.width = '34px';
                    svgIcon.style.height = '34px';
                  });
                }
                
                // Skip buttons are hidden on mobile via CSS
                
                // Always re-apply timeline positioning on mobile (in case it gets reset)
                if (isMobile) {
                  const progressBarSelectors = [
                    'media-time-range',
                    'media-progress-range',
                    '[part*="progress"]',
                    '[part*="timeline"]',
                    '[part*="time-range"]',
                    'input[type="range"]'
                  ];
                  
                  let progressBar: HTMLElement | null = null;
                  for (const selector of progressBarSelectors) {
                    try {
                      progressBar = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
                      if (progressBar) break;
                    } catch (e) {
                      // Continue
                    }
                  }
                  
                  if (!progressBar) {
                    const rangeInputs = mediaTheme.shadowRoot.querySelectorAll('input[type="range"]');
                    if (rangeInputs.length > 0) {
                      progressBar = rangeInputs[0] as HTMLElement;
                    }
                  }
                  
                  if (progressBar) {
                    // In custom fullscreen, move up 20px and use 85% width
                    const bottomValue = isCustomFullscreen ? '20px' : '0';
                    const leftValue = isCustomFullscreen ? '7.5%' : '0';
                    const widthValue = isCustomFullscreen ? '85%' : '100%';
                    progressBar.style.setProperty('position', 'absolute', 'important');
                    progressBar.style.setProperty('bottom', bottomValue, 'important');
                    progressBar.style.setProperty('left', leftValue, 'important');
                    progressBar.style.setProperty('right', 'auto', 'important');
                    progressBar.style.setProperty('width', widthValue, 'important');
                    progressBar.style.setProperty('z-index', '999', 'important');
                    progressBar.style.setProperty('display', 'block', 'important');
                    progressBar.style.setProperty('visibility', 'visible', 'important');
                    progressBar.style.setProperty('opacity', '1', 'important');
                    progressBar.style.setProperty('height', '4px', 'important');
                  }
                  
                  // Re-apply mute button and SVG icon sizes
                  const muteButtonSelectors = [
                    'media-mute-button', 'media-volume-button', '[part*="mute"]', '[part*="volume"]',
                    'button[aria-label*="mute" i]', 'button[aria-label*="volume" i]'
                  ];
                  let muteButton: HTMLElement | null = null;
                  for (const selector of muteButtonSelectors) {
                    try {
                      muteButton = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
                      if (muteButton) break;
                    } catch (e) {
                      // Continue
                    }
                  }
                  
                  if (muteButton) {
                    let buttonElement = muteButton;
                    if (muteButton.shadowRoot) {
                      const innerButton = muteButton.shadowRoot.querySelector('button') as HTMLElement;
                      if (innerButton) buttonElement = innerButton;
                    }
                    buttonElement.style.setProperty('width', '48px', 'important');
                    buttonElement.style.setProperty('height', '48px', 'important');
                    buttonElement.style.setProperty('min-width', '48px', 'important');
                    buttonElement.style.setProperty('min-height', '48px', 'important');
                    // In custom fullscreen, position within 85% width area (right edge at 7.5%)
                    const muteRightValue = isCustomFullscreen ? '7.5%' : '0px';
                    muteButton.style.setProperty('position', 'fixed', 'important');
                    muteButton.style.setProperty('right', muteRightValue, 'important');
                    muteButton.style.setProperty('width', '48px', 'important');
                    muteButton.style.setProperty('height', '48px', 'important');
                    
                    // Re-apply SVG icon size
                    const muteIcons = [
                      ...buttonElement.querySelectorAll('svg'),
                      ...(muteButton.shadowRoot ? Array.from(muteButton.shadowRoot.querySelectorAll('svg')) : [])
                    ];
                    muteIcons.forEach((icon: Element) => {
                      const svgIcon = icon as SVGSVGElement;
                      svgIcon.style.setProperty('width', '25px', 'important');
                      svgIcon.style.setProperty('height', '25px', 'important');
                      svgIcon.style.setProperty('min-width', '25px', 'important');
                      svgIcon.style.setProperty('min-height', '25px', 'important');
                      svgIcon.style.setProperty('max-width', '25px', 'important');
                      svgIcon.style.setProperty('max-height', '25px', 'important');
                      svgIcon.style.width = '25px';
                      svgIcon.style.height = '25px';
                    });
                  }
                  
                  // Re-apply fullscreen button and SVG icon sizes
                  const fullscreenButtonSelectors = [
                    'media-fullscreen-button', '[part*="fullscreen"]',
                    'button[aria-label*="fullscreen" i]', 'button[aria-label*="full screen" i]'
                  ];
                  let fullscreenButton: HTMLElement | null = null;
                  for (const selector of fullscreenButtonSelectors) {
                    try {
                      fullscreenButton = mediaTheme.shadowRoot.querySelector(selector) as HTMLElement;
                      if (fullscreenButton) break;
                    } catch (e) {
                      // Continue
                    }
                  }
                  
                  if (fullscreenButton) {
                    let buttonElement = fullscreenButton;
                    if (fullscreenButton.shadowRoot) {
                      const innerButton = fullscreenButton.shadowRoot.querySelector('button') as HTMLElement;
                      if (innerButton) buttonElement = innerButton;
                    }
                    buttonElement.style.setProperty('width', '48px', 'important');
                    buttonElement.style.setProperty('height', '48px', 'important');
                    buttonElement.style.setProperty('min-width', '48px', 'important');
                    buttonElement.style.setProperty('min-height', '48px', 'important');
                    // In custom fullscreen, move up 20px and position within 85% width area
                    const fullscreenBottomValue = isCustomFullscreen ? '28px' : '8px';
                    const fullscreenRightValue = isCustomFullscreen ? '7.5%' : '8px';
                    fullscreenButton.style.setProperty('position', 'absolute', 'important');
                    fullscreenButton.style.setProperty('bottom', fullscreenBottomValue, 'important');
                    fullscreenButton.style.setProperty('right', fullscreenRightValue, 'important');
                    fullscreenButton.style.setProperty('width', '48px', 'important');
                    fullscreenButton.style.setProperty('height', '48px', 'important');
                    
                    // Re-apply SVG icon size
                    const fullscreenIcons = [
                      ...buttonElement.querySelectorAll('svg'),
                      ...(fullscreenButton.shadowRoot ? Array.from(fullscreenButton.shadowRoot.querySelectorAll('svg')) : [])
                    ];
                    fullscreenIcons.forEach((icon: Element) => {
                      const svgIcon = icon as SVGSVGElement;
                      svgIcon.style.setProperty('width', '25px', 'important');
                      svgIcon.style.setProperty('height', '25px', 'important');
                      svgIcon.style.setProperty('min-width', '25px', 'important');
                      svgIcon.style.setProperty('min-height', '25px', 'important');
                      svgIcon.style.setProperty('max-width', '25px', 'important');
                      svgIcon.style.setProperty('max-height', '25px', 'important');
                      svgIcon.style.width = '25px';
                      svgIcon.style.height = '25px';
                    });
                  }
                }
              }
            }
          }, 500); // Reduced frequency
    
    // Use MutationObserver with debouncing
    const mediaTheme = videoRef.current?.closest('media-theme-notflix') as any;
    if (mediaTheme?.shadowRoot) {
      let mutationTimeout: NodeJS.Timeout;
      const observer = new MutationObserver(() => {
        // Debounce mutations to prevent loops
        clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(() => {
          if (!isStyled) {
            styleNotflixButton();
          }
        }, 100);
      });
      
      observer.observe(mediaTheme.shadowRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'] // Only watch style changes, not all attributes
      });
      
      observers.push(observer);
    }

    return () => {
      clearInterval(intervalId);
      observers.forEach((obs: MutationObserver) => obs.disconnect());
    };
  }, [showCenterButton, isMobile, isLoading, isInPictureInPicture, isPipMode, isCustomFullscreen]);

  // Directly hide/show controls based on PiP mode (runs when isPipMode or Android native PiP changes)
  useEffect(() => {
    if (!isMobile) return;
    
    // Check if we're on Android and in native PiP mode
    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const shouldHideControls = isPipMode || (isAndroid && isInPictureInPicture);
    
    const toggleControls = () => {
      const mediaTheme = videoRef.current?.closest('media-theme-notflix') as any;
      if (!mediaTheme?.shadowRoot) return;
      
      // Ensure video element and container allow pointer events for native PiP controls
      const videoElement = videoRef.current;
      const container = playerContainerRef.current;
      
      if (shouldHideControls) {
        // Hide all custom UI controls in PiP mode
        // Note: Native Android PiP controls (system-level) will remain visible and functional
        const buttons = mediaTheme.shadowRoot.querySelectorAll('button');
        buttons.forEach((btn: HTMLElement) => {
          btn.style.setProperty('display', 'none', 'important');
          btn.style.setProperty('visibility', 'hidden', 'important');
          btn.style.setProperty('opacity', '0', 'important');
          btn.style.setProperty('pointer-events', 'none', 'important');
        });
        
        const progressBars = mediaTheme.shadowRoot.querySelectorAll('media-time-range, input[type="range"], [part*="progress"], [part*="timeline"]');
        progressBars.forEach((el: HTMLElement) => {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
        });
        
        const timeDisplays = mediaTheme.shadowRoot.querySelectorAll('media-time-display, [part*="time-display"]');
        timeDisplays.forEach((el: HTMLElement) => {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
        });
        
        const controlBars = mediaTheme.shadowRoot.querySelectorAll('[part*="bar"], [part*="bottom"], [part*="control"], media-control-bar');
        controlBars.forEach((el: HTMLElement) => {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
        });
        
        // Ensure video element and container allow pointer events for native Android PiP controls
        if (isAndroid && isInPictureInPicture && videoElement) {
          videoElement.style.setProperty('pointer-events', 'auto', 'important');
          if (container) {
            container.style.setProperty('pointer-events', 'auto', 'important');
          }
          // Ensure MediaThemeNotflix container also allows pointer events
          if (mediaTheme) {
            (mediaTheme as HTMLElement).style.setProperty('pointer-events', 'auto', 'important');
          }
        }
      } else {
        // Show controls when not in PiP mode - remove inline styles to let CSS take over
        const buttons = mediaTheme.shadowRoot.querySelectorAll('button');
        buttons.forEach((btn: HTMLElement) => {
          btn.style.removeProperty('display');
          btn.style.removeProperty('visibility');
          btn.style.removeProperty('opacity');
          btn.style.removeProperty('pointer-events');
        });
        
        const progressBars = mediaTheme.shadowRoot.querySelectorAll('media-time-range, input[type="range"], [part*="progress"], [part*="timeline"]');
        progressBars.forEach((el: HTMLElement) => {
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
        });
        
        const timeDisplays = mediaTheme.shadowRoot.querySelectorAll('media-time-display, [part*="time-display"]');
        timeDisplays.forEach((el: HTMLElement) => {
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
        });
        
        const controlBars = mediaTheme.shadowRoot.querySelectorAll('[part*="bar"], [part*="bottom"], [part*="control"], media-control-bar');
        controlBars.forEach((el: HTMLElement) => {
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
        });
        
        // Remove pointer-events overrides when not in PiP
        if (videoElement) {
          videoElement.style.removeProperty('pointer-events');
        }
        if (container) {
          container.style.removeProperty('pointer-events');
        }
        if (mediaTheme) {
          (mediaTheme as HTMLElement).style.removeProperty('pointer-events');
        }
      }
    };
    
    // Run immediately
    toggleControls();
    
    // Also observe for any dynamically added controls (only hide if in PiP mode)
    const mediaTheme = videoRef.current?.closest('media-theme-notflix') as any;
    if (mediaTheme?.shadowRoot) {
      const observer = new MutationObserver(() => {
        if (shouldHideControls) {
          toggleControls();
        }
      });
      
      observer.observe(mediaTheme.shadowRoot, {
        childList: true,
        subtree: true,
      });
      
      return () => {
        observer.disconnect();
      };
    }
  }, [isPipMode, isInPictureInPicture, isMobile]);

  // Desktop quality control fade - match MediaThemeNotflix behavior using mouse events
  useEffect(() => {
    if (isMobile || isPipMode || !availableRenditions.length) return;

    const playerContainer = playerContainerRef.current;
    if (!playerContainer) return;

    let hideTimeout: NodeJS.Timeout | null = null;
    let isMouseInside = false;

    const showControls = () => {
      setQualityControlOpacity(1);
      // Let MediaThemeNotflix handle the fade naturally - no manual opacity updates needed
    };

    const hideControls = () => {
      // Don't hide if video is paused (matching MediaThemeNotflix behavior)
      if (!isPlaying) return;
      
      // Don't hide if quality menu is open
      if (showQualityMenuRef.current) return;
      
      setQualityControlOpacity(0);
      // Let MediaThemeNotflix handle the fade naturally - no manual opacity updates needed
    };

    const scheduleHide = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      // Don't schedule hide if video is paused
      if (!isPlaying) return;
      
      // Hide after 3 seconds of inactivity (matching MediaThemeNotflix timing more closely)
      hideTimeout = setTimeout(() => {
        if (isMouseInside) {
          // Only hide if mouse hasn't moved recently
          hideControls();
        }
      }, 3000);
    };

    const handleMouseEnter = () => {
      isMouseInside = true;
      showControls();
      scheduleHide();
    };

    const handleMouseMove = () => {
      if (isMouseInside) {
        showControls();
        scheduleHide();
      }
    };

    const handleMouseLeave = () => {
      isMouseInside = false;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      // Add a small delay before hiding when mouse leaves (matching MediaThemeNotflix)
      hideTimeout = setTimeout(() => {
        hideControls();
      }, 300);
    };

    // When paused, always show controls
    if (!isPlaying) {
      showControls();
    } else {
      // When playing, show controls first, then schedule hide after a delay
      showControls();
      // Wait a bit before scheduling hide (matching MediaThemeNotflix behavior)
      setTimeout(() => {
        if (isMouseInside) {
          scheduleHide();
        } else {
          // If mouse is outside, hide after a short delay
          setTimeout(() => {
            hideControls();
          }, 300);
        }
      }, 500);
    }

    playerContainer.addEventListener('mouseenter', handleMouseEnter);
    playerContainer.addEventListener('mousemove', handleMouseMove);
    playerContainer.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      playerContainer.removeEventListener('mouseenter', handleMouseEnter);
      playerContainer.removeEventListener('mousemove', handleMouseMove);
      playerContainer.removeEventListener('mouseleave', handleMouseLeave);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [isMobile, isPipMode, availableRenditions.length, isPlaying, isInFullscreen, qualityControlHovered]);

  // Keep quality control and MediaThemeNotflix controls visible when menu is open or hovered
  useEffect(() => {
    showQualityMenuRef.current = showQualityMenu;
    
    const shouldKeepVisible = showQualityMenu || qualityControlHovered;
    
    // Keep our quality control visible (shadow DOM)
    // MediaThemeNotflix will handle the fade naturally based on hover/menu state
    if (shouldKeepVisible && !isInFullscreen) {
      setQualityControlOpacity(1);
    }

    // Keep MediaThemeNotflix controls visible by directly setting styles on control elements
    if (shouldKeepVisible && !isMobile) {
      const mediaTheme = videoRef.current?.closest('media-theme-notflix') as HTMLElement;
      if (mediaTheme?.shadowRoot) {
        // Find all control elements and force them visible
        const forceVisible = () => {
          // Only force if still should be visible
          if (!showQualityMenu && !qualityControlHovered) return;
          
          const selectors = [
            'media-control-bar',
            'media-fullscreen-button',
            'media-time-range',
            'media-progress-range',
            'media-time-display',
            'media-mute-button',
            'media-volume-range',
            '[part*="control"]',
            '[part*="bottom"]',
            '[part*="progress"]',
            '[part*="timeline"]',
            '[part*="time-range"]',
            'input[type="range"]',
            'button'
          ];
          
          selectors.forEach(selector => {
            const elements = mediaTheme.shadowRoot?.querySelectorAll(selector);
            elements?.forEach((el: Element) => {
              const htmlEl = el as HTMLElement;
              htmlEl.style.setProperty('opacity', '1', 'important');
              htmlEl.style.setProperty('visibility', 'visible', 'important');
              htmlEl.style.setProperty('pointer-events', 'auto', 'important');
            });
          });
        };

        // Force visible immediately and on an interval
        forceVisible();
        const intervalId = setInterval(forceVisible, 100);

        return () => {
          clearInterval(intervalId);
          // Remove the forced styles when menu closes and not hovered
          if (!showQualityMenu && !qualityControlHovered) {
            const selectors = [
              'media-control-bar',
              'media-fullscreen-button',
              'media-time-range',
              'media-progress-range',
              'media-time-display',
              'media-mute-button',
              'media-volume-range',
              '[part*="control"]',
              '[part*="bottom"]',
              '[part*="progress"]',
              '[part*="timeline"]',
              '[part*="time-range"]',
              'input[type="range"]',
              'button'
            ];
            
            selectors.forEach(selector => {
              const elements = mediaTheme.shadowRoot?.querySelectorAll(selector);
              elements?.forEach((el: Element) => {
                const htmlEl = el as HTMLElement;
                htmlEl.style.removeProperty('opacity');
                htmlEl.style.removeProperty('visibility');
                htmlEl.style.removeProperty('pointer-events');
              });
            });
          }
        };
      }
    } else if (!shouldKeepVisible && !isMobile) {
      // Remove forced styles when not hovering and menu not open
      const mediaTheme = videoRef.current?.closest('media-theme-notflix') as HTMLElement;
      if (mediaTheme?.shadowRoot) {
        const selectors = [
          'media-control-bar',
          'media-fullscreen-button',
          'media-time-range',
          'media-progress-range',
          'media-time-display',
          'media-mute-button',
          'media-volume-range',
          '[part*="control"]',
          '[part*="bottom"]',
          '[part*="progress"]',
          '[part*="timeline"]',
          '[part*="time-range"]',
          'input[type="range"]',
          'button'
        ];
        
        selectors.forEach(selector => {
          const elements = mediaTheme.shadowRoot?.querySelectorAll(selector);
          elements?.forEach((el: Element) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.removeProperty('opacity');
            htmlEl.style.removeProperty('visibility');
            htmlEl.style.removeProperty('pointer-events');
          });
        });
      }
    }
  }, [showQualityMenu, qualityControlHovered, isMobile]);

  // Track fullscreen state and inject quality control into Shadow DOM
  useEffect(() => {
    if (isMobile) return; // Only needed for desktop

    let animationFrameId: number;
    let wasInFullscreen = false;
    let injectedContainer: HTMLDivElement | null = null;
    let injectedStyle: HTMLStyleElement | null = null;

    const removeInjectedElements = () => {
      if (injectedContainer && injectedContainer.parentNode) {
        injectedContainer.parentNode.removeChild(injectedContainer);
        injectedContainer = null;
      }
      if (injectedStyle && injectedStyle.parentNode) {
        injectedStyle.parentNode.removeChild(injectedStyle);
        injectedStyle = null;
      }
      // Remove gradient overlay if it exists
      const fsElement = document.fullscreenElement || 
                       (document as any).webkitFullscreenElement ||
                       (document as any).mozFullScreenElement ||
                       (document as any).msFullscreenElement;
      if (fsElement?.shadowRoot) {
        const gradient = fsElement.shadowRoot.getElementById('video-gradient-overlay-fullscreen');
        if (gradient && gradient.parentNode) {
          gradient.parentNode.removeChild(gradient);
        }
      }
    };

    const injectQualityControl = (fsElement: Element) => {
      // Remove any existing injected elements
      removeInjectedElements();
      
      const shadowRoot = fsElement.shadowRoot;
      
      if (!shadowRoot) {
        return;
      }
      
      // Find the fullscreen button first - this is our anchor point
      const fullscreenButtonSelectors = [
        'media-fullscreen-button',
        '[part*="fullscreen"]',
        'button[aria-label*="fullscreen" i]',
        'button[aria-label*="full screen" i]'
      ];
      
      let fullscreenButton: HTMLElement | null = null;
      for (const selector of fullscreenButtonSelectors) {
        fullscreenButton = shadowRoot.querySelector(selector) as HTMLElement;
        if (fullscreenButton) break;
      }
      
      // Find the parent container that holds the fullscreen button
      // This is typically the control bar or a similar container
      let targetContainer: Element | ShadowRoot | null = null;
      
      if (fullscreenButton) {
        // Use the same parent as the fullscreen button
        targetContainer = fullscreenButton.parentElement;
      } else {
        // Fallback: look for control bar or similar container
        const possibleTargets = [
          'media-control-bar',
          '[part="control-bar"]',
          '.control-bar',
          '[slot="fullscreen"]',
          'div[part]',
        ];
        
        for (const selector of possibleTargets) {
          const found = shadowRoot.querySelector(selector);
          if (found) {
            targetContainer = found;
            break;
          }
        }
        
        // Last resort: use shadow root
        if (!targetContainer) {
          targetContainer = shadowRoot;
        }
      }
      
      // Create button with inline styles
      const button = document.createElement('button');
      button.id = 'quality-button-fullscreen';
      button.setAttribute('aria-label', 'Quality settings');
      button.setAttribute('part', 'quality-button'); // Add part attribute for styling
      // Style button to match non-fullscreen version (no background, no border)
      button.style.cssText = `
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        height: auto;
        pointer-events: auto;
      `;
      button.innerHTML = `
        <svg fill="none" stroke="white" viewBox="0 0 24 24" style="width: 20px; height: 20px;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
        </svg>
      `;
      
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowQualityMenu(prev => !prev);
      };
      
      // Create a container that holds both button and menu
      // Position it using absolute positioning, same as fullscreen button
      // Place it to the left of the fullscreen button (which is at right: 8px)
      // Quality button should be at right: 64px (8px + 48px button width + 8px gap)
      const container = document.createElement('div');
      container.id = 'quality-control-fullscreen-container';
      container.style.cssText = `
        position: absolute;
        bottom: 30px;
        right: 74px;
        z-index: 2147483647;
        pointer-events: auto;
        display: flex;
        align-items: center;
      `;
      container.appendChild(button);
      
      // Store reference for cleanup
      injectedContainer = container;
      
      // Inject gradient overlay for fullscreen mode
      const existingGradient = shadowRoot.getElementById('video-gradient-overlay-fullscreen');
      if (existingGradient) {
        existingGradient.remove();
      }
      
      const gradientOverlay = document.createElement('div');
      gradientOverlay.id = 'video-gradient-overlay-fullscreen';
      gradientOverlay.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.2) 50%, transparent 100%);
        pointer-events: none;
        z-index: 0;
      `;
      
      // Inject into the same container as the fullscreen button
      // Use prepend to put gradient FIRST in DOM order (behind other elements)
      if (targetContainer) {
        if (targetContainer instanceof ShadowRoot) {
          targetContainer.prepend(gradientOverlay);
          targetContainer.appendChild(container);
        } else {
          targetContainer.prepend(gradientOverlay);
          targetContainer.appendChild(container);
        }
      } else {
        shadowRoot.prepend(gradientOverlay);
        shadowRoot.appendChild(container);
      }
    };

    const checkFullscreen = () => {
      // Check all possible fullscreen indicators
      const fsElement = document.fullscreenElement || 
                       (document as any).webkitFullscreenElement ||
                       (document as any).mozFullScreenElement ||
                       (document as any).msFullscreenElement;
      
      // Also check if window dimensions match screen (backup detection)
      const isWindowFullscreen = window.innerWidth === screen.width && window.innerHeight === screen.height;
      
      // Check if MediaThemeNotflix has fullscreen attribute
      const hasFullscreenAttr = mediaThemeRef.current?.hasAttribute('fullscreen') || 
                                mediaThemeRef.current?.getAttribute('mediafullscreenstate') === 'fullscreen';
      
      const isCurrentlyFullscreen = !!(fsElement || isWindowFullscreen || hasFullscreenAttr);
      
      // Only update state if changed
      if (isCurrentlyFullscreen !== wasInFullscreen) {
        wasInFullscreen = isCurrentlyFullscreen;
        setIsInFullscreen(isCurrentlyFullscreen);
        
        // Inject or remove quality control based on fullscreen state
        if (isCurrentlyFullscreen && fsElement) {
          injectQualityControl(fsElement);
        } else {
          removeInjectedElements();
        }
      }
      
      animationFrameId = requestAnimationFrame(checkFullscreen);
    };

    // Start polling
    animationFrameId = requestAnimationFrame(checkFullscreen);

    return () => {
      cancelAnimationFrame(animationFrameId);
      removeInjectedElements();
    };
  }, [isMobile]);

  // Update fullscreen menu when showQualityMenu changes
  useEffect(() => {
    if (!isInFullscreen) return;
    
    // Find the injected container in shadow DOM
    const mediaTheme = document.querySelector('media-theme-notflix');
    const shadowRoot = mediaTheme?.shadowRoot;
    if (!shadowRoot) return;
    
    const container = shadowRoot.getElementById('quality-control-fullscreen-container');
    if (!container) return;
    
    // Remove existing menu
    const existingMenu = container.querySelector('#quality-menu-fullscreen');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    // If menu should be shown, create and append it
    if (showQualityMenu && availableRenditions.length > 0) {
      const menu = document.createElement('div');
      menu.id = 'quality-menu-fullscreen';
      menu.style.cssText = `
        position: absolute;
        bottom: 100%;
        right: 0;
        margin-bottom: 8px;
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        min-width: 120px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        overflow: hidden;
      `;
      
      availableRenditions.forEach((rendition) => {
        const option = document.createElement('button');
        option.style.cssText = `
          display: block;
          width: 100%;
          padding: 10px 16px;
          background: ${currentRendition?.id === rendition.id ? 'rgba(255,255,255,0.1)' : 'transparent'};
          border: none;
          color: white;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
        `;
        option.textContent = `${rendition.label} ${currentRendition?.id === rendition.id ? '✓' : ''}`;
        option.onmouseenter = () => option.style.background = 'rgba(255,255,255,0.2)';
        option.onmouseleave = () => option.style.background = currentRendition?.id === rendition.id ? 'rgba(255,255,255,0.1)' : 'transparent';
        option.addEventListener('click', (e) => {
          console.log('[Quality Debug] Option clicked:', rendition.id);
          e.preventDefault();
          e.stopPropagation();
          if (handleQualityChangeRef.current) {
            handleQualityChangeRef.current(rendition.id);
          }
        });
        menu.appendChild(option);
      });
      
      container.appendChild(menu);
    }
  }, [showQualityMenu, isInFullscreen, availableRenditions, currentRendition]);

  // Inject quality control into shadow DOM for non-fullscreen mode (desktop only)
  useEffect(() => {
    if (isMobile || isPipMode || isInFullscreen || availableRenditions.length === 0) {
      return;
    }

    const mediaTheme = mediaThemeRef.current;
    if (!mediaTheme) return;

    const shadowRoot = mediaTheme.shadowRoot;
    if (!shadowRoot) return;

    let injectedContainer: HTMLDivElement | null = null;

    const removeInjectedElements = () => {
      if (injectedContainer && injectedContainer.parentNode) {
        injectedContainer.parentNode.removeChild(injectedContainer);
        injectedContainer = null;
      }
    };

    const injectQualityControl = () => {
      // Remove any existing injected elements
      removeInjectedElements();

      // Find the fullscreen button first - this is our anchor point
      const fullscreenButtonSelectors = [
        'media-fullscreen-button',
        '[part*="fullscreen"]',
        'button[aria-label*="fullscreen" i]',
        'button[aria-label*="full screen" i]'
      ];

      let fullscreenButton: HTMLElement | null = null;
      for (const selector of fullscreenButtonSelectors) {
        fullscreenButton = shadowRoot.querySelector(selector) as HTMLElement;
        if (fullscreenButton) break;
      }

      // Find the parent container that holds the fullscreen button
      let targetContainer: Element | ShadowRoot | null = null;

      if (fullscreenButton) {
        // Use the same parent as the fullscreen button
        targetContainer = fullscreenButton.parentElement;
      } else {
        // Fallback: look for control bar or similar container
        const possibleTargets = [
          'media-control-bar',
          '[part="control-bar"]',
          '.control-bar',
          '[slot="fullscreen"]',
          'div[part]',
        ];

        for (const selector of possibleTargets) {
          const found = shadowRoot.querySelector(selector);
          if (found) {
            targetContainer = found;
            break;
          }
        }

        // Last resort: use shadow root
        if (!targetContainer) {
          targetContainer = shadowRoot;
        }
      }

      // Create button with inline styles
      const button = document.createElement('button');
      button.id = 'quality-button-desktop';
      button.setAttribute('aria-label', 'Quality settings');
      button.setAttribute('part', 'quality-button');
      button.style.cssText = `
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        height: auto;
        pointer-events: auto;
      `;
      button.innerHTML = `
        <svg fill="none" stroke="white" viewBox="0 0 24 24" style="width: 20px; height: 20px;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
        </svg>
      `;

      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowQualityMenu(prev => !prev);
      };

      // Add hover handlers (for keeping controls visible, but don't manually set opacity)
      button.onmouseenter = () => {
        isQualityControlHoveredRef.current = true;
        setQualityControlHovered(true);
      };
      button.onmouseleave = () => {
        isQualityControlHoveredRef.current = false;
        setQualityControlHovered(false);
      };

      // Create a container that holds both button and menu
      // Position it using absolute positioning, same as fullscreen button
      // Place it to the left of the fullscreen button
      const container = document.createElement('div');
      container.id = 'quality-control-desktop-container';
      container.style.cssText = `
        position: absolute;
        bottom: 25px;
        right: 74px;
        z-index: 2147483647;
        pointer-events: auto;
        display: flex;
        align-items: center;
      `;
      container.appendChild(button);

      // Store reference for cleanup
      injectedContainer = container;

      // Inject into the same container as the fullscreen button
      if (targetContainer) {
        if (targetContainer instanceof ShadowRoot) {
          targetContainer.appendChild(container);
        } else {
          targetContainer.appendChild(container);
        }
      } else {
        shadowRoot.appendChild(container);
      }
    };

    // Initial injection
    injectQualityControl();

    return () => {
      removeInjectedElements();
    };
  }, [isMobile, isPipMode, isInFullscreen, availableRenditions.length]);

  // Update non-fullscreen menu when showQualityMenu changes
  useEffect(() => {
    if (isMobile || isPipMode || isInFullscreen || availableRenditions.length === 0) return;

    const mediaTheme = mediaThemeRef.current;
    if (!mediaTheme) return;

    const shadowRoot = mediaTheme.shadowRoot;
    if (!shadowRoot) return;

    const container = shadowRoot.getElementById('quality-control-desktop-container');
    if (!container) return;

    // Remove existing menu
    const existingMenu = container.querySelector('#quality-menu-desktop');
    if (existingMenu) {
      existingMenu.remove();
    }

    // If menu should be shown, create and append it
    if (showQualityMenu && availableRenditions.length > 0) {
      const menu = document.createElement('div');
      menu.id = 'quality-menu-desktop';
      menu.style.cssText = `
        position: absolute;
        bottom: 100%;
        right: 0;
        margin-bottom: 8px;
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        min-width: 120px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        overflow: hidden;
      `;

      availableRenditions.forEach((rendition) => {
        const option = document.createElement('button');
        option.style.cssText = `
          display: block;
          width: 100%;
          padding: 10px 16px;
          background: ${currentRendition?.id === rendition.id ? 'rgba(255,255,255,0.1)' : 'transparent'};
          border: none;
          color: white;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
        `;
        option.textContent = `${rendition.label} ${currentRendition?.id === rendition.id ? '✓' : ''}`;
        option.onmouseenter = () => option.style.background = 'rgba(255,255,255,0.2)';
        option.onmouseleave = () => option.style.background = currentRendition?.id === rendition.id ? 'rgba(255,255,255,0.1)' : 'transparent';
        option.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (handleQualityChangeRef.current) {
            handleQualityChangeRef.current(rendition.id);
          }
        });
        menu.appendChild(option);
      });

      container.appendChild(menu);
    }
  }, [showQualityMenu, isMobile, isPipMode, isInFullscreen, availableRenditions, currentRendition]);

  // Inject quality control into shadow DOM for mobile mode
  // Uses the EXACT same pattern as desktop non-fullscreen injection
  useEffect(() => {
    // On mobile, we want the quality button even in custom fullscreen
    // but hide PiP button in custom fullscreen and not in PiP mode
    // PiP button requires the callback to be available
    if (!isMobile || isPipMode || availableRenditions.length === 0) {
      return;
    }

    const mediaTheme = mediaThemeRef.current;
    if (!mediaTheme) return;

    const shadowRoot = mediaTheme.shadowRoot;
    if (!shadowRoot) return;

    let injectedContainer: HTMLDivElement | null = null;
    let injectedContainer2: HTMLDivElement | null = null;

    const removeInjectedElements = () => {
      if (injectedContainer && injectedContainer.parentNode) {
        injectedContainer.parentNode.removeChild(injectedContainer);
        injectedContainer = null;
      }
      if (injectedContainer2 && injectedContainer2.parentNode) {
        injectedContainer2.parentNode.removeChild(injectedContainer2);
        injectedContainer2 = null;
      }
    };

    const injectQualityControl = () => {
      // Remove any existing injected elements
      removeInjectedElements();

      // Find the fullscreen button first - this is our anchor point (EXACT same pattern as desktop)
      const fullscreenButtonSelectors = [
        'media-fullscreen-button',
        '[part*="fullscreen"]',
        'button[aria-label*="fullscreen" i]',
        'button[aria-label*="full screen" i]'
      ];

      let fullscreenButton: HTMLElement | null = null;
      for (const selector of fullscreenButtonSelectors) {
        fullscreenButton = shadowRoot.querySelector(selector) as HTMLElement;
        if (fullscreenButton) break;
      }

      // Find the parent container that holds the fullscreen button (EXACT same pattern as desktop)
      let targetContainer: Element | ShadowRoot | null = null;

      if (fullscreenButton) {
        // Use the same parent as the fullscreen button
        targetContainer = fullscreenButton.parentElement;
      } else {
        // Fallback: look for control bar or similar container
        const possibleTargets = [
          'media-control-bar',
          '[part="control-bar"]',
          '.control-bar',
          '[slot="fullscreen"]',
          'div[part]',
        ];

        for (const selector of possibleTargets) {
          const found = shadowRoot.querySelector(selector);
          if (found) {
            targetContainer = found;
            break;
          }
        }

        // Last resort: use shadow root
        if (!targetContainer) {
          targetContainer = shadowRoot;
        }
      }

      // Create first button with inline styles (mobile style - transparent, no background)
      const button = document.createElement('button');
      button.id = 'quality-button-mobile';
      button.setAttribute('aria-label', 'Quality settings');
      button.setAttribute('part', 'quality-button');
      button.style.cssText = `
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        pointer-events: auto;
      `;
      button.innerHTML = `
        <svg fill="none" stroke="white" viewBox="0 0 24 24" style="width: 24px; height: 24px;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
        </svg>
      `;

      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowQualityMenu(prev => !prev);
      };

      // Create a container that holds the first button
      // Position it at top of screen, next to the volume button
      // In custom fullscreen, position within 85% width area (to the left of volume button)
      const qualityRightValue = isCustomFullscreen ? 'calc(7.5% + 48px + 8px)' : '56px'; // To the left of volume button, accounting for volume button width (48px) and gap (8px)
      const container = document.createElement('div');
      container.id = 'quality-control-mobile-container';
      container.style.cssText = `
        position: absolute;
        top: 8px;
        right: ${qualityRightValue};
        z-index: 2147483647;
        pointer-events: auto;
        display: flex;
        align-items: center;
      `;
      container.appendChild(button);

      // Store reference for cleanup
      injectedContainer = container;

      // Create second button (PiP trigger - downward arrow) - Only create if not in custom fullscreen
      // Hide PiP button when in custom fullscreen mode
      if (!isCustomFullscreen && onTriggerPipMode) {
        const button2 = document.createElement('button');
        button2.id = 'pip-button-mobile';
        button2.setAttribute('aria-label', 'Enter picture-in-picture mode');
        button2.setAttribute('part', 'pip-button');
        button2.style.cssText = `
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          pointer-events: auto;
        `;
        button2.innerHTML = `
          <svg fill="none" stroke="white" viewBox="0 0 24 24" style="width: 24px; height: 24px;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        `;

        button2.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onTriggerPipMode) {
            onTriggerPipMode();
          }
        };

        // Create a container that holds the second button
        // Position it in the top-left, opposite the volume control
        const container2 = document.createElement('div');
        container2.id = 'pip-button-mobile-container';
        container2.style.cssText = `
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 2147483647;
          pointer-events: auto;
          display: flex;
          align-items: center;
        `;
        container2.appendChild(button2);

        // Store reference for cleanup
        injectedContainer2 = container2;

        // Inject PiP button container
        if (targetContainer) {
          if (targetContainer instanceof ShadowRoot) {
            targetContainer.appendChild(container2);
          } else {
            targetContainer.appendChild(container2);
          }
        } else {
          shadowRoot.appendChild(container2);
        }
      }

      // Inject quality button container (always inject)
      if (targetContainer) {
        if (targetContainer instanceof ShadowRoot) {
          targetContainer.appendChild(container);
        } else {
          targetContainer.appendChild(container);
        }
      } else {
        shadowRoot.appendChild(container);
      }
    };

    // Initial injection
    injectQualityControl();

    return () => {
      removeInjectedElements();
    };
  }, [isMobile, isPipMode, availableRenditions.length, isCustomFullscreen, onTriggerPipMode]);

  // Update mobile menu when showQualityMenu changes (mobile)
  useEffect(() => {
    // Show menu on mobile regardless of custom fullscreen state
    if (!isMobile || isPipMode || availableRenditions.length === 0) return;

    // Remove existing menu overlay if it exists (from document body)
    const existingOverlay = document.getElementById('quality-menu-mobile-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // If menu should be shown, create and append it
    if (showQualityMenu && availableRenditions.length > 0) {
      // Create full-screen overlay
      const overlay = document.createElement('div');
      overlay.id = 'quality-menu-mobile-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10002;
      `;

      // Close menu when clicking/touching overlay background (not the menu)
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          setShowQualityMenu(false);
        }
      };
      overlay.ontouchend = (e) => {
        if (e.target === overlay) {
          e.preventDefault();
          setShowQualityMenu(false);
        }
      };

      // Create menu container
      const menu = document.createElement('div');
      menu.style.cssText = `
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        min-width: 280px;
        max-width: 90%;
        max-height: 80%;
        overflow: auto;
        padding: 20px;
      `;
      // Prevent touch events from bubbling to overlay
      menu.ontouchstart = (e) => e.stopPropagation();
      menu.ontouchend = (e) => e.stopPropagation();
      menu.onclick = (e) => e.stopPropagation();

      // Add title
      const title = document.createElement('div');
      title.textContent = 'Quality';
      title.style.cssText = `
        margin-bottom: 16px;
        font-size: 18px;
        font-weight: 600;
        color: #ffffff;
      `;
      menu.appendChild(title);

      // Add quality options
      availableRenditions.forEach((rendition, index) => {
        const option = document.createElement('button');
        option.style.cssText = `
          width: 100%;
          padding: 14px 16px;
          background: ${currentRendition?.id === rendition.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
          border: none;
          border-radius: 4px;
          border-top: ${index > 0 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'};
          color: #ffffff;
          font-size: 16px;
          text-align: left;
          cursor: pointer;
          font-family: system-ui, -apple-system, sans-serif;
          transition: background 0.2s ease;
          margin-bottom: 8px;
        `;
        option.textContent = `${rendition.label} ${currentRendition?.id === rendition.id ? '✓' : ''}`;
        
        // Visual feedback
        option.ontouchstart = () => {
          option.style.background = 'rgba(255, 255, 255, 0.2)';
        };
        option.onmouseenter = () => {
          option.style.background = 'rgba(255, 255, 255, 0.2)';
        };
        option.onmouseleave = () => {
          option.style.background = currentRendition?.id === rendition.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
        };
        
        // Handle selection - use touchend for mobile, click for desktop
        const handleSelect = () => {
          console.log('[Mobile Quality] Selected:', rendition.id, rendition.label);
          if (handleQualityChangeRef.current) {
            console.log('[Mobile Quality] Calling handleQualityChangeRef');
            handleQualityChangeRef.current(rendition.id);
          } else {
            console.warn('[Mobile Quality] handleQualityChangeRef.current is null!');
          }
          setShowQualityMenu(false);
        };
        
        option.ontouchend = (e) => {
          e.preventDefault();
          e.stopPropagation();
          option.style.background = currentRendition?.id === rendition.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
          handleSelect();
        };
        
        option.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSelect();
        };
        menu.appendChild(option);
      });

      overlay.appendChild(menu);
      // Inject into document body for full-screen overlay
      document.body.appendChild(overlay);
    }
  }, [showQualityMenu, isMobile, isPipMode, isInFullscreen, availableRenditions, currentRendition]);

  // Inject gradient overlay at bottom of player (behind controls)
  useEffect(() => {
    if (isPipMode) return; // Don't show gradient in PiP mode

    const mediaTheme = mediaThemeRef.current;
    if (!mediaTheme) return;

    const shadowRoot = mediaTheme.shadowRoot;
    if (!shadowRoot) return;

    let gradientOverlay: HTMLDivElement | null = null;

    const injectGradientOverlay = () => {
      // Remove existing gradient if it exists
      const existing = shadowRoot.getElementById('video-gradient-overlay');
      if (existing) {
        existing.remove();
      }

      // Create gradient overlay element
      gradientOverlay = document.createElement('div');
      gradientOverlay.id = 'video-gradient-overlay';
      gradientOverlay.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.2) 50%, transparent 100%);
        pointer-events: none;
        z-index: 0;
      `;

      // Find the video element or a container that wraps the video
      // We want to inject into a container that's positioned relative to the video
      const videoElement = shadowRoot.querySelector('video');
      let targetContainer: Element | ShadowRoot | null = null;

      if (videoElement) {
        // Try to find a parent container that wraps the video
        let parent: Element | null = videoElement.parentElement;
        let depth = 0;
        const maxDepth = 10; // Prevent infinite loops
        
        while (parent && depth < maxDepth) {
          const style = window.getComputedStyle(parent);
          if (style.position === 'relative' || style.position === 'absolute') {
            targetContainer = parent;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
        // If no positioned parent found, use video's direct parent
        if (!targetContainer && videoElement.parentElement) {
          targetContainer = videoElement.parentElement;
        }
      }

      // Fallback: look for common container selectors
      if (!targetContainer) {
        const possibleTargets = [
          'media-control-bar',
          '[part="control-bar"]',
          '.control-bar',
          'div[part*="bottom"]',
          'div[part*="container"]',
        ];

        for (const selector of possibleTargets) {
          const found = shadowRoot.querySelector(selector);
          if (found) {
            targetContainer = found;
            break;
          }
        }
      }

      // Last resort: inject into shadow root
      if (!targetContainer) {
        targetContainer = shadowRoot;
      }

      // Inject the gradient overlay - use prepend to put it FIRST in DOM order (behind other elements)
      if (targetContainer instanceof ShadowRoot) {
        targetContainer.prepend(gradientOverlay);
      } else {
        targetContainer.prepend(gradientOverlay);
      }
    };

    // Initial injection
    injectGradientOverlay();

    // Re-inject if shadow root changes (e.g., on fullscreen toggle)
    const observer = new MutationObserver(() => {
      if (!shadowRoot.getElementById('video-gradient-overlay')) {
        injectGradientOverlay();
      }
    });

    observer.observe(shadowRoot, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (gradientOverlay && gradientOverlay.parentNode) {
        gradientOverlay.parentNode.removeChild(gradientOverlay);
      }
    };
  }, [isPipMode, isInFullscreen]);

  // Prevent native fullscreen on mobile and handle custom fullscreen
  useEffect(() => {
    if (!isMobile || !videoRef.current) return;

    const video = videoRef.current;
    
    // Prevent native iOS fullscreen
    const preventNativeFullscreen = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };

    // Prevent webkit fullscreen events
    video.addEventListener('webkitbeginfullscreen', preventNativeFullscreen, true);
    video.addEventListener('webkitendfullscreen', preventNativeFullscreen, true);
    
    // Also prevent fullscreen API
    const handleFullscreenChange = () => {
      if (document.fullscreenElement === video || (document as any).webkitFullscreenElement === video) {
        document.exitFullscreen?.();
        (document as any).webkitExitFullscreen?.();
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    return () => {
      video.removeEventListener('webkitbeginfullscreen', preventNativeFullscreen, true);
      video.removeEventListener('webkitendfullscreen', preventNativeFullscreen, true);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isMobile]);

  // Progress tracking logic and premium preview limit
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Set initial time for auto-resume (only if user was logged in and has progress)
    // For premium preview, if initial time is at or past preview limit, reset to 0
    // This ensures users always start from the beginning when returning to premium content
    if (initialTime && initialTime > 0 && !hasSetInitialTime) {
      let timeToSet = initialTime;
      
      if (isPremiumPreview) {
        // If saved progress is at or past preview limit, start from beginning
        if (initialTime >= previewLimitSeconds) {
          timeToSet = 0;
        } else {
          // Otherwise, cap at preview limit (shouldn't happen, but safety check)
          timeToSet = Math.min(initialTime, previewLimitSeconds);
        }
      }
      
      videoElement.currentTime = timeToSet;
      setHasSetInitialTime(true);
    }

    // Throttled progress save (every 15 seconds)
    const throttledSave = createProgressThrottle((time: number, dur: number) => {
      onTimeUpdate?.(time, dur);
    }, 15000);

    // Listen to timeupdate events
    const handleTimeUpdate = () => {
      const currentTime = videoElement.currentTime;
      
      // Check premium preview limit
      if (isPremiumPreview && !previewLimitReached && currentTime >= previewLimitSeconds) {
        setPreviewLimitReached(true);
        videoElement.pause();
        // Clear saved progress so user starts from beginning on refresh
        clearVideoProgress(contentId).catch(err => {
          console.error('Failed to clear video progress:', err);
        });
        onPreviewLimitReached?.();
        return; // Don't save progress beyond preview limit
      }
      
      // Prevent seeking beyond preview limit for premium preview
      if (isPremiumPreview && currentTime > previewLimitSeconds) {
        videoElement.currentTime = previewLimitSeconds;
        if (!previewLimitReached) {
          setPreviewLimitReached(true);
          videoElement.pause();
          onPreviewLimitReached?.();
        }
        return;
      }
      
      // Only save progress if not at or past preview limit for premium preview
      if (!isPremiumPreview || currentTime < previewLimitSeconds) {
        throttledSave(currentTime, videoElement.duration);
      }
    };

    // Handle pause - save progress immediately
    const handlePauseWithProgress = () => {
      console.log('[MuxVideoPlayer] handlePauseWithProgress called', {
        videoPaused: videoElement.paused,
        videoCurrentTime: videoElement.currentTime,
        documentHidden: typeof document !== 'undefined' ? document.hidden : false
      });
      
      // Update isPlaying state (but don't clear background ref if app is going to background)
      setIsPlaying(false);
      onPause?.();
      // Only save progress if not at or past preview limit
      // For premium preview, don't save if at or past the limit (so users start from beginning on refresh)
      if (!isPremiumPreview || videoElement.currentTime < previewLimitSeconds) {
        saveProgressImmediately(contentId, videoElement.currentTime, videoElement.duration);
      }
      
      // Notify Android that video is paused
      // BUT: Don't set to false if app is going to background (for PiP)
      // The pause event might fire when app goes to background, but we want to keep the flag true for PiP
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        const isAppGoingToBackground = typeof document !== 'undefined' && document.hidden;
        if (!isAppGoingToBackground) {
          // Only set to false if app is still visible (user actually paused)
          console.log('[MuxVideoPlayer] App is visible - notifying Android that video is paused');
          if ((window as any).AndroidFullScreen) {
            try {
              (window as any).AndroidFullScreen.setVideoPlaying(false);
              console.log('[MuxVideoPlayer] Successfully called setVideoPlaying(false)');
            } catch (err) {
              console.error('[MuxVideoPlayer] Error calling setVideoPlaying:', err);
            }
          } else {
            console.warn('[MuxVideoPlayer] AndroidFullScreen interface not available');
          }
        } else {
          console.log('[MuxVideoPlayer] App is going to background - keeping video playing state for PiP');
        }
      }
    };

    // Handle play - prevent playing if preview limit reached
    const handlePlayWithProgress = () => {
      console.log('[MuxVideoPlayer] handlePlayWithProgress called', {
        isPremiumPreview,
        previewLimitReached,
        videoPaused: videoElement.paused,
        videoReadyState: videoElement.readyState
      });
      
      if (isPremiumPreview && previewLimitReached) {
        videoElement.pause();
        return;
      }
      
      // CRITICAL: Update isPlaying state and background ref
      // This was missing, causing wasPlayingBeforeBackgroundRef to stay false
      // and iOS background playback to not resume
      setIsPlaying(true);
      onPlay?.();
      
      // Notify Android that video is playing (for background playback)
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        console.log('[MuxVideoPlayer] Attempting to notify Android that video is playing', {
          hasAndroidFullScreen: !!(window as any).AndroidFullScreen,
          hasSetVideoPlaying: !!((window as any).AndroidFullScreen?.setVideoPlaying)
        });
        if ((window as any).AndroidFullScreen) {
          try {
            (window as any).AndroidFullScreen.setVideoPlaying(true);
            console.log('[MuxVideoPlayer] Successfully called setVideoPlaying(true)');
          } catch (err) {
            console.error('[MuxVideoPlayer] Error calling setVideoPlaying:', err);
          }
        } else {
          console.warn('[MuxVideoPlayer] AndroidFullScreen interface not available');
        }
      }
    };

    // Handle seeking - prevent seeking beyond preview limit
    const handleSeeking = () => {
      if (isPremiumPreview && videoElement.currentTime > previewLimitSeconds) {
        videoElement.currentTime = previewLimitSeconds;
      }
    };

    // Handle ended - clear progress if video completed
    const handleEndedWithProgress = () => {
      onEnded?.();
      // Clear progress if video completed (>95%)
      if (isVideoCompleted(videoElement.currentTime, videoElement.duration)) {
        onTimeUpdate?.(videoElement.currentTime, videoElement.duration);
      }
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('pause', handlePauseWithProgress);
    videoElement.addEventListener('play', handlePlayWithProgress);
    videoElement.addEventListener('ended', handleEndedWithProgress);
    videoElement.addEventListener('seeking', handleSeeking);
    
    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('pause', handlePauseWithProgress);
      videoElement.removeEventListener('play', handlePlayWithProgress);
      videoElement.removeEventListener('ended', handleEndedWithProgress);
      videoElement.removeEventListener('seeking', handleSeeking);
    };
  }, [initialTime, onTimeUpdate, contentId, onPlay, onPause, onEnded, hasSetInitialTime, isPremiumPreview, previewLimitSeconds, previewLimitReached, onPreviewLimitReached]);

  // Fetch series data using React Query (with automatic caching)
  const { data: seriesData } = useQuery({
    queryKey: queryKeys.content.series(contentId || ''),
    queryFn: async () => {
      try {
        const response = await fetch(`/api/content-items/${contentId}/series`, {
          credentials: 'include',
        });

        if (!response.ok) {
          return { seriesTitle: null };
        }

        const data = await response.json();
        return {
          seriesTitle: data.seriesTitle || null,
        };
      } catch (error) {
        console.error('[MuxVideoPlayer] Failed to fetch series data:', error);
        return { seriesTitle: null };
      }
    },
    enabled: !!contentId && typeof navigator !== 'undefined' && 'mediaSession' in navigator,
    staleTime: 10 * 60 * 1000, // 10 minutes - series data rarely changes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Set up Media Session API for iOS lockscreen controls and background playback
  useEffect(() => {
    if (!title || !contentId || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Detect if running in standalone/web-app mode (iOS)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true ||
                        document.referrer.includes('android-app://');

    console.log('[MuxVideoPlayer] Setting up Media Session API', { 
      isStandalone, 
      hasMediaSession: !!navigator.mediaSession,
      title 
    });

    let cancelled = false;

    // Update MediaSession metadata when series data is available
    if (seriesData && navigator.mediaSession) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title || 'Untitled',
          artist: seriesData.seriesTitle || 'Harmony',
          artwork: thumbnailUrl ? [
            { src: thumbnailUrl, sizes: '300x300', type: 'image/png' },
            { src: thumbnailUrl, sizes: '512x512', type: 'image/png' }
          ] : []
        });
        console.log('[MuxVideoPlayer] Media Session metadata set successfully');
      } catch (error) {
        console.error('[MuxVideoPlayer] Failed to set Media Session metadata:', error);
      }
    }

    // Handle media session action events (play/pause from lockscreen)
    if (navigator.mediaSession) {
      try {
        navigator.mediaSession.setActionHandler('play', async () => {
          const video = videoRef.current;
          if (!video) {
            console.warn('[MuxVideoPlayer] Video element not available');
            return;
          }
          
          console.log('[MuxVideoPlayer] Media Session play handler called', { 
            isStandalone, 
            readyState: video.readyState,
            paused: video.paused
          });
          
          try {
            // Update React state before playing
            setIsPlaying(true);
            
            // Update Media Session playback state BEFORE playing (important for background playback)
            if (navigator.mediaSession) {
              navigator.mediaSession.playbackState = 'playing';
            }
            
            // Attempt to play
            const playPromise = video.play();
            if (playPromise !== undefined) {
              await playPromise;
            }
            
            console.log('[MuxVideoPlayer] Media Session play successful from lock screen');
            onPlay?.();
          } catch (error) {
            console.error('[MuxVideoPlayer] Media Session play failed from lock screen:', error);
            setIsPlaying(false);
            // Try to update Media Session playback state
            if (navigator.mediaSession) {
              navigator.mediaSession.playbackState = 'paused';
            }
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          const video = videoRef.current;
          if (!video) {
            console.warn('[MuxVideoPlayer] Video element not available');
            return;
          }
          
          console.log('[MuxVideoPlayer] Media Session pause handler called', { isStandalone });
          
          try {
            // Update React state immediately
            setIsPlaying(false);
            
            // Update Media Session playback state BEFORE pausing (important for background playback)
            if (navigator.mediaSession) {
              navigator.mediaSession.playbackState = 'paused';
            }
            
            video.pause();
            
            console.log('[MuxVideoPlayer] Media Session pause successful from lock screen');
            onPause?.();
          } catch (error) {
            console.error('[MuxVideoPlayer] Media Session pause failed from lock screen:', error);
          }
        });

        // Optional: Add seek forward/backward handlers
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const video = videoRef.current;
          if (video) {
            const seekOffset = details.seekOffset || 10;
            video.currentTime = Math.min(video.currentTime + seekOffset, video.duration);
          }
        });

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const video = videoRef.current;
          if (video) {
            const seekOffset = details.seekOffset || 10;
            video.currentTime = Math.max(video.currentTime - seekOffset, 0);
          }
        });

        console.log('[MuxVideoPlayer] Media Session action handlers registered successfully');
      } catch (error) {
        console.error('[MuxVideoPlayer] Failed to set Media Session action handlers:', error);
      }
    }

    // Update playback state when video plays/pauses
    const updatePlaybackState = () => {
      if (!navigator.mediaSession || cancelled) return;
      
      const video = videoRef.current;
      if (!video) return;

      try {
        if (video.paused) {
          navigator.mediaSession.playbackState = 'paused';
        } else {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch (error) {
        console.error('[MuxVideoPlayer] Failed to update Media Session playback state:', error);
      }
    };

    videoElement.addEventListener('play', updatePlaybackState);
    videoElement.addEventListener('pause', updatePlaybackState);

    // Cleanup
    return () => {
      cancelled = true;
      videoElement.removeEventListener('play', updatePlaybackState);
      videoElement.removeEventListener('pause', updatePlaybackState);
      
      if (navigator.mediaSession) {
        navigator.mediaSession.metadata = null;
        // Clear action handlers to prevent memory leaks
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
      }
    };
  }, [title, contentId, thumbnailUrl, onPlay, onPause, seriesData]);

  // Handle HTML5 Picture-in-Picture API
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => {
      console.log('[MuxVideoPlayer] Entered HTML5 PiP mode');
      setIsInPictureInPicture(true);
      onPictureInPictureChange?.(true);
    };

    const handleLeavePiP = () => {
      console.log('[MuxVideoPlayer] Left HTML5 PiP mode');
      setIsInPictureInPicture(false);
      onPictureInPictureChange?.(false);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [onPictureInPictureChange]);

  // Handle Android native Picture-in-Picture mode (fallback)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    
    const handleAndroidPiPChange = (event: CustomEvent) => {
      const { isInPictureInPicture: androidPiP } = event.detail;
      console.log('[MuxVideoPlayer] Android native PiP state changed:', androidPiP);
      setIsInPictureInPicture(androidPiP);
      onPictureInPictureChange?.(androidPiP);
    };
    
    window.addEventListener('androidpipchange', handleAndroidPiPChange as EventListener);
    
    return () => {
      window.removeEventListener('androidpipchange', handleAndroidPiPChange as EventListener);
    };
  }, [onPictureInPictureChange]);

  // Handle Android native PiP video control commands (play/pause from PiP controls)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    
    const handleAndroidPiPVideoCommand = (event: CustomEvent) => {
      const { command } = event.detail;
      console.log('[MuxVideoPlayer] Android PiP video command received:', command);
      
      // Try multiple methods to find the video element
      let video: HTMLVideoElement | null = null;
      
      // Method 1: Use videoRef (direct reference)
      if (videoRef.current) {
        // Check if videoRef.current is the actual video element
        if (videoRef.current instanceof HTMLVideoElement) {
          video = videoRef.current;
          console.log('[MuxVideoPlayer] Found video via videoRef (direct)');
        } else {
          // videoRef might be pointing to mux-video element, try to get video from it
          const muxVideo = videoRef.current as any;
          if (muxVideo.shadowRoot) {
            video = muxVideo.shadowRoot.querySelector('video');
            console.log('[MuxVideoPlayer] Found video via videoRef shadowRoot:', !!video);
          }
          if (!video && muxVideo.querySelector) {
            video = muxVideo.querySelector('video');
            console.log('[MuxVideoPlayer] Found video via videoRef querySelector:', !!video);
          }
          if (!video && muxVideo.video) {
            video = muxVideo.video;
            console.log('[MuxVideoPlayer] Found video via videoRef.video property');
          }
        }
      }
      
      // Method 2: Find mux-video element and get video from shadow DOM
      if (!video) {
        const muxVideo = document.querySelector('mux-video') as any;
        if (muxVideo) {
          if (muxVideo.shadowRoot) {
            video = muxVideo.shadowRoot.querySelector('video');
            console.log('[MuxVideoPlayer] Found video via document.querySelector shadowRoot:', !!video);
          }
          if (!video && muxVideo.querySelector) {
            video = muxVideo.querySelector('video');
            console.log('[MuxVideoPlayer] Found video via document.querySelector querySelector:', !!video);
          }
          if (!video && muxVideo.video) {
            video = muxVideo.video;
            console.log('[MuxVideoPlayer] Found video via muxVideo.video property');
          }
        }
      }
      
      // Method 3: Fallback to any video element
      if (!video) {
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
          video = videos[0] as HTMLVideoElement;
          console.log('[MuxVideoPlayer] Using fallback video element');
        }
      }
      
      if (!video) {
        console.error('[MuxVideoPlayer] No video element found for PiP command');
        return;
      }
      
      console.log('[MuxVideoPlayer] Video element found, executing command:', command);
      
      try {
        if (command === 'play') {
          console.log('[MuxVideoPlayer] Executing play command from Android PiP');
          video.play().then(() => {
            console.log('[MuxVideoPlayer] Video played successfully from PiP control');
            setIsPlaying(true);
            onPlay?.();
          }).catch((err) => {
            console.error('[MuxVideoPlayer] Failed to play video from PiP control:', err);
          });
        } else if (command === 'pause') {
          console.log('[MuxVideoPlayer] Executing pause command from Android PiP');
          video.pause();
          setIsPlaying(false);
          onPause?.();
          console.log('[MuxVideoPlayer] Video paused successfully from PiP control');
        }
      } catch (error) {
        console.error('[MuxVideoPlayer] Error executing PiP command:', error);
      }
    };
    
    window.addEventListener('androidpipvideocommand', handleAndroidPiPVideoCommand as EventListener);
    
    return () => {
      window.removeEventListener('androidpipvideocommand', handleAndroidPiPVideoCommand as EventListener);
    };
  }, [onPlay, onPause]);

  // Function to enter HTML5 Picture-in-Picture
  const enterPictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) {
      console.warn('[MuxVideoPlayer] HTML5 PiP not supported or video not available');
      return;
    }

    try {
      await video.requestPictureInPicture();
      console.log('[MuxVideoPlayer] Successfully entered HTML5 PiP');
    } catch (error) {
      console.error('[MuxVideoPlayer] Failed to enter HTML5 PiP:', error);
    }
  }, []);

  // Function to exit HTML5 Picture-in-Picture
  const exitPictureInPicture = useCallback(async () => {
    if (!document.pictureInPictureElement) {
      return;
    }

    try {
      await document.exitPictureInPicture();
      console.log('[MuxVideoPlayer] Successfully exited HTML5 PiP');
    } catch (error) {
      console.error('[MuxVideoPlayer] Failed to exit HTML5 PiP:', error);
    }
  }, []);

  // Track video playing state in a ref (persists across renders, won't be affected by iOS pausing)
  const wasPlayingBeforeBackgroundRef = useRef<boolean>(false);
  
  // Update ref when playing state changes
  // BUT: Don't clear it when the app is going to background (iOS pauses video before background)
  useEffect(() => {
    if (isPlaying) {
      // Always set to true when video starts playing
      wasPlayingBeforeBackgroundRef.current = true;
    } else {
      // Only clear to false if the app is visible (user actually paused)
      // If app is hidden, iOS caused the pause, so keep the ref true
      const isAppHidden = typeof document !== 'undefined' && document.hidden;
      if (!isAppHidden) {
        wasPlayingBeforeBackgroundRef.current = false;
      }
    }
  }, [isPlaying]);


  // Handle visibility changes - iOS background audio (single stream), Android: Keep existing behavior
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const isIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    
    const handlePageHide = async (event: PageTransitionEvent) => {
      // iOS: Native player plugin handles background playback
      // Android: Keep existing behavior
      if (isIOS) return;
      
      const videoElement = videoRef.current;
      if (!videoElement) return;
    };
    
    const handleVisibilityChange = async () => {
      const videoElement = videoRef.current;
      if (!videoElement) return;
      
      console.log('[MuxVideoPlayer] Visibility changed', {
        hidden: document.hidden,
        videoPaused: videoElement.paused,
        isPlaying,
        wasPlayingBefore: wasPlayingBeforeBackgroundRef.current,
        platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'
      });
      
      // iOS: Native player plugin handles background playback
      // Auto exit PiP when app is opened (if PiP was explicitly activated)
      if (isIOS && !document.hidden && isInPictureInPicture) {
        try {
          await exitPictureInPicture();
        } catch (err) {
          console.warn('[MuxVideoPlayer] Failed to exit PiP on iOS app open:', err);
        }
        return;
      }
      
      // Android: Keep existing behavior (native PiP handling)
      if (isAndroid && document.hidden && !videoElement.paused && isPlaying && !isInPictureInPicture) {
        console.log('[MuxVideoPlayer] Android app went to background with video playing');
        
        // Ensure Android knows video is playing (for native PiP)
          if ((window as any).AndroidFullScreen) {
            try {
              (window as any).AndroidFullScreen.setVideoPlaying(true);
              console.log('[MuxVideoPlayer] Updated Android video playing state to true');
            } catch (err) {
              console.error('[MuxVideoPlayer] Error updating Android video state:', err);
          }
        }
        
        // Try HTML5 PiP first if supported (fallback)
        if (document.pictureInPictureEnabled) {
          console.log('[MuxVideoPlayer] Attempting to enter HTML5 PiP on Android');
          try {
            await enterPictureInPicture();
            return; // Success, exit early
          } catch (err) {
            console.warn('[MuxVideoPlayer] Failed to enter HTML5 PiP on Android:', err);
          }
        }
        
        // Fallback to Android native PiP if HTML5 PiP not available or failed
          if ((window as any).AndroidFullScreen?.enterPictureInPicture) {
            console.log('[MuxVideoPlayer] Attempting Android native PiP');
            try {
              (window as any).AndroidFullScreen.enterPictureInPicture();
            } catch (err) {
              console.error('[MuxVideoPlayer] Failed to enter Android native PiP:', err);
            }
          } else {
            console.warn('[MuxVideoPlayer] Android native PiP method not available');
          }
        return; // Android handled, exit early
        }
      
      // Web/Other: Try to resume if app returned to foreground
      if (!isIOS && !isAndroid && !document.hidden && videoElement.paused && isPlaying && !isInPictureInPicture) {
        console.log('[MuxVideoPlayer] App returned to foreground, attempting to resume video');
        videoElement.play().catch(err => {
          console.warn('[MuxVideoPlayer] Failed to resume video after returning from background:', err);
        });
      }
    };
    
    // Use pagehide for iOS (fires earlier, before iOS pauses video)
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, isInPictureInPicture, enterPictureInPicture, exitPictureInPicture]);

  // Track video state for Android PiP - set EAGERLY when video is ready
  // This is critical because the play event fires too late (after onUserLeaveHint)
  // Use a ref to track last known state to avoid unnecessary updates
  const lastAndroidVideoStateRef = useRef<boolean | null>(null);
  
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }
    
    const checkAndUpdateVideoState = () => {
      const videoElement = videoRef.current;
      if (!videoElement) return;
      
      const isVideoReady = videoElement.readyState >= 2; // HAVE_CURRENT_DATA or better
      const isVideoPlaying = !videoElement.paused && !videoElement.ended;
      const shouldBePlaying = (isVideoReady && !videoElement.paused) || isVideoPlaying;
      
      // Only update if state has changed
      if (shouldBePlaying !== lastAndroidVideoStateRef.current) {
        lastAndroidVideoStateRef.current = shouldBePlaying;
        if ((window as any).AndroidFullScreen?.setVideoPlaying) {
          console.log('[MuxVideoPlayer] Video state changed - updating Android', {
            was: lastAndroidVideoStateRef.current === null ? 'unknown' : lastAndroidVideoStateRef.current,
            now: shouldBePlaying,
            paused: videoElement.paused,
            ended: videoElement.ended,
            readyState: videoElement.readyState
          });
          (window as any).AndroidFullScreen.setVideoPlaying(shouldBePlaying);
        }
      }
    };
    
    // Check immediately and on a short interval while mounted
    checkAndUpdateVideoState();
    const interval = setInterval(checkAndUpdateVideoState, 500); // Check every 500ms
    
    // Also check on video events
    const videoElement = videoRef.current;
    if (videoElement) {
      const handlePlaying = () => {
        // Force update when playing event fires (state definitely changed)
        if (lastAndroidVideoStateRef.current !== true) {
          lastAndroidVideoStateRef.current = true;
          console.log('[MuxVideoPlayer] Video playing event - notifying Android');
          if ((window as any).AndroidFullScreen?.setVideoPlaying) {
            (window as any).AndroidFullScreen.setVideoPlaying(true);
          }
        }
      };
      
      const handlePause = () => {
        // Don't set to false if app is going to background (for PiP)
        // The pause event might fire when app goes to background, but we want to keep the flag true for PiP
        const isAppGoingToBackground = typeof document !== 'undefined' && document.hidden;
        if (!isAppGoingToBackground) {
          // Only set to false if app is still visible (user actually paused)
          if (lastAndroidVideoStateRef.current !== false) {
            lastAndroidVideoStateRef.current = false;
            console.log('[MuxVideoPlayer] Video paused event (app visible) - notifying Android');
            if ((window as any).AndroidFullScreen?.setVideoPlaying) {
              (window as any).AndroidFullScreen.setVideoPlaying(false);
            }
          }
        } else {
          console.log('[MuxVideoPlayer] Video paused event (app going to background) - keeping state for PiP');
        }
      };
      
      videoElement.addEventListener('playing', handlePlaying);
      videoElement.addEventListener('pause', handlePause);
      
      return () => {
        clearInterval(interval);
        videoElement.removeEventListener('playing', handlePlaying);
        videoElement.removeEventListener('pause', handlePause);
      };
    }
    
    return () => {
      clearInterval(interval);
    };
  }, []);
  
  // Save progress on component unmount
  useEffect(() => {
    return () => {
      const videoElement = videoRef.current;
      if (videoElement && videoElement.currentTime > 0) {
        // For premium preview, don't save if at or past the limit (so users start from beginning on refresh)
        if (!isPremiumPreview || videoElement.currentTime < previewLimitSeconds) {
          saveProgressImmediately(contentId, videoElement.currentTime, videoElement.duration);
          // Invalidate recently viewed cache after save to update continue shelf
          if (user?.id) {
            queryClient.invalidateQueries({ 
              queryKey: queryKeys.recentlyViewed.byUser(user.id) 
            });
          }
        }
      }
      
      // Notify Android that video is no longer playing
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        if ((window as any).AndroidFullScreen) {
          (window as any).AndroidFullScreen.setVideoPlaying(false);
        }
      }
    };
  }, [contentId, isPremiumPreview, previewLimitSeconds]);

  if (error) {
    return (
      <div className={`${className} bg-gray-900 flex items-center justify-center`}>
        <div className="text-center text-white">
          <svg className="w-12 h-12 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-medium">Video Error</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Fullscreen backdrop when in custom fullscreen */}
      {isMobile && showFullscreenBackdrop && (
        <div 
          className="fixed inset-0 z-[9998] bg-black"
          style={{ transition: 'opacity 0.3s', opacity: isCustomFullscreen ? 1 : 0 }}
          onClick={() => isCustomFullscreen && setIsCustomFullscreen(false)}
        />
      )}
      
      <div 
        ref={playerContainerRef}
        data-custom-fullscreen={isCustomFullscreen ? 'true' : undefined}
        className={`${className} relative bg-red ${isMobile ? 'overflow-visible' : 'overflow-hidden'} ${isMobile ? 'rounded-t-xl' : 'rounded-xl'} ${isMobile ? 'hide-mux-controls' : ''} ${className.includes('hide-mux-controls') ? 'hide-mux-controls' : ''}`}
        style={{
          // Only set bottom border radius when NOT in fullscreen (to avoid conflict with borderRadius shorthand)
          ...(isMobile && !isCustomFullscreen ? {
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          } : {}),
          marginBottom: (isMobile && isCustomFullscreen) ? 0 : '-10px',
          // Smooth transition for fullscreen animation
          transition: isMobile ? 'top 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
          willChange: isMobile ? 'width, height, transform' : undefined,
          // When in custom fullscreen, expand to fullscreen
          ...(isMobile && isCustomFullscreen ? {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100dvw',
            height: '100dvh',
            zIndex: 9999,
            borderRadius: 0,
            overflow: 'hidden',
            backgroundColor: 'black',
          } : {}),
        }}
      onMouseMove={isMobile ? handleUserInteraction : undefined}
      onTouchStartCapture={isMobile ? (e) => {
        // Use capture phase to intercept before MediaThemeNotflix handlers
        // If controls are hidden, prevent event from reaching MediaThemeNotflix
        if (!showCenterButton) {
          e.stopPropagation(); // Stop in capture phase before it reaches children
          handleRevealTap(e as React.TouchEvent);
        }
      } : undefined}
      onTouchStart={isMobile ? (e) => {
        // Normal phase - only handle if controls are visible
        if (showCenterButton) {
          handleUserInteraction();
        }
      } : undefined}
      onTouchMove={isMobile ? handleUserInteraction : undefined}
    >
      
      {isLoading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-10">
          <div className="flex flex-col items-center justify-center">
            <HarmonySpinner size={24} />
          </div>
        </div>
      )}

      {/* Premium Preview Limit Overlay */}
      {isPremiumPreview && previewLimitReached && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
          <div className="text-center px-6 max-w-md">
            <h3 className="text-2xl font-bold text-white mb-4">
              View the Full Video
            </h3>
            <p className="text-gray-300 mb-6 text-lg">
              Unlock {title} and more
            </p>
            <div className="flex justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onUpgradeClick?.();
                }}
                className="bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 transition-colors text-lg flex items-center gap-2 cursor-pointer"
              >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" 
                />
              </svg>
              Upgrade to Unlock
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Inner wrapper for rotation when in fullscreen portrait mode */}
      {/* Skip CSS rotation on native platforms - let native handle rotation instead */}
      <div 
        style={isMobile && isCustomFullscreen && !isLandscape && !usesNativeRotation ? {
          // Portrait mode fullscreen - rotate to landscape
          position: 'absolute',
          // Swap dimensions: make it tall and narrow
          // After 90deg rotation, it becomes wide and short (landscape)
          // Use fixed pixel dimensions to prevent flicker during iOS rotation
          width: fullscreenDimsRef.current.h + 'px',   // Use height dimension for width
          height: fullscreenDimsRef.current.w + 'px',   // Use width dimension for height
          // Center it in the viewport
          top: '50%',
          left: '50%',
          marginTop: -(fullscreenDimsRef.current.w / 2) + 'px',  // Negative half of height
          marginLeft: -(fullscreenDimsRef.current.h / 2) + 'px',  // Negative half of width
          // Rotate to landscape orientation
          transform: `rotate(${landscapeDirection === 'right' ? '90deg' : '-90deg'})`,
          transformOrigin: 'center center',
          // Smooth rotation animation
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-top 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform, width, height',
        } : {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          // Smooth exit animation
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-top 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform, width, height',
        }}
      >
        <MediaThemeNotflix 
            ref={(el: HTMLElement | null) => {
              mediaThemeRef.current = el;
            }}
            style={{ 
              width: "100%", 
              height: "100%",
              borderRadius: (isInPictureInPicture || isPipMode) ? '0.75rem' : ((isMobile && !isCustomFullscreen) ? undefined : (isCustomFullscreen ? 0 : '0.75rem')),
              overflow: (isInPictureInPicture || isPipMode || !isMobile || isCustomFullscreen) ? 'hidden' : undefined,
            }}>
            <MuxVideo
              key={remountKey}
              ref={videoRef}
              slot="media"
              playbackId={qualityParams ? `${playbackId}?${qualityParams}` : playbackId}
              playback-engine="mse"
              metadata={{
                video_title: title,
                viewer_user_id: 'anonymous', // You can replace this with actual user ID if available
              }}
              poster={thumbnailUrl || undefined}
              autoPlay={autoplay ? "any" : false}
              muted={muted ?? false}
              onLoadStart={handleLoadStart}
              onCanPlay={handleCanPlay}
              onError={handleError}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
              playsInline
              crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: isCustomFullscreen ? "contain" : "cover" }}
            />
          </MediaThemeNotflix>

      </div>

      {/* Style Notflix theme controls - quality control and other controls */}
      <style dangerouslySetInnerHTML={{
        __html: `
          /* Desktop Quality Control Styling - Matches MediaThemeNotflix theme */
          @media (min-width: 640px) {
            .quality-control-desktop {
              position: absolute !important;
              bottom: 10px !important;
              right: 64px !important;
              z-index: 1000 !important;
              transition: opacity 0.3s ease-out !important;
            }

            .quality-button-desktop {
              background: transparent !important;
              border: none !important;
              border-radius: 50% !important;
              color: #ffffff !important;
              padding: 0 !important;
              width: 48px !important;
              height: 48px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              cursor: pointer !important;
              transition: all 0.2s ease !important;
            }

            .quality-button-desktop:hover {
              background: transparent !important;
            }

            .quality-menu-desktop {
              position: absolute !important;
              bottom: 100% !important;
              right: 0 !important;
              margin-bottom: 8px !important;
              background: rgba(0, 0, 0, 0.95) !important;
              border: 1px solid rgba(255, 255, 255, 0.3) !important;
              border-radius: 4px !important;
              min-width: 120px !important;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
              overflow: hidden !important;
            }

            .quality-option-desktop {
              width: 100% !important;
              padding: 10px 16px !important;
              background: transparent !important;
              border: none !important;
              border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
              color: #ffffff !important;
              font-size: 14px !important;
              text-align: left !important;
              cursor: pointer !important;
              font-family: system-ui, -apple-system, sans-serif !important;
              transition: background 0.2s ease !important;
            }

            .quality-option-desktop:first-of-type {
              border-top: none !important;
            }

            .quality-option-desktop[data-selected="true"] {
              background: rgba(255, 255, 255, 0.1) !important;
            }

            .quality-option-desktop:hover:not([data-selected="true"]) {
              background: rgba(255, 255, 255, 0.05) !important;
            }
          }

          /* Mobile Quality Control Styling - Position at top next to volume button */
          @media (max-width: 639px) {
            .quality-control-mobile,
            #quality-control-mobile-container {
              position: absolute !important;
              top: 8px !important;
              right: 56px !important;
              z-index: 2147483647 !important;
              width: 48px !important;
              height: 48px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              pointer-events: auto !important;
            }
            
            /* Custom fullscreen: Position quality button within 85% width area (to the left of volume button) */
            [data-custom-fullscreen="true"] #quality-control-mobile-container {
              right: calc(7.5% + 48px + 8px) !important;
            }
            #quality-button-mobile {
              width: 48px !important;
              height: 48px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              background: transparent !important;
              border: none !important;
              cursor: pointer !important;
            }

            /* Mobile PiP Button Styling - Position at top-left opposite volume button */
            #pip-button-mobile-container {
              position: absolute !important;
              top: 8px !important;
              left: 8px !important;
              z-index: 2147483647 !important;
              width: 48px !important;
              height: 48px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              pointer-events: auto !important;
            }
            #pip-button-mobile {
              width: 48px !important;
              height: 48px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              background: transparent !important;
              border: none !important;
              cursor: pointer !important;
            }

            /* Target Notflix theme center play button */
            media-theme-notflix::part(center play button),
            media-theme-notflix::part(centerPlayButton),
            mux-player::part(center play button) {
              width: 67px !important;
              height: 67px !important;
              min-width: 67px !important;
              min-height: 67px !important;
              border-radius: 50% !important;
              background-color: rgba(0, 0, 0, 0.3) !important;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              position: absolute !important;
              left: 50% !important;
              top: 50% !important;
              transform: translate(-50%, -50%) !important;
              z-index: 20 !important;
              opacity: ${showCenterButton ? 1 : 0} !important;
              transition: opacity 0.3s ease-out !important;
              pointer-events: ${showCenterButton ? 'auto' : 'none'} !important;
              visibility: ${showCenterButton ? 'visible' : 'hidden'} !important;
            }
              /* Ensure play and pause icons are the same size */
              media-theme-notflix::part(center play button) svg,
              media-theme-notflix::part(centerPlayButton) svg,
              mux-player::part(center play button) svg,
              media-theme-notflix media-play-button svg,
              mux-player media-play-button svg {
                width: 34px !important;
                height: 34px !important;
                min-width: 34px !important;
                min-height: 34px !important;
                max-width: 34px !important;
                max-height: 34px !important;
                fill: white !important;
                color: white !important;
              }
              /* Target play icon specifically */
              media-theme-notflix media-play-button[aria-label*="play" i] svg,
              media-theme-notflix media-play-button[aria-label*="Play" i] svg,
              mux-player media-play-button[aria-label*="play" i] svg {
                width: 34px !important;
                height: 34px !important;
                max-width: 34px !important;
                max-height: 34px !important;
              }
              /* Target pause icon specifically */
              media-theme-notflix media-play-button[aria-label*="pause" i] svg,
              media-theme-notflix media-play-button[aria-label*="Pause" i] svg,
              mux-player media-play-button[aria-label*="pause" i] svg {
                width: 34px !important;
                height: 34px !important;
                max-width: 34px !important;
                max-height: 34px !important;
              }
              /* Ensure all paths are sized consistently */
              media-theme-notflix::part(center play button) svg path,
              media-theme-notflix::part(centerPlayButton) svg path,
              mux-player::part(center play button) svg path,
              media-theme-notflix media-play-button svg path,
              mux-player media-play-button svg path {
                fill: white !important;
              }
              .hide-mux-controls media-theme-notflix::part(center play button) svg path,
              .hide-mux-controls mux-player::part(center play button) svg path {
                fill: white !important;
              }
              /* Hide skip buttons on mobile */
              .hide-mux-controls media-theme-notflix media-seek-backward-button,
              .hide-mux-controls media-theme-notflix media-seek-forward-button,
              .hide-mux-controls mux-player media-seek-backward-button,
              .hide-mux-controls mux-player media-seek-forward-button {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
              /* Show and position timeline at the very bottom (below volume and fullscreen buttons) */
              media-theme-notflix media-time-range,
              mux-player media-time-range,
              media-theme-notflix media-progress-range,
              mux-player media-progress-range,
              media-theme-notflix [part*="progress"],
              mux-player [part*="progress"],
              media-theme-notflix [part*="timeline"],
              mux-player [part*="timeline"],
              media-theme-notflix input[type="range"],
              mux-player input[type="range"] {
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                width: 100% !important;
                height: 4px !important;
                z-index: 30 !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
              }
              
              /* Custom fullscreen: Move timeline up 20px and use 85% width */
              [data-custom-fullscreen="true"] media-theme-notflix media-time-range,
              [data-custom-fullscreen="true"] mux-player media-time-range,
              [data-custom-fullscreen="true"] media-theme-notflix media-progress-range,
              [data-custom-fullscreen="true"] mux-player media-progress-range,
              [data-custom-fullscreen="true"] media-theme-notflix [part*="progress"],
              [data-custom-fullscreen="true"] mux-player [part*="progress"],
              [data-custom-fullscreen="true"] media-theme-notflix [part*="timeline"],
              [data-custom-fullscreen="true"] mux-player [part*="timeline"],
              [data-custom-fullscreen="true"] media-theme-notflix input[type="range"],
              [data-custom-fullscreen="true"] mux-player input[type="range"] {
                bottom: 20px !important;
                left: 7.5% !important;
                right: auto !important;
                width: 85% !important;
              }
              
              /* Ensure thumb is visible and not clipped */
              media-theme-notflix input[type="range"]::-webkit-slider-thumb,
              mux-player input[type="range"]::-webkit-slider-thumb,
              media-theme-notflix input[type="range"]::-moz-range-thumb,
              mux-player input[type="range"]::-moz-range-thumb {
                position: relative !important;
                z-index: 31 !important;
              }
              
              /* Style time display just above timeline - increased size */
              media-theme-notflix media-time-display,
              mux-player media-time-display,
              media-theme-notflix [part*="time-display"],
              mux-player [part*="time-display"] {
                position: absolute !important;
                bottom: 8px !important;
                left: 8px !important;
                z-index: 31 !important;
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                color: white !important;
                font-size: 16px !important;
                font-weight: 500 !important;
              }
              
              /* Custom fullscreen: Move time display up 20px and position within 85% width area */
              [data-custom-fullscreen="true"] media-theme-notflix media-time-display,
              [data-custom-fullscreen="true"] mux-player media-time-display,
              [data-custom-fullscreen="true"] media-theme-notflix [part*="time-display"],
              [data-custom-fullscreen="true"] mux-player [part*="time-display"] {
                bottom: 28px !important;
                left: 7.5% !important;
              }
              
              /* Show bottom control bar container if it contains timeline */
              media-theme-notflix [part*="bottom"]:has(media-time-range),
              mux-player [part*="bottom"]:has(media-time-range),
              media-theme-notflix [part*="bottom"]:has(input[type="range"]),
              mux-player [part*="bottom"]:has(input[type="range"]),
              media-theme-notflix media-control-bar:has(media-time-range),
              mux-player media-control-bar:has(media-time-range) {
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                width: 100% !important;
                overflow: visible !important;
                height: auto !important;
                min-height: 12px !important;
                z-index: 30 !important;
                display: flex !important;
                flex-direction: column !important;
                visibility: visible !important;
                opacity: 1 !important;
              }
              
              /* Custom fullscreen: Move bottom control bar container up 20px and use 85% width */
              [data-custom-fullscreen="true"] media-theme-notflix [part*="bottom"]:has(media-time-range),
              [data-custom-fullscreen="true"] mux-player [part*="bottom"]:has(media-time-range),
              [data-custom-fullscreen="true"] media-theme-notflix [part*="bottom"]:has(input[type="range"]),
              [data-custom-fullscreen="true"] mux-player [part*="bottom"]:has(input[type="range"]),
              [data-custom-fullscreen="true"] media-theme-notflix media-control-bar:has(media-time-range),
              [data-custom-fullscreen="true"] mux-player media-control-bar:has(media-time-range) {
                bottom: 20px !important;
                left: 7.5% !important;
                right: auto !important;
                width: 85% !important;
              }
              
              /* Position mute/volume button - at top of screen - increased size */
              media-theme-notflix media-mute-button,
              mux-player media-mute-button,
              media-theme-notflix media-volume-button,
              mux-player media-volume-button,
              media-theme-notflix button[aria-label*="mute" i],
              mux-player button[aria-label*="mute" i],
              media-theme-notflix button[aria-label*="volume" i],
              mux-player button[aria-label*="volume" i] {
                position: fixed !important;
                top: 8px !important;
                right: 8px !important;
                z-index: 50 !important;
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: 48px !important;
                height: 48px !important;
                min-width: 48px !important;
                min-height: 48px !important;
              }
              
              /* Custom fullscreen: Position volume button within 85% width area (right edge at 7.5%) */
              [data-custom-fullscreen="true"] media-theme-notflix media-mute-button,
              [data-custom-fullscreen="true"] mux-player media-mute-button,
              [data-custom-fullscreen="true"] media-theme-notflix media-volume-button,
              [data-custom-fullscreen="true"] mux-player media-volume-button,
              [data-custom-fullscreen="true"] media-theme-notflix button[aria-label*="mute" i],
              [data-custom-fullscreen="true"] mux-player button[aria-label*="mute" i],
              [data-custom-fullscreen="true"] media-theme-notflix button[aria-label*="volume" i],
              [data-custom-fullscreen="true"] mux-player button[aria-label*="volume" i] {
                right: 7.5% !important;
              }
              
              /* Increase SVG icon size inside mute/volume button */
              media-theme-notflix media-mute-button svg,
              mux-player media-mute-button svg,
              media-theme-notflix media-volume-button svg,
              mux-player media-volume-button svg,
              media-theme-notflix button[aria-label*="mute" i] svg,
              mux-player button[aria-label*="mute" i] svg,
              media-theme-notflix button[aria-label*="volume" i] svg,
              mux-player button[aria-label*="volume" i] svg {
                width: 25px !important;
                height: 25px !important;
                min-width: 25px !important;
                min-height: 25px !important;
                max-width: 25px !important;
                max-height: 25px !important;
              }
              
              /* Position fullscreen button - increased size */
              media-theme-notflix media-fullscreen-button,
              mux-player media-fullscreen-button,
              media-theme-notflix button[aria-label*="fullscreen" i],
              mux-player button[aria-label*="fullscreen" i],
              media-theme-notflix button[aria-label*="full screen" i],
              mux-player button[aria-label*="full screen" i] {
                position: absolute !important;
                bottom: 8px !important;
                right: 8px !important;
                z-index: 50 !important;
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: 48px !important;
                height: 48px !important;
                min-width: 48px !important;
                min-height: 48px !important;
              }
              
              /* Custom fullscreen: Move fullscreen button up 20px and position within 85% width area */
              [data-custom-fullscreen="true"] media-theme-notflix media-fullscreen-button,
              [data-custom-fullscreen="true"] mux-player media-fullscreen-button,
              [data-custom-fullscreen="true"] media-theme-notflix button[aria-label*="fullscreen" i],
              [data-custom-fullscreen="true"] mux-player button[aria-label*="fullscreen" i],
              [data-custom-fullscreen="true"] media-theme-notflix button[aria-label*="full screen" i],
              [data-custom-fullscreen="true"] mux-player button[aria-label*="full screen" i] {
                bottom: 28px !important;
                right: 7.5% !important;
              }
              
              /* Increase SVG icon size inside fullscreen button */
              media-theme-notflix media-fullscreen-button svg,
              mux-player media-fullscreen-button svg,
              media-theme-notflix button[aria-label*="fullscreen" i] svg,
              mux-player button[aria-label*="fullscreen" i] svg,
              media-theme-notflix button[aria-label*="full screen" i] svg,
              mux-player button[aria-label*="full screen" i] svg {
                width: 25px !important;
                height: 25px !important;
                min-width: 25px !important;
                min-height: 25px !important;
                max-width: 25px !important;
                max-height: 25px !important;
              }
              
              /* Hide other buttons except center play, timeline controls, mute button, and fullscreen button */
              media-theme-notflix button:not([part="center play button"]):not([part="centerPlayButton"]):not(media-mute-button):not(media-volume-button):not(media-fullscreen-button):not([aria-label*="mute" i]):not([aria-label*="volume" i]):not([aria-label*="fullscreen" i]):not([aria-label*="full screen" i]),
              mux-player button:not([part="center play button"]):not(media-mute-button):not(media-volume-button):not(media-fullscreen-button):not([aria-label*="mute" i]):not([aria-label*="volume" i]):not([aria-label*="fullscreen" i]):not([aria-label*="full screen" i]) {
                display: none !important;
              }
              
              /* Hide bottom bar if it doesn't contain timeline */
              media-theme-notflix [part*="bottom"]:not(:has(media-time-range)):not(:has(input[type="range"])),
              mux-player [part*="bottom"]:not(:has(media-time-range)):not(:has(input[type="range"])),
              media-theme-notflix [part*="bar"]:not(:has(media-time-range)):not(:has(input[type="range"])),
              mux-player [part*="bar"]:not(:has(media-time-range)):not(:has(input[type="range"])) {
                display: none !important;
              }
              
              /* Hide ALL controls when hide-mux-controls class is present (for PiP mode) */
              .hide-mux-controls media-theme-notflix *,
              .hide-mux-controls mux-player * {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
              
              /* Explicitly show the video element itself when in PiP mode */
              .hide-mux-controls media-theme-notflix video,
              .hide-mux-controls mux-player video,
              .hide-mux-controls mux-video {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
              }
            }
          `
        }} />
    </div>
    </>
  );
}
