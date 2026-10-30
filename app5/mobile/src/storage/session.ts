import type { RoutineResult } from '../builder';

let current: RoutineResult | null = null;

export function setCurrentRoutine(result: RoutineResult): void {
  current = result;
}

export function getCurrentRoutine(): RoutineResult | null {
  return current;
}
