import { GAME, MINUTE_MS } from "../constants";

/** The "still there?" check for one focus block, stored on the participant or solo timer. */
export interface AfkCheckState {
  /** When the prompt appears. null = no check in this block. */
  afkCheckAt: number | null;
  afkCheckAnswered: boolean;
}

export const NO_AFK_CHECK: AfkCheckState = { afkCheckAt: null, afkCheckAnswered: false };

export const AFK_CHECK_WINDOW_MS = GAME.afkCheckAnswerMinutes * MINUTE_MS;

/**
 * Picks a random moment in a focus block for the check, leaving room to answer
 * before the block ends. No check for short blocks, or when someone starts so
 * late that there's no room left for one.
 */
export function planAfkCheck(
  block: { startsAt: number; endsAt: number; minutes: number },
  from: number,
  random: () => number,
): AfkCheckState {
  if (block.minutes < GAME.afkCheckMinFocusMinutes) return NO_AFK_CHECK;
  const earliest = Math.max(block.startsAt, from) + GAME.afkCheckQuietStartMinutes * MINUTE_MS;
  const latest = block.endsAt - AFK_CHECK_WINDOW_MS;
  if (latest < earliest) return NO_AFK_CHECK;
  return {
    afkCheckAt: Math.round(earliest + random() * (latest - earliest)),
    afkCheckAnswered: false,
  };
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

/** True when the block ending at `blockEndsAt` had a check nobody answered. */
export function afkCheckMissed(check: AfkCheckState, blockEndsAt: number): boolean {
  return check.afkCheckAt !== null && !check.afkCheckAnswered && check.afkCheckAt < blockEndsAt;
}
