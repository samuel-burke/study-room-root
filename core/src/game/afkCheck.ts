import { GAME, MINUTE_MS } from "../constants";
import type { CyclePhase } from "../timer/roomCycle";

/** The "still there?" check, stored on the room participant (one per cycle) or solo timer. */
export interface AfkCheckState {
  /** When the prompt appears. null = no check planned. */
  afkCheckAt: number | null;
  afkCheckAnswered: boolean;
}

export const NO_AFK_CHECK: AfkCheckState = { afkCheckAt: null, afkCheckAnswered: false };

export const AFK_CHECK_WINDOW_MS = GAME.afkCheckAnswerMinutes * MINUTE_MS;

/**
 * Picks a random moment in a block, leaving the full window to answer before
 * it ends. No check when someone starts so late that there's no room for one.
 */
export function planAfkCheck(
  block: { startsAt: number; endsAt: number },
  from: number,
  random: () => number,
): AfkCheckState {
  const earliest = Math.max(block.startsAt, from) + GAME.afkCheckQuietStartMinutes * MINUTE_MS;
  const latest = block.endsAt - AFK_CHECK_WINDOW_MS;
  if (latest < earliest) return NO_AFK_CHECK;
  return {
    afkCheckAt: Math.round(earliest + random() * (latest - earliest)),
    afkCheckAnswered: false,
  };
}

/**
 * One check per room cycle (about two hours on 25/5), in a random focus round
 * after the first one you take part in. Someone who joins in the last round
 * isn't asked, since the cycle releases them soon anyway.
 */
export function planRoomAfkCheck(
  phases: readonly CyclePhase[],
  from: number,
  random: () => number,
): AfkCheckState {
  const eligible = phases.filter((p) => p.kind === "focus" && p.endsAt > from).slice(1);
  if (eligible.length === 0) return NO_AFK_CHECK;
  const round = eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))]!;
  return planAfkCheck(round, from, random);
}

/** Solo timers of an hour or more get one check, never in the first 25 minutes. */
export function planSoloAfkCheck(
  startsAt: number,
  minutes: number,
  random: () => number,
): AfkCheckState {
  if (minutes < GAME.afkCheckSoloMinMinutes) return NO_AFK_CHECK;
  return planAfkCheck(
    {
      startsAt: startsAt + GAME.afkCheckSoloQuietMinutes * MINUTE_MS,
      endsAt: startsAt + minutes * MINUTE_MS,
    },
    startsAt,
    random,
  );
}

/** True while the prompt is up and waiting for a tap. */
export function afkCheckOpen(check: AfkCheckState, now: number): boolean {
  return (
    check.afkCheckAt !== null &&
    !check.afkCheckAnswered &&
    now >= check.afkCheckAt &&
    now < check.afkCheckAt + AFK_CHECK_WINDOW_MS
  );
}

/**
 * True when a check that came up before `blockEndsAt` went unanswered. On the
 * room timer this holds for the round with the check and every round after it
 * in the same cycle.
 */
export function afkCheckMissed(check: AfkCheckState, blockEndsAt: number): boolean {
  return check.afkCheckAt !== null && !check.afkCheckAnswered && check.afkCheckAt < blockEndsAt;
}
