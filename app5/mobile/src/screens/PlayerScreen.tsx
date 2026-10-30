import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import AnimationPlaceholder from '../components/AnimationPlaceholder';
import { createSilentAudioService } from '../audio';
import type { Exercise } from '../content';
import { t } from '../i18n';
import { formatActiveDurationLabel, PlayerController, type PlayerSnapshot } from '../player';
import { getCurrentRoutine, getPrefs } from '../storage';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

const EMPTY_UNITS: Exercise[] = [];

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return String(s);
}

export default function PlayerScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const routine = getCurrentRoutine();
  const units = routine?.units ?? EMPTY_UNITS;
  const audio = useMemo(() => createSilentAudioService(), []);
  const player = useMemo(() => new PlayerController(units, audio), [units, audio]);
  const playerRef = useRef(player);
  const [snap, setSnap] = useState<PlayerSnapshot>(() => player.snapshot());
  const [muted, setMuted] = useState(!getPrefs().voiceEnabled);

  useKeepAwake();

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);

  useEffect(() => {
    player.start();
    const id = setInterval(() => {
      setSnap(playerRef.current.tick());
    }, 200);
    return () => {
      clearInterval(id);
      void audio.stopAll();
    };
  }, [audio, player]);

  useEffect(() => audio.onRouteChange((e) => {
    if (e.reason !== 'oldDeviceUnavailable') return;
    playerRef.current.pause();
    void audio.stopAll();
    setSnap(playerRef.current.snapshot());
  }), [audio]);

  const prefs = getPrefs();
  const { n, unit } = formatActiveDurationLabel(prefs.durationSeconds);
  const active = unit === 'min' ? t('duration.min', { n }) : t('duration.sec', { n });
  const gapNote = t('preview.gapNote', { active });

  function refresh() {
    setSnap(playerRef.current.snapshot());
  }

  if (!units.length) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => nav.goBack()}><Text style={styles.link}>{t('common.back')}</Text></Pressable>
        <Text style={styles.title}>{t('preview.empty')}</Text>
      </View>
    );
  }

  if (snap.phase === 'complete') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>{t('player.done')}</Text>
        <Pressable style={styles.cta} onPress={() => { player.start(); setSnap(player.tick()); }}>
          <Text style={styles.ctaText}>{t('player.again')}</Text>
        </Pressable>
        <Pressable onPress={() => nav.popToTop()} style={styles.linkBtn}>
          <Text style={styles.link}>{t('player.home')}</Text>
        </Pressable>
      </View>
    );
  }

  const shown = snap.phase === 'gap' ? snap.next : snap.current;
  const instruction = snap.phase === 'gap' ? `${t('player.next')}：${snap.next?.name ?? ''}` : snap.instruction;
  const count = snap.phase === 'gap' ? snap.gapRemaining : snap.unitRemaining;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <Pressable onPress={() => nav.goBack()} accessibilityLabel={t('common.back')}>
          <Text style={styles.link}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.progress}>{snap.unitIndex + 1}/{snap.unitCount}</Text>
        <Pressable
          onPress={() => {
            const next = !muted;
            setMuted(next);
            audio.setMuted(next);
            if (next) void audio.stopAll();
          }}
          accessibilityLabel={muted ? t('player.unmute') : t('player.mute')}
        >
          <Text style={styles.link}>{muted ? t('player.unmute') : t('player.mute')}</Text>
        </Pressable>
      </View>

      <AnimationPlaceholder
        name={shown?.name}
        instruction={instruction}
        phase={snap.phase}
      />

      <Text style={styles.count}>{formatCountdown(count)}</Text>
      <Text style={styles.phase}>{snap.phase === 'gap' ? t('player.gap') : (shown?.name ?? '')}</Text>
      <Text style={styles.note}>{gapNote}</Text>

      <View style={styles.controls}>
        <Pressable
          onPress={() => { player.previous(); refresh(); }}
          accessibilityLabel={t('player.prev')}
          style={styles.ctrl}
        >
          <Text style={styles.ctrlText}>{t('player.prev')}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (player.paused) player.resume();
            else player.pause();
            refresh();
          }}
          accessibilityLabel={player.paused ? t('player.resume') : t('player.pause')}
          style={[styles.ctrl, styles.ctrlMain]}
        >
          <Text style={styles.ctrlMainText}>{player.paused ? t('player.resume') : t('player.pause')}</Text>
        </Pressable>
        <Pressable
          onPress={() => { player.skip(); refresh(); }}
          accessibilityLabel={t('player.skip')}
          style={styles.ctrl}
        >
          <Text style={styles.ctrlText}>{t('player.skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  link: { color: colors.brand, fontSize: 16 },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  progress: { color: colors.l2, fontSize: 16 },
  count: { marginTop: 20, fontSize: 56, fontWeight: '700', color: colors.label, textAlign: 'center' },
  phase: { textAlign: 'center', color: colors.l2, fontSize: 16, marginTop: 4 },
  note: { textAlign: 'center', color: colors.l3, fontSize: 13, marginTop: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.label, marginTop: 24, textAlign: 'center' },
  controls: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ctrl: { paddingVertical: 14, paddingHorizontal: 12 },
  ctrlText: { color: colors.brand, fontSize: 16 },
  ctrlMain: {
    backgroundColor: colors.brand,
    borderRadius: 28,
    paddingHorizontal: 28,
  },
  ctrlMainText: { color: colors.onbrand, fontSize: 17, fontWeight: '600' },
  cta: {
    marginTop: 32,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onbrand, fontSize: 17, fontWeight: '600' },
});
