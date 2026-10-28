import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY = 'beenages/proUnlocked/v1';
const EMPTY_PURCHASE_STREAK_KEY = 'beenages/emptyPurchaseStreak/v1';
const proListeners = new Set();

/** In-memory grant for the current process only (not written to storage). */
let sessionProUnlocked = false;

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

export async function isProPersisted() {
  try {
    const v = await AsyncStorage.getItem(PRO_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function isProUnlocked() {
  if (sessionProUnlocked) return true;
  return isProPersisted();
}

export async function setProUnlocked(unlocked, { persist = true } = {}) {
  if (!unlocked) {
    sessionProUnlocked = false;
    try {
      await AsyncStorage.removeItem(PRO_KEY);
    } catch {
      // ignore
    }
    notifyPro(false);
    return;
  }
  if (!persist) {
    sessionProUnlocked = true;
    notifyPro(true);
    return;
  }
  sessionProUnlocked = false;
  try {
    await AsyncStorage.setItem(PRO_KEY, '1');
    await AsyncStorage.removeItem(EMPTY_PURCHASE_STREAK_KEY);
  } catch {
    // ignore
  }
  notifyPro(true);
}

export async function clearProUnlocked() {
  sessionProUnlocked = false;
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
