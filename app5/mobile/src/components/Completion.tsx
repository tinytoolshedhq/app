import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Mascot from "./Mascot";
import ActionButton from "./ActionButton";
import { activityLabel } from "../content/catalog";
import { font, palette, ui } from "../theme/studio";

export default function Completion({
  name,
  unitCount,
  onHome,
  onAgain,
}: {
  name: string;
  unitCount: number;
  onHome: () => void;
  onAgain: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={ui.root}
      contentContainerStyle={[
        ui.content,
        {
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <Text style={s.title}>這一小段，完成了。</Text>
      <Text style={ui.subtitle}>把輕鬆，帶回接下來的日常。</Text>
      <View style={s.art}>
        <Mascot size={230} mood="cheer" />
      </View>
      <Text style={ui.section}>{name}</Text>
      <Text style={[ui.small, { marginTop: 4 }]}>
        本組 {unitCount} 個動作 · 活動 {activityLabel(unitCount)}
      </Text>
      <ActionButton
        label="回到首頁"
        onPress={onHome}
        style={{ marginTop: 40 }}
      />
      <Pressable onPress={onAgain} accessibilityRole="button" style={s.again}>
        <Text style={ui.link}>再伸展一次</Text>
      </Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  title: {
    fontFamily: font.bold,
    fontSize: 29,
    lineHeight: 43,
    color: palette.ink,
  },
  art: {
    minHeight: 280,
    backgroundColor: palette.pale,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    marginBottom: 28,
  },
  again: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
});
