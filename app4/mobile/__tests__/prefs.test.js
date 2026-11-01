import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOffset, initPrefs, resetPrefsForTests, setOffset } from '../src/data/prefs';

describe('calibration offset prefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetPrefsForTests();
  });

  it('defaults to 0', async () => {
    expect(getOffset()).toBe(0);
    await initPrefs();
    expect(getOffset()).toBe(0);
  });

  it('persists a clamped offset', async () => {
    await setOffset(7);
    expect(getOffset()).toBe(7);
    const raw = await AsyncStorage.getItem('decibelmeter:prefs/v1');
    const stored = JSON.parse(raw);
    expect(stored.offset).toBe(7);
    expect(stored.calibrations[0].offset).toBe(7);
  });

  it('clamps stored values to -20..+20', async () => {
    await setOffset(40);
    expect(getOffset()).toBe(20);
    await setOffset(-40);
    expect(getOffset()).toBe(-20);
  });

  it('reloads a previously saved offset', async () => {
    await AsyncStorage.setItem('decibelmeter:prefs/v1', JSON.stringify({ offset: -6 }));
    await initPrefs();
    expect(getOffset()).toBe(-6);
  });
});
