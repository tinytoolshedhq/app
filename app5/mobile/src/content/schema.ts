import { z } from 'zod';

const idSchema = z.string().min(1).max(80);

const labeledIdSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(80),
}).strict();

const selectionOptionSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(80),
  matches_all_body_regions: z.boolean(),
}).strict();

const timelineSegmentSchema = z.object({
  start_seconds: z.number().nonnegative(),
  end_seconds: z.number().positive(),
  instruction: z.string().min(1).max(200),
}).strict();

const voiceCueSchema = z.object({
  id: idSchema,
  at_seconds: z.number().nonnegative(),
  max_duration_seconds: z.number().positive(),
  text: z.string().min(1).max(400),
  audio_path: z.string().min(1).nullable(),
  measured_duration_seconds: z.number().nonnegative().nullable(),
}).strict();

const mediaSchema = z.object({
  status: z.string().min(1),
  image_path: z.string().min(1).nullable(),
  animation_path: z.string().min(1).nullable(),
  animation_format: z.string().min(1).nullable(),
  animation_playback: z.string().min(1).nullable(),
  animation_duration_seconds: z.number().nonnegative().nullable(),
  figma_url: z.string().min(1).nullable(),
}).strict();

export const exerciseSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  content_version: z.string().min(1),
  status: z.string().min(1),
  review_status: z.literal('source_referenced'),
  position: idSchema,
  body_regions: z.array(idSchema).min(1),
  movement_type: idSchema,
  access_tier: z.enum(['free', 'paid']),
  duration_seconds: z.literal(30),
  gap_after_seconds: z.literal(3),
  equipment: z.array(idSchema),
  setup: z.string().min(1).max(400),
  description: z.string().min(1).max(400),
  instructions: z.array(z.string().min(1).max(200)).min(1),
  cautions: z.array(z.string().min(1).max(200)).min(1),
  movement_timeline: z.array(timelineSegmentSchema).min(1),
  voice_cues: z.array(voiceCueSchema).min(1),
  animation_brief: z.string().min(1).max(800),
  media: mediaSchema,
  source_ids: z.array(idSchema),
}).strict();

const conversionLimitSchema = z.object({
  status: z.string().min(1),
  max_exercises: z.number().int().positive(),
  max_generated_audio_seconds: z.number().int().positive(),
  style_profiles: z.number().int().positive(),
  cost_in_credits: z.number().int().positive(),
}).strict();

const productRulesSchema = z.object({
  platforms: z.array(z.string().min(1)).min(1),
  exercise_duration_seconds: z.literal(30),
  gap_after_each_exercise_seconds: z.literal(3),
  include_gap_after_last_exercise: z.literal(true),
  selected_time_means: z.string().min(1),
  duration_increment_seconds: z.literal(30),
  suggested_duration_options_seconds: z.array(z.number().int().positive()),
  body_region_selection: z.literal('single'),
  cache_last_selection: z.boolean(),
  allow_explicitly_disclosed_repetition: z.boolean(),
  split_records_by_side: z.literal(false),
  monetization: z.object({
    purchase_type: z.string().min(1),
    subscription_enabled: z.literal(false),
    additional_credit_purchase_enabled: z.literal(false),
    custom_voice_conversions_included: z.number().int().nonnegative(),
    credit_renewal: z.string().min(1),
    restore_purchase_grants_new_credits: z.boolean(),
    on_credits_exhausted: z.string().min(1),
    proposed_conversion_limit: conversionLimitSchema,
    preview_limits: z.object({
      status: z.string().min(1),
      unlimited: z.boolean(),
    }).strict(),
    price: z.number().nonnegative().nullable(),
  }).strict(),
}).strict();

const sourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  url: z.string().url(),
  scope: z.string().min(1),
}).strict();

export const UNIT_SECONDS = 30;
export const GAP_SECONDS = 3;
export const EXPECTED_EXERCISE_COUNT = 30;
export const EXPECTED_PER_POSITION = 10;
export const WHOLE_BODY_ID = 'whole_body';
export const DURATION_OPTIONS_SECONDS = [30, 60, 120, 180, 300] as const;

function assertUniqueIds(ids: string[], ctx: z.RefinementCtx, path: (string | number)[], label: string) {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate ${label} id: ${id}`,
        path: [...path, i, 'id'],
      });
    }
    seen.add(id);
  });
}

function assertTimelineCoversUnit(
  timeline: z.infer<typeof timelineSegmentSchema>[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const sorted = [...timeline].sort((a, b) => a.start_seconds - b.start_seconds);
  if (sorted[0].start_seconds !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'movement_timeline must start at 0',
      path: [...path, 0, 'start_seconds'],
    });
  }
  const last = sorted[sorted.length - 1];
  if (last.end_seconds !== UNIT_SECONDS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `movement_timeline must end at ${UNIT_SECONDS}`,
      path: [...path, timeline.length - 1, 'end_seconds'],
    });
  }
  sorted.forEach((seg, i) => {
    if (!(seg.start_seconds < seg.end_seconds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'segment start must be < end (left-closed, right-open)',
        path: [...path, i],
      });
    }
    if (i === 0) return;
    const prev = sorted[i - 1];
    if (prev.end_seconds !== seg.start_seconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'movement_timeline has a gap or overlap',
        path: [...path, i, 'start_seconds'],
      });
    }
  });
}

function assertVoiceCuesInBounds(
  cues: z.infer<typeof voiceCueSchema>[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const sorted = [...cues].sort((a, b) => a.at_seconds - b.at_seconds);
  sorted.forEach((cue, i) => {
    if (cue.at_seconds < 0 || cue.at_seconds >= UNIT_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'voice cue at_seconds must be within [0, 30)',
        path: [...path, i, 'at_seconds'],
      });
    }
    const end = cue.at_seconds + cue.max_duration_seconds;
    if (end > UNIT_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'voice cue must not cross the 30s boundary',
        path: [...path, i, 'max_duration_seconds'],
      });
    }
    const next = sorted[i + 1];
    if (next && end > next.at_seconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'voice cue must not overlap the next cue',
        path: [...path, i, 'max_duration_seconds'],
      });
    }
  });
}

export const contentPackSchema = z.object({
  schema_version: z.string().min(1),
  content_version: z.string().min(1),
  locale: z.literal('zh-Hant'),
  created_at: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  review_status: z.literal('source_referenced'),
  media_status: z.string().min(1),
  notes: z.array(z.string().min(1)),
  categories: z.object({
    positions: z.array(labeledIdSchema).min(1),
    body_regions: z.array(labeledIdSchema).min(1),
    selection_options: z.array(selectionOptionSchema).min(1),
    movement_types: z.array(labeledIdSchema).min(1),
    equipment: z.array(labeledIdSchema),
  }).strict(),
  product_rules: productRulesSchema,
  playback: z.record(z.unknown()),
  global_safety: z.record(z.unknown()),
  sources: z.array(sourceSchema),
  exercises: z.array(exerciseSchema).length(EXPECTED_EXERCISE_COUNT),
}).strict().superRefine((pack, ctx) => {
  const positionIds = new Set(pack.categories.positions.map((p) => p.id));
  const regionIds = new Set(pack.categories.body_regions.map((p) => p.id));
  const movementIds = new Set(pack.categories.movement_types.map((p) => p.id));
  const equipmentIds = new Set(pack.categories.equipment.map((p) => p.id));
  const sourceIds = new Set(pack.sources.map((s) => s.id));

  assertUniqueIds(pack.categories.positions.map((p) => p.id), ctx, ['categories', 'positions'], 'position');
  assertUniqueIds(pack.categories.body_regions.map((p) => p.id), ctx, ['categories', 'body_regions'], 'body_region');
  assertUniqueIds(pack.exercises.map((e) => e.id), ctx, ['exercises'], 'exercise');

  const cueIds: string[] = [];
  pack.exercises.forEach((ex, i) => {
    if (!positionIds.has(ex.position)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown position: ${ex.position}`,
        path: ['exercises', i, 'position'],
      });
    }
    if (!movementIds.has(ex.movement_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown movement_type: ${ex.movement_type}`,
        path: ['exercises', i, 'movement_type'],
      });
    }
    ex.body_regions.forEach((rid, j) => {
      if (!regionIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown body_region: ${rid}`,
          path: ['exercises', i, 'body_regions', j],
        });
      }
    });
    ex.equipment.forEach((eid, j) => {
      if (!equipmentIds.has(eid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown equipment: ${eid}`,
          path: ['exercises', i, 'equipment', j],
        });
      }
    });
    ex.source_ids.forEach((sid, j) => {
      if (!sourceIds.has(sid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown source_id: ${sid}`,
          path: ['exercises', i, 'source_ids', j],
        });
      }
    });
    assertTimelineCoversUnit(ex.movement_timeline, ctx, ['exercises', i, 'movement_timeline']);
    assertVoiceCuesInBounds(ex.voice_cues, ctx, ['exercises', i, 'voice_cues']);
    ex.voice_cues.forEach((c) => cueIds.push(c.id));
  });
  assertUniqueIds(cueIds, ctx, ['exercises'], 'voice_cue');

  const byPosition: Record<string, number> = {};
  for (const ex of pack.exercises) {
    byPosition[ex.position] = (byPosition[ex.position] || 0) + 1;
  }
  for (const pos of pack.categories.positions) {
    if (byPosition[pos.id] !== EXPECTED_PER_POSITION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${pos.id} must have exactly ${EXPECTED_PER_POSITION} exercises`,
        path: ['exercises'],
      });
    }
  }

  const wholeBody = pack.categories.selection_options.find((o) => o.id === WHOLE_BODY_ID);
  if (!wholeBody?.matches_all_body_regions) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'selection_options must include whole_body matching all regions',
      path: ['categories', 'selection_options'],
    });
  }
});

export type ContentPack = z.infer<typeof contentPackSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type VoiceCue = z.infer<typeof voiceCueSchema>;
export type TimelineSegment = z.infer<typeof timelineSegmentSchema>;
export type LabeledId = z.infer<typeof labeledIdSchema>;

export function parseContentPack(raw: unknown): ContentPack {
  return contentPackSchema.parse(raw);
}

export function safeParseContentPack(raw: unknown) {
  return contentPackSchema.safeParse(raw);
}
