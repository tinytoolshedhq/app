import { useMemo, useState, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildRoutine } from '../builder';
import { labelFor, loadBundledContent } from '../content';
import { t } from '../i18n';
import { isProUnlocked, subscribePro } from '../iap';
import { formatActiveDurationLabel } from '../player';
import { getPrefs, setCurrentRoutine } from '../storage';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

export default function PreviewScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const pack = useMemo(() => loadBundledContent(), []);
  const [pro, setPro] = useState(false);
  const prefs = getPrefs();

  useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  const routine = useMemo(() => {
    const built = buildRoutine({
      exercises: pack.exercises,
      position: prefs.position,
      bodyRegion: prefs.bodyRegion,
      durationSeconds: prefs.durationSeconds,
      unlocked: pro,
    });
    setCurrentRoutine(built);
    return built;
  }, [pack, prefs.bodyRegion, prefs.durationSeconds, prefs.position, pro]);

  const { n, unit } = formatActiveDurationLabel(prefs.durationSeconds);
  const active = unit === 'min' ? t('duration.min', { n }) : t('duration.sec', { n });
  const gapNote = t('preview.gapNote', { active });

  const equipmentLabels = useMemo(() => {
    const ids = new Set<string>();
    for (const ex of routine.units) {
      for (const e of ex.equipment) ids.add(e);
    }
    return [...ids].map((id) => labelFor(pack.categories.equipment, id));
  }, [pack.categories.equipment, routine.units]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable onPress={() => nav.goBack()} accessibilityLabel={t('common.back')}>
        <Text style={styles.back}>{t('common.back')}</Text>
      </Pressable>
      <Text style={styles.title}>{t('preview.title')}</Text>
      <Text style={styles.note}>{gapNote}</Text>
      {routine.repeatsSomeMoves ? <Text style={styles.warn}>{t('preview.repeats')}</Text> : null}

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 16 }}>
        {routine.empty ? (
          <View>
            <Text style={styles.empty}>{t('preview.empty')}</Text>
            <Text style={styles.reason}>{t(`reason.${routine.reason || 'no_matching_content'}`)}</Text>
            <Text style={styles.change}>{t('preview.change')}</Text>
            {routine.reason === 'needs_unlock' ? (
              <Pressable style={styles.secondary} onPress={() => nav.navigate('Paywall')}>
                <Text style={styles.secondaryText}>{t('preview.unlock')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          routine.units.map((ex, i) => (
            <View key={`${ex.id}-${i}`} style={styles.card}>
              <Text style={styles.n}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{ex.name}</Text>
                <Text style={styles.setup}>{ex.setup}</Text>
                {ex.cautions.map((c) => (
                  <Text key={c} style={styles.caution}>{c}</Text>
                ))}
              </View>
            </View>
          ))
        )}
        {equipmentLabels.length ? (
          <Text style={styles.equip}>{t('preview.equipment')}：{equipmentLabels.join('、')}</Text>
        ) : null}
        <Text style={styles.consult}>{t('home.consult')}</Text>
        <Text style={styles.safety}>{t('home.safety')}</Text>
      </ScrollView>

      {!routine.empty ? (
        <Pressable
          style={styles.cta}
          onPress={() => nav.navigate('Player')}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{t('preview.start')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  back: { color: colors.brand, fontSize: 16, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.label },
  note: { marginTop: 8, color: colors.l2, fontSize: 14 },
  warn: { marginTop: 8, color: colors.red, fontSize: 14 },
  list: { flex: 1, marginTop: 16 },
  card: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.sep,
  },
  n: { width: 24, color: colors.l3, fontSize: 16 },
  name: { fontSize: 16, fontWeight: '600', color: colors.label },
  setup: { marginTop: 2, fontSize: 13, color: colors.l2 },
  caution: { marginTop: 4, fontSize: 13, color: colors.red, lineHeight: 18 },
  consult: { marginTop: 16, color: colors.l2, fontSize: 13, lineHeight: 20 },
  empty: { fontSize: 18, fontWeight: '600', color: colors.label, marginTop: 24 },
  reason: { marginTop: 8, color: colors.l2, fontSize: 15 },
  change: { marginTop: 8, color: colors.l2, fontSize: 15 },
  secondary: { marginTop: 16, alignSelf: 'flex-start' },
  secondaryText: { color: colors.brand, fontSize: 16 },
  equip: { marginTop: 16, color: colors.l2, fontSize: 14 },
  safety: { marginTop: 16, color: colors.l2, fontSize: 13, lineHeight: 20 },
  cta: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onbrand, fontSize: 17, fontWeight: '600' },
});
