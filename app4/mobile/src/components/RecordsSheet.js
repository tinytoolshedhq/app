import React, { useRef } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { formatDb, formatDuration } from '../lib/meter';
import { canExport } from '../lib/gating';
import { mapExportError, mapExportSuccess, shareCsv, shareImage, sharePdf } from '../lib/export';
import { deleteRecord } from '../data/records';
import ExportCard, { EXPORT_CARD_WIDTH } from './ExportCard';

export default function RecordsSheet({
  visible,
  records,
  isPro,
  onClose,
  onNeedPro,
}) {
  const insets = useSafeAreaInsets();
  const exportRef = useRef(null);
  const swipeRefs = useRef({});

  async function onExport(kind) {
    if (!canExport({ isPro })) {
      onNeedPro?.('export');
      return;
    }
    try {
      let result;
      if (kind === 'csv') result = await shareCsv(records);
      else if (kind === 'pdf') result = await sharePdf(records);
      else result = await shareImage(exportRef.current);
      if (!result?.outcome) return;
      Alert.alert(t('common.ok'), mapExportSuccess(result.outcome));
    } catch (e) {
      if (e?.code === 'EXPORT_CANCELLED') return;
      Alert.alert(t('common.fail'), mapExportError(e));
    }
  }

  function confirmDelete(id) {
    swipeRefs.current[id]?.close?.();
    Alert.alert(t('records.deleteTitle'), t('records.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('records.delete'),
        style: 'destructive',
        onPress: () => {
          deleteRecord(id);
        },
      },
    ]);
  }

  function renderDelete(id) {
    return (
      <Pressable
        onPress={() => confirmDelete(id)}
        style={styles.swipeDelete}
        accessibilityRole="button"
        accessibilityLabel={t('records.delete')}
      >
        <Text style={styles.swipeDeleteText}>{t('records.delete')}</Text>
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom, maxHeight: '88%' }]}>
          <Text style={styles.title}>{t('records.title')}</Text>
          {!isPro ? <Text style={styles.hint}>{t('records.latest')}</Text> : null}
          <View style={styles.exportRow}>
            <Pressable onPress={() => onExport('csv')} accessibilityRole="button">
              <Text style={styles.link}>{t('export.csv')}</Text>
            </Pressable>
            <Pressable onPress={() => onExport('image')} accessibilityRole="button">
              <Text style={styles.link}>{t('export.image')}</Text>
            </Pressable>
            <Pressable onPress={() => onExport('pdf')} accessibilityRole="button">
              <Text style={styles.link}>{t('export.pdf')}</Text>
            </Pressable>
          </View>
          <ScrollView>
            {records.length === 0 ? (
              <Text style={styles.empty}>{t('records.empty')}</Text>
            ) : records.map((r) => (
              <Swipeable
                key={r.id}
                ref={(el) => {
                  swipeRefs.current[r.id] = el;
                }}
                overshootRight={false}
                renderRightActions={() => renderDelete(r.id)}
              >
                <View style={styles.row}>
                  <Text style={styles.when}>{new Date(r.createdAt).toLocaleString()}</Text>
                  <Text style={styles.stats}>
                    {t('meter.max')} {formatDb(r.max)} · {t('meter.avg')} {formatDb(r.avg)} · {t('meter.min')} {formatDb(r.min)}
                  </Text>
                  <Text style={styles.meta}>{formatDuration(r.durationMs)} · {t('export.estimateNote')}</Text>
                </View>
              </Swipeable>
            ))}
          </ScrollView>
          <View pointerEvents="none" style={styles.offscreen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View ref={exportRef} collapsable={false}>
              <ExportCard records={records} width={EXPORT_CARD_WIDTH} />
            </View>
          </View>
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
  title: { fontSize: 20, fontWeight: '600', color: '#1C1A17', marginBottom: 4 },
  hint: { fontSize: 13, color: '#8A837C', marginBottom: 8 },
  exportRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  link: { color: '#3F8A57', fontSize: 16, fontWeight: '600' },
  empty: { fontSize: 15, color: '#6B6560', paddingVertical: 16 },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6E1DA',
    backgroundColor: '#F7F5F2',
  },
  when: { fontSize: 14, color: '#1C1A17', fontWeight: '600' },
  stats: { fontSize: 14, color: '#6B6560', marginTop: 4, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, color: '#8A837C', marginTop: 4 },
  swipeDelete: {
    backgroundColor: '#C65B45',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
  },
  swipeDeleteText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  offscreen: {
    position: 'absolute',
    left: -EXPORT_CARD_WIDTH - 80,
    top: 0,
    width: EXPORT_CARD_WIDTH,
  },
  done: {
    backgroundColor: '#1C1A17',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  doneText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
