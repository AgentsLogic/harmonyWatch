"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";
import { useModal } from "../contexts/modal-context";
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export default function TopBanner() {
  const { setIsSettingsModalOpen, setIsSignupModalOpen, setSignupModalInitialStep, isVideoModalOpen, setIsVideoModalOpen, setIsLoginModalOpen, setIsBugModalOpen, setIsSearchModalOpen } = useModal();
  const [isSolid, setIsSolid] = useState(false);
  const lastScrollYRef = useRef(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading: userLoading } = useUser();
  const queryClient = useQueryClient();
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollBufferPx = 12; // Buffer to smooth iOS momentum/elastic scrolling
  const topRevealThresholdPx = 50; // Show header when within 50px of top
  
  // Check if user has free plan (not paid)
  const isFreePlan = user?.user_type === 'free' && user?.signup_status === 'complete';
  
  // Check if we're on a signup flow page
  const isSignupFlow = pathname?.startsWith('/signup');
  
  // Check if we're on the landing page
  const isLandingPage = pathname === '/landing';
  
  // Hide header on mobile video pages or landing page
  const isVideoPage = false; // Deprecated: video page removed, using modal instead
  const shouldHideOnMobile = isMobile && (isVideoPage || isLandingPage);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement) return;

    // Find the main scroll container
    const scrollContainer = document.getElementById('main-scroll-container');
    
    // Find the video modal scroll container when video modal is open
    const videoModalContainer = isVideoModalOpen ? document.querySelector('[data-video-modal="true"]') as HTMLElement : null;
    
    // When video modal opens, reset to top (not solid/blurred)
    if (isVideoModalOpen && videoModalContainer) {
      setIsSolid(false);
      lastScrollYRef.current = 0;
    }

    // Continuously lock position to top: 0 (same approach as test box)
    let rafId: number;
    const lockPosition = () => {
      if (headerElement) {
        // Lock to exact top position
        headerElement.style.top = '0px';
        headerElement.style.left = '0px';
        headerElement.style.right = '0px';
        headerElement.style.transform = 'translate3d(0, 0, 0)';
        (headerElement.style as any).webkitTransform = 'translate3d(0, 0, 0)';
      }
      rafId = requestAnimationFrame(lockPosition);
    };

    lockPosition();

    // Initialize scroll position check
    const checkScrollPosition = () => {
      let currentScrollY = 0;
      if (videoModalContainer) {
        currentScrollY = videoModalContainer.scrollTop;
      } else if (scrollContainer) {
        currentScrollY = scrollContainer.scrollTop;
      } else {
        currentScrollY = window.scrollY;
      }
      setIsSolid(currentScrollY > 4);
      lastScrollYRef.current = currentScrollY;
    };

    // Initial check when video modal opens/closes or container changes
    checkScrollPosition();
    
    // Also check after a short delay to ensure DOM is ready (especially when video modal just opened)
    const timeoutId = setTimeout(() => {
      checkScrollPosition();
    }, 100);

    const onScroll = () => {
      // Use video modal scroll container if available, then main scroll container, otherwise fallback to window.scrollY
      let currentScrollY = 0;
      if (videoModalContainer) {
        currentScrollY = videoModalContainer.scrollTop;
      } else if (scrollContainer) {
        currentScrollY = scrollContainer.scrollTop;
      } else {
        currentScrollY = window.scrollY;
      }
      
      const lastScrollY = lastScrollYRef.current;
      const delta = currentScrollY - lastScrollY;
      setIsSolid(currentScrollY > 4);
      
      // Lock header position on scroll (same as test box)
      if (headerElement) {
        headerElement.style.top = '0px';
        headerElement.style.left = '0px';
        headerElement.style.right = '0px';
        headerElement.style.transform = 'translate3d(0, 0, 0)';
        (headerElement.style as any).webkitTransform = 'translate3d(0, 0, 0)';
      }
      
      if (isMobile) {
        // If we're still near the very top, keep the header visible
        if (currentScrollY <= topRevealThresholdPx) {
          setIsVisible(true);
          lastScrollYRef.current = currentScrollY;
          return;
        }

        if (Math.abs(delta) < scrollBufferPx) {
          // Ignore tiny deltas to prevent flicker during momentum/elastic scroll
          return;
        }

        if (delta > 0) {
          // Scrolling down, hide header immediately
          setIsVisible(false);
        } else if (delta < 0 && currentScrollY <= topRevealThresholdPx) {
          // Scrolling up and near the top, show header
          setIsVisible(true);
        }
        lastScrollYRef.current = currentScrollY;
      }
    };

    const handleResize = () => {
      if (headerElement) {
        headerElement.style.top = '0px';
        headerElement.style.left = '0px';
        headerElement.style.right = '0px';
      }
    };

    // Listen to video modal container if open, then scroll container if it exists, otherwise fallback to window
    if (videoModalContainer) {
      videoModalContainer.addEventListener("scroll", onScroll, { passive: true });
    } else if (scrollContainer) {
      scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    } else {
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    window.addEventListener("resize", handleResize, { passive: true });
    
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      if (videoModalContainer) {
        videoModalContainer.removeEventListener("scroll", onScroll);
      } else if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", onScroll);
      } else {
        window.removeEventListener("scroll", onScroll);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [isMobile, isVideoModalOpen]); // Re-run when isMobile or isVideoModalOpen changes

  // Don't render on mobile video pages
  if (shouldHideOnMobile) {
    return null;
  }

  return (
    <div 
      ref={headerRef}
      data-header-fixed
      className={`fixed top-0 left-0 right-0 transition-opacity duration-300 ${isVideoModalOpen && !isMobile ? 'z-[105]' : 'z-[60]'}`}
      style={{
        // Use left/right positioning to span available width (excludes scrollbar)
        // This prevents shift when body padding changes
        height: `calc(4rem + env(safe-area-inset-top, 0px))`, // h-16 (4rem) + safe area
        opacity: isMobile && !isVisible ? 0 : 1,
        pointerEvents: isMobile && !isVisible ? 'none' : 'auto',
        position: 'fixed',
        willChange: 'transform',
        // iOS-specific: Force hardware acceleration and prevent movement during overscroll (same as test box)
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        // Prevent any movement
        isolation: 'isolate',
      } as React.CSSProperties}
    >
      {/* Base gradient with a fading solid overlay for smooth transition */}
        <div className="relative h-full">
          {/* Darkened blur overlay disabled on mobile */}
          {!isMobile && (
            <div
              className={`pointer-events-none absolute top-0 left-0 right-0 bottom-[-20px] transition-all duration-300 ease-out ${
                isSolid ? "backdrop-blur-md bg-black/25" : "backdrop-blur-0 bg-black/25 opacity-0"
              }`}
              style={{ 
                opacity: isSolid ? 1 : 0,
              }}
            />
          )}
        {/* Gradient extends into status bar area on iOS - starts from absolute top */}
        <div 
          className="bg-gradient-to-b from-transparent to-transparent h-full absolute inset-0"
        >
          <nav 
            className="relative z-10 mx-auto max-w-[1700px] px-4 sm:px-6 h-16 flex items-center justify-between text-white"
            style={{
              marginTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <div className="flex items-center justify-between w-full translate-y-[10px]">
              {/* Left: logo + nav */}
              <div className="flex items-center gap-6">
            <Link 
              href="/" 
              className="hover:opacity-90 transition-opacity"
              onClick={(e) => {
                if (isVideoModalOpen) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Navigate immediately (modal will close automatically)
                  router.replace('/');
                  setIsVideoModalOpen(false);
                }
                // Invalidate recently viewed cache when navigating to home
                if (user?.id) {
                  queryClient.invalidateQueries({ 
                    queryKey: queryKeys.recentlyViewed.byUser(user.id) 
                  });
                }
              }}
            >
              <Image
                src="/images/harmony-white-logo.png"
                alt="Harmony logo"
                width={56}
                height={56}
                className="w-14 h-14 object-contain"
                priority
                unoptimized
              />
            </Link>
            {!isSignupFlow && (
              <>
                {user ? (
                  <div className="hidden sm:flex items-center gap-6 text-white">
                    <Link 
                      href="/" 
                      className="text-[1.05rem] tracking-wide hover:opacity-90 transition-opacity cursor-pointer"
                      onClick={(e) => {
                        if (isVideoModalOpen) {
                          e.preventDefault();
                          e.stopPropagation();
                          // Navigate immediately (modal will close automatically)
                          router.replace('/');
                          setIsVideoModalOpen(false);
                        }
                      }}
                    >
                      Home
                    </Link>
                    {/* Show Landing only for admin/staff */}
                    {(user.user_type === 'admin' || user.user_type === 'staff') && (
                      <Link 
                        href="/landing" 
                        className="text-[1.05rem] tracking-wide hover:opacity-90 transition-opacity cursor-pointer"
                        onClick={(e) => {
                          if (isVideoModalOpen) {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsVideoModalOpen(false);
                            // Navigate after closing modal
                            setTimeout(() => {
                              router.push('/landing');
                            }, 100);
                          }
                        }}
                      >
                        Landing
                      </Link>
                    )}
                    {/* Show Bug and Search for all users */}
                    <button
                      onClick={() => {
                        setIsBugModalOpen(true);
                      }}
                      className="text-[1.05rem] tracking-wide hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Bug
                    </button>
                    <button
                      onClick={() => {
                        setIsSearchModalOpen(true);
                      }}
                      className="hover:opacity-90 transition-opacity cursor-pointer"
                      aria-label="Search"
                    >
                      <Image src="/icons/search.webp" alt="Search" width={20} height={20} className="opacity-90" />
                    </button>
                    {(user.user_type === 'admin' || user.user_type === 'staff') && (
                      <Link href="/admin" className="text-[1.05rem] tracking-wide hover:opacity-90 transition-opacity cursor-pointer">Admin</Link>
                    )}
                  </div>
                ) : (
                  <div 
                    className="hidden sm:block"
                    style={{
                      paddingTop: '6px',
                      position: 'absolute',
                      left: '67px',
                      top: '12px'
                    }}
                  >
                    <Image
                      src="/images/harmony white text.png"
                      alt="Harmony"
                      width={120}
                      height={40}
                      className="object-contain"
                      priority
                      unoptimized
                    />
                  </div>
                )}
              </>
            )}
              </div>

              {/* Right: profile icon or login - hidden during signup flow */}
              {!isSignupFlow && (
                <div suppressHydrationWarning className="flex items-center gap-3">
                  {/* Build info */}
                  {process.env.NEXT_PUBLIC_BUILD_HASH && (
                    <div className="text-xs text-white/60 font-mono hidden sm:block">
                      <span>
                        {process.env.NEXT_PUBLIC_BUILD_HASH.substring(0, 7)}
                        {process.env.NEXT_PUBLIC_BUILD_TIME && isMounted && (
                          <span className="ml-2 opacity-70">
                            {new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {!userLoading && user ? (
                    <div className="flex items-center gap-2">
                      {isFreePlan && (
                        <button
                          onClick={() => {
                            // Update URL silently by appending /upgrade to current path
                            if (typeof window !== 'undefined') {
                              const currentPath = window.location.pathname;
                              const newPath = currentPath.endsWith('/upgrade') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}upgrade`;
                              window.history.pushState({}, '', newPath);
                            }
                            setSignupModalInitialStep('plans');
                            setIsSignupModalOpen(true);
                          }}
                          className="h-12 sm:h-9 px-4 sm:px-3 bg-red-600 text-white text-sm sm:text-xs font-semibold rounded-full hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center"
                        >
                          Upgrade
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Check both Next.js pathname and actual window location
                          // This handles cases where replaceState updated URL but pathname hasn't synced yet
                          const currentPath = typeof window !== 'undefined' ? window.location.pathname : pathname;
                          const isHomePage = currentPath === '/' || pathname === '/';
                          const isSettingsPage = currentPath === '/settings' || pathname === '/settings' || currentPath.endsWith('/settings');
                          
                          // If already on homepage, just update URL silently and open modal
                          // This prevents homepage re-render/reload
                          if (isHomePage) {
                            window.history.pushState({}, '', '/settings');
                            setIsSettingsModalOpen(true);
                          } else if (isSettingsPage) {
                            // Already on settings route, just open modal if not already open
                            setIsSettingsModalOpen(true);
                          } else {
                            // If on different page (e.g., video URL like /01cj7ix), append /settings silently
                            // This preserves the video context while opening settings
                            const newPath = currentPath.endsWith('/settings') ? currentPath : `${currentPath}${currentPath.endsWith('/') ? '' : '/'}settings`;
                            window.history.pushState({}, '', newPath);
                            setIsSettingsModalOpen(true);
                          }
                        }}
                        aria-label="Profile"
                        className="w-12 h-12 sm:w-9 sm:h-9 rounded-full overflow-hidden bg-white/95 hover:bg-white transition-colors cursor-pointer relative z-[102] flex items-center justify-center"
                      >
                        {user?.avatar_url ? (
                          <>
                            <Image
                              src={user.avatar_url}
                              alt={user.display_name || "Profile"}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                // Show fallback icon
                                const parent = target.parentElement;
                                if (parent) {
                                  const fallback = parent.querySelector('svg');
                                  if (fallback) {
                                    fallback.style.display = 'block';
                                  }
                                }
                              }}
                            />
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="absolute text-black sm:w-[18px] sm:h-[18px]" style={{ display: 'none' }}>
                              <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                            </svg>
                          </>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-black sm:w-[18px] sm:h-[18px]">
                            <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.66-10 5v3h20v-3c0-3.34-6.69-5-10-5z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  ) : !userLoading ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsLoginModalOpen(true)}
                        aria-label="Login"
                        className="px-4 py-2 text-white hover:opacity-90 transition-opacity cursor-pointer text-sm font-medium"
                      >
                        Login
                      </button>
                      <button
                        onClick={() => {
                          setSignupModalInitialStep('email');
                          setIsSignupModalOpen(true);
                        }}
                        aria-label="Signup"
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer text-sm font-medium"
                        style={{ borderRadius: '21px' }}
                      >
                        Signup
                      </button>
                    </div>
                  ) : (
                    // Show placeholder while loading to prevent layout shift
                    <div className="w-20 h-9" />
                  )}
                </div>
              )}
            </div>
        </nav>
        </div>
      </div>
    </div>
  );
}



