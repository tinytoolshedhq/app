import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveRecord, getRecords, initRecords, resetRecordsForTests, updateRecordNote } from '../src/data/records';
import { setProUnlocked, clearProUnlocked } from '../src/lib/entitlements';
import { FREE_RECORD_LIMIT } from '../src/lib/gating';
import { recordsToCsv } from '../src/lib/export';

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

  it('allows Pro to save past 10 and edit notes', async () => {
    await setProUnlocked(true);
    for (let i = 0; i < 11; i += 1) {
      await saveRecord({ current: 50, note: 'n' });
    }
    expect(getRecords()).toHaveLength(11);
    const id = getRecords()[0].id;
    const updated = await updateRecordNote(id, 'hello');
    expect(updated.note).toBe('hello');
  });

  it('blocks notes on the free tier', async () => {
    const rec = await saveRecord({ current: 50, note: 'secret' });
    expect(rec.note).toBe('');
    await expect(updateRecordNote(rec.id, 'x')).rejects.toMatchObject({ code: 'FREE_LIMIT' });
  });

  it('builds a CSV without dB(A)', () => {
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
    expect(csv).toMatch(/current,max,avg,min/);
    expect(csv).toMatch(/60/);
    expect(csv).toMatch(/"hi, there"/);
    expect(csv).not.toMatch(/dB\(A\)/i);
  });
});
