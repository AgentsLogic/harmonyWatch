"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useUser } from "@/app/contexts/user-context";
import { useModal } from "@/app/contexts/modal-context";
import { useLoading } from "@/app/contexts/loading-context";
import { motion } from "framer-motion";
import { seriesService } from "@/lib/database";
import type { MediaItem } from "@/app/lib/data";
import { Capacitor } from "@capacitor/core";
import { shouldShowAppleSignIn } from "@/lib/utils/apple-signin-check";
import { nativeAppleSignIn } from "@/lib/utils/native-apple-signin";
import { HarmonySpinner } from "@/app/components/harmony-spinner";
import { useLandingSeries, useLandingModules, useLandingFAQs, type LandingPageSeries, type LandingPageModule, type LandingPageFAQ } from "@/lib/hooks/useLandingPage";
import MobileLandingSlideshow from "@/app/components/mobile-landing-slideshow";
import "./landing.css";

// Mobile Landing Page Gradient Configuration
// Adjust these values to change the top and bottom gradient overlays independently

// Shared gradient settings
const GRADIENT_COLOR = { r: 10, g: 10, b: 10 }; // RGB color for the gradient (dark grey)

// Top Gradient Configuration
const TOP_GRADIENT_OPACITY_START = .5;  // Opacity at the top edge (0 = transparent, 1 = opaque)
const TOP_GRADIENT_OPACITY_MID = 0.0;    // Opacity at middle stop
const TOP_GRADIENT_OPACITY_FADE = 0.0;   // Opacity before fading to transparent
const TOP_GRADIENT_STOP_1 = 20;           // First gradient stop percentage (0-100)
const TOP_GRADIENT_STOP_2 = 35;           // Second gradient stop percentage (0-100)
const TOP_GRADIENT_TRANSPARENT_AT = 60;   // Percentage where gradient becomes fully transparent (0-100)
const TOP_GRADIENT_BLUR = '3px';          // Blur amount for backdrop-filter (e.g., '8px', '12px', '0px' for no blur)

// Bottom Gradient Configuration
const BOTTOM_GRADIENT_OPACITY_START = .9;  // Opacity at the bottom edge (0 = transparent, 1 = opaque)
const BOTTOM_GRADIENT_OPACITY_MID = 0.6;    // Opacity at middle stop
const BOTTOM_GRADIENT_OPACITY_FADE = 0.2;   // Opacity before fading to transparent
const BOTTOM_GRADIENT_STOP_1 = 20;           // First gradient stop percentage (0-100)
const BOTTOM_GRADIENT_STOP_2 = 35;           // Second gradient stop percentage (0-100)
const BOTTOM_GRADIENT_TRANSPARENT_AT = 60;   // Percentage where gradient becomes fully transparent (0-100)
const BOTTOM_GRADIENT_BLUR = '8px';          // Blur amount for backdrop-filter (e.g., '8px', '12px', '0px' for no blur)

// Map URL paths to content keys
const pathToContentKey: Record<string, string> = {
  '/landing/about-us': 'about_us',
  '/landing/request-data-deletion': 'refund_policy',
  '/landing/terms-of-service': 'terms_of_service',
  '/landing/privacy': 'privacy_policy',
  '/landing/contact-us': 'contact_us',
};

const features = [
  {
    icon: (
      <Image
        src="/images/home.svg"
        alt="Home"
        width={116}
        height={118}
        className="h-12 w-auto object-contain"
        unoptimized
      />
    ),
    title: "Family Friendly",
    description: "Content free from profanity & vulgar imagery"
  },
  {
    icon: (
      <Image
        src="/images/256px-Cross_of_the_Russian_Orthodox_Church_01.svg.svg"
        alt="Orthodox Cross"
        width={256}
        height={455}
        className="h-12 w-auto object-contain"
        unoptimized
      />
    ),
    title: "Patristic Sources",
    description: "Striving to retell the Truth of Orthodoxy, while keeping the fullness of the Faith intact."
  },
  {
    icon: (
      <Image
        src="/images/phone.svg"
        alt="Phone"
        width={127}
        height={111}
        className="h-12 w-auto object-contain"
        unoptimized
      />
    ),
    title: "All Devices",
    description: "Available on desktop, iOS & Android"
  }
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showAppleSignIn, setShowAppleSignIn] = useState(false);
  const [isAppleSignInLoading, setIsAppleSignInLoading] = useState(false);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [mobileContentFadeIn, setMobileContentFadeIn] = useState(0); // Start from black (opacity 0)
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, hasPlan, refreshUser } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalInitialEmail, setIsLoginModalOpen, isSignupModalOpen, isLoginModalOpen, setSelectedItem, setIsModalOpen, setSourcePosition, setIsFooterContentModalOpen, setFooterContentKey, isFooterContentModalOpen, setLoginModalInitialStep } = useModal();
  const { isLoading: isGlobalLoading } = useLoading();

  // Fetch landing page data using React Query
  const { data: featuredSeries = [], isLoading: loadingSeries } = useLandingSeries();
  const { data: modules = [], isLoading: loadingModules } = useLandingModules();
  const { data: faqs = [], isLoading: loadingFaqs } = useLandingFAQs();

  useEffect(() => {
    setIsVisible(true);
    setMounted(true);
  }, []);

  // Start fade-in animation for mobile content
  useEffect(() => {
    if (isMobile && mounted) {
      // Small delay to ensure slideshow has started loading
      setTimeout(() => {
        setMobileContentFadeIn(1);
      }, 300);
    }
  }, [isMobile, mounted]);

  // Handle direct navigation to footer link URLs (e.g., refresh on /landing/about-us)
  // Only open modal if we're directly navigating TO a footer link URL from /landing (not when closing)
  const prevPathnameRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (pathname && pathname !== '/landing') {
      const contentKey = pathToContentKey[pathname];
      if (contentKey && !isFooterContentModalOpen) {
        const prevPathname = prevPathnameRef.current;
        // Only open if we're navigating TO a footer link URL from /landing (or initial load)
        // This prevents re-opening when URL cleanup happens (from footer link back to /landing)
        const isNavigatingToFooterLink = prevPathname === '/landing' || prevPathname === null;
        
        if (isNavigatingToFooterLink) {
          // Open modal if URL matches a footer link and modal isn't already open
          setFooterContentKey(contentKey);
          setIsFooterContentModalOpen(true);
        }
      }
    }
    
    // Update ref after checking
    prevPathnameRef.current = pathname;
  }, [pathname, isFooterContentModalOpen, setFooterContentKey, setIsFooterContentModalOpen]);

  // Check for password recovery hash fragments and open login modal with reset form
  // This handles cases where Supabase redirects to /landing# with recovery tokens
  useEffect(() => {
    if (typeof window !== 'undefined' && pathname === '/landing') {
      const hash = window.location.hash;
      // Check if hash contains password recovery tokens (access_token, type=recovery, etc.)
      if (hash && (hash.includes('access_token') || hash.includes('type=recovery') || hash.includes('password-reset'))) {
        // Open login modal - it will detect PASSWORD_RECOVERY event and show reset form
        setIsLoginModalOpen(true);
        setLoginModalInitialStep('reset-password');
        // Clean up the hash from URL
        window.history.replaceState(null, '', '/landing');
      }
    }
  }, [pathname, setIsLoginModalOpen, setLoginModalInitialStep]);

  // Handle video loading and autoplay on Vercel
  useEffect(() => {
    if (videoRef.current && !videoError && mounted) {
      const video = videoRef.current;
      
      // Explicitly load the video
      video.load();
      
      // Try to play the video programmatically after a short delay
      const playVideo = () => {
        const playPromise = video.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Video autoplay started successfully');
            })
            .catch((error) => {
              console.warn('Video autoplay was prevented:', error);
              // Try to play again after user interaction
              const handleUserInteraction = () => {
                video.play().catch(console.error);
                document.removeEventListener('click', handleUserInteraction);
                document.removeEventListener('touchstart', handleUserInteraction);
              };
              document.addEventListener('click', handleUserInteraction, { once: true });
              document.addEventListener('touchstart', handleUserInteraction, { once: true });
            });
        }
      };

      // Handle video errors
      const handleError = (e: Event) => {
        console.error('Video failed to load or play:', e);
        const target = e.target as HTMLVideoElement;
        if (target.error) {
          console.error('Video error code:', target.error.code);
          console.error('Video error message:', target.error.message);
        }
        setVideoError(true);
      };

      const handleLoadStart = () => {
        console.log('Video load started');
      };

      const handleCanPlay = () => {
        console.log('Video can play');
        // Try to play when video is ready
        playVideo();
      };

      const handleLoadedData = () => {
        console.log('Video data loaded');
      };

      const handleLoadedMetadata = () => {
        console.log('Video metadata loaded');
      };

      video.addEventListener('error', handleError);
      video.addEventListener('loadstart', handleLoadStart);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);

      // Also try to play after metadata is loaded
      if (video.readyState >= 2) {
        playVideo();
      }

      return () => {
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [videoError, mounted]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if Apple Sign In should be shown
  useEffect(() => {
    setShowAppleSignIn(shouldShowAppleSignIn());
  }, []);

  // Auto-redirect free or subscribed users to home page
  // They never need to see the landing page
  // Admins can view the landing page if they want
  // IMPORTANT: Never redirect pending users - they should stay on landing page
  // NOTE: Login modal now handles its own redirect immediately, so this is mainly for
  // users who navigate directly to /landing or refresh the page while logged in
  const hasRedirectedRef = useRef(false);
  
  useEffect(() => {
    // Prevent multiple redirects
    if (hasRedirectedRef.current) {
      return;
    }
    
    if (!isLoading) {
      const isPending = user?.signup_status === 'pending';
      
      // CRITICAL: Never redirect if user is pending - they must stay on landing page
      if (isPending) {
        return;
      }
      
      // Don't redirect if modals are open (user is actively in signup/login flow)
      if (isSignupModalOpen || isLoginModalOpen) {
        return;
      }
      
      // Only redirect if user has a valid plan (hasPlan already checks for free, admin, or active subscription)
      // Don't check user_type directly - a subscriber without an active subscription should stay on landing
      // hasPlan is the source of truth - it checks subscription.is_active for subscribers
      if (!hasPlan) {
        // User doesn't have a valid plan - stay on landing page
        return;
      }
      
      // User has a valid plan and is not an admin - redirect to homepage
      // Admins can view landing page if they want
      if (user?.user_type !== 'admin') {
        // Mark as redirected to prevent loops
        hasRedirectedRef.current = true;
        
        // Use router.replace for immediate navigation without showing landing page
        // This is smoother than router.push which can briefly show the landing page
        const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
        if (isCapacitor) {
          // On mobile/Capacitor, use window.location for reliability
          window.location.href = "/";
        } else {
          // On web, use replace to avoid adding to history and showing landing page
          router.replace("/");
        }
      }
    }
  }, [isLoading, hasPlan, user, router, isSignupModalOpen, isLoginModalOpen]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Open signup modal with email pre-filled
    setSignupModalInitialEmail(email);
    setSignupModalInitialStep('email');
    setIsSignupModalOpen(true);
  };

  const handleFinishSignup = () => {
    // Open signup modal at plans step
    // Auto-fill email if user is pending (they already registered)
    if (user?.email) {
      setSignupModalInitialEmail(user.email);
    }
    setSignupModalInitialStep('plans');
    setIsSignupModalOpen(true);
  };

  const handleRestartSignup = async () => {
    try {
      const response = await fetch('/api/auth/abort-signup', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        // Refresh the page to clear user state and show fresh signup form
        window.location.reload();
      } else {
        console.error('Failed to restart signup');
      }
    } catch (error) {
      console.error('Error restarting signup:', error);
    }
  };

  const handleAppleSignUp = async () => {
    try {
      // On native iOS, use native Apple Sign In (modal popup)
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        setIsAppleSignInLoading(true);
        try {
        // Pass true for isSignupFlow since we're going to payment page
          console.log('[Landing] Starting native Apple Sign In...');
        const result = await nativeAppleSignIn(true);
          console.log('[Landing] Native Apple Sign In result:', result);
        
        if (result.success) {
          // Refresh user data
          await refreshUser();
            // Reset loading state before navigation
            setIsAppleSignInLoading(false);
            // Redirect to plan selection page
            router.push('/signup/plans');
            return;
        } else {
            console.error('[Landing] Apple Sign In failed:', result.error);
            setIsAppleSignInLoading(false);
            
            // Show error to user instead of silently falling back to Safari
            // This helps debug the native plugin issue
            alert(`Apple Sign In Error: ${result.error}\n\nPlease check the debug console (Ctrl+Shift+D) for more details.`);
            // If cancelled, just reset loading state and don't redirect
            return;
          }
        } catch (nativeError: any) {
          console.error('[Landing] Error in native Apple Sign In:', nativeError);
          setIsAppleSignInLoading(false);
          // Show error instead of falling back
          alert(`Apple Sign In Exception: ${nativeError.message}\n\nPlease check the debug console (Ctrl+Shift+D) for more details.`);
          return;
        }
      } else {
        // On web, use standard OAuth redirect
        window.location.href = '/api/auth/apple?next=/signup/payment';
      }
    } catch (error) {
      console.error('Error initiating Apple Sign In:', error);
      setIsAppleSignInLoading(false);
      // Fallback to web OAuth
      window.location.href = '/api/auth/apple?next=/signup/payment';
    }
  };

  const handleContactUs = () => {
    // Map content key to URL path
    const urlPath = '/landing/contact-us';
    
    // Update URL silently (no page reload)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', urlPath);
    }
    
    setFooterContentKey('contact_us');
    setIsFooterContentModalOpen(true);
  };

  const handleFooterLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, contentKey: string) => {
    e.preventDefault();
    
    // Map content keys to URL paths
    const contentKeyToPath: Record<string, string> = {
      'about_us': '/landing/about-us',
      'refund_policy': '/landing/request-data-deletion',
      'terms_of_service': '/landing/terms-of-service',
      'privacy_policy': '/landing/privacy',
      'contact_us': '/landing/contact-us',
    };
    
    const urlPath = contentKeyToPath[contentKey];
    
    if (urlPath) {
      // Update URL silently (no page reload)
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', urlPath);
      }
    }
    
    setFooterContentKey(contentKey);
    setIsFooterContentModalOpen(true);
  };

  // Check if user has a pending account (signup_status === 'pending')
  // Show "Finish signup" button instead of email form
  const needsToFinishSignup = user && user.signup_status === 'pending';

  // Handle series thumbnail click - open content modal for the series
  const handleSeriesClick = async (series: LandingPageSeries['series'], event?: React.MouseEvent) => {
    // Capture the element reference BEFORE async operations (event.currentTarget may be null after await)
    let targetElement: HTMLElement | null = null;
    if (event && event.currentTarget) {
      targetElement = event.currentTarget as HTMLElement;
    }

    try {
      // Fetch the full series data to get all fields (banner_url, logo_url, rating, tags, etc.)
      const fullSeriesData = await seriesService.getById(series.id);
      
      if (!fullSeriesData) {
        console.error('Series not found:', series.id);
        return;
      }

      // Create a MediaItem from the full series data with all fields
      const mediaItem: MediaItem = {
        id: fullSeriesData.id,
        title: fullSeriesData.title,
        subtitle: fullSeriesData.description || undefined,
        imageUrl: fullSeriesData.thumbnail_url || series.thumbnail_url || '',
        backgroundUrl: fullSeriesData.banner_url || undefined,
        logoUrl: fullSeriesData.logo_url || undefined,
        rating: fullSeriesData.rating || undefined,
        tags: fullSeriesData.tags || undefined,
        content_type: fullSeriesData.content_type || series.content_type,
        isDailyContent: Boolean(fullSeriesData.is_daily_content) || undefined,
        isPremium: Boolean(fullSeriesData.is_premium) || undefined,
        slug: fullSeriesData.slug || undefined,
      };

      // Set source position for animation if we captured a valid element
      if (targetElement && setSourcePosition) {
        try {
          const rect = targetElement.getBoundingClientRect();
          setSourcePosition({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          });
        } catch (err) {
          // Element might have been removed from DOM, silently fail
          console.warn('Could not get element position for animation:', err);
        }
      }

      // Set the selected item and open the modal
      setSelectedItem(mediaItem);
      setIsModalOpen(true);
      
      // Push slug URL if available
      if (fullSeriesData.slug && typeof window !== 'undefined') {
        window.history.pushState({}, '', `/${fullSeriesData.slug}`);
      }
    } catch (error) {
      console.error('Error loading series data:', error);
      // Fallback to basic series data if fetch fails
      const mediaItem: MediaItem = {
        id: series.id,
        title: series.title,
        subtitle: series.description || undefined,
        imageUrl: series.thumbnail_url || '',
        content_type: series.content_type,
      };
      setSelectedItem(mediaItem);
      setIsModalOpen(true);
    }
  };

  // Don't render landing page content if global loading overlay is active
  // This prevents flash of landing page during login redirect
  if (isGlobalLoading) {
    return null;
  }

  return (
    <div className="min-h-screen text-white bg-pattern" style={{ backgroundColor: '#151515' }}>
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 p-6 hidden sm:block">
        <div className="max-w-7xl mx-auto flex items-center justify-end">
          {/* Navigation removed - no sign in/up buttons */}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-screen sm:h-[80vh] flex items-center justify-center px-6">
        {/* Mobile Background Slideshow */}
        <div className="absolute inset-0 sm:hidden z-0">
          <MobileLandingSlideshow />
        </div>
        
        {/* Dark Grey Gradient Overlay - Mobile Only (Bottom to Middle) */}
        <div 
          className="absolute inset-0 sm:hidden z-[1]"
          style={{
            background: `linear-gradient(to top, rgba(${GRADIENT_COLOR.r}, ${GRADIENT_COLOR.g}, ${GRADIENT_COLOR.b}, ${BOTTOM_GRADIENT_OPACITY_START}) 0%, rgba(${GRADIENT_COLOR.r}, ${GRADIENT_COLOR.g}, ${GRADIENT_COLOR.b}, ${BOTTOM_GRADIENT_OPACITY_MID}) ${BOTTOM_GRADIENT_STOP_1}%, rgba(${GRADIENT_COLOR.r}, ${GRADIENT_COLOR.g}, ${GRADIENT_COLOR.b}, ${BOTTOM_GRADIENT_OPACITY_FADE}) ${BOTTOM_GRADIENT_STOP_2}%, transparent ${BOTTOM_GRADIENT_TRANSPARENT_AT}%)`,
            backdropFilter: `blur(${BOTTOM_GRADIENT_BLUR})`,
            WebkitBackdropFilter: `blur(${BOTTOM_GRADIENT_BLUR})`,
            maskImage: `linear-gradient(to top, black 0%, black ${BOTTOM_GRADIENT_STOP_1}%, rgba(0, 0, 0, ${BOTTOM_GRADIENT_OPACITY_FADE / BOTTOM_GRADIENT_OPACITY_START}) ${BOTTOM_GRADIENT_STOP_2}%, transparent ${BOTTOM_GRADIENT_TRANSPARENT_AT}%)`,
            WebkitMaskImage: `linear-gradient(to top, black 0%, black ${BOTTOM_GRADIENT_STOP_1}%, rgba(0, 0, 0, ${BOTTOM_GRADIENT_OPACITY_FADE / BOTTOM_GRADIENT_OPACITY_START}) ${BOTTOM_GRADIENT_STOP_2}%, transparent ${BOTTOM_GRADIENT_TRANSPARENT_AT}%)`,
          }}
        >
        </div>
        
        {/* Dark Gradient Overlay - Mobile Only (Top to Middle) */}
        <div 
          className="absolute inset-0 sm:hidden z-[1]"
          style={{
            background: `linear-gradient(to bottom, rgba(${GRADIENT_COLOR.r}, ${GRADIENT_COLOR.g}, ${GRADIENT_COLOR.b}, ${TOP_GRADIENT_OPACITY_START}) 0%, rgba(${GRADIENT_COLOR.r}, ${GRADIENT_COLOR.g}, ${GRADIENT_COLOR.b}, ${TOP_GRADIENT_OPACITY_MID}) ${TOP_GRADIENT_STOP_1}%, rgba(${GRADIENT_COLOR.r}, ${GRADIENT_COLOR.g}, ${GRADIENT_COLOR.b}, ${TOP_GRADIENT_OPACITY_FADE}) ${TOP_GRADIENT_STOP_2}%, transparent ${TOP_GRADIENT_TRANSPARENT_AT}%)`,
            backdropFilter: `blur(${TOP_GRADIENT_BLUR})`,
            WebkitBackdropFilter: `blur(${TOP_GRADIENT_BLUR})`,
            maskImage: `linear-gradient(to bottom, black 0%, black ${TOP_GRADIENT_STOP_1}%, rgba(0, 0, 0, ${TOP_GRADIENT_OPACITY_FADE / TOP_GRADIENT_OPACITY_START}) ${TOP_GRADIENT_STOP_2}%, transparent ${TOP_GRADIENT_TRANSPARENT_AT}%)`,
            WebkitMaskImage: `linear-gradient(to bottom, black 0%, black ${TOP_GRADIENT_STOP_1}%, rgba(0, 0, 0, ${TOP_GRADIENT_OPACITY_FADE / TOP_GRADIENT_OPACITY_START}) ${TOP_GRADIENT_STOP_2}%, transparent ${TOP_GRADIENT_TRANSPARENT_AT}%)`,
          }}
        >
        </div>
        
        {/* Video Background (Desktop only) */}
        <div className="absolute inset-0 hidden sm:block z-0" style={{ height: '833px' }}>
          {!videoError ? (
            <video
              ref={videoRef}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center center', height: '830px' }}
              onError={(e) => {
                console.error('Video failed to load:', e);
                const target = e.target as HTMLVideoElement;
                console.error('Video error details:', target.error);
                setVideoError(true);
              }}
            >
              <source src="/images/homepage-video.webm" type="video/webm" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="relative w-full h-full">
              <Image
                src="/images/landing-pg1.jpg"
                alt="Landing background"
                fill
                sizes="100vw"
                className="object-cover"
                priority
                unoptimized
              />
            </div>
          )}
          {/* Dark overlay for text readability - reduced opacity */}
          <div 
            className="absolute inset-0" 
            style={{
              background: 'linear-gradient(to bottom, rgba(21, 21, 21, 0.8), rgba(21, 21, 21, 0.8), rgba(21, 21, 21, 1))'
            }}
          />
        </div>

        {/* Hero Content */}
        <div className={`absolute z-10 text-center max-w-4xl mx-auto fade-in ${isVisible ? 'visible' : ''}`} style={{ top: '35vh', left: '50%', transform: 'translateX(-50%)', paddingTop: '35px' }}>
          <h1 className="hero-title font-bold mb-2.5 leading-tight hidden sm:block" style={{ fontSize: '60px', fontFamily: 'legitima', color: 'white' }}>
          Stories & Shows Rooted in
            <br />
            Orthodox Christianity
          </h1>
          
          <p className="hero-subtitle text-xl md:text-2xl mb-[18px] text-white hidden sm:block" style={{ fontFamily: 'legitima', fontWeight: 500, fontSize: '25px' }}>
            $7 per month | New content added weekly
          </p>

          {/* Email Signup Form or Finish Signup Button - Desktop only */}
          {!isLoading && needsToFinishSignup ? (
            <div className="max-w-md mx-auto space-y-3 hidden sm:block">
              <button
                onClick={handleFinishSignup}
                className="btn-primary bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 whitespace-nowrap w-full sm:w-auto cursor-pointer"
              >
                Finish signup &gt;
              </button>
              <button
                onClick={handleRestartSignup}
                className="w-full sm:w-auto bg-gray-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-700 cursor-pointer text-sm"
              >
                Restart signup
              </button>
            </div>
          ) : !isMobile ? (
            // Desktop: Show email form
            <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email@email.com"
                className="form-input flex-1 px-4 py-3 rounded-[31px] bg-white text-black placeholder-gray-500 focus:outline-none"
                required
              />
              <button
                type="submit"
                className="btn-primary bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 whitespace-nowrap cursor-pointer"
              >
                Enter &gt;
              </button>
            </form>
          ) : null}
        </div>
      </section>

      {/* Featured Content Row */}
      <section className="py-[44px] px-6 hidden sm:block" style={{ backgroundColor: '#151515' }}>
        <div className="max-w-7xl mx-auto">
          {loadingSeries ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {featuredSeries.map((item, index) => (
                <motion.div
                  key={item.id}
                  className="content-card group cursor-pointer"
                  onClick={(e) => handleSeriesClick(item.series, e)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 2,
                    delay: index * 0.2,
                    ease: "easeOut"
                  }}
                >
                  <div className="aspect-video bg-gray-800 rounded-lg mb-4 overflow-hidden relative">
                    {item.series.thumbnail_url ? (
                      <Image
                        src={item.series.thumbnail_url}
                        alt={item.series.title}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full image-placeholder bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                        <span className="text-gray-400 text-sm">Thumbnail</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Mission Statement Section */}
      <section className="pt-[37px] pb-[64px] px-6 hidden sm:block" style={{ backgroundColor: '#151515' }}>
        <div className="max-w-4xl mx-auto text-center">
          {/* Orthodox Cross */}
          <div className="mb-0 flex justify-center pb-[7px]">
            <Image
              src="/images/256px-Cross_of_the_Russian_Orthodox_Church_01.svg.svg"
              alt="Symbol of Orthodoxy"
              width={35}
              height={70}
              className="text-white"
              unoptimized
            />
          </div>
          
          {/* Main Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-white mb-[5px] leading-tight" style={{ fontSize: '35px', fontFamily: 'legitima' }}>
            The Ancient Faith, Told Through Film
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-white font-serif leading-relaxed max-w-3xl mx-auto" style={{ fontFamily: 'legitima', fontSize: '25px', lineHeight: '32px', fontWeight: 500 }}>
            We exist to share the fullness of the Christian Faith<br/>through films grounded in the Orthodox Church
          </p>
        </div>
      </section>

      {/* Large Featured Content Modules Section */}
      {!loadingModules && modules.length > 0 && (
        <section className="py-[44px] px-6 hidden sm:block">
          <div className="max-w-7xl mx-auto space-y-8 pt-0">
            {modules.map((module, index) => {
              // Determine which values to use (override or series default)
              const logoUrl = module.logo_url_override || module.series.logo_url;
              const backgroundUrl = module.background_url_override || module.series.banner_url;
              const subtitle = module.hide_subtitle ? null : (module.subtitle_override || module.series.description);
              const buttonText = module.button_text_override || 'Start Watching >';
              const title = module.series.title;
              // Logo dimensions - use custom if provided, otherwise defaults
              const logoWidth = module.logo_width || 500;
              const logoHeight = module.logo_height || 150;

              return (
                <div
                  key={module.id}
                  className="relative bg-gradient-to-r from-gray-900 to-gray-800 rounded-[30px] overflow-hidden flex items-center"
                  style={{ minHeight: '400px' }}
                >
                  {/* Background Image */}
                  {backgroundUrl ? (
                    <div className="absolute inset-0">
                      <Image
                        src={backgroundUrl}
                        alt={title}
                        fill
                        sizes="100vw"
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute left-0 top-0 bottom-0 w-2/3 bg-gradient-to-r from-black/50 via-black/30 to-transparent" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600">
                      <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-gray-600 to-transparent"></div>
                    </div>
                  )}
                  
                  {/* Content Overlay */}
                  <div className="relative z-10 px-12 md:px-16 max-w-2xl w-full">
                    {logoUrl ? (
                      <div className="mb-6 flex justify-start">
                        <Image
                          src={logoUrl}
                          alt={title}
                          width={logoWidth}
                          height={logoHeight}
                          className="object-contain max-h-32 md:max-h-40 w-auto"
                          style={{ 
                            maxWidth: `${logoWidth}px`,
                            maxHeight: `${logoHeight}px`
                          }}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <motion.h2 
                        className="text-4xl md:text-5xl font-serif font-bold mb-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.1 }}
                      >
                        {title}
                      </motion.h2>
                    )}
                    {subtitle && (
                      <p className="text-xl text-gray-300 mb-8 leading-relaxed" style={{ maxWidth: '400px' }}>
                        {subtitle}
                      </p>
                    )}
                    <button
                      onClick={async (e) => {
                        // Fetch full series data and open modal
                        try {
                          const fullSeriesData = await seriesService.getById(module.series.id);
                          if (fullSeriesData) {
                            const mediaItem: MediaItem = {
                              id: fullSeriesData.id,
                              title: fullSeriesData.title,
                              subtitle: fullSeriesData.description || undefined,
                              imageUrl: fullSeriesData.thumbnail_url || '',
                              backgroundUrl: fullSeriesData.banner_url || undefined,
                              logoUrl: fullSeriesData.logo_url || undefined,
                              rating: fullSeriesData.rating || undefined,
                              tags: fullSeriesData.tags || undefined,
                              content_type: fullSeriesData.content_type,
                              isDailyContent: Boolean(fullSeriesData.is_daily_content) || undefined,
                              isPremium: Boolean(fullSeriesData.is_premium) || undefined,
                            };
                            
                            // Capture element position for animation
                            if (e.currentTarget && setSourcePosition) {
                              try {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setSourcePosition({
                                  x: rect.left,
                                  y: rect.top,
                                  width: rect.width,
                                  height: rect.height
                                });
                              } catch (err) {
                                console.warn('Could not get element position:', err);
                              }
                            }
                            
                            setSelectedItem(mediaItem);
                            setIsModalOpen(true);
                          }
                        } catch (error) {
                          console.error('Error loading series data:', error);
                        }
                      }}
                      className="btn-primary bg-white/10 backdrop-blur-md border border-white/30 text-white px-8 py-3 rounded-full font-semibold hover:bg-white/20 hover:border-white/40 shadow-lg cursor-pointer transition-all duration-200"
                    >
                      {buttonText}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-[44px] px-6 hidden sm:block" style={{ backgroundColor: '#151515' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="rounded-[30px] p-8 flex flex-col" style={{ backgroundColor: '#1b1b1b' }}>
                <div className="feature-icon w-20 h-20 ml-0 mr-[260px] mb-0 text-white flex items-center justify-center">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-0 font-serif text-white text-left" style={{ fontFamily: 'legitima', fontSize: '25px' }}>
                  {feature.title}
                </h3>
                <p className="text-white leading-relaxed text-left" style={{ fontFamily: 'legitima', fontSize: '18px', lineHeight: '23px', color: 'rgba(201, 201, 201, 1)', fontWeight: 500 }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      {!loadingFaqs && faqs.length > 0 && (
        <section className="py-[44px] px-6 hidden sm:block" style={{ backgroundColor: '#151515' }}>
          <div className="max-w-7xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-medium text-white mb-[31px] text-center" style={{ fontFamily: 'legitima', fontSize: '25px', letterSpacing: '1px' }}>
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {faqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="rounded-lg overflow-hidden"
                    style={{ backgroundColor: '#1b1b1b', marginBottom: '18px' }}
                  >
                    <button
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      className="w-full px-6 py-4 text-left flex items-center justify-between border-0 cursor-pointer"
                      style={{ backgroundColor: '#1b1b1b', border: 'none', outline: 'none' }}
                    >
                      <span className="text-white text-lg font-medium pr-4" style={{ fontSize: '30px', fontFamily: 'legitima', fontWeight: 400 }}>{faq.question}</span>
                      <span 
                        className="text-white text-2xl font-light flex-shrink-0 transition-transform duration-300 ease-in-out" 
                        style={{ transform: isExpanded ? 'rotate(45deg)' : 'rotate(0deg)' }}
                      >
                        +
                      </span>
                    </button>
                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{
                        maxHeight: isExpanded ? '1000px' : '0px',
                        opacity: isExpanded ? 1 : 0,
                      }}
                    >
                      <div className="px-6 py-4" style={{ backgroundColor: '#1b1b1b' }}>
                        <p className="text-white text-base leading-relaxed whitespace-pre-line" style={{ fontSize: '25px', width: '1083px', fontFamily: 'legitima', fontWeight: 500, lineHeight: '34px' }}>{faq.answer}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Devices Section - PC and Phone */}
      <section className="py-[80px] px-6 hidden sm:block" style={{ backgroundColor: '#151515' }}>
        <div className="max-w-7xl mx-auto">
          <div className="relative flex flex-col md:flex-row items-center min-h-[600px]">
            {/* Left Side - Text and Button */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center md:absolute md:left-0" style={{ minWidth: '300px', paddingRight: 0, marginLeft: 0, marginRight: 0, top: '152px', left: '185px' }}>
              <h2 className="text-white mb-1 leading-tight" style={{ fontFamily: 'legitima', fontSize: '60px', fontWeight: 700, marginBottom: '11px' }}>
                Join har·mo·ny
              </h2>
              {needsToFinishSignup ? (
                <button
                  onClick={handleFinishSignup}
                  className="bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                  style={{ fontSize: '18px', fontWeight: 600, width: '140px', borderRadius: '100px' }}
                >
                  Enter
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSignupModalInitialStep('email');
                    setIsSignupModalOpen(true);
                  }}
                  className="bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                  style={{ fontSize: '18px', fontWeight: 600, width: '140px', borderRadius: '100px' }}
                >
                  Enter
                </button>
              )}
            </div>

            {/* Right Side - Devices */}
            <div className="flex-1 flex items-center justify-center md:justify-end min-w-0 w-full md:relative md:z-0">
              <div className="relative w-full" style={{ width: '947px', paddingRight: '25px' }}>
                <Image
                  src="/images/PC and Phone.webp"
                  alt="Harmony on PC and Phone"
                  width={1200}
                  height={800}
                  className="w-full h-auto object-contain"
                  style={{ maxWidth: 'none', width: '100%', height: 'auto' }}
                  unoptimized
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer-glow py-12 px-6 hidden sm:block" style={{ backgroundColor: '#151515', paddingBottom: 0 }}>
        <div className="max-w-7xl mx-auto" style={{ marginBottom: '23px' }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 mx-auto" style={{ width: '841px', paddingLeft: '0px', paddingRight: '0px', marginRight: '176px' }}>
            {/* Logo Section */}
            <div className="flex items-start">
              <Image
                src="/images/harmony-white-logo.png"
                alt="Harmony"
                width={106}
                height={48}
                className="object-contain"
                unoptimized
              />
            </div>

            {/* Who we are */}
            <div>
              <h3 className="text-white font-semibold mb-4" style={{ fontFamily: 'janoSans', fontSize: '12px', fontWeight: 500 }}>Who we are</h3>
              <ul className="space-y-2">
                <li key="about-us" style={{ marginBottom: '21px' }}>
                  <a 
                    href="#" 
                    onClick={(e) => handleFooterLinkClick(e, 'about_us')}
                    className="text-white transition-colors cursor-pointer" 
                    style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}
                  >
                    About Us
                  </a>
                </li>
                <li key="terms-of-service" style={{ marginBottom: '21px' }}>
                  <a 
                    href="#" 
                    onClick={(e) => handleFooterLinkClick(e, 'terms_of_service')}
                    className="text-white transition-colors cursor-pointer" 
                    style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}
                  >
                    Terms of Service
                  </a>
                </li>
                <li key="privacy-policy" style={{ marginBottom: '21px' }}>
                  <a 
                    href="#" 
                    onClick={(e) => handleFooterLinkClick(e, 'privacy_policy')}
                    className="text-white transition-colors cursor-pointer" 
                    style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}
                  >
                    Privacy Policy
                  </a>
                </li>
                <li key="request-data-deletion" style={{ marginBottom: '21px' }}>
                  <a 
                    href="#" 
                    onClick={(e) => handleFooterLinkClick(e, 'refund_policy')}
                    className="text-white transition-colors cursor-pointer" 
                    style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}
                  >
                    Request Data Deletion
                  </a>
                </li>
              </ul>
            </div>

            {/* Join */}
            <div>
              <h3 className="text-white font-semibold mb-4" style={{ fontFamily: 'janoSans', fontSize: '12px', fontWeight: 400 }}>Join</h3>
              <ul className="space-y-2">
                <li style={{ marginBottom: '21px' }}>
                  <a href="/" className="text-white transition-colors" style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}>
                    Desktop
                  </a>
                </li>
                <li style={{ marginBottom: '21px' }}>
                  <a href="https://apps.apple.com/app/harmony" target="_blank" rel="noopener noreferrer" className="text-white transition-colors" style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}>
                    iPhone
                  </a>
                </li>
                <li style={{ marginBottom: '21px' }}>
                  <a href="https://play.google.com/store/apps/details?id=com.harmonywatch.app" target="_blank" rel="noopener noreferrer" className="text-white transition-colors" style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}>
                    Android
                  </a>
                </li>
              </ul>
            </div>

            {/* Need help? */}
            <div>
              <h3 className="text-white font-semibold mb-4" style={{ fontFamily: 'janoSans', fontSize: '12px', fontWeight: 400 }}>Need help?</h3>
              <ul className="space-y-2">
                <li style={{ marginBottom: '21px' }}>
                  <button
                    onClick={handleContactUs}
                    className="text-white transition-colors text-left cursor-pointer" style={{ fontFamily: 'janoSans', fontSize: '16px', fontWeight: 500 }}
                  >
                    Contact us
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Gradient Line Divider */}
          <div className="gradient-divider"></div>

          {/* App Download Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <a
              href="https://apps.apple.com/app/harmony"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block transition-opacity hover:opacity-80"
            >
              <Image
                src="/images/btn-appstore.webp"
                alt="Download on the App Store"
                width={200}
                height={60}
                className="h-auto"
                unoptimized
              />
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.harmonywatch.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block transition-opacity hover:opacity-80"
            >
              <Image
                src="/images/btn-playstore.webp"
                alt="Download on Google Play"
                width={200}
                height={60}
                className="h-auto"
                unoptimized
              />
            </a>
          </div>

          {/* Copyright */}
          <div className="text-center">
            <p className="text-white text-sm" style={{ fontFamily: 'openSans', fontSize: '17px' }}>
              &copy; 2026, Harmony Creations LLC
            </p>
          </div>
        </div>

        {/* Multilingual Text - Ticker - Full Width */}
        <a
          href="https://www.youtube.com/watch?v=r8MVLBfZCrE"
          target="_blank"
          rel="noopener noreferrer"
          className="ticker-container"
        >
          <div className="ticker-content">
            <span className="text-white text-sm" style={{ fontFamily: 'openSans', fontSize: '14px', lineHeight: '1.6' }}>
              Christ is risen! • Χριστὸς ἀνέστη! • Христос воскресе! • ハリストス復活! • 基督復活了! • ¡Cristo ha resucitado! • Христос воскресе! • Christus resurrexit! • Hristos a înviat! • Христос воскрес! • Христос възкресе! • Хрыстос уваскрос! • Chrystus zmartwychwstał! • Kristus vstal z mrtvých! • Kristus vstal z mŕtvych! • Krisztus feltámadt! • ქრისტე აღსდგა! • Քրիստոս հարություն առավ! • !المسيح قام • Ⲡⲓⲭⲣⲓⲥⲧⲟⲥ ⲁϥⲧⲱⲛϥ! • ܡܫܝܚܐ ܩܡ! • !המשיח קם • ክርስቶስ ተንሥኦ! • Le Christ est ressuscité! • Cristo è risorto! • Cristo ressuscitou! • Christus ist auferstanden! • Christus is opgestaan! • Kristus är uppstånden! • Kristus er oppstanden! • Kristus er opstanden! • Kristus nousi kuolleista! • Kristur er upprisinn! • Kristus on üles tõusnud! • Kristus augšāmcēlies! • Kristus prisikėlė! • Krishti u ngjall! • Mesih dirildi! • 그리스도 부활하셨네! • Chúa Kitô đã sống lại! • Si Kristo ay nabuhay! • Kristus telah bangkit! • Kristo amefufuka! • Atgyfododd Crist! • Tá Críost éirithe! • Tha Crìosd air èirigh! • Kristu qam! • Ua ala hou ʻo Kristo! • Kua ara a Te Karaiti! • Kristo leviĝis! • Kristo asɔre! • 
            </span>
            <span className="text-white text-sm" style={{ fontFamily: 'openSans', fontSize: '14px', lineHeight: '1.6' }}>
              Christ is risen! • Χριστὸς ἀνέστη! • Христос воскресе! • ハリストス復活! • 基督復活了! • ¡Cristo ha resucitado! • Христос воскресе! • Christus resurrexit! • Hristos a înviat! • Христос воскрес! • Христос възкресе! • Хрыстос уваскрос! • Chrystus zmartwychwstał! • Kristus vstal z mrtvých! • Kristus vstal z mŕtvych! • Krisztus feltámadt! • ქრისტე აღსდგა! • Քրիստոս հարություն առավ! • !المسيح قام • Ⲡⲓⲭⲣⲓⲥⲧⲟⲥ ⲁϥⲧⲱⲛϥ! • ܡܫܝܚܐ ܩܡ! • !המשיח קם • ክርስቶስ ተንሥኦ! • Le Christ est ressuscité! • Cristo è risorto! • Cristo ressuscitou! • Christus ist auferstanden! • Christus is opgestaan! • Kristus är uppstånden! • Kristus er oppstanden! • Kristus er opstanden! • Kristus nousi kuolleista! • Kristur er upprisinn! • Kristus on üles tõusnud! • Kristus augšāmcēlies! • Kristus prisikėlė! • Krishti u ngjall! • Mesih dirildi! • 그리스도 부활하셨네! • Chúa Kitô đã sống lại! • Si Kristo ay nabuhay! • Kristus telah bangkit! • Kristo amefufuka! • Atgyfododd Crist! • Tá Críost éirithe! • Tha Crìosd air èirigh! • Kristu qam! • Ua ala hou ʻo Kristo! • Kua ara a Te Karaiti! • Kristo leviĝis! • Kristo asɔre! • 
            </span>
            <span className="text-white text-sm" style={{ fontFamily: 'openSans', fontSize: '14px', lineHeight: '1.6' }}>
              Christ is risen! • Χριστὸς ἀνέστη! • Христос воскресе! • ハリストス復活! • 基督復活了! • ¡Cristo ha resucitado! • Христос воскресе! • Christus resurrexit! • Hristos a înviat! • Христос воскрес! • Христос възкресе! • Хрыстос уваскрос! • Chrystus zmartwychwstał! • Kristus vstal z mrtvých! • Kristus vstal z mŕtvych! • Krisztus feltámadt! • ქრისტე აღსდგა! • Քրիստոս հարություն առավ! • !المسيح قام • Ⲡⲓⲭⲣⲓⲥⲧⲟⲥ ⲁϥⲧⲱⲛϥ! • ܡܫܝܚܐ ܩܡ! • !המשיח קם • ክርስቶስ ተንሥኦ! • Le Christ est ressuscité! • Cristo è risorto! • Cristo ressuscitou! • Christus ist auferstanden! • Christus is opgestaan! • Kristus är uppstånden! • Kristus er oppstanden! • Kristus er opstanden! • Kristus nousi kuolleista! • Kristur er upprisinn! • Kristus on üles tõusnud! • Kristus augšāmcēlies! • Kristus prisikėlė! • Krishti u ngjall! • Mesih dirildi! • 그리스도 부활하셨네! • Chúa Kitô đã sống lại! • Si Kristo ay nabuhay! • Kristus telah bangkit! • Kristo amefufuka! • Atgyfododd Crist! • Tá Críost éirithe! • Tha Crìosd air èirigh! • Kristu qam! • Ua ala hou ʻo Kristo! • Kua ara a Te Karaiti! • Kristo leviĝis! • Kristo asɔre! • 
            </span>
            <span className="text-white text-sm" style={{ fontFamily: 'openSans', fontSize: '14px', lineHeight: '1.6' }}>
              Christ is risen! • Χριστὸς ἀνέστη! • Христос воскресе! • ハリストス復活! • 基督復活了! • ¡Cristo ha resucitado! • Христос воскресе! • Christus resurrexit! • Hristos a înviat! • Христос воскрес! • Христос възкресе! • Хрыстос уваскрос! • Chrystus zmartwychwstał! • Kristus vstal z mrtvých! • Kristus vstal z mŕtvych! • Krisztus feltámadt! • ქრისტე აღსდგა! • Քրիստոս հարություն առավ! • !المسيح قام • Ⲡⲓⲭⲣⲓⲥⲧⲟⲥ ⲁϥⲧⲱⲛϥ! • ܡܫܝܚܐ ܩܡ! • !המשיח קם • ክርስቶስ ተንሥኦ! • Le Christ est ressuscité! • Cristo è risorto! • Cristo ressuscitou! • Christus ist auferstanden! • Christus is opgestaan! • Kristus är uppstånden! • Kristus er oppstanden! • Kristus er opstanden! • Kristus nousi kuolleista! • Kristur er upprisinn! • Kristus on üles tõusnud! • Kristus augšāmcēlies! • Kristus prisikėlė! • Krishti u ngjall! • Mesih dirildi! • 그리스도 부활하셨네! • Chúa Kitô đã sống lại! • Si Kristo ay nabuhay! • Kristus telah bangkit! • Kristo amefufuka! • Atgyfododd Crist! • Tá Críost éirithe! • Tha Crìosd air èirigh! • Kristu qam! • Ua ala hou ʻo Kristo! • Kua ara a Te Karaiti! • Kristo leviĝis! • Kristo asɔre! • 
            </span>
          </div>
        </a>
      </footer>

       {/* Fixed Sign Up and Sign In Buttons - Mobile Only - Rendered via Portal to avoid transform context */}
       {mounted && isMobile && !isLoading && createPortal(
         <div 
           className="sm:hidden fixed inset-0 z-50"
           style={{ 
             position: 'fixed', 
             top: 0,
             bottom: 0, 
             left: 0, 
             right: 0, 
             zIndex: (isSignupModalOpen || isLoginModalOpen) ? 40 : 50,
             transform: 'translate3d(0, 0, 0)',
             isolation: 'isolate',
             background: 'transparent',
             pointerEvents: 'none'
           }}
         >
           {/* Logo in top-right corner */}
           <div 
             className="absolute top-6 right-6 pointer-events-auto"
             style={{ 
               opacity: mobileContentFadeIn,
               transition: 'opacity 1.5s ease-in-out',
             }}
           >
             <Image
               src="/images/harmony-white-logo-with-text.png"
               alt="Harmony"
               width={85}
               height={60}
               className="object-contain"
               style={{ marginTop: '32px' }}
               priority
               unoptimized
             />
           </div>
           
           {/* Title and buttons at bottom */}
           <div 
             className="absolute bottom-0 left-0 right-0 px-6 pointer-events-auto"
             style={{ 
               paddingTop: '22px', 
               paddingBottom: '1px',
               opacity: mobileContentFadeIn,
               transition: 'opacity 1.5s ease-in-out',
             }}
           >
             <div className="max-w-md mx-auto space-y-4 mb-[19px]">
               <h1 className="text-left text-white mb-5 font-semibold" style={{ fontSize: '21px', fontFamily: 'janoSans', fontWeight: 600, marginBottom: '20px' }}>
                 Stories from the<br />Ancient Christian Faith
               </h1>
               {needsToFinishSignup ? (
                 <div className="space-y-3">
                   <button
                     onClick={handleFinishSignup}
                     className="w-full bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 cursor-pointer"
                   >
                     Finish signup &gt;
                   </button>
                   <button
                     onClick={handleRestartSignup}
                     className="w-full bg-gray-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-700 cursor-pointer text-sm"
                   >
                     Restart signup
                   </button>
                 </div>
               ) : (
                 <>
                   <button
                     onClick={() => {
                       setIsSignupModalOpen(true);
                       setSignupModalInitialStep('email');
                     }}
                     className="w-full bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 cursor-pointer"
                   >
                     Sign Up
                   </button>
                   <button
                     onClick={() => {
                       setIsLoginModalOpen(true);
                     }}
                     className="w-full bg-gray-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-700 cursor-pointer"
                   >
                     Sign In
                   </button>
                 </>
               )}
             </div>
           </div>
         </div>,
         document.body
       )}
    </div>
  );
}
