"use client";

import { useEffect, useState } from "react";

/**
 * Component to visualize WKWebView boundaries with a thick red border
 */
export function WebviewBorder() {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 99999,
        boxSizing: 'border-box',
      }}
    >
      {/* Top border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '8px',
          backgroundColor: 'red',
          border: 'none',
        }}
      />
      {/* Bottom border */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '8px',
          backgroundColor: 'red',
          border: 'none',
        }}
      />
      {/* Left border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '8px',
          backgroundColor: 'red',
          border: 'none',
        }}
      />
      {/* Right border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: '8px',
          backgroundColor: 'red',
          border: 'none',
        }}
      />
      {/* Corner indicators */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          width: '20px',
          height: '20px',
          backgroundColor: 'red',
          borderRadius: '50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '20px',
          height: '20px',
          backgroundColor: 'red',
          borderRadius: '50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '4px',
          left: '4px',
          width: '20px',
          height: '20px',
          backgroundColor: 'red',
          borderRadius: '50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '4px',
          right: '4px',
          width: '20px',
          height: '20px',
          backgroundColor: 'red',
          borderRadius: '50%',
        }}
      />
      {/* Dimensions display */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'red',
          color: 'white',
          padding: '4px 8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        {dimensions.width} × {dimensions.height}
      </div>
    </div>
  );
}

