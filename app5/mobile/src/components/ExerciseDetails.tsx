import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Exercise } from "../content";
import ExerciseDiagram from "./ExerciseDiagram";
import Icon from "./Icon";
import { font, palette, ui } from "../theme/studio";

export function ExerciseDetails({
  exercise: ex,
  onClose,
}: {
  exercise: Exercise | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!ex) return null;
  return (
    <ScrollView
      style={ui.root}
      contentContainerStyle={[
        ui.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Pressable
        onPress={onClose}
        style={s.close}
        accessibilityRole="button"
        accessibilityLabel="關閉動作說明"
      >
        <Icon name="close" />
        <Text style={s.navTitle}>動作說明</Text>
      </Pressable>
      <View style={s.art}>
        <ExerciseDiagram exercise={ex} size={220} background="transparent" />
      </View>
      <Text style={[ui.heading, { fontSize: 27 }]}>{ex.name}</Text>
      <Text style={ui.subtitle}>{ex.library?.muscle} · 30 秒</Text>
      <Text style={[ui.section, s.section]}>怎麼做</Text>
      {ex.instructions.map((instruction, index) => (
        <View key={index} style={s.step}>
          <Text style={s.index}>{String(index + 1).padStart(2, "0")}</Text>
          <Text style={s.instruction}>{instruction}</Text>
        </View>
      ))}
      <Text style={[ui.section, s.section]}>跟練提示</Text>
      {ex.voice_cues.map((cue) => (
        <View key={cue.id} style={s.step}>
          <Text style={s.cueTime}>
            {String(cue.at_seconds).padStart(2, "0")} 秒
          </Text>
          <Text style={s.instruction}>{cue.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  close: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  navTitle: { color: palette.ink, fontSize: 15, fontFamily: font.medium },
  art: {
    backgroundColor: palette.wash,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 250,
    marginTop: 20,
    marginBottom: 20,
  },
  section: { marginTop: 26, marginBottom: 14 },
  step: { flexDirection: "row", gap: 14, paddingVertical: 10 },
  index: {
    fontFamily: font.medium,
    color: palette.blue,
    fontSize: 12,
    paddingTop: 4,
    width: 24,
  },
  cueTime: {
    fontFamily: font.medium,
    color: palette.blue,
    fontSize: 12,
    paddingTop: 4,
    width: 38,
    fontVariant: ["tabular-nums"],
  },
  instruction: {
    flex: 1,
    color: palette.ink,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 26,
  },
});
