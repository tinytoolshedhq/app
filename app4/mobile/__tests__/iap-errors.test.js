import { setLocale, t } from '../src/i18n';
import {
  isAlreadyOwnedError,
  isDeferredError,
  isTimeoutError,
  isUnavailableError,
  isUserCancelledError,
  mapIapError,
  mapRestoreError,
} from '../src/lib/iapErrors';

describe('iap error classification', () => {
  it('classifies already-owned, cancel, deferred, timeout, unavailable', () => {
    expect(isAlreadyOwnedError({ code: 'E_ALREADY_OWNED' })).toBe(true);
    expect(isAlreadyOwnedError({ message: 'This In-App Purchase has already been bought' })).toBe(true);
    expect(isUserCancelledError({ code: 'E_USER_CANCELLED' })).toBe(true);
    expect(isDeferredError({ code: 'E_DEFERRED' })).toBe(true);
    expect(isTimeoutError({ timedOut: true })).toBe(true);
    expect(isTimeoutError({ code: 'IAP_TIMEOUT' })).toBe(true);
    expect(isUnavailableError({ code: 'IAP_UNAVAILABLE' })).toBe(true);
    expect(isUnavailableError({ message: 'IAP unavailable' })).toBe(true);
  });
});

describe('localized error mapping', () => {
  afterEach(() => setLocale('en'));

  it('never returns raw English store strings', () => {
    setLocale('en');
    expect(mapIapError({ code: 'IAP_UNAVAILABLE', message: 'IAP unavailable' })).toBe(t('iap.unavailable'));
    expect(mapIapError({ code: 'E_USER_CANCELLED' })).toBe(t('iap.cancelled'));
    expect(mapIapError({ code: 'E_ALREADY_OWNED' })).toBe(t('iap.restoreAgain'));
    expect(mapIapError({ code: 'E_ALREADY_OWNED' })).not.toBe(t('iap.restored'));
    expect(mapIapError({ code: 'E_DEFERRED' })).toBe(t('iap.pending'));
    expect(mapIapError({ timedOut: true })).toBe(t('iap.timeout'));
    expect(mapIapError({ message: 'boom' })).toBe(t('iap.buyFail'));
    expect(mapIapError({ message: 'IAP unavailable' })).not.toBe('IAP unavailable');
  });

  it('maps the same codes in zh-Hant', () => {
    setLocale('zh-Hant');
    expect(mapIapError({ code: 'IAP_UNAVAILABLE' })).toBe(t('iap.unavailable'));
    expect(mapIapError({ timedOut: true })).toBe(t('iap.timeout'));
    expect(mapIapError({ code: 'E_ALREADY_OWNED' })).toBe(t('iap.restoreAgain'));
    expect(mapIapError(new Error('IAP unavailable'))).not.toMatch(/IAP unavailable/i);
  });

  it('maps restore failures to cannotRestore, not purchase unavailable', () => {
    setLocale('en');
    expect(mapRestoreError({ code: 'IAP_UNAVAILABLE', message: 'IAP unavailable' })).toBe(t('iap.cannotRestore'));
    expect(mapRestoreError({ code: 'IAP_UNAVAILABLE' })).not.toBe(t('iap.unavailable'));
    expect(mapRestoreError({ message: 'boom' })).toBe(t('iap.cannotRestore'));
    expect(mapRestoreError({ timedOut: true })).toBe(t('iap.timeout'));
    setLocale('zh-Hant');
    expect(mapRestoreError({ code: 'IAP_UNAVAILABLE' })).toBe('這裡無法恢復。');
    expect(mapRestoreError({ code: 'IAP_UNAVAILABLE' })).not.toBe('這裡無法購買。');
  });
});
