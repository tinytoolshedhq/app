import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  purchaseProUnlock,
  restoreProUnlock,
  runIapBusy,
  getProDisplayPrice,
  canPresentRedeemCode,
  presentRedeemCodeSheet,
  isProUnlocked,
  subscribePro,
} from '../iap';
import { t } from '../i18n';
import { colors } from '../theme/colors';

export default function PaywallScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [pro, setPro] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [priceReady, setPriceReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);

  const loadPrice = useCallback(async () => {
    try {
      const next = await getProDisplayPrice();
      setPrice(next);
    } catch {
      setPrice(null);
    } finally {
      setPriceReady(true);
    }
  }, []);

  useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getProDisplayPrice();
        if (!cancelled) setPrice(next);
      } catch {
        if (!cancelled) setPrice(null);
      } finally {
        if (!cancelled) setPriceReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      const r = await runIapBusy(() => purchaseProUnlock());
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
      endBusy();
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable onPress={() => nav.goBack()} accessibilityLabel={t('common.back')}>
        <Text style={styles.back}>{t('common.back')}</Text>
      </Pressable>
      <Text style={styles.h1}>{t('paywall.headline')}</Text>
      <Text style={styles.body}>{t('paywall.body')}</Text>
      <Text style={styles.body}>{t('paywall.freeNote')}</Text>

      <View style={styles.bottom}>
        {priceReady ? (
          price ? (
            <Text style={styles.price}>{price}</Text>
          ) : (
            <Pressable onPress={loadPrice} accessibilityLabel={t('common.retry')}>
              <Text style={styles.priceFail}>{t('paywall.priceFail')}</Text>
              <Text style={styles.link}>{t('common.retry')}</Text>
            </Pressable>
          )
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
        <Text style={styles.once}>{t('paywall.once')}</Text>
        <Pressable
          onPress={buy}
          disabled={busy || pro}
          accessibilityState={{ disabled: busy || pro, busy }}
          accessibilityLabel={busy ? t('iap.processing') : (pro ? t('common.unlocked') : t('paywall.buy'))}
          style={[styles.cta, { opacity: busy ? 0.7 : 1 }]}
        >
          {busy ? (
            <View style={styles.ctaBusy}>
              <ActivityIndicator color={colors.onbrand} />
              <Text style={styles.ctaText}>{t('iap.processing')}</Text>
            </View>
          ) : (
            <Text style={styles.ctaText}>{pro ? t('common.unlocked') : t('paywall.buy')}</Text>
          )}
        </Pressable>
        <View style={styles.links}>
          <Pressable
            onPress={restore}
            disabled={busy}
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={busy ? t('iap.processing') : t('settings.restore')}
          >
            {busy ? (
              <View style={styles.linkBusy}>
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
              disabled={busy}
              accessibilityLabel={t('settings.redeem')}
            >
              <Text style={styles.dim}>{t('settings.redeem')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  back: { color: colors.brand, fontSize: 16, marginBottom: 16 },
  h1: { fontSize: 32, fontWeight: '700', color: colors.label, lineHeight: 40 },
  body: { marginTop: 12, color: colors.l2, fontSize: 16, lineHeight: 24 },
  bottom: { marginTop: 'auto' },
  price: { textAlign: 'center', fontWeight: '600', fontSize: 34, color: colors.label },
  priceFail: { textAlign: 'center', fontWeight: '600', fontSize: 20, color: colors.label },
  once: { textAlign: 'center', fontSize: 13, marginTop: 2, color: colors.l2 },
  cta: {
    marginTop: 18,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 18, fontWeight: '600', color: colors.onbrand },
  ctaBusy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 16 },
  link: { color: colors.brand, fontSize: 15 },
  dim: { color: colors.l2, fontSize: 15 },
  linkBusy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
