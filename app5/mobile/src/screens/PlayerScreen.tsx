import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import ExerciseDiagram from "../components/ExerciseDiagram";
import { ExerciseDetails } from "../components/ExerciseDetails";
import Completion from "../components/Completion";
import Icon from "../components/Icon";
import ActionButton from "../components/ActionButton";
import { createCueAudioService } from "../audio/cues";
import { PlayerController } from "../player";
import { getCurrentRoutine } from "../storage";
import { getSelection, readMusic, saveMusic } from "../storage/selection";
import type { RootStackParamList } from "../navigation/types";
import { font, palette, ui } from "../theme/studio";

export default function PlayerScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>(),
    insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const panelHeight = Math.max(160, Math.min(286, height - 620));
  const routine = getCurrentRoutine(),
    selection = getSelection();
  const [audioError, setAudioError] = useState(false),
    [detail, setDetail] = useState(false),
    [musicEnabled, setMusicEnabled] = useState(true),
    [musicReady, setMusicReady] = useState(false);
  const music = useAudioPlayer(
    require("../../assets/music/stretch-background.mp3"),
  );
  const voice = useAudioPlayer(null);
  const audio = useMemo(
    () => createCueAudioService(voice, () => setAudioError(true)),
    [voice],
  );
  const player = useMemo(
    () => new PlayerController(routine?.units ?? [], audio),
    [routine, audio],
  );
  const [snap, setSnap] = useState(() => player.snapshot());
  useKeepAwake();
  useEffect(() => {
    let active = true;
    void Promise.all([
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix",
      }),
      readMusic(),
    ])
      .then(([, enabled]) => {
        if (active) {
          music.loop = true;
          music.volume = 0.25;
          setMusicEnabled(enabled);
          setMusicReady(true);
        }
      })
      .catch(() => {
        if (active) setAudioError(true);
      });
    return () => {
      active = false;
    };
  }, [music]);
  useEffect(() => {
    player.start();
    player.tick();
    const interval = setInterval(() => setSnap(player.tick()), 100);
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        player.pause();
        music.pause();
        setSnap(player.snapshot());
      }
    });
    return () => {
      clearInterval(interval);
      listener.remove();
      music.pause();
      void audio.stopAll();
    };
  }, [player, audio, music]);
  useEffect(() => {
    if (!musicReady) return;
    void Promise.resolve()
      .then(() => {
        if (
          musicEnabled &&
          !snap.paused &&
          snap.phase !== "complete" &&
          !detail
        )
          music.play();
        else music.pause();
      })
      .catch(() => setAudioError(true));
  }, [music, musicReady, musicEnabled, snap.paused, snap.phase, detail]);
  function togglePause() {
    if (snap.paused) player.resume();
    else player.pause();
    setSnap(player.tick());
  }
  function exit() {
    player.pause();
    setSnap(player.snapshot());
    Alert.alert("先休息一下？", "離開後會從組合預覽重新開始。", [
      { text: "留在這裡", style: "cancel" },
      { text: "結束跟練", style: "destructive", onPress: () => nav.goBack() },
    ]);
  }
  const gap = snap.phase === "gap";
  const shown = gap ? (snap.next ?? snap.current) : snap.current;
  const cue = snap.current?.voice_cues
    .filter((c) => c.at_seconds <= 30 - snap.unitRemaining)
    .at(-1);
  if (!shown)
    return (
      <View
        style={[ui.root, { padding: 24, justifyContent: "center", gap: 24 }]}
      >
        <Text style={ui.heading}>先選一組伸展吧</Text>
        <ActionButton label="返回首頁" onPress={() => nav.popToTop()} />
      </View>
    );
  if (snap.phase === "complete")
    return (
      <Completion
        name={selection?.name ?? "伸展組合"}
        unitCount={snap.unitCount}
        onHome={() => nav.popToTop()}
        onAgain={() => {
          player.start();
          setSnap(player.tick());
        }}
      />
    );
  const status = gap
    ? snap.next
      ? "準備下一個動作"
      : "最後緩衝"
    : snap.paused
      ? "已暫停"
      : "保持自然呼吸";
  return (
    <View style={[ui.root, { paddingTop: insets.top + 8 }]}>
      <View style={s.nav}>
        <Pressable
          style={s.navClose}
          onPress={exit}
          accessibilityRole="button"
          accessibilityLabel="結束跟練"
        >
          <Icon name="close" />
        </Pressable>
        <Text style={s.navTitle}>{selection?.name}</Text>
        <Pressable
          style={s.detailsButton}
          onPress={() => {
            player.pause();
            setSnap(player.snapshot());
            setDetail(true);
          }}
          accessibilityRole="button"
        >
          <Text style={s.detailsLabel}>動作說明</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[
          ui.content,
          { paddingTop: 16, paddingBottom: 12 },
        ]}
      >
        <View style={s.progressHeader}>
          <Text style={s.step}>
            {String(snap.unitIndex + 1).padStart(2, "0")} /{" "}
            {String(snap.unitCount).padStart(2, "0")}
          </Text>
          <Text style={s.meta}>每個動作 30 秒</Text>
        </View>
        <View style={[s.demonstration, { height: panelHeight }]}>
          <ExerciseDiagram
            exercise={shown}
            size={Math.min(260, panelHeight - 8)}
            background="transparent"
          />
        </View>
        <Text style={s.name}>{shown.name}</Text>
        <Text style={ui.small}>{shown.library?.muscle}</Text>
        <View style={s.timerRow}>
          <Text accessibilityLiveRegion="none" style={s.countdown}>
            {gap
              ? String(Math.ceil(snap.gapRemaining))
              : `0:${String(Math.ceil(snap.unitRemaining)).padStart(2, "0")}`}
          </Text>
          <Text style={ui.small}>{status}</Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: snap.unitCount,
            now: snap.unitIndex + (gap ? 1 : 1 - snap.unitRemaining / 30),
            text: `第 ${snap.unitIndex + 1} 個，共 ${snap.unitCount} 個動作`,
          }}
          style={s.progress}
        >
          {routine?.units.map((unit, index) => (
            <View key={`${unit.id}-${index}`} style={s.segment}>
              <View
                style={[
                  s.segmentFill,
                  {
                    width: `${index < snap.unitIndex || (index === snap.unitIndex && gap) ? 100 : index === snap.unitIndex ? (1 - snap.unitRemaining / 30) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={s.prompt}>
          <Text style={s.promptText}>
            {gap
              ? (snap.next?.setup ?? "放鬆雙手，保持自然呼吸。")
              : (cue?.text ?? snap.instruction)}
          </Text>
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.controls}>
          <Pressable
            style={s.control}
            onPress={() => {
              player.previous();
              setSnap(player.tick());
            }}
            accessibilityRole="button"
            accessibilityLabel="上一個動作"
          >
            <Icon name="previous" />
          </Pressable>
          <Pressable
            style={[s.control, s.mainControl]}
            onPress={togglePause}
            accessibilityRole="button"
            accessibilityLabel={snap.paused ? "繼續跟練" : "暫停跟練"}
          >
            <Icon name={snap.paused ? "play" : "pause"} color="#FFFFFF" />
          </Pressable>
          <Pressable
            style={s.control}
            onPress={() => {
              player.skip();
              setSnap(player.tick());
            }}
            accessibilityRole="button"
            accessibilityLabel="下一個動作"
          >
            <Icon name="next" />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: musicEnabled }}
          accessibilityLabel="背景音樂"
          style={s.music}
          onPress={() => {
            const enabled = !musicEnabled;
            setMusicEnabled(enabled);
            void saveMusic(enabled).catch(() => setAudioError(true));
          }}
        >
          <Icon name="music" color={palette.muted} size={17} />
          <Text style={ui.small}>背景音樂</Text>
          <Text style={s.musicState}>{musicEnabled ? "開啟" : "關閉"}</Text>
        </Pressable>
        {audioError && (
          <Text style={[ui.small, { textAlign: "center" }]}>
            音訊目前無法使用，可繼續文字跟練。
          </Text>
        )}
      </View>
      <Modal
        visible={detail}
        animationType="slide"
        onRequestClose={() => setDetail(false)}
      >
        <ExerciseDetails exercise={shown} onClose={() => setDetail(false)} />
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    minHeight: 44,
    gap: 12,
  },
  navClose: { minHeight: 44, minWidth: 32, justifyContent: "center" },
  navTitle: {
    flex: 1,
    fontSize: 14,
    color: palette.ink,
    fontFamily: font.medium,
  },
  detailsButton: { minHeight: 44, justifyContent: "center" },
  detailsLabel: { color: palette.blue, fontFamily: font.medium, fontSize: 12 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  step: {
    fontFamily: font.bold,
    color: palette.blue,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  meta: { fontFamily: font.regular, color: palette.muted, fontSize: 11 },
  demonstration: {
    borderRadius: 16,
    backgroundColor: palette.wash,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: font.bold,
    color: palette.ink,
    fontSize: 26,
    lineHeight: 38,
    marginTop: 16,
    marginBottom: 2,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  countdown: {
    fontFamily: font.bold,
    fontSize: 57,
    lineHeight: 83,
    color: palette.ink,
    fontVariant: ["tabular-nums"],
  },
  progress: { flexDirection: "row", gap: 5, marginBottom: 20 },
  segment: {
    flex: 1,
    height: 5,
    backgroundColor: palette.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  segmentFill: { backgroundColor: palette.blue, height: 5, borderRadius: 2 },
  prompt: {
    backgroundColor: palette.pale,
    padding: 12,
    minHeight: 63,
    borderRadius: 10,
    justifyContent: "center",
  },
  promptText: {
    color: palette.ink,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 23,
  },
  footer: { backgroundColor: palette.bg, paddingHorizontal: 24, paddingTop: 8 },
  controls: { flexDirection: "row", justifyContent: "center", gap: 18 },
  control: {
    height: 50,
    width: 64,
    borderRadius: 12,
    backgroundColor: palette.wash,
    alignItems: "center",
    justifyContent: "center",
  },
  mainControl: { width: 94, backgroundColor: palette.blue },
  music: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    marginTop: 8,
  },
  musicState: { color: palette.blue, fontFamily: font.medium, fontSize: 12 },
});
