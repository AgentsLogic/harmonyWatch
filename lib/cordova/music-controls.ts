type MusicControlAction =
  | "music-controls-pause"
  | "music-controls-play"
  | "music-controls-next"
  | "music-controls-previous"
  | "music-controls-seek-to"
  | "music-controls-destroy";

type MusicControlHandler = (action: MusicControlAction, position?: number) => void;

type MusicControlMetadata = {
  title: string;
  artist?: string;
  album?: string;
  cover?: string | null;
  duration?: number;
  elapsed?: number;
  isPlaying: boolean;
};

declare global {
  interface Window {
    MusicControls?: {
      create: (options: Record<string, unknown>, onSuccess?: () => void, onError?: (error: unknown) => void) => void;
      destroy: () => void;
      listen: () => void;
      subscribe: (callback: (action: MusicControlAction, args?: { position?: number }) => void) => void;
      updateIsPlaying: (isPlaying: boolean) => void;
      updateElapsed: (args: { elapsed: number; isPlaying: boolean }) => void;
    };
    cordova?: unknown;
  }
}

const isCordovaEnvironment = () => typeof window !== "undefined" && !!window.cordova;

export const isMusicControlsAvailable = () =>
  isCordovaEnvironment() && typeof window.MusicControls !== "undefined";

export function initMusicControls(metadata: MusicControlMetadata, handler: MusicControlHandler) {
  if (!isMusicControlsAvailable()) {
    return () => undefined;
  }

  const controls = window.MusicControls!;

  controls.destroy();
  controls.create(
    {
      track: metadata.title,
      artist: metadata.artist ?? "HarmonyWatch",
      album: metadata.album ?? "HarmonyWatch",
      cover: metadata.cover ?? undefined,
      isPlaying: metadata.isPlaying,
      duration: metadata.duration ?? 0,
      elapsed: metadata.elapsed ?? 0,
      hasScrubbing: true,
      dismissable: false,
    },
    () => console.log("[MusicControls] created"),
    (error) => console.warn("[MusicControls] failed to create", error)
  );

  controls.subscribe((action, args) => {
    const position = args?.position;
    handler(action, position);
  });
  controls.listen();

  return () => {
    try {
      window.MusicControls?.destroy();
    } catch (error) {
      console.warn("[MusicControls] destroy failed", error);
    }
  };
}

export function updatePlaybackState(isPlaying: boolean) {
  if (!isMusicControlsAvailable()) return;
  try {
    window.MusicControls?.updateIsPlaying(isPlaying);
  } catch (error) {
    console.warn("[MusicControls] updateIsPlaying failed", error);
  }
}

export function updateElapsed(elapsed: number, isPlaying: boolean) {
  if (!isMusicControlsAvailable()) return;
  try {
    window.MusicControls?.updateElapsed({ elapsed, isPlaying });
  } catch (error) {
    console.warn("[MusicControls] updateElapsed failed", error);
  }
}

export function destroyMusicControls() {
  if (!isMusicControlsAvailable()) return;
  try {
    window.MusicControls?.destroy();
  } catch (error) {
    console.warn("[MusicControls] destroy failed", error);
  }
}

