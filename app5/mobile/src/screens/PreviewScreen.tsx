import { useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveSelection } from "../content/catalog";
import type { Exercise } from "../content";
import {
  getSelection,
  rememberStarted,
  setSelection,
} from "../storage/selection";
import { setCurrentRoutine } from "../storage";
import { font, palette, ui } from "../theme/studio";
import type { RootStackParamList } from "../navigation/types";
import { ExerciseDetails } from "../components/ExerciseDetails";
import ActionButton from "../components/ActionButton";
import Icon from "../components/Icon";
import ReorderableExerciseList, {
  type SortScrollMetrics,
} from "../components/ReorderableExerciseList";

export default function PreviewScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const selection = getSelection();
  const [units, setUnits] = useState(() =>
    selection ? resolveSelection(selection) : [],
  );
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const scrollMetrics = useRef<SortScrollMetrics>({
    offset: 0,
    contentHeight: 0,
    viewportHeight: 0,
    top: 0,
  });
  const [detail, setDetail] = useState<Exercise | null>(null),
    [starting, setStarting] = useState(false);
  async function start() {
    if (!selection || !units.length || starting) return;
    setStarting(true);
    try {
      const orderedSelection = {
        ...selection,
        exerciseIds: units.map((ex) => ex.id),
      };
      await rememberStarted(orderedSelection);
      setSelection(orderedSelection);
      setCurrentRoutine({ units, repeatsSomeMoves: false, empty: false });
      nav.navigate("Player");
    } catch {
      Alert.alert("尚未儲存", "無法記住這次的組合，請再試一次。");
    } finally {
      setStarting(false);
    }
  }
  const seconds = units.length * 30;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <View style={[ui.root, { paddingTop: insets.top + 8 }]}>
      <View style={[ui.content, s.nav]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回首頁"
          onPress={() => nav.goBack()}
          style={s.back}
        >
          <Icon name="back" />
          <Text style={s.navTitle}>組合預覽</Text>
        </Pressable>
      </View>
      <View
        ref={viewportRef}
        style={{ flex: 1 }}
        onLayout={(event) => {
          scrollMetrics.current.viewportHeight =
            event.nativeEvent.layout.height;
        }}
      >
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!dragging}
          removeClippedSubviews={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollMetrics.current.offset = event.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={(_width, height) => {
            scrollMetrics.current.contentHeight = height;
          }}
          contentContainerStyle={[ui.content, { paddingBottom: 24 }]}
        >
          <Text style={[ui.heading, { marginTop: 22 }]}>
            {selection?.name ?? "請先選擇組合"}
          </Text>
          <Text style={ui.subtitle}>{selection?.subtitle}</Text>
          <View style={s.summary}>
            <Text style={s.time}>{time}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.summaryTitle}>{units.length} 個動作 × 30 秒</Text>
              <Text style={s.meta}>另有每段 3 秒準備時間</Text>
            </View>
          </View>
          <View style={s.listHeading}>
            <Text style={ui.section}>動作順序</Text>
            <Text style={s.meta}>固定 30 秒 / 動作</Text>
          </View>
          <Text style={[s.meta, { marginBottom: 8 }]}>
            長按右側把手，上下拖曳調整
          </Text>
          <ReorderableExerciseList
            items={units}
            onChange={setUnits}
            onOpen={setDetail}
            onDragStateChange={setDragging}
            scrollRef={scrollRef}
            viewportRef={viewportRef}
            scrollMetrics={scrollMetrics}
          />
        </ScrollView>
      </View>
      <View
        style={[
          ui.content,
          { paddingTop: 12, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <ActionButton
          label={starting ? "正在準備…" : "開始跟練"}
          onPress={() => void start()}
          disabled={!units.length || starting || dragging}
        />
      </View>
      <Modal
        visible={!!detail}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <ExerciseDetails exercise={detail} onClose={() => setDetail(null)} />
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  nav: { minHeight: 44, justifyContent: "center" },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  navTitle: { color: palette.ink, fontSize: 15, fontFamily: font.medium },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    padding: 16,
    minHeight: 72,
    borderRadius: 12,
    backgroundColor: palette.wash,
    marginTop: 18,
  },
  time: {
    color: palette.blue,
    fontFamily: font.bold,
    fontSize: 29,
    fontVariant: ["tabular-nums"],
  },
  summaryTitle: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 22,
    color: palette.ink,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 18,
    color: palette.muted,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 22,
    marginBottom: 8,
  },
});
