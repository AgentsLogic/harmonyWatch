import { WebPlugin } from '@capacitor/core';
import type { HarmonyPlayerPlugin } from './HarmonyPlayerPlugin';

export class HarmonyPlayerPluginWeb extends WebPlugin implements HarmonyPlayerPlugin {
  async play(): Promise<void> {
    throw this.unimplemented('play is not implemented on web');
  }
  
  async playInline(): Promise<void> {
    throw this.unimplemented('playInline is not implemented on web');
  }
  
  async pause(): Promise<void> {
    throw this.unimplemented('pause is not implemented on web');
  }
  
  async resume(): Promise<void> {
    throw this.unimplemented('resume is not implemented on web');
  }
  
  async stop(): Promise<void> {
    throw this.unimplemented('stop is not implemented on web');
  }
  
  async seek(): Promise<void> {
    throw this.unimplemented('seek is not implemented on web');
  }
  
  async enterFullscreen(): Promise<void> {
    throw this.unimplemented('enterFullscreen is not implemented on web');
  }
  
  async exitFullscreen(): Promise<void> {
    throw this.unimplemented('exitFullscreen is not implemented on web');
  }
  
  async updateFrame(): Promise<void> {
    throw this.unimplemented('updateFrame is not implemented on web');
  }
  
  async setPipMode(): Promise<void> {
    throw this.unimplemented('setPipMode is not implemented on web');
  }
  
  async switchContent(): Promise<void> {
    throw this.unimplemented('switchContent is not implemented on web');
  }
  
  async startNativePip(): Promise<void> {
    throw this.unimplemented('startNativePip is not implemented on web');
  }
  
  async addListener(): Promise<{ remove: () => Promise<void> }> {
    return Promise.resolve({ remove: async () => {} });
  }
}
