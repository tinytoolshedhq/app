import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY = 'stretch/proUnlocked/v1';
const EMPTY_PURCHASE_STREAK_KEY = 'stretch/emptyPurchaseStreak/v1';
const proListeners = new Set<(unlocked: boolean) => void>();

export function subscribePro(listener: (unlocked: boolean) => void): () => void {
  proListeners.add(listener);
  return () => { proListeners.delete(listener); };
}

function notifyPro(unlocked: boolean) {
  for (const l of proListeners) {
    try {
      l(!!unlocked);
    } catch { /* ignore */ }
  }
}

export type ProRecord = {
  unlocked: boolean;
  pendingVerification: boolean;
  source?: string;
  ts?: number;
};

export function parseProRecord(raw: string | null): ProRecord {
  if (raw == null || raw === '') {
    return { unlocked: false, pendingVerification: false };
  }
  if (raw === '1') {
    return { unlocked: true, pendingVerification: false, source: 'store' };
  }
  try {
    const obj = JSON.parse(raw) as { unlocked?: boolean | string; pendingVerification?: boolean; source?: string; ts?: number };
    if (obj && (obj.unlocked === true || obj.unlocked === '1')) {
      const pending = obj.pendingVerification === true || obj.source === 'event';
      return {
        unlocked: true,
        pendingVerification: pending,
        source: obj.source || (pending ? 'event' : 'store'),
        ts: obj.ts,
      };
    }
  } catch { /* ignore */ }
  return { unlocked: false, pendingVerification: false };
}

export async function getProRecord(): Promise<ProRecord> {
  try {
    return parseProRecord(await AsyncStorage.getItem(PRO_KEY));
  } catch {
    return { unlocked: false, pendingVerification: false };
  }
}

export async function isProPersisted(): Promise<boolean> {
  return (await getProRecord()).unlocked === true;
}

export async function isPendingVerification(): Promise<boolean> {
  return (await getProRecord()).pendingVerification === true;
}

export async function isProUnlocked(): Promise<boolean> {
  return isProPersisted();
}

export async function setProUnlocked(
  unlocked: boolean,
  { pendingVerification = false }: { pendingVerification?: boolean } = {},
): Promise<void> {
  if (!unlocked) {
    try {
      await AsyncStorage.removeItem(PRO_KEY);
    } catch { /* ignore */ }
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
  } catch { /* ignore */ }
  notifyPro(true);
}

export async function clearProUnlocked(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRO_KEY);
    await AsyncStorage.removeItem(EMPTY_PURCHASE_STREAK_KEY);
  } catch { /* ignore */ }
  notifyPro(false);
}

export async function getEmptyPurchaseStreak(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(EMPTY_PURCHASE_STREAK_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function setEmptyPurchaseStreak(n: number): Promise<void> {
  try {
    if (n <= 0) {
      await AsyncStorage.removeItem(EMPTY_PURCHASE_STREAK_KEY);
    } else {
      await AsyncStorage.setItem(EMPTY_PURCHASE_STREAK_KEY, String(n));
    }
  } catch { /* ignore */ }
}
