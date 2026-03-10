"use client";

import { useEffect, useState, useRef, ReactNode, RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBodyScrollLock } from "../../lib/hooks/useBodyScrollLock";

type BaseModalProps = {
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  children: ReactNode;
  isMobile?: boolean;
  enableDragToDismiss?: boolean;
  showDragHandle?: boolean;
  className?: string;
  backdropClassName?: string;
  onDragStateChange?: (hasDragged: boolean) => void;
  onDragTransform?: (transform: { dragX: number; dragY: number; scale: number; isDragging: boolean; isDraggingToDismiss: boolean }) => void;
  dataAttribute?: string;
  overflowClassName?: string;
  sourcePosition?: { x: number; y: number; width: number; height: number } | null;
  modalRef?: RefObject<HTMLDivElement | null>;
  isAnimatingClose?: boolean;
  zIndex?: number; // Custom z-index for modal container
  backdropZIndex?: number; // Custom z-index for backdrop
  backgroundImage?: string; // Optional background image URL
  backgroundImagePosition?: string; // Optional background image position (default: 'top center')
  centerOnDesktop?: boolean; // Center modal vertically on desktop (default: false - top aligned)
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | 'full'; // Max width on desktop (default: '4xl')
  fitContent?: boolean; // If true, modal height fits content on desktop (default: false)
  maxHeight?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full' | 'screen'; // Max height on desktop (default: undefined - no max)
  minHeight?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full' | 'screen'; // Min height on desktop (default: undefined - no min)
};

export function BaseModal({
  isOpen,
  onClose,
  children,
  isMobile = false,
  enableDragToDismiss = true,
  showDragHandle = true,
  className = "",
  backdropClassName = "",
  onDragStateChange,
  onDragTransform,
  dataAttribute,
  overflowClassName = "",
  sourcePosition,
  modalRef: externalModalRef,
  isAnimatingClose = false,
  zIndex = 100,
  backdropZIndex = 99,
  backgroundImage,
  backgroundImagePosition = 'top center',
  centerOnDesktop = false,
  maxWidth = '4xl',
  fitContent = false,
  maxHeight,
  minHeight,
}: BaseModalProps) {
  // Lock body scroll when modal is open or animating close (to prevent layout shift during fade-out)
  useBodyScrollLock(isOpen || isAnimatingClose);

  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState<{ x: number; y: number } | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDraggingToDismiss, setIsDraggingToDismiss] = useState(false);
  const hasDraggedRef = useRef(false);
  const internalModalRef = useRef<HTMLDivElement>(null);
  const modalRef = externalModalRef || internalModalRef;

  const dragThreshold = 100;
  const verticalThreshold = 40;

  // Reset drag state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDragX(0);
      setDragY(0);
      setDragStartX(null);
      setDragStartY(null);
      setIsDragging(false);
      setIsClosing(false);
      setDragDirection(null);
      hasDraggedRef.current = false;
    }
  }, [isOpen]);

  const handleClose = () => {
    // On desktop, trigger fade-out animation when clicking outside
    // On mobile, close immediately (drag-to-dismiss handles animation)
    if (!isMobile) {
      onClose(true); // delayClose=true triggers fade-out animation
    } else {
      onClose(false); // Immediate close on mobile
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    console.log('[BaseModal] onTouchStart called:', { isOpen, enableDragToDismiss });
    if (!isOpen || !enableDragToDismiss) return;
    const touch = e.touches[0];
    setDragStartX(touch.clientX);
    setDragStartY(touch.clientY);
    setIsDragging(true);
    hasDraggedRef.current = false;
    setDragDirection(null);
    setIsScrolling(false);
    setIsDraggingToDismiss(false);
    console.log('[BaseModal] Touch started, isDragging set to true');
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!enableDragToDismiss || dragStartX === null || dragStartY === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - dragStartX;
    const deltaY = currentY - dragStartY;
    
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    if (!isDraggingToDismiss && absDeltaX < verticalThreshold && absDeltaY > verticalThreshold) {
      setIsScrolling(true);
      hasDraggedRef.current = false;
      return;
    }
    
    if (isScrolling) {
      return;
    }
    
    if (deltaX < 0) {
      hasDraggedRef.current = false;
      return;
    }
    
    if (deltaX > 0) {
      if (absDeltaX >= verticalThreshold) {
        hasDraggedRef.current = true;
        setIsDraggingToDismiss(true);
        const diagonalDragY = absDeltaY > 0 ? deltaY * (absDeltaX / (absDeltaX + absDeltaY)) : 0;
        setDragX(deltaX);
        setDragY(diagonalDragY);
        
        const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (totalDistance > 0) {
          setDragDirection({
            x: deltaX / totalDistance,
            y: deltaY / totalDistance
          });
        }
        
        e.stopPropagation();
      } else if (absDeltaX >= 10) {
        const scale = absDeltaX / verticalThreshold;
        const scaledDeltaX = deltaX * scale;
        const scaledDiagonalDragY = absDeltaY > 0 ? deltaY * scale * (absDeltaX / (absDeltaX + absDeltaY)) : 0;
        setDragX(scaledDeltaX);
        setDragY(scaledDiagonalDragY);
        setIsDraggingToDismiss(true);
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!enableDragToDismiss) return;
    e.stopPropagation();
    
    if (isScrolling) {
      setDragStartX(null);
      setDragStartY(null);
      setIsDragging(false);
      setIsScrolling(false);
      return;
    }
    
    const totalDragDistance = Math.sqrt(dragX * dragX + dragY * dragY);
    
    if (totalDragDistance > dragThreshold) {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      let finalX = 0;
      let finalY = 0;
      
      if (dragDirection) {
        const angle = Math.atan2(dragY, dragX);
        if (Math.abs(dragX) > Math.abs(dragY)) {
          finalX = dragX > 0 ? windowWidth : -windowWidth;
          finalY = (finalX * dragY) / dragX;
        } else {
          finalY = dragY > 0 ? windowHeight : -windowHeight;
          finalX = (finalY * dragX) / dragY;
        }
      } else {
        finalX = dragX;
        finalY = dragY;
      }
      
      setDragX(finalX);
      setDragY(finalY);
      setIsDragging(false);
      
      setIsClosing(true);
      onClose(true);
      
      setTimeout(() => {
        setDragX(0);
        setDragY(0);
        setDragStartX(null);
        setDragStartY(null);
        setDragDirection(null);
        setIsClosing(false);
      }, 400);
    } else {
      setDragStartX(null);
      setDragStartY(null);
      setIsDragging(false);
      setDragX(0);
      setDragY(0);
    }
    setTimeout(() => {
      hasDraggedRef.current = false;
      onDragStateChange?.(false);
    }, 100);
  };

  // Notify parent when drag state changes
  useEffect(() => {
    if (onDragStateChange && isDragging) {
      onDragStateChange(hasDraggedRef.current);
    }
  }, [isDragging, onDragStateChange]);

  // Calculate scale based on drag distance - shrink as dragged further
  const totalDragDistance = Math.sqrt(dragX * dragX + dragY * dragY);
  const maxDragDistance = typeof window !== 'undefined'
    ? Math.sqrt(window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight)
    : 1000;
  const dragProgress = Math.min(totalDragDistance / (maxDragDistance * 0.5), 1);
  const scale = 1 - (dragProgress * 0.4);

  // Notify parent of drag transform changes
  useEffect(() => {
    console.log('[BaseModal] useEffect triggered:', {
      hasCallback: !!onDragTransform,
      dragX,
      dragY,
      isDragging,
      isDraggingToDismiss,
    });
    if (onDragTransform) {
      const transform = {
        dragX,
        dragY,
        scale,
        isDragging,
        isDraggingToDismiss,
      };
      console.log('[BaseModal] Calling onDragTransform:', transform);
      onDragTransform(transform);
    } else {
      console.log('[BaseModal] onDragTransform is not provided');
    }
  }, [dragX, dragY, scale, isDragging, isDraggingToDismiss, onDragTransform]);

  // Calculate transform origin for drag-to-dismiss
  let transformOrigin = 'center center';
  if (sourcePosition && isClosing && isMobile && typeof window !== 'undefined') {
    const modalWidth = window.innerWidth;
    const modalHeight = window.innerHeight;
    const sourceCenterX = sourcePosition.x + sourcePosition.width / 2;
    const sourceCenterY = sourcePosition.y + sourcePosition.height / 2;
    const originX = (sourceCenterX / modalWidth) * 100;
    const originY = (sourceCenterY / modalHeight) * 100;
    transformOrigin = `${originX}% ${originY}%`;
  } else if (dragDirection && isClosing && isMobile) {
    const originX = Math.max(0, Math.min(30, 50 - (dragDirection?.x || 0) * 50));
    const originY = (dragDirection?.y || 0) > 0
      ? Math.max(0, Math.min(30, 50 - (dragDirection?.y || 0) * 50))
      : Math.min(100, Math.max(70, 50 - (dragDirection?.y || 0) * 50));
    transformOrigin = `${originX}% ${originY}%`;
  }


  // Animation variants for Framer Motion
  // Smooth zoom in/out
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { 
      opacity: 0,
      scale: 0.9,
    },
    visible: { 
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1] as const,
      }
    },
    exit: {
      opacity: 0,
      scale: 0.9,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1] as const,
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - only on desktop */}
          {!isMobile && (
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={backdropVariants}
              transition={{ duration: 0.2 }}
              className={`fixed inset-0 ${backdropClassName || 'bg-black/80'}`}
              style={{ zIndex: backdropZIndex }}
              onClick={handleClose}
            />
          )}
          
          {/* Modal container */}
          <motion.div
            ref={modalRef}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
            {...(dataAttribute ? { [dataAttribute]: "true" } : {})}
            className={`fixed inset-0 flex ${centerOnDesktop ? 'items-start sm:items-center' : 'items-start'} justify-center pt-0 pb-0 px-0 sm:pt-8 sm:pb-8 sm:px-4 ${overflowClassName || 'overflow-y-auto overflow-x-hidden'} overscroll-contain`}
            style={{ zIndex, scrollbarGutter: 'unset' }}
            onClick={handleClose}
          >
            {/* Modal content */}
            <motion.div
              className={`relative w-full ${fitContent ? 'min-h-full sm:min-h-0' : 'min-h-full'} ${minHeight ? 'sm:h-full' : 'sm:h-auto'} ${
                maxWidth === 'sm' ? 'sm:max-w-sm' :
                maxWidth === 'md' ? 'sm:max-w-md' :
                maxWidth === 'lg' ? 'sm:max-w-lg' :
                maxWidth === 'xl' ? 'sm:max-w-xl' :
                maxWidth === '2xl' ? 'sm:max-w-2xl' :
                maxWidth === '4xl' ? 'sm:max-w-4xl' :
                maxWidth === 'full' ? '' :
                'sm:max-w-4xl'
              } ${
                maxHeight === 'sm' ? 'sm:max-h-32' :
                maxHeight === 'md' ? 'sm:max-h-48' :
                maxHeight === 'lg' ? 'sm:max-h-64' :
                maxHeight === 'xl' ? 'sm:max-h-96' :
                maxHeight === '2xl' ? 'sm:max-h-[28rem]' :
                maxHeight === '3xl' ? 'sm:max-h-[32rem]' :
                maxHeight === '4xl' ? 'sm:max-h-[36rem]' :
                maxHeight === '5xl' ? 'sm:max-h-[40rem]' :
                maxHeight === '6xl' ? 'sm:max-h-[44rem]' :
                maxHeight === 'full' ? 'sm:max-h-full' :
                maxHeight === 'screen' ? 'sm:max-h-screen' :
                ''
              } ${
                minHeight === 'sm' ? 'sm:min-h-32' :
                minHeight === 'md' ? 'sm:min-h-48' :
                minHeight === 'lg' ? 'sm:min-h-64' :
                minHeight === 'xl' ? 'sm:min-h-96' :
                minHeight === '2xl' ? 'sm:min-h-[28rem]' :
                minHeight === '3xl' ? 'sm:min-h-[32rem]' :
                minHeight === '4xl' ? 'sm:min-h-[36rem]' :
                minHeight === '5xl' ? 'sm:min-h-[40rem]' :
                minHeight === '6xl' ? 'sm:min-h-[44rem]' :
                minHeight === 'full' ? 'sm:min-h-full' :
                minHeight === 'screen' ? 'sm:min-h-screen' :
                ''
              } sm:my-0 ${backgroundImage ? 'bg-transparent' : 'bg-[#1c1c1c]'} ${isDragging ? 'rounded-2xl' : 'rounded-none'} sm:rounded-2xl shadow-2xl ${backgroundImage ? 'overflow-hidden' : (maxHeight ? 'sm:overflow-y-auto' : '')} ${className}`}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{
                transform: `translate(${dragX}px, ${dragY}px) scale(${scale})`,
                transformOrigin: transformOrigin,
                transition: isDragging ? 'none' : (dragX !== 0 || dragY !== 0 ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'),
                touchAction: isDragging ? 'none' : 'pan-y',
                ...(backgroundImage ? {
                  backgroundImage: `url("${backgroundImage}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: backgroundImagePosition,
                  backgroundRepeat: 'no-repeat',
                } : {}),
              }}
            >
              {/* Drag handle indicator - only on mobile */}
              {isMobile && enableDragToDismiss && showDragHandle && (
                <div
                  className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/30 rounded-full cursor-grab active:cursor-grabbing touch-none z-10"
                />
              )}
              
              {children}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

