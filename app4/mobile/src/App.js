import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeI18n } from './i18n';
import { initPrefs } from './data/prefs';
import { initRecords } from './data/records';
import { startPurchaseUpdates, verifyProOnLaunch } from './lib/iap';
import { installWebAlert } from './lib/webAlert';
import MeterScreen from './screens/MeterScreen';

installWebAlert();

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      initializeI18n();
      try {
        await initPrefs();
      } catch {
        // defaults already in memory
      }
      try {
        await initRecords();
      } catch {
        // empty list
      }
      try { await startPurchaseUpdates(); } catch { /* Expo Go / web shim */ }
      try { await verifyProOnLaunch(); } catch { /* never block launch */ }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <MeterScreen />
    </SafeAreaProvider>
  );
}
