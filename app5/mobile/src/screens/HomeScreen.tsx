import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Chip from '../components/Chip';
import { buildRoutine } from '../builder';
import { DURATION_OPTIONS_SECONDS, loadBundledContent, regionsAvailableForPosition, WHOLE_BODY_ID } from '../content';
import { t } from '../i18n';
import { isProUnlocked, subscribePro } from '../iap';
import { formatActiveDurationLabel } from '../player';
import { getPrefs, setCurrentRoutine, subscribePrefs, updatePrefs } from '../storage';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const pack = useMemo(() => loadBundledContent(), []);
  const [prefs, setPrefs] = useState(getPrefs);
  const [pro, setPro] = useState(false);

  useEffect(() => subscribePrefs(setPrefs), []);
  useEffect(() => {
    isProUnlocked().then(setPro);
    return subscribePro(setPro);
  }, []);

  const regions = useMemo(
    () => regionsAvailableForPosition(pack, prefs.position, pro),
    [pack, prefs.position, pro],
  );

  useEffect(() => {
    if (prefs.bodyRegion === WHOLE_BODY_ID) return;
    if (!regions.some((r) => r.id === prefs.bodyRegion)) {
      updatePrefs({ bodyRegion: WHOLE_BODY_ID }).catch(() => {});
    }
  }, [prefs.bodyRegion, regions]);

  const gapNote = useMemo(() => {
    const { n, unit } = formatActiveDurationLabel(prefs.durationSeconds);
    const active = unit === 'min' ? t('duration.min', { n }) : t('duration.sec', { n });
    return t('preview.gapNote', { active });
  }, [prefs.durationSeconds]);

  function goPreview() {
    const result = buildRoutine({
      exercises: pack.exercises,
      position: prefs.position,
      bodyRegion: prefs.bodyRegion,
      durationSeconds: prefs.durationSeconds,
      unlocked: pro,
    });
    setCurrentRoutine(result);
    nav.navigate('Preview');
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.top}>
        <Text style={styles.title}>{t('app.title')}</Text>
        <Pressable onPress={() => nav.navigate('Settings')} accessibilityLabel={t('home.settings')}>
          <Text style={styles.link}>{t('home.settings')}</Text>
        </Pressable>
      </View>

      <Text style={styles.q}>{t('home.posture')}</Text>
      <View style={styles.row}>
        {pack.categories.positions.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            selected={prefs.position === p.id}
            onPress={() => { updatePrefs({ position: p.id }).catch(() => {}); }}
          />
        ))}
      </View>

      <Text style={styles.q}>{t('home.region')}</Text>
      <View style={styles.row}>
        {pack.categories.selection_options.map((o) => (
          <Chip
            key={o.id}
            label={o.label}
            selected={prefs.bodyRegion === o.id}
            onPress={() => { updatePrefs({ bodyRegion: o.id }).catch(() => {}); }}
          />
        ))}
        {regions.map((r) => (
          <Chip
            key={r.id}
            label={r.label}
            selected={prefs.bodyRegion === r.id}
            onPress={() => { updatePrefs({ bodyRegion: r.id }).catch(() => {}); }}
          />
        ))}
      </View>

      <Text style={styles.q}>{t('home.duration')}</Text>
      <View style={styles.row}>
        {DURATION_OPTIONS_SECONDS.map((sec) => {
          const { n, unit } = formatActiveDurationLabel(sec);
          const label = unit === 'min' ? t('duration.min', { n }) : t('duration.sec', { n });
          return (
            <Chip
              key={sec}
              label={label}
              selected={prefs.durationSeconds === sec}
              onPress={() => { updatePrefs({ durationSeconds: sec }).catch(() => {}); }}
            />
          );
        })}
      </View>

      <Text style={styles.note}>{gapNote}</Text>
      <Text style={styles.safety}>{t('home.safety')}</Text>

      <Pressable style={styles.cta} onPress={goPreview} accessibilityRole="button">
        <Text style={styles.ctaText}>{t('home.preview')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', color: colors.label },
  link: { color: colors.brand, fontSize: 16 },
  q: { fontSize: 16, fontWeight: '600', color: colors.label, marginTop: 18, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  note: { marginTop: 20, color: colors.l2, fontSize: 14 },
  safety: { marginTop: 10, color: colors.l2, fontSize: 13, lineHeight: 20 },
  cta: {
    marginTop: 28,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onbrand, fontSize: 17, fontWeight: '600' },
});
