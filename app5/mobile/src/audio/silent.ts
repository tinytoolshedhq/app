export type CueLoad = {
  id: string;
  uri: string;
  atMs: number;
  maxMs: number;
};

export type RouteChange = { reason: 'oldDeviceUnavailable' | string };
export type Unsubscribe = () => void;

/**
 * Playback interface from stretch-app/IMPLEMENTATION_PLAN.md §1.
 * This slice ships a silent placeholder; real expo-audio + files drop in later.
 */
export interface AudioService {
  load(cues: CueLoad[]): Promise<void>;
  playAt(cueId: string): Promise<void>;
  stopAll(): Promise<void>;
  pause(): void;
  resume(): void;
  setMuted(muted: boolean): void;
  onRouteChange(cb: (e: RouteChange) => void): Unsubscribe;
}

/**
 * Silent no-op AudioService. No network, no TTS, no assets.
 *
 * TODO(expo-go): Expo Go does not expose AVAudioSession route-change
 * (headphone disconnect). onRouteChange never fires here. Wire
 * oldDeviceUnavailable in a native module / dev-client build, then pause
 * and stopAll from the player.
 */
export function createSilentAudioService(): AudioService {
  let muted = false;
  const routeListeners = new Set<(e: RouteChange) => void>();
  return {
    async load() {
      // PLACEHOLDER: no audio files in this slice
    },
    async playAt() {
      if (muted) return;
      // PLACEHOLDER: no-op
    },
    async stopAll() {},
    pause() {},
    resume() {},
    setMuted(value: boolean) {
      muted = value;
    },
    onRouteChange(cb) {
      routeListeners.add(cb);
      return () => { routeListeners.delete(cb); };
    },
  };
}
