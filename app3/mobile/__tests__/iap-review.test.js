import {
  purchaseProUnlock, restoreProUnlock, getProDisplayPrice,
  startPurchaseUpdates, stopPurchaseUpdates, PRO_PRODUCT_ID,
} from '../src/lib/iap';
import { clearProUnlocked, isProUnlocked } from '../src/lib/entitlements';
import { t } from '../src/i18n';

const iap = require('expo-iap');
const never = () => new Promise(() => {});
const product = { id: PRO_PRODUCT_ID, displayPrice: 'NT$90' };
const purchase = { productId: PRO_PRODUCT_ID, transactionId: 'review-test' };

describe('App Review purchase failure recovery (production mode)', () => {
  beforeEach(async () => {
    await stopPurchaseUpdates();
    iap.__resetIapMock();
    jest.clearAllMocks();
    await clearProUnlocked();
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE = 'production';
    iap.initConnection.mockResolvedValue(true);
    iap.endConnection.mockResolvedValue(undefined);
    iap.fetchProducts.mockResolvedValue([product]);
    iap.requestPurchase.mockResolvedValue(null);
    iap.restorePurchases.mockResolvedValue(undefined);
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.finishTransaction.mockResolvedValue(undefined);
    iap.isTransactionVerifiedIOS.mockResolvedValue(true);
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await stopPurchaseUpdates();
    jest.useRealTimers();
    delete process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE;
  });

  it.each([{ products: [] }, { products: [{ id: 'another.product', displayPrice: '$99' }] }])(
    'rejects missing Full Pack instead of dispatching a purchase ($products)', async ({ products }) => {
      iap.fetchProducts.mockResolvedValue(products);
      expect(await purchaseProUnlock()).toEqual({ ok: false, error: t('iap.productUnavailable') });
      expect(iap.requestPurchase).not.toHaveBeenCalled();
      expect(await isProUnlocked()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('never displays the price of an unrelated product', async () => {
    iap.fetchProducts.mockResolvedValue([{ id: 'another.product', displayPrice: '$99' }]);
    expect(await getProDisplayPrice()).toBeNull();
  });

  it('ends price loading if the store connection stalls', async () => {
    iap.initConnection.mockImplementationOnce(never);
    const price = getProDisplayPrice();
    await jest.advanceTimersByTimeAsync(15000);
    expect(await price).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ends price loading if the product query stalls', async () => {
    iap.fetchProducts.mockImplementationOnce(never);
    const price = getProDisplayPrice();
    await jest.advanceTimersByTimeAsync(8000);
    expect(await price).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports a failed store connection without dispatching a purchase', async () => {
    iap.initConnection.mockResolvedValue(false);
    expect(await purchaseProUnlock()).toEqual({ ok: false, error: t('iap.unavailable') });
    expect(iap.requestPurchase).not.toHaveBeenCalled();
  });

  it.each(['initConnection', 'fetchProducts'])(
    'times out a stalled %s and allows a successful retry', async (method) => {
      iap[method].mockImplementationOnce(never);
      const result = purchaseProUnlock();
      await jest.advanceTimersByTimeAsync(15000);
      expect(await result).toEqual({ ok: false, error: t('iap.timeout') });
      expect(iap.requestPurchase).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      iap.requestPurchase.mockImplementationOnce(async () => {
        iap.getAvailablePurchases.mockResolvedValue([purchase]);
        return [purchase];
      });
      expect(await purchaseProUnlock()).toEqual({ ok: true });
    },
  );

  it('times out a stalled native purchase even if its promise never resolves', async () => {
    iap.requestPurchase.mockImplementationOnce(never);
    const result = purchaseProUnlock();
    await jest.advanceTimersByTimeAsync(120000);
    expect(await result).toEqual({ ok: false, error: t('iap.timeout') });
    expect(await isProUnlocked()).toBe(false);
    // The temporary transaction listeners must be removed after timeout.
    iap.__emitPurchaseUpdated(purchase);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('handles a successful event before the native request promise returns', async () => {
    iap.requestPurchase.mockImplementationOnce(() => {
      iap.getAvailablePurchases.mockResolvedValue([purchase]);
      iap.__emitPurchaseUpdated(purchase);
      return never();
    });
    expect(await purchaseProUnlock()).toEqual({ ok: true });
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the persistent listener to unlock a transaction arriving after timeout', async () => {
    await startPurchaseUpdates();
    iap.requestPurchase.mockImplementationOnce(never);
    const result = purchaseProUnlock();
    await jest.advanceTimersByTimeAsync(120000);
    expect((await result).error).toBe(t('iap.timeout'));
    iap.getAvailablePurchases.mockResolvedValue([purchase]);
    iap.__emitPurchaseUpdated(purchase);
    await jest.advanceTimersByTimeAsync(0);
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['user-cancelled', { ok: false, cancelled: true }],
    ['deferred-payment', { ok: false, pending: true }],
  ])('handles a %s event while the native promise remains unresolved', async (code, expected) => {
    iap.requestPurchase.mockImplementationOnce(() => {
      iap.__emitPurchaseError({ code });
      return never();
    });
    expect(await purchaseProUnlock()).toEqual(expected);
    expect(await isProUnlocked()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores pending events for other products and reports Full Pack pending', async () => {
    iap.requestPurchase.mockImplementationOnce(() => {
      iap.__emitPurchaseUpdated({ productId: 'another.product', purchaseState: 'pending' });
      return never();
    });
    const result = purchaseProUnlock();
    await jest.advanceTimersByTimeAsync(0);
    iap.__emitPurchaseUpdated({ ...purchase, purchaseState: 'pending' });
    expect(await result).toMatchObject({ ok: false, pending: true, purchase: { productId: PRO_PRODUCT_ID } });
    expect(await isProUnlocked()).toBe(false);
  });

  it('bounds restore connection time without granting a simulated unlock', async () => {
    iap.initConnection.mockImplementationOnce(never);
    const result = restoreProUnlock();
    await jest.advanceTimersByTimeAsync(15000);
    expect(await result).toEqual({ ok: false, restored: false, error: t('iap.timeout') });
    expect(await isProUnlocked()).toBe(false);
  });

  it('reports a stalled restore sync rather than claiming no purchase exists', async () => {
    iap.restorePurchases.mockImplementationOnce(never);
    const result = restoreProUnlock();
    await jest.advanceTimersByTimeAsync(15000);
    expect(await result).toEqual({ ok: false, restored: false, error: t('iap.timeout') });
    expect(await isProUnlocked()).toBe(false);
  });

  it('reports an unavailable entitlement query instead of no purchase found', async () => {
    iap.getAvailablePurchases.mockRejectedValueOnce(new Error('offline'));
    expect(await restoreProUnlock()).toEqual({ ok: false, restored: false, error: t('iap.unavailable') });
    expect(await isProUnlocked()).toBe(false);
  });
});

describe('localized microphone purpose strings', () => {
  const app = require('../app.json').expo;
  it('uses the same English text in the plugin, Info.plist and localization', () => {
    const en = require('../languages/ios/en.json');
    const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-speech-recognition')[1];
    expect(plugin.microphonePermission).toBe(en.NSMicrophoneUsageDescription);
    expect(plugin.speechRecognitionPermission).toBe(en.NSSpeechRecognitionUsageDescription);
    expect(app.ios.infoPlist.NSMicrophoneUsageDescription).toBe(en.NSMicrophoneUsageDescription);
  });
  it.each([
    ['en', /toothbrush/], ['zh-Hant', /牙刷/], ['ja', /歯ブラシ/],
    ['de', /Zahnbürste/], ['fr', /brosse à dents/],
  ])('includes a concrete tracking example in %s', (lang, example) => {
    const locale = require(`../languages/ios/${lang}.json`);
    expect(locale.NSMicrophoneUsageDescription).toMatch(example);
    expect(locale.NSSpeechRecognitionUsageDescription).toMatch(example);
  });
});
