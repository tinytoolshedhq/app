import React, { useRef, useState } from 'react';
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
import ExportCard, {
  EXPORT_CARD_BG,
  EXPORT_CARD_WIDTH,
  recordsForExportImage,
} from './ExportCard';

export default function RecordsSheet({
  visible,
  records,
  isPro,
  onClose,
  onNeedPro,
}) {
  const insets = useSafeAreaInsets();
  const exportRef = useRef(null);
  const exportNodeWaiters = useRef([]);
  const swipeRefs = useRef({});
  const [captureOpen, setCaptureOpen] = useState(false);
  const imageSlice = recordsForExportImage(records);

  function bindExportNode(node) {
    exportRef.current = node;
    if (!node) return;
    const waiters = exportNodeWaiters.current;
    exportNodeWaiters.current = [];
    waiters.forEach((fn) => fn(node));
  }

  function waitForExportNode() {
    if (exportRef.current) return Promise.resolve(exportRef.current);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(Object.assign(new Error('EXPORT_UNAVAILABLE'), { code: 'EXPORT_UNAVAILABLE' }));
      }, 2000);
      exportNodeWaiters.current.push((node) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(node);
      });
    });
  }

  async function captureExportImage() {
    setCaptureOpen(true);
    try {
      const node = await waitForExportNode();
      await new Promise((resolve) => {
        const raf = global.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        raf(() => raf(resolve));
      });
      return await shareImage(node);
    } finally {
      setCaptureOpen(false);
      exportRef.current = null;
    }
  }

  async function onExport(kind) {
    if (!canExport({ isPro })) {
      onNeedPro?.('export');
      return;
    }
    try {
      let result;
      if (kind === 'csv') {
        await new Promise((resolve) => {
          Alert.alert(t('export.csv'), t('export.csvHint'), [
            { text: t('common.ok'), onPress: () => resolve() },
          ]);
        });
        result = await shareCsv(records);
      } else if (kind === 'pdf') result = await sharePdf(records);
      else result = await captureExportImage();
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
          {records.length > 0 ? (
            <Text style={styles.swipeHint}>{t('records.swipeHint')}</Text>
          ) : null}
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
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneText}>{t('settings.done')}</Text>
          </Pressable>
        </View>
        {captureOpen ? (
          <View
            pointerEvents="none"
            style={styles.offscreen}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View ref={bindExportNode} collapsable={false} style={styles.exportCapture}>
              <ExportCard
                records={imageSlice.records}
                overflowCount={imageSlice.overflowCount}
                width={EXPORT_CARD_WIDTH}
              />
            </View>
          </View>
        ) : null}
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
  swipeHint: { fontSize: 12, color: '#8A837C', marginBottom: 8 },
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
    left: -10000,
    top: 0,
    width: EXPORT_CARD_WIDTH,
    backgroundColor: EXPORT_CARD_BG,
  },
  exportCapture: {
    backgroundColor: EXPORT_CARD_BG,
    width: EXPORT_CARD_WIDTH,
    overflow: 'visible',
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
