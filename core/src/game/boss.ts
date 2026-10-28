import { daysBetween, type DayKey } from "../time/calendar";

/**
 * Built-in boss names. When admins leave "Boss name" blank, each week's boss
 * takes the next name in this list, so every member sees the same name and
 * no name repeats until the list runs out (about a year).
 */
export const BOSS_NAMES: readonly string[] = [
  "The Procrastinator",
  "Captain Snooze Button",
  "The Group Project Ghost",
  "Lord of the Late Fees",
  "The All-Nighter",
  "Professor Pop Quiz",
  "Wi-Fi Dropper 3000",
  "The Unread Syllabus",
  "Count Distraction",
  "The Infinite Scroll",
  "Sir Reply-All",
  "The Blank Page",
  "Deadline Dragon",
  "The Citation Kraken",
  "Doomscroll Golem",
  "The 8 AM Lecture",
  "Baron von Burnout",
  "The Missing Semicolon",
  "Snack Break Goblin",
  "The Overdue Library Book",
  "Notification Hydra",
  "The Word Count Wraith",
  "Sleepy Sloth Supreme",
  "The Printer That Jams",
  "Captain Cram",
  "The Forgotten Password",
  "Mister Five More Minutes",
  "The Typo Troll",
  "Grand Wizard of Excuses",
  "The Messy Desk Monster",
  "The Laptop at 1% Battery",
  "Queen of Open Tabs",
  "The Exam Room Echo",
  "Duke of Due Tomorrow",
  "The Couch Kraken",
  "The Auto-Correct Imp",
  "Lord Lo-Fi Beats",
  "The Lost Lecture Notes",
  "The Phantom Assignment",
  "Major Mental Block",
  "The Coffee Spill",
  "Sir Skips-a-Lot",
  "The Endless Reading List",
  "Emperor Eraser Crumbs",
  "The Last-Minute Lich",
  "Professor Plot Twist",
  "The Calculator Gremlin",
  "The Group Chat Swarm",
  "Commander Couldn't Even",
  "The Bibliography Beast",
  "The Snooze Siren",
  "The Final Final Exam",
];

/** Monday 1970-01-05, the first week counted. */
const FIRST_WEEK: DayKey = "1970-01-05";

/** The boss name for a week: the admin's name if set, otherwise the week's built-in name. */
export function bossNameFor(week: DayKey, customName: string): string {
  if (customName.length > 0) return customName;
  const weekNumber = Math.floor(daysBetween(FIRST_WEEK, week) / 7);
  const n = BOSS_NAMES.length;
  return BOSS_NAMES[((weekNumber % n) + n) % n]!;
}

export interface BossState {
  weekKey: DayKey;
  name: string;
  maxHpMinutes: number;
  damageMinutes: number;
  defeatedAt: number | null;
  contributorIds: string[];
}

export function newBoss(week: DayKey, name: string, hpHours: number): BossState {
  return {
    weekKey: week,
    name,
    maxHpMinutes: Math.max(1, Math.round(hpHours * 60)),
    damageMinutes: 0,
    defeatedAt: null,
    contributorIds: [],
  };
}

export interface DamageResult {
  boss: BossState;
  defeatedNow: boolean;
}

export function applyDamage(
  boss: BossState,
  minutes: number,
  contributorIds: readonly string[],
  now: number,
): DamageResult {
  if (minutes <= 0 || boss.defeatedAt !== null) return { boss, defeatedNow: false };
  const damageMinutes = Math.min(boss.maxHpMinutes, boss.damageMinutes + minutes);
  const contributors = new Set([...boss.contributorIds, ...contributorIds]);
  const defeatedNow = damageMinutes >= boss.maxHpMinutes;
  return {
    boss: {
      ...boss,
      damageMinutes,
      contributorIds: [...contributors],
      defeatedAt: defeatedNow ? now : null,
    },
    defeatedNow,
  };
}

export function bossHpLeftMinutes(boss: BossState): number {
  return Math.max(0, boss.maxHpMinutes - boss.damageMinutes);
}

/**
 * Apply a settings change to this week's boss. Damage is never healed and a
 * defeated boss stays defeated. Lowering HP below the damage dealt defeats it.
 */
export function reconfigureBoss(
  boss: BossState,
  name: string,
  hpHours: number,
  now: number,
): DamageResult {
  if (boss.defeatedAt !== null) return { boss: { ...boss, name }, defeatedNow: false };
  const maxHpMinutes = Math.max(1, Math.round(hpHours * 60));
  const defeatedNow = boss.damageMinutes >= maxHpMinutes;
  return {
    boss: {
      ...boss,
      name,
      maxHpMinutes,
      damageMinutes: Math.min(boss.damageMinutes, maxHpMinutes),
      defeatedAt: defeatedNow ? now : null,
    },
    defeatedNow,
  };
}
