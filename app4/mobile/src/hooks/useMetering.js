import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { enableMeasurementMode, restoreSession } from 'audio-measurement-session';
import { stopAndDiscardCache } from '../lib/discardRecording';
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

const RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
  numberOfChannels: 1,
};

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
  const pausedByBackgroundRef = useRef(false);
  const meterRef = useRef(emptyMeter());
  const startedAtRef = useRef(null);
  const elapsedPausedRef = useRef(0);
  const onDurationLimitRef = useRef(onDurationLimit);
  const isProRef = useRef(isPro);
  const autoStoppedRef = useRef(false);

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

  const stopRecorder = useCallback(async () => {
    await stopAndDiscardCache(recorder);
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // audio mode is best-effort
    }
    try {
      await restoreSession();
    } catch {
      // Expo Go / session restore is best-effort; never crash
    }
  }, [recorder]);

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
    try {
      await stopAndDiscardCache(recorder);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      // expo-audio's setAudioModeAsync hardcodes AVAudioSession mode .default
      // (see AudioModule.setAudioMode). Apply .measurement *after* that, once
      // recording has started, so AGC / voice processing are off in native
      // builds. Expo Go: enableMeasurementMode feature-detects and no-ops.
      try {
        await enableMeasurementMode();
      } catch {
        // missing native module or session error: keep expo-audio's session
      }
      pausedByBackgroundRef.current = false;
      autoStoppedRef.current = false;
      const fresh = emptyMeter();
      meterRef.current = fresh;
      liveRef.current = true;
      const now = Date.now();
      startedAtRef.current = now;
      elapsedPausedRef.current = 0;
      setStartedAt(now);
      setElapsedMs(0);
      setSession(fresh.session);
      setSmoothed(null);
      setRunning(true);
      return true;
    } catch {
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    liveRef.current = false;
    meterRef.current = freezeMeter(meterRef.current);
    setSmoothed(meterRef.current.smoothed);
    setSession(meterRef.current.session);
    if (startedAtRef.current) {
      const total = elapsedPausedRef.current + (Date.now() - startedAtRef.current);
      setElapsedMs(total);
    }
    startedAtRef.current = null;
    setStartedAt(null);
    setRunning(false);
    pausedByBackgroundRef.current = false;
    await stopRecorder();
  }, [stopRecorder]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        if (runningRef.current && recorder.isRecording) {
          try {
            recorder.pause();
            pausedByBackgroundRef.current = true;
            if (startedAtRef.current) {
              elapsedPausedRef.current += Date.now() - startedAtRef.current;
              startedAtRef.current = null;
            }
          } catch {
            // pause may throw if already stopped
          }
        }
        return;
      }
      if (pausedByBackgroundRef.current && runningRef.current) {
        try {
          recorder.record();
          pausedByBackgroundRef.current = false;
          startedAtRef.current = Date.now();
          setStartedAt(startedAtRef.current);
          enableMeasurementMode().catch(() => {});
        } catch {
          pausedByBackgroundRef.current = false;
        }
      }
    });
    return () => sub.remove();
  }, [recorder]);

  useEffect(() => () => {
    runningRef.current = false;
    stopRecorder().catch(() => {});
  }, [stopRecorder]);

  useEffect(() => {
    if (!running) return undefined;
    const tick = () => {
      const base = elapsedPausedRef.current;
      const live = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      const next = base + live;
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
  }, [running, stop]);

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
