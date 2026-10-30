import AsyncStorage from '@react-native-async-storage/async-storage';
import { DURATION_OPTIONS_SECONDS, WHOLE_BODY_ID } from '../content';

const PREFS_KEY = 'stretch/prefs/v1';

export type StretchPrefs = {
  position: string;
  bodyRegion: string;
  durationSeconds: number;
  voiceEnabled: boolean;
};

export const DEFAULT_PREFS: StretchPrefs = {
  position: 'sitting',
  bodyRegion: WHOLE_BODY_ID,
  durationSeconds: 180,
  voiceEnabled: true,
};

let prefs: StretchPrefs = { ...DEFAULT_PREFS };
let initialized = false;
const listeners = new Set<(p: StretchPrefs) => void>();

function notify() {
  for (const l of listeners) l(prefs);
}

function sanitize(raw: unknown): StretchPrefs {
  const src = raw && typeof raw === 'object' ? raw as Partial<StretchPrefs> : {};
  const durationSeconds = Number(src.durationSeconds);
  return {
    position: typeof src.position === 'string' && src.position ? src.position : DEFAULT_PREFS.position,
    bodyRegion: typeof src.bodyRegion === 'string' && src.bodyRegion ? src.bodyRegion : DEFAULT_PREFS.bodyRegion,
    durationSeconds: (DURATION_OPTIONS_SECONDS as readonly number[]).includes(durationSeconds)
      ? durationSeconds
      : DEFAULT_PREFS.durationSeconds,
    voiceEnabled: src.voiceEnabled !== false,
  };
}

export async function initPrefs(): Promise<StretchPrefs> {
  if (initialized) return prefs;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) prefs = sanitize(JSON.parse(raw));
  } catch {
    prefs = { ...DEFAULT_PREFS };
  }
  initialized = true;
  notify();
  return prefs;
}

export function getPrefs(): StretchPrefs {
  return prefs;
}

export function subscribePrefs(cb: (p: StretchPrefs) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export async function updatePrefs(patch: Partial<StretchPrefs>): Promise<StretchPrefs> {
  prefs = sanitize({ ...prefs, ...patch });
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  notify();
  return prefs;
}

export async function resetPrefsForTests(): Promise<void> {
  initialized = false;
  prefs = { ...DEFAULT_PREFS };
  await AsyncStorage.removeItem(PREFS_KEY);
  notify();
}
