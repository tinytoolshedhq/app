import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Exercise } from "../content";
import { font, palette } from "../theme/studio";
import Icon from "./Icon";

const ROW_HEIGHT = 60;
const HOLD_MS = 300;
export type SortScrollMetrics = {
  offset: number;
  contentHeight: number;
  viewportHeight: number;
  top: number;
};
type Props = {
  items: Exercise[];
  onChange: (items: Exercise[]) => void;
  onOpen: (exercise: Exercise) => void;
  onDragStateChange: (dragging: boolean) => void;
  scrollRef: RefObject<ScrollView | null>;
  viewportRef: RefObject<View | null>;
  scrollMetrics: RefObject<SortScrollMetrics>;
};

function DragHandle({
  name,
  position,
  count,
  onBegin,
  onMove,
  onFinish,
  onCancel,
  onStep,
}: {
  name: string;
  position: number;
  count: number;
  onBegin: (pageY: number) => void;
  onMove: (pageY: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onStep: (delta: number) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const clearHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clearHold, [clearHold]);
  // PanResponder registers these callbacks; refs are read only when a gesture fires.
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- callbacks run on gestures only
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          clearHold();
          const pageY = event.nativeEvent.pageY;
          timer.current = setTimeout(() => {
            active.current = true;
            onBegin(pageY);
          }, HOLD_MS);
        },
        onPanResponderMove: (event, gesture) => {
          if (active.current) onMove(event.nativeEvent.pageY);
          else if (Math.abs(gesture.dy) > 8 || Math.abs(gesture.dx) > 8)
            clearHold();
        },
        onPanResponderRelease: () => {
          clearHold();
          if (active.current) onFinish();
          active.current = false;
        },
        onPanResponderTerminate: () => {
          clearHold();
          if (active.current) onCancel();
          active.current = false;
        },
        onPanResponderTerminationRequest: () => !active.current,
        onShouldBlockNativeResponder: () => active.current,
      }),
    [clearHold, onBegin, onMove, onFinish, onCancel],
  );
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`調整${name}的順序`}
      accessibilityHint="長按後上下拖曳，也可使用向上或向下調整動作"
      accessibilityValue={{ min: 1, max: count, now: position + 1 }}
      accessibilityActions={[
        { name: "decrement", label: "向上移動" },
        { name: "increment", label: "向下移動" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "decrement") onStep(-1);
        if (event.nativeEvent.actionName === "increment") onStep(1);
      }}
      style={s.handle}
    >
      <Icon name="grip" color={palette.muted} size={20} />
    </View>
  );
}

export default function ReorderableExerciseList({
  items,
  onChange,
  onOpen,
  onDragStateChange,
  scrollRef,
  viewportRef,
  scrollMetrics,
}: Props) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [motion] = useState(() => new Animated.Value(0));
  const active = useRef<{
    from: number;
    to: number;
    startY: number;
    fingerY: number;
    startOffset: number;
  } | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacks = useRef({ items, onChange, onDragStateChange });
  useEffect(() => {
    callbacks.current = { items, onChange, onDragStateChange };
  }, [items, onChange, onDragStateChange]);
  const update = useCallback(
    (pageY: number) => {
      const current = active.current;
      if (!current) return;
      current.fingerY = pageY;
      const dy = Math.max(
        -current.from * ROW_HEIGHT,
        Math.min(
          (callbacks.current.items.length - 1 - current.from) * ROW_HEIGHT,
          pageY -
            current.startY +
            scrollMetrics.current.offset -
            current.startOffset,
        ),
      );
      motion.setValue(dy);
      const to = Math.max(
        0,
        Math.min(
          callbacks.current.items.length - 1,
          Math.round(current.from + dy / ROW_HEIGHT),
        ),
      );
      if (to !== current.to) {
        current.to = to;
        setDrag({ from: current.from, to });
      }
    },
    [motion, scrollMetrics],
  );
  const finish = useCallback(
    (commit: boolean) => {
      const current = active.current;
      active.current = null;
      if (interval.current) clearInterval(interval.current);
      interval.current = null;
      if (commit && current && current.from !== current.to) {
        const next = [...callbacks.current.items];
        const [moved] = next.splice(current.from, 1);
        next.splice(current.to, 0, moved);
        callbacks.current.onChange(next);
      }
      motion.setValue(0);
      setDrag(null);
      callbacks.current.onDragStateChange(false);
    },
    [motion],
  );
  useEffect(
    () => () => {
      if (interval.current) clearInterval(interval.current);
    },
    [],
  );
  function begin(from: number, pageY: number) {
    active.current = {
      from,
      to: from,
      startY: pageY,
      fingerY: pageY,
      startOffset: scrollMetrics.current.offset,
    };
    viewportRef.current?.measureInWindow((_x, top, _width, height) => {
      scrollMetrics.current.top = top;
      scrollMetrics.current.viewportHeight = height;
    });
    setDrag({ from, to: from });
    callbacks.current.onDragStateChange(true);
    interval.current = setInterval(() => {
      const current = active.current,
        metrics = scrollMetrics.current;
      if (!current || !metrics.viewportHeight) return;
      const edge = 56,
        bottom = metrics.top + metrics.viewportHeight;
      const speed =
        current.fingerY < metrics.top + edge
          ? -Math.min(12, ((metrics.top + edge - current.fingerY) / edge) * 12)
          : current.fingerY > bottom - edge
            ? Math.min(12, ((current.fingerY - bottom + edge) / edge) * 12)
            : 0;
      const offset = Math.max(
        0,
        Math.min(
          Math.max(0, metrics.contentHeight - metrics.viewportHeight),
          metrics.offset + speed,
        ),
      );
      if (offset !== metrics.offset) {
        metrics.offset = offset;
        scrollRef.current?.scrollTo({ y: offset, animated: false });
      }
      update(current.fingerY);
    }, 32);
  }
  function step(from: number, delta: number) {
    const to = Math.max(0, Math.min(items.length - 1, from + delta));
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }
  return (
    <View>
      {items.map((exercise, index) => {
        const selected = drag?.from === index;
        const shifted =
          drag && !selected
            ? drag.to > drag.from && index > drag.from && index <= drag.to
              ? -ROW_HEIGHT
              : drag.to < drag.from && index >= drag.to && index < drag.from
                ? ROW_HEIGHT
                : 0
            : 0;
        return (
          <Animated.View
            key={exercise.id}
            style={[
              s.row,
              {
                zIndex: selected ? 10 : 0,
                transform: [{ translateY: selected ? motion : shifted }],
              },
              selected && s.dragging,
            ]}
          >
            <Pressable
              disabled={!!drag}
              onPress={() => onOpen(exercise)}
              accessibilityRole="button"
              accessibilityLabel={`動作 ${index + 1}，${exercise.name}，查看說明`}
              style={s.details}
            >
              <Text style={s.index}>{String(index + 1).padStart(2, "0")}</Text>
              <Text numberOfLines={2} style={s.title}>
                {exercise.name}
              </Text>
              <Text style={s.seconds}>0:30</Text>
            </Pressable>
            <DragHandle
              name={exercise.name}
              position={index}
              count={items.length}
              onBegin={(y) => begin(index, y)}
              onMove={update}
              onFinish={() => finish(true)}
              onCancel={() => finish(false)}
              onStep={(delta) => step(index, delta)}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.bg,
    borderRadius: 10,
  },
  dragging: {
    backgroundColor: palette.pale,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  details: {
    flex: 1,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  index: {
    width: 24,
    color: palette.blue,
    fontFamily: font.medium,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  title: {
    flex: 1,
    fontFamily: font.medium,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  seconds: {
    color: palette.muted,
    fontFamily: font.regular,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  handle: {
    width: 44,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
});
