import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/useTheme';
import { Mascot } from '../components/Mascot';
import { ChevronLeftIcon, InfinityIcon, ShareIcon, CheckIcon } from '../components/Icons';
import { purchaseProUnlock, restoreProUnlock, getProDisplayPrice, canPresentRedeemCode, presentRedeemCodeSheet } from '../lib/iap';
import { isProUnlocked, subscribePro } from '../lib/entitlements';
import { FREE_ACTIVITY_LIMIT, FREE_HISTORY_LIMIT } from '../data/repository';
import { t } from '../i18n';

export default function PaywallScreen() {
  const c = useThemeColors();
  const nav = useNavigation();
  const { params } = useRoute();
  const insets = useSafeAreaInsets();
  const historyReason = params?.reason === 'history';
  const [pro, setPro] = React.useState(false);
  const [price, setPrice] = React.useState(null);
  const [priceReady, setPriceReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const busyLock = React.useRef(false);

  const loadPrice = React.useCallback(async () => {
    setPriceReady(false);
    try {
      const p = await getProDisplayPrice();
      setPrice(p);
    } catch {
      setPrice(null);
    } finally {
      setPriceReady(true);
    }
  }, []);

  React.useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  React.useEffect(() => {
    loadPrice();
  }, [loadPrice]);

  function beginBusy() {
    if (busyLock.current) return false;
    busyLock.current = true;
    setBusy(true);
    return true;
  }

  function endBusy() {
    busyLock.current = false;
    setBusy(false);
  }

  async function buy() {
    if (busy || pro || !beginBusy()) return;
    try {
      const r = await purchaseProUnlock();
      if (r.ok) {
        setPro(true);
        return;
      }
      if (r.pending || r.cancelled) return;
      Alert.alert(t('common.fail'), r.error || t('iap.buyFail'));
    } finally {
      endBusy();
    }
  }

  async function restore() {
    if (busy || !beginBusy()) return;
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
      endBusy();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.pwblk, { backgroundColor: c.pwband, paddingTop: insets.top }]}>
        <View style={styles.nav}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.navBtn} accessibilityLabel={t('common.back')}>
            <ChevronLeftIcon color={c.brand} />
          </TouchableOpacity>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.heroArt}>
          <Mascot size={96} mood="happy" />
        </View>
      </View>
      <View style={styles.pw}>
        <Text style={[styles.h1, { color: c.label }]}>
          {historyReason
            ? t('paywall.historyHeadline', { n: FREE_HISTORY_LIMIT })
            : t('paywall.headline', { n: FREE_ACTIVITY_LIMIT })}
        </Text>
        <View style={{ marginTop: 32 }}>
          <Feature
            icon={<InfinityIcon color={c.brand} size={22} />}
            title={t('paywall.unlimited')}
            sub={t('paywall.unlimitedSub', { n: FREE_ACTIVITY_LIMIT })}
          />
          <Feature
            icon={<CheckIcon color={c.brand} size={20} />}
            title={t('paywall.history')}
            sub={t('paywall.historySub', { n: FREE_HISTORY_LIMIT })}
          />
          <Feature
            icon={<ShareIcon color={c.brand} size={20} />}
            title={t('paywall.share')}
            sub={t('paywall.shareSub')}
          />
        </View>
      </View>
      <View style={[styles.bottom, { paddingBottom: 34 + insets.bottom }]}>
        {priceReady ? (
          price ? (
            <Text style={[styles.price, { color: c.label }]}>{price}</Text>
          ) : (
            <TouchableOpacity onPress={loadPrice} style={styles.retry} accessibilityLabel={t('common.retry')}>
              <Text style={[styles.priceFail, { color: c.label }]}>{t('paywall.priceFail')}</Text>
              <Text style={{ color: c.brand, fontSize: 15, fontFamily: 'BeenAgesRounded-SemiBold', marginTop: 4 }}>{t('common.retry')}</Text>
            </TouchableOpacity>
          )
        ) : (
          <ActivityIndicator color={c.brand} />
        )}
        <Text style={[styles.once, { color: c.l2 }]}>{t('paywall.once')}</Text>
        <TouchableOpacity
          onPress={buy}
          disabled={busy || pro}
          accessibilityState={{ disabled: busy || pro, busy }}
          accessibilityLabel={busy ? t('iap.processing') : (pro ? t('common.unlocked') : t('paywall.buy'))}
          style={[styles.cta, { backgroundColor: c.brand, opacity: busy ? 0.7 : 1 }]}
        >
          {busy ? (
            <View style={styles.ctaBusy}>
              <ActivityIndicator color={c.onbrand} />
              <Text style={[styles.ctaText, { color: c.onbrand }]}>{t('iap.processing')}</Text>
            </View>
          ) : (
            <Text style={[styles.ctaText, { color: c.onbrand }]}>{pro ? t('common.unlocked') : t('paywall.buy')}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.links}>
          <TouchableOpacity
            onPress={restore}
            disabled={busy}
            style={styles.linkBtn}
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={busy ? t('iap.processing') : t('settings.restore')}
          >
            {busy ? (
              <View style={styles.linkBusy}>
                <ActivityIndicator color={c.brand} size="small" />
                <Text style={{ color: c.brand, fontSize: 15, fontFamily: 'BeenAgesRounded-Regular' }}>{t('iap.processing')}</Text>
              </View>
            ) : (
              <Text style={{ color: c.brand, fontSize: 15, fontFamily: 'BeenAgesRounded-Regular' }}>{t('settings.restore')}</Text>
            )}
          </TouchableOpacity>
          {canPresentRedeemCode() ? (
            <TouchableOpacity
              onPress={() => { presentRedeemCodeSheet().catch(() => {}); }}
              disabled={busy}
              style={styles.linkBtn}
              accessibilityLabel={t('settings.redeem')}
            >
              <Text style={{ color: c.l2, fontSize: 15, fontFamily: 'BeenAgesRounded-Regular' }}>{t('settings.redeem')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Feature({ icon, title, sub }) {
  const c = useThemeColors();
  return (
    <View style={styles.f}>
      <View style={[styles.g, { backgroundColor: c.band }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.label, fontFamily: 'BeenAgesRounded-SemiBold', fontSize: 17 }}>{title}</Text>
        <Text style={{ color: c.l2, fontSize: 13, fontFamily: 'BeenAgesRounded-Regular', marginTop: 1 }}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pwblk: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 18 },
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heroArt: { alignItems: 'center', paddingBottom: 8 },
  pw: { paddingHorizontal: 28, paddingTop: 24 },
  h1: { fontSize: 34, fontFamily: 'BeenAgesRounded-Bold', lineHeight: 44 },
  f: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  g: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bottom: { marginTop: 'auto', paddingHorizontal: 20 },
  price: { textAlign: 'center', fontFamily: 'BeenAgesRounded-SemiBold', fontSize: 34 },
  priceFail: { textAlign: 'center', fontFamily: 'BeenAgesRounded-SemiBold', fontSize: 20 },
  retry: { alignItems: 'center', paddingVertical: 4 },
  once: { textAlign: 'center', fontSize: 13, marginTop: 2, fontFamily: 'BeenAgesRounded-Regular' },
  cta: { marginTop: 18, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 18, fontFamily: 'BeenAgesRounded-SemiBold' },
  ctaBusy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 16 },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  linkBusy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
