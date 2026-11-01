import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useMetering } from '../src/hooks/useMetering';
import { RECORDING_OPTIONS } from '../src/lib/recorderLifecycle';
import * as gating from '../src/lib/gating';

jest.mock('audio-measurement-session', () => ({
  enableMeasurementMode: jest.fn(async () => true),
  restoreSession: jest.fn(async () => true),
  isMeasurementModeAvailable: () => true,
}));

function createStableRecorder() {
  let state = 'idle';
  let released = false;
  let fileDeleted = false;
  const rec = {
    uri: null,
    get isRecording() {
      return state === 'recording';
    },
    prepareToRecordAsync: jest.fn(async (options) => {
      if (released) throw new Error('recorder reused after release');
      if (state === 'stopped' && fileDeleted && options == null) {
        throw new Error('recorder reused after release');
      }
      state = 'prepared';
      fileDeleted = false;
      rec.uri = options ? 'file:///tmp/hook-new.m4a' : 'file:///tmp/hook-same.m4a';
    }),
    record: jest.fn(() => {
      if (released) throw new Error('recorder reused after release');
      state = 'recording';
    }),
    stop: jest.fn(async () => {
      if (released) throw new Error('double release');
      if (state === 'recording' || state === 'paused') state = 'stopped';
    }),
    pause: jest.fn(),
    markDeleted() {
      fileDeleted = true;
    },
    release() {
      released = true;
    },
    getMeta: () => ({ state, released, fileDeleted }),
  };
  return rec;
}

function HookProbe({ isPro = false, onDurationLimit, onReady }) {
  const meter = useMetering(0, { isPro, onDurationLimit });
  React.useEffect(() => {
    onReady(meter);
  }, [meter, onReady]);
  return null;
}

describe('useMetering start/stop cycles', () => {
  let recorder;

  beforeEach(() => {
    recorder = createStableRecorder();
    useAudioRecorder.mockReturnValue(recorder);
    requestRecordingPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    const FS = require('expo-file-system');
    const legacy = require('expo-file-system/legacy');
    const del = jest.fn(async (uri) => {
      if (uri && recorder.uri === uri) recorder.markDeleted();
    });
    FS.deleteAsync = del;
    legacy.deleteAsync = del;
  });

  async function mount(props = {}) {
    let latest;
    let tree;
    await act(async () => {
      tree = renderer.create(
        <HookProbe
          {...props}
          onReady={(m) => {
            latest = m;
          }}
        />,
      );
    });
    return {
      get: () => latest,
      unmount: async () => {
        await act(async () => {
          tree.unmount();
        });
      },
    };
  }

  it('runs start/stop five times without double release or reuse after release', async () => {
    const probe = await mount();
    for (let i = 0; i < 5; i += 1) {
      let ok;
      await act(async () => {
        ok = await probe.get().start();
      });
      expect(ok).toBe(true);
      expect(probe.get().running).toBe(true);
      expect(recorder.prepareToRecordAsync).toHaveBeenLastCalledWith(RECORDING_OPTIONS);
      await act(async () => {
        await probe.get().stop();
      });
      expect(probe.get().running).toBe(false);
      expect(recorder.getMeta().released).toBe(false);
    }
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(5);
    expect(recorder.stop).toHaveBeenCalledTimes(5);
    recorder.prepareToRecordAsync.mock.calls.forEach((args) => {
      expect(args[0]).toEqual(RECORDING_OPTIONS);
    });
    await probe.unmount();
  });

  it('can start again after the free-session auto-stop', async () => {
    const onDurationLimit = jest.fn();
    const spy = jest.spyOn(gating, 'shouldAutoStopSession').mockReturnValue(false);
    const probe = await mount({ onDurationLimit });
    await act(async () => {
      await probe.get().start();
    });
    spy.mockReturnValue(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(probe.get().running).toBe(false);
    expect(onDurationLimit).toHaveBeenCalled();
    expect(recorder.getMeta().released).toBe(false);
    spy.mockReturnValue(false);
    let ok;
    await act(async () => {
      ok = await probe.get().start();
    });
    expect(ok).toBe(true);
    expect(probe.get().running).toBe(true);
    expect(recorder.prepareToRecordAsync.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(recorder.prepareToRecordAsync).toHaveBeenLastCalledWith(RECORDING_OPTIONS);
    await act(async () => {
      await probe.get().stop();
    });
    await probe.unmount();
    spy.mockRestore();
  });
});
