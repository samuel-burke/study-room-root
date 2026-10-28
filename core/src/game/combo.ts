import { GAME } from "../constants";

/** 1 person: 1.0x. Each extra person adds 0.1x, up to 2.0x. */
export function comboFor(peopleCount: number, enabled = true): number {
  if (!enabled || peopleCount <= 1) return 1;
  const raw = 1 + GAME.comboStep * (peopleCount - 1);
  // Round to one decimal so 1 + 0.1 * 5 is exactly 1.5, not 1.5000000000000002.
  return Math.min(GAME.comboMax, Math.round(raw * 10) / 10);
}

export function formatCombo(combo: number): string {
  return `${combo.toFixed(1)}x`;
}
