import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveRecord, getRecords, initRecords, resetRecordsForTests } from '../src/data/records';
import { setProUnlocked, clearProUnlocked } from '../src/lib/entitlements';
import { FREE_RECORD_LIMIT } from '../src/lib/gating';
import { csvEscape, formatCsvDate, formatCsvDurationSeconds, recordsToCsv, recordsToHtml } from '../src/lib/export';
import { setLocale } from '../src/i18n';

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
    setLocale('en');
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
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toMatch(/Current \(dB\),Max \(dB\),Avg \(dB\),Min \(dB\),Calibration,Adjust \(dB\)/);
    expect(csv).toMatch(/Duration \(s\)/);
    expect(csv).not.toMatch(/durationMs/);
    expect(csv).not.toMatch(/,note,/);
    expect(csv).not.toMatch(/hi, there/);
    expect(csv).toMatch(/60/);
    expect(csv).not.toMatch(/Offset/);
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
    expect(csv).toMatch(/,1,/);
    expect(csv).toMatch(/,-2\n/);
    expect(csv).not.toMatch(/'-2/);
    expect(csv).not.toContain("'=SUM(A1)");
    expect(csv).toContain("'-hello");
  });

  it('uses localized human-readable headers, duration in seconds, and local dates', () => {
    const row = {
      createdAt: '2026-06-15T13:04:05.000Z',
      durationMs: 1500,
      current: 60,
      max: 70,
      avg: 62,
      min: 40,
      calibrationName: 'home',
      offset: 0,
    };
    expect(formatCsvDurationSeconds(1500)).toBe('2');
    expect(formatCsvDurationSeconds(1499)).toBe('1');
    expect(formatCsvDurationSeconds(1000)).toBe('1');
    expect(formatCsvDate(row.createdAt)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    setLocale('en');
    const en = recordsToCsv([row]);
    expect(en.startsWith('\uFEFF')).toBe(true);
    expect(en.replace(/^\uFEFF/, '').split('\n')[0]).toBe(
      'Created,Duration (s),Current (dB),Max (dB),Avg (dB),Min (dB),Calibration,Adjust (dB)',
    );
    expect(en).toMatch(/,2,/);
    expect(en).not.toMatch(/,1\.5,/);
    expect(en).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(en).not.toMatch(/2026-06-15T13:04:05/);
    expect(en).not.toMatch(/durationMs|duration_s|createdAt/);
    expect(en).not.toMatch(/dB\(A\)/i);
    setLocale('zh-Hant');
    const zh = recordsToCsv([row]);
    expect(zh.startsWith('\uFEFF')).toBe(true);
    expect(zh.replace(/^\uFEFF/, '').split('\n')[0]).toBe(
      '建立時間,時長（秒）,目前 (dB),最大 (dB),平均 (dB),最小 (dB),校準,調整 (dB)',
    );
    expect(zh).toMatch(/,2,/);
    expect(zh).not.toMatch(/偏移/);
    expect(zh).not.toMatch(/dB\(A\)/i);
    setLocale('en');
  });

  it('escapes CSV header cells the same way as values', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../src/lib/export.js'),
      'utf8',
    );
    expect(src).toMatch(/\]\.map\(csvEscape\)/);
    expect(src).toMatch(/CSV_UTF8_BOM/);
    expect(src).toMatch(/t\('settings\.offset'\)/);
    expect(src).toMatch(/t\('settings\.unit'\)/);
    expect(src).toMatch(/Math\.round/);
  });
});
