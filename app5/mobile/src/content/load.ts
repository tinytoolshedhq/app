import bundledRaw from '../../assets/content/exercises.zh-Hant.json';
import {
  parseContentPack,
  WHOLE_BODY_ID,
  type ContentPack,
  type Exercise,
  type LabeledId,
} from './schema';

let cached: ContentPack | null = null;

export function loadBundledContent(): ContentPack {
  if (!cached) {
    cached = parseContentPack(bundledRaw);
  }
  return cached;
}

export function resetContentCacheForTests(): void {
  cached = null;
}

export function labelFor(list: LabeledId[], id: string): string {
  return list.find((x) => x.id === id)?.label ?? id;
}

export function regionsAvailableForPosition(
  pack: ContentPack,
  position: string,
  unlocked: boolean,
): LabeledId[] {
  const used = new Set<string>();
  for (const ex of pack.exercises) {
    if (ex.position !== position) continue;
    if (!unlocked && ex.access_tier !== 'free') continue;
    for (const rid of ex.body_regions) used.add(rid);
  }
  return pack.categories.body_regions.filter((r) => used.has(r.id));
}

export function isWholeBody(id: string): boolean {
  return id === WHOLE_BODY_ID;
}

export function exerciseMatchesRegion(ex: Exercise, regionId: string): boolean {
  if (isWholeBody(regionId)) return true;
  return ex.body_regions.includes(regionId);
}

export function exerciseMatchesEquipment(ex: Exercise, available?: string[]): boolean {
  if (!available) return true;
  return ex.equipment.every((id) => available.includes(id));
}
