import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { formatDb, formatDuration } from '../lib/meter';

/** Fixed-width card captured off-screen. No chrome, no notes, no safe-area. */
export const EXPORT_CARD_WIDTH = 390;
export const EXPORT_CARD_PADDING_H = 32;
export const EXPORT_CARD_PADDING_V = 32;
export const EXPORT_CARD_BG = '#F7F5F2';

export default function ExportCard({ records, width = EXPORT_CARD_WIDTH }) {
  const rows = Array.isArray(records) ? records : [];
  return (
    <View collapsable={false} style={[styles.card, { width }]}>
      <Text style={styles.title}>{t('records.title')}</Text>
      <Text style={styles.estimate}>{t('export.estimateNote')}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('records.empty')}</Text>
      ) : (
        rows.map((r) => (
          <View key={r.id || r.createdAt} style={styles.row}>
            <Text style={styles.when}>
              {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
            </Text>
            <Text style={styles.stats}>
              {t('meter.max')} {formatDb(r.max)}
              {' · '}
              {t('meter.avg')} {formatDb(r.avg)}
              {' · '}
              {t('meter.min')} {formatDb(r.min)}
            </Text>
            <Text style={styles.meta}>{formatDuration(r.durationMs)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: EXPORT_CARD_BG,
    paddingHorizontal: EXPORT_CARD_PADDING_H,
    paddingVertical: EXPORT_CARD_PADDING_V,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1C1A17',
    marginBottom: 6,
  },
  estimate: {
    fontSize: 13,
    color: '#8A837C',
    marginBottom: 16,
  },
  empty: {
    fontSize: 15,
    color: '#6B6560',
    paddingVertical: 12,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6E1DA',
  },
  when: {
    fontSize: 14,
    color: '#1C1A17',
    fontWeight: '600',
  },
  stats: {
    fontSize: 14,
    color: '#6B6560',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontSize: 12,
    color: '#8A837C',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
});
