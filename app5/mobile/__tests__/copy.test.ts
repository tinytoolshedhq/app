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
});
