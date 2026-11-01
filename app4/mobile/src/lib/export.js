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

function loadMediaLibrary() {
  try {
    return require('expo-media-library');
  } catch {
    return null;
  }
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Neutralize spreadsheet formula injection (=, +, -, @, tab, CR). Pure numbers stay numeric. */
export function csvEscape(value) {
  let s = value == null ? '' : String(value);
  if (!PLAIN_NUMBER.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function recordsToCsv(list) {
  const rows = Array.isArray(list) ? list : [];
  const header = ['createdAt', 'durationMs', 'current', 'max', 'avg', 'min', 'calibration', 'offset'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.createdAt),
      csvEscape(r.durationMs),
      csvEscape(formatDb(r.current)),
      csvEscape(formatDb(r.max)),
      csvEscape(formatDb(r.avg)),
      csvEscape(formatDb(r.min)),
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
    </tr>`
  )).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t('export.pdfTitle'))}</title>
  <style>body{font-family:-apple-system,sans-serif;padding:24px;color:#1C1A17}td,th{padding:6px 10px;text-align:left;font-size:12px}p{color:#6B6560;font-size:12px}</style>
  </head><body>
  <h1>${escapeHtml(t('export.pdfTitle'))}</h1>
  <p>${escapeHtml(t('export.estimateNote'))}</p>
  <table><thead><tr><th>time</th><th>ms</th><th>now</th><th>max</th><th>avg</th><th>min</th></tr></thead>
  <tbody>${body}</tbody></table></body></html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Share-sheet dismiss only. expo-sharing iOS/Android resolve on dismiss;
 * web `navigator.share` rejects with DOM AbortError. Do not match /cancel/. */
export function isShareCancelled(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === 'EXPORT_CANCELLED' || code === 'ERR_SHARING_CANCELLED') return true;
  return error.name === 'AbortError';
}

export function isPhotoPermissionDenied(error) {
  if (!error) return false;
  const code = String(error.code || '');
  return code === 'E_PHOTO_PERM' || code === 'ERR_PERMISSIONS' || code === 'E_MISSING_PERMISSION';
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
  try {
    await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
  } catch (error) {
    if (isShareCancelled(error)) {
      const err = new Error('EXPORT_CANCELLED');
      err.code = 'EXPORT_CANCELLED';
      throw err;
    }
    throw error;
  }
}

export async function saveImageToPhotos(uri) {
  const ML = loadMediaLibrary();
  if (!uri || !ML?.requestPermissionsAsync || !ML.saveToLibraryAsync) {
    return { outcome: 'unavailable' };
  }
  let perm;
  try {
    perm = await ML.requestPermissionsAsync(true);
  } catch (error) {
    if (isPhotoPermissionDenied(error)) {
      const err = new Error('PHOTO_PERMISSION');
      err.code = 'E_PHOTO_PERM';
      throw err;
    }
    return { outcome: 'unavailable' };
  }
  if (!perm?.granted) {
    const err = new Error('PHOTO_PERMISSION');
    err.code = 'E_PHOTO_PERM';
    throw err;
  }
  await ML.saveToLibraryAsync(uri);
  return { outcome: 'saved_photos' };
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
  // File lives in the app cache, then the user picks a place in the share sheet
  // (e.g. Save to Files). We do not write to Documents / On My iPhone.
  return { uri, outcome: 'csv_shared' };
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
  return { uri, outcome: 'shared' };
}

export async function captureExportImage(viewRef) {
  const ViewShot = loadViewShot();
  const capture = ViewShot?.captureRef || ViewShot?.default?.captureRef;
  if (typeof capture !== 'function' || !viewRef) {
    const err = new Error('EXPORT_UNAVAILABLE');
    err.code = 'EXPORT_UNAVAILABLE';
    throw err;
  }
  return capture(viewRef, { format: 'png', quality: 1, result: 'tmpfile' });
}

async function discardTempExportUri(uri) {
  const FS = loadFileSystem();
  if (!uri || typeof FS?.deleteAsync !== 'function') return false;
  try {
    await FS.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

export async function shareImage(viewRef) {
  const uri = await captureExportImage(viewRef);
  try {
    try {
      const saved = await saveImageToPhotos(uri);
      if (saved.outcome === 'saved_photos') return { uri, outcome: 'saved_photos' };
    } catch (error) {
      if (isPhotoPermissionDenied(error) || error?.code === 'E_PHOTO_PERM') throw error;
      // Media library missing / failed: fall through to the share sheet.
    }
    await shareFile(uri, 'image/png');
    return { uri, outcome: 'shared' };
  } finally {
    await discardTempExportUri(uri);
  }
}

export function mapExportError(error) {
  if (isShareCancelled(error) || error?.code === 'EXPORT_CANCELLED') return t('export.cancelled');
  if (isPhotoPermissionDenied(error) || error?.code === 'E_PHOTO_PERM') return t('export.permissionDenied');
  if (error?.code === 'EXPORT_UNAVAILABLE') return t('export.unavailable');
  return t('export.fail');
}

export function mapExportSuccess(outcome) {
  if (outcome === 'saved_photos') return t('export.savedPhotos');
  if (outcome === 'csv_shared') return t('export.csvShared');
  if (outcome === 'shared') return t('export.sharedImage');
  return t('export.sharedImage');
}
