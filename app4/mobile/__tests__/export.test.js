import {
  isPhotoPermissionDenied,
  isShareCancelled,
  mapExportError,
  mapExportSuccess,
  saveImageToPhotos,
  shareCsv,
  shareImage,
} from '../src/lib/export';
import { setLocale, t } from '../src/i18n';

const Sharing = require('expo-sharing');
const ViewShot = require('react-native-view-shot');
const MediaLibrary = require('expo-media-library');

describe('export outcomes', () => {
  beforeEach(() => {
    setLocale('en');
    Sharing.isAvailableAsync.mockResolvedValue(true);
    Sharing.shareAsync.mockReset();
    Sharing.shareAsync.mockResolvedValue(undefined);
    ViewShot.captureRef.mockResolvedValue('file:///tmp/card.png');
    MediaLibrary.requestPermissionsAsync.mockReset();
    MediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    MediaLibrary.saveToLibraryAsync.mockReset();
    MediaLibrary.saveToLibraryAsync.mockResolvedValue(undefined);
  });

  it('maps success copy to what actually happened', () => {
    expect(mapExportSuccess('saved_photos')).toBe(t('export.savedPhotos'));
    expect(mapExportSuccess('csv_shared')).toBe(t('export.csvShared'));
    expect(mapExportSuccess('csv_shared')).toBe('CSV exported.');
    expect(mapExportSuccess('shared')).toBe(t('export.sharedImage'));
    expect(t('export.csvHint')).toMatch(/Save to Files/);
    setLocale('zh-Hant');
    expect(mapExportSuccess('saved_photos')).toBe('已儲存到相簿');
    expect(mapExportSuccess('csv_shared')).toBe('已匯出 CSV。');
    expect(mapExportSuccess('csv_shared')).not.toMatch(/分享選單/);
    expect(t('export.csvHint')).toMatch(/分享選單/);
    expect(t('export.csvHint')).toMatch(/儲存到檔案/);
  });

  it('treats only the real share-dismiss codes as cancel, not a /cancel/ message', () => {
    expect(isShareCancelled({ code: 'EXPORT_CANCELLED' })).toBe(true);
    expect(isShareCancelled({ code: 'ERR_SHARING_CANCELLED' })).toBe(true);
    expect(isShareCancelled({ name: 'AbortError', message: 'Share canceled' })).toBe(true);
    expect(isShareCancelled({ message: 'User cancelled share' })).toBe(false);
    expect(isShareCancelled({ code: 'EXPORT_UNAVAILABLE', message: 'cancelled' })).toBe(false);
    expect(isPhotoPermissionDenied({ code: 'E_PHOTO_PERM' })).toBe(true);
    expect(mapExportError({ code: 'EXPORT_CANCELLED' })).toBe(t('export.cancelled'));
    expect(mapExportError({ code: 'E_PHOTO_PERM' })).toBe(t('export.permissionDenied'));
  });

  it('saves the captured image to Photos when permission is granted', async () => {
    const result = await shareImage({ current: true });
    expect(result.outcome).toBe('saved_photos');
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///tmp/card.png');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('throws permission denied and does not claim success', async () => {
    MediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    await expect(saveImageToPhotos('file:///tmp/card.png')).rejects.toMatchObject({ code: 'E_PHOTO_PERM' });
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('falls back to the share sheet when Photos is unavailable', async () => {
    MediaLibrary.requestPermissionsAsync.mockRejectedValue(new Error('no native module'));
    const result = await shareImage({ current: true });
    expect(result.outcome).toBe('shared');
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it('deletes the capture tmpfile after a Photos save', async () => {
    const FS = require('expo-file-system/legacy');
    FS.deleteAsync.mockClear();
    await shareImage({ current: true });
    expect(FS.deleteAsync).toHaveBeenCalledWith('file:///tmp/card.png', { idempotent: true });
  });

  it('deletes the capture tmpfile after permission denial', async () => {
    MediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    const FS = require('expo-file-system/legacy');
    FS.deleteAsync.mockClear();
    await expect(shareImage({ current: true })).rejects.toMatchObject({ code: 'E_PHOTO_PERM' });
    expect(FS.deleteAsync).toHaveBeenCalledWith('file:///tmp/card.png', { idempotent: true });
  });

  it('does not report CSV success when the share sheet is cancelled', async () => {
    const FS = require('expo-file-system');
    FS.cacheDirectory = 'file:///tmp/';
    FS.writeAsStringAsync = jest.fn(async () => {});
    Sharing.shareAsync.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_SHARING_CANCELLED' }));
    await expect(shareCsv([])).rejects.toMatchObject({ code: 'EXPORT_CANCELLED' });
  });
});

describe('RecordsSheet capture target', () => {
  it('captures an off-screen ExportCard and uses swipe-to-delete', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../src/components/RecordsSheet.js'), 'utf8');
    expect(src).toMatch(/from '\.\/ExportCard'/);
    expect(src).toMatch(/styles\.offscreen/);
    expect(src).toMatch(/shareImage\(exportRef\.current\)/);
    expect(src).toMatch(/Swipeable/);
    expect(src).not.toMatch(/updateRecordNote/);
    expect(src).not.toMatch(/notePlaceholder/);
    expect(src).not.toMatch(/TextInput/);
    expect(src).toMatch(/records\.deleteConfirm/);
    expect(src).toMatch(/records\.swipeHint/);
    expect(src).toMatch(/export\.csvHint/);
    expect(src).toMatch(/Alert\.alert\(t\('export\.csv'\), t\('export\.csvHint'\)/);
  });
});
