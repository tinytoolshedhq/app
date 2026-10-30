import { exerciseMatchesEquipment, exerciseMatchesRegion, UNIT_SECONDS, type Exercise } from '../content';

export type RoutineReason =
  | 'no_matching_content'
  | 'needs_unlock'
  | 'equipment_unavailable'
  | 'invalid_duration';

export type RoutineRequest = {
  exercises: Exercise[];
  position: string;
  bodyRegion: string;
  durationSeconds: number;
  unlocked: boolean;
  availableEquipment?: string[];
};

export type RoutineResult = {
  units: Exercise[];
  repeatsSomeMoves: boolean;
  empty: boolean;
  reason?: RoutineReason;
};

function byId(a: Exercise, b: Exercise): number {
  return a.id.localeCompare(b.id);
}

function groupBySetup(list: Exercise[]): Map<string, Exercise[]> {
  const map = new Map<string, Exercise[]>();
  for (const ex of [...list].sort(byId)) {
    const bucket = map.get(ex.setup) ?? [];
    bucket.push(ex);
    map.set(ex.setup, bucket);
  }
  return map;
}

function pickFirst(candidates: Exercise[]): Exercise {
  const groups = groupBySetup(candidates);
  let best: Exercise[] | null = null;
  let bestSetup = '';
  for (const [setup, items] of groups) {
    if (
      !best
      || items.length > best.length
      || (items.length === best.length && setup < bestSetup)
    ) {
      best = items;
      bestSetup = setup;
    }
  }
  return best![0];
}

function pickNext(prev: Exercise, candidates: Exercise[], usedIds: Set<string>): Exercise {
  const sorted = [...candidates].sort(byId);
  const unused = sorted.filter((e) => !usedIds.has(e.id));
  const pool = unused.length > 0 ? unused : sorted;
  const sameSetupDiff = pool.filter((e) => e.setup === prev.setup && e.id !== prev.id);
  if (sameSetupDiff.length) return sameSetupDiff[0];
  const otherDiff = pool.filter((e) => e.id !== prev.id);
  if (otherDiff.length) return otherDiff[0];
  return prev;
}

export function unitCountForDuration(durationSeconds: number): number {
  return durationSeconds / UNIT_SECONDS;
}

export function buildRoutine(req: RoutineRequest): RoutineResult {
  const n = unitCountForDuration(req.durationSeconds);
  if (!Number.isInteger(n) || n < 1) {
    return { units: [], repeatsSomeMoves: false, empty: true, reason: 'invalid_duration' };
  }

  const byPosition = req.exercises.filter((e) => e.position === req.position);
  const byRegion = byPosition.filter((e) => exerciseMatchesRegion(e, req.bodyRegion));
  if (byRegion.length === 0) {
    return { units: [], repeatsSomeMoves: false, empty: true, reason: 'no_matching_content' };
  }

  const byEquip = byRegion.filter((e) => exerciseMatchesEquipment(e, req.availableEquipment));
  if (byEquip.length === 0) {
    return { units: [], repeatsSomeMoves: false, empty: true, reason: 'equipment_unavailable' };
  }

  const unlockedPool = req.unlocked
    ? byEquip
    : byEquip.filter((e) => e.access_tier === 'free');
  if (unlockedPool.length === 0) {
    return { units: [], repeatsSomeMoves: false, empty: true, reason: 'needs_unlock' };
  }

  const units: Exercise[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < n; i += 1) {
    const next = i === 0 ? pickFirst(unlockedPool) : pickNext(units[i - 1], unlockedPool, usedIds);
    units.push(next);
    usedIds.add(next.id);
  }

  const unique = new Set(units.map((e) => e.id)).size;
  return {
    units,
    repeatsSomeMoves: unique < units.length,
    empty: false,
  };
}
