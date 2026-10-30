import type { AudioService } from '../src/audio';
import type { Exercise, VoiceCue } from '../src/content';
import {
  PlayerController,
  SLOT_SECONDS,
  totalPlaybackSeconds,
} from '../src/player';

function cue(id: string, at: number): VoiceCue {
  return {
    id,
    at_seconds: at,
    max_duration_seconds: 2,
    text: id,
    audio_path: null,
    measured_duration_seconds: null,
  };
}

function unit(id: string, cues: VoiceCue[] = [cue(`${id}_c`, 0)]): Exercise {
  return {
    id,
    name: id,
    content_version: '0',
    status: 'draft',
    review_status: 'source_referenced',
    position: 'sitting',
    body_regions: ['neck'],
    movement_type: 'mobility',
    access_tier: 'free',
    duration_seconds: 30,
    gap_after_seconds: 3,
    equipment: [],
    setup: 'sit',
    description: 'd',
    instructions: ['i'],
    cautions: ['c'],
    movement_timeline: [
      { start_seconds: 0, end_seconds: 15, instruction: 'first' },
      { start_seconds: 15, end_seconds: 30, instruction: 'second' },
    ],
    voice_cues: cues,
    animation_brief: 'a',
    media: {
      status: 'not_created',
      image_path: null,
      animation_path: null,
      animation_format: 'mp4',
      animation_playback: 'follow_movement_timeline',
      animation_duration_seconds: null,
      figma_url: null,
    },
    source_ids: [],
  };
}

function mockAudio(): AudioService & { plays: string[] } {
  const plays: string[] = [];
  let muted = false;
  return {
    plays,
    load: jest.fn(async () => {}),
    playAt: jest.fn(async (id: string) => {
      if (!muted) plays.push(id);
    }),
    stopAll: jest.fn(async () => {}),
    pause: jest.fn(),
    resume: jest.fn(),
    setMuted(value: boolean) {
      muted = value;
    },
    onRouteChange: jest.fn(() => () => {}),
  };
}

describe('player timeline', () => {
  it('maps 3 minutes to 6 units and 198s including 3s gaps after every unit', () => {
    expect(totalPlaybackSeconds(6)).toBe(198);
    expect(6 * 30 + 6 * 3).toBe(198);
    expect(SLOT_SECONDS).toBe(33);
  });

  it('uses wall clock plus accumulated pause, not frame counts', () => {
    let now = 1_000_000;
    const audio = mockAudio();
    const p = new PlayerController([unit('a'), unit('b')], audio, () => now);
    p.start();
    now += 5000;
    expect(p.snapshot().elapsedSeconds).toBe(5);
    p.pause();
    now += 20_000;
    expect(p.snapshot().elapsedSeconds).toBe(5);
    expect(p.snapshot().paused).toBe(true);
    p.resume();
    now += 1000;
    expect(p.snapshot().elapsedSeconds).toBe(6);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.resume).toHaveBeenCalled();
  });

  it('reports unit vs gap phases and per-unit countdown', () => {
    let now = 0;
    const p = new PlayerController([unit('a'), unit('b')], mockAudio(), () => now);
    p.start();
    now = 10_000;
    const mid = p.snapshot();
    expect(mid.phase).toBe('unit');
    expect(mid.unitIndex).toBe(0);
    expect(mid.unitRemaining).toBe(20);
    expect(mid.instruction).toBe('first');

    now = 31_000;
    const gap = p.snapshot();
    expect(gap.phase).toBe('gap');
    expect(gap.gapRemaining).toBe(2);
    expect(gap.next?.id).toBe('b');

    now = 33_000;
    const next = p.snapshot();
    expect(next.phase).toBe('unit');
    expect(next.unitIndex).toBe(1);

    now = 66_000;
    expect(p.snapshot().phase).toBe('complete');
  });

  it('skip stops audio and jumps to the next unit; last skip completes', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController([unit('a'), unit('b')], audio, () => now);
    p.start();
    now = 4000;
    p.skip();
    expect(audio.stopAll).toHaveBeenCalled();
    expect(p.snapshot().unitIndex).toBe(1);
    expect(p.snapshot().phase).toBe('unit');
    p.skip();
    expect(p.snapshot().phase).toBe('complete');
  });

  it('previous restarts the current unit after 1s, else goes back', () => {
    let now = 0;
    const p = new PlayerController([unit('a'), unit('b')], mockAudio(), () => now);
    p.start();
    now = 5000;
    p.previous();
    expect(p.snapshot().unitIndex).toBe(0);
    expect(p.snapshot().elapsedSeconds).toBeCloseTo(0, 5);

    now = 100;
    p.skip();
    expect(p.snapshot().unitIndex).toBe(1);
    now = 200;
    p.previous();
    expect(p.snapshot().unitIndex).toBe(0);
  });

  it('fires voice cues on the unit clock and skips them when muted', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController(
      [unit('a', [cue('c1', 0), cue('c2', 10)])],
      audio,
      () => now,
    );
    p.start();
    p.tick();
    expect(audio.plays).toEqual(['c1']);
    now = 10_000;
    p.tick();
    expect(audio.plays).toEqual(['c1', 'c2']);

    audio.plays.length = 0;
    audio.setMuted(true);
    const p2 = new PlayerController([unit('a', [cue('m1', 0)])], audio, () => 0);
    p2.start();
    p2.tick();
    expect(audio.plays).toEqual([]);
  });
});
