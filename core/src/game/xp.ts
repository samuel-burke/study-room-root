import { GAME } from "../constants";

/** Base XP for focused minutes, before combo. */
export function baseFocusXp(minutes: number): number {
  return Math.floor(minutes) * GAME.xpPerFocusMinute;
}

export function focusXp(minutes: number, combo: number): number {
  return Math.round(baseFocusXp(minutes) * combo);
}

/** How much of `raw` XP can still be granted today under the daily cap. */
export function applyDailyCap(raw: number, xpEarnedToday: number, dailyCap: number): number {
  if (raw <= 0) return 0;
  return Math.max(0, Math.min(raw, dailyCap - xpEarnedToday));
}

/** XP needed to go from `level` to `level + 1`. Level 7 needs 500. */
export function xpForLevel(level: number): number {
  return 150 + 50 * level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level needs in total. */
  xpForNextLevel: number;
}

export function levelFromXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpForLevel(level) };
}
