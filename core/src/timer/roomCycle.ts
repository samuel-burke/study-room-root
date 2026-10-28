import { MINUTE_MS } from "../constants";
import type { TimerPreset } from "./presets";

export type PhaseKind = "focus" | "break" | "longBreak";

export interface CyclePhase {
  /** Position in the cycle, starting at 0. */
  index: number;
  kind: PhaseKind;
  /** 1-based focus round this phase belongs to. */
  round: number;
  startsAt: number;
  endsAt: number;
}

/**
 * Lays out one full cycle: focus, break, focus, break, … focus, long break.
 * The server stores only `cycleStartedAt` and the preset; every client and the
 * server derive the same phase from those, so nobody's countdown drifts.
 */
export function buildCycle(cycleStartedAt: number, preset: TimerPreset): CyclePhase[] {
  const phases: CyclePhase[] = [];
  let cursor = cycleStartedAt;
  for (let round = 1; round <= preset.rounds; round++) {
    const isLast = round === preset.rounds;
    const focusEnds = cursor + preset.focusMinutes * MINUTE_MS;
    phases.push({
      index: phases.length,
      kind: "focus",
      round,
      startsAt: cursor,
      endsAt: focusEnds,
    });
    const restMinutes = isLast ? preset.longBreakMinutes : preset.breakMinutes;
    const restEnds = focusEnds + restMinutes * MINUTE_MS;
    phases.push({
      index: phases.length,
      kind: isLast ? "longBreak" : "break",
      round,
      startsAt: focusEnds,
      endsAt: restEnds,
    });
    cursor = restEnds;
  }
  return phases;
}

/** The phase running at `now`, or undefined once the cycle has finished. */
export function phaseAt(phases: readonly CyclePhase[], now: number): CyclePhase | undefined {
  return phases.find((phase) => now >= phase.startsAt && now < phase.endsAt);
}

export function cycleEndsAt(phases: readonly CyclePhase[]): number {
  return phases[phases.length - 1]?.endsAt ?? 0;
}

/** Milliseconds of overlap between [aStart, aEnd) and [bStart, bEnd). */
export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}
