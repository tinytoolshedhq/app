import {
  FREE_CALIBRATION_LIMIT,
  FREE_RECORD_LIMIT,
  FREE_SESSION_MS,
  INACCURATE_HIGH,
  INACCURATE_LOW,
  canAddCalibration,
  canExport,
  canSaveRecord,
  canUseVibration,
  paywallReason,
  shouldAutoStopSession,
  shouldWarnInaccurate,
} from '../src/lib/gating';

describe('free record limit', () => {
  it('allows 10 free records and blocks the 11th', () => {
    expect(FREE_RECORD_LIMIT).toBe(10);
    expect(canSaveRecord({ recordCount: 9, isPro: false })).toBe(true);
    expect(canSaveRecord({ recordCount: 10, isPro: false })).toBe(false);
    expect(canSaveRecord({ recordCount: 10, isPro: true })).toBe(true);
    expect(paywallReason({ action: 'save', recordCount: 10, isPro: false })).toBe('records');
    expect(paywallReason({ action: 'save', recordCount: 9, isPro: false })).toBeNull();
  });
});

describe('5-minute session limit', () => {
  it('auto-stops free sessions at 5:00 and never stops Pro', () => {
    expect(FREE_SESSION_MS).toBe(5 * 60 * 1000);
    expect(shouldAutoStopSession({ elapsedMs: FREE_SESSION_MS - 1, isPro: false })).toBe(false);
    expect(shouldAutoStopSession({ elapsedMs: FREE_SESSION_MS, isPro: false })).toBe(true);
    expect(shouldAutoStopSession({ elapsedMs: FREE_SESSION_MS, isPro: true })).toBe(false);
    expect(paywallReason({ action: 'duration', elapsedMs: FREE_SESSION_MS, isPro: false })).toBe('duration');
  });
});

describe('calibration count', () => {
  it('allows one free calibration and blocks the second', () => {
    expect(FREE_CALIBRATION_LIMIT).toBe(1);
    expect(canAddCalibration({ calibrationCount: 1, isPro: false })).toBe(false);
    expect(canAddCalibration({ calibrationCount: 0, isPro: false })).toBe(true);
    expect(canAddCalibration({ calibrationCount: 3, isPro: true })).toBe(true);
    expect(paywallReason({ action: 'calibration', calibrationCount: 1, isPro: false })).toBe('calibration');
  });
});

describe('export and vibration', () => {
  it('are Pro-only', () => {
    expect(canExport({ isPro: false })).toBe(false);
    expect(canExport({ isPro: true })).toBe(true);
    expect(canUseVibration({ isPro: false })).toBe(false);
    expect(paywallReason({ action: 'export', isPro: false })).toBe('export');
    expect(paywallReason({ action: 'export', isPro: true })).toBeNull();
  });
});

describe('inaccurate estimate warning', () => {
  it('warns below 40 or above 95', () => {
    expect(INACCURATE_LOW).toBe(40);
    expect(INACCURATE_HIGH).toBe(95);
    expect(shouldWarnInaccurate(39)).toBe(true);
    expect(shouldWarnInaccurate(40)).toBe(false);
    expect(shouldWarnInaccurate(95)).toBe(false);
    expect(shouldWarnInaccurate(96)).toBe(true);
    expect(shouldWarnInaccurate(null)).toBe(false);
  });
});
