import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  restoreProUnlock,
  runIapBusy,
  canPresentRedeemCode,
  presentRedeemCodeSheet,
  isProUnlocked,
  subscribePro,
} from '../iap';
import { getPrefs, subscribePrefs, updatePrefs } from '../storage';
import { t } from '../i18n';
import { colors } from '../theme/colors';

export default function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState(getPrefs);
  const [pro, setPro] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);

  useEffect(() => subscribePrefs(setPrefs), []);
  useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  function beginBusy() {
    if (busyLock.current) return false;
    busyLock.current = true;
    setBusy(true);
    return true;
  }

  async function restore() {
    if (busy || busyLock.current) return;
    if (!beginBusy()) return;
    try {
      const r = await runIapBusy(() => restoreProUnlock());
      if (r.ok && r.restored !== false) {
        setPro(true);
        Alert.alert(t('settings.restore'), t('iap.restored'));
        return;
      }
      if (r.error) {
        Alert.alert(t('common.fail'), r.error);
        return;
      }
      Alert.alert(t('settings.restore'), t('iap.nothingToRestore'));
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => nav.goBack()} accessibilityLabel={t('common.back')}>
        <Text style={styles.back}>{t('common.back')}</Text>
      </Pressable>
      <Text style={styles.title}>{t('settings.title')}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{t('settings.voice')}</Text>
        <Pressable
          onPress={() => { updatePrefs({ voiceEnabled: !prefs.voiceEnabled }).catch(() => {}); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: prefs.voiceEnabled }}
        >
          <Text style={styles.link}>
            {prefs.voiceEnabled ? t('settings.voiceOn') : t('settings.voiceOff')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>{pro ? t('settings.unlocked') : t('settings.unlock')}</Text>
        {pro ? null : (
          <Pressable onPress={() => nav.navigate('Paywall')}>
            <Text style={styles.link}>{t('paywall.buy')}</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={restore}
        disabled={busy}
        accessibilityState={{ disabled: busy, busy }}
        accessibilityLabel={busy ? t('iap.processing') : t('settings.restore')}
        style={styles.row}
      >
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={styles.link}>{t('iap.processing')}</Text>
          </View>
        ) : (
          <Text style={styles.link}>{t('settings.restore')}</Text>
        )}
      </Pressable>

      {canPresentRedeemCode() ? (
        <Pressable
          onPress={() => { presentRedeemCodeSheet().catch(() => {}); }}
          accessibilityLabel={t('settings.redeem')}
          style={styles.row}
        >
          <Text style={styles.dim}>{t('settings.redeem')}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.safety}>{t('home.safety')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  back: { color: colors.brand, fontSize: 16, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.label, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.sep,
  },
  label: { fontSize: 16, color: colors.label },
  link: { color: colors.brand, fontSize: 16 },
  dim: { color: colors.l2, fontSize: 16 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  safety: { marginTop: 28, color: colors.l2, fontSize: 13, lineHeight: 20 },
});
