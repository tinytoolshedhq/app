import { Platform, Alert } from 'react-native';
import {
  setProUnlocked,
  isProUnlocked,
  getEmptyPurchaseStreak,
  setEmptyPurchaseStreak,
  getProRecord,
  isPendingExpired,
} from './entitlements';
import { t } from '../i18n';

type PurchaseLike = {
  productId?: string;
  id?: string;
  sku?: string;
  ids?: string[];
  revocationDate?: unknown;
  revocationDateIOS?: unknown;
  revoked?: boolean;
  revocationReason?: unknown;
  revocationReasonIOS?: unknown;
  purchaseState?: string;
  transactionState?: string;
  transactionReason?: string;
  purchaseStateAndroid?: number;
  transactionStateIOS?: number;
  transactionId?: string;
  transactionIdIOS?: string;
  originalTransactionIdentifierIOS?: string;
  purchaseToken?: string;
  purchaseTokenAndroid?: string;
  transactionDate?: unknown;
  transactionDateIOS?: unknown;
  purchaseTime?: unknown;
  displayPrice?: string;
  localizedPrice?: string;
};

type ExpoIap = {
  initConnection?: () => Promise<unknown>;
  endConnection?: () => Promise<unknown>;
  fetchProducts?: (args: { skus: string[]; type: string }) => Promise<PurchaseLike[]>;
  requestPurchase?: (args: unknown) => Promise<PurchaseLike | void>;
  finishTransaction?: (args: { purchase: PurchaseLike; isConsumable: boolean }) => Promise<unknown>;
  purchaseUpdatedListener?: (cb: (p: PurchaseLike) => void) => { remove?: () => void };
  purchaseErrorListener?: (cb: (e: unknown) => void) => { remove?: () => void };
  getAvailablePurchases?: () => Promise<PurchaseLike[]>;
  currentEntitlementIOS?: (sku: string) => Promise<PurchaseLike | null>;
  restorePurchases?: () => Promise<unknown>;
  presentCodeRedemptionSheet?: () => Promise<unknown>;
  presentCodeRedemptionSheetIOS?: () => Promise<unknown>;
  isTransactionVerifiedIOS?: (sku: string) => Promise<boolean>;
};

function loadIap(): ExpoIap {
  // Tests mock this CJS module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-iap') as ExpoIap;
}

/** TODO: create this non-consumable product in App Store Connect. Placeholder only. */
export const CANONICAL_PRO_PRODUCT_ID = 'com.tinytoolshed.stretch.fullpack';

export const EMPTY_LIST_REVOKE_AFTER = 3;

export const entitlementGrantConfig = {
  retryDelaysMs: [1000, 3000],
  sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  },
  now() {
    return Date.now();
  },
};

function easBuildProfile() {
  return String(
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE || process.env.EAS_BUILD_PROFILE || '',
  );
}

export function resolveProProductId({
  override = process.env.EXPO_PUBLIC_IAP_PRODUCT_ID,
  dev = typeof __DEV__ !== 'undefined' && __DEV__ === true,
  profile = easBuildProfile(),
}: {
  override?: string;
  dev?: boolean;
  profile?: string;
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default ?? require('expo-constants');
    return (
      Constants.appOwnership === 'expo'
      || Constants.executionEnvironment === 'storeClient'
    );
  } catch {
    return false;
  }
}

export function allowSimulate() {
  if (easBuildProfile() === 'production') return false;
  if (process.env.EXPO_PUBLIC_IAP_SIMULATE === '0') return false;
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) return true;
  if (runningInExpoGo()) return true;
  return easBuildProfile() !== ''
    && easBuildProfile() !== 'production'
    && process.env.EXPO_PUBLIC_IAP_SIMULATE === '1';
}

function errorBlob(error: unknown) {
  const e = error as { code?: string; message?: string } | undefined;
  return `${e?.code || ''} ${e?.message || error || ''}`;
}

export function isUserCancelledError(error: unknown) {
  return /cancel|E_USER_CANCELLED|user-cancelled/i.test(errorBlob(error));
}

export function isAlreadyOwnedError(error: unknown) {
  return /already.?owned|E_ALREADY_OWNED|already-owned|already (been )?bought|already purchased/i.test(errorBlob(error));
}

export function isDeferredError(error: unknown) {
  return /E_DEFERRED|deferred-payment|(^|[^a-z])deferred([^a-z]|$)/i.test(errorBlob(error));
}

export function purchaseMatches(p: PurchaseLike | null | undefined, productId = PRO_PRODUCT_ID) {
  return (
    p?.productId === productId
    || p?.id === productId
    || p?.sku === productId
    || (Array.isArray(p?.ids) && p.ids.includes(productId))
  );
}

export function isRevoked(purchase: PurchaseLike | null | undefined) {
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

export function isPendingPurchase(p: PurchaseLike | null | undefined) {
  if (!p || typeof p !== 'object') return false;
  if (p.purchaseState === 'pending') return true;
  if (p.purchaseStateAndroid === 2) return true;
  if (p.transactionStateIOS === 4) return true;
  return false;
}

export function isEntitledPurchase(p: PurchaseLike | null | undefined, productId = PRO_PRODUCT_ID) {
  return purchaseMatches(p, productId) && !isRevoked(p) && !isPendingPurchase(p);
}

export function decideUnlockFromPurchases(
  purchases: PurchaseLike[] | null | undefined,
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

function looksLikePurchase(p: unknown): p is PurchaseLike {
  return !!(p && typeof p === 'object' && ((p as PurchaseLike).productId || (p as PurchaseLike).id || (p as PurchaseLike).sku || (p as PurchaseLike).ids));
}

function productSku(purchase: PurchaseLike) {
  if (purchaseMatches(purchase)) {
    if (purchase?.productId === PRO_PRODUCT_ID) return purchase.productId;
    if (purchase?.sku === PRO_PRODUCT_ID) return purchase.sku;
    if (purchase?.id === PRO_PRODUCT_ID) return purchase.id;
    return PRO_PRODUCT_ID;
  }
  return purchase?.productId || purchase?.sku || PRO_PRODUCT_ID;
}

let keepIapConnection = false;
let purchaseSub: { remove?: () => void } | null = null;
const grantInFlight = new Map<string, Promise<boolean>>();

export function purchaseTransactionId(purchase: PurchaseLike | null | undefined) {
  if (!purchase || typeof purchase !== 'object') return null;
  for (const key of [
    'transactionId',
    'transactionIdIOS',
    'originalTransactionIdentifierIOS',
    'purchaseToken',
    'purchaseTokenAndroid',
  ] as const) {
    const v = purchase[key];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return null;
}

export function grantDedupeKey(purchase: PurchaseLike) {
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

async function endIapIfEphemeral(iap: ExpoIap) {
  if (keepIapConnection) return;
  try {
    await iap.endConnection?.();
  } catch { /* ignore */ }
}

/** true = verified, false = explicit reject, null = inconclusive (missing API / throw / non-boolean). */
async function verifyTransactionBestEffort(iap: ExpoIap, purchase: PurchaseLike): Promise<boolean | null> {
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

async function readCurrentEntitlements(iap: ExpoIap) {
  if (typeof iap?.getAvailablePurchases !== 'function') {
    return { ok: false, purchases: [] as PurchaseLike[] };
  }
  try {
    const purchases = await iap.getAvailablePurchases();
    if (!Array.isArray(purchases)) return { ok: false, purchases: [] as PurchaseLike[] };
    const list = [...purchases];
    if (!list.some((p) => isEntitledPurchase(p)) && typeof iap?.currentEntitlementIOS === 'function') {
      try {
        const one = await iap.currentEntitlementIOS(PRO_PRODUCT_ID);
        if (one) list.push(one);
      } catch { /* ignore */ }
    }
    return { ok: true, purchases: list };
  } catch {
    return { ok: false, purchases: [] as PurchaseLike[] };
  }
}

async function unlockFromEntitlements(iap: ExpoIap) {
  const { purchases } = await readCurrentEntitlements(iap);
  if (purchases.some((p) => isEntitledPurchase(p))) {
    await setProUnlocked(true);
    await setEmptyPurchaseStreak(0);
    return true;
  }
  return false;
}

async function finishIfPossible(iap: ExpoIap, purchase: PurchaseLike) {
  if (typeof iap?.finishTransaction !== 'function') return;
  try {
    await iap.finishTransaction({ purchase, isConsumable: false });
  } catch { /* ignore */ }
}

async function grantFullpackPurchaseBody(purchase: PurchaseLike) {
  const iap = loadIap();
  const verified = await verifyTransactionBestEffort(iap, purchase);
  await finishIfPossible(iap, purchase);

  if (await unlockFromEntitlements(iap)) return true;

  for (const ms of entitlementGrantConfig.retryDelaysMs) {
    await entitlementGrantConfig.sleep(ms);
    if (await unlockFromEntitlements(iap)) return true;
  }

  if (verified === true) {
    await setProUnlocked(true);
    await setEmptyPurchaseStreak(0);
    return true;
  }

  if (verified === false) {
    return false;
  }

  await setProUnlocked(true, { pendingVerification: true, now: entitlementGrantConfig.now() });
  await setEmptyPurchaseStreak(0);
  return true;
}

export async function grantFullpackPurchase(purchase: PurchaseLike) {
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
    const iap = loadIap();
    if (!iap?.initConnection || typeof iap.purchaseUpdatedListener !== 'function') return;
    await iap.initConnection();
    keepIapConnection = true;
    try {
      purchaseSub?.remove?.();
    } catch { /* ignore */ }
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
  } catch { /* ignore */ }
  purchaseSub = null;
  keepIapConnection = false;
  resetGrantInFlight();
  try {
    const iap = loadIap();
    await iap.endConnection?.();
  } catch { /* ignore */ }
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

export type UnlockResult = {
  ok: boolean;
  cancelled?: boolean;
  pending?: boolean;
  restored?: boolean;
  simulated?: boolean;
  skipped?: boolean;
  alreadyOwned?: boolean;
  error?: string;
  purchase?: PurchaseLike;
};

type PurchaseEvent = UnlockResult;

function waitForPurchaseEvent(iap: ExpoIap, timeoutMs = 120000) {
  let settled = false;
  let subUpdate: { remove?: () => void } | undefined;
  let subError: { remove?: () => void } | undefined;
  let timer: ReturnType<typeof setTimeout>;
  let resolvePromise: (r: PurchaseEvent) => void;
  const promise = new Promise<PurchaseEvent>((resolve) => {
    resolvePromise = resolve;
  });

  const cleanup = () => {
    try { subUpdate?.remove?.(); } catch { /* ignore */ }
    try { subError?.remove?.(); } catch { /* ignore */ }
    clearTimeout(timer);
  };

  const finish = (result: PurchaseEvent) => {
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
    const msg = String((error as { message?: string; code?: string })?.message || (error as { code?: string })?.code || error || t('iap.buyFail'));
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
  const iap = loadIap();
  if (!iap?.initConnection || !iap?.getAvailablePurchases) {
    throw new Error('IAP unavailable');
  }

  await iap.initConnection();
  try {
    if (typeof iap.restorePurchases === 'function') {
      try {
        await iap.restorePurchases();
      } catch { /* continue to query */ }
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
  const iap = loadIap();
  if (!iap?.initConnection || !iap?.requestPurchase) {
    throw new Error('IAP unavailable');
  }

  await iap.initConnection();
  const waiter = waitForPurchaseEvent(iap);
  try {
    if (typeof iap.fetchProducts === 'function') {
      await iap.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' });
    }

    let returned: PurchaseLike | void;
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
      if (isAlreadyOwnedError(e)) return await tryNativeRestore();
      throw e;
    }

    if (isPendingPurchase(returned as PurchaseLike)) {
      waiter.cancel();
      return { ok: false, pending: true };
    }

    let result: PurchaseEvent;
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

export async function purchaseProUnlock(): Promise<UnlockResult> {
  if (await isProUnlocked()) {
    return { ok: true };
  }

  try {
    return await tryNativePurchase();
  } catch (e) {
    const msg = String((e as Error)?.message || e || '');
    if (isUserCancelledError(e) || isUserCancelledError(msg)) {
      return { ok: false, cancelled: true };
    }
    if (isAlreadyOwnedError(e) || isAlreadyOwnedError(msg)) {
      try {
        return await tryNativeRestore();
      } catch { /* ignore */ }
    }
    if (!allowSimulate()) {
      return { ok: false, error: msg || t('iap.buyFail') };
    }
  }

  if (!allowSimulate()) {
    return {
      ok: false,
      error: t('iap.unavailable'),
    };
  }

  const simulated = await new Promise<boolean>((resolve) => {
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

export async function restoreProUnlock(): Promise<UnlockResult> {
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
      return { ok: false, restored: false, error: String((e as Error)?.message || e) };
    }
  }

  if (allowSimulate()) {
    const simulated = await new Promise<boolean>((resolve) => {
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
    error: Platform.OS === 'ios' ? t('iap.nothingToRestore') : t('iap.cannotRestore'),
  };
}

function pickDisplayPrice(product: PurchaseLike | null | undefined) {
  if (!product || typeof product !== 'object') return null;
  const raw = product.displayPrice || product.localizedPrice;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

export async function getProDisplayPrice() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const iap = loadIap();
    if (!iap?.initConnection || typeof iap.fetchProducts !== 'function') return null;
    await iap.initConnection();
    try {
      const products = await Promise.race([
        iap.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' }),
        new Promise<never>((_, reject) => {
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

export async function verifyProOnLaunch() {
  if (allowSimulate()) {
    return;
  }
  const now = entitlementGrantConfig.now();
  const record = await getProRecord();
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
