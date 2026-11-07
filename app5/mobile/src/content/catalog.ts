import definitions from "../../assets/exercises/routines.json";
import { loadBundledContent } from "./load";
import type { Exercise } from "./schema";

export type Selection = {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  tag: string;
  exerciseIds: string[];
};
export const bodyParts = [
  { name: "頸", label: "頸部", color: "#E8DCCB", pose: "neck" },
  { name: "肩", label: "肩膀", color: "#D3DFD7", pose: "shoulder" },
  { name: "胸", label: "胸口", color: "#EBDAC7", pose: "chest" },
  { name: "背", label: "腰背", color: "#D8D8E7", pose: "side" },
  { name: "手臂", label: "手臂", color: "#E5D5CE", pose: "triceps" },
  { name: "手", label: "手與手腕", color: "#DFE3CD", pose: "wrist" },
  { name: "髖臀", label: "髖與臀", color: "#E7D4CF", pose: "hug" },
  { name: "腿", label: "腿與腳踝", color: "#D1DFDF", pose: "calf" },
];
export function getCombinations(): Selection[] {
  return definitions.map((d) => ({ ...d, exerciseIds: d.exercise_ids }));
}
export function getBodySelection(name: string): Selection {
  const part = bodyParts.find((p) => p.name === name)!;
  const exercises = loadBundledContent().exercises.filter(
    (e) => e.library?.body_part === name,
  );
  // Keep seated, standing, and floor work together, avoiding repeated position changes.
  const order = ["sitting", "standing", "lying"];
  exercises.sort(
    (a, b) => order.indexOf(a.position) - order.indexOf(b.position),
  );
  return {
    id: `body-${name}`,
    name: `${part.label}舒展`,
    subtitle: "從小幅度開始，找到舒服的範圍",
    color: part.color,
    tag: "依姿勢分段・換姿勢可暫停",
    exerciseIds: exercises.map((e) => e.id),
  };
}
export function resolveSelection(selection: Selection): Exercise[] {
  const byId = new Map(loadBundledContent().exercises.map((e) => [e.id, e]));
  if (
    !selection.exerciseIds.length ||
    selection.exerciseIds.some((id) => !byId.has(id))
  )
    return [];
  return selection.exerciseIds.map((id) => byId.get(id)!);
}
export function activityLabel(count: number): string {
  const seconds = count * 30;
  return seconds % 60 === 0
    ? `${seconds / 60} 分鐘`
    : `${Math.floor(seconds / 60)} 分 30 秒`;
}
