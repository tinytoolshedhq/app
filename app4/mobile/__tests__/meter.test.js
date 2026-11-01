import fs from 'fs';
import path from 'path';
import {
  OFFSET_BASE,
  DISPLAY_MIN,
  DISPLAY_MAX,
  OFFSET_MIN,
  OFFSET_MAX,
  DBFS_SILENCE,
  clamp,
  clampOffset,
  isValidDbfs,
  isUsableMeteringSample,
  mapDbfsToBaseDb,
  mapDbfsToDisplayDb,
  applyOffset,
  smoothLevel,
  createSession,
  addDisplaySample,
  sessionDisplayStats,
  tickMeter,
  freezeMeter,
  gaugeFill,
  gaugeColor,
  formatDb,
  formatDuration,
  formatOffset,
} from '../src/lib/meter';

describe('meter module isolation', () => {
  it('does not import react, expo, or native modules', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/lib/meter.js'), 'utf8');
    expect(src).not.toMatch(/from ['"]react(?:-native)?['"]/);
    expect(src).not.toMatch(/from ['"]expo/);
    expect(src).not.toMatch(/require\(/);
  });
});

describe('clamp', () => {
  it('clamps to inclusive bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('treats non-finite as min', () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(clamp(Infinity, 0, 10)).toBe(0);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
    expect(clamp(undefined, 2, 8)).toBe(2);
  });
});

describe('clampOffset', () => {
  it('stays within -20..+20 and rounds to a whole dB', () => {
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(-20)).toBe(OFFSET_MIN);
    expect(clampOffset(20)).toBe(OFFSET_MAX);
    expect(clampOffset(-21)).toBe(-20);
    expect(clampOffset(21)).toBe(20);
    expect(clampOffset(1.4)).toBe(1);
    expect(clampOffset(1.5)).toBe(2);
    expect(clampOffset('3')).toBe(3);
    expect(clampOffset(NaN)).toBe(0);
    expect(clampOffset(null)).toBe(0);
  });
});

describe('mapDbfsToDisplayDb', () => {
  it('uses displayDb = clamp(dBFS + 100 + offset, 0, 140)', () => {
    expect(OFFSET_BASE).toBe(100);
    expect(DISPLAY_MIN).toBe(0);
    expect(DISPLAY_MAX).toBe(140);
    expect(mapDbfsToDisplayDb(0, 0)).toBe(100);
    expect(mapDbfsToDisplayDb(-40, 0)).toBe(60);
    expect(mapDbfsToDisplayDb(-10, 5)).toBe(95);
    expect(mapDbfsToDisplayDb(-10, -5)).toBe(85);
  });

  it('clamps clipping to the display range', () => {
    expect(mapDbfsToDisplayDb(0, 20)).toBe(120);
    expect(mapDbfsToDisplayDb(50, 0)).toBe(140);
  });

  it('treats -160 dBFS silence as no reading (not 0 dB)', () => {
    expect(isUsableMeteringSample(DBFS_SILENCE)).toBe(false);
    expect(isUsableMeteringSample(-160)).toBe(false);
    expect(isUsableMeteringSample(-159)).toBe(true);
    expect(mapDbfsToDisplayDb(-160, 0)).toBeNull();
    expect(mapDbfsToDisplayDb(-160, -20)).toBeNull();
    expect(formatDb(mapDbfsToDisplayDb(-160, 0))).toBe('—');
  });

  it('returns null for invalid metering samples', () => {
    expect(isValidDbfs(undefined)).toBe(false);
    expect(mapDbfsToBaseDb(undefined)).toBeNull();
    expect(mapDbfsToDisplayDb(undefined, 0)).toBeNull();
    expect(mapDbfsToDisplayDb(null, 0)).toBeNull();
    expect(mapDbfsToDisplayDb(NaN, 0)).toBeNull();
    expect(mapDbfsToDisplayDb('loud', 0)).toBeNull();
  });

  it('keeps base dB unclamped so a later offset remap stays exact', () => {
    expect(mapDbfsToBaseDb(-95)).toBe(5);
    expect(applyOffset(5, 0)).toBe(5);
    expect(applyOffset(5, -10)).toBe(0);
    expect(applyOffset(5, 20)).toBe(25);
    expect(applyOffset(130, 20)).toBe(140);
    expect(applyOffset(null, 4)).toBeNull();
  });

  it('clamps out-of-range offset before mapping', () => {
    expect(mapDbfsToDisplayDb(-40, 99)).toBe(80);
    expect(mapDbfsToDisplayDb(-40, -99)).toBe(40);
  });
});

describe('smoothLevel', () => {
  it('returns the first finite sample', () => {
    expect(smoothLevel(null, 60, 0.35)).toBe(60);
    expect(smoothLevel(undefined, 40)).toBe(40);
  });

  it('blends toward the next sample', () => {
    expect(smoothLevel(0, 100, 0.25)).toBe(25);
    expect(smoothLevel(80, 100, 0.5)).toBe(90);
  });

  it('keeps previous when the next sample is invalid', () => {
    expect(smoothLevel(55, NaN)).toBe(55);
    expect(smoothLevel(55, undefined)).toBe(55);
    expect(smoothLevel(null, undefined)).toBeNull();
  });
});

describe('session max/avg', () => {
  it('starts empty and formats as em dash', () => {
    expect(createSession()).toEqual({ count: 0, sum: 0, max: null, min: null });
    expect(sessionDisplayStats(createSession(), 0)).toEqual({ max: null, min: null, avg: null, count: 0 });
    expect(formatDb(null)).toBe('—');
  });

  it('keeps O(1) running stats instead of a sample log', () => {
    let session = createSession();
    for (let i = 0; i < 5000; i += 1) {
      session = addDisplaySample(session, 40 + (i % 3));
    }
    expect(Object.keys(session).sort()).toEqual(['count', 'max', 'min', 'sum']);
    expect(session.count).toBe(5000);
    expect(session.samples).toBeUndefined();
  });

  it('uses the same smoothed display series for current, max, and avg', () => {
    let state = { smoothed: null, session: createSession() };
    const dbfsList = [-60, -60, -60, -8];
    const smoothedSeries = [];
    dbfsList.forEach((dbfs) => {
      state = tickMeter(state, dbfs);
      smoothedSeries.push(state.smoothed);
    });
    const rawLast = mapDbfsToDisplayDb(-8, 0);
    expect(rawLast).toBe(92);
    expect(state.smoothed).toBeLessThan(rawLast);
    expect(state.smoothed).toBeCloseTo(58.2, 5);
    const stats = sessionDisplayStats(state.session);
    expect(stats.max).toBe(Math.max(...smoothedSeries));
    expect(stats.max).toBeCloseTo(state.smoothed, 5);
    expect(stats.max).toBeLessThan(rawLast);
    expect(stats.avg).toBeCloseTo(smoothedSeries.reduce((a, b) => a + b, 0) / smoothedSeries.length, 5);
    expect(Object.keys(state.session).sort()).toEqual(['count', 'max', 'min', 'sum']);
  });

  it('freezes the last smoothed value on stop instead of the last raw sample', () => {
    let state = { smoothed: null, session: createSession() };
    state = tickMeter(state, -60);
    state = tickMeter(state, -60);
    state = tickMeter(state, -13);
    const shown = state.smoothed;
    const rawLast = mapDbfsToDisplayDb(-13, 0);
    expect(rawLast).toBe(87);
    expect(shown).toBeLessThan(rawLast);
    const frozen = freezeMeter(state);
    expect(frozen.smoothed).toBe(shown);
    expect(frozen.smoothed).not.toBe(rawLast);
    expect(frozen.session).toEqual(state.session);
    const afterStopRaw = tickMeter(frozen, 0);
    expect(freezeMeter(frozen).smoothed).toBe(shown);
    expect(afterStopRaw.smoothed).not.toBe(shown);
  });

  it('ignores -160 sentinels so a 0 dB floor does not pull avg down', () => {
    let state = { smoothed: null, session: createSession() };
    state = tickMeter(state, -160);
    state = tickMeter(state, -160);
    state = tickMeter(state, -67);
    state = tickMeter(state, -31);
    expect(mapDbfsToDisplayDb(-67, -20)).toBe(13);
    expect(mapDbfsToDisplayDb(-31, -20)).toBe(49);
    const stats = sessionDisplayStats(state.session, -20);
    expect(stats.count).toBe(2);
    expect(stats.max).toBe(applyOffset(state.session.max, -20));
    expect(stats.max).toBeLessThanOrEqual(49);
  });

  it('ignores invalid samples', () => {
    let session = addDisplaySample(createSession(), 60);
    session = addDisplaySample(session, undefined);
    session = addDisplaySample(session, NaN);
    expect(session.count).toBe(1);
    expect(sessionDisplayStats(session).max).toBe(60);
  });

  it('does not re-count the frozen reading when a sentinel arrives', () => {
    let state = tickMeter({ smoothed: null, session: createSession() }, -40);
    expect(state.session.count).toBe(1);
    state = tickMeter(state, -160);
    expect(state.smoothed).toBe(60);
    expect(state.session.count).toBe(1);
  });

  it('does not reset session max/avg when calibration offset changes', () => {
    let state = { smoothed: null, session: createSession() };
    state = tickMeter(state, -40);
    state = tickMeter(state, -30);
    const internals = { ...state.session };
    expect(internals.count).toBe(2);
    expect(internals.max).toBeCloseTo(state.smoothed, 5);

    const atZero = sessionDisplayStats(state.session, 0);
    const atPlus = sessionDisplayStats(state.session, 5);
    const atMinus = sessionDisplayStats(state.session, -8);

    expect(atPlus.count).toBe(2);
    expect(atMinus.count).toBe(2);
    expect(atPlus.max).toBeCloseTo(atZero.max + 5, 5);
    expect(atPlus.avg).toBeCloseTo(atZero.avg + 5, 5);
    expect(atMinus.max).toBeCloseTo(atZero.max - 8, 5);
    expect(applyOffset(state.smoothed, 5)).toBeCloseTo(atZero.max + 5, 5);
    expect(state.session).toEqual(internals);

    state = tickMeter(state, -30);
    expect(state.session.count).toBe(3);
    expect(sessionDisplayStats(state.session, 5).count).toBe(3);
  });
});

describe('gauge and format helpers', () => {
  it('fills 0..1 against the 140 dB scale', () => {
    expect(gaugeFill(null)).toBe(0);
    expect(gaugeFill(0)).toBe(0);
    expect(gaugeFill(70)).toBe(0.5);
    expect(gaugeFill(140)).toBe(1);
    expect(gaugeFill(200)).toBe(1);
  });

  it('uses three functional colors', () => {
    expect(gaugeColor(null)).toBe('#C9C3BB');
    expect(gaugeColor(20)).toBe('#3F8A57');
    expect(gaugeColor(70)).toBe('#C48A1A');
    expect(gaugeColor(100)).toBe('#C65B45');
  });

  it('formats display and offset', () => {
    expect(formatDb(null)).toBe('—');
    expect(formatDb(62.4)).toBe('62');
    expect(formatDb(62.6)).toBe('63');
    expect(formatOffset(0)).toBe('0');
    expect(formatOffset(4)).toBe('+4');
    expect(formatOffset(-3)).toBe('-3');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5 * 60 * 1000)).toBe('5:00');
    expect(formatDuration(65_000)).toBe('1:05');
  });
});
