import type { AudioPlayer } from 'expo-audio';
import { createCueAudioService } from '../src/audio/cues';
import { cueAssets, exerciseLibrary } from '../src/content/exercise-index';

describe('local voice clips', () => {
 const cue = exerciseLibrary[0].voice_cues[0];
 const makePlayer = () => ({ pause: jest.fn(), play: jest.fn(), replace: jest.fn() });
 beforeEach(() => jest.useFakeTimers());
 afterEach(() => { delete cueAssets[cue.id]; jest.useRealTimers(); });
 it('keeps a missing clip silent for text-only guidance', async () => {
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  expect(player.play).not.toHaveBeenCalled();
 });
 it('pauses and resumes within the cue budget, then stops on a transition', async () => {
  cueAssets[cue.id] = 42;
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  expect(player.replace).toHaveBeenCalledWith(42);
  jest.advanceTimersByTime(1000);
  audio.pause();
  jest.advanceTimersByTime(15000);
  audio.resume();
  expect(player.play).toHaveBeenCalledTimes(2);
  await audio.stopAll();
  audio.resume();
  expect(player.play).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
 });
 it('stops a clip at its budget and respects mute', async () => {
  cueAssets[cue.id] = 42;
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  const count=player.pause.mock.calls.length;
  jest.advanceTimersByTime(cue.max_duration_seconds * 1000);
  expect(player.pause.mock.calls.length).toBeGreaterThan(count);
  audio.setMuted(true);
  await audio.playAt(cue.id);
  expect(player.play).toHaveBeenCalledTimes(1);
 });
});
