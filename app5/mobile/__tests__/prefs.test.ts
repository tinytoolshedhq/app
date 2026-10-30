import { DEFAULT_PREFS, getPrefs, initPrefs, resetPrefsForTests, updatePrefs } from '../src/storage';

describe('prefs', () => {
  beforeEach(async () => {
    await resetPrefsForTests();
  });

  it('restores last posture, region, duration and voice setting', async () => {
    await updatePrefs({
      position: 'lying',
      bodyRegion: 'ankles',
      durationSeconds: 300,
      voiceEnabled: false,
    });
    expect(getPrefs()).toMatchObject({
      position: 'lying',
      bodyRegion: 'ankles',
      durationSeconds: 300,
      voiceEnabled: false,
    });

    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const raw = await AsyncStorage.getItem('stretch/prefs/v1');
    expect(JSON.parse(raw)).toMatchObject({
      position: 'lying',
      bodyRegion: 'ankles',
      durationSeconds: 300,
      voiceEnabled: false,
    });

    await resetPrefsForTests();
    await AsyncStorage.setItem('stretch/prefs/v1', raw);
    const loaded = await initPrefs();
    expect(loaded).toMatchObject({
      position: 'lying',
      bodyRegion: 'ankles',
      durationSeconds: 300,
      voiceEnabled: false,
    });
    expect(loaded).not.toEqual(DEFAULT_PREFS);
  });
});
