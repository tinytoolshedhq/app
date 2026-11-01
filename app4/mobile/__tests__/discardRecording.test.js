import fs from 'fs';
import path from 'path';
import {
  PENDING_DISCARD_CAP,
  discardRecordingUri,
  pendingDiscardCount,
  pendingDiscardUrisForTests,
  resetPendingDiscardsForTests,
  retryPendingDiscards,
  stopAndDiscardCache,
} from '../src/lib/discardRecording';

describe('discardRecordingUri', () => {
  beforeEach(() => {
    resetPendingDiscardsForTests();
  });

  it('no-ops on empty uri and does not call deleteAsync', async () => {
    const del = jest.fn(async () => {});
    expect(await discardRecordingUri(null, del)).toBe(false);
    expect(await discardRecordingUri('', del)).toBe(false);
    expect(await discardRecordingUri('   ', del)).toBe(false);
    expect(del).not.toHaveBeenCalled();
    expect(pendingDiscardCount()).toBe(0);
  });

  it('deletes with idempotent: true and clears pending', async () => {
    const del = jest.fn(async () => {});
    expect(await discardRecordingUri('file:///tmp/rec.m4a', del)).toBe(true);
    expect(del).toHaveBeenCalledWith('file:///tmp/rec.m4a', { idempotent: true });
    expect(pendingDiscardCount()).toBe(0);
  });

  it('queues a retry when delete fails and does not log the path', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const del = jest.fn(async () => {
      throw new Error('EACCES');
    });
    await expect(discardRecordingUri('file:///tmp/rec.m4a', del)).resolves.toBe(false);
    expect(pendingDiscardCount()).toBe(1);
    const dumped = JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls]);
    expect(dumped).not.toMatch(/file:\/\/\/tmp\/rec/);
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe('pending retry', () => {
  beforeEach(() => {
    resetPendingDiscardsForTests();
  });

  it('retries a failed uri on the next stop/unmount cleanup', async () => {
    const failOnce = new Set(['file:///tmp/old.m4a']);
    const del = jest.fn(async (uri) => {
      if (failOnce.has(uri)) {
        failOnce.delete(uri);
        throw new Error('busy');
      }
    });
    await discardRecordingUri('file:///tmp/old.m4a', del);
    expect(pendingDiscardCount()).toBe(1);

    const recorder = {
      uri: 'file:///tmp/new.m4a',
      isRecording: false,
      stop: jest.fn(),
    };
    await stopAndDiscardCache(recorder, del);
    expect(del).toHaveBeenCalledWith('file:///tmp/old.m4a', { idempotent: true });
    expect(del).toHaveBeenCalledWith('file:///tmp/new.m4a', { idempotent: true });
    expect(pendingDiscardCount()).toBe(0);
  });

  it('retryPendingDiscards is a no-op when empty', async () => {
    const del = jest.fn(async () => {});
    await retryPendingDiscards(del);
    expect(del).not.toHaveBeenCalled();
  });

  it('caps the retry set and drops the oldest', async () => {
    const del = jest.fn(async () => {
      throw new Error('busy');
    });
    expect(PENDING_DISCARD_CAP).toBe(20);
    for (let i = 0; i < PENDING_DISCARD_CAP + 5; i += 1) {
      await discardRecordingUri(`file:///tmp/rec-${i}.m4a`, del);
    }
    expect(pendingDiscardCount()).toBe(PENDING_DISCARD_CAP);
    const queued = pendingDiscardUrisForTests();
    expect(queued[0]).toBe('file:///tmp/rec-5.m4a');
    expect(queued).not.toContain('file:///tmp/rec-0.m4a');
    expect(queued[queued.length - 1]).toBe('file:///tmp/rec-24.m4a');
  });
});

describe('stopAndDiscardCache', () => {
  beforeEach(() => {
    resetPendingDiscardsForTests();
  });

  it('stops an active recorder then deletes uri', async () => {
    const del = jest.fn(async () => {});
    const recorder = {
      uri: 'file:///tmp/a.m4a',
      isRecording: true,
      stop: jest.fn(async () => {
        recorder.isRecording = false;
      }),
    };
    await stopAndDiscardCache(recorder, del);
    expect(recorder.stop).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('file:///tmp/a.m4a', { idempotent: true });
  });

  it('deletes leftover uri when not recording (before start / after stop)', async () => {
    const del = jest.fn(async () => {});
    const recorder = { uri: 'file:///tmp/leftover.m4a', isRecording: false, stop: jest.fn() };
    await stopAndDiscardCache(recorder, del);
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('file:///tmp/leftover.m4a', { idempotent: true });
  });

  it('deletes uri assigned only after stop()', async () => {
    const del = jest.fn(async () => {});
    const recorder = {
      uri: null,
      isRecording: true,
      stop: jest.fn(async () => {
        recorder.isRecording = false;
        recorder.uri = 'file:///tmp/after-stop.m4a';
      }),
    };
    await stopAndDiscardCache(recorder, del);
    expect(del).toHaveBeenCalledWith('file:///tmp/after-stop.m4a', { idempotent: true });
  });

  it('no-ops when recorder has no uri', async () => {
    const del = jest.fn(async () => {});
    await stopAndDiscardCache({ uri: null, isRecording: false }, del);
    expect(del).not.toHaveBeenCalled();
  });
});

describe('useMetering cleanup call sites', () => {
  it('discards cache before start, on stop, and on unmount', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/hooks/useMetering.js'), 'utf8');
    const life = fs.readFileSync(path.join(__dirname, '../src/lib/recorderLifecycle.js'), 'utf8');
    expect(life).toMatch(/import \{ discardRecordingUri, retryPendingDiscards, stopAndDiscardCache \} from '\.\/discardRecording'/);
    expect(life).toMatch(/await discardLeftover\(\);[\s\S]*prepareToRecordAsync\(options\)/);
    expect(life).toMatch(/await stopAndDiscardCache\(rec, deps\.deleteAsync\)/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]*lifeRef\.current\.release\(\)/);
    expect(src).toMatch(/requestRecordingPermissionsAsync/);
    expect(src).toMatch(/tickMeter\(meterRef\.current, sample\)/);
    expect(src).toMatch(/freezeMeter/);
    expect(src).toMatch(/enableMeasurementMode/);
    expect(src).toMatch(/restoreSession/);
    expect(src).toMatch(/liveRef\.current = false/);
    expect(src).toMatch(/if \(!running \|\| !liveRef\.current\) return/);
  });
});
