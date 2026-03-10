import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { HarmonyPlayer } from '../plugins/HarmonyPlayerPlugin';

export interface NativePlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isFullscreen: boolean;
  isAirPlayActive: boolean;
  isNativePipActive: boolean;
}

export interface UseNativePlayerReturn {
  playInline: (params: {
    playbackId: string;
    title: string;
    startTime: number;
    thumbnailUrl?: string;
    frame: { x: number; y: number; width: number; height: number };
  }) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (time: number) => Promise<void>;
  switchContent: (params: {
    playbackId: string;
    title: string;
    startTime: number;
    thumbnailUrl?: string;
  }) => Promise<void>;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  updateFrame: (frame: { x: number; y: number; width: number; height: number }, animated?: boolean, cornerRadius?: number) => Promise<void>;
  setPipMode: (enabled: boolean) => Promise<void>;
  startNativePip: () => Promise<void>;
  state: NativePlayerState;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onStateChange?: (isPlaying: boolean) => void;
  onClosed?: (currentTime: number) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onPipClose?: () => void;
  onPipTap?: () => void;
  onRequestPip?: () => void;
  onNativePipRestore?: () => void;
  onDragStart?: () => void;
  onDragMove?: (deltaX: number, deltaY: number) => void;
  onDragEnd?: (deltaX: number, deltaY: number) => void;
  setOnTimeUpdate: (callback: (currentTime: number, duration: number) => void) => void;
  setOnStateChange: (callback: (isPlaying: boolean) => void) => void;
  setOnClosed: (callback: (currentTime: number) => void) => void;
  setOnEnded: (callback: () => void) => void;
  setOnFullscreenChange: (callback: (isFullscreen: boolean) => void) => void;
  setOnPipClose: (callback: () => void) => void;
  setOnPipTap: (callback: () => void) => void;
  setOnRequestPip: (callback: () => void) => void;
  setOnNativePipRestore: (callback: () => void) => void;
  setOnDragStart: (callback: () => void) => void;
  setOnDragMove: (callback: (deltaX: number, deltaY: number) => void) => void;
  setOnDragEnd: (callback: (deltaX: number, deltaY: number) => void) => void;
}

const isNative = typeof window !== 'undefined' 
  && Capacitor.isNativePlatform() 
  && (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android');

export function useNativePlayer(): UseNativePlayerReturn {
  const [state, setState] = useState<NativePlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isFullscreen: false,
    isAirPlayActive: false,
    isNativePipActive: false,
  });

  const listenersRef = useRef<{ [key: string]: any }>({});
  const callbacksRef = useRef<{
    onTimeUpdate?: (currentTime: number, duration: number) => void;
    onStateChange?: (isPlaying: boolean) => void;
    onClosed?: (currentTime: number) => void;
    onEnded?: () => void;
    onFullscreenChange?: (isFullscreen: boolean) => void;
    onPipClose?: () => void;
    onPipTap?: () => void;
    onRequestPip?: () => void;
    onNativePipRestore?: () => void;
    onDragStart?: () => void;
    onDragMove?: (deltaX: number, deltaY: number) => void;
    onDragEnd?: (deltaX: number, deltaY: number) => void;
  }>({});

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (isNative) {
        Object.values(listenersRef.current).forEach(listener => {
          if (listener?.remove) {
            listener.remove().catch(() => {
              // Silently handle errors during cleanup
            });
          }
        });
      }
    };
  }, []);

  const listenersSetupRef = useRef(false);
  
  const setupListeners = useCallback(async () => {
    if (!isNative || listenersSetupRef.current) return;
    listenersSetupRef.current = true;

    try {
      // Time update listener
      const timeUpdateListener = await HarmonyPlayer.addListener('timeUpdate', (data: { currentTime: number; duration: number }) => {
        setState(prev => ({
          ...prev,
          currentTime: data.currentTime,
          duration: data.duration,
        }));
        callbacksRef.current.onTimeUpdate?.(data.currentTime, data.duration);
      });
      listenersRef.current.timeUpdate = timeUpdateListener;

      // State change listener
      const stateChangeListener = await HarmonyPlayer.addListener('stateChange', (data: { isPlaying: boolean }) => {
        setState(prev => ({
          ...prev,
          isPlaying: data.isPlaying,
        }));
        callbacksRef.current.onStateChange?.(data.isPlaying);
      });
      listenersRef.current.stateChange = stateChangeListener;

      // Fullscreen change listener
      const fullscreenChangeListener = await HarmonyPlayer.addListener('fullscreenChange', (data: { isFullscreen: boolean }) => {
        setState(prev => ({
          ...prev,
          isFullscreen: data.isFullscreen,
        }));
        callbacksRef.current.onFullscreenChange?.(data.isFullscreen);
      });
      listenersRef.current.fullscreenChange = fullscreenChangeListener;

      // AirPlay change listener
      const airPlayChangeListener = await HarmonyPlayer.addListener('airPlayChange', (data: { isActive: boolean }) => {
        setState(prev => ({
          ...prev,
          isAirPlayActive: data.isActive,
        }));
      });
      listenersRef.current.airPlayChange = airPlayChangeListener;

      // Native PiP change listener
      const nativePipChangeListener = await HarmonyPlayer.addListener('nativePipChange', (data: { isActive: boolean }) => {
        setState(prev => ({
          ...prev,
          isNativePipActive: data.isActive,
        }));
      });
      listenersRef.current.nativePipChange = nativePipChangeListener;

      // Closed listener
      const closedListener = await HarmonyPlayer.addListener('closed', (data: { currentTime: number }) => {
        callbacksRef.current.onClosed?.(data.currentTime);
      });
      listenersRef.current.closed = closedListener;

      // Ended listener
      const endedListener = await HarmonyPlayer.addListener('ended', () => {
        callbacksRef.current.onEnded?.();
      });
      listenersRef.current.ended = endedListener;

      // PiP close listener
      const pipCloseListener = await HarmonyPlayer.addListener('pipClose', () => {
        console.log('[useNativePlayer] pipClose event received from native');
        callbacksRef.current.onPipClose?.();
      });
      listenersRef.current.pipClose = pipCloseListener;

      // PiP tap listener
      const pipTapListener = await HarmonyPlayer.addListener('pipTap', () => {
        callbacksRef.current.onPipTap?.();
      });
      listenersRef.current.pipTap = pipTapListener;

      const requestPipListener = await HarmonyPlayer.addListener('requestPip', () => {
        callbacksRef.current.onRequestPip?.();
      });
      listenersRef.current.requestPip = requestPipListener;

      // Native PiP restore listener
      const nativePipRestoreListener = await HarmonyPlayer.addListener('nativePipRestore', () => {
        callbacksRef.current.onNativePipRestore?.();
      });
      listenersRef.current.nativePipRestore = nativePipRestoreListener;

      // Drag-to-dismiss listeners
      const dragStartListener = await HarmonyPlayer.addListener('dragStart', () => {
        callbacksRef.current.onDragStart?.();
      });
      listenersRef.current.dragStart = dragStartListener;

      const dragMoveListener = await HarmonyPlayer.addListener('dragMove', (data: { deltaX: number; deltaY: number }) => {
        callbacksRef.current.onDragMove?.(data.deltaX, data.deltaY);
      });
      listenersRef.current.dragMove = dragMoveListener;

      const dragEndListener = await HarmonyPlayer.addListener('dragEnd', (data: { deltaX: number; deltaY: number }) => {
        callbacksRef.current.onDragEnd?.(data.deltaX, data.deltaY);
      });
      listenersRef.current.dragEnd = dragEndListener;
    } catch (error) {
      console.error('[useNativePlayer] Failed to setup listeners:', error);
    }
  }, []);

  const playInline = useCallback(async (params: {
    playbackId: string;
    title: string;
    startTime: number;
    thumbnailUrl?: string;
    frame: { x: number; y: number; width: number; height: number };
  }) => {
    if (!isNative) return;
    
    await setupListeners();
    await HarmonyPlayer.playInline({
      playbackId: params.playbackId,
      title: params.title,
      startTime: params.startTime,
      thumbnailUrl: params.thumbnailUrl,
      frame: params.frame,
    });
  }, [setupListeners]);

  const stop = useCallback(async () => {
    if (!isNative) return;
    
    // Remove all listeners
    await Promise.all(
      Object.values(listenersRef.current).map(listener => {
        if (listener?.remove) {
          return listener.remove();
        }
        return Promise.resolve();
      })
    );
    listenersRef.current = {};
    listenersSetupRef.current = false; // Reset so listeners can be set up again
    
    await HarmonyPlayer.stop();
  }, []);

  const pause = useCallback(async () => {
    if (!isNative) return;
    await HarmonyPlayer.pause();
  }, []);

  const resume = useCallback(async () => {
    if (!isNative) return;
    await HarmonyPlayer.resume();
  }, []);

  const seek = useCallback(async (time: number) => {
    if (!isNative) return;
    await HarmonyPlayer.seek({ time });
  }, []);

  const switchContent = useCallback(async (params: {
    playbackId: string;
    title: string;
    startTime: number;
    thumbnailUrl?: string;
  }) => {
    if (!isNative) return;
    await HarmonyPlayer.switchContent({
      playbackId: params.playbackId,
      title: params.title,
      startTime: params.startTime,
      thumbnailUrl: params.thumbnailUrl,
    });
  }, []);

  const enterFullscreen = useCallback(async () => {
    if (!isNative) return;
    await HarmonyPlayer.enterFullscreen();
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (!isNative) return;
    await HarmonyPlayer.exitFullscreen();
  }, []);

  const updateFrame = useCallback(async (
    frame: { x: number; y: number; width: number; height: number },
    animated: boolean = true,
    cornerRadius: number = 0
  ) => {
    if (!isNative) return;
    await HarmonyPlayer.updateFrame({
      frame,
      animated,
      cornerRadius,
    });
  }, []);

  const setPipMode = useCallback(async (enabled: boolean) => {
    if (!isNative) return;
    await HarmonyPlayer.setPipMode({ enabled });
  }, []);

  const startNativePip = useCallback(async () => {
    if (!isNative) return;
    await HarmonyPlayer.startNativePip();
  }, []);

  const setOnTimeUpdate = useCallback((callback: (currentTime: number, duration: number) => void) => {
    callbacksRef.current.onTimeUpdate = callback;
  }, []);

  const setOnStateChange = useCallback((callback: (isPlaying: boolean) => void) => {
    callbacksRef.current.onStateChange = callback;
  }, []);

  const setOnClosed = useCallback((callback: (currentTime: number) => void) => {
    callbacksRef.current.onClosed = callback;
  }, []);

  const setOnEnded = useCallback((callback: () => void) => {
    callbacksRef.current.onEnded = callback;
  }, []);

  const setOnFullscreenChange = useCallback((callback: (isFullscreen: boolean) => void) => {
    callbacksRef.current.onFullscreenChange = callback;
  }, []);

  const setOnPipClose = useCallback((callback: () => void) => {
    callbacksRef.current.onPipClose = callback;
  }, []);

  const setOnPipTap = useCallback((callback: () => void) => {
    callbacksRef.current.onPipTap = callback;
  }, []);

  const setOnRequestPip = useCallback((callback: () => void) => {
    callbacksRef.current.onRequestPip = callback;
  }, []);

  const setOnNativePipRestore = useCallback((callback: () => void) => {
    callbacksRef.current.onNativePipRestore = callback;
  }, []);

  const setOnDragStart = useCallback((callback: () => void) => {
    callbacksRef.current.onDragStart = callback;
  }, []);

  const setOnDragMove = useCallback((callback: (deltaX: number, deltaY: number) => void) => {
    callbacksRef.current.onDragMove = callback;
  }, []);

  const setOnDragEnd = useCallback((callback: (deltaX: number, deltaY: number) => void) => {
    callbacksRef.current.onDragEnd = callback;
  }, []);

  return {
    playInline,
    stop,
    pause,
    resume,
    seek,
    switchContent,
    enterFullscreen,
    exitFullscreen,
    updateFrame,
    setPipMode,
    startNativePip,
    state,
    setOnTimeUpdate,
    setOnStateChange,
    setOnClosed,
    setOnEnded,
    setOnFullscreenChange,
    setOnPipClose,
    setOnPipTap,
    setOnRequestPip,
    setOnNativePipRestore,
    setOnDragStart,
    setOnDragMove,
    setOnDragEnd,
  };
}
