import bundled from '../assets/content/exercises.zh-Hant.json';
import { buildRoutine } from '../src/builder';
import { parseContentPack, type Exercise } from '../src/content';

const pack = parseContentPack(bundled);

function stub(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'position' | 'body_regions'>): Exercise {
  return {
    name: partial.id,
    content_version: '0',
    status: 'draft',
    review_status: 'source_referenced',
    movement_type: 'mobility',
    access_tier: 'free',
    duration_seconds: 30,
    gap_after_seconds: 3,
    equipment: [],
    setup: 'setup-a',
    description: 'd',
    instructions: ['i'],
    cautions: ['c'],
    movement_timeline: [{ start_seconds: 0, end_seconds: 30, instruction: 'i' }],
    voice_cues: [{
      id: `${partial.id}_c`,
      at_seconds: 0,
      max_duration_seconds: 4,
      text: 't',
      audio_path: null,
      measured_duration_seconds: null,
    }],
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
    ...partial,
  };
}

describe('routine builder', () => {
  it('uses N = seconds/30 and is deterministic', () => {
    const a = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'whole_body',
      durationSeconds: 180,
      unlocked: true,
    });
    const b = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'whole_body',
      durationSeconds: 180,
      unlocked: true,
    });
    expect(a.empty).toBe(false);
    expect(a.units).toHaveLength(6);
    expect(a.units.map((e) => e.id)).toEqual(b.units.map((e) => e.id));
    expect(a.units.every((e) => e.position === 'sitting')).toBe(true);
  });

  it('filters by body region and treats whole_body as any', () => {
    const shoulders = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'shoulders',
      durationSeconds: 60,
      unlocked: true,
    });
    expect(shoulders.units.every((e) => e.body_regions.includes('shoulders'))).toBe(true);

    const whole = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'whole_body',
      durationSeconds: 60,
      unlocked: true,
    });
    expect(whole.units.length).toBe(2);
  });

  it('never inserts a non-matching move, including when repeating', () => {
    const result = buildRoutine({
      exercises: pack.exercises,
      position: 'lying',
      bodyRegion: 'ankles',
      durationSeconds: 300,
      unlocked: true,
    });
    expect(result.empty).toBe(false);
    expect(result.repeatsSomeMoves).toBe(true);
    expect(result.units.every((e) => e.position === 'lying' && e.body_regions.includes('ankles'))).toBe(true);
  });

  it('does not mix positions (no supine flip)', () => {
    const result = buildRoutine({
      exercises: pack.exercises,
      position: 'lying',
      bodyRegion: 'whole_body',
      durationSeconds: 180,
      unlocked: true,
    });
    expect(result.units.every((e) => e.position === 'lying')).toBe(true);
    expect(result.units.every((e) => e.setup.includes('仰躺'))).toBe(true);
  });

  it('avoids adjacent repeats when another candidate exists', () => {
    const exercises = [
      stub({ id: 'a', position: 'sitting', body_regions: ['neck'], setup: 's1' }),
      stub({ id: 'b', position: 'sitting', body_regions: ['neck'], setup: 's1' }),
    ];
    const result = buildRoutine({
      exercises,
      position: 'sitting',
      bodyRegion: 'neck',
      durationSeconds: 150,
      unlocked: true,
    });
    expect(result.units).toHaveLength(5);
    for (let i = 1; i < result.units.length; i += 1) {
      expect(result.units[i].id).not.toBe(result.units[i - 1].id);
    }
    expect(result.repeatsSomeMoves).toBe(true);
  });

  it('prefers the same setup posture over switching', () => {
    const exercises = [
      stub({ id: 'a1', position: 'standing', body_regions: ['arms'], setup: 'same' }),
      stub({ id: 'a2', position: 'standing', body_regions: ['arms'], setup: 'same' }),
      stub({ id: 'b1', position: 'standing', body_regions: ['arms'], setup: 'other' }),
    ];
    const result = buildRoutine({
      exercises,
      position: 'standing',
      bodyRegion: 'arms',
      durationSeconds: 60,
      unlocked: true,
    });
    expect(result.units.every((e) => e.setup === 'same')).toBe(true);
  });

  it('filters equipment and never substitutes a non-matching move', () => {
    const exercises = [
      stub({ id: 'wall', position: 'standing', body_regions: ['calves'], equipment: ['wall'] }),
      stub({ id: 'free', position: 'standing', body_regions: ['calves'], equipment: [] }),
    ];
    const noWall = buildRoutine({
      exercises,
      position: 'standing',
      bodyRegion: 'calves',
      durationSeconds: 30,
      unlocked: true,
      availableEquipment: [],
    });
    expect(noWall.units.map((e) => e.id)).toEqual(['free']);

    const none = buildRoutine({
      exercises: [exercises[0]],
      position: 'standing',
      bodyRegion: 'calves',
      durationSeconds: 30,
      unlocked: true,
      availableEquipment: [],
    });
    expect(none).toMatchObject({ empty: true, reason: 'equipment_unavailable' });
  });

  it('returns needs_unlock instead of inserting paid moves', () => {
    const exercises = [
      stub({
        id: 'paid-only',
        position: 'sitting',
        body_regions: ['hips'],
        access_tier: 'paid',
      }),
    ];
    const result = buildRoutine({
      exercises,
      position: 'sitting',
      bodyRegion: 'hips',
      durationSeconds: 30,
      unlocked: false,
    });
    expect(result).toMatchObject({ empty: true, reason: 'needs_unlock', units: [] });
  });

  it('returns no_matching_content when the region does not exist for that posture', () => {
    const result = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'hips',
      durationSeconds: 60,
      unlocked: true,
    });
    expect(result).toMatchObject({ empty: true, reason: 'no_matching_content' });
  });

  it('keeps free-tier sitting content to access_tier free', () => {
    const result = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'whole_body',
      durationSeconds: 90,
      unlocked: false,
    });
    expect(result.units).toHaveLength(3);
    expect(result.units.every((e) => e.access_tier === 'free')).toBe(true);
  });

  it('rejects a duration that is not a 30s multiple', () => {
    const result = buildRoutine({
      exercises: pack.exercises,
      position: 'sitting',
      bodyRegion: 'whole_body',
      durationSeconds: 45,
      unlocked: true,
    });
    expect(result.reason).toBe('invalid_duration');
  });
});
