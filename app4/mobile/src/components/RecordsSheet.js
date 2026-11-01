import React, { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { formatDb, formatDuration } from '../lib/meter';
import { canEditNote, canExport } from '../lib/gating';
import { mapExportError, shareCsv, shareImage, sharePdf } from '../lib/export';
import { deleteRecord, updateRecordNote } from '../data/records';

export default function RecordsSheet({
  visible,
  records,
  isPro,
  onClose,
  onNeedPro,
}) {
  const insets = useSafeAreaInsets();
  const shotRef = useRef(null);
  const [openId, setOpenId] = useState(null);
  const open = records.find((r) => r.id === openId) || null;

  async function onExport(kind) {
    if (!canExport({ isPro })) {
      onNeedPro?.('export');
      return;
    }
    try {
      if (kind === 'csv') await shareCsv(records);
      else if (kind === 'pdf') await sharePdf(records);
      else await shareImage(shotRef.current);
    } catch (e) {
      Alert.alert(t('common.fail'), mapExportError(e));
    }
  }

  async function onNote(text) {
    if (!open) return;
    if (!canEditNote({ isPro })) {
      onNeedPro?.('records');
      return;
    }
    try {
      await updateRecordNote(open.id, text);
    } catch {
      onNeedPro?.('records');
    }
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
            <View ref={shotRef} collapsable={false} style={styles.shot}>
              {records.length === 0 ? (
                <Text style={styles.empty}>{t('records.empty')}</Text>
              ) : records.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => setOpenId(openId === r.id ? null : r.id)}
                  style={styles.row}
                  accessibilityRole="button"
                >
                  <Text style={styles.when}>{new Date(r.createdAt).toLocaleString()}</Text>
                  <Text style={styles.stats}>
                    {t('meter.max')} {formatDb(r.max)} · {t('meter.avg')} {formatDb(r.avg)} · {t('meter.min')} {formatDb(r.min)}
                  </Text>
                  <Text style={styles.meta}>{formatDuration(r.durationMs)} · {t('export.estimateNote')}</Text>
                  {openId === r.id ? (
                    <View style={styles.detail}>
                      {isPro ? (
                        <TextInput
                          value={r.note}
                          onChangeText={onNote}
                          placeholder={t('records.notePlaceholder')}
                          style={styles.note}
                          multiline
                        />
                      ) : (
                        <Text style={styles.viewOnly}>{r.note || t('records.viewOnly')}</Text>
                      )}
                      <Pressable onPress={() => deleteRecord(r.id)} accessibilityRole="button">
                        <Text style={styles.delete}>{t('records.delete')}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
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
  title: { fontSize: 20, fontWeight: '600', color: '#1C1A17', marginBottom: 4 },
  hint: { fontSize: 13, color: '#8A837C', marginBottom: 8 },
  exportRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  link: { color: '#3F8A57', fontSize: 16, fontWeight: '600' },
  shot: { backgroundColor: '#F7F5F2' },
  empty: { fontSize: 15, color: '#6B6560', paddingVertical: 16 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6E1DA' },
  when: { fontSize: 14, color: '#1C1A17', fontWeight: '600' },
  stats: { fontSize: 14, color: '#6B6560', marginTop: 4, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, color: '#8A837C', marginTop: 4 },
  detail: { marginTop: 8 },
  note: {
    borderWidth: 1,
    borderColor: '#E6E1DA',
    borderRadius: 8,
    padding: 8,
    minHeight: 56,
    color: '#1C1A17',
  },
  viewOnly: { fontSize: 14, color: '#6B6560' },
  delete: { color: '#C65B45', marginTop: 8, fontWeight: '600' },
  done: {
    backgroundColor: '#1C1A17',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  doneText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
