import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import {
  canPresentRedeemCode,
  getProDisplayPrice,
  presentRedeemCodeSheet,
  purchaseProUnlock,
  restoreProUnlock,
  runIapBusy,
} from '../lib/iap';
import { isProUnlocked, subscribePro } from '../lib/entitlements';

const REASON_KEYS = {
  records: 'paywall.records',
  export: 'paywall.export',
  duration: 'paywall.duration',
  calibration: 'paywall.calibration',
};

export default function PaywallSheet({ visible, reason, onClose }) {
  const insets = useSafeAreaInsets();
  const [pro, setPro] = useState(false);
  const [price, setPrice] = useState(null);
  const [priceReady, setPriceReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);

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

  useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setPriceReady(false);
      try {
        const p = await getProDisplayPrice();
        if (!cancelled) setPrice(p);
      } catch {
        if (!cancelled) setPrice(null);
      } finally {
        if (!cancelled) setPriceReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

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
      if (r.ok && r.restored) {
        setPro(true);
        Alert.alert(t('settings.restore'), t('iap.restored'));
        return;
      }
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

  const reasonText = REASON_KEYS[reason] ? t(REASON_KEYS[reason]) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <Text style={styles.title}>{t('paywall.title')}</Text>
          {reasonText ? <Text style={styles.reason}>{reasonText}</Text> : null}
          <Text style={styles.feature}>{t('paywall.unlimited')}</Text>
          <Text style={styles.feature}>{t('paywall.exports')}</Text>
          <Text style={styles.feature}>{t('paywall.time')}</Text>
          <Text style={styles.feature}>{t('paywall.profiles')}</Text>
          <Text style={styles.feature}>{t('paywall.haptics')}</Text>
          {priceReady ? (
            price ? (
              <Text style={styles.price}>{price}</Text>
            ) : (
              <Pressable onPress={loadPrice} accessibilityRole="button">
                <Text style={styles.priceFail}>{t('paywall.priceFail')}</Text>
              </Pressable>
            )
          ) : (
            <ActivityIndicator color="#1C1A17" />
          )}
          <Text style={styles.once}>{t('paywall.once')}</Text>
          <Pressable
            onPress={buy}
            disabled={busy || pro}
            style={[styles.cta, (busy || pro) && styles.ctaOff]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || pro, busy }}
            accessibilityLabel={busy ? t('iap.processing') : (pro ? t('common.unlocked') : t('paywall.buy'))}
          >
            {busy ? (
              <View style={styles.row}>
                <ActivityIndicator color="#fff" />
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
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              accessibilityLabel={busy ? t('iap.processing') : t('settings.restore')}
            >
              <Text style={styles.link}>{busy ? t('iap.processing') : t('settings.restore')}</Text>
            </Pressable>
            {canPresentRedeemCode() ? (
              <Pressable
                onPress={() => { presentRedeemCodeSheet().catch(() => {}); }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('settings.redeem')}
              >
                <Text style={styles.linkMuted}>{t('settings.redeem')}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneText}>{t('common.close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 26, 23, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F7F5F2',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1A17',
    marginBottom: 8,
  },
  reason: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1C1A17',
    marginBottom: 12,
  },
  feature: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B6560',
  },
  price: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '600',
    color: '#1C1A17',
    marginTop: 16,
  },
  priceFail: {
    textAlign: 'center',
    fontSize: 15,
    color: '#6B6560',
    marginTop: 16,
  },
  once: {
    textAlign: 'center',
    fontSize: 13,
    color: '#8A837C',
    marginTop: 4,
    marginBottom: 16,
  },
  cta: {
    backgroundColor: '#1C1A17',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  ctaOff: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  link: { color: '#3F8A57', fontSize: 16, fontWeight: '600' },
  linkMuted: { color: '#6B6560', fontSize: 16 },
  done: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: { color: '#6B6560', fontSize: 16, fontWeight: '600' },
});
