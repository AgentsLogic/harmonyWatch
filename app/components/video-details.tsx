"use client";

import { useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

interface VideoDetailsProps {
  video: {
    id: string;
    title: string;
    series: string;
    season: number;
    episode: number;
    rating: number | string; // Can be number (stars) or string (G, PG, etc.)
    description: string;
  };
  isOneOff?: boolean; // If true, hide series title and season/episode number
  isPremiumPreview?: boolean; // If true, show "Free Preview" badge
}

export default function VideoDetails({ video, isOneOff = false, isPremiumPreview = false }: VideoDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Debug orientation sensitivity controls (only on mobile native)
  const isMobileNative = typeof window !== 'undefined' && window.innerWidth < 640 && Capacitor.isNativePlatform();
  const [landscapeThreshold, setLandscapeThreshold] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('orientation_debug_landscape_threshold');
      return stored ? parseFloat(stored) : 50;
    }
    return 50;
  });
  const [portraitThreshold, setPortraitThreshold] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('orientation_debug_portrait_threshold');
      return stored ? parseFloat(stored) : 20;
    }
    return 20;
  });
  const [betaUprightThreshold, setBetaUprightThreshold] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('orientation_debug_beta_threshold');
      return stored ? parseFloat(stored) : 25;
    }
    return 25;
  });
  const [currentGamma, setCurrentGamma] = useState<number | null>(null);
  const [currentBeta, setCurrentBeta] = useState<number | null>(null);
  const [currentOrientation, setCurrentOrientation] = useState<'portrait' | 'landscape-left' | 'landscape-right'>('portrait');

  useEffect(() => {
    // Reset expanded state when description changes
    setIsExpanded(false);
  }, [video.description]);

  // Save thresholds to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orientation_debug_landscape_threshold', landscapeThreshold.toString());
    }
  }, [landscapeThreshold]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orientation_debug_portrait_threshold', portraitThreshold.toString());
    }
  }, [portraitThreshold]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orientation_debug_beta_threshold', betaUprightThreshold.toString());
    }
  }, [betaUprightThreshold]);

  // Listen to orientation events for debug display
  useEffect(() => {
    if (!isMobileNative || !showDebugPanel) return;

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma !== null) {
        setCurrentGamma(event.gamma);
      }
      if (event.beta !== null) {
        setCurrentBeta(event.beta);
      }
      
      // Determine current orientation based on thresholds
      const gamma = event.gamma || 0;
      const absGamma = Math.abs(gamma);
      const beta = event.beta !== null ? Math.abs(event.beta) : 0;
      const betaFromUpright = beta > 90 ? 180 - beta : beta;
      
      if (absGamma > landscapeThreshold) {
        if (gamma > 0) {
          setCurrentOrientation('landscape-right');
        } else {
          setCurrentOrientation('landscape-left');
        }
      } else if (absGamma < portraitThreshold && betaFromUpright < betaUprightThreshold) {
        setCurrentOrientation('portrait');
      }
    };

    // Use native Android sensor if available (more reliable than DeviceOrientationEvent in WebView)
    const useNativeSensor = typeof window !== 'undefined' && 
                            typeof (window as any).AndroidFullScreen !== 'undefined' &&
                            typeof (window as any).AndroidFullScreen.getOrientationData === 'function';
    
    if (useNativeSensor) {
      console.log('[VideoDetails] Using native Android sensor for orientation data');
      
      // Poll native sensor data for debug panel
      const pollNativeSensor = () => {
        try {
          const dataStr = (window as any).AndroidFullScreen.getOrientationData();
          const data = JSON.parse(dataStr);
          
          if (data.gamma !== null) {
            setCurrentGamma(data.gamma);
          }
          if (data.beta !== null) {
            setCurrentBeta(data.beta);
          }
          
          // Determine current orientation based on thresholds
          const gamma = data.gamma || 0;
          const absGamma = Math.abs(gamma);
          const beta = data.beta !== null ? Math.abs(data.beta) : 0;
          const betaFromUpright = beta > 90 ? 180 - beta : beta;
          
          if (absGamma > landscapeThreshold) {
            if (gamma > 0) {
              setCurrentOrientation('landscape-right');
            } else {
              setCurrentOrientation('landscape-left');
            }
          } else if (absGamma < portraitThreshold && betaFromUpright < betaUprightThreshold) {
            setCurrentOrientation('portrait');
          }
        } catch (error) {
          console.error('[VideoDetails] Error reading native sensor data:', error);
        }
      };
      
      // Poll at 30fps (33ms interval) for debug panel (less frequent than main player)
      const pollInterval = setInterval(pollNativeSensor, 33);
      pollNativeSensor(); // Poll immediately
      
      return () => {
        clearInterval(pollInterval);
      };
    } else {
      // Fallback to DeviceOrientationEvent for iOS or web
      const setupOrientationListener = () => {
        if (!window.DeviceOrientationEvent) {
          console.warn('[VideoDetails] DeviceOrientationEvent not supported');
          return;
        }

        // Request permission for DeviceOrientationEvent (required on iOS 13+ and some Android versions)
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
          (DeviceOrientationEvent as any).requestPermission()
            .then((response: string) => {
              if (response === 'granted') {
                console.log('[VideoDetails] DeviceOrientationEvent permission granted');
                window.addEventListener('deviceorientation', handleDeviceOrientation);
              } else {
                console.warn('[VideoDetails] DeviceOrientationEvent permission denied:', response);
              }
            })
            .catch((error: Error) => {
              console.error('[VideoDetails] Error requesting DeviceOrientationEvent permission:', error);
              // Fallback: try to add listener anyway
              window.addEventListener('deviceorientation', handleDeviceOrientation);
            });
        } else {
          // Permission API not available, try to add listener directly
          console.log('[VideoDetails] DeviceOrientationEvent permission API not available, adding listener directly');
      window.addEventListener('deviceorientation', handleDeviceOrientation);
        }
      };

      setupOrientationListener();
    }

    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
      }
    };
  }, [isMobileNative, showDebugPanel, landscapeThreshold, portraitThreshold, betaUprightThreshold]);

  const copySettings = () => {
    const settings = `LANDSCAPE_THRESHOLD = ${landscapeThreshold}
PORTRAIT_THRESHOLD = ${portraitThreshold}
BETA_UPRIGHT_THRESHOLD = ${betaUprightThreshold}`;
    navigator.clipboard.writeText(settings);
    alert('Settings copied to clipboard!');
  };

  useEffect(() => {
    // Check if description overflows 3 lines (only check when collapsed)
    const checkOverflow = () => {
      if (descriptionRef.current && !isExpanded) {
        const element = descriptionRef.current;
        
        // Create a temporary clone to measure without affecting the actual element
        const clone = element.cloneNode(true) as HTMLElement;
        clone.style.visibility = 'hidden';
        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        const computedWidth = window.getComputedStyle(element).width;
        clone.style.width = element.offsetWidth > 0 ? element.offsetWidth + 'px' : computedWidth;
        clone.classList.remove('line-clamp-3', 'cursor-pointer');
        document.body.appendChild(clone);
        
        const fullHeight = clone.scrollHeight;
        
        // Apply line-clamp-3 to clone and measure clamped height
        clone.classList.add('line-clamp-3');
        const clampedHeight = clone.offsetHeight;
        
        // Clean up
        clone.remove();
        
        setHasOverflow(fullHeight > clampedHeight + 1); // Add 1px tolerance for rounding
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      setTimeout(checkOverflow, 50);
    });
    
    // Also check on window resize (only if not expanded)
    const handleResize = () => {
      if (!isExpanded) {
        checkOverflow();
      }
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [video.description, isExpanded]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        className={`w-4 h-4 ${i < rating ? 'text-white' : 'text-gray-500'}`}
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ));
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Format rating for display
  const formatRating = (rating: number | string): string => {
    if (typeof rating === 'string') {
      return `Rated ${rating}`;
    }
    // Legacy: if it's a number, return empty (or could show stars)
    return '';
  };

  const ratingText = typeof video.rating === 'string' ? formatRating(video.rating) : '';

  return (
    <div className="mb-8">
      {/* Title - Large, bold on mobile */}
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-2">
        {video.title}
      </h1>
      
      {/* Badges Row - Horizontal on mobile, pill-shaped with dark grey background */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Series/Episode Badge - Hide for one-off series */}
        {!isOneOff && (
          <span className="inline-block bg-[#1a1a1a] text-white px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap">
            {video.series} | S{video.season} E{video.episode}
          </span>
        )}
        
        {/* Rating Badge */}
        {ratingText && (
          <span className="inline-block bg-[#1a1a1a] text-white px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap">
            {ratingText}
          </span>
        )}
        
        {/* Free Preview Badge - Red background */}
        {isPremiumPreview && (
          <span className="inline-block bg-red-600 text-white px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap">
            Free Preview
          </span>
        )}
      </div>
      
      {/* Orientation Debug Panel - Only on mobile native */}
      {isMobileNative && (
        <div className="mb-6 max-w-4xl">
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="text-sm text-gray-400 hover:text-white mb-2 flex items-center gap-2"
          >
            <span>{showDebugPanel ? '▼' : '▶'}</span>
            <span>Orientation Sensitivity Debug</span>
          </button>
          
          {showDebugPanel && (
            <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Orientation Sensitivity Controls</h3>
                <button
                  onClick={copySettings}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                >
                  Copy Settings
                </button>
              </div>

              {/* Current Values Display */}
              <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-gray-700">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Gamma (LR Tilt)</div>
                  <div className="text-white font-mono text-sm">
                    {currentGamma !== null ? currentGamma.toFixed(1) : '--'}°
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Beta (FB Tilt)</div>
                  <div className="text-white font-mono text-sm">
                    {currentBeta !== null ? currentBeta.toFixed(1) : '--'}°
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Orientation</div>
                  <div className="text-white font-mono text-sm capitalize">
                    {currentOrientation.replace('-', ' ')}
                  </div>
                </div>
              </div>

              {/* Landscape Threshold Slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white text-sm">Landscape Threshold</label>
                  <span className="text-gray-300 font-mono text-sm">{landscapeThreshold}°</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="70"
                  step="1"
                  value={landscapeThreshold}
                  onChange={(e) => setLandscapeThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Tilt required to enter landscape mode
                </div>
              </div>

              {/* Portrait Threshold Slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white text-sm">Portrait Threshold</label>
                  <span className="text-gray-300 font-mono text-sm">{portraitThreshold}°</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="40"
                  step="1"
                  value={portraitThreshold}
                  onChange={(e) => setPortraitThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Max tilt to exit to portrait (left-right)
                </div>
              </div>

              {/* Beta Upright Threshold Slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white text-sm">Beta Upright Threshold</label>
                  <span className="text-gray-300 font-mono text-sm">{betaUprightThreshold}°</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="45"
                  step="1"
                  value={betaUprightThreshold}
                  onChange={(e) => setBetaUprightThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Max tilt to exit to portrait (front-back)
                </div>
              </div>

              {/* Settings Display */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-2">Current Settings (for code):</div>
                <div className="bg-black/50 p-3 rounded font-mono text-xs text-gray-300">
                  <div>LANDSCAPE_THRESHOLD = {landscapeThreshold}</div>
                  <div>PORTRAIT_THRESHOLD = {portraitThreshold}</div>
                  <div>BETA_UPRIGHT_THRESHOLD = {betaUprightThreshold}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Description - Below badges */}
      <div className="max-w-4xl">
        <p 
          ref={descriptionRef}
          className={`text-white leading-relaxed ${hasOverflow ? 'cursor-pointer' : ''} ${!isExpanded && hasOverflow ? 'line-clamp-3' : ''}`}
          onClick={hasOverflow ? toggleExpand : undefined}
        >
          {video.description}
        </p>
      </div>
    </div>
  );
}

