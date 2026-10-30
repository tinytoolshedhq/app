import fs from 'fs';
import path from 'path';
import zh from '../languages/zh-Hant.json';

const FORBIDDEN = [
  '專業審核通過',
  '物理治療師認可',
  '治療疼痛',
  '復健處方',
  'reviewed by a professional',
  'treatment effect',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|json)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe('copy', () => {
  it('does not claim professional review or treatment effects', () => {
    const files = [
      ...walk(path.join(__dirname, '../src')),
      ...walk(path.join(__dirname, '../languages')),
    ];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const phrase of FORBIDDEN) {
        expect(`${file}: ${text.includes(phrase) ? phrase : ''}`).not.toContain(phrase);
      }
    }
    expect(zh.home.safety).toMatch(/不是醫療建議/);
    expect(JSON.stringify(zh)).not.toMatch(/審核通過/);
  });

  it('declares App Store photo usage strings like app4 (ITMS-90683)', () => {
    const appJson = require('../app.json');
    const plist = appJson.expo.ios.infoPlist;
    expect(plist.NSPhotoLibraryUsageDescription).toBe(
      'This app does not access your photos. This text is required by a system component.',
    );
    expect(plist.NSPhotoLibraryAddUsageDescription).toBe(
      'This app does not add photos to your library. This text is required by a system component.',
    );
    expect(appJson.expo.locales).toEqual({
      en: './languages/ios/en.json',
      'zh-Hant': './languages/ios/zh-Hant.json',
      'zh-TW': './languages/ios/zh-Hant.json',
      'zh-HK': './languages/ios/zh-Hant.json',
    });
    const zhIos = require('../languages/ios/zh-Hant.json');
    const enIos = require('../languages/ios/en.json');
    expect(zhIos.NSPhotoLibraryUsageDescription).toBe('這個 App 不會使用你的照片。這段文字是系統元件需要的。');
    expect(zhIos.NSPhotoLibraryAddUsageDescription).toBe('這個 App 不會把照片加進相簿。這段文字是系統元件需要的。');
    expect(enIos.NSPhotoLibraryUsageDescription).toBe(plist.NSPhotoLibraryUsageDescription);
    expect(enIos.NSPhotoLibraryAddUsageDescription).toBe(plist.NSPhotoLibraryAddUsageDescription);
  });
});
