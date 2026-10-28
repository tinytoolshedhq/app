import { Platform, Alert } from 'react-native';
import {
  setProUnlocked,
  isProUnlocked,
  getEmptyPurchaseStreak,
  setEmptyPurchaseStreak,
} from './entitlements';
import { t } from '../i18n';

export const CANONICAL_PRO_PRODUCT_ID = 'com.beenages.app.fullpack';

export const EMPTY_LIST_REVOKE_AFTER = 3;

/** Backoff before re-reading entitlements after a purchase-updated event. */
export const entitlementGrantConfig = {
  retryDelaysMs: [1000, 3000],
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

function easBuildProfile() {
  return String(
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE || process.env.EAS_BUILD_PROFILE || '',
  );
}

/**
 * Env override is for local / __DEV__ / non-production profiles only.
 * Production builds always use the App Store Full Pack id.
 */
export function resolveProProductId({
  override = process.env.EXPO_PUBLIC_IAP_PRODUCT_ID,
  dev = typeof __DEV__ !== 'undefined' && __DEV__ === true,
  profile = easBuildProfile(),
} = {}) {
  const raw = typeof override === 'string' ? override.trim() : '';
  if (!raw) return CANONICAL_PRO_PRODUCT_ID;
  if (profile === 'production') return CANONICAL_PRO_PRODUCT_ID;
  if (dev === true) return raw;
  if (profile !== '') return raw;
  return CANONICAL_PRO_PRODUCT_ID;
}

export const PRO_PRODUCT_ID = resolveProProductId();

function runningInExpoGo() {
  try {
    const Constants = require('expo-constants').default ?? require('expo-constants');
    return (
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === 'storeClient'
    );
  } catch {
    return false;
  }
}

/** Never true for the EAS production profile, even if the simulate flag leaks in. */
export function allowSimulate() {
  if (easBuildProfile() === 'production') return false;
  if (process.env.EXPO_PUBLIC_IAP_SIMULATE === '0') return false;
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) return true;
  if (runningInExpoGo()) return true;
  return easBuildProfile() !== ''
    && easBuildProfile() !== 'production'
    && process.env.EXPO_PUBLIC_IAP_SIMULATE === '1';
}

function errorBlob(error) {
  return `${error?.code || ''} ${error?.message || error || ''}`;
}

export function isUserCancelledError(error) {
  return /cancel|E_USER_CANCELLED|user-cancelled/i.test(errorBlob(error));
}

export function isAlreadyOwnedError(error) {
  return /already.?owned|E_ALREADY_OWNED|already-owned|already (been )?bought|already purchased/i.test(errorBlob(error));
}

export function isDeferredError(error) {
  return /E_DEFERRED|deferred-payment|(^|[^a-z])deferred([^a-z]|$)/i.test(errorBlob(error));
}

export function purchaseMatches(p, productId = PRO_PRODUCT_ID) {
  return (
    p?.productId === productId ||
    p?.id === productId ||
    p?.sku === productId ||
    (Array.isArray(p?.ids) && p.ids.includes(productId))
  );
}

export function isRevoked(purchase) {
  if (!purchase || typeof purchase !== 'object') return false;
  const d = purchase.revocationDate ?? purchase.revocationDateIOS;
  if (d != null && d !== '' && d !== 0) return true;
  if (purchase.revoked === true) return true;
  const reason = purchase.revocationReason ?? purchase.revocationReasonIOS;
  if (reason != null && reason !== '' && reason !== 0) return true;
  const state = String(
    purchase.purchaseState ?? purchase.transactionState ?? purchase.transactionReason ?? '',
  ).toLowerCase();
  return state === 'revoked' || state === 'refunded';
}

export function isPendingPurchase(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.purchaseState === 'pending') return true;
  if (p.purchaseStateAndroid === 2) return true;
  if (p.transactionStateIOS === 4) return true;
  return false;
}

/** Matching Full Pack that is not pending and not refunded. */
export function isEntitledPurchase(p, productId = PRO_PRODUCT_ID) {
  return purchaseMatches(p, productId) && !isRevoked(p) && !isPendingPurchase(p);
}

/**
 * Pure unlock decision from a StoreKit currentEntitlements-style list.
 * Empty/offline-looking lists do not immediately revoke a valid local unlock.
 */
export function decideUnlockFromPurchases(
  purchases,
  {
    currentlyUnlocked = false,
    emptyStreak = 0,
    revokeAfter = EMPTY_LIST_REVOKE_AFTER,
  } = {},
) {
  if ((purchases || []).some((p) => isEntitledPurchase(p))) {
    return { unlocked: true, emptyStreak: 0, revoke: false, entitled: true };
  }
  if ((purchases || []).some((p) => purchaseMatches(p) && isRevoked(p))) {
    return { unlocked: false, emptyStreak: 0, revoke: true, entitled: false };
  }
  const nextStreak = emptyStreak + 1;
  if (currentlyUnlocked && nextStreak < revokeAfter) {
    return { unlocked: true, emptyStreak: nextStreak, revoke: false, entitled: false };
  }
  return {
    unlocked: false,
    emptyStreak: nextStreak,
    revoke: currentlyUnlocked && nextStreak >= revokeAfter,
    entitled: false,
  };
}

function looksLikePurchase(p) {
  return !!(p && typeof p === 'object' && (p.productId || p.id || p.sku || p.ids));
}

function productSku(purchase) {
  if (purchaseMatches(purchase)) {
    if (purchase?.productId === PRO_PRODUCT_ID) return purchase.productId;
    if (purchase?.sku === PRO_PRODUCT_ID) return purchase.sku;
    if (purchase?.id === PRO_PRODUCT_ID) return purchase.id;
    return PRO_PRODUCT_ID;
  }
  return purchase?.productId || purchase?.sku || PRO_PRODUCT_ID;
}

let keepIapConnection = false;
let purchaseSub = null;

export function canPresentRedeemCode(os = Platform.OS) {
  return os === 'ios';
}

async function endIapIfEphemeral(iap) {
  if (keepIapConnection) return;
  try {
    await iap.endConnection?.();
  } catch {}
}

/**
 * Best-effort StoreKit 2 JWS check. Must not fail closed: expo-iap's
 * isTransactionVerifiedIOS often returns false/throws in sandbox (and
 * immediately after purchaseUpdated) even for a valid Full Pack buy.
 */
async function verifyTransactionBestEffort(iap, purchase) {
  if (typeof iap?.isTransactionVerifiedIOS !== 'function') return null;
  try {
    const ok = await iap.isTransactionVerifiedIOS(productSku(purchase));
    return ok === true;
  } catch {
    return false;
  }
}

async function readCurrentEntitlements(iap) {
  if (typeof iap?.getAvailablePurchases !== 'function') {
    return { ok: false, purchases: [] };
  }
  try {
    const purchases = await iap.getAvailablePurchases();
    if (!Array.isArray(purchases)) return { ok: false, purchases: [] };
    const list = [...purchases];
    if (!list.some((p) => isEntitledPurchase(p)) && typeof iap?.currentEntitlementIOS === 'function') {
      try {
        const one = await iap.currentEntitlementIOS(PRO_PRODUCT_ID);
        if (one) list.push(one);
      } catch {}
    }
    return { ok: true, purchases: list };
  } catch {
    return { ok: false, purchases: [] };
  }
}

async function unlockFromEntitlements(iap) {
  const { purchases } = await readCurrentEntitlements(iap);
  if (purchases.some((p) => isEntitledPurchase(p))) {
    await setProUnlocked(true);
    await setEmptyPurchaseStreak(0);
    return true;
  }
  return false;
}

async function finishIfPossible(iap, purchase) {
  if (typeof iap?.finishTransaction !== 'function') return;
  try {
    await iap.finishTransaction({ purchase, isConsumable: false });
  } catch {}
}

export async function grantFullpackPurchase(purchase) {
  try {
    if (isPendingPurchase(purchase)) return false;
    if (!purchaseMatches(purchase) || isRevoked(purchase)) return false;

    const iap = require('expo-iap');
    const verified = await verifyTransactionBestEffort(iap, purchase);
    await finishIfPossible(iap, purchase);

    if (await unlockFromEntitlements(iap)) return true;

    // Entitlements can lag the purchase-updated event; retry a couple of times
    // before deciding whether to persist the unlock.
    for (const ms of entitlementGrantConfig.retryDelaysMs) {
      await entitlementGrantConfig.sleep(ms);
      if (await unlockFromEntitlements(iap)) return true;
    }

    if (verified === true) {
      await setProUnlocked(true);
      await setEmptyPurchaseStreak(0);
      return true;
    }

    // Visible unlock for this session (sandbox review); next launch rebuilds
    // from StoreKit entitlements instead of a persisted flag.
    await setProUnlocked(true, { persist: false });
    return true;
  } catch {
    return false;
  }
}

export async function startPurchaseUpdates() {
  try {
    const iap = require('expo-iap');
    if (!iap?.initConnection || typeof iap.purchaseUpdatedListener !== 'function') return;
    await iap.initConnection();
    keepIapConnection = true;
    try {
      purchaseSub?.remove?.();
    } catch {}
    purchaseSub = iap.purchaseUpdatedListener((purchase) => {
      grantFullpackPurchase(purchase).catch(() => {});
    });
  } catch {
    keepIapConnection = false;
  }
}

export async function stopPurchaseUpdates() {
  try {
    purchaseSub?.remove?.();
  } catch {}
  purchaseSub = null;
  keepIapConnection = false;
  try {
    const iap = require('expo-iap');
    await iap.endConnection?.();
  } catch {}
}

export async function presentRedeemCodeSheet() {
  if (!canPresentRedeemCode()) return { ok: false, unavailable: true };
  try {
    const iap = require('expo-iap');
    const present = (typeof iap.presentCodeRedemptionSheet === 'function' && iap.presentCodeRedemptionSheet)
      || (typeof iap.presentCodeRedemptionSheetIOS === 'function' && iap.presentCodeRedemptionSheetIOS);
    if (typeof present !== 'function') return { ok: false, unavailable: true };
    if (typeof iap.initConnection === 'function') await iap.initConnection();
    await present();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function waitForPurchaseEvent(iap, timeoutMs = 120000) {
  let settled = false;
  let subUpdate;
  let subError;
  let timer;
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const cleanup = () => {
    try { subUpdate?.remove?.(); } catch {}
    try { subError?.remove?.(); } catch {}
    clearTimeout(timer);
  };

  const finish = (result) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(result);
  };

  subUpdate = iap.purchaseUpdatedListener((purchase) => {
    if (isPendingPurchase(purchase)) {
      finish({ ok: false, pending: true, purchase });
      return;
    }
    if (!purchaseMatches(purchase)) return;
    if (isRevoked(purchase)) return;
    finish({ ok: true, purchase });
  });
  subError = iap.purchaseErrorListener?.((error) => {
    if (isUserCancelledError(error)) {
      finish({ ok: false, cancelled: true });
      return;
    }
    if (isAlreadyOwnedError(error)) {
      finish({ ok: false, alreadyOwned: true });
      return;
    }
    if (isDeferredError(error)) {
      finish({ ok: false, pending: true });
      return;
    }
    const msg = String(error?.message || error?.code || error || t('iap.buyFail'));
    finish({ ok: false, error: msg });
  });
  timer = setTimeout(() => {
    finish({ ok: false, error: t('iap.timeout') });
  }, timeoutMs);

  return {
    promise,
    cancel() {
      finish({ ok: false, skipped: true });
    },
  };
}

async function tryNativeRestore() {
  const iap = require('expo-iap');
  if (!iap?.initConnection || !iap?.getAvailablePurchases) {
    throw new Error('IAP unavailable');
  }

  await iap.initConnection();
  try {
    if (typeof iap.restorePurchases === 'function') {
      try {
        await iap.restorePurchases();
      } catch {
        // continue to query
      }
    }
    if (await unlockFromEntitlements(iap)) {
      return { ok: true, restored: true };
    }
    return { ok: true, restored: false };
  } finally {
    await endIapIfEphemeral(iap);
  }
}

async function tryNativePurchase() {
  const iap = require('expo-iap');
  if (!iap?.initConnection || !iap?.requestPurchase) {
    throw new Error('IAP unavailable');
  }

  await iap.initConnection();
  const waiter = waitForPurchaseEvent(iap);
  try {
    if (typeof iap.fetchProducts === 'function') {
      await iap.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' });
    }

    let returned;
    try {
      returned = await iap.requestPurchase({
        request: {
          apple: { sku: PRO_PRODUCT_ID },
          google: { skus: [PRO_PRODUCT_ID] }
        },
        type: 'in-app'
      });
    } catch (e) {
      waiter.cancel();
      if (isUserCancelledError(e)) return { ok: false, cancelled: true };
      if (isDeferredError(e)) return { ok: false, pending: true };
      if (isAlreadyOwnedError(e)) return await tryNativeRestore();
      throw e;
    }

    if (isPendingPurchase(returned)) {
      waiter.cancel();
      return { ok: false, pending: true };
    }

    let result;
    if (looksLikePurchase(returned) && purchaseMatches(returned) && !isRevoked(returned)) {
      waiter.cancel();
      result = { ok: true, purchase: returned };
    } else {
      result = await waiter.promise;
    }

    if (result.cancelled) return result;
    if (result.pending) return { ok: false, pending: true };
    if (result.alreadyOwned) return await tryNativeRestore();

    if (result.ok && result.purchase) {
      const granted = await grantFullpackPurchase(result.purchase);
      if (granted) return { ok: true };
    }

    const restored = await tryNativeRestore();
    if (restored.ok && restored.restored) return { ok: true };
    if (!result.ok && !result.skipped) return result;
    return { ok: false };
  } finally {
    waiter.cancel();
    await endIapIfEphemeral(iap);
  }
}

export async function purchaseProUnlock() {
  if (await isProUnlocked()) {
    return { ok: true };
  }

  try {
    return await tryNativePurchase();
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (isUserCancelledError(e) || isUserCancelledError(msg)) {
      return { ok: false, cancelled: true };
    }
    if (isAlreadyOwnedError(e) || isAlreadyOwnedError(msg)) {
      try {
        return await tryNativeRestore();
      } catch {}
    }
    if (!allowSimulate()) {
      return { ok: false, error: msg || t('iap.buyFail') };
    }
  }

  if (!allowSimulate()) {
    return {
      ok: false,
      error: t('iap.unavailable')
    };
  }

  const simulated = await new Promise((resolve) => {
    Alert.alert(
      t('iap.simTitle'),
      t('iap.simBody', { productId: PRO_PRODUCT_ID }),
      [
        { text: t('iap.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('iap.simBuy'), onPress: () => resolve(true) }
      ]
    );
  });

  if (!simulated) return { ok: false, cancelled: true };
  await setProUnlocked(true);
  return { ok: true, simulated: true };
}

export async function restoreProUnlock() {
  try {
    const native = await tryNativeRestore();
    if (native.ok && native.restored) return native;
    if (await isProUnlocked()) {
      return { ok: true, restored: true };
    }
    if (native.ok) return native;
  } catch (e) {
    if (await isProUnlocked()) {
      return { ok: true, restored: true };
    }
    if (!allowSimulate()) {
      return { ok: false, restored: false, error: String(e?.message || e) };
    }
  }

  if (allowSimulate()) {
    const simulated = await new Promise((resolve) => {
      Alert.alert(t('iap.devTitle'), t('iap.devRestoreBody'), [
        { text: t('iap.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('iap.restore'), onPress: () => resolve(true) }
      ]);
    });
    if (simulated) {
      await setProUnlocked(true);
      return { ok: true, restored: true, simulated: true };
    }
    return { ok: true, restored: false, simulated: true };
  }

  return {
    ok: false,
    restored: false,
    error: Platform.OS === 'ios' ? t('iap.nothingToRestore') : t('iap.cannotRestore')
  };
}

function pickDisplayPrice(product) {
  if (!product || typeof product !== 'object') return null;
  const raw = product.displayPrice || product.localizedPrice;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

/**
 * Localized one-time price from StoreKit / Play (`displayPrice`).
 * Returns null when the store is unreachable — never a hardcoded fallback.
 */
export async function getProDisplayPrice() {
  let timer;
  try {
    const iap = require('expo-iap');
    if (!iap?.initConnection || typeof iap.fetchProducts !== 'function') return null;
    await iap.initConnection();
    try {
      const products = await Promise.race([
        iap.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 8000);
        }),
      ]);
      const list = Array.isArray(products) ? products : [];
      const match = list.find((p) => purchaseMatches(p) || p?.id === PRO_PRODUCT_ID) || list[0];
      return pickDisplayPrice(match);
    } finally {
      if (timer) clearTimeout(timer);
      await endIapIfEphemeral(iap);
    }
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

/**
 * On launch, rebuild Pro from StoreKit currentEntitlements
 * (`getAvailablePurchases`). A matching Full Pack unlocks immediately.
 * Failed/offline queries do not increment the empty streak or revoke.
 * An empty list can be a cache miss, so revocation needs N consecutive
 * successful empty queries.
 */
export async function verifyProOnLaunch() {
  if (allowSimulate()) {
    return;
  }
  try {
    const iap = require('expo-iap');
    if (!iap?.initConnection || !iap?.getAvailablePurchases) return;
    await iap.initConnection();
    try {
      const { ok, purchases } = await readCurrentEntitlements(iap);
      if (!ok) return;
      const currentlyUnlocked = await isProUnlocked();
      const emptyStreak = await getEmptyPurchaseStreak();
      const decision = decideUnlockFromPurchases(purchases, {
        currentlyUnlocked,
        emptyStreak,
      });
      await setEmptyPurchaseStreak(decision.emptyStreak);
      if (decision.entitled) {
        await setProUnlocked(true);
        return;
      }
      if (decision.revoke) {
        await setProUnlocked(false);
      }
    } finally {
      await endIapIfEphemeral(iap);
    }
  } catch {
    // Network / StoreKit errors: do not increment streak or revoke.
  }
}
