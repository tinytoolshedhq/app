import type { AudioPlayer } from "expo-audio";
import { cueAssets, exerciseLibrary } from "../content/exercise-index";
import type { AudioService } from "./silent";

/** Only locally registered, measured audio is played. Missing clips remain text prompts. */
export function createCueAudioService(
  player: AudioPlayer,
  onError: () => void,
): AudioService {
  let muted = false,
    active = false,
    deadline = 0,
    remaining = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cues = new Map(
    exerciseLibrary.flatMap((e) => e.voice_cues.map((c) => [c.id, c] as const)),
  );
  function clear() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function stop() {
    clear();
    player.pause();
    active = false;
    remaining = 0;
  }
  function arm(ms: number) {
    clear();
    remaining = ms;
    deadline = Date.now() + ms;
    timer = setTimeout(stop, ms);
  }
  return {
    async load() {},
    async playAt(id) {
      stop();
      const asset = cueAssets[id],
        cue = cues.get(id);
      if (muted || !asset || !cue) return;
      try {
        player.replace(asset);
        player.play();
        active = true;
        arm(cue.max_duration_seconds * 1000);
      } catch {
        stop();
        onError();
      }
    },
    async stopAll() {
      stop();
    },
    pause() {
      if (active) {
        remaining = Math.max(0, deadline - Date.now());
        clear();
        player.pause();
      }
    },
    resume() {
      if (active && !muted && remaining > 0) {
        player.play();
        arm(remaining);
      }
    },
    setMuted(value) {
      muted = value;
      if (value) stop();
    },
    onRouteChange() {
      return () => {};
    },
  };
}
