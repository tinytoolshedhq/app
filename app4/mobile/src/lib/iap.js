import { Platform, Alert } from 'react-native';
import {
  setProUnlocked,
  isProUnlocked,
  getEmptyPurchaseStreak,
  setEmptyPurchaseStreak,
  getProRecord,
  isPendingExpired,
} from './entitlements';
import {
  isAlreadyOwnedError,
  isDeferredError,
  isUserCancelledError,
  mapIapError,
  mapRestoreError,
  unavailableError,
} from './iapErrors';
import { t } from '../i18n';

/**
 * App Store Connect non-consumable. Do not derive from the bundle id.
 * Release lead created this id; keep it in one constant.
 */
export const FULLPACK_PRODUCT_ID = 'com.tinytoolshed.decibelmeter.fullpack';
export const CANONICAL_PRO_PRODUCT_ID = FULLPACK_PRODUCT_ID;

export const EMPTY_LIST_REVOKE_AFTER = 3;

export const entitlementGrantConfig = {
  retryDelaysMs: [1000, 3000],
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  now() {
    return Date.now();
  },
};

/** UI / native IAP safety net so restore and purchase cannot spin forever (web, Expo Go, hung StoreKit). */
export const IAP_UI_TIMEOUT_MS = 15_000;

export const iapActionConfig = {
  timeoutMs: IAP_UI_TIMEOUT_MS,
};

export function isNativeIapPlatform(os = Platform.OS) {
  return os === 'ios' || os === 'android';
}

export async function withTimeout(work, timeoutMs, timedOutResult) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timedOutResult), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Wrap purchase/restore so a hung IAP call still clears the loading state. */
export async function runIapBusy(work) {
  return withTimeout(
    work(),
    iapActionConfig.timeoutMs,
    { ok: false, error: t('iap.timeout'), timedOut: true },
  );
}

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
      Constants.appOwnership === 'expo'
      || Constants.executionEnvironment === 'storeClient'
    );
  } catch {
    return false;
  }
}

/** Never true for the EAS production profile, even if the simulate flag leaks in. */
export function allowSimulate() {
  if (!isNativeIapPlatform()) return false;
  if (easBuildProfile() === 'production') return false;
  if (process.env.EXPO_PUBLIC_IAP_SIMULATE === '0') return false;
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) return true;
  if (runningInExpoGo()) return true;
  return easBuildProfile() !== ''
    && easBuildProfile() !== 'production'
    && process.env.EXPO_PUBLIC_IAP_SIMULATE === '1';
}

function loadIap() {
  try {
    return require('expo-iap');
  } catch {
    return {};
  }
}

export function purchaseMatches(p, productId = PRO_PRODUCT_ID) {
  return (
    p?.productId === productId
    || p?.id === productId
    || p?.sku === productId
    || (Array.isArray(p?.ids) && p.ids.includes(productId))
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
    await iap.endConnection?.();
  } catch {
    // ignore
  }
}

/**
 * Best-effort StoreKit 2 JWS check. Must not fail closed: expo-iap's
 * isTransactionVerifiedIOS often returns false/throws in sandbox.
 */
async function verifyTransactionBestEffort(iap, purchase) {
  if (typeof iap?.isTransactionVerifiedIOS !== 'function') return null;
  try {
    const ok = await iap.isTransactionVerifiedIOS(productSku(purchase));
    if (ok === true) return true;
    if (ok === false) return false;
    return null;
  } catch {
    return null;
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
      } catch {
        // ignore
      }
    }
    return { ok: true, purchases: list };
  } catch (e) {
    if (isAlreadyOwnedError(e)) throw e;
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
  } catch {
    // ignore
  }
}

/**
 * Finish leftover Full Pack transactions (Guideline 2.1(b)).
 * Skips Ask-to-Buy / Play pending rows.
 */
export async function finishUnfinishedPurchases(purchases, iap = loadIap()) {
  for (const p of purchases || []) {
    if (!purchaseMatches(p) || isPendingPurchase(p)) continue;
    await finishIfPossible(iap, p);
  }
}

async function grantFullpackPurchaseBody(purchase) {
  const iap = loadIap();
  const verified = await verifyTransactionBestEffort(iap, purchase);

  let granted = false;
  if (await unlockFromEntitlements(iap)) granted = true;

  if (!granted) {
    for (const ms of entitlementGrantConfig.retryDelaysMs) {
      await entitlementGrantConfig.sleep(ms);
      if (await unlockFromEntitlements(iap)) {
        granted = true;
        break;
      }
    }
  }

  if (!granted && verified === true) {
    await setProUnlocked(true);
    await setEmptyPurchaseStreak(0);
    granted = true;
  }

  if (!granted && verified !== false) {
    await setProUnlocked(true, { pendingVerification: true, now: entitlementGrantConfig.now() });
    await setEmptyPurchaseStreak(0);
    granted = true;
  }

  // Guideline 2.1(b): finish after granting Pro (isConsumable false).
  if (granted) {
    await finishIfPossible(iap, purchase);
  }
  return granted;
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
    if (!isNativeIapPlatform()) return;
    const iap = loadIap();
    if (!iap?.initConnection || typeof iap.purchaseUpdatedListener !== 'function') return;
    await iap.initConnection();
    keepIapConnection = true;
    try {
      purchaseSub?.remove?.();
    } catch {
      // ignore
    }
    purchaseSub = iap.purchaseUpdatedListener((purchase) => {
      grantFullpackPurchase(purchase).catch(() => {});
    });
    try {
      const { purchases } = await readCurrentEntitlements(iap);
      await finishUnfinishedPurchases(purchases, iap);
    } catch {
      // ignore leftover finish errors
    }
  } catch {
    keepIapConnection = false;
  }
}

export async function stopPurchaseUpdates() {
  try {
    purchaseSub?.remove?.();
  } catch {
    // ignore
  }
  purchaseSub = null;
  keepIapConnection = false;
  resetGrantInFlight();
  try {
    const iap = loadIap();
    await iap.endConnection?.();
  } catch {
    // ignore
  }
}

export async function presentRedeemCodeSheet() {
  if (!canPresentRedeemCode()) return { ok: false, unavailable: true };
  try {
    const iap = loadIap();
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
    try { subUpdate?.remove?.(); } catch { /* ignore */ }
    try { subError?.remove?.(); } catch { /* ignore */ }
    clearTimeout(timer);
  };

  const finish = (result) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(result);
  };

  subUpdate = iap.purchaseUpdatedListener?.((purchase) => {
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
    finish({ ok: false, error: mapIapError(error) });
  });
  timer = setTimeout(() => {
    finish({ ok: false, error: t('iap.timeout'), timedOut: true });
  }, timeoutMs);

  return {
    promise,
    cancel() {
      finish({ ok: false, skipped: true });
    },
  };
}

async function tryNativeRestore() {
  if (!isNativeIapPlatform()) {
    throw unavailableError();
  }
  const iap = loadIap();
  const initConnection = iap?.initConnection;
  if (!initConnection || !iap?.getAvailablePurchases) {
    throw unavailableError();
  }

  const timedOut = {
    ok: false,
    restored: false,
    timedOut: true,
    error: t('iap.timeout'),
  };
  return withTimeout((async () => {
    await initConnection();
    try {
      let sawAlreadyOwned = false;
      if (typeof iap.restorePurchases === 'function') {
        try {
          await iap.restorePurchases();
        } catch (e) {
          if (isAlreadyOwnedError(e)) sawAlreadyOwned = true;
        }
      }
      const { purchases } = await readCurrentEntitlements(iap);
      await finishUnfinishedPurchases(purchases, iap);
      if (purchases.some((p) => isEntitledPurchase(p))) {
        await setProUnlocked(true);
        await setEmptyPurchaseStreak(0);
        return { ok: true, restored: true, message: t('iap.restored') };
      }
      if (sawAlreadyOwned) {
        return {
          ok: false,
          restored: false,
          alreadyOwned: true,
          error: t('iap.restoreAgain'),
        };
      }
      return { ok: true, restored: false };
    } finally {
      await endIapIfEphemeral(iap);
    }
  })(), iapActionConfig.timeoutMs, timedOut);
}

/** Already-owned: refresh entitlements. Grant only if Full Pack is actually present. */
async function restoreAlreadyOwned() {
  try {
    const restored = await tryNativeRestore();
    if (restored.ok && restored.restored) {
      return { ok: true, restored: true, message: t('iap.restored') };
    }
    if (restored.timedOut) return restored;
    return {
      ok: false,
      restored: false,
      error: restored.error || t('iap.restoreAgain'),
    };
  } catch (e) {
    return {
      ok: false,
      restored: false,
      timedOut: e?.timedOut === true,
      error: mapRestoreError(e),
    };
  }
}

async function tryNativePurchase() {
  if (!isNativeIapPlatform()) {
    throw unavailableError();
  }
  const iap = loadIap();
  if (!iap?.initConnection || !iap?.requestPurchase) {
    throw unavailableError();
  }

  const initConnection = iap.initConnection;
  const fetchProducts = iap.fetchProducts;
  const ready = await withTimeout(
    (async () => {
      await initConnection();
      if (typeof fetchProducts === 'function') {
        await fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' });
      }
      return true;
    })(),
    iapActionConfig.timeoutMs,
    false,
  );
  if (!ready) {
    return { ok: false, error: t('iap.timeout'), timedOut: true };
  }

  const waiter = waitForPurchaseEvent(iap);
  try {
    let returned;
    try {
      returned = await iap.requestPurchase({
        request: {
          apple: { sku: PRO_PRODUCT_ID },
          google: { skus: [PRO_PRODUCT_ID] },
        },
        type: 'in-app',
      });
    } catch (e) {
      waiter.cancel();
      if (isUserCancelledError(e)) return { ok: false, cancelled: true };
      if (isDeferredError(e)) return { ok: false, pending: true };
      if (isAlreadyOwnedError(e)) return await restoreAlreadyOwned();
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
    if (result.alreadyOwned) return await restoreAlreadyOwned();

    if (result.ok && result.purchase) {
      const granted = await grantFullpackPurchase(result.purchase);
      if (granted) return { ok: true };
    }

    const restored = await tryNativeRestore();
    if (restored.ok && restored.restored) return { ok: true, restored: true };
    if (!result.ok && !result.skipped) return result;
    return { ok: false, error: t('iap.buyFail') };
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
    if (isUserCancelledError(e)) {
      return { ok: false, cancelled: true };
    }
    if (isAlreadyOwnedError(e)) {
      try {
        return await restoreAlreadyOwned();
      } catch (restoreErr) {
        return { ok: false, error: mapIapError(restoreErr) };
      }
    }
    if (!allowSimulate()) {
      return { ok: false, error: mapIapError(e) };
    }
  }

  if (!allowSimulate()) {
    return {
      ok: false,
      error: t('iap.unavailable'),
    };
  }

  const simulated = await new Promise((resolve) => {
    Alert.alert(
      t('iap.simTitle'),
      t('iap.simBody', { productId: PRO_PRODUCT_ID }),
      [
        { text: t('iap.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('iap.simBuy'), onPress: () => resolve(true) },
      ],
    );
  });

  if (!simulated) return { ok: false, cancelled: true };
  await setProUnlocked(true);
  return { ok: true, simulated: true };
}

export async function restoreProUnlock() {
  try {
    const native = await tryNativeRestore();
    if (native.timedOut) return native;
    if (native.ok && native.restored) return native;
    if (native.alreadyOwned) {
      return {
        ok: false,
        restored: false,
        error: native.error || t('iap.restoreAgain'),
      };
    }
    if (await isProUnlocked()) {
      return { ok: true, restored: true };
    }
    if (native.ok) return native;
  } catch (e) {
    if (isAlreadyOwnedError(e)) {
      try {
        return await restoreAlreadyOwned();
      } catch (restoreErr) {
        return { ok: false, restored: false, error: mapRestoreError(restoreErr) };
      }
    }
    if (await isProUnlocked()) {
      return { ok: true, restored: true };
    }
    if (!allowSimulate()) {
      return { ok: false, restored: false, error: mapRestoreError(e) };
    }
  }

  if (allowSimulate()) {
    const simulated = await new Promise((resolve) => {
      Alert.alert(t('iap.devTitle'), t('iap.devRestoreBody'), [
        { text: t('iap.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('iap.restore'), onPress: () => resolve(true) },
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
    error: t('iap.nothingToRestore'),
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
    if (!isNativeIapPlatform()) return null;
    const iap = loadIap();
    if (!iap?.initConnection || typeof iap.fetchProducts !== 'function') return null;
    await iap.initConnection();
    try {
      const products = await Promise.race([
        iap.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('IAP_TIMEOUT')), 8000);
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
 * (`getAvailablePurchases`) and finish leftover Full Pack transactions.
 * Failed/offline queries do not increment the empty streak or revoke,
 * except a pending-verification unlock older than 14 days.
 */
export async function verifyProOnLaunch() {
  if (allowSimulate()) {
    return;
  }
  const now = entitlementGrantConfig.now();
  const record = await getProRecord(now);
  if (!isNativeIapPlatform()) {
    if (isPendingExpired(record, now)) await setProUnlocked(false);
    return;
  }
  try {
    const iap = loadIap();
    if (!iap?.initConnection || !iap?.getAvailablePurchases) {
      if (isPendingExpired(record, now)) await setProUnlocked(false);
      return;
    }
    await iap.initConnection();
    try {
      const { ok, purchases } = await readCurrentEntitlements(iap);
      if (!ok) {
        if (isPendingExpired(record, now)) await setProUnlocked(false);
        return;
      }
      await finishUnfinishedPurchases(purchases, iap);
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
      if (isPendingExpired(record, now)) {
        await setProUnlocked(false);
        return;
      }
      if (decision.revoke) {
        await setProUnlocked(false);
      }
    } finally {
      await endIapIfEphemeral(iap);
    }
  } catch {
    if (isPendingExpired(record, now)) await setProUnlocked(false);
  }
}
