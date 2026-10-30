jest.mock('expo-iap', () => {
  let purchased = false;
  const listeners = new Set();
  const errorListeners = new Set();
  const sku = process.env.EXPO_PUBLIC_IAP_PRODUCT_ID || 'com.tinytoolshed.stretch.fullpack';
  const emitUpdate = (purchase) => {
    purchased = true;
    for (const cb of [...listeners]) {
      try { cb(purchase); } catch { /* ignore */ }
    }
  };
  const emitError = (error) => {
    for (const cb of [...errorListeners]) {
      try { cb(error); } catch { /* ignore */ }
    }
  };
  return {
    initConnection: jest.fn(async () => {}),
    endConnection: jest.fn(async () => {}),
    fetchProducts: jest.fn(async () => [{
      id: sku,
      productId: sku,
      displayPrice: 'NT$90',
      type: 'in-app',
    }]),
    requestPurchase: jest.fn(async () => {
      setTimeout(() => {
        emitUpdate({ productId: sku });
      }, 5);
    }),
    finishTransaction: jest.fn(async () => {}),
    purchaseUpdatedListener: jest.fn((cb) => {
      listeners.add(cb);
      return { remove: () => { listeners.delete(cb); } };
    }),
    purchaseErrorListener: jest.fn((cb) => {
      errorListeners.add(cb);
      return { remove: () => { errorListeners.delete(cb); } };
    }),
    getAvailablePurchases: jest.fn(async () => (purchased ? [{ productId: sku }] : [])),
    currentEntitlementIOS: jest.fn(async () => (purchased ? { productId: sku } : null)),
    restorePurchases: jest.fn(async () => {
      setTimeout(() => {
        emitUpdate({ productId: sku });
      }, 5);
    }),
    presentCodeRedemptionSheet: jest.fn(async () => null),
    presentCodeRedemptionSheetIOS: jest.fn(async () => null),
    isTransactionVerifiedIOS: jest.fn(async () => true),
    __emitPurchaseUpdated: emitUpdate,
    __emitPurchaseError: emitError,
    __resetIapMock: () => {
      purchased = false;
      listeners.clear();
      errorListeners.clear();
    },
  };
});

jest.mock('expo-localization', () => ({
  locale: 'zh-Hant',
  getLocales: jest.fn(() => [{ languageTag: 'zh-Hant' }]),
  getCalendars: jest.fn(() => [{ uses24hourClock: true }]),
}));

jest.mock('expo-constants', () => ({
  default: {
    appOwnership: 'standalone',
    executionEnvironment: 'standalone',
  },
}));

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(),
}));

process.env.EXPO_PUBLIC_IAP_SIMULATE = '1';

try {
  const RN = require('react-native');
  RN.Alert = RN.Alert || {};
  RN.Alert.alert = (title, message, buttons = []) => {
    const ok = buttons.find((b) => b.style !== 'cancel') || buttons[0];
    ok?.onPress?.();
  };
} catch { /* ignore */ }

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => {
      store.set(k, String(v));
    }),
    removeItem: jest.fn(async (k) => {
      store.delete(k);
    }),
    clear: jest.fn(async () => {
      store.clear();
    }),
  };
});
