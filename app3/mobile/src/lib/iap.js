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

const STORE_TIMEOUT_MS = 15000;

async function withStoreTimeout(operation, timeoutMs = STORE_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(t('iap.timeout'))), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function connectToStore(iap) {
  const connected = await withStoreTimeout(() => iap.initConnection());
  if (connected === false) throw new Error(t('iap.unavailable'));
}

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
const grantInFlight = new Map();

export function purchaseTransactionId(purchase) {
  if (!purchase || typeof purchase !== 'object') return null;
  for (const key of [
    'transactionId',
    'transactionIdIOS',
    'originalTransactionIdentifierIOS',
    'purchaseToken',
    'purchaseTokenAndroid',
  ]) {
    const v = purchase[key];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return null;
}

export function grantDedupeKey(purchase) {
  const tx = purchaseTransactionId(purchase);
  if (tx) return `tx:${tx}`;
  const date = purchase?.transactionDate ?? purchase?.transactionDateIOS ?? purchase?.purchaseTime ?? '';
  return `sku:${PRO_PRODUCT_ID}:${date}`;
}

export function resetGrantInFlight() {
  grantInFlight.clear();
}

export function canPresentRedeemCode(os = Platform.OS) {
  return os === 'ios';
}

async function endIapIfEphemeral(iap) {
  if (keepIapConnection) return;
  try {
    await withStoreTimeout(() => iap.endConnection?.());
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
    const ok = await withStoreTimeout(() => iap.isTransactionVerifiedIOS(productSku(purchase)));
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
    const purchases = await withStoreTimeout(() => iap.getAvailablePurchases());
    if (!Array.isArray(purchases)) return { ok: false, purchases: [] };
    const list = [...purchases];
    if (!list.some((p) => isEntitledPurchase(p)) && typeof iap?.currentEntitlementIOS === 'function') {
      try {
        const one = await withStoreTimeout(() => iap.currentEntitlementIOS(PRO_PRODUCT_ID));
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
    await withStoreTimeout(() => iap.finishTransaction({ purchase, isConsumable: false }));
  } catch {}
}

async function grantFullpackPurchaseBody(purchase) {
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

  // Persist so a force-quit + relaunch (App Review) stays unlocked.
  // Launch rebuild clears this pending flag once entitlements catch up,
  // or revokes after N successful empty queries / explicit revocation.
  await setProUnlocked(true, { pendingVerification: true });
  await setEmptyPurchaseStreak(0);
  return true;
}

export async function grantFullpackPurchase(purchase) {
  try {
    if (isPendingPurchase(purchase)) return false;
    if (!purchaseMatches(purchase) || isRevoked(purchase)) return false;

    const key = grantDedupeKey(purchase);
    const existing = grantInFlight.get(key);
    if (existing) return existing;

    const run = grantFullpackPurchaseBody(purchase).finally(() => {
      if (grantInFlight.get(key) === run) grantInFlight.delete(key);
    });
    grantInFlight.set(key, run);
    return run;
  } catch {
    return false;
  }
}

export async function startPurchaseUpdates() {
  try {
    const iap = require('expo-iap');
    if (!iap?.initConnection || typeof iap.purchaseUpdatedListener !== 'function') return;
    await connectToStore(iap);
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
  resetGrantInFlight();
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
    if (typeof iap.initConnection === 'function') await connectToStore(iap);
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
    if (!purchaseMatches(purchase)) return;
    if (isPendingPurchase(purchase)) {
      finish({ ok: false, pending: true, purchase });
      return;
    }
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

  await connectToStore(iap);
  try {
    let restoreError;
    if (typeof iap.restorePurchases === 'function') {
      try {
        await withStoreTimeout(() => iap.restorePurchases());
      } catch (error) {
        // Current entitlements may still be available if store sync failed.
        restoreError = error;
      }
    }
    const { ok, purchases } = await readCurrentEntitlements(iap);
    if (purchases.some((p) => isEntitledPurchase(p))) {
      await setProUnlocked(true);
      await setEmptyPurchaseStreak(0);
      return { ok: true, restored: true };
    }
    if (restoreError) throw restoreError;
    if (!ok) throw new Error(t('iap.unavailable'));
    return { ok: true, restored: false };
  } finally {
    await endIapIfEphemeral(iap);
  }
}

async function tryNativePurchase() {
  const iap = require('expo-iap');
  if (!iap?.initConnection || !iap?.requestPurchase || !iap?.fetchProducts) {
    throw new Error(t('iap.unavailable'));
  }

  await connectToStore(iap);
  let waiter;
  try {
    const products = await withStoreTimeout(() => iap.fetchProducts({
      skus: [PRO_PRODUCT_ID], type: 'in-app',
    }));
    if (!Array.isArray(products) || !products.some((product) => purchaseMatches(product))) {
      throw new Error(t('iap.productUnavailable'));
    }

    // Subscribe before dispatch. A native request may still be unresolved when
    // StoreKit emits its result, so either path must be able to finish the UI.
    waiter = waitForPurchaseEvent(iap);
    const requestResult = Promise.resolve().then(() => iap.requestPurchase({
      request: {
        apple: { sku: PRO_PRODUCT_ID },
        google: { skus: [PRO_PRODUCT_ID] },
      },
      type: 'in-app',
    })).then((returned) => {
      const purchases = Array.isArray(returned) ? returned : [returned];
      const purchase = purchases.find((p) => looksLikePurchase(p) && purchaseMatches(p) && !isRevoked(p));
      if (purchase) {
        return isPendingPurchase(purchase)
          ? { ok: false, pending: true }
          : { ok: true, purchase };
      }
      return waiter.promise;
    });
    const result = await Promise.race([waiter.promise, requestResult]);
    waiter.cancel();

    if (result.cancelled || result.pending) return result;
    if (result.alreadyOwned) return await tryNativeRestore();
    if (!result.ok) return result;

    const granted = await withStoreTimeout(() => grantFullpackPurchase(result.purchase));
    return granted ? { ok: true } : { ok: false, error: t('iap.buyFail') };
  } catch (e) {
    if (isUserCancelledError(e)) return { ok: false, cancelled: true };
    if (isDeferredError(e)) return { ok: false, pending: true };
    if (isAlreadyOwnedError(e)) return await tryNativeRestore();
    throw e;
  } finally {
    waiter?.cancel();
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
  try {
    const iap = require('expo-iap');
    if (!iap?.initConnection || typeof iap.fetchProducts !== 'function') return null;
    try {
      await connectToStore(iap);
      const products = await withStoreTimeout(() => iap.fetchProducts({
        skus: [PRO_PRODUCT_ID], type: 'in-app',
      }), 8000);
      const list = Array.isArray(products) ? products : [];
      return pickDisplayPrice(list.find((p) => purchaseMatches(p)));
    } finally {
      await endIapIfEphemeral(iap);
    }
  } catch {
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
    await connectToStore(iap);
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
