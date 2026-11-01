import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveRecord, getRecords, initRecords, resetRecordsForTests } from '../src/data/records';
import { setProUnlocked, clearProUnlocked } from '../src/lib/entitlements';
import { FREE_RECORD_LIMIT } from '../src/lib/gating';
import { csvEscape, recordsToCsv, recordsToHtml } from '../src/lib/export';

describe('records repository', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetRecordsForTests();
    await clearProUnlocked();
    await initRecords();
  });

  it('saves up to 10 free records then throws FREE_LIMIT', async () => {
    for (let i = 0; i < FREE_RECORD_LIMIT; i += 1) {
      await saveRecord({ current: 50 + i, max: 60, avg: 55, min: 40, durationMs: 1000 });
    }
    expect(getRecords()).toHaveLength(10);
    await expect(saveRecord({ current: 70 })).rejects.toMatchObject({ code: 'FREE_LIMIT' });
    expect(getRecords()).toHaveLength(10);
  });

  it('allows Pro to save past 10 and ignores notes on write', async () => {
    await setProUnlocked(true);
    for (let i = 0; i < 11; i += 1) {
      await saveRecord({ current: 50, note: 'n' });
    }
    expect(getRecords()).toHaveLength(11);
    expect(getRecords()[0].note).toBe('');
  });

  it('loads old records that still have a note field without crashing', async () => {
    await AsyncStorage.setItem('decibelmeter:records/v1', JSON.stringify([{
      id: 'rec_old',
      createdAt: '2026-01-01T00:00:00.000Z',
      durationMs: 1000,
      current: 50,
      max: 60,
      avg: 55,
      min: 40,
      note: 'legacy memo',
      calibrationName: 'home',
      offset: 0,
    }]));
    await resetRecordsForTests();
    await initRecords();
    expect(getRecords()).toHaveLength(1);
    expect(getRecords()[0].id).toBe('rec_old');
    expect(getRecords()[0].current).toBe(50);
  });

  it('builds a CSV without a notes column or dB(A)', () => {
    const csv = recordsToCsv([{
      createdAt: '2026-01-01T00:00:00.000Z',
      durationMs: 1000,
      current: 60.4,
      max: 70.2,
      avg: 62.8,
      min: 40,
      note: 'hi, there',
      calibrationName: 'home',
      offset: 2,
    }]);
    expect(csv).toMatch(/current,max,avg,min,calibration,offset/);
    expect(csv).not.toMatch(/,note,/);
    expect(csv).not.toMatch(/hi, there/);
    expect(csv).toMatch(/60/);
    expect(csv).not.toMatch(/dB\(A\)/i);
    const html = recordsToHtml([{
      createdAt: '2026-01-01T00:00:00.000Z',
      durationMs: 1000,
      current: 60,
      max: 70,
      avg: 62,
      min: 40,
      note: 'secret',
    }]);
    expect(html).not.toMatch(/secret/);
    expect(html).not.toMatch(/<th>note<\/th>/);
  });

  it('prefixes a quote on CSV cells that start with formula characters', () => {
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvEscape('+1+1')).toBe("'+1+1");
    expect(csvEscape('-2')).toBe('-2');
    expect(csvEscape('-hello')).toBe("'-hello");
    expect(csvEscape('@cmd')).toBe("'@cmd");
    expect(csvEscape('\tHYPERLINK')).toBe("'\tHYPERLINK");
    expect(csvEscape('\rCMD')).toBe("'\rCMD");
    expect(csvEscape('note')).toBe('note');
    expect(csvEscape('=evil,"x"')).toBe(`"'=evil,""x"""`);
    const csv = recordsToCsv([{
      createdAt: '2026-01-01T00:00:00.000Z',
      durationMs: 1000,
      current: 60,
      max: 70,
      avg: 62,
      min: 40,
      note: '=SUM(A1)',
      calibrationName: '-hello',
      offset: -2,
    }]);
    expect(csv).toMatch(/,1000,/);
    expect(csv).toMatch(/,-2\n/);
    expect(csv).not.toMatch(/'-2/);
    expect(csv).not.toContain("'=SUM(A1)");
    expect(csv).toContain("'-hello");
  });
});
