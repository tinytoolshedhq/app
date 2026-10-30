import type { AudioService } from '../audio';
import { GAP_SECONDS, UNIT_SECONDS, type Exercise, type VoiceCue } from '../content';

export const SLOT_SECONDS = UNIT_SECONDS + GAP_SECONDS;

export function totalPlaybackSeconds(unitCount: number): number {
  return unitCount * SLOT_SECONDS;
}

export function formatActiveDurationLabel(activeSeconds: number): { n: number; unit: 'sec' | 'min' } {
  if (activeSeconds % 60 === 0) return { n: activeSeconds / 60, unit: 'min' };
  return { n: activeSeconds, unit: 'sec' };
}

export type PlayerPhase = 'idle' | 'unit' | 'gap' | 'complete';

export type PlayerSnapshot = {
  phase: PlayerPhase;
  unitIndex: number;
  unitCount: number;
  elapsedSeconds: number;
  totalSeconds: number;
  unitRemaining: number;
  gapRemaining: number;
  paused: boolean;
  progress: number;
  current?: Exercise;
  next?: Exercise;
  instruction?: string;
};

export type Clock = () => number;

function segmentAt(ex: Exercise, offset: number): string | undefined {
  return ex.movement_timeline.find((s) => offset >= s.start_seconds && offset < s.end_seconds)?.instruction;
}

export class PlayerController {
  readonly units: Exercise[];
  readonly audio: AudioService;
  private readonly now: Clock;
  private startedAt: number | null = null;
  private pauseStartedAt: number | null = null;
  private pauseAccumulatedMs = 0;
  private seekOffsetMs = 0;
  private firedCues = new Set<string>();
  private lastUnitIndex = -1;

  constructor(units: Exercise[], audio: AudioService, now: Clock = () => Date.now()) {
    this.units = units;
    this.audio = audio;
    this.now = now;
  }

  get unitCount(): number {
    return this.units.length;
  }

  get totalSeconds(): number {
    return totalPlaybackSeconds(this.unitCount);
  }

  get paused(): boolean {
    return this.pauseStartedAt != null;
  }

  get started(): boolean {
    return this.startedAt != null;
  }

  elapsedMs(at: number = this.now()): number {
    if (this.startedAt == null) return 0;
    const extra = this.pauseStartedAt != null ? at - this.pauseStartedAt : 0;
    return Math.max(0, at - this.startedAt - this.pauseAccumulatedMs - extra + this.seekOffsetMs);
  }

  snapshot(at: number = this.now()): PlayerSnapshot {
    const unitCount = this.unitCount;
    const totalSeconds = this.totalSeconds;
    if (this.startedAt == null) {
      return {
        phase: 'idle',
        unitIndex: 0,
        unitCount,
        elapsedSeconds: 0,
        totalSeconds,
        unitRemaining: UNIT_SECONDS,
        gapRemaining: 0,
        paused: false,
        progress: 0,
        current: this.units[0],
        next: this.units[1],
        instruction: this.units[0] ? segmentAt(this.units[0], 0) : undefined,
      };
    }
    const elapsedSeconds = this.elapsedMs(at) / 1000;
    if (elapsedSeconds >= totalSeconds || unitCount === 0) {
      return {
        phase: 'complete',
        unitIndex: Math.max(0, unitCount - 1),
        unitCount,
        elapsedSeconds: totalSeconds,
        totalSeconds,
        unitRemaining: 0,
        gapRemaining: 0,
        paused: this.paused,
        progress: 1,
        current: this.units[unitCount - 1],
      };
    }
    const unitIndex = Math.min(unitCount - 1, Math.floor(elapsedSeconds / SLOT_SECONDS));
    const offset = elapsedSeconds - unitIndex * SLOT_SECONDS;
    const current = this.units[unitIndex];
    const next = this.units[unitIndex + 1];
    if (offset < UNIT_SECONDS) {
      return {
        phase: 'unit',
        unitIndex,
        unitCount,
        elapsedSeconds,
        totalSeconds,
        unitRemaining: UNIT_SECONDS - offset,
        gapRemaining: 0,
        paused: this.paused,
        progress: elapsedSeconds / totalSeconds,
        current,
        next,
        instruction: current ? segmentAt(current, offset) : undefined,
      };
    }
    return {
      phase: 'gap',
      unitIndex,
      unitCount,
      elapsedSeconds,
      totalSeconds,
      unitRemaining: 0,
      gapRemaining: SLOT_SECONDS - offset,
      paused: this.paused,
      progress: elapsedSeconds / totalSeconds,
      current,
      next,
      instruction: next?.setup,
    };
  }

  start(): void {
    this.startedAt = this.now();
    this.pauseStartedAt = null;
    this.pauseAccumulatedMs = 0;
    this.seekOffsetMs = 0;
    this.firedCues.clear();
    this.lastUnitIndex = -1;
  }

  pause(): void {
    if (this.startedAt == null || this.pauseStartedAt != null) return;
    this.pauseStartedAt = this.now();
    this.audio.pause();
  }

  resume(): void {
    if (this.startedAt == null || this.pauseStartedAt == null) return;
    this.pauseAccumulatedMs += this.now() - this.pauseStartedAt;
    this.pauseStartedAt = null;
    this.audio.resume();
  }

  skip(): void {
    const snap = this.snapshot();
    if (snap.phase === 'complete' || snap.phase === 'idle') return;
    const nextIndex = snap.unitIndex + 1;
    this.jumpToUnit(nextIndex);
  }

  previous(): void {
    const snap = this.snapshot();
    if (snap.phase === 'idle' || this.startedAt == null) return;
    const intoSlot = this.elapsedMs() - snap.unitIndex * SLOT_SECONDS * 1000;
    if (snap.phase === 'gap' || (snap.phase === 'unit' && intoSlot > 1000)) {
      this.jumpToUnit(snap.unitIndex);
      return;
    }
    this.jumpToUnit(Math.max(0, snap.unitIndex - 1));
  }

  private jumpToUnit(index: number): void {
    void this.audio.stopAll();
    this.firedCues.clear();
    this.lastUnitIndex = -1;
    if (index >= this.unitCount) {
      this.seekToMs(this.totalSeconds * 1000);
      return;
    }
    this.seekToMs(Math.max(0, index) * SLOT_SECONDS * 1000);
  }

  private seekToMs(elapsedMs: number): void {
    const at = this.now();
    if (this.startedAt == null) this.startedAt = at;
    if (this.pauseStartedAt != null) {
      this.pauseAccumulatedMs += at - this.pauseStartedAt;
      this.pauseStartedAt = at;
    }
    this.seekOffsetMs = elapsedMs - (at - this.startedAt - this.pauseAccumulatedMs);
  }

  /**
   * Advance cue / unit-change side effects using wall-clock snapshot.
   * Call from the UI ticker. Does not use frame counts.
   */
  tick(at: number = this.now()): PlayerSnapshot {
    const snap = this.snapshot(at);
    if (snap.phase === 'complete') {
      void this.audio.stopAll();
      return snap;
    }
    if (snap.unitIndex !== this.lastUnitIndex) {
      if (this.lastUnitIndex !== -1) void this.audio.stopAll();
      this.lastUnitIndex = snap.unitIndex;
      this.firedCues.clear();
    }
    if (snap.phase === 'unit' && snap.current && !this.paused) {
      const elapsedInUnit = UNIT_SECONDS - snap.unitRemaining;
      this.fireCues(snap.current.voice_cues, elapsedInUnit);
    }
    return snap;
  }

  private fireCues(cues: VoiceCue[], elapsedInUnit: number): void {
    for (const cue of cues) {
      if (this.firedCues.has(cue.id)) continue;
      if (elapsedInUnit + 0.05 >= cue.at_seconds) {
        this.firedCues.add(cue.id);
        void this.audio.playAt(cue.id);
      }
    }
  }
}
