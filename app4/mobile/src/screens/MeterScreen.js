import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GaugeBar from '../components/GaugeBar';
import PaywallSheet from '../components/PaywallSheet';
import RecordsSheet from '../components/RecordsSheet';
import SettingsSheet from '../components/SettingsSheet';
import {
  getPrefs,
  setOffset as persistOffset,
  subscribePrefs,
} from '../data/prefs';
import { getRecords, saveRecord, subscribeRecords } from '../data/records';
import { isProUnlocked, subscribePro } from '../lib/entitlements';
import { t } from '../i18n';
import { useMetering } from '../hooks/useMetering';
import { formatDb, formatDuration } from '../lib/meter';
import { openAppSettings } from '../lib/openSettings';
import { CONTENT_MAX_WIDTH } from '../lib/layout';
import { canSaveRecord, canUseVibration, shouldWarnInaccurate } from '../lib/gating';
import { levelCopyKey } from '../lib/levels';

function loadHaptics() {
  try {
    return require('expo-haptics');
  } catch {
    return null;
  }
}

export default function MeterScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState(getPrefs);
  const [records, setRecords] = useState(getRecords);
  const [pro, setPro] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [paywall, setPaywall] = useState({ open: false, reason: null });
  const lastBuzz = useRef(0);
  const meterRef = useRef(null);
  const persistRef = useRef(async () => false);

  const showPaywall = useCallback((reason) => {
    setPaywall({ open: true, reason });
  }, []);

  const meter = useMetering(prefs.offset, {
    isPro: pro,
    onDurationLimit: () => {
      persistRef.current?.({ skipLimitPaywall: true }).finally(() => showPaywall('duration'));
    },
  });

  useEffect(() => {
    meterRef.current = meter;
  }, [meter]);

  useEffect(() => subscribePrefs(setPrefs), []);
  useEffect(() => subscribeRecords(setRecords), []);
  useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  useEffect(() => {
    if (!meter.running || !canUseVibration({ isPro: pro }) || !prefs.vibrationEnabled) return;
    if (!Number.isFinite(meter.displayDb) || meter.displayDb < prefs.vibrationThreshold) return;
    const now = Date.now();
    if (now - lastBuzz.current < 2000) return;
    lastBuzz.current = now;
    const Haptics = loadHaptics();
    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Warning).catch(() => {});
  }, [meter.displayDb, meter.running, pro, prefs.vibrationEnabled, prefs.vibrationThreshold]);

  async function changeOffset(next) {
    await persistOffset(next);
  }

  useEffect(() => {
    persistRef.current = async function persistSession({ skipLimitPaywall = false } = {}) {
      const m = meterRef.current || meter;
      const snapshot = {
        current: m.displayDb,
        max: m.max,
        avg: m.avg,
        min: m.min,
        durationMs: m.elapsedMs,
        offset: prefs.offset,
        calibrationName: (prefs.calibrations || []).find((c) => c.id === prefs.activeCalibrationId)?.name || '',
      };
      if (m.sampleCount <= 0 && !Number.isFinite(m.displayDb)) return false;
      if (!canSaveRecord({ recordCount: records.length, isPro: pro })) {
        if (!skipLimitPaywall) showPaywall('records');
        return false;
      }
      try {
        await saveRecord(snapshot);
        return true;
      } catch (e) {
        if (e?.code === 'FREE_LIMIT') showPaywall('records');
        return false;
      }
    };
  }, [meter, prefs, records.length, pro, showPaywall]);

  async function onPrimary() {
    if (meter.running) {
      await meter.stop();
      await persistRef.current();
      return;
    }
    await meter.start();
  }

  const showDenied = meter.permission === 'denied';
  const levelKey = levelCopyKey(meter.displayDb);
  const warn = shouldWarnInaccurate(meter.displayDb);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.frame}>
        <View style={styles.top}>
          <Text style={styles.title}>{t('app.title')}</Text>
          <View style={styles.topLinks}>
            <Pressable
              onPress={() => setRecordsOpen(true)}
              style={styles.calibrate}
              accessibilityRole="button"
              accessibilityLabel={t('records.open')}
            >
              <Text style={styles.calibrateText}>{t('records.open')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setSettingsOpen(true)}
              style={styles.calibrate}
              accessibilityRole="button"
              accessibilityLabel={t('settings.open')}
            >
              <Text style={styles.calibrateText}>{t('settings.open')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.center}>
          {showDenied ? (
            <View style={styles.deniedBox}>
              <Text style={styles.denied}>{t('permission.denied')}</Text>
              <Pressable onPress={meter.start} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t('permission.tryAgain')}</Text>
              </Pressable>
              {meter.settingsHint ? (
                <Text style={styles.hint}>{t('permission.settingsHint')}</Text>
              ) : null}
              <Pressable
                onPress={() => { openAppSettings(Linking); }}
                style={styles.link}
                accessibilityRole="button"
              >
                <Text style={styles.linkText}>{t('permission.openSettings')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text
                style={styles.value}
                accessibilityRole="text"
                accessibilityLabel={`${formatDb(meter.displayDb)} ${t('app.unit')}`}
              >
                {formatDb(meter.displayDb)}
              </Text>
              <Text style={styles.unit}>{t('app.unit')}</Text>
              <View style={styles.gaugeWrap}>
                <GaugeBar value={meter.displayDb} />
              </View>
              <View style={styles.stats}>
                <Text style={styles.stat}>{t('meter.max')} {formatDb(meter.max)}</Text>
                <Text style={styles.stat}>{t('meter.avg')} {formatDb(meter.avg)}</Text>
                <Text style={styles.stat}>{t('meter.min')} {formatDb(meter.min)}</Text>
              </View>
              <Text style={styles.stat}>{t('meter.duration')} {formatDuration(meter.elapsedMs)}</Text>
              {levelKey ? <Text style={styles.level}>{t(levelKey)}</Text> : null}
              {warn ? <Text style={styles.warn}>{t('accuracy.warning')}</Text> : null}
            </>
          )}
        </View>

        {!showDenied && (
          <Pressable
            onPress={onPrimary}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel={meter.running ? t('meter.stop') : t('meter.start')}
          >
            <Text style={styles.primaryText}>{meter.running ? t('meter.stop') : t('meter.start')}</Text>
          </Pressable>
        )}

        <Text style={styles.tip}>{t('accuracy.tip')}</Text>
        <Text style={styles.note}>{t('meter.estimate')}</Text>
      </View>

      <SettingsSheet
        visible={settingsOpen}
        prefs={prefs}
        isPro={pro}
        onChangeOffset={changeOffset}
        onClose={() => setSettingsOpen(false)}
        onNeedPro={(reason) => {
          setSettingsOpen(false);
          showPaywall(reason);
        }}
      />
      <RecordsSheet
        visible={recordsOpen}
        records={records}
        isPro={pro}
        onClose={() => setRecordsOpen(false)}
        onNeedPro={(reason) => {
          setRecordsOpen(false);
          showPaywall(reason);
        }}
      />
      <PaywallSheet
        visible={paywall.open}
        reason={paywall.reason}
        onClose={() => setPaywall({ open: false, reason: null })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F5F2',
    paddingHorizontal: 24,
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLinks: { flexDirection: 'row', gap: 12 },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1A17',
  },
  calibrate: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  calibrateText: {
    fontSize: 16,
    color: '#3F8A57',
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 96,
    lineHeight: 104,
    fontWeight: '700',
    color: '#1C1A17',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 20,
    color: '#6B6560',
    marginBottom: 28,
  },
  gaugeWrap: {
    width: '100%',
    maxWidth: 360,
  },
  stats: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 20,
  },
  stat: {
    fontSize: 16,
    color: '#6B6560',
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  level: {
    fontSize: 14,
    color: '#6B6560',
    marginTop: 12,
    textAlign: 'center',
  },
  warn: {
    fontSize: 13,
    color: '#C65B45',
    marginTop: 8,
    textAlign: 'center',
  },
  primary: {
    backgroundColor: '#1C1A17',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  tip: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A837C',
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A837C',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  deniedBox: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  denied: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1C1A17',
    textAlign: 'center',
    marginBottom: 20,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B6560',
    textAlign: 'center',
    marginBottom: 8,
  },
  secondary: {
    backgroundColor: '#1C1A17',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  secondaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    paddingVertical: 8,
  },
  linkText: {
    color: '#3F8A57',
    fontSize: 16,
    fontWeight: '600',
  },
});
