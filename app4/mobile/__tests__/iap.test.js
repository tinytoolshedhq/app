import { Platform } from 'react-native';
import {
  FULLPACK_PRODUCT_ID,
  CANONICAL_PRO_PRODUCT_ID,
  PRO_PRODUCT_ID,
  IAP_UI_TIMEOUT_MS,
  EMPTY_LIST_REVOKE_AFTER,
  allowSimulate,
  canPresentRedeemCode,
  decideUnlockFromPurchases,
  entitlementGrantConfig,
  finishUnfinishedPurchases,
  grantDedupeKey,
  grantFullpackPurchase,
  iapActionConfig,
  isEntitledPurchase,
  isNativeIapPlatform,
  isPendingPurchase,
  isRevoked,
  presentRedeemCodeSheet,
  purchaseMatches,
  purchaseProUnlock,
  purchaseTransactionId,
  resolveProProductId,
  restoreProUnlock,
  runIapBusy,
  startPurchaseUpdates,
  stopPurchaseUpdates,
  verifyProOnLaunch,
} from '../src/lib/iap';
import {
  PENDING_MAX_AGE_MS,
  clearProUnlocked,
  getEmptyPurchaseStreak,
  getProRecord,
  isPendingVerification,
  isProUnlocked,
  parseProRecord,
  setProUnlocked,
  subscribePro,
} from '../src/lib/entitlements';
import { mapIapError, mapRestoreError, iapFailureAlertTitle } from '../src/lib/iapErrors';
import { setLocale, t } from '../src/i18n';

const realEntitlementSleep = entitlementGrantConfig.sleep.bind(entitlementGrantConfig);
const realNow = entitlementGrantConfig.now.bind(entitlementGrantConfig);
const realIapTimeoutMs = iapActionConfig.timeoutMs;
const FULLPACK = 'com.tinytoolshed.decibelmeter.fullpack';

describe('product id', () => {
  it('uses the App Store Full Pack id and does not derive it from the bundle id', () => {
    expect(FULLPACK_PRODUCT_ID).toBe(FULLPACK);
    expect(CANONICAL_PRO_PRODUCT_ID).toBe(FULLPACK);
    expect(PRO_PRODUCT_ID).toBe(FULLPACK);
    const app = require('../app.json');
    expect(app.expo.ios.bundleIdentifier).toBe('com.tinytoolshed.decibelmeter');
    expect(FULLPACK_PRODUCT_ID).toBe(`${app.expo.ios.bundleIdentifier}.fullpack`);
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
});

describe('entitlement helpers', () => {
  it('treats pending and revoked rows as not entitled', () => {
    expect(isPendingPurchase({ productId: FULLPACK, purchaseState: 'pending' })).toBe(true);
    expect(isPendingPurchase({ productId: FULLPACK, purchaseStateAndroid: 2 })).toBe(true);
    expect(isPendingPurchase({ productId: FULLPACK, transactionStateIOS: 4 })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, revocationDate: '2026-01-01' })).toBe(true);
    expect(isEntitledPurchase({ productId: FULLPACK })).toBe(true);
    expect(isEntitledPurchase({ productId: FULLPACK, purchaseState: 'pending' })).toBe(false);
  });

  it('rebuilds Pro from entitlements and does not revoke on a single empty list', () => {
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

  it('parses pendingVerification and 14-day expiry', () => {
    expect(parseProRecord('1')).toEqual({
      unlocked: true,
      pendingVerification: false,
      source: 'store',
    });
    expect(parseProRecord(JSON.stringify({ unlocked: true, source: 'event', ts: 42 }))).toMatchObject({
      pendingVerification: true,
      pendingSince: 42,
    });
    expect(PENDING_MAX_AGE_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('dedupes purchase grants by transactionId', () => {
    const a = { productId: FULLPACK, transactionId: '100000012345' };
    const b = { productId: FULLPACK, transactionId: '100000012345', purchaseToken: 'jws' };
    expect(purchaseTransactionId(a)).toBe('100000012345');
    expect(grantDedupeKey(a)).toBe(grantDedupeKey(b));
  });
});

describe('iap flows', () => {
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

  it('after a successful purchase, grants Pro then finishTransaction(isConsumable false)', async () => {
    const iap = require('expo-iap');
    const purchase = { productId: FULLPACK, transactionId: 'tx-finish' };
    iap.getAvailablePurchases.mockResolvedValue([purchase]);
    const order = [];
    iap.finishTransaction.mockImplementation(async () => {
      order.push('finish');
    });
    const unsub = subscribePro((v) => {
      if (v) order.push('grant');
    });
    expect(await grantFullpackPurchase(purchase)).toBe(true);
    unsub();
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase,
      isConsumable: false,
    });
    expect(order.indexOf('grant')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('finish')).toBeGreaterThan(order.indexOf('grant'));
  });

  it('restore uses getAvailablePurchases, grants Pro, and finishes leftover transactions', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    const purchase = { productId: FULLPACK, transactionId: 'tx-restore' };
    iap.getAvailablePurchases.mockResolvedValue([purchase]);
    const r = await restoreProUnlock();
    expect(r).toMatchObject({ ok: true, restored: true, message: t('iap.restored') });
    expect(await isProUnlocked()).toBe(true);
    expect(iap.getAvailablePurchases).toHaveBeenCalled();
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase,
      isConsumable: false,
    });
  });

  it('treats E_ALREADY_OWNED as restore: grant Pro, finish, restored message', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    const purchase = { productId: FULLPACK, transactionId: 'tx-owned' };
    iap.requestPurchase.mockRejectedValueOnce({
      code: 'E_ALREADY_OWNED',
      message: 'already owned',
    });
    iap.getAvailablePurchases.mockResolvedValue([purchase]);
    const result = await purchaseProUnlock();
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(iap.getAvailablePurchases).toHaveBeenCalled();
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase,
      isConsumable: false,
    });
    expect(result.message).toBe(t('iap.restored'));
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/components/PaywallSheet.js'), 'utf8');
    expect(paywall).toMatch(/if \(r\.ok && r\.restored\) \{[\s\S]*setPro\(true\)/);
  });

  it('already-owned + entitlement found on restore: ok, Pro unlocked, UI unlocks', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    const purchase = { productId: FULLPACK, transactionId: 'tx-owned-restore' };
    let queries = 0;
    iap.getAvailablePurchases.mockImplementation(async () => {
      queries += 1;
      if (queries === 1) {
        const err = new Error('already owned');
        err.code = 'E_ALREADY_OWNED';
        throw err;
      }
      return [purchase];
    });
    const unlocked = [];
    const unsub = subscribePro((v) => {
      if (v) unlocked.push(true);
    });
    const r = await restoreProUnlock();
    unsub();
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(true);
    expect(r.message).toBe(t('iap.restored'));
    expect(r.error).toBeUndefined();
    expect(await isProUnlocked()).toBe(true);
    expect(unlocked.length).toBeGreaterThan(0);
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase,
      isConsumable: false,
    });
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/components/PaywallSheet.js'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/components/SettingsSheet.js'), 'utf8');
    expect(paywall).toMatch(/if \(r\.ok && r\.restored !== false\) \{[\s\S]*setPro\(true\)/);
    expect(settings).toMatch(/if \(r\.ok && r\.restored !== false\)/);
  });

  it('already-owned + entitlement not found: ok false, no unlock, restore-again message', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE = 'production';
    iap.requestPurchase.mockRejectedValueOnce({
      code: 'E_ALREADY_OWNED',
      message: 'already owned',
    });
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    const buy = await purchaseProUnlock();
    expect(buy.ok).toBe(false);
    expect(buy.restored).toBe(false);
    expect(buy.error).toBe(t('iap.restoreAgain'));
    expect(buy.error).not.toBe(t('iap.restored'));
    expect(await isProUnlocked()).toBe(false);

    iap.restorePurchases.mockRejectedValueOnce({
      code: 'E_ALREADY_OWNED',
      message: 'already owned',
    });
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    const restore = await restoreProUnlock();
    expect(restore.ok).toBe(false);
    expect(restore.restored).toBe(false);
    expect(restore.error).toBe(t('iap.restoreAgain'));
    expect(restore.error).toBe("Couldn’t confirm this purchase. Tap Restore Purchases and try again.");
    expect(restore.error).not.toBe(t('iap.restored'));
    expect(await isProUnlocked()).toBe(false);
    expect(mapIapError({ code: 'E_ALREADY_OWNED' })).toBe(t('iap.restoreAgain'));
    expect(mapRestoreError({ code: 'E_ALREADY_OWNED' })).toBe(t('iap.restoreAgain'));
    setLocale('zh-Hant');
    expect(t('iap.restoreAgain')).toBe('還確認不到這筆購買，請再點一次「恢復購買」。');
    expect(iapFailureAlertTitle(t('iap.restoreAgain'))).toBe('恢復購買');
    setLocale('en');
    expect(iapFailureAlertTitle(t('iap.restoreAgain'))).toBe('Restore Purchases');
    expect(iapFailureAlertTitle(t('iap.buyFail'))).toBe(t('common.fail'));
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/components/PaywallSheet.js'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/components/SettingsSheet.js'), 'utf8');
    expect(paywall).toMatch(/iapFailureAlertTitle\(buyError\)/);
    expect(paywall).toMatch(/iapFailureAlertTitle\(r\.error\)/);
    expect(settings).toMatch(/iapFailureAlertTitle\(r\.error\)/);
  });

  it('already-owned from getAvailablePurchases during grant fails closed', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    iap.getAvailablePurchases.mockRejectedValue({
      code: 'E_ALREADY_OWNED',
      message: 'already owned',
    });
    iap.isTransactionVerifiedIOS.mockResolvedValue(true);
    const granted = await grantFullpackPurchase({
      productId: FULLPACK,
      transactionId: 'tx-owned-grant-miss',
    });
    expect(granted).toBe(false);
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('finishes unfinished Full Pack transactions found on launch', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    const leftover = { productId: FULLPACK, transactionId: 'tx-launch' };
    iap.getAvailablePurchases.mockResolvedValue([leftover]);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase: leftover,
      isConsumable: false,
    });
  });

  it('finishUnfinishedPurchases skips pending rows', async () => {
    const iap = require('expo-iap');
    await finishUnfinishedPurchases([
      { productId: FULLPACK, purchaseState: 'pending' },
      { productId: 'other' },
    ], iap);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('unlocks from a purchase-updated listener and finishes the transaction', async () => {
    const iap = require('expo-iap');
    await startPurchaseUpdates();
    const unlocked = new Promise((resolve) => {
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

  it('does not unlock a pending Ask-to-Buy purchase', async () => {
    const iap = require('expo-iap');
    expect(await grantFullpackPurchase({
      productId: FULLPACK,
      purchaseState: 'pending',
    })).toBe(false);
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('revokes a pending unlock after 14 days without successful verification', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    entitlementGrantConfig.now = () => 1_000;
    await setProUnlocked(true, { pendingVerification: true, now: 1_000 });
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

  it('does not revoke unlock on launch in IAP_SIMULATE mode', async () => {
    await setProUnlocked(true);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
  });

  it('never enables IAP simulation on the production profile', () => {
    const eas = require('../eas.json');
    expect(eas.build.production.env.EXPO_PUBLIC_IAP_SIMULATE).toBeUndefined();
    expect(JSON.stringify(eas.build.production)).not.toMatch(/IAP_SIMULATE/);
    expect(eas.build.preview.env.EXPO_PUBLIC_IAP_SIMULATE).toBe('1');
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '1';
    expect(allowSimulate()).toBe(false);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/iap.js'), 'utf8');
    expect(src).toMatch(/easBuildProfile\(\) === 'production'/);
    expect(src).not.toMatch(/EXPO_PUBLIC_IAP_SIMULATE === '1'\) return true/);
  });

  it('times out hung restore so loading can clear', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    iap.initConnection.mockImplementation(() => new Promise((resolve) => {
      setTimeout(resolve, 80);
    }));
    iapActionConfig.timeoutMs = 20;
    const r = await restoreProUnlock();
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.error).not.toMatch(/IAP unavailable/i);
    expect(r.error).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 90));
  });

  it('runIapBusy clears loading after the UI timeout', async () => {
    iapActionConfig.timeoutMs = 20;
    let later;
    const r = await runIapBusy(() => new Promise((resolve) => {
      later = resolve;
    }));
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    later({ ok: true });
    expect(IAP_UI_TIMEOUT_MS).toBe(15_000);
    expect(isNativeIapPlatform('web')).toBe(false);
  });

  it('maps purchase errors through i18n', () => {
    expect(mapIapError({ code: 'IAP_UNAVAILABLE', message: 'IAP unavailable' })).not.toBe('IAP unavailable');
  });

  it('restore failures use cannotRestore, not purchase unavailable', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE = 'production';
    iap.initConnection.mockRejectedValueOnce({
      code: 'IAP_UNAVAILABLE',
      message: 'IAP unavailable',
    });
    const r = await restoreProUnlock();
    expect(r.ok).toBe(false);
    expect(r.error).toBe(t('iap.cannotRestore'));
    expect(r.error).toBe("Can’t restore here.");
    expect(r.error).not.toBe(t('iap.unavailable'));
    expect(mapRestoreError({ code: 'IAP_UNAVAILABLE' })).toBe(t('iap.cannotRestore'));
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/components/PaywallSheet.js'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/components/SettingsSheet.js'), 'utf8');
    expect(paywall).toMatch(/r\.error/);
    expect(settings).toMatch(/r\.error/);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/iap.js'), 'utf8');
    expect(src).toMatch(/error: mapRestoreError\(e\)/);
    setLocale('zh-Hant');
    iap.initConnection.mockRejectedValueOnce({ code: 'IAP_UNAVAILABLE' });
    const zh = await restoreProUnlock();
    expect(zh.error).toBe('這裡無法恢復。');
    setLocale('en');
  });

  it('shows Restore on paywall and settings', () => {
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/components/PaywallSheet.js'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/components/SettingsSheet.js'), 'utf8');
    expect(paywall).toMatch(/settings\.restore/);
    expect(paywall).toMatch(/iap\.restored/);
    expect(paywall).toMatch(/runIapBusy/);
    expect(settings).toMatch(/settings\.restore/);
    expect(settings).toMatch(/runIapBusy/);
    expect(canPresentRedeemCode('ios')).toBe(true);
    expect(canPresentRedeemCode('android')).toBe(false);
    expect(Platform.OS).toBe('ios');
  });

  it('presents the App Store code redemption sheet on iOS', async () => {
    const iap = require('expo-iap');
    const r = await presentRedeemCodeSheet();
    expect(r.ok).toBe(true);
    expect(iap.presentCodeRedemptionSheet).toHaveBeenCalled();
  });

  it('registers a purchase listener at app start', async () => {
    const app = require('fs').readFileSync(require('path').join(__dirname, '../src/App.js'), 'utf8');
    expect(app).toMatch(/startPurchaseUpdates/);
    expect(app).toMatch(/verifyProOnLaunch/);
    await startPurchaseUpdates();
    expect(require('expo-iap').purchaseUpdatedListener).toHaveBeenCalled();
  });

  it('starts the 14-day window from now when pending has neither pendingSince nor ts', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('decibelmeter/proUnlocked/v1', JSON.stringify({
      unlocked: true,
      source: 'event',
    }));
    const rec = await getProRecord(9_000);
    expect(rec.pendingVerification).toBe(true);
    expect(rec.pendingSince).toBe(9_000);
    const stored = JSON.parse(await AsyncStorage.getItem('decibelmeter/proUnlocked/v1'));
    expect(stored.pendingVerification).toBe(true);
    expect(stored.pendingSince).toBe(9_000);
    expect(stored.ts).toBe(9_000);
  });

  it('keeps Pro across empty lists until the streak', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    await setProUnlocked(true);
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    await verifyProOnLaunch();
    expect(await getEmptyPurchaseStreak()).toBe(1);
    expect(await isProUnlocked()).toBe(true);
    await verifyProOnLaunch();
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(false);
  });
});
