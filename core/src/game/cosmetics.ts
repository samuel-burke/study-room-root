/**
 * Card styles: the border and accent of a member's card on the room board.
 * Most unlock with level; a few unlock with a badge. Members pick one on the
 * progress screen, or leave it on "automatic" (the best style their level
 * has unlocked), so a level 8 member shows a gold border without lifting a finger.
 */

export type CardStyleUnlock = { level: number } | { badge: string };

export interface CardStyleDefinition {
  id: string;
  name: string;
  unlock: CardStyleUnlock;
}

/** Ids are stored, so never rename one. Level styles go from plainest to fanciest. */
export const CARD_STYLES: readonly CardStyleDefinition[] = [
  { id: "classic", name: "Classic", unlock: { level: 1 } },
  { id: "lagoon", name: "Lagoon", unlock: { level: 3 } },
  { id: "ember", name: "Ember", unlock: { level: 5 } },
  { id: "gold", name: "Gold", unlock: { level: 8 } },
  { id: "aurora", name: "Aurora", unlock: { level: 12 } },
  { id: "nebula", name: "Nebula", unlock: { level: 16 } },
  { id: "legend", name: "Legend", unlock: { level: 25 } },
  { id: "sunrise", name: "Sunrise", unlock: { badge: "early-bird" } },
  { id: "midnight", name: "Midnight", unlock: { badge: "night-owl" } },
  { id: "boss-slayer", name: "Boss Slayer", unlock: { badge: "first-boss" } },
  { id: "pumpkin", name: "Pumpkin", unlock: { badge: "spooky" } },
];

/** How many badges a member card shows. */
export const SHOWCASE_SIZE = 3;

const BY_ID = new Map(CARD_STYLES.map((s) => [s.id, s]));

export function cardStyleById(id: string): CardStyleDefinition | undefined {
  return BY_ID.get(id);
}

export function isCardStyleUnlocked(
  style: CardStyleDefinition,
  level: number,
  badges: ReadonlySet<string>,
): boolean {
  return "level" in style.unlock ? level >= style.unlock.level : badges.has(style.unlock.badge);
}

/** The best style unlocked by level alone. */
export function automaticCardStyle(level: number): string {
  let best = "classic";
  for (const style of CARD_STYLES) {
    if ("level" in style.unlock && level >= style.unlock.level) best = style.id;
  }
  return best;
}

/**
 * The style a card shows: the member's pick while it's unlocked, otherwise
 * the automatic one. `chosen` is null or empty for "automatic".
 */
export function resolveCardStyle(
  chosen: string | null,
  level: number,
  badges: ReadonlySet<string>,
): string {
  const style = chosen ? cardStyleById(chosen) : undefined;
  return style && isCardStyleUnlocked(style, level, badges) ? style.id : automaticCardStyle(level);
}

/**
 * The badges a card shows: the member's picks they still hold, otherwise
 * their most recent ones. `earned` is ordered oldest first.
 */
export function resolveShowcase(
  chosen: readonly string[] | null,
  earned: readonly { badgeId: string }[],
): string[] {
  const held = new Set(earned.map((e) => e.badgeId));
  const picks = (chosen ?? []).filter((id) => held.has(id)).slice(0, SHOWCASE_SIZE);
  if (picks.length > 0) return picks;
  return earned
    .slice(-SHOWCASE_SIZE)
    .reverse()
    .map((e) => e.badgeId);
}
