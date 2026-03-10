"use client";

import { useEffect, useRef, useState } from "react";

export function FixedTestBox() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const boxElement = boxRef.current;
    if (!boxElement) return;

    // Continuously lock position to center of screen
    let rafId: number;
    const lockPosition = () => {
      if (boxElement) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Calculate center position
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;
        
        // Lock to exact center
        boxElement.style.left = `${centerX}px`;
        boxElement.style.top = `${centerY}px`;
        boxElement.style.transform = `translate(-50%, -50%) translate3d(0, 0, 0)`;
        (boxElement.style as any).webkitTransform = `translate(-50%, -50%) translate3d(0, 0, 0)`;
      }
      rafId = requestAnimationFrame(lockPosition);
    };

    lockPosition();

    // Also lock on scroll and resize, and update scroll position
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      
      if (boxElement) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        boxElement.style.left = `${viewportWidth / 2}px`;
        boxElement.style.top = `${viewportHeight / 2}px`;
        boxElement.style.transform = `translate(-50%, -50%) translate3d(0, 0, 0)`;
        (boxElement.style as any).webkitTransform = `translate(-50%, -50%) translate3d(0, 0, 0)`;
      }
    };

    const handleResize = () => {
      if (boxElement) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        boxElement.style.left = `${viewportWidth / 2}px`;
        boxElement.style.top = `${viewportHeight / 2}px`;
      }
    };

    // Initial scroll position
    setScrollY(window.scrollY);
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      ref={boxRef}
      data-fixed-test-box
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: isMobile ? '150px' : '100px',
        height: isMobile ? 'auto' : '100px',
        minHeight: isMobile ? '80px' : '100px',
        backgroundColor: 'red',
        zIndex: 9999,
        border: '2px solid darkred',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: isMobile ? '10px' : '12px',
        textAlign: 'center',
        padding: '8px',
        boxSizing: 'border-box',
        // Force hardware acceleration
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        // Prevent any movement
        isolation: 'isolate',
      } as React.CSSProperties}
    >
      <div style={{ marginBottom: isMobile ? '4px' : '0' }}>FIXED TEST</div>
      {isMobile && (
        <div style={{ fontSize: '14px', fontFamily: 'monospace', lineHeight: '1.2' }}>
          Scroll: {Math.round(scrollY)}px
        </div>
      )}
    </div>
  );
}

