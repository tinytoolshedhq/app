import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, useTheme } from '../theme/useTheme';
import { restoreProUnlock, canPresentRedeemCode, presentRedeemCodeSheet } from '../lib/iap';
import { isProUnlocked, subscribePro } from '../lib/entitlements';
import { getRecentlyDeleted, getCategories, subscribe } from '../data/repository';
import { ChevronLeftIcon, CheckIcon, RestoreIcon, LockIcon, PaintIcon, ClockIcon } from '../components/Icons';
import { SettingsRow, SettingsSwitch } from '../components/SettingsRow';
import { t } from '../i18n';
import Constants from 'expo-constants';

const PRIVACY_URL = 'https://tinytoolshedhq.github.io/app/app3/store/privacy.html';
const APPEARANCE_ORDER = ['auto', 'light', 'dark'];
const TIMES = ['08:00', '09:00', '10:00', '18:00', '21:00'];
const APPEARANCE_KEYS = { auto: 'settings.appearanceAuto', light: 'settings.appearanceLight', dark: 'settings.appearanceDark' };

function Sq({ bg, children }) {
  return <View style={[styles.sq, { backgroundColor: bg }]}>{children}</View>;
}

export default function SettingsScreen() {
  const c = useThemeColors();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    appearance, setAppearance, preciseTime, setPreciseTime,
    reminderTime, setReminderTime,
  } = useTheme();
  const [pro, setPro] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const busyLock = React.useRef(false);
  const [trash, setTrash] = React.useState(() => getRecentlyDeleted().length);
  React.useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);
  React.useEffect(() => subscribe(() => setTrash(getRecentlyDeleted().length)), []);

  async function restore() {
    if (busy || busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    try {
      const r = await restoreProUnlock();
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

  function cycleAppearance() {
    const i = APPEARANCE_ORDER.indexOf(appearance);
    setAppearance(APPEARANCE_ORDER[(i + 1) % APPEARANCE_ORDER.length]);
  }

  function cycleTime() {
    const i = TIMES.indexOf(reminderTime);
    setReminderTime(TIMES[(i + 1) % TIMES.length]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.set, paddingTop: insets.top }}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.navBtn} accessibilityLabel={t('common.back')}>
          <ChevronLeftIcon color={c.brand} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.label }]}>{t('settings.title')}</Text>
        <View style={styles.navBtn} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <View style={[styles.grp, { backgroundColor: c.cell }]}>
          <SettingsRow
            icon={<Sq bg={c.brand}><CheckIcon color="#fff" size={15} /></Sq>}
            title={t('settings.pro')}
            value={pro ? t('common.unlocked') : ''}
            onPress={() => nav.navigate('Paywall')}
            chev
          />
          <View style={styles.restoreRow}>
            <TouchableOpacity
              onPress={restore}
              disabled={busy}
              style={styles.restoreMain}
              activeOpacity={0.6}
              accessibilityState={{ disabled: busy, busy }}
              accessibilityLabel={busy ? t('iap.processing') : t('settings.restore')}
            >
              <Sq bg="#8E8E93"><RestoreIcon color="#fff" size={15} /></Sq>
              <Text style={[styles.restoreTitle, { color: c.label }]}>
                {busy ? t('iap.processing') : t('settings.restore')}
              </Text>
              {busy ? <ActivityIndicator color={c.brand} size="small" /> : null}
            </TouchableOpacity>
            {canPresentRedeemCode() ? (
              <TouchableOpacity
                onPress={() => { presentRedeemCodeSheet().catch(() => {}); }}
                disabled={busy}
                hitSlop={8}
                accessibilityLabel={t('settings.redeem')}
              >
                <Text style={{ color: c.l2, fontSize: 15, fontFamily: 'BeenAgesRounded-Regular' }}>{t('settings.redeem')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Text style={[styles.sec, { color: c.label }]}>{t('settings.data')}</Text>
        <View style={[styles.grp, { backgroundColor: c.cell }]}>
          <SettingsRow
            title={t('category.title')}
            value={String(getCategories().length + 1)}
            onPress={() => nav.navigate('Categories')}
            chev
          />
          <SettingsRow
            title={t('settings.recentlyDeleted')}
            value={String(trash)}
            onPress={() => nav.navigate('RecentlyDeleted')}
            chev
            last
          />
        </View>

        <Text style={[styles.sec, { color: c.label }]}>{t('settings.display')}</Text>
        <View style={[styles.grp, { backgroundColor: c.cell }]}>
          <SettingsRow
            icon={<Sq bg="#5856D6"><PaintIcon color="#fff" size={15} /></Sq>}
            title={t('settings.appearance')}
            value={t(APPEARANCE_KEYS[appearance] || 'settings.appearanceAuto')}
            onPress={cycleAppearance}
            chev
          />
          <SettingsRow
            icon={<Sq bg="#007AFF"><ClockIcon color="#fff" size={15} /></Sq>}
            title={t('settings.preciseTime')}
            right={(
              <SettingsSwitch value={preciseTime} onValueChange={setPreciseTime} accessibilityLabel={t('settings.preciseTime')} />
            )}
          />
          <SettingsRow
            icon={<Sq bg="#FF9500"><ClockIcon color="#fff" size={15} /></Sq>}
            title={t('settings.reminderTime')}
            value={reminderTime}
            onPress={cycleTime}
            chev
            last
          />
        </View>

        <View style={[styles.grp, { backgroundColor: c.cell, marginTop: 32 }]}>
          <SettingsRow
            title={t('settings.rate')}
            onPress={() => open('itms-apps://itunes.apple.com/app/id6822311922?action=write-review')}
            chev
          />
          <SettingsRow
            icon={<Sq bg="#8E8E93"><LockIcon color="#fff" size={15} /></Sq>}
            title={t('settings.privacy')}
            onPress={() => open(PRIVACY_URL)}
            chev
            last
          />
        </View>
        <Text style={{ textAlign: 'center', marginTop: 28, color: c.l3, fontSize: 13, fontFamily: 'BeenAgesRounded-Regular' }}>
          Been Ages {Constants.expoConfig?.version || Constants.nativeAppVersion || ''}
        </Text>
      </ScrollView>
    </View>
  );
}

function open(url) {
  Linking.openURL(url).catch(() => {});
}

const styles = StyleSheet.create({
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'BeenAgesRounded-SemiBold', fontSize: 17 },
  sec: { fontSize: 20, fontFamily: 'BeenAgesRounded-Bold', paddingTop: 28, paddingHorizontal: 20, paddingBottom: 8 },
  grp: { marginHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
  restoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    gap: 12,
  },
  restoreMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  restoreTitle: { fontSize: 17, fontFamily: 'BeenAgesRounded-Regular', flex: 1 },
  sq: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});
