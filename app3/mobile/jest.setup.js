// Basic jest setup for non-UI logic tests
jest.mock('expo-iap', () => {
  let purchased = false;
  const listeners = new Set();
  const errorListeners = new Set();
  const sku = process.env.EXPO_PUBLIC_IAP_PRODUCT_ID || 'com.beenages.app.fullpack';
  const emitUpdate = (purchase) => {
    purchased = true;
    for (const cb of [...listeners]) {
      try { cb(purchase); } catch {}
    }
  };
  const emitError = (error) => {
    for (const cb of [...errorListeners]) {
      try { cb(error); } catch {}
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
  locale: 'en',
  getLocales: jest.fn(() => [{ languageTag: 'en' }]),
  getCalendars: jest.fn(() => [{ uses24hourClock: true }]),
}));

jest.mock('expo-constants', () => ({
  default: {
    appOwnership: 'standalone',
    executionEnvironment: 'standalone',
  },
}));

jest.mock('expo-font', () => ({
  loadAsync: jest.fn(async () => {}),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-calendar', () => ({
  requestCalendarPermissions: jest.fn(async () => ({ status: 'granted', granted: true, writeOnly: true })),
  getDefaultCalendarSync: jest.fn(() => ({
    createEvent: jest.fn(async (details) => ({ id: 'evt', ...details })),
  })),
}), { virtual: true });

jest.mock('expo-file-system', () => ({
  cacheDirectory: '/tmp/',
  documentDirectory: '/tmp/',
  writeAsStringAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => { throw new Error('no file'); }),
  getInfoAsync: jest.fn(async () => ({ exists: false, size: 0 })),
  deleteAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => {}),
}), { virtual: true });

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/card.png'),
}), { virtual: true });

jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: null, uri: null }) }) },
}), { virtual: true });

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  function MockPicker({ value, onChange, testID }) {
    return React.createElement(TextInput, {
      testID,
      value: value instanceof Date ? value.toISOString() : '',
      onChangeText: (text) => {
        const d = new Date(text);
        if (!Number.isNaN(d.getTime())) onChange({ type: 'set' }, d);
      },
    });
  }
  return { __esModule: true, default: MockPicker };
});

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => false),
    supportsOnDeviceRecognition: jest.fn(() => false),
    requestMicrophonePermissionsAsync: jest.fn(async () => ({ granted: false })),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

process.env.EXPO_PUBLIC_IAP_SIMULATE = '1';

try {
  const RN = require('react-native');
  RN.Alert = RN.Alert || {};
  RN.Alert.alert = (title, message, buttons = []) => {
    const ok = buttons.find((b) => b.style !== 'cancel') || buttons[0];
    ok?.onPress?.();
  };
} catch {}

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
