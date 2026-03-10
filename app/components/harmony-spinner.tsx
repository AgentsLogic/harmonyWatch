"use client";

import Image from "next/image";

interface HarmonySpinnerProps {
  size?: number; // Size in pixels (default: 24)
  className?: string;
}

export function HarmonySpinner({ size = 24, className = '' }: HarmonySpinnerProps) {
  return (
    <div className={`inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <Image 
        src="/icons/harmony-spinner.svg" 
        alt="Loading" 
        width={size} 
        height={size}
        className="w-full h-full"
        unoptimized
      />
    </div>
  );
}
