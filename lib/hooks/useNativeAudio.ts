import { useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { AudioPlayer } from '@mediagrid/capacitor-native-audio';

/**
 * Unified audio player hook that uses native playback on Android
 * and falls back to HTML5 audio on iOS/Web
 */
export interface NativeAudioMetadata {
  title: string;
  artist?: string;
  album?: string;
  cover?: string | null;
  duration?: number;
}

export interface NativeAudioCallbacks {
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onStatusChange?: (isPlaying: boolean) => void;
  onEnded?: () => void;
}

const isAndroidNative = () => 
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export function useNativeAudio(
  audioId: string,
  callbacks?: NativeAudioCallbacks
) {
  const isPreparedRef = useRef(false);
  const statusListenerRef = useRef<string | null>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAndroid = isAndroidNative();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear time update interval
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }
      // Listeners are automatically cleaned up when audio is destroyed
    };
  }, []);

  const prepareAudio = useCallback(async (
    audioUrl: string,
    metadata: NativeAudioMetadata
  ): Promise<void> => {
    if (!isAndroid) {
      // Not Android - return, will use HTML5 audio
      return;
    }

    try {
      console.log('[useNativeAudio] Preparing native audio:', { audioUrl, metadata });
      
      // Create audio source with metadata for notification
      await AudioPlayer.create({
        audioSource: audioUrl,
        audioId: audioId,
        friendlyTitle: metadata.title,
        artistName: metadata.artist || 'HarmonyWatch',
        albumTitle: metadata.album || 'HarmonyWatch',
        artworkSource: metadata.cover || undefined,
        useForNotification: true,
        showSeekBackward: true,
        showSeekForward: true,
        seekBackwardTime: 10,
        seekForwardTime: 10,
      });

      // Initialize the audio (prepares it to be played)
      await AudioPlayer.initialize({ audioId });

      isPreparedRef.current = true;

      // Set up playback status change listener
      if (callbacks?.onStatusChange || callbacks?.onEnded) {
        const statusResult = await AudioPlayer.onPlaybackStatusChange(
          { audioId },
          (result) => {
            if (result.status === 'playing' && callbacks?.onStatusChange) {
              callbacks.onStatusChange(true);
            } else if (result.status === 'paused' && callbacks?.onStatusChange) {
              callbacks.onStatusChange(false);
            } else if (result.status === 'stopped' && callbacks?.onEnded) {
              callbacks.onEnded();
            }
          }
        );
        statusListenerRef.current = statusResult.callbackId;
      }

      // Set up audio end listener
      if (callbacks?.onEnded) {
        await AudioPlayer.onAudioEnd({ audioId }, () => {
          if (callbacks?.onEnded) {
            callbacks.onEnded();
          }
        });
      }

      // Set up time update polling (plugin doesn't have onTimeUpdate, so we poll)
      if (callbacks?.onTimeUpdate) {
        timeUpdateIntervalRef.current = setInterval(async () => {
          try {
            const result = await AudioPlayer.getCurrentTime({ audioId });
            if (callbacks?.onTimeUpdate) {
              callbacks.onTimeUpdate(result.currentTime);
            }
          } catch (error) {
            console.error('[useNativeAudio] Failed to get current time:', error);
          }
        }, 500); // Poll every 500ms
      }

      // Get initial duration when audio is ready
      if (callbacks?.onDurationChange) {
        await AudioPlayer.onAudioReady({ audioId }, async () => {
          try {
            const result = await AudioPlayer.getDuration({ audioId });
            if (callbacks?.onDurationChange && result.duration > 0) {
              callbacks.onDurationChange(result.duration);
            }
          } catch (error) {
            console.warn('[useNativeAudio] Failed to get duration:', error);
          }
        });
      }

      console.log('[useNativeAudio] Audio prepared successfully');
    } catch (error) {
      console.error('[useNativeAudio] Failed to prepare audio:', error);
      throw error;
    }
  }, [isAndroid, audioId, callbacks]);

  const play = useCallback(async (): Promise<void> => {
    if (!isAndroid || !isPreparedRef.current) {
      return;
    }

    try {
      await AudioPlayer.play({ audioId });
      console.log('[useNativeAudio] Play called');
    } catch (error) {
      console.error('[useNativeAudio] Play failed:', error);
      throw error;
    }
  }, [isAndroid, audioId]);

  const pause = useCallback(async (): Promise<void> => {
    if (!isAndroid || !isPreparedRef.current) {
      return;
    }

    try {
      await AudioPlayer.pause({ audioId });
      console.log('[useNativeAudio] Pause called');
    } catch (error) {
      console.error('[useNativeAudio] Pause failed:', error);
      throw error;
    }
  }, [isAndroid, audioId]);

  const seekTo = useCallback(async (time: number): Promise<void> => {
    if (!isAndroid || !isPreparedRef.current) {
      return;
    }

    try {
      await AudioPlayer.seek({ audioId, timeInSeconds: time });
      console.log('[useNativeAudio] Seek to:', time);
    } catch (error) {
      console.error('[useNativeAudio] Seek failed:', error);
      throw error;
    }
  }, [isAndroid, audioId]);

  const getCurrentTime = useCallback(async (): Promise<number> => {
    if (!isAndroid || !isPreparedRef.current) {
      return 0;
    }

    try {
      const result = await AudioPlayer.getCurrentTime({ audioId });
      return result.currentTime;
    } catch (error) {
      console.error('[useNativeAudio] GetCurrentTime failed:', error);
      return 0;
    }
  }, [isAndroid, audioId]);

  const getDuration = useCallback(async (): Promise<number> => {
    if (!isAndroid || !isPreparedRef.current) {
      return 0;
    }

    try {
      const result = await AudioPlayer.getDuration({ audioId });
      return result.duration;
    } catch (error) {
      console.error('[useNativeAudio] GetDuration failed:', error);
      return 0;
    }
  }, [isAndroid, audioId]);

  const destroy = useCallback(async (): Promise<void> => {
    if (!isAndroid || !isPreparedRef.current) {
      return;
    }

    try {
      // Clear time update interval
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }

      // Destroy audio (listeners are automatically cleaned up)
      await AudioPlayer.destroy({ audioId });
      isPreparedRef.current = false;
      statusListenerRef.current = null;
      console.log('[useNativeAudio] Audio destroyed');
    } catch (error) {
      console.error('[useNativeAudio] Destroy failed:', error);
    }
  }, [isAndroid, audioId]);

  return {
    isAndroidNative: isAndroid,
    isPrepared: isPreparedRef.current,
    prepareAudio,
    play,
    pause,
    seekTo,
    getCurrentTime,
    getDuration,
    destroy,
  };
}
