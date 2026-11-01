import { RecordingPresets } from 'expo-audio';
import { discardRecordingUri, retryPendingDiscards, stopAndDiscardCache } from './discardRecording';

/**
 * expo-audio iOS: AudioRecorder.prepare() only creates a new AVAudioRecorder
 * when options are passed. prepareToRecordAsync() with no args reuses the
 * previous native recorder. After we delete recorder.uri (the cache file
 * bound to that instance), a second prepare-without-options / record crashes.
 *
 * Always pass RECORDING_OPTIONS into prepare. Never stop/release twice.
 */

export const RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
  numberOfChannels: 1,
};

export const PHASE = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  STOPPING: 'stopping',
  RELEASED: 'released',
};

function releasedError(action) {
  const err = new Error('RECORDER_RELEASED');
  err.code = 'RECORDER_RELEASED';
  err.action = action;
  return err;
}

/**
 * Serial start/stop/release for one expo-audio recorder wrapper.
 * Inject native helpers in tests.
 */
export function createRecorderLifecycle(initial = {}) {
  const deps = { ...initial };
  const state = {
    phase: PHASE.IDLE,
    stopCount: 0,
    prepareCount: 0,
    releaseCount: 0,
    lastPrepareOptions: null,
    chain: Promise.resolve(),
  };

  function enqueue(fn) {
    const run = state.chain.then(fn, fn);
    state.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  function recorder() {
    return deps.recorder || null;
  }

  function bind(next) {
    if (next && typeof next === 'object') Object.assign(deps, next);
    return api;
  }

  async function discardLeftover() {
    const rec = recorder();
    const leftover = rec?.uri;
    await retryPendingDiscards(deps.deleteAsync);
    if (leftover) await discardRecordingUri(leftover, deps.deleteAsync);
  }

  async function startInternal() {
    if (state.phase === PHASE.RELEASED) throw releasedError('start');
    if (state.phase === PHASE.RECORDING || state.phase === PHASE.STARTING) {
      await stopInternal();
    }
    const rec = recorder();
    if (!rec || typeof rec.prepareToRecordAsync !== 'function') {
      throw new Error('NO_RECORDER');
    }
    state.phase = PHASE.STARTING;
    try {
      await discardLeftover();
      if (typeof deps.setAudioModeAsync === 'function') {
        await deps.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      }
      const options = deps.recordingOptions || RECORDING_OPTIONS;
      // Options required: native prepare() recreates AVAudioRecorder only then.
      await rec.prepareToRecordAsync(options);
      state.prepareCount += 1;
      state.lastPrepareOptions = options;
      rec.record();
      if (typeof deps.enableMeasurementMode === 'function') {
        try {
          await deps.enableMeasurementMode();
        } catch {
          // Expo Go / missing native module
        }
      }
      state.phase = PHASE.RECORDING;
    } catch (error) {
      state.phase = PHASE.IDLE;
      throw error;
    }
  }

  async function stopInternal() {
    if (state.phase === PHASE.RELEASED) return;
    const rec = recorder();
    if (state.phase === PHASE.IDLE && !rec?.isRecording) {
      await retryPendingDiscards(deps.deleteAsync);
      return;
    }
    if (state.phase === PHASE.STOPPING) return;

    state.phase = PHASE.STOPPING;
    if (rec) {
      state.stopCount += 1;
      await stopAndDiscardCache(rec, deps.deleteAsync);
    }
    if (typeof deps.setAudioModeAsync === 'function') {
      try {
        await deps.setAudioModeAsync({ allowsRecording: false });
      } catch {
        // audio mode is best-effort
      }
    }
    if (typeof deps.restoreSession === 'function') {
      try {
        await deps.restoreSession();
      } catch {
        // Expo Go / session restore is best-effort
      }
    }
    state.phase = PHASE.IDLE;
  }

  async function releaseInternal() {
    if (state.phase === PHASE.RELEASED) return;
    await stopInternal();
    state.releaseCount += 1;
    state.phase = PHASE.RELEASED;
  }

  const api = {
    bind,
    start: () => enqueue(() => startInternal()),
    stop: () => enqueue(() => stopInternal()),
    release: () => enqueue(() => releaseInternal()),
    getPhase: () => state.phase,
    isRecording: () => state.phase === PHASE.RECORDING,
    isReleased: () => state.phase === PHASE.RELEASED,
    getStopCount: () => state.stopCount,
    getPrepareCount: () => state.prepareCount,
    getReleaseCount: () => state.releaseCount,
    getLastPrepareOptions: () => state.lastPrepareOptions,
    getStateForTests: () => ({ ...state }),
  };
  return api;
}
