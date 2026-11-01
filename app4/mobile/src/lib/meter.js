/**
 * Pure mapping from expo-audio recorder metering (dBFS) to a display estimate.
 *
 * expo-audio `RecorderState.metering` is dBFS, typically about -160 (silence
 * sentinel) to 0 (near clipping). It is not A-weighted SPL.
 *
 * displayDb = clamp(dBFS + 100 + offset, 0, 140)
 *
 * Smoothing and session max/avg run in *base* space (dBFS + 100) so changing
 * the calibration offset mid-session remaps the on-screen current/max/avg
 * without resetting count, sum, or max. Offset is applied only at display
 * time (then clamped to 0..140). Avg is the arithmetic mean of those remapped
 * smoothed values, not an energy average. Native -160 dBFS sentinels are
 * ignored. No sample history is kept (running sum / count / max).
 *
 * On Stop the last smoothed *base* value is frozen (not replaced by the last
 * raw sample). This is an estimate, not a professional or legal-grade
 * measurement.
 */

export const OFFSET_BASE = 100;
export const DISPLAY_MIN = 0;
export const DISPLAY_MAX = 140;
export const OFFSET_MIN = -20;
export const OFFSET_MAX = 20;
export const DEFAULT_SMOOTH_ALPHA = 0.35;
export const DBFS_SILENCE = -160;

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function clampOffset(offset) {
  const n = Math.round(Number(offset));
  if (!Number.isFinite(n)) return 0;
  return clamp(n, OFFSET_MIN, OFFSET_MAX);
}

export function isValidDbfs(dbfs) {
  return Number.isFinite(dbfs);
}

/** Skip native silence / not-yet-ready sentinels so they do not flash 0 dB. */
export function isUsableMeteringSample(dbfs) {
  return Number.isFinite(dbfs) && dbfs > DBFS_SILENCE;
}

/** dBFS + 100, unclamped. Offset is applied later so calibration can remap. */
export function mapDbfsToBaseDb(dbfs) {
  if (!isUsableMeteringSample(dbfs)) return null;
  return dbfs + OFFSET_BASE;
}

/** Apply the calibration offset and clamp to the 0..140 display range. */
export function applyOffset(baseDb, offset = 0) {
  if (!Number.isFinite(baseDb)) return null;
  return clamp(baseDb + clampOffset(offset), DISPLAY_MIN, DISPLAY_MAX);
}

/** Map one dBFS sample to a clamped display dB using the documented formula. */
export function mapDbfsToDisplayDb(dbfs, offset = 0) {
  return applyOffset(mapDbfsToBaseDb(dbfs), offset);
}

/**
 * Exponential moving average on display dB.
 * First finite sample becomes the value; invalid next keeps previous.
 */
export function smoothLevel(previous, next, alpha = DEFAULT_SMOOTH_ALPHA) {
  if (!Number.isFinite(next)) return Number.isFinite(previous) ? previous : null;
  if (!Number.isFinite(previous)) return next;
  const a = clamp(alpha, 0, 1);
  return previous + a * (next - previous);
}

export function createSession() {
  return { count: 0, sum: 0, max: null, min: null };
}

/** Accumulate one smoothed base dB (pre-offset) into O(1) running stats. */
export function addDisplaySample(session, displayDb) {
  const base = session && typeof session.count === 'number' ? session : createSession();
  if (!Number.isFinite(displayDb)) return base;
  return {
    count: base.count + 1,
    sum: base.sum + displayDb,
    max: base.max == null ? displayDb : Math.max(base.max, displayDb),
    min: base.min == null ? displayDb : Math.min(base.min, displayDb),
  };
}

export function sessionDisplayStats(session, offset = 0) {
  if (!session || !session.count) return { max: null, min: null, avg: null, count: 0 };
  return {
    max: applyOffset(session.max, offset),
    min: applyOffset(session.min, offset),
    avg: applyOffset(session.sum / session.count, offset),
    count: session.count,
  };
}

export function formatDuration(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * One metering tick while running: smooth the *base* (pre-offset) sample and
 * fold it into session max/avg. Offset is not applied here so calibration
 * changes do not reset the session. Stop must not call this with a final
 * raw sample.
 */
export function tickMeter(state, dbfs) {
  const prev = state && typeof state === 'object' ? state : { smoothed: null, session: createSession() };
  const session = prev.session || createSession();
  const mapped = mapDbfsToBaseDb(dbfs);
  const smoothed = smoothLevel(prev.smoothed, mapped);
  return {
    smoothed,
    session:
      Number.isFinite(mapped) && Number.isFinite(smoothed)
        ? addDisplaySample(session, smoothed)
        : session,
  };
}

/** Stop: keep the last on-screen smoothed value; do not snap to last raw. */
export function freezeMeter(state) {
  return {
    smoothed: state && Number.isFinite(state.smoothed) ? state.smoothed : null,
    session: (state && state.session) || createSession(),
  };
}

export function gaugeFill(displayDb) {
  if (!Number.isFinite(displayDb)) return 0;
  return clamp(displayDb / DISPLAY_MAX, 0, 1);
}

/** Quiet / moderate / loud fill colors for the bar (not a calibrated scale). */
export function gaugeColor(displayDb) {
  if (!Number.isFinite(displayDb)) return '#C9C3BB';
  if (displayDb < 60) return '#3F8A57';
  if (displayDb < 85) return '#C48A1A';
  return '#C65B45';
}

export function formatDb(displayDb) {
  if (!Number.isFinite(displayDb)) return '—';
  return String(Math.round(displayDb));
}

export function formatOffset(offset) {
  const n = clampOffset(offset);
  if (n > 0) return `+${n}`;
  return String(n);
}
