import { KeyValueStorage } from './storage';
import { clamp, clampOffset } from '../lib/meter';
import { canAddCalibration } from '../lib/gating';
import { isProUnlocked } from '../lib/entitlements';

const storage = new KeyValueStorage();
export const PREFS_KEY = 'prefs/v1';
export const DEFAULT_CALIBRATION_ID = 'default';
export const VIBRATION_MIN = 40;
export const VIBRATION_MAX = 140;
export const DEFAULT_VIBRATION_THRESHOLD = 85;

function defaultCalibrations(offset = 0) {
  return [{ id: DEFAULT_CALIBRATION_ID, name: '', offset: clampOffset(offset) }];
}

const DEFAULTS = {
  offset: 0,
  calibrations: defaultCalibrations(0),
  activeCalibrationId: DEFAULT_CALIBRATION_ID,
  vibrationEnabled: false,
  vibrationThreshold: DEFAULT_VIBRATION_THRESHOLD,
};

let prefs = clonePrefs(DEFAULTS);
let initialized = false;
const listeners = new Set();

function clonePrefs(src) {
  return {
    ...src,
    calibrations: (src.calibrations || []).map((c) => ({ ...c })),
  };
}

function notify() {
  for (const l of listeners) l(prefs);
}

function newCalId() {
  return `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeCalibration(raw, fallbackOffset = 0) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newCalId(),
    name: typeof raw.name === 'string' ? raw.name : '',
    offset: clampOffset(raw.offset ?? fallbackOffset),
  };
}

function freeLimitError() {
  const err = new Error('FREE_LIMIT');
  err.code = 'FREE_LIMIT';
  err.kind = 'calibration';
  return err;
}

function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const offset = clampOffset(src.offset);
  let calibrations = Array.isArray(src.calibrations)
    ? src.calibrations.map((c) => normalizeCalibration(c, offset)).filter(Boolean)
    : [];
  if (!calibrations.length) {
    calibrations = defaultCalibrations(offset);
  }
  const active = calibrations.find((c) => c.id === src.activeCalibrationId) || calibrations[0];
  const threshold = Number(src.vibrationThreshold);
  return {
    offset: active.offset,
    calibrations,
    activeCalibrationId: active.id,
    vibrationEnabled: src.vibrationEnabled === true,
    vibrationThreshold: Number.isFinite(threshold)
      ? clamp(Math.round(threshold), VIBRATION_MIN, VIBRATION_MAX)
      : DEFAULT_VIBRATION_THRESHOLD,
  };
}

export async function initPrefs() {
  if (initialized) return prefs;
  try {
    const raw = await storage.getItem(PREFS_KEY);
    if (raw) {
      prefs = normalize(JSON.parse(raw));
    }
  } catch {
    prefs = clonePrefs(DEFAULTS);
  }
  initialized = true;
  notify();
  return prefs;
}

export function getPrefs() {
  return prefs;
}

export function getOffset() {
  return prefs.offset;
}

export function getActiveCalibration() {
  return prefs.calibrations.find((c) => c.id === prefs.activeCalibrationId) || prefs.calibrations[0];
}

export function subscribePrefs(cb) {
  listeners.add(cb);
  cb(prefs);
  return () => listeners.delete(cb);
}

export async function updatePrefs(patch) {
  prefs = normalize({ ...prefs, ...patch });
  await storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  notify();
  return prefs;
}

export async function setOffset(offset) {
  const next = clampOffset(offset);
  const calibrations = prefs.calibrations.map((c) => (
    c.id === prefs.activeCalibrationId ? { ...c, offset: next } : c
  ));
  return updatePrefs({ offset: next, calibrations });
}

export async function selectCalibration(id) {
  const hit = prefs.calibrations.find((c) => c.id === id);
  if (!hit) return prefs;
  return updatePrefs({ activeCalibrationId: hit.id, offset: hit.offset });
}

export async function renameCalibration(id, name) {
  const calibrations = prefs.calibrations.map((c) => (
    c.id === id ? { ...c, name: String(name || '') } : c
  ));
  return updatePrefs({ calibrations });
}

export async function addCalibration(name = '', offset = 0) {
  const isPro = await isProUnlocked();
  if (!canAddCalibration({ calibrationCount: prefs.calibrations.length, isPro })) {
    throw freeLimitError();
  }
  const cal = {
    id: newCalId(),
    name: String(name || ''),
    offset: clampOffset(offset),
  };
  return updatePrefs({
    calibrations: [...prefs.calibrations, cal],
    activeCalibrationId: cal.id,
    offset: cal.offset,
  });
}

export async function removeCalibration(id) {
  if (prefs.calibrations.length <= 1) return prefs;
  const calibrations = prefs.calibrations.filter((c) => c.id !== id);
  const active = calibrations.find((c) => c.id === prefs.activeCalibrationId) || calibrations[0];
  return updatePrefs({
    calibrations,
    activeCalibrationId: active.id,
    offset: active.offset,
  });
}

export async function setVibrationEnabled(enabled) {
  return updatePrefs({ vibrationEnabled: !!enabled });
}

export async function setVibrationThreshold(value) {
  return updatePrefs({ vibrationThreshold: value });
}

export async function resetPrefsForTests() {
  initialized = false;
  prefs = clonePrefs(DEFAULTS);
  notify();
}
