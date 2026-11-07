import {
  useFonts,
  NotoSansTC_400Regular,
  NotoSansTC_500Medium,
  NotoSansTC_700Bold,
} from "@expo-google-fonts/noto-sans-tc";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initializeI18n, t } from "./i18n";
import { installWebAlert } from "./lib/webAlert";
import { loadBundledContent } from "./content";
import { initPrefs } from "./storage";
import AppNavigator from "./navigation/AppNavigator";
import { colors } from "./theme/colors";

installWebAlert();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansTC_400Regular,
    NotoSansTC_500Medium,
    NotoSansTC_700Bold,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        initializeI18n();
        loadBundledContent();
        await initPrefs();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(String((e as Error)?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || fontError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: colors.label, fontSize: 16 }}>
          {error || fontError?.message}
        </Text>
      </View>
    );
  }

  if (!ready || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: colors.l2 }}>{t("app.loading")}</Text>
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
