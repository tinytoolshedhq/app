const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = require('../app.json');
const eas = require('../eas.json');
const pkg = require('../package.json');

function easBlob() {
  return JSON.stringify(eas);
}

describe('EAS identifiers and Expo Go constraints', () => {
  it('uses com.tinytoolshed.decibelmeter, build 3, version 1.1.0, and the EAS project', () => {
    expect(app.expo.ios.bundleIdentifier).toBe('com.tinytoolshed.decibelmeter');
    expect(app.expo.android.package).toBe('com.tinytoolshed.decibelmeter');
    expect(app.expo.ios.buildNumber).toBe('3');
    expect(app.expo.version).toBe('1.1.0');
    expect(pkg.version).toBe('1.1.0');
    expect(app.expo.owner).toBe('leowang1105');
    expect(app.expo.extra.eas.projectId).toBe('117e579d-6aec-40ea-8e97-19bc314debcb');
    expect(app.expo.android.permissions).toEqual(['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS']);
  });

  it('has development, preview, and production profiles without secrets', () => {
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.development.developmentClient).toBe(true);
    expect(eas.build.development.distribution).toBe('internal');
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.ios.simulator).toBe(true);
    expect(eas.build.preview.ios.image).toBe('macos-tahoe-26.5-xcode-26.6');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.ios.image).toBe('macos-tahoe-26.5-xcode-26.6');
    expect(eas.submit).toBeUndefined();
    const text = easBlob();
    expect(text).not.toMatch(/appleTeamId|ascApiKey|ascAppId|EXPO_ASC|EXPO_APPLE_TEAM|credentialsSource|secret/i);
    expect(text).not.toMatch(/\.p8|\.p12|\.mobileprovision|authKey/i);
  });

  it('declares microphone via the expo-audio plugin and disables background capture', () => {
    const audio = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-audio');
    expect(audio[1].recordAudioAndroid).toBe(true);
    expect(audio[1].enableBackgroundRecording).toBe(false);
    expect(audio[1].enableBackgroundPlayback).toBe(false);
    const mic = audio[1].microphonePermission;
    expect(mic).toMatch(/needed to measure sound level/i);
    expect(mic.toLowerCase()).toMatch(/deleted right away/);
    expect(mic.toLowerCase()).toMatch(/nothing is saved or sent/);
    expect(app.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBe(mic);
  });

  it('declares photo-library purpose strings so ITMS-90683 is not flagged', () => {
    const plist = app.expo.ios.infoPlist;
    expect(plist.NSPhotoLibraryUsageDescription.toLowerCase()).toMatch(/does not access your photos/);
    expect(plist.NSPhotoLibraryUsageDescription.toLowerCase()).toMatch(/required by a system component/);
    expect(plist.NSPhotoLibraryAddUsageDescription).toBe(
      'Only used when you choose to save an exported image to your photo library.',
    );
    const media = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-media-library');
    expect(media[1].granularPermissions).toEqual([]);
    expect(app.expo.android.blockedPermissions).toEqual([
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ]);
  });

  it('ignores credentials.json', () => {
    const gitignore = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^credentials\.json$/m);
  });

  it('autolinks the local iOS measurement module', () => {
    const raw = execFileSync(
      'npx',
      ['expo-modules-autolinking', 'resolve', '--platform', 'ios', '--json'],
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' },
    );
    const resolved = JSON.parse(raw);
    const names = (resolved.modules || []).map((m) => m.packageName);
    expect(names).toContain('audio-measurement-session');
    const local = resolved.modules.find((m) => m.packageName === 'audio-measurement-session');
    expect(local.pods.map((p) => p.podName)).toEqual(['AudioMeasurementSession']);
    expect(local.modules.map((m) => m.class)).toEqual(['AudioMeasurementSessionModule']);
  });

  it('keeps Expo Go working: SDK 57, optional IAP require, 15s purchase timeout', () => {
    expect(pkg.dependencies.expo).toMatch(/57/);
    expect(pkg.dependencies['expo-audio']).toBeTruthy();
    expect(pkg.dependencies['expo-file-system']).toBeTruthy();
    expect(pkg.dependencies['audio-measurement-session']).toBe('file:./modules/audio-measurement-session');
    expect(pkg.dependencies['expo-iap']).toBeTruthy();
    expect(pkg.dependencies['react-native-live-audio-fft']).toBeUndefined();
    expect(pkg.dependencies['react-native-audio-api']).toBeUndefined();
    expect(pkg.dependencies['expo-av']).toBeUndefined();
    const iap = fs.readFileSync(path.join(__dirname, '../src/lib/iap.js'), 'utf8');
    expect(iap).toMatch(/function loadIap\(\)/);
    expect(iap).toMatch(/require\('expo-iap'\)/);
    expect(iap).toMatch(/catch \{\s*return \{\};/);
    expect(iap).toMatch(/IAP_UI_TIMEOUT_MS = 15_000/);
    expect(iap).toMatch(/isNativeIapPlatform/);
  });

  it('enables recorder metering, pauses in background, and applies measurement mode after record', () => {
    const hook = fs.readFileSync(path.join(__dirname, '../src/hooks/useMetering.js'), 'utf8');
    const life = fs.readFileSync(path.join(__dirname, '../src/lib/recorderLifecycle.js'), 'utf8');
    expect(life).toMatch(/isMeteringEnabled:\s*true/);
    expect(hook).toMatch(/useAudioRecorder\(RECORDING_OPTIONS\)/);
    expect(hook).toMatch(/useAudioRecorderState/);
    expect(hook).toMatch(/AppState\.addEventListener/);
    expect(hook).toMatch(/lifeRef\.current\.pause\(/);
    expect(hook).toMatch(/lifeRef\.current\.resume\(/);
    expect(hook).not.toMatch(/recorder\.pause\(/);
    expect(hook).toMatch(/isUsableMeteringSample/);
    expect(hook).toMatch(/requestRecordingPermissionsAsync/);
    expect(hook).toMatch(/tickMeter\(meterRef\.current, sample\)/);
    expect(hook).toMatch(/sessionDisplayStats\(session, offset\)/);
    expect(hook).toMatch(/applyOffset\(smoothed, offset\)/);
    expect(life).toMatch(/rec\.record\(\);[\s\S]*await deps\.enableMeasurementMode\(\)/);
    expect(life).toMatch(/prepareToRecordAsync\(options\)/);
    expect(hook).toMatch(/setAudioModeAsync hardcodes AVAudioSession mode \.default/);
    expect(life).toMatch(/await deps\.restoreSession\(\)/);
    expect(hook).toMatch(/lifeRef\.current\.release\(\)/);
  });
});
