import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY = 'beenages/proUnlocked/v1';
const EMPTY_PURCHASE_STREAK_KEY = 'beenages/emptyPurchaseStreak/v1';
const proListeners = new Set();

export function subscribePro(listener) {
  proListeners.add(listener);
  return () => proListeners.delete(listener);
}

function notifyPro(unlocked) {
  for (const l of proListeners) {
    try {
      l(!!unlocked);
    } catch {}
  }
}

/** Parse the persisted Pro record. Legacy value is `'1'`. */
export function parseProRecord(raw) {
  if (raw == null || raw === '') {
    return { unlocked: false, pendingVerification: false };
  }
  if (raw === '1') {
    return { unlocked: true, pendingVerification: false, source: 'store' };
  }
  try {
    const obj = JSON.parse(raw);
    if (obj && (obj.unlocked === true || obj.unlocked === '1')) {
      const pending = obj.pendingVerification === true || obj.source === 'event';
      return {
        unlocked: true,
        pendingVerification: pending,
        source: obj.source || (pending ? 'event' : 'store'),
        ts: obj.ts,
      };
    }
  } catch {}
  return { unlocked: false, pendingVerification: false };
}

export async function getProRecord() {
  try {
    return parseProRecord(await AsyncStorage.getItem(PRO_KEY));
  } catch {
    return { unlocked: false, pendingVerification: false };
  }
}

export async function isProPersisted() {
  return (await getProRecord()).unlocked === true;
}

export async function isPendingVerification() {
  return (await getProRecord()).pendingVerification === true;
}

export async function isProUnlocked() {
  return isProPersisted();
}

export async function setProUnlocked(unlocked, { pendingVerification = false } = {}) {
  if (!unlocked) {
    try {
      await AsyncStorage.removeItem(PRO_KEY);
    } catch {
      // ignore
    }
    notifyPro(false);
    return;
  }
  try {
    if (pendingVerification) {
      await AsyncStorage.setItem(PRO_KEY, JSON.stringify({
        unlocked: true,
        source: 'event',
        ts: Date.now(),
      }));
    } else {
      await AsyncStorage.setItem(PRO_KEY, '1');
    }
    await AsyncStorage.removeItem(EMPTY_PURCHASE_STREAK_KEY);
  } catch {
    // ignore
  }
  notifyPro(true);
}

export async function clearProUnlocked() {
  try {
    await AsyncStorage.removeItem(PRO_KEY);
    await AsyncStorage.removeItem(EMPTY_PURCHASE_STREAK_KEY);
  } catch {
    // ignore
  }
  notifyPro(false);
}

export async function getEmptyPurchaseStreak() {
  try {
    const v = await AsyncStorage.getItem(EMPTY_PURCHASE_STREAK_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function setEmptyPurchaseStreak(n) {
  try {
    if (n <= 0) {
      await AsyncStorage.removeItem(EMPTY_PURCHASE_STREAK_KEY);
    } else {
      await AsyncStorage.setItem(EMPTY_PURCHASE_STREAK_KEY, String(n));
    }
  } catch {
    // ignore
  }
}
