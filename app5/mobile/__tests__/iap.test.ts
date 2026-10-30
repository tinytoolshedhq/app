import { Platform } from 'react-native';
import {
  purchaseProUnlock,
  restoreProUnlock,
  verifyProOnLaunch,
  getProDisplayPrice,
  startPurchaseUpdates,
  stopPurchaseUpdates,
  grantFullpackPurchase,
  canPresentRedeemCode,
  presentRedeemCodeSheet,
  allowSimulate,
  purchaseMatches,
  isRevoked,
  isPendingPurchase,
  isEntitledPurchase,
  isAlreadyOwnedError,
  isUserCancelledError,
  isDeferredError,
  decideUnlockFromPurchases,
  EMPTY_LIST_REVOKE_AFTER,
  PRO_PRODUCT_ID,
  CANONICAL_PRO_PRODUCT_ID,
  resolveProProductId,
  entitlementGrantConfig,
  iapActionConfig,
  IAP_UI_TIMEOUT_MS,
  purchaseTransactionId,
  grantDedupeKey,
  runIapBusy,
  isNativeIapPlatform,
} from '../src/iap';
import {
  isProUnlocked,
  isPendingVerification,
  parseProRecord,
  clearProUnlocked,
  setProUnlocked,
  subscribePro,
  getEmptyPurchaseStreak,
  getProRecord,
  PENDING_MAX_AGE_MS,
} from '../src/iap/entitlements';

const realEntitlementSleep = entitlementGrantConfig.sleep.bind(entitlementGrantConfig);
const realNow = entitlementGrantConfig.now.bind(entitlementGrantConfig);
const realIapTimeoutMs = iapActionConfig.timeoutMs;
const FULLPACK = process.env.EXPO_PUBLIC_IAP_PRODUCT_ID || 'com.tinytoolshed.stretch.fullpack';

describe('iap entitlement helpers', () => {
  it('uses the placeholder Full Pack product id', () => {
    expect(FULLPACK).toBe('com.tinytoolshed.stretch.fullpack');
    expect(CANONICAL_PRO_PRODUCT_ID).toBe('com.tinytoolshed.stretch.fullpack');
    expect(PRO_PRODUCT_ID).toBe('com.tinytoolshed.stretch.fullpack');
    expect(purchaseMatches({ productId: FULLPACK })).toBe(true);
    expect(purchaseMatches({ id: FULLPACK })).toBe(true);
    expect(purchaseMatches({ sku: FULLPACK })).toBe(true);
    expect(purchaseMatches({ ids: [FULLPACK] })).toBe(true);
    expect(purchaseMatches({ productId: 'com.other.app.sku' })).toBe(false);
  });

  it('ignores EXPO_PUBLIC_IAP_PRODUCT_ID override in production builds', () => {
    expect(resolveProProductId({
      override: 'com.other.app.sku',
      dev: false,
      profile: 'production',
    })).toBe(CANONICAL_PRO_PRODUCT_ID);
    expect(resolveProProductId({
      override: 'com.dev.app.sku',
      dev: true,
      profile: '',
    })).toBe('com.dev.app.sku');
  });

  it('treats pending and revoked rows as not entitled', () => {
    expect(isPendingPurchase({ productId: FULLPACK, purchaseState: 'pending' })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, revocationDate: '2026-01-01' })).toBe(true);
    expect(isEntitledPurchase({ productId: FULLPACK })).toBe(true);
    expect(isEntitledPurchase({ productId: FULLPACK, purchaseState: 'pending' })).toBe(false);
    expect(isAlreadyOwnedError({ code: 'E_ALREADY_OWNED' })).toBe(true);
    expect(isUserCancelledError({ code: 'E_USER_CANCELLED' })).toBe(true);
    expect(isDeferredError({ code: 'E_DEFERRED' })).toBe(true);
  });

  it('rebuilds unlock from entitlements and does not revoke on a single empty list', () => {
    expect(decideUnlockFromPurchases([{ productId: FULLPACK }], { currentlyUnlocked: false, emptyStreak: 2 }))
      .toEqual({ unlocked: true, emptyStreak: 0, revoke: false, entitled: true });
    expect(decideUnlockFromPurchases([], { currentlyUnlocked: true, emptyStreak: 0 }))
      .toEqual({ unlocked: true, emptyStreak: 1, revoke: false, entitled: false });
    expect(decideUnlockFromPurchases([], {
      currentlyUnlocked: true,
      emptyStreak: EMPTY_LIST_REVOKE_AFTER - 1,
    })).toEqual({
      unlocked: false,
      emptyStreak: EMPTY_LIST_REVOKE_AFTER,
      revoke: true,
      entitled: false,
    });
  });

  it('parses legacy and pendingVerification Pro records', () => {
    expect(parseProRecord(null)).toEqual({ unlocked: false, pendingVerification: false });
    expect(parseProRecord('1')).toEqual({
      unlocked: true,
      pendingVerification: false,
      source: 'store',
    });
    expect(parseProRecord(JSON.stringify({ unlocked: true, source: 'event', ts: 42 }))).toEqual({
      unlocked: true,
      pendingVerification: true,
      source: 'event',
      ts: 42,
      pendingSince: 42,
    });
    expect(parseProRecord(JSON.stringify({
      unlocked: true,
      source: 'event',
      ts: 99,
      pendingSince: 10,
    }))).toMatchObject({ pendingVerification: true, pendingSince: 10, ts: 99 });
  });

  it('dedupes purchase grants by transactionId', () => {
    const a = { productId: FULLPACK, transactionId: '100000012345' };
    const b = { productId: FULLPACK, transactionId: '100000012345', purchaseToken: 'jws' };
    expect(purchaseTransactionId(a)).toBe('100000012345');
    expect(grantDedupeKey(a)).toBe(grantDedupeKey(b));
  });
});

describe('iap', () => {
  beforeEach(async () => {
    await stopPurchaseUpdates();
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '1';
    delete process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE;
    delete process.env.EAS_BUILD_PROFILE;
    entitlementGrantConfig.retryDelaysMs = [1000, 3000];
    entitlementGrantConfig.sleep = jest.fn(async () => {});
    const iap = require('expo-iap');
    iap.__resetIapMock?.();
    iap.finishTransaction.mockClear();
    iap.purchaseUpdatedListener.mockClear();
    iap.getAvailablePurchases.mockClear();
    iap.requestPurchase.mockClear();
    iap.isTransactionVerifiedIOS.mockReset();
    iap.isTransactionVerifiedIOS.mockResolvedValue(true);
    await clearProUnlocked();
  });

  afterEach(async () => {
    await stopPurchaseUpdates();
    entitlementGrantConfig.sleep = realEntitlementSleep;
    entitlementGrantConfig.now = realNow;
    entitlementGrantConfig.retryDelaysMs = [1000, 3000];
    iapActionConfig.timeoutMs = realIapTimeoutMs;
    const iap = require('expo-iap');
    iap.initConnection.mockReset();
    iap.initConnection.mockImplementation(async () => {});
  });

  it('simulates purchase in test env', async () => {
    const result = await purchaseProUnlock();
    expect(result.ok).toBe(true);
    expect(await isProUnlocked()).toBe(true);
  });

  it('simulates restore in test env', async () => {
    const result = await restoreProUnlock();
    expect(result.ok).toBe(true);
  });

  it('does not revoke unlock on launch in IAP_SIMULATE mode', async () => {
    await setProUnlocked(true);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
  });

  it('reads StoreKit displayPrice and never hardcodes a fallback', async () => {
    const price = await getProDisplayPrice();
    expect(price).toBe('NT$90');
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/PaywallScreen.tsx'), 'utf8');
    expect(paywall).not.toMatch(/NT\$90/);
    expect(paywall).toMatch(/displayPrice|getProDisplayPrice/);
  });

  it('registers a persistent purchase listener at app start', async () => {
    const iap = require('expo-iap');
    const app = require('fs').readFileSync(require('path').join(__dirname, '../src/App.tsx'), 'utf8');
    expect(app).toMatch(/startPurchaseUpdates/);
    await startPurchaseUpdates();
    expect(iap.initConnection).toHaveBeenCalled();
    expect(iap.purchaseUpdatedListener).toHaveBeenCalled();
  });

  it('unlocks from a fullpack purchase-updated event and finishes the transaction', async () => {
    const iap = require('expo-iap');
    await startPurchaseUpdates();
    const unlocked = new Promise<void>((resolve) => {
      const unsub = subscribePro((v) => {
        if (v) {
          unsub();
          resolve();
        }
      });
    });
    iap.__emitPurchaseUpdated({ productId: FULLPACK });
    await unlocked;
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase: { productId: FULLPACK },
      isConsumable: false,
    });
  });

  it('does not unlock when transaction verification explicitly returns false', async () => {
    const iap = require('expo-iap');
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(false);
    expect(await isProUnlocked()).toBe(false);
    expect(await isPendingVerification()).toBe(false);
  });

  it('writes pendingVerification with pendingSince when verification is inconclusive', async () => {
    const iap = require('expo-iap');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.isTransactionVerifiedIOS.mockRejectedValue(new Error('offline'));
    entitlementGrantConfig.now = () => 1_700_000_000_000;
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(await isPendingVerification()).toBe(true);
    const stored = JSON.parse(await AsyncStorage.getItem('stretch/proUnlocked/v1'));
    expect(stored).toEqual(expect.objectContaining({
      unlocked: true,
      source: 'event',
      pendingSince: 1_700_000_000_000,
      ts: 1_700_000_000_000,
    }));
    expect((await getProRecord()).pendingSince).toBe(1_700_000_000_000);
  });

  it('does not reset pendingSince on later purchase or restore events', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.isTransactionVerifiedIOS.mockRejectedValue(new Error('offline'));
    entitlementGrantConfig.now = () => 1_000;
    expect(await grantFullpackPurchase({ productId: FULLPACK, transactionId: 'tx-a' })).toBe(true);
    expect((await getProRecord()).pendingSince).toBe(1_000);

    entitlementGrantConfig.now = () => 50_000;
    expect(await grantFullpackPurchase({ productId: FULLPACK, transactionId: 'tx-b' })).toBe(true);
    const afterPurchase = await getProRecord();
    expect(afterPurchase.pendingVerification).toBe(true);
    expect(afterPurchase.pendingSince).toBe(1_000);
    expect(afterPurchase.ts).toBe(50_000);

    await restoreProUnlock();
    const afterRestore = await getProRecord();
    expect(afterRestore.pendingVerification).toBe(true);
    expect(afterRestore.pendingSince).toBe(1_000);
  });

  it('revokes a pending unlock after 14 days without successful verification', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    entitlementGrantConfig.now = () => 1_000;
    await setProUnlocked(true, { pendingVerification: true, now: 1_000 });
    expect(await isPendingVerification()).toBe(true);

    entitlementGrantConfig.now = () => 1_000 + PENDING_MAX_AGE_MS;
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);

    entitlementGrantConfig.now = () => 1_000 + PENDING_MAX_AGE_MS + 1;
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(false);
    expect(await isPendingVerification()).toBe(false);
  });

  it('clears pendingVerification when verification succeeds', async () => {
    const iap = require('expo-iap');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await setProUnlocked(true, { pendingVerification: true, now: 1_000 });
    expect(await isPendingVerification()).toBe(true);

    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.isTransactionVerifiedIOS.mockResolvedValue(true);
    expect(await grantFullpackPurchase({ productId: FULLPACK, transactionId: 'tx-ok' })).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(await isPendingVerification()).toBe(false);
    expect(await AsyncStorage.getItem('stretch/proUnlocked/v1')).toBe('1');
  });

  it('does not unlock a pending purchase', async () => {
    expect(await grantFullpackPurchase({
      productId: FULLPACK,
      purchaseState: 'pending',
    })).toBe(false);
    expect(await isProUnlocked()).toBe(false);
  });

  it('shows Redeem Code next to Restore on iOS only', () => {
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/PaywallScreen.tsx'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf8');
    expect(paywall).toMatch(/settings\.restore/);
    expect(paywall).toMatch(/canPresentRedeemCode/);
    expect(settings).toMatch(/settings\.restore/);
    expect(settings).toMatch(/canPresentRedeemCode/);
    expect(canPresentRedeemCode('ios')).toBe(true);
    expect(canPresentRedeemCode('android')).toBe(false);
  });

  it('presents the App Store code redemption sheet on iOS', async () => {
    const iap = require('expo-iap');
    expect(Platform.OS).toBe('ios');
    const r = await presentRedeemCodeSheet();
    expect(r.ok).toBe(true);
    expect(iap.presentCodeRedemptionSheet).toHaveBeenCalled();
  });

  it('verifyProOnLaunch grants a matching entitlement even if JWS is false', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);
    iap.getAvailablePurchases.mockResolvedValueOnce([{ productId: FULLPACK }]);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
    expect(await getEmptyPurchaseStreak()).toBe(0);
    expect(await isPendingVerification()).toBe(false);
  });

  it('never enables IAP simulation on the production profile', () => {
    const eas = require('../eas.json');
    expect(eas.build.production.env.EXPO_PUBLIC_IAP_SIMULATE).toBeUndefined();
    expect(JSON.stringify(eas.build.production)).not.toMatch(/IAP_SIMULATE/);
    expect(eas.build.preview.env.EXPO_PUBLIC_IAP_SIMULATE).toBe('1');
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '1';
    expect(allowSimulate()).toBe(false);
  });

  it('shows a disabled processing state on paywall and settings while purchase or restore runs', () => {
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/PaywallScreen.tsx'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf8');
    expect(paywall).toMatch(/iap\.processing/);
    expect(paywall).toMatch(/ActivityIndicator/);
    expect(paywall).toMatch(/disabled=\{busy \|\| pro\}/);
    expect(paywall).toMatch(/busyLock/);
    expect(settings).toMatch(/iap\.processing/);
    expect(settings).toMatch(/ActivityIndicator/);
    expect(settings).toMatch(/disabled=\{busy\}/);
    expect(settings).toMatch(/busyLock/);
    expect(paywall).toMatch(/runIapBusy/);
    expect(settings).toMatch(/runIapBusy/);
  });

  it('restore on unavailable IAP resolves instead of hanging', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    const origInit = iap.initConnection;
    iap.initConnection = undefined;
    try {
      const r = await restoreProUnlock();
      expect(r.ok).toBe(false);
      expect(r.restored).toBe(false);
      expect(r.error).toBeTruthy();
    } finally {
      iap.initConnection = origInit;
    }
  });

  it('times out a hung restore so loading can clear', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    iap.initConnection.mockImplementation(() => new Promise(() => {}));
    iapActionConfig.timeoutMs = 30;
    const r = await restoreProUnlock();
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.error).toMatch(/稍後再試/);
  });

  it('runIapBusy clears loading after the UI timeout', async () => {
    iapActionConfig.timeoutMs = 20;
    const r = await runIapBusy(() => new Promise(() => {}));
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.error).toMatch(/稍後再試/);
  });

  it('does not treat web as a native IAP platform', () => {
    expect(isNativeIapPlatform('web')).toBe(false);
    expect(isNativeIapPlatform('ios')).toBe(true);
    expect(IAP_UI_TIMEOUT_MS).toBe(15_000);
  });

  it('starts the 14-day window from now when pending has neither pendingSince nor ts', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('stretch/proUnlocked/v1', JSON.stringify({
      unlocked: true,
      source: 'event',
    }));
    expect(parseProRecord(JSON.stringify({ unlocked: true, source: 'event' }))).toMatchObject({
      pendingVerification: true,
      pendingSince: undefined,
    });
    const rec = await getProRecord(9_000);
    expect(rec.pendingVerification).toBe(true);
    expect(rec.pendingSince).toBe(9_000);
    const stored = JSON.parse(await AsyncStorage.getItem('stretch/proUnlocked/v1'));
    expect(stored.pendingSince).toBe(9_000);
    expect(stored.ts).toBe(9_000);
  });
});
