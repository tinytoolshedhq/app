/** Free vs Full Pack gates. Pure — no I/O. */

export const FREE_RECORD_LIMIT = 10;
export const FREE_SESSION_MS = 5 * 60 * 1000;
export const FREE_CALIBRATION_LIMIT = 1;
export const INACCURATE_LOW = 40;
export const INACCURATE_HIGH = 95;

export function canSaveRecord({ recordCount = 0, isPro = false } = {}) {
  return isPro === true || Number(recordCount) < FREE_RECORD_LIMIT;
}

export function canAddCalibration({ calibrationCount = 0, isPro = false } = {}) {
  return isPro === true || Number(calibrationCount) < FREE_CALIBRATION_LIMIT;
}

export function canExport({ isPro = false } = {}) {
  return isPro === true;
}

export function canEditNote({ isPro = false } = {}) {
  return isPro === true;
}

export function canUseVibration({ isPro = false } = {}) {
  return isPro === true;
}

export function canMeasureWithoutLimit({ isPro = false } = {}) {
  return isPro === true;
}

export function shouldAutoStopSession({ elapsedMs = 0, isPro = false } = {}) {
  if (isPro === true) return false;
  return Number(elapsedMs) >= FREE_SESSION_MS;
}

export function shouldWarnInaccurate(displayDb) {
  if (!Number.isFinite(displayDb)) return false;
  return displayDb > INACCURATE_HIGH || displayDb < INACCURATE_LOW;
}

/**
 * Paywall is shown only for these actions. Null = allowed.
 * @param {{ action: 'save'|'export'|'duration'|'calibration', recordCount?: number, calibrationCount?: number, elapsedMs?: number, isPro?: boolean }} args
 */
export function paywallReason({
  action,
  recordCount = 0,
  calibrationCount = 0,
  elapsedMs = 0,
  isPro = false,
} = {}) {
  if (isPro === true) return null;
  if (action === 'save' && !canSaveRecord({ recordCount, isPro })) return 'records';
  if (action === 'export') return 'export';
  if (action === 'duration' && shouldAutoStopSession({ elapsedMs, isPro })) return 'duration';
  if (action === 'calibration' && !canAddCalibration({ calibrationCount, isPro })) return 'calibration';
  return null;
}
