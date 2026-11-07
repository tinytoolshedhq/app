import React from "react";
import { PanResponder, type PanResponderCallbacks } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import ReorderableExerciseList from "../src/components/ReorderableExerciseList";
import { getCombinations, resolveSelection } from "../src/content/catalog";

describe("movement drag ordering", () => {
  let rendered: ReactTestRenderer;
  let responders: PanResponderCallbacks[];
  const changed = jest.fn();
  const dragging = jest.fn();
  const items = resolveSelection(getCombinations()[0]);
  const event = (pageY: number) => ({ nativeEvent: { pageY } }) as any;
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    responders = [];
    jest.spyOn(PanResponder, "create").mockImplementation((config) => {
      responders.push(config);
      return { panHandlers: {} };
    });
    await act(async () => {
      rendered = create(
        <ReorderableExerciseList
          items={items}
          onChange={changed}
          onOpen={jest.fn()}
          onDragStateChange={dragging}
          scrollRef={{ current: null }}
          viewportRef={{ current: null }}
          scrollMetrics={{
            current: {
              offset: 0,
              top: 0,
              viewportHeight: 600,
              contentHeight: 1000,
            },
          }}
        />,
      );
    });
  });
  afterEach(async () => {
    await act(async () => rendered.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  async function holdAndMove() {
    const handle = responders[0];
    await act(async () => {
      handle.onPanResponderGrant!(event(100), {} as any);
      jest.advanceTimersByTime(300);
    });
    await act(async () =>
      handle.onPanResponderMove!(event(220), { dy: 120, dx: 0 } as any),
    );
    return handle;
  }
  it("moves a held movement two positions while retaining every movement", async () => {
    const handle = await holdAndMove();
    expect(dragging).toHaveBeenCalledWith(true);
    expect(changed).not.toHaveBeenCalled();
    await act(async () => handle.onPanResponderRelease!(event(220), {} as any));
    const expected = [...items];
    expected.splice(2, 0, expected.splice(0, 1)[0]);
    expect(changed).toHaveBeenCalledWith(expected);
    expect(dragging).toHaveBeenLastCalledWith(false);
  });
  it("discards a cancelled drag", async () => {
    const handle = await holdAndMove();
    await act(async () =>
      handle.onPanResponderTerminate!(event(220), {} as any),
    );
    expect(changed).not.toHaveBeenCalled();
    expect(dragging).toHaveBeenLastCalledWith(false);
  });
  it("does not reorder a swipe before the long press", async () => {
    const handle = responders[0];
    await act(async () => {
      handle.onPanResponderGrant!(event(100), {} as any);
      handle.onPanResponderMove!(event(220), { dy: 120, dx: 0 } as any);
      jest.advanceTimersByTime(400);
      handle.onPanResponderRelease!(event(220), {} as any);
    });
    expect(changed).not.toHaveBeenCalled();
    expect(dragging).not.toHaveBeenCalled();
  });
});
