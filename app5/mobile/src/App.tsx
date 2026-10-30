import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { initializeI18n, t } from './i18n';
import { installWebAlert } from './lib/webAlert';
import { loadBundledContent } from './content';
import { startPurchaseUpdates, verifyProOnLaunch } from './iap';
import { initPrefs } from './storage';
import AppNavigator from './navigation/AppNavigator';
import { colors } from './theme/colors';

installWebAlert();

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        initializeI18n();
        loadBundledContent();
        await initPrefs();
        try { await startPurchaseUpdates(); } catch { /* IAP optional in Expo Go */ }
        await verifyProOnLaunch();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(String((e as Error)?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.label, fontSize: 16 }}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.l2 }}>{t('app.loading')}</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
