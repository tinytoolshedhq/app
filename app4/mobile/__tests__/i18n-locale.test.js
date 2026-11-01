import * as Localization from 'expo-localization';
import fs from 'fs';
import path from 'path';
import {
  getLocale,
  initializeI18n,
  resolveLocale,
  resolveTag,
  setLocale,
  t,
  tLocale,
} from '../src/i18n';

function keyPaths(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...keyPaths(v, next));
    else out.push(next);
  }
  return out;
}

describe('locale resolver', () => {
  afterEach(() => {
    Localization.getLocales.mockReturnValue([{ languageTag: 'en' }]);
    setLocale('en');
  });

  it('maps Traditional and Simplified Chinese to zh-Hant', () => {
    for (const tag of ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-Hans', 'zh-CN', 'zh']) {
      expect(resolveTag(tag)).toBe('zh-Hant');
    }
    expect(resolveLocale('zh-TW')).toBe('zh-Hant');
  });

  it('maps en* to en and unsupported tags to en', () => {
    expect(resolveTag('en-US')).toBe('en');
    expect(resolveTag('ja')).toBeNull();
    expect(resolveLocale('ja-JP')).toBe('en');
  });

  it('initializeI18n follows expo-localization getLocales order', () => {
    Localization.getLocales.mockReturnValue([
      { languageTag: 'ko-KR', languageCode: 'ko' },
      { languageTag: 'zh-TW', languageCode: 'zh' },
    ]);
    initializeI18n();
    expect(getLocale()).toBe('zh-Hant');
    expect(t('app.title')).toBe('分貝計');
  });

  it('tLocale does not depend on the current locale', () => {
    setLocale('en');
    expect(tLocale('zh-TW', 'meter.start')).toBe('開始');
    expect(tLocale('en', 'meter.start')).toBe('Start');
  });
});

describe('copy', () => {
  it('keeps en and zh-Hant keys in sync', () => {
    const en = require('../languages/en.json');
    const zh = require('../languages/zh-Hant.json');
    expect(keyPaths(zh).sort()).toEqual(keyPaths(en).sort());
    const enIos = require('../languages/ios/en.json');
    const zhIos = require('../languages/ios/zh-Hant.json');
    expect(Object.keys(zhIos).sort()).toEqual(Object.keys(enIos).sort());
  });

  it('does not claim professional or legal-grade measurement', () => {
    const en = require('../languages/en.json');
    const zh = require('../languages/zh-Hant.json');
    expect(en.meter.estimate.toLowerCase()).toMatch(/approximate|estimate/);
    expect(en.meter.estimate.toLowerCase()).toMatch(/reference only/);
    expect(zh.meter.estimate).toMatch(/估算|僅供參考/);
  });

  it('uses short denied copy, Adjust, and not-saved wording', () => {
    const en = require('../languages/en.json');
    const zh = require('../languages/zh-Hant.json');
    expect(en.settings.offset).toBe('Adjust');
    expect(en.settings.offset).not.toBe('Offset');
    expect(en.permission.denied).toBe('Microphone is needed to measure sound level. Audio is not saved or sent.');
    expect(zh.permission.denied).toBe('要用麥克風才能量聲音大小。聲音不會存下來，也不會傳出去。');
    expect(zh.settings.offset).toBe('調整');
    expect(en.settings.minus).toBe('Decrease adjustment');
    expect(en.settings.plus).toBe('Increase adjustment');
    expect(en.settings.minus).not.toBe('Decrease adjust');
    expect(en.settings.plus).not.toBe('Increase adjust');
    expect(zh.settings.minus).toBe('減少調整');
    expect(zh.settings.plus).toBe('增加調整');
    expect(en.settings.offsetRecalc.toLowerCase()).toMatch(/recalculates the current, max, min, and average/);
    expect(zh.settings.offsetRecalc).toMatch(/重新計算/);
    expect(zh.settings.offsetRecalc).toMatch(/目前/);
    expect(zh.settings.offsetRecalc).toMatch(/最大/);
    expect(zh.settings.offsetRecalc).toMatch(/平均/);
    const blob = `${JSON.stringify(en)}\n${JSON.stringify(zh)}`.toLowerCase();
    expect(blob).not.toMatch(/not recorded/);
    expect(blob).not.toMatch(/db\(a\)/);
    expect(blob).not.toMatch(/hearing|medical|spl\b/);
    expect(blob).not.toMatch(/iap unavailable/);
    expect(JSON.stringify(zh)).not.toMatch(/不會錄下來/);
    expect(en.accuracy.warning.toLowerCase()).toMatch(/inaccurate|estimate/);
    expect(en.accuracy.tip.toLowerCase()).toMatch(/case/);
    expect(en.accuracy.tip.toLowerCase()).toMatch(/airpods|external mic/);
  });

  it('keeps the system mic purpose string friendly, deleted right away, and not saved', () => {
    const enIos = require('../languages/ios/en.json');
    const zhIos = require('../languages/ios/zh-Hant.json');
    const app = require('../app.json');
    const en = enIos.NSMicrophoneUsageDescription;
    expect(en).toBe(app.expo.ios.infoPlist.NSMicrophoneUsageDescription);
    expect(en.toLowerCase()).toMatch(/needed to measure sound level/);
    expect(en.toLowerCase()).toMatch(/deleted right away/);
    expect(en.toLowerCase()).toMatch(/nothing is saved or sent/);
    expect(zhIos.NSMicrophoneUsageDescription).toMatch(/立刻刪除/);
    expect(zhIos.NSMicrophoneUsageDescription).toMatch(/不會存下來/);
    expect(zhIos.NSMicrophoneUsageDescription).toMatch(/不會傳出去/);
    expect(app.expo.locales['zh-Hant']).toBe('./languages/ios/zh-Hant.json');
    expect(app.expo.locales.en).toBe('./languages/ios/en.json');
    expect(enIos.NSPhotoLibraryUsageDescription).toBe(app.expo.ios.infoPlist.NSPhotoLibraryUsageDescription);
    expect(enIos.NSPhotoLibraryAddUsageDescription).toBe(app.expo.ios.infoPlist.NSPhotoLibraryAddUsageDescription);
    expect(zhIos.NSPhotoLibraryUsageDescription).toMatch(/不會使用你的照片/);
    expect(zhIos.NSPhotoLibraryUsageDescription).toMatch(/系統元件/);
    expect(zhIos.NSPhotoLibraryAddUsageDescription).toMatch(/不會把照片加進相簿|不會使用你的照片/);
  });

  it('does not hardcode CJK in app source', () => {
    const root = path.join(__dirname, '..');
    const skip = new Set(['node_modules', '.git', '.expo', 'dist', 'languages', 'assets', '__tests__']);
    const hits = [];
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(ent.name)) continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(js|jsx)$/.test(ent.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (/[\u3400-\u9fff]/.test(src)) hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });

  it('shows the calibration remapping note on the settings sheet', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/components/SettingsSheet.js'), 'utf8');
    expect(src).toMatch(/t\('settings\.offsetRecalc'\)/);
  });

  it('never ships raw English IAP errors and uses iPad max width', () => {
    const iap = fs.readFileSync(path.join(__dirname, '../src/lib/iap.js'), 'utf8');
    const errors = fs.readFileSync(path.join(__dirname, '../src/lib/iapErrors.js'), 'utf8');
    const meter = fs.readFileSync(path.join(__dirname, '../src/screens/MeterScreen.js'), 'utf8');
    expect(iap).not.toMatch(/new Error\(['"]IAP unavailable['"]\)/);
    expect(errors).not.toMatch(/new Error\(['"]IAP unavailable['"]\)/);
    expect(meter).toMatch(/CONTENT_MAX_WIDTH/);
    expect(meter).toMatch(/accuracy\.warning/);
    expect(meter).toMatch(/accuracy\.tip/);
    expect(meter).toMatch(/meter\.min/);
  });
});
