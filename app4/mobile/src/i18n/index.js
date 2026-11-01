import * as Localization from 'expo-localization';
import en from '../../languages/en.json';
import zhHant from '../../languages/zh-Hant.json';

let current = 'en';
const bundles = { en, 'zh-Hant': zhHant };

export function resolveTag(tag) {
  const loc = String(tag || '').trim().toLowerCase().replace(/_/g, '-');
  if (!loc) return null;
  if (loc === 'zh' || loc.startsWith('zh-')) return 'zh-Hant';
  if (loc === 'en' || loc.startsWith('en-')) return 'en';
  return null;
}

function flattenLocaleInputs(inputs) {
  const tags = [];
  const walk = (x) => {
    if (x == null || x === '') return;
    if (typeof x === 'string') {
      tags.push(x);
      return;
    }
    if (Array.isArray(x)) {
      x.forEach(walk);
      return;
    }
    if (typeof x === 'object') {
      if (x.languageTag) tags.push(x.languageTag);
      else if (x.languageCode) tags.push(x.languageCode);
    }
  };
  inputs.forEach(walk);
  return tags;
}

/** First supported tag in device/preferred order; otherwise en. */
export function resolveLocale(...inputs) {
  for (const tag of flattenLocaleInputs(inputs)) {
    const hit = resolveTag(tag);
    if (hit) return hit;
  }
  return 'en';
}

export function deviceLocaleTags() {
  const list = Localization?.getLocales?.();
  if (Array.isArray(list) && list.length) return list;
  return ['en'];
}

export function setLocale(locale) {
  current = resolveLocale(locale);
}

export function getLocale() {
  return current;
}

export function initializeI18n() {
  current = resolveLocale(deviceLocaleTags());
}

export function t(key, params) {
  return format(get(bundles[current] || bundles.en, key) ?? get(bundles.en, key) ?? key, params);
}

export function tLocale(locale, key, params) {
  const tag = resolveLocale(locale);
  const dict = bundles[tag] || bundles.en;
  return format(get(dict, key) ?? get(bundles.en, key) ?? key, params);
}

function format(raw, params) {
  if (typeof raw !== 'string') return raw == null ? '' : String(raw);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));
}

function get(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] != null ? acc[part] : undefined), obj);
}
