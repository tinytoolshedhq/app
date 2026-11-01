import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { enableMeasurementMode, restoreSession } from 'audio-measurement-session';
import { RECORDING_OPTIONS, createRecorderLifecycle } from '../lib/recorderLifecycle';
import {
  applyOffset,
  createSession,
  freezeMeter,
  isUsableMeteringSample,
  sessionDisplayStats,
  tickMeter,
} from '../lib/meter';
import { shouldShowSettingsHint } from '../lib/openSettings';
import { shouldAutoStopSession } from '../lib/gating';

const POLL_MS = 100;

function emptyMeter() {
  return { smoothed: null, session: createSession() };
}

export function useMetering(offset, { isPro = false, onDurationLimit } = {}) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, POLL_MS);

  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState('undetermined');
  const [settingsHint, setSettingsHint] = useState(false);
  const [smoothed, setSmoothed] = useState(null);
  const [session, setSession] = useState(createSession);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const runningRef = useRef(false);
  const liveRef = useRef(false);
  const sessionIntentRef = useRef(false);
  const pausedByBackgroundRef = useRef(false);
  const meterRef = useRef(emptyMeter());
  const startedAtRef = useRef(null);
  const elapsedPausedRef = useRef(0);
  const onDurationLimitRef = useRef(onDurationLimit);
  const isProRef = useRef(isPro);
  const autoStoppedRef = useRef(false);
  const lifeRef = useRef(null);
  if (lifeRef.current == null) {
    lifeRef.current = createRecorderLifecycle({
      recorder,
      setAudioModeAsync,
      enableMeasurementMode,
      restoreSession,
    });
  }

  useEffect(() => {
    lifeRef.current.bind({ recorder });
  }, [recorder]);

  useEffect(() => {
    onDurationLimitRef.current = onDurationLimit;
  }, [onDurationLimit]);

  useEffect(() => {
    isProRef.current = isPro;
  }, [isPro]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getRecordingPermissionsAsync();
        if (cancelled) return;
        if (status.granted) {
          setPermission('granted');
          setSettingsHint(false);
        } else {
          setPermission(status.status || 'denied');
          setSettingsHint(shouldShowSettingsHint(status));
        }
      } catch {
        if (!cancelled) setPermission('undetermined');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!running || !liveRef.current) return;
    const sample = recorderState?.metering;
    if (!isUsableMeteringSample(sample)) return;
    const next = tickMeter(meterRef.current, sample);
    meterRef.current = next;
    setSmoothed(next.smoothed);
    setSession(next.session);
  }, [recorderState?.metering, running]);

  const foldElapsedClock = useCallback(() => {
    if (startedAtRef.current) {
      elapsedPausedRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
      setStartedAt(null);
    }
  }, []);

  /** Elapsed follows actual RECORDING, never the Start tap / prepare wait. */
  const readElapsedMs = useCallback(() => {
    const recording = lifeRef.current?.isRecording?.() === true;
    if (recording && !pausedByBackgroundRef.current) {
      if (!startedAtRef.current) {
        startedAtRef.current = Date.now();
        setStartedAt(startedAtRef.current);
      }
      return elapsedPausedRef.current + (Date.now() - startedAtRef.current);
    }
    foldElapsedClock();
    return elapsedPausedRef.current;
  }, [foldElapsedClock]);

  const start = useCallback(async () => {
    let status;
    try {
      status = await requestRecordingPermissionsAsync();
    } catch {
      setPermission('denied');
      setSettingsHint(true);
      return false;
    }
    if (!status.granted) {
      setPermission(status.status || 'denied');
      setSettingsHint(shouldShowSettingsHint(status, { afterRequest: true }));
      return false;
    }
    setPermission('granted');
    setSettingsHint(false);
    sessionIntentRef.current = true;
    try {
      lifeRef.current.bind({ recorder });
      await lifeRef.current.start();
      // expo-audio's setAudioModeAsync hardcodes AVAudioSession mode .default
      // (see AudioModule.setAudioMode). Lifecycle applies .measurement *after*
      // record() via enableMeasurementMode. Expo Go: feature-detects and no-ops.
      // Do not clear pausedByBackground here: a background during prepare
      // must still resume or stay paused consistently after record() begins.
      autoStoppedRef.current = false;
      const fresh = emptyMeter();
      meterRef.current = fresh;
      liveRef.current = true;
      elapsedPausedRef.current = 0;
      startedAtRef.current = null;
      setElapsedMs(0);
      setSession(fresh.session);
      setSmoothed(null);
      runningRef.current = true;
      setRunning(true);
      const next = readElapsedMs();
      setElapsedMs(next);
      return true;
    } catch {
      sessionIntentRef.current = false;
      runningRef.current = false;
      setRunning(false);
      return false;
    }
  }, [readElapsedMs, recorder]);

  const stop = useCallback(async () => {
    sessionIntentRef.current = false;
    liveRef.current = false;
    meterRef.current = freezeMeter(meterRef.current);
    setSmoothed(meterRef.current.smoothed);
    setSession(meterRef.current.session);
    const total = readElapsedMs();
    foldElapsedClock();
    setElapsedMs(total);
    startedAtRef.current = null;
    setStartedAt(null);
    runningRef.current = false;
    setRunning(false);
    pausedByBackgroundRef.current = false;
    lifeRef.current.bind({ recorder });
    await lifeRef.current.stop();
  }, [foldElapsedClock, readElapsedMs, recorder]);

  useEffect(() => {
    const inFlightSession = () => (
      sessionIntentRef.current
      || runningRef.current
      || lifeRef.current?.isSessionActive?.() === true
    );

    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        if (!inFlightSession()) return;
        foldElapsedClock();
        pausedByBackgroundRef.current = true;
        lifeRef.current.bind({ recorder });
        // Same serialized queue as start/stop/release. If Start is still
        // preparing, pause runs after record() and no-ops if stop is pending.
        lifeRef.current.pause().catch(() => {});
        return;
      }
      if (!pausedByBackgroundRef.current && !inFlightSession()) return;
      lifeRef.current.bind({ recorder });
      const syncClockFromRecorder = (didResume) => {
        const recording = didResume || lifeRef.current?.isRecording?.() === true;
        if (recording) {
          pausedByBackgroundRef.current = false;
          if (!startedAtRef.current) {
            startedAtRef.current = Date.now();
            setStartedAt(startedAtRef.current);
          }
          return;
        }
        if (lifeRef.current?.isStarting?.() === true || (sessionIntentRef.current && !runningRef.current)) {
          return;
        }
        pausedByBackgroundRef.current = false;
      };
      if (!pausedByBackgroundRef.current) {
        syncClockFromRecorder(false);
        return;
      }
      lifeRef.current.resume().then((did) => {
        if (!did && !runningRef.current && !sessionIntentRef.current) {
          pausedByBackgroundRef.current = false;
          return;
        }
        syncClockFromRecorder(did);
      }).catch(() => {
        syncClockFromRecorder(false);
      });
    });
    return () => sub.remove();
  }, [foldElapsedClock, recorder]);

  // Unmount only. Do not depend on the recorder identity — that would
  // stop+release the session whenever the SharedRef was recreated.
  useEffect(() => () => {
    runningRef.current = false;
    lifeRef.current.release().catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const tick = () => {
      const next = readElapsedMs();
      setElapsedMs(next);
      if (
        !autoStoppedRef.current
        && shouldAutoStopSession({ elapsedMs: next, isPro: isProRef.current })
      ) {
        autoStoppedRef.current = true;
        stop().then(() => {
          onDurationLimitRef.current?.();
        }).catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [readElapsedMs, running, stop]);

  const stats = sessionDisplayStats(session, offset);
  const displayDb = applyOffset(smoothed, offset);

  return {
    running,
    permission,
    settingsHint,
    displayDb,
    max: stats.max,
    min: stats.min,
    avg: stats.avg,
    sampleCount: stats.count,
    startedAt,
    elapsedMs,
    start,
    stop,
  };
}
