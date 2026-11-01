import { RECORDING_OPTIONS, PHASE, createRecorderLifecycle } from '../src/lib/recorderLifecycle';
import { shouldAutoStopSession, FREE_SESSION_MS } from '../src/lib/gating';

function createMockRecorder() {
  let state = 'idle';
  let released = false;
  let fileDeleted = false;
  const prepareCalls = [];
  const stopCalls = [];
  const recordCalls = [];
  const rec = {
    uri: null,
    get isRecording() {
      return state === 'recording';
    },
    prepareToRecordAsync: jest.fn(async (options) => {
      if (released) throw new Error('recorder reused after release');
      if (state === 'stopped' && fileDeleted && (options == null)) {
        throw new Error('recorder reused after release');
      }
      if (state === 'recording') throw new Error('prepare while recording');
      prepareCalls.push(options);
      state = 'prepared';
      fileDeleted = false;
      rec.uri = options ? 'file:///tmp/rec-new.m4a' : 'file:///tmp/rec-same.m4a';
    }),
    record: jest.fn(() => {
      if (released) throw new Error('recorder reused after release');
      if (state !== 'prepared' && state !== 'paused') {
        throw new Error('record without prepare');
      }
      recordCalls.push('record');
      state = 'recording';
    }),
    stop: jest.fn(async () => {
      if (released) throw new Error('double release');
      stopCalls.push(state);
      if (state === 'recording' || state === 'paused') state = 'stopped';
    }),
    pause: jest.fn(() => {
      if (state === 'recording') state = 'paused';
    }),
    markDeleted() {
      fileDeleted = true;
    },
    release() {
      released = true;
      state = 'released';
    },
    getState: () => ({ state, released, fileDeleted, prepareCalls, stopCalls, recordCalls }),
  };
  return rec;
}

describe('recorder lifecycle', () => {
  function setup() {
    const recorder = createMockRecorder();
    const setAudioModeAsync = jest.fn(async () => {});
    const enableMeasurementMode = jest.fn(async () => true);
    const restoreSession = jest.fn(async () => true);
    const deleteAsync = jest.fn(async (uri) => {
      if (uri && recorder.uri === uri) recorder.markDeleted();
    });
    const life = createRecorderLifecycle({
      recorder,
      setAudioModeAsync,
      enableMeasurementMode,
      restoreSession,
      deleteAsync,
      recordingOptions: RECORDING_OPTIONS,
    });
    return {
      recorder, life, setAudioModeAsync, enableMeasurementMode, restoreSession, deleteAsync,
    };
  }

  it('survives at least 5 start/stop cycles without double stop or reuse after release', async () => {
    const { recorder, life, enableMeasurementMode, restoreSession } = setup();
    for (let i = 0; i < 5; i += 1) {
      await life.start();
      expect(life.getPhase()).toBe(PHASE.RECORDING);
      expect(recorder.prepareToRecordAsync).toHaveBeenLastCalledWith(RECORDING_OPTIONS);
      expect(recorder.getState().state).toBe('recording');
      await life.stop();
      expect(life.getPhase()).toBe(PHASE.IDLE);
      expect(life.isReleased()).toBe(false);
    }
    expect(life.getPrepareCount()).toBe(5);
    expect(life.getStopCount()).toBe(5);
    expect(recorder.stop).toHaveBeenCalledTimes(5);
    expect(enableMeasurementMode).toHaveBeenCalledTimes(5);
    expect(restoreSession).toHaveBeenCalledTimes(5);
    recorder.prepareToRecordAsync.mock.calls.forEach((args) => {
      expect(args[0]).toEqual(RECORDING_OPTIONS);
    });
    expect(life.getReleaseCount()).toBe(0);
  });

  it('auto-stop then restart does not reuse a released recorder', async () => {
    const { recorder, life } = setup();
    expect(shouldAutoStopSession({ elapsedMs: FREE_SESSION_MS, isPro: false })).toBe(true);
    await life.start();
    await life.stop();
    expect(life.getPhase()).toBe(PHASE.IDLE);
    await life.start();
    expect(life.getPhase()).toBe(PHASE.RECORDING);
    expect(recorder.prepareToRecordAsync).toHaveBeenLastCalledWith(RECORDING_OPTIONS);
    expect(recorder.getState().released).toBe(false);
    await life.stop();
    expect(life.getStopCount()).toBe(2);
    expect(life.getPrepareCount()).toBe(2);
  });

  it('release is idempotent and start after release does not touch the recorder', async () => {
    const { recorder, life } = setup();
    await life.start();
    await life.release();
    expect(life.isReleased()).toBe(true);
    expect(life.getReleaseCount()).toBe(1);
    const stops = recorder.stop.mock.calls.length;
    const prepares = recorder.prepareToRecordAsync.mock.calls.length;
    await life.release();
    expect(life.getReleaseCount()).toBe(1);
    expect(recorder.stop).toHaveBeenCalledTimes(stops);
    await expect(life.start()).rejects.toMatchObject({ code: 'RECORDER_RELEASED' });
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(prepares);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  it('never prepares without options after the cache file was deleted', async () => {
    const { recorder, life } = setup();
    await life.start();
    await life.stop();
    expect(recorder.getState().fileDeleted).toBe(true);
    await life.start();
    const last = recorder.prepareToRecordAsync.mock.calls.at(-1)[0];
    expect(last).toBeTruthy();
    expect(last.isMeteringEnabled).toBe(true);
  });

  it('serializes background pause/resume with a concurrent Stop so resume is a no-op', async () => {
    const { recorder, life } = setup();
    await life.start();
    expect(life.getPhase()).toBe(PHASE.RECORDING);
    const pauseP = life.pause();
    const stopP = life.stop();
    const resumeP = life.resume();
    const [, , resumed] = await Promise.all([pauseP, stopP, resumeP]);
    expect(resumed).toBe(false);
    expect(life.getPhase()).toBe(PHASE.IDLE);
    expect(life.isReleased()).toBe(false);
    expect(recorder.getState().state).toBe('stopped');
    expect(recorder.getState().released).toBe(false);
    expect(life.getStateForTests().stopRequested).toBe(true);
    await life.start();
    expect(life.getPhase()).toBe(PHASE.RECORDING);
    expect(recorder.prepareToRecordAsync).toHaveBeenLastCalledWith(RECORDING_OPTIONS);
    expect(recorder.getState().state).toBe('recording');
    await life.stop();
  });

  it('survives interruption (pause) then Stop then Start', async () => {
    const { recorder, life, enableMeasurementMode } = setup();
    await life.start();
    const didPause = await life.pause();
    expect(didPause).toBe(true);
    expect(life.getPhase()).toBe(PHASE.PAUSED);
    expect(recorder.getState().state).toBe('paused');
    const resumeWhileStopping = life.resume();
    await life.stop();
    expect(await resumeWhileStopping).toBe(false);
    expect(life.getPhase()).toBe(PHASE.IDLE);
    expect(recorder.getState().state).toBe('stopped');
    expect(recorder.getState().fileDeleted).toBe(true);
    await life.start();
    expect(life.getPhase()).toBe(PHASE.RECORDING);
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    recorder.prepareToRecordAsync.mock.calls.forEach((args) => {
      expect(args[0]).toEqual(RECORDING_OPTIONS);
    });
    expect(enableMeasurementMode).toHaveBeenCalledTimes(2);
    expect(recorder.getState().released).toBe(false);
    await life.stop();
  });

  it('pause and resume no-op after stop or release', async () => {
    const { recorder, life } = setup();
    await life.start();
    await life.stop();
    expect(await life.pause()).toBe(false);
    expect(await life.resume()).toBe(false);
    expect(recorder.pause).toHaveBeenCalledTimes(0);
    await life.start();
    await life.release();
    expect(await life.pause()).toBe(false);
    expect(await life.resume()).toBe(false);
    expect(life.isReleased()).toBe(true);
  });
});
