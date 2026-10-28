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
} from '../src/lib/iap';
import { isProUnlocked, isProPersisted, clearProUnlocked, setProUnlocked, subscribePro, getEmptyPurchaseStreak } from '../src/lib/entitlements';

const realEntitlementSleep = entitlementGrantConfig.sleep.bind(entitlementGrantConfig);

const FULLPACK = process.env.EXPO_PUBLIC_IAP_PRODUCT_ID || 'com.beenages.app.fullpack';

describe('iap entitlement helpers', () => {
  it('uses the App Store Full Pack product id', () => {
    expect(FULLPACK).toBe('com.beenages.app.fullpack');
    expect(CANONICAL_PRO_PRODUCT_ID).toBe('com.beenages.app.fullpack');
    expect(PRO_PRODUCT_ID).toBe('com.beenages.app.fullpack');
    expect(purchaseMatches({ productId: FULLPACK })).toBe(true);
    expect(purchaseMatches({ id: FULLPACK })).toBe(true);
    expect(purchaseMatches({ sku: FULLPACK })).toBe(true);
    expect(purchaseMatches({ ids: [FULLPACK] })).toBe(true);
    expect(purchaseMatches({ productId: 'com.other.app.sku' })).toBe(false);
    expect(purchaseMatches({ id: '100000012345' })).toBe(false);
  });

  it('ignores EXPO_PUBLIC_IAP_PRODUCT_ID override in production builds', () => {
    expect(resolveProProductId({
      override: 'com.other.app.sku',
      dev: false,
      profile: 'production',
    })).toBe(CANONICAL_PRO_PRODUCT_ID);
    expect(resolveProProductId({
      override: 'com.other.app.sku',
      dev: true,
      profile: 'production',
    })).toBe(CANONICAL_PRO_PRODUCT_ID);
    expect(resolveProProductId({
      override: 'com.dev.app.sku',
      dev: true,
      profile: '',
    })).toBe('com.dev.app.sku');
    expect(resolveProProductId({
      override: 'com.preview.app.sku',
      dev: false,
      profile: 'preview',
    })).toBe('com.preview.app.sku');
    expect(resolveProProductId({
      override: 'com.other.app.sku',
      dev: false,
      profile: '',
    })).toBe(CANONICAL_PRO_PRODUCT_ID);
    expect(resolveProProductId({
      override: '   ',
      dev: true,
      profile: 'preview',
    })).toBe(CANONICAL_PRO_PRODUCT_ID);

    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/iap.js'), 'utf8');
    expect(src).toMatch(/export const PRO_PRODUCT_ID = resolveProProductId\(\)/);
    expect(src).toMatch(/profile === 'production'/);
    expect(src).toMatch(/dev === true/);
  });

  it('treats pending and revoked rows as not entitled', () => {
    expect(isPendingPurchase({ productId: FULLPACK, purchaseState: 'pending' })).toBe(true);
    expect(isPendingPurchase({ productId: FULLPACK, purchaseStateAndroid: 2 })).toBe(true);
    expect(isPendingPurchase({ productId: FULLPACK, transactionStateIOS: 4 })).toBe(true);
    expect(isPendingPurchase({ productId: FULLPACK, purchaseState: 'purchased' })).toBe(false);
    expect(isRevoked({ productId: FULLPACK, revocationDate: '2026-01-01' })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, revocationDateIOS: 1 })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, revoked: true })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, purchaseState: 'revoked' })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, transactionReason: 'REVOKED' })).toBe(true);
    expect(isRevoked({ productId: FULLPACK, revocationReasonIOS: 1 })).toBe(true);
    expect(isRevoked({ productId: FULLPACK })).toBe(false);
    expect(isEntitledPurchase({ productId: FULLPACK })).toBe(true);
    expect(isEntitledPurchase({ productId: FULLPACK, purchaseState: 'purchased' })).toBe(true);
    expect(isEntitledPurchase({ productId: FULLPACK, purchaseState: 'pending' })).toBe(false);
    expect(isEntitledPurchase({ productId: FULLPACK, revocationDateIOS: 99 })).toBe(false);
    expect(isEntitledPurchase({ productId: FULLPACK, purchaseState: 'revoked' })).toBe(false);
    expect(isEntitledPurchase({ productId: 'com.other.app.sku' })).toBe(false);
  });

  it('classifies already-owned, cancel, and deferred store errors', () => {
    expect(isAlreadyOwnedError({ code: 'E_ALREADY_OWNED' })).toBe(true);
    expect(isAlreadyOwnedError({ code: 'already-owned' })).toBe(true);
    expect(isAlreadyOwnedError({ message: 'This In-App Purchase has already been bought' })).toBe(true);
    expect(isUserCancelledError({ code: 'E_USER_CANCELLED' })).toBe(true);
    expect(isUserCancelledError({ code: 'user-cancelled' })).toBe(true);
    expect(isDeferredError({ code: 'E_DEFERRED' })).toBe(true);
    expect(isDeferredError({ code: 'deferred-payment' })).toBe(true);
    expect(isDeferredError({ message: 'Timed out waiting for purchase' })).toBe(false);
  });

  it('rebuilds Pro from entitlements and does not revoke on a single empty list', () => {
    const hit = decideUnlockFromPurchases([{ productId: FULLPACK }], { currentlyUnlocked: false, emptyStreak: 2 });
    expect(hit).toEqual({ unlocked: true, emptyStreak: 0, revoke: false, entitled: true });

    const keep = decideUnlockFromPurchases([], { currentlyUnlocked: true, emptyStreak: 0 });
    expect(keep).toEqual({
      unlocked: true,
      emptyStreak: 1,
      revoke: false,
      entitled: false,
    });

    const explicitRevoke = decideUnlockFromPurchases(
      [{ productId: FULLPACK, revocationDate: '2026-01-01' }],
      { currentlyUnlocked: true, emptyStreak: 0 },
    );
    expect(explicitRevoke).toEqual({
      unlocked: false,
      emptyStreak: 0,
      revoke: true,
      entitled: false,
    });

    const revokedState = decideUnlockFromPurchases(
      [{ productId: FULLPACK, purchaseState: 'revoked' }],
      { currentlyUnlocked: true, emptyStreak: EMPTY_LIST_REVOKE_AFTER - 2 },
    );
    expect(revokedState.unlocked).toBe(false);
    expect(revokedState.revoke).toBe(true);
    expect(revokedState.emptyStreak).toBe(0);

    const drop = decideUnlockFromPurchases([], {
      currentlyUnlocked: true,
      emptyStreak: EMPTY_LIST_REVOKE_AFTER - 1,
    });
    expect(drop).toEqual({
      unlocked: false,
      emptyStreak: EMPTY_LIST_REVOKE_AFTER,
      revoke: true,
      entitled: false,
    });

    const unverifiedStillEntitled = decideUnlockFromPurchases(
      [{ productId: FULLPACK }],
      { currentlyUnlocked: true, emptyStreak: 2 },
    );
    expect(unverifiedStillEntitled.entitled).toBe(true);
    expect(unverifiedStillEntitled.revoke).toBe(false);
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
    iap.purchaseErrorListener.mockClear();
    iap.presentCodeRedemptionSheet.mockClear();
    iap.presentCodeRedemptionSheetIOS.mockClear();
    iap.getAvailablePurchases.mockClear();
    iap.currentEntitlementIOS.mockClear();
    iap.requestPurchase.mockClear();
    iap.isTransactionVerifiedIOS.mockReset();
    iap.isTransactionVerifiedIOS.mockResolvedValue(true);
    await clearProUnlocked();
  });

  afterEach(async () => {
    await stopPurchaseUpdates();
    entitlementGrantConfig.sleep = realEntitlementSleep;
    entitlementGrantConfig.retryDelaysMs = [1000, 3000];
  });

  it('simulates purchase in test env', async () => {
    const result = await purchaseProUnlock();
    expect(result.ok).toBe(true);
    const pro = await isProUnlocked();
    expect(pro).toBe(true);
  });

  it('simulates restore in test env', async () => {
    const result = await restoreProUnlock();
    expect(result.ok).toBe(true);
  });

  it('does not revoke Pro on launch in IAP_SIMULATE mode', async () => {
    await setProUnlocked(true);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
  });

  it('reads StoreKit displayPrice and never hardcodes a fallback', async () => {
    const price = await getProDisplayPrice();
    expect(price).toBe('NT$90');
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/PaywallScreen.js'), 'utf8');
    expect(paywall).not.toMatch(/NT\$90/);
    expect(paywall).not.toMatch(/US\$2\.99/);
    expect(paywall).toMatch(/paywall\.once/);
    expect(paywall).toMatch(/paywall\.priceFail/);
    expect(paywall).not.toMatch(/iCloud/);
    expect(paywall).not.toMatch(/v1\.2/);
    expect(paywall).toMatch(/displayPrice|getProDisplayPrice/);
  });

  it('registers a persistent purchase listener at app start', async () => {
    const iap = require('expo-iap');
    const app = require('fs').readFileSync(require('path').join(__dirname, '../src/App.js'), 'utf8');
    expect(app).toMatch(/startPurchaseUpdates/);
    await startPurchaseUpdates();
    expect(iap.initConnection).toHaveBeenCalled();
    expect(iap.purchaseUpdatedListener).toHaveBeenCalled();
  });

  it('unlocks Pro from a fullpack purchase-updated event and finishes the transaction', async () => {
    const iap = require('expo-iap');
    await startPurchaseUpdates();
    expect(await isProUnlocked()).toBe(false);
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
    expect(iap.isTransactionVerifiedIOS).toHaveBeenCalledWith(FULLPACK);
    expect(iap.getAvailablePurchases).toHaveBeenCalled();
    expect(entitlementGrantConfig.sleep).not.toHaveBeenCalled();
    expect(await isProPersisted()).toBe(true);
  });

  it('ignores purchase-updated events for other products', async () => {
    const iap = require('expo-iap');
    await startPurchaseUpdates();
    expect(await grantFullpackPurchase({ productId: 'com.other.app.sku' })).toBe(false);
    iap.__emitPurchaseUpdated({ productId: 'com.other.app.sku' });
    await new Promise((r) => setImmediate(r));
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('still unlocks when isTransactionVerifiedIOS fails, throws, or is missing', async () => {
    const iap = require('expo-iap');
    iap.getAvailablePurchases.mockResolvedValue([{ productId: FULLPACK }]);
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(await isProPersisted()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalledWith({
      purchase: { productId: FULLPACK },
      isConsumable: false,
    });
    expect(iap.getAvailablePurchases).toHaveBeenCalled();
    expect(entitlementGrantConfig.sleep).not.toHaveBeenCalled();

    await clearProUnlocked();
    iap.finishTransaction.mockClear();
    iap.isTransactionVerifiedIOS.mockRejectedValue(new Error('storekit'));
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(await isProPersisted()).toBe(true);

    await clearProUnlocked();
    iap.finishTransaction.mockClear();
    iap.isTransactionVerifiedIOS.mockResolvedValue(undefined);
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);

    await clearProUnlocked();
    const orig = iap.isTransactionVerifiedIOS;
    iap.isTransactionVerifiedIOS = undefined;
    try {
      expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
      expect(await isProUnlocked()).toBe(true);
      expect(await isProPersisted()).toBe(true);
      expect(iap.finishTransaction).toHaveBeenCalled();
    } finally {
      iap.isTransactionVerifiedIOS = orig;
    }
  });

  it('retries entitlement reads after purchase then persists when Full Pack appears', async () => {
    const iap = require('expo-iap');
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.getAvailablePurchases
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ productId: FULLPACK }]);

    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    expect(entitlementGrantConfig.sleep.mock.calls.map((c) => c[0])).toEqual([1000, 3000]);
    expect(await isProUnlocked()).toBe(true);
    expect(await isProPersisted()).toBe(true);
  });

  it('persists unlock after empty entitlement retries only if verification returned true', async () => {
    const iap = require('expo-iap');
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.isTransactionVerifiedIOS.mockResolvedValue(true);

    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    expect(entitlementGrantConfig.sleep).toHaveBeenCalledTimes(2);
    expect(await isProUnlocked()).toBe(true);
    expect(await isProPersisted()).toBe(true);
  });

  it('unlocks the current session only when entitlements stay empty and verification is not true', async () => {
    const iap = require('expo-iap');
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);

    const unlocked = new Promise((resolve) => {
      const unsub = subscribePro((v) => {
        if (v) {
          unsub();
          resolve();
        }
      });
    });
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    await unlocked;
    expect(await isProUnlocked()).toBe(true);
    expect(await isProPersisted()).toBe(false);
    expect(entitlementGrantConfig.sleep.mock.calls.map((c) => c[0])).toEqual([1000, 3000]);

    await clearProUnlocked();
    iap.isTransactionVerifiedIOS.mockRejectedValue(new Error('storekit'));
    expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(await isProPersisted()).toBe(false);

    await clearProUnlocked();
    const orig = iap.isTransactionVerifiedIOS;
    iap.isTransactionVerifiedIOS = undefined;
    try {
      expect(await grantFullpackPurchase({ productId: FULLPACK })).toBe(true);
      expect(await isProUnlocked()).toBe(true);
      expect(await isProPersisted()).toBe(false);
    } finally {
      iap.isTransactionVerifiedIOS = orig;
    }
  });

  it('rejects a transaction with revocationDate and does not finish it', async () => {
    const iap = require('expo-iap');
    expect(await grantFullpackPurchase({
      productId: FULLPACK,
      revocationDate: '2026-10-01T00:00:00.000Z',
    })).toBe(false);
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
    expect(iap.isTransactionVerifiedIOS).not.toHaveBeenCalled();
  });

  it('does not unlock a pending Ask-to-Buy / Play pending purchase', async () => {
    const iap = require('expo-iap');
    expect(await grantFullpackPurchase({
      productId: FULLPACK,
      purchaseState: 'pending',
    })).toBe(false);
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('reports purchase success after finishing and re-reading entitlements', async () => {
    const iap = require('expo-iap');
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);
    const result = await purchaseProUnlock();
    expect(result.ok).toBe(true);
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).toHaveBeenCalled();
    expect(iap.getAvailablePurchases).toHaveBeenCalled();
  });

  it('unlocks on E_ALREADY_OWNED by restoring current entitlements', async () => {
    const iap = require('expo-iap');
    iap.requestPurchase.mockRejectedValueOnce({
      code: 'E_ALREADY_OWNED',
      message: 'already owned',
    });
    iap.getAvailablePurchases.mockResolvedValueOnce([{ productId: FULLPACK }]);
    const result = await purchaseProUnlock();
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(true);
    expect(await isProUnlocked()).toBe(true);
  });

  it('unlocks on already-owned purchaseErrorListener by restoring entitlements', async () => {
    const iap = require('expo-iap');
    iap.requestPurchase.mockImplementationOnce(async () => {
      setTimeout(() => {
        iap.__emitPurchaseError({ code: 'already-owned', message: 'already owned' });
      }, 5);
    });
    iap.getAvailablePurchases.mockResolvedValue([{ productId: FULLPACK }]);
    const result = await purchaseProUnlock();
    expect(result.ok).toBe(true);
    expect(await isProUnlocked()).toBe(true);
  });

  it('shows Redeem Code next to Restore on iOS only', () => {
    const paywall = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/PaywallScreen.js'), 'utf8');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/SettingsScreen.js'), 'utf8');
    expect(paywall).toMatch(/settings\.restore/);
    expect(paywall).toMatch(/iap\.restored/);
    expect(paywall).toMatch(/settings\.redeem/);
    expect(paywall).toMatch(/canPresentRedeemCode/);
    expect(paywall).toMatch(/presentRedeemCodeSheet/);
    expect(settings).toMatch(/settings\.restore/);
    expect(settings).toMatch(/iap\.restored/);
    expect(settings).toMatch(/settings\.redeem/);
    expect(settings).toMatch(/canPresentRedeemCode/);
    expect(settings).toMatch(/presentRedeemCodeSheet/);
    expect(canPresentRedeemCode('ios')).toBe(true);
    expect(canPresentRedeemCode('android')).toBe(false);
    expect(canPresentRedeemCode('web')).toBe(false);
  });

  it('presents the App Store code redemption sheet on iOS', async () => {
    const iap = require('expo-iap');
    expect(Platform.OS).toBe('ios');
    const r = await presentRedeemCodeSheet();
    expect(r.ok).toBe(true);
    expect(iap.presentCodeRedemptionSheet).toHaveBeenCalled();
  });

  it('restore unlocks from a matching entitlement without requiring JWS true', async () => {
    const iap = require('expo-iap');
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);
    iap.getAvailablePurchases.mockResolvedValueOnce([
      { productId: 'com.other.app.sku' },
      { productId: FULLPACK },
    ]);
    const r = await restoreProUnlock();
    expect(r).toEqual({ ok: true, restored: true });
    expect(await isProUnlocked()).toBe(true);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('restore skips revoked and pending matches', async () => {
    const iap = require('expo-iap');
    iap.getAvailablePurchases.mockResolvedValueOnce([
      { productId: FULLPACK, revocationDate: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(await restoreProUnlock()).toEqual({ ok: true, restored: false });
    expect(await isProUnlocked()).toBe(false);

    iap.getAvailablePurchases.mockResolvedValueOnce([
      { productId: FULLPACK, purchaseState: 'pending' },
    ]);
    expect(await restoreProUnlock()).toEqual({ ok: true, restored: false });
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('verifyProOnLaunch grants a matching entitlement even if JWS is false', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    iap.isTransactionVerifiedIOS.mockResolvedValue(false);

    iap.getAvailablePurchases.mockResolvedValueOnce([{ productId: FULLPACK }]);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
    expect(await getEmptyPurchaseStreak()).toBe(0);
  });

  it('verifyProOnLaunch keeps Pro across empty lists until the streak, and does not revoke on throw', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';

    await setProUnlocked(true);
    iap.getAvailablePurchases.mockResolvedValue([]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    await verifyProOnLaunch();
    expect(await getEmptyPurchaseStreak()).toBe(1);
    expect(await isProUnlocked()).toBe(true);
    await verifyProOnLaunch();
    expect(await getEmptyPurchaseStreak()).toBe(2);
    expect(await isProUnlocked()).toBe(true);
    await verifyProOnLaunch();
    expect(await getEmptyPurchaseStreak()).toBe(3);
    expect(await isProUnlocked()).toBe(false);
    expect(iap.finishTransaction).not.toHaveBeenCalled();

    await setProUnlocked(true);
    iap.getAvailablePurchases.mockRejectedValue(new Error('offline'));
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(true);
    expect(await getEmptyPurchaseStreak()).toBe(0);
  });

  it('verifyProOnLaunch revokes Pro immediately when Full Pack has a revocationDate', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    await setProUnlocked(true);
    iap.getAvailablePurchases.mockResolvedValue([
      { productId: FULLPACK, revocationDate: '2026-01-01T00:00:00.000Z' },
    ]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(false);
    expect(await isProPersisted()).toBe(false);
    expect(await getEmptyPurchaseStreak()).toBe(0);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('verifyProOnLaunch revokes Pro immediately on revoked state without waiting for empty-list streak', async () => {
    const iap = require('expo-iap');
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '0';
    await setProUnlocked(true);
    iap.getAvailablePurchases.mockResolvedValue([
      { productId: FULLPACK, purchaseState: 'revoked' },
    ]);
    iap.currentEntitlementIOS.mockResolvedValue(null);
    await verifyProOnLaunch();
    expect(await isProUnlocked()).toBe(false);
    expect(await isProPersisted()).toBe(false);
    expect(await getEmptyPurchaseStreak()).toBe(0);
  });

  it('never enables IAP simulation on the production profile', () => {
    const eas = require('../eas.json');
    expect(eas.build.production.env.EXPO_PUBLIC_IAP_SIMULATE).toBeUndefined();
    expect(JSON.stringify(eas.build.production)).not.toMatch(/IAP_SIMULATE/);
    expect(eas.build.production.env.EXPO_PUBLIC_EAS_BUILD_PROFILE).toBe('production');
    expect(eas.build.preview.env.EXPO_PUBLIC_IAP_SIMULATE).toBe('1');

    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_IAP_SIMULATE = '1';
    expect(allowSimulate()).toBe(false);

    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/iap.js'), 'utf8');
    expect(src).toMatch(/easBuildProfile\(\) === 'production'/);
    expect(src).toMatch(/__DEV__/);
    expect(src).not.toMatch(/EXPO_PUBLIC_IAP_SIMULATE === '1'\) return true/);
  });
});
