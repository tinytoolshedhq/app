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
  PAUSED: 'paused',
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
    pauseCount: 0,
    resumeCount: 0,
    stopRequested: false,
    lastPrepareOptions: null,
    chain: Promise.resolve(),
  };

  function isStopOrReleasePendingOrDone() {
    return state.stopRequested
      || state.phase === PHASE.STOPPING
      || state.phase === PHASE.RELEASED
      || state.phase === PHASE.IDLE;
  }

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
    state.stopRequested = false;
    if (
      state.phase === PHASE.RECORDING
      || state.phase === PHASE.STARTING
      || state.phase === PHASE.PAUSED
    ) {
      await stopInternal();
      state.stopRequested = false;
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
      // Pause leaves isRecording false; still stop before deleting the cache file.
      if (!rec.isRecording && typeof rec.stop === 'function') {
        try {
          await rec.stop();
        } catch {
          // already stopped
        }
      }
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

  async function pauseInternal() {
    if (isStopOrReleasePendingOrDone()) return false;
    if (state.phase !== PHASE.RECORDING) return false;
    const rec = recorder();
    if (!rec || typeof rec.pause !== 'function') return false;
    try {
      rec.pause();
    } catch {
      return false;
    }
    state.pauseCount += 1;
    state.phase = PHASE.PAUSED;
    // Do not setAudioModeAsync({ allowsRecording: false }) while paused.
    // Changing the AVAudioSession category leaves the native AVAudioRecorder
    // alive (cache file still bound). That is the same class of reuse that
    // crashed TestFlight 1.1.0 after Stop deleted the file and the next
    // prepare reused the dead recorder. Stop already turns recording off
    // after stopAndDiscardCache. Restore-on-resume is therefore skipped too.
    return true;
  }

  async function resumeInternal() {
    if (isStopOrReleasePendingOrDone()) return false;
    if (state.phase !== PHASE.PAUSED) return false;
    const rec = recorder();
    if (!rec || typeof rec.record !== 'function') return false;
    try {
      rec.record();
    } catch {
      return false;
    }
    if (typeof deps.enableMeasurementMode === 'function') {
      try {
        await deps.enableMeasurementMode();
      } catch {
        // Expo Go / missing native module
      }
    }
    state.resumeCount += 1;
    state.phase = PHASE.RECORDING;
    return true;
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
    stop: () => {
      state.stopRequested = true;
      return enqueue(() => stopInternal());
    },
    pause: () => enqueue(() => pauseInternal()),
    resume: () => enqueue(() => resumeInternal()),
    release: () => {
      state.stopRequested = true;
      return enqueue(() => releaseInternal());
    },
    getPhase: () => state.phase,
    isRecording: () => state.phase === PHASE.RECORDING,
    isStarting: () => state.phase === PHASE.STARTING,
    isPaused: () => state.phase === PHASE.PAUSED,
    isSessionActive: () => (
      state.phase === PHASE.STARTING
      || state.phase === PHASE.RECORDING
      || state.phase === PHASE.PAUSED
    ),
    isReleased: () => state.phase === PHASE.RELEASED,
    getStopCount: () => state.stopCount,
    getPrepareCount: () => state.prepareCount,
    getReleaseCount: () => state.releaseCount,
    getPauseCount: () => state.pauseCount,
    getResumeCount: () => state.resumeCount,
    getLastPrepareOptions: () => state.lastPrepareOptions,
    getStateForTests: () => ({ ...state }),
  };
  return api;
}
