import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Mascot from "../components/Mascot";
import Icon from "../components/Icon";
import {
  activityLabel,
  bodyParts,
  getBodySelection,
  getCombinations,
  type Selection,
} from "../content/catalog";
import { readLastStarted, setSelection } from "../storage/selection";
import type { RootStackParamList } from "../navigation/types";
import { font, palette, ui } from "../theme/studio";

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [last, setLast] = useState<Selection | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readLastStarted().then((value) => {
        if (active) setLast(value);
      });
      return () => {
        active = false;
      };
    }, []),
  );
  function open(selection: Selection) {
    setSelection(selection);
    nav.navigate("Preview");
  }
  const combos = getCombinations();
  const posture = (selection: Selection) =>
    selection.id === "office" || selection.id === "hands"
      ? "坐著"
      : selection.id === "bedtime" || selection.id === "floor"
        ? "躺著"
        : "站著";
  return (
    <ScrollView
      style={ui.root}
      contentContainerStyle={[
        ui.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={s.welcome}>
        <View style={{ flex: 1 }}>
          <Text style={ui.heading}>伸展一下。</Text>
        </View>
        <Mascot size={90} />
      </View>
      {last && (
        <View style={s.lastSection}>
          <Text style={s.lastLabel}>上次使用</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`上次使用，${last.name}`}
            onPress={() => open(last)}
            style={({ pressed }) => [s.recent, pressed && s.pressed]}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.lastTitle}>{last.name}</Text>
              <Text style={ui.small}>
                {last.exerciseIds.length} 個動作 · 活動{" "}
                {activityLabel(last.exerciseIds.length)}
              </Text>
            </View>
            <Icon name="arrow" color={palette.blue} />
          </Pressable>
        </View>
      )}
      <View style={s.sectionHeading}>
        <Text style={ui.section}>組合</Text>
      </View>
      {combos.map((combo, index) => (
        <Pressable
          key={combo.id}
          accessibilityRole="button"
          accessibilityLabel={combo.name}
          onPress={() => open(combo)}
          style={({ pressed }) => [s.combination, pressed && s.pressed]}
        >
          <Text style={s.index}>{String(index + 1).padStart(2, "0")}</Text>
          <View style={s.combinationCopy}>
            <Text style={s.combinationName}>{combo.name}</Text>
            <Text style={s.meta}>
              {posture(combo)} · {combo.exerciseIds.length} 個動作 ·{" "}
              {activityLabel(combo.exerciseIds.length)}
            </Text>
          </View>
          <Icon name="arrow" size={18} color={palette.muted} />
        </Pressable>
      ))}
      <View style={s.sectionHeading}>
        <Text style={ui.section}>部位</Text>
      </View>
      <View style={s.parts}>
        {bodyParts.map((part) => (
          <Pressable
            key={part.name}
            accessibilityRole="button"
            accessibilityLabel={part.label}
            onPress={() => open(getBodySelection(part.name))}
            style={({ pressed }) => [s.part, pressed && s.pressed]}
          >
            <Text style={s.partName}>
              {(
                { 手: "手／腕", 髖臀: "髖臀", 腿: "腿部" } as Record<
                  string,
                  string
                >
              )[part.name] ?? part.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  welcome: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 100,
    gap: 8,
  },
  lastSection: { marginTop: 20 },
  lastLabel: {
    color: palette.muted,
    fontSize: 12,
    fontFamily: font.bold,
    marginBottom: 8,
  },
  recent: {
    minHeight: 84,
    borderRadius: 14,
    padding: 16,
    backgroundColor: palette.pale,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lastTitle: {
    fontFamily: font.bold,
    fontSize: 19,
    color: palette.ink,
    marginBottom: 4,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 8,
    gap: 12,
  },
  combination: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 62,
    gap: 12,
    paddingVertical: 8,
  },
  index: {
    color: palette.blue,
    fontFamily: font.medium,
    fontSize: 12,
    width: 26,
    fontVariant: ["tabular-nums"],
  },
  combinationCopy: { flex: 1 },
  combinationName: {
    color: palette.ink,
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 26,
  },
  meta: {
    fontFamily: font.regular,
    color: palette.muted,
    fontSize: 11,
    lineHeight: 18,
  },
  parts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  part: {
    flexGrow: 1,
    flexBasis: "21%",
    minHeight: 42,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: palette.wash,
    alignItems: "center",
    justifyContent: "center",
  },
  partName: { fontFamily: font.medium, fontSize: 13, color: palette.ink },
  pressed: { opacity: 0.65 },
});
