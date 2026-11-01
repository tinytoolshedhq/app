import { formatDb } from './meter';
import { t } from '../i18n';

function loadSharing() {
  try {
    return require('expo-sharing');
  } catch {
    return null;
  }
}

function loadFileSystem() {
  try {
    return require('expo-file-system/legacy');
  } catch {
    try {
      return require('expo-file-system');
    } catch {
      return null;
    }
  }
}

function loadPrint() {
  try {
    return require('expo-print');
  } catch {
    return null;
  }
}

function loadViewShot() {
  try {
    return require('react-native-view-shot');
  } catch {
    return null;
  }
}

/** Neutralize spreadsheet formula injection (=, +, -, @, tab, CR). */
export function csvEscape(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function recordsToCsv(list) {
  const rows = Array.isArray(list) ? list : [];
  const header = ['createdAt', 'durationMs', 'current', 'max', 'avg', 'min', 'note', 'calibration', 'offset'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.createdAt),
      csvEscape(r.durationMs),
      csvEscape(formatDb(r.current)),
      csvEscape(formatDb(r.max)),
      csvEscape(formatDb(r.avg)),
      csvEscape(formatDb(r.min)),
      csvEscape(r.note),
      csvEscape(r.calibrationName),
      csvEscape(r.offset),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function recordsToHtml(list) {
  const rows = Array.isArray(list) ? list : [];
  const body = rows.map((r) => (
    `<tr>
      <td>${escapeHtml(r.createdAt)}</td>
      <td>${escapeHtml(String(r.durationMs || 0))}</td>
      <td>${escapeHtml(formatDb(r.current))}</td>
      <td>${escapeHtml(formatDb(r.max))}</td>
      <td>${escapeHtml(formatDb(r.avg))}</td>
      <td>${escapeHtml(formatDb(r.min))}</td>
      <td>${escapeHtml(r.note || '')}</td>
    </tr>`
  )).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t('export.pdfTitle'))}</title>
  <style>body{font-family:-apple-system,sans-serif;padding:24px;color:#1C1A17}td,th{padding:6px 10px;text-align:left;font-size:12px}p{color:#6B6560;font-size:12px}</style>
  </head><body>
  <h1>${escapeHtml(t('export.pdfTitle'))}</h1>
  <p>${escapeHtml(t('export.estimateNote'))}</p>
  <table><thead><tr><th>time</th><th>ms</th><th>now</th><th>max</th><th>avg</th><th>min</th><th>note</th></tr></thead>
  <tbody>${body}</tbody></table></body></html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function shareFile(uri, mimeType) {
  const Sharing = loadSharing();
  if (!Sharing?.isAvailableAsync || !Sharing.shareAsync) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  const ok = await Sharing.isAvailableAsync();
  if (!ok) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
}

export async function shareCsv(list) {
  const FS = loadFileSystem();
  if (!FS?.cacheDirectory || !FS.writeAsStringAsync) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  const uri = `${FS.cacheDirectory}decibel-records.csv`;
  await FS.writeAsStringAsync(uri, recordsToCsv(list));
  await shareFile(uri, 'text/csv');
  return uri;
}

export async function sharePdf(list) {
  const Print = loadPrint();
  if (!Print?.printToFileAsync) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  const { uri } = await Print.printToFileAsync({ html: recordsToHtml(list) });
  if (!uri) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  await shareFile(uri, 'application/pdf');
  return uri;
}

export async function shareImage(viewRef) {
  const ViewShot = loadViewShot();
  const capture = ViewShot?.captureRef || ViewShot?.default?.captureRef;
  if (typeof capture !== 'function' || !viewRef) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  const uri = await capture(viewRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
  await shareFile(uri, 'image/png');
  return uri;
}

export function mapExportError(error) {
  if (error?.code === 'EXPORT_UNAVAILABLE') return t('export.unavailable');
  return t('export.fail');
}
