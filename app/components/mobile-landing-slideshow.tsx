"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";

// Zoom configuration - adjust these values to change zoom behavior
const ZOOM_START_SCALE = 1.0;   // Starting zoom level (1.0 = 100%, normal size)
const ZOOM_END_SCALE = 1.15;     // Ending zoom level (1.15 = 115%, zoomed in)
const FADE_DURATION = 1;    // Fade crossfade duration in seconds
const OVERLAP_TIME = 1.5;     // Seconds before end to start fading in next image

interface SlideshowImage {
  id: string;
  image_url: string;
  sort_order: number;
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function MobileLandingSlideshow() {
  const [shuffledImages, setShuffledImages] = useState<SlideshowImage[]>([]);
  const [duration, setDuration] = useState(7);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [fadeInOpacity, setFadeInOpacity] = useState(0); // Start from black (opacity 0)

  // Track which image index each layer is showing
  const [layerAIndex, setLayerAIndex] = useState(0);
  const [layerBIndex, setLayerBIndex] = useState(1);

  // Which layer is on top (visible)
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');

  // Zoom state - when true, image zooms from START to END
  const [layerAZooming, setLayerAZooming] = useState(false);
  const [layerBZooming, setLayerBZooming] = useState(false);

  // Resetting state - briefly true when snapping zoom back (no transition)
  const [layerAResetting, setLayerAResetting] = useState(false);
  const [layerBResetting, setLayerBResetting] = useState(false);

  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const currentStepRef = useRef(0); // Tracks total transitions for cycling through all images

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch images and duration
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const imagesResponse = await fetch('/api/mobile-landing-slideshow');
        if (imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          if (imagesData.images && imagesData.images.length > 0) {
            const shuffled = shuffleArray(imagesData.images as SlideshowImage[]);
            setShuffledImages(shuffled);
          }
        }

        const durationResponse = await fetch('/api/landing-content?key=mobile_slideshow_duration');
        if (durationResponse.ok) {
          const durationData = await durationResponse.json();
          if (durationData.content?.content) {
            const parsed = parseInt(durationData.content.content, 10);
            if (!isNaN(parsed) && parsed > 0) {
              setDuration(parsed);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching slideshow data:', error);
      } finally {
        setLoading(false);
        // Start fade-in animation after loading completes
        setTimeout(() => {
          setFadeInOpacity(1);
        }, 100);
      }
    };

    fetchData();
  }, []);

  // Preload an image URL
  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Continue even on error
      img.src = url;
    });
  }, []);

  // Main slideshow cycle
  useEffect(() => {
    if (loading || shuffledImages.length < 2 || !isMobile) return;

    // Initialize: Layer A shows image 0, Layer B has image 1 ready
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      setLayerAIndex(0);
      setLayerBIndex(1);
      setActiveLayer('A');
      setLayerAZooming(false);
      setLayerBZooming(false);

      // Preload first image, then start zooming
      preloadImage(shuffledImages[0].image_url).then(() => {
        // Small delay so the browser renders at ZOOM_START_SCALE first
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLayerAZooming(true); // Start zoom animation on layer A
          });
        });
      });

      // Preload second image in background
      preloadImage(shuffledImages[1].image_url);
    }

    // Schedule the next transition
    // Transition happens OVERLAP_TIME seconds before the zoom finishes
    const transitionDelay = Math.max(1, (duration - OVERLAP_TIME)) * 1000;

    cycleTimerRef.current = setTimeout(() => {
      const step = currentStepRef.current;
      const totalImages = shuffledImages.length;

      if (step % 2 === 0) {
        // Currently A is active, switch to B
        // B already has the next image set and is at ZOOM_START_SCALE

        // Fade in B (it becomes active)
        setActiveLayer('B');

        // Start B's zoom after a frame (so it starts from ZOOM_START_SCALE)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLayerBZooming(true);
          });
        });

        // After fade completes, reset A for next use
        setTimeout(() => {
          const nextImageForA = (step + 2) % totalImages;
          
          // Disable transitions, snap zoom back to start, change image
          setLayerAResetting(true);
          setLayerAZooming(false);
          setLayerAIndex(nextImageForA);

          // Re-enable transitions after the snap completes
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setLayerAResetting(false);
            });
          });

          // Preload that image
          preloadImage(shuffledImages[nextImageForA].image_url);
        }, FADE_DURATION * 1000 + 100);

      } else {
        // Currently B is active, switch to A
        setActiveLayer('A');

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLayerAZooming(true);
          });
        });

        // After fade completes, reset B for next use
        setTimeout(() => {
          const nextImageForB = (step + 2) % totalImages;
          
          // Disable transitions, snap zoom back to start, change image
          setLayerBResetting(true);
          setLayerBZooming(false);
          setLayerBIndex(nextImageForB);

          // Re-enable transitions after the snap completes
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setLayerBResetting(false);
            });
          });

          preloadImage(shuffledImages[nextImageForB].image_url);
        }, FADE_DURATION * 1000 + 100);
      }

      currentStepRef.current = step + 1;
    }, transitionDelay);

    return () => {
      if (cycleTimerRef.current) {
        clearTimeout(cycleTimerRef.current);
      }
    };
  }, [loading, shuffledImages, isMobile, duration, preloadImage, activeLayer]);

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  if (loading || shuffledImages.length === 0) {
    return null;
  }

  // Single image - just show with zoom
  if (shuffledImages.length === 1) {
    return (
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        {/* Black background that fades out */}
        <div
          className="absolute inset-0 bg-black"
          style={{
            opacity: 1 - fadeInOpacity,
            transition: 'opacity 1.5s ease-in-out',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            transform: `scale(${layerAZooming ? ZOOM_END_SCALE : ZOOM_START_SCALE})`,
            transformOrigin: 'center center',
            opacity: fadeInOpacity,
            transition: `opacity 1.5s ease-in-out, transform ${duration}s ease-out`,
          }}
        >
          <Image
            src={shuffledImages[0].image_url}
            alt="Slideshow background"
            fill
            sizes="100vw"
            className="object-cover"
            priority
            unoptimized
          />
        </div>
      </div>
    );
  }

  // Multiple images - two permanent layers that crossfade
  const layerAUrl = shuffledImages[layerAIndex]?.image_url;
  const layerBUrl = shuffledImages[layerBIndex]?.image_url;

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      {/* Black background that fades out */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: 1 - fadeInOpacity,
          transition: 'opacity 1.5s ease-in-out',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* Layer A - always in DOM */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          opacity: activeLayer === 'A' ? fadeInOpacity : 0,
          transform: `scale(${layerAZooming ? ZOOM_END_SCALE : ZOOM_START_SCALE})`,
          transformOrigin: 'center center',
          transition: layerAResetting
            ? 'none'
            : `opacity ${FADE_DURATION}s ease-in-out, transform ${duration}s ease-out`,
          zIndex: activeLayer === 'A' ? 1 : 0,
          pointerEvents: 'none',
        }}
      >
        {layerAUrl && (
          <Image
            src={layerAUrl}
            alt="Slideshow background"
            fill
            sizes="100vw"
            className="object-cover"
            priority
            unoptimized
          />
        )}
      </div>

      {/* Layer B - always in DOM */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          opacity: activeLayer === 'B' ? fadeInOpacity : 0,
          transform: `scale(${layerBZooming ? ZOOM_END_SCALE : ZOOM_START_SCALE})`,
          transformOrigin: 'center center',
          transition: layerBResetting
            ? 'none'
            : `opacity ${FADE_DURATION}s ease-in-out, transform ${duration}s ease-out`,
          zIndex: activeLayer === 'B' ? 1 : 0,
          pointerEvents: 'none',
        }}
      >
        {layerBUrl && (
          <Image
            src={layerBUrl}
            alt="Slideshow background"
            fill
            sizes="100vw"
            className="object-cover"
            unoptimized
          />
        )}
      </div>
    </div>
  );
}
