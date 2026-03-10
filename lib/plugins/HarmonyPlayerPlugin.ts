import { registerPlugin } from '@capacitor/core';

export interface HarmonyPlayerPlugin {
  play(options: {
    playbackId: string;
    title?: string;
    startTime?: number;
    thumbnailUrl?: string;
  }): Promise<void>;
  
  playInline(options: {
    playbackId: string;
    title?: string;
    startTime?: number;
    thumbnailUrl?: string;
    frame: { x: number; y: number; width: number; height: number };
  }): Promise<void>;
  
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  seek(options: { time: number }): Promise<void>;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  updateFrame(options: {
    frame: { x: number; y: number; width: number; height: number };
    animated?: boolean;
    cornerRadius?: number;
  }): Promise<void>;
  setPipMode(options: { enabled: boolean }): Promise<void>;
  switchContent(options: {
    playbackId: string;
    title?: string;
    startTime?: number;
    thumbnailUrl?: string;
  }): Promise<void>;
  startNativePip(): Promise<void>;
  
  addListener(
    eventName: 'timeUpdate',
    listenerFunc: (data: { currentTime: number; duration: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'stateChange',
    listenerFunc: (data: { isPlaying: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'ended',
    listenerFunc: () => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'closed',
    listenerFunc: (data: { currentTime: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'fullscreenChange',
    listenerFunc: (data: { isFullscreen: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'pipClose',
    listenerFunc: () => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'pipTap',
    listenerFunc: () => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'requestPip',
    listenerFunc: () => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'airPlayChange',
    listenerFunc: (data: { isActive: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'nativePipChange',
    listenerFunc: (data: { isActive: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'nativePipRestore',
    listenerFunc: () => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'dragStart',
    listenerFunc: () => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'dragMove',
    listenerFunc: (data: { deltaX: number; deltaY: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  
  addListener(
    eventName: 'dragEnd',
    listenerFunc: (data: { deltaX: number; deltaY: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const HarmonyPlayer = registerPlugin<HarmonyPlayerPlugin>('HarmonyPlayer', {
  web: () => import('./HarmonyPlayerPlugin.web').then(m => new m.HarmonyPlayerPluginWeb()),
});

export { HarmonyPlayer };
