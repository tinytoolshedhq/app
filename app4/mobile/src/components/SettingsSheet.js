import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { OFFSET_MAX, OFFSET_MIN, formatOffset } from '../lib/meter';
import { canAddCalibration, canUseVibration } from '../lib/gating';
import {
  addCalibration,
  removeCalibration,
  renameCalibration,
  selectCalibration,
  setVibrationEnabled,
  setVibrationThreshold,
} from '../data/prefs';
import {
  canPresentRedeemCode,
  presentRedeemCodeSheet,
  restoreProUnlock,
  runIapBusy,
} from '../lib/iap';

export default function SettingsSheet({
  visible,
  prefs,
  isPro,
  onChangeOffset,
  onClose,
  onNeedPro,
}) {
  const insets = useSafeAreaInsets();
  const offset = prefs?.offset ?? 0;
  const calibrations = prefs?.calibrations || [];
  const minusDisabled = offset <= OFFSET_MIN;
  const plusDisabled = offset >= OFFSET_MAX;
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);
  const [newName, setNewName] = useState('');

  async function addProfile() {
    if (!canAddCalibration({ calibrationCount: calibrations.length, isPro })) {
      onNeedPro?.('calibration');
      return;
    }
    try {
      await addCalibration(newName.trim(), offset);
      setNewName('');
    } catch (e) {
      if (e?.code === 'FREE_LIMIT') onNeedPro?.('calibration');
    }
  }

  async function restore() {
    if (busy || busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    try {
      const r = await runIapBusy(() => restoreProUnlock());
      if (r.ok && r.restored !== false) {
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

  function onToggleVibration(value) {
    if (!canUseVibration({ isPro })) {
      onNeedPro?.('calibration');
      return;
    }
    setVibrationEnabled(value);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('settings.done')} />
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom, maxHeight: '88%' }]}>
          <ScrollView>
            <Text style={styles.title}>{t('settings.title')}</Text>
            <Text style={styles.label}>{t('settings.calibrate')}</Text>
            {calibrations.map((cal) => {
              const active = cal.id === prefs.activeCalibrationId;
              const label = cal.name.trim() || t('settings.defaultProfile');
              return (
                <View key={cal.id} style={styles.profileRow}>
                  <Pressable
                    onPress={() => selectCalibration(cal.id)}
                    style={styles.profileMain}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.profileName, active && styles.profileOn]}>{label}</Text>
                    <Text style={styles.profileOff}>{formatOffset(cal.offset)} {t('settings.unit')}</Text>
                  </Pressable>
                  {isPro ? (
                    <TextInput
                      value={cal.name}
                      onChangeText={(name) => renameCalibration(cal.id, name)}
                      placeholder={t('settings.profileName')}
                      style={styles.profileInput}
                    />
                  ) : null}
                  {isPro && calibrations.length > 1 ? (
                    <Pressable onPress={() => removeCalibration(cal.id)} accessibilityRole="button">
                      <Text style={styles.remove}>{t('settings.removeProfile')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <View style={styles.addRow}>
              {isPro ? (
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={t('settings.profileName')}
                  style={styles.profileInput}
                />
              ) : null}
              <Pressable onPress={addProfile} accessibilityRole="button">
                <Text style={styles.link}>{t('settings.addProfile')}</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>{t('settings.offset')}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => onChangeOffset(offset - 1)}
                disabled={minusDisabled}
                style={[styles.stepBtn, minusDisabled && styles.stepBtnOff]}
                accessibilityLabel={t('settings.minus')}
                accessibilityRole="button"
              >
                <Text style={styles.stepBtnText}>-</Text>
              </Pressable>
              <Text style={styles.value} accessibilityLabel={`${t('settings.offset')} ${formatOffset(offset)} ${t('settings.unit')}`}>
                {formatOffset(offset)} {t('settings.unit')}
              </Text>
              <Pressable
                onPress={() => onChangeOffset(offset + 1)}
                disabled={plusDisabled}
                style={[styles.stepBtn, plusDisabled && styles.stepBtnOff]}
                accessibilityLabel={t('settings.plus')}
                accessibilityRole="button"
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
            <Text style={styles.help}>{t('settings.offsetHelp')}</Text>
            <Text style={styles.recalc}>{t('settings.offsetRecalc')}</Text>

            <Text style={styles.label}>{t('settings.vibration')}</Text>
            <View style={styles.vibRow}>
              <Switch
                value={!!prefs?.vibrationEnabled && isPro}
                onValueChange={onToggleVibration}
                accessibilityLabel={t('settings.vibration')}
              />
              <Text style={styles.help}>{t('settings.threshold')} {prefs?.vibrationThreshold ?? 85} {t('settings.unit')}</Text>
            </View>
            {isPro ? (
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setVibrationThreshold((prefs.vibrationThreshold || 85) - 1)}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.stepBtnText}>-</Text>
                </Pressable>
                <Pressable
                  onPress={() => setVibrationThreshold((prefs.vibrationThreshold || 85) + 1)}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.help}>{t('settings.vibrationHelp')}</Text>
            )}

            <Pressable
              onPress={restore}
              disabled={busy}
              style={styles.restore}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              accessibilityLabel={busy ? t('iap.processing') : t('settings.restore')}
            >
              {busy ? (
                <View style={styles.row}>
                  <ActivityIndicator color="#3F8A57" />
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
                accessibilityRole="button"
                accessibilityLabel={t('settings.redeem')}
              >
                <Text style={styles.linkMuted}>{t('settings.redeem')}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneText}>{t('settings.done')}</Text>
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
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    color: '#6B6560',
    marginBottom: 12,
    marginTop: 8,
  },
  profileRow: {
    marginBottom: 10,
  },
  profileMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileName: { fontSize: 16, color: '#1C1A17' },
  profileOn: { fontWeight: '700', color: '#3F8A57' },
  profileOff: { fontSize: 14, color: '#6B6560', fontVariant: ['tabular-nums'] },
  profileInput: {
    borderWidth: 1,
    borderColor: '#E6E1DA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
    color: '#1C1A17',
  },
  addRow: { marginBottom: 8 },
  remove: { color: '#C65B45', marginTop: 4, fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1C1A17',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: {
    opacity: 0.3,
  },
  stepBtnText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '500',
  },
  value: {
    minWidth: 96,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '600',
    color: '#1C1A17',
    fontVariant: ['tabular-nums'],
  },
  help: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B6560',
    textAlign: 'center',
    marginBottom: 8,
  },
  recalc: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B6560',
    textAlign: 'center',
    marginBottom: 20,
  },
  vibRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  restore: { alignItems: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { color: '#3F8A57', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  linkMuted: { color: '#6B6560', fontSize: 16, textAlign: 'center', paddingVertical: 8 },
  done: {
    backgroundColor: '#1C1A17',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  doneText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
