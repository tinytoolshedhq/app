import React from "react";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HomeScreen from "../src/screens/HomeScreen";
import PreviewScreen from "../src/screens/PreviewScreen";
import PlayerScreen from "../src/screens/PlayerScreen";
import ActionButton from "../src/components/ActionButton";
import { getCombinations, resolveSelection } from "../src/content/catalog";
import {
  getSelection,
  readLastStarted,
  readMusic,
  rememberStarted,
  setSelection,
} from "../src/storage/selection";
import { getCurrentRoutine, setCurrentRoutine } from "../src/storage";

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  popToTop: jest.fn(),
};
const mockMusic = {
  loop: false,
  volume: 0,
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn(),
};
const mockVoice = { play: jest.fn(), pause: jest.fn(), replace: jest.fn() };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) =>
    require("react").useEffect(callback, [callback]),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioPlayer: (source: unknown) => (source ? mockMusic : mockVoice),
}));

describe("white and blue app flow", () => {
  let rendered: ReactTestRenderer | undefined;
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    if (rendered) await act(async () => rendered!.unmount());
    rendered = undefined;
    jest.useRealTimers();
  });
  const hasText = (value: string) =>
    rendered!.root.findAllByType(Text).some((n) => n.props.children === value);
  const press = async (label: string) => {
    await act(async () => {
      const target = rendered!.root.findAll(
        (n) =>
          n.props.accessibilityLabel === label &&
          typeof n.props.onPress === "function",
      )[0];
      if (!target) throw new Error(`Missing control: ${label}`);
      target.props.onPress();
    });
  };
  it("shows persistent last use and opens combination and body previews", async () => {
    const previous = getCombinations()[0];
    await rememberStarted(previous);
    await act(async () => {
      rendered = create(<HomeScreen />);
    });
    expect(hasText("上次使用")).toBe(true);
    expect(hasText("依當下情境選擇")).toBe(false);
    expect(hasText("給自己一點空間。")).toBe(false);
    expect(hasText("今天想活動哪裡？")).toBe(false);
    await press("辦公室伸展");
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Preview");
    expect(getSelection()?.id).toBe("office");
    expect((await readLastStarted())?.id).toBe(previous.id);
    await press("肩膀");
    expect(getSelection()?.id).toBe("body-肩");
    expect(JSON.stringify(rendered!.toJSON())).not.toMatch(
      /注意事項|動作參考|醫療建議/,
    );
  });
  it("starts the exact selected 30-second movement sequence", async () => {
    const selected = getCombinations()[1];
    setSelection(selected);
    await act(async () => {
      rendered = create(<PreviewScreen />);
    });
    expect(await readLastStarted()).toBeNull();
    const first = resolveSelection(selected)[0];
    await press(`動作 1，${first.name}，查看說明`);
    expect(hasText("怎麼做")).toBe(true);
    expect(hasText("注意事項")).toBe(false);
    expect(hasText("動作參考")).toBe(false);
    await press("關閉動作說明");
    await act(async () => {
      rendered!.root
        .findAll(
          (n) =>
            n.props.accessibilityLabel === `調整${first.name}的順序` &&
            typeof n.props.onAccessibilityAction === "function",
        )[0]
        .props.onAccessibilityAction({
          nativeEvent: { actionName: "increment" },
        });
    });
    expect(await readLastStarted()).toBeNull();
    const expectedOrder = [...selected.exerciseIds];
    [expectedOrder[0], expectedOrder[1]] = [expectedOrder[1], expectedOrder[0]];
    expect(JSON.stringify(rendered!.toJSON())).not.toMatch(/留出|只做這一小段/);
    await act(async () =>
      rendered!.root.findByType(ActionButton).props.onPress(),
    );
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Player");
    expect(getCurrentRoutine()?.units.map((e) => e.id)).toEqual(expectedOrder);
    expect((await readLastStarted())?.exerciseIds).toEqual(expectedOrder);
    expect(getSelection()?.exerciseIds).toEqual(expectedOrder);
    expect(
      getCurrentRoutine()?.units.every((e) => e.duration_seconds === 30),
    ).toBe(true);
    expect((await readLastStarted())?.id).toBe(selected.id);
  });
  it("syncs time and music through pause, resume, mute, completion and replay", async () => {
    const selected = getCombinations()[0];
    setSelection(selected);
    setCurrentRoutine({
      units: resolveSelection(selected),
      repeatsSomeMoves: false,
      empty: false,
    });
    await act(async () => {
      rendered = create(<PlayerScreen />);
    });
    expect(mockMusic.play).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(hasText("0:28")).toBe(true);
    await press("暫停跟練");
    expect(mockMusic.pause).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(15000));
    expect(hasText("0:28")).toBe(true);
    await press("繼續跟練");
    await act(async () => jest.advanceTimersByTime(1000));
    expect(hasText("0:27")).toBe(true);
    await press("背景音樂");
    expect(await readMusic()).toBe(false);
    for (const _unit of selected.exerciseIds) await press("下一個動作");
    expect(hasText("這一小段，完成了。")).toBe(true);
    expect(JSON.stringify(rendered!.toJSON())).not.toMatch(
      /注意事項|動作參考|醫療建議/,
    );
    await act(async () => {
      const again = rendered!.root
        .findAll(
          (n) =>
            n.props.accessibilityRole === "button" &&
            typeof n.props.onPress === "function",
        )
        .find((n) =>
          n.findAllByType(Text).some((t) => t.props.children === "再伸展一次"),
        );
      again!.props.onPress();
    });
    expect(hasText("0:30")).toBe(true);
  });
});
