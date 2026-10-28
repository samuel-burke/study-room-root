import { weekdayIndex, type DayKey, type LocalTime } from "../time/calendar";

/**
 * Badges are permanent achievements. Each one is a pure check over facts the
 * engine gathers when something happens (a focus block ends, a goal is
 * checked off, a boss falls), so the rules are tested without a store.
 *
 * Secret badges are Easter eggs: the progress screen shows them as "?" tiles
 * until someone earns one. Every number here is a whole number.
 */

export type BadgeCategory =
  "streak" | "level" | "focus" | "room" | "goals" | "boss" | "quests" | "leaderboard" | "secret";

/**
 * Game features that some badges depend on. A badge that needs a feature the
 * app doesn't have yet is left out of the catalog and never awarded.
 */
export type BadgeFeature = "quests" | "leaderboard" | "bossRoster";

/**
 * Features this build has. Weekly quests (#23), the weekly leaderboard (#24)
 * and the built-in boss roster with strengths (#25, #28) add theirs here when
 * they land, along with the facts they feed to `StudyRoomEngine.awardBadges`.
 */
export const LIVE_BADGE_FEATURES: ReadonlySet<BadgeFeature> = new Set<BadgeFeature>();

/** One focus block, finished or cut short. Times are in the community time zone. */
export interface SessionFacts {
  kind: "room" | "solo";
  finished: boolean;
  /** Whole minutes focused. */
  minutes: number;
  /** The length the timer was set to: the solo length, or the room's focus length. */
  plannedMinutes: number;
  combo: number;
  start: LocalTime;
  end: LocalTime;
  /** On the room timer from round 1 through the last round of the cycle. */
  fullCycle: boolean;
}

export interface StreakFacts {
  length: number;
  /** When a broken streak just restarted at 1, how long the old one was. Otherwise 0. */
  comebackFrom: number;
  /** A freeze covered a missed day to keep this streak alive. */
  freezeSaved: boolean;
}

export interface DayFacts {
  day: DayKey;
  focusMinutes: number;
  sessionsFinished: number;
  goalsDone: number;
}

export interface LifetimeFacts {
  focusMinutes: number;
  sessionsFinished: number;
  roomRoundsFinished: number;
  goalsDone: number;
}

export interface GoalFacts {
  /** Seconds between adding the goal and checking it off. */
  secondsOpen: number;
}

export interface BossFacts {
  name: string;
  /** How much tougher than the base HP this boss was (1 without the boss roster). */
  strength: number;
  /** Bosses this member has helped defeat, including this one. */
  defeats: number;
  contributors: number;
  /** This member's focus landed the hit that finished it. */
  finalBlow: boolean;
  at: LocalTime;
}

export interface QuestFacts {
  doneThisWeek: number;
  perWeek: number;
  totalDone: number;
}

export interface LeaderboardFacts {
  /** 1-based weekly rank, 0 when unranked or hidden. */
  rank: number;
}

/** Everything a badge can look at. Only `xpTotal` and `level` are always known. */
export interface BadgeFacts {
  xpTotal: number;
  level: number;
  session?: SessionFacts;
  streak?: StreakFacts;
  today?: DayFacts;
  lifetime?: LifetimeFacts;
  goal?: GoalFacts;
  boss?: BossFacts;
  quests?: QuestFacts;
  leaderboard?: LeaderboardFacts;
}

export interface BadgeDefinition {
  id: string;
  name: string;
  /** How to earn it. Shown for secret badges only once earned. */
  description: string;
  icon: string;
  category: BadgeCategory;
  secret?: boolean;
  requires?: BadgeFeature;
  earned(facts: BadgeFacts): boolean;
}

const finished = (f: BadgeFacts) => (f.session?.finished ? f.session : undefined);
/** "MM-DD" of a day key. */
const monthDay = (day: DayKey) => day.slice(5);
const dayOfMonth = (day: DayKey) => Number(day.slice(8));

const streakBadge = (id: string, name: string, icon: string, days: number): BadgeDefinition => ({
  id,
  name,
  description: `Reach a ${days} day streak.`,
  icon,
  category: "streak",
  earned: (f) => (f.streak?.length ?? 0) >= days,
});

const levelBadge = (id: string, name: string, icon: string, level: number): BadgeDefinition => ({
  id,
  name,
  description: `Reach level ${level}.`,
  icon,
  category: "level",
  earned: (f) => f.level >= level,
});

const hoursBadge = (id: string, name: string, icon: string, hours: number): BadgeDefinition => ({
  id,
  name,
  description: `Focus for ${hours} hours in total.`,
  icon,
  category: "focus",
  earned: (f) => (f.lifetime?.focusMinutes ?? 0) >= hours * 60,
});

const bossNamed = (id: string, name: string, boss: string, icon: string): BadgeDefinition => ({
  id,
  name,
  description: `Help defeat ${boss}.`,
  icon,
  category: "secret",
  secret: true,
  earned: (f) => f.boss?.name === boss,
});

/** The catalog, in the order the progress screen shows it. Ids are stored, so never rename one. */
export const BADGES: readonly BadgeDefinition[] = [
  // ---------------------------------------------------------------- streaks
  streakBadge("streak-3", "Warming Up", "🔥", 3),
  streakBadge("streak-7", "On a Roll", "🎳", 7),
  streakBadge("streak-14", "Fortnight Focus", "📆", 14),
  streakBadge("streak-30", "Monthly Regular", "🗓️", 30),
  streakBadge("streak-50", "Half Century", "🏏", 50),
  streakBadge("streak-100", "Triple Digits", "💯", 100),
  streakBadge("streak-200", "Unbreakable", "⛓️", 200),
  streakBadge("streak-365", "Year of Focus", "🌍", 365),
  {
    id: "comeback",
    name: "Comeback",
    description: "Start studying again after a streak ends.",
    icon: "🌱",
    category: "streak",
    earned: (f) => (f.streak?.comebackFrom ?? 0) >= 2,
  },
  {
    id: "freeze-saved",
    name: "Saved by the Freeze",
    description: "Keep a streak alive with a freeze.",
    icon: "🧊",
    category: "streak",
    earned: (f) => f.streak?.freezeSaved === true,
  },

  // ---------------------------------------------------------------- levels
  levelBadge("level-5", "Rising Star", "⭐", 5),
  levelBadge("level-10", "Double Digits", "🔟", 10),
  levelBadge("level-20", "Scholar", "🎓", 20),
  levelBadge("level-30", "Sage", "🧘", 30),
  levelBadge("level-50", "Grandmaster", "👑", 50),

  // ---------------------------------------------------------------- focus time
  {
    id: "first-session",
    name: "First Steps",
    description: "Finish your first focus session.",
    icon: "👣",
    category: "focus",
    earned: (f) => (f.lifetime?.sessionsFinished ?? 0) >= 1,
  },
  hoursBadge("focus-10h", "Ten Hour Club", "⏱️", 10),
  hoursBadge("focus-50h", "Fifty and Focused", "📚", 50),
  hoursBadge("focus-100h", "Centurion", "🏛️", 100),
  hoursBadge("focus-250h", "Deep Diver", "🤿", 250),
  hoursBadge("focus-500h", "Five Hundred Club", "🏔️", 500),
  {
    id: "early-bird",
    name: "Early Bird",
    description: "Finish a session that starts between 4am and 8am.",
    icon: "🐦",
    category: "focus",
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && s.start.hour >= 4 && s.start.hour < 8;
    },
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Finish a session that starts between 10pm and 4am.",
    icon: "🦉",
    category: "focus",
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && (s.start.hour >= 22 || s.start.hour < 4);
    },
  },
  {
    id: "marathon",
    name: "Marathon",
    description: "Finish 4 sessions in one day.",
    icon: "🏃",
    category: "focus",
    earned: (f) => (f.today?.sessionsFinished ?? 0) >= 4,
  },
  {
    id: "power-day",
    name: "Power Day",
    description: "Focus for 4 hours in one day.",
    icon: "⚡",
    category: "focus",
    earned: (f) => (f.today?.focusMinutes ?? 0) >= 240,
  },
  {
    id: "weekend-warrior",
    name: "Weekend Warrior",
    description: "Finish 3 sessions on a Saturday or Sunday.",
    icon: "🛡️",
    category: "focus",
    earned: (f) =>
      f.today !== undefined && weekdayIndex(f.today.day) >= 5 && f.today.sessionsFinished >= 3,
  },
  {
    id: "long-haul",
    name: "Long Haul",
    description: "Finish a solo timer of 90 minutes or more.",
    icon: "🚂",
    category: "focus",
    earned: (f) => {
      const s = finished(f);
      return s?.kind === "solo" && s.plannedMinutes >= 90;
    },
  },
  {
    id: "ultramarathon",
    name: "Ultramarathon",
    description: "Finish a 3 hour solo timer, the longest there is.",
    icon: "🦾",
    category: "focus",
    earned: (f) => {
      const s = finished(f);
      return s?.kind === "solo" && s.plannedMinutes >= 180;
    },
  },

  // ---------------------------------------------------------------- room + combo
  {
    id: "squad-up",
    name: "Squad Up",
    description: "Finish your first round on the room timer.",
    icon: "🤝",
    category: "room",
    earned: (f) => (f.lifetime?.roomRoundsFinished ?? 0) >= 1,
  },
  {
    id: "room-25",
    name: "Regular",
    description: "Finish 25 rounds on the room timer.",
    icon: "🪑",
    category: "room",
    earned: (f) => (f.lifetime?.roomRoundsFinished ?? 0) >= 25,
  },
  {
    id: "room-100",
    name: "Pillar of the Room",
    description: "Finish 100 rounds on the room timer.",
    icon: "🧱",
    category: "room",
    earned: (f) => (f.lifetime?.roomRoundsFinished ?? 0) >= 100,
  },
  {
    id: "full-cycle",
    name: "Full Cycle",
    description: "Stay on the room timer for every round of a cycle.",
    icon: "🔄",
    category: "room",
    earned: (f) => finished(f)?.fullCycle === true,
  },
  {
    id: "study-group",
    name: "Study Group",
    description: "Finish a room round at a 1.5x combo or better.",
    icon: "👥",
    category: "room",
    earned: (f) => (finished(f)?.combo ?? 0) >= 1.5,
  },
  {
    id: "full-house",
    name: "Full House",
    description: "Finish a room round at the maximum 2.0x combo.",
    icon: "🏟️",
    category: "room",
    earned: (f) => (finished(f)?.combo ?? 0) >= 2,
  },

  // ---------------------------------------------------------------- goals
  {
    id: "first-goal",
    name: "Checked Off",
    description: "Finish your first goal.",
    icon: "✅",
    category: "goals",
    earned: (f) => (f.lifetime?.goalsDone ?? 0) >= 1,
  },
  {
    id: "goals-25",
    name: "Task Master",
    description: "Finish 25 goals.",
    icon: "📋",
    category: "goals",
    earned: (f) => (f.lifetime?.goalsDone ?? 0) >= 25,
  },
  {
    id: "goals-100",
    name: "Goal Crusher",
    description: "Finish 100 goals.",
    icon: "🔨",
    category: "goals",
    earned: (f) => (f.lifetime?.goalsDone ?? 0) >= 100,
  },
  {
    id: "productive-day",
    name: "Productive Day",
    description: "Finish 5 goals in one day.",
    icon: "🗂️",
    category: "goals",
    earned: (f) => (f.today?.goalsDone ?? 0) >= 5,
  },

  // ---------------------------------------------------------------- bosses
  {
    id: "first-boss",
    name: "First Boss",
    description: "Help defeat a weekly boss.",
    icon: "⚔️",
    category: "boss",
    earned: (f) => (f.boss?.defeats ?? 0) >= 1,
  },
  {
    id: "boss-5",
    name: "Boss Hunter",
    description: "Help defeat 5 weekly bosses.",
    icon: "🏹",
    category: "boss",
    earned: (f) => (f.boss?.defeats ?? 0) >= 5,
  },
  {
    id: "boss-20",
    name: "Legendary Raider",
    description: "Help defeat 20 weekly bosses.",
    icon: "🐉",
    category: "boss",
    earned: (f) => (f.boss?.defeats ?? 0) >= 20,
  },
  {
    id: "final-blow",
    name: "Final Blow",
    description: "Land the hit that defeats the weekly boss.",
    icon: "💥",
    category: "boss",
    earned: (f) => f.boss?.finalBlow === true,
  },
  {
    id: "giant-slayer",
    name: "Giant Slayer",
    description: "Help defeat a boss at 2x strength.",
    icon: "🗡️",
    category: "boss",
    requires: "bossRoster",
    earned: (f) => (f.boss?.strength ?? 0) >= 2,
  },
  {
    id: "survived-finals",
    name: "Survived Finals",
    description: "Help defeat The Final Final Exam.",
    icon: "📝",
    category: "boss",
    requires: "bossRoster",
    earned: (f) => f.boss?.name === "The Final Final Exam",
  },

  // ---------------------------------------------------------------- weekly quests
  {
    id: "quest-first",
    name: "Quest Taker",
    description: "Finish a weekly quest.",
    icon: "🗺️",
    category: "quests",
    requires: "quests",
    earned: (f) => (f.quests?.totalDone ?? 0) >= 1,
  },
  {
    id: "quest-sweep",
    name: "Clean Sweep",
    description: "Finish every quest in one week.",
    icon: "🧹",
    category: "quests",
    requires: "quests",
    earned: (f) => f.quests !== undefined && f.quests.doneThisWeek >= f.quests.perWeek,
  },
  {
    id: "quest-25",
    name: "Adventurer",
    description: "Finish 25 weekly quests.",
    icon: "🧭",
    category: "quests",
    requires: "quests",
    earned: (f) => (f.quests?.totalDone ?? 0) >= 25,
  },

  // ---------------------------------------------------------------- leaderboard
  {
    id: "podium",
    name: "Podium",
    description: "Reach the top 3 on the weekly leaderboard.",
    icon: "🥉",
    category: "leaderboard",
    requires: "leaderboard",
    earned: (f) => (f.leaderboard?.rank ?? 0) >= 1 && (f.leaderboard?.rank ?? 0) <= 3,
  },
  {
    id: "pole-position",
    name: "Pole Position",
    description: "Reach #1 on the weekly leaderboard.",
    icon: "🥇",
    category: "leaderboard",
    requires: "leaderboard",
    earned: (f) => f.leaderboard?.rank === 1,
  },

  // ---------------------------------------------------------------- secrets
  {
    id: "witching-hour",
    name: "Witching Hour",
    description: "Finish a session that starts between 3am and 4am.",
    icon: "🧙",
    category: "secret",
    secret: true,
    earned: (f) => finished(f)?.start.hour === 3,
  },
  {
    id: "midnight-oil",
    name: "Burning the Midnight Oil",
    description: "Be focusing as the clock strikes midnight.",
    icon: "🕯️",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && s.start.day !== s.end.day;
    },
  },
  {
    id: "leet",
    name: "1337",
    description: "Finish a session at exactly 13:37.",
    icon: "👾",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && s.end.hour === 13 && s.end.minute === 37;
    },
  },
  {
    id: "deep-thought",
    name: "Deep Thought",
    description: "Finish a solo timer of exactly 42 minutes.",
    icon: "🐬",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s?.kind === "solo" && s.plannedMinutes === 42;
    },
  },
  {
    id: "pi-day",
    name: "Easy as Pi",
    description: "Finish a session on March 14.",
    icon: "🥧",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && monthDay(s.end.day) === "03-14";
    },
  },
  {
    id: "spooky",
    name: "Spooky Scholar",
    description: "Finish a session on Halloween.",
    icon: "🎃",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && monthDay(s.end.day) === "10-31";
    },
  },
  {
    id: "new-year",
    name: "New Year, Same Me",
    description: "Finish a session on January 1.",
    icon: "🎆",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && monthDay(s.end.day) === "01-01";
    },
  },
  {
    id: "leap-day",
    name: "Leap of Faith",
    description: "Finish a session on February 29.",
    icon: "🐸",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && monthDay(s.end.day) === "02-29";
    },
  },
  {
    id: "friday-13",
    name: "Feeling Lucky",
    description: "Finish a session on a Friday the 13th.",
    icon: "🐈‍⬛",
    category: "secret",
    secret: true,
    earned: (f) => {
      const s = finished(f);
      return s !== undefined && weekdayIndex(s.end.day) === 4 && dayOfMonth(s.end.day) === 13;
    },
  },
  {
    id: "unstoppable",
    name: "Unstoppable",
    description: "Finish 8 sessions in one day.",
    icon: "🚀",
    category: "secret",
    secret: true,
    earned: (f) => (f.today?.sessionsFinished ?? 0) >= 8,
  },
  {
    id: "speedrun",
    name: "Speedrun",
    description: "Finish a goal less than a minute after adding it.",
    icon: "🏎️",
    category: "secret",
    secret: true,
    earned: (f) => f.goal !== undefined && f.goal.secondsOpen < 60,
  },
  {
    id: "jackpot",
    name: "Jackpot",
    description: "Land on exactly 777 XP.",
    icon: "🎰",
    category: "secret",
    secret: true,
    earned: (f) => f.xpTotal === 777,
  },
  {
    id: "over-9000",
    name: "It's Over 9000!",
    description: "Earn more than 9000 XP.",
    icon: "📈",
    category: "secret",
    secret: true,
    earned: (f) => f.xpTotal > 9000,
  },
  {
    id: "phoenix",
    name: "Phoenix",
    description: "Come back after losing a streak of 30 days or more.",
    icon: "🐦‍🔥",
    category: "secret",
    secret: true,
    earned: (f) => (f.streak?.comebackFrom ?? 0) >= 30,
  },
  {
    id: "one-person-army",
    name: "One-Person Army",
    description: "Defeat a weekly boss all by yourself.",
    icon: "🦸",
    category: "secret",
    secret: true,
    earned: (f) => f.boss?.contributors === 1,
  },
  {
    id: "blitz",
    name: "Blitz",
    description: "Defeat the weekly boss on the Monday it appears.",
    icon: "🌩️",
    category: "secret",
    secret: true,
    earned: (f) => f.boss !== undefined && weekdayIndex(f.boss.at.day) === 0,
  },
  {
    id: "buzzer-beater",
    name: "Buzzer Beater",
    description: "Defeat the weekly boss after 8pm on Sunday.",
    icon: "⏰",
    category: "secret",
    secret: true,
    earned: (f) =>
      f.boss !== undefined && weekdayIndex(f.boss.at.day) === 6 && f.boss.at.hour >= 20,
  },
  bossNamed("thesis-defended", "Thesis Defended", "The Thesis Defense", "📜"),
  bossNamed("lich-slayer", "Lich Slayer", "The Last-Minute Lich", "💀"),
  bossNamed("wide-awake", "Wide Awake", "Captain Snooze Button", "☕"),
];

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export function badgeById(id: string): BadgeDefinition | undefined {
  return BY_ID.get(id);
}

/** Badges this build can award, in catalog order. */
export function availableBadges(
  features: ReadonlySet<BadgeFeature> = LIVE_BADGE_FEATURES,
): BadgeDefinition[] {
  return BADGES.filter((b) => b.requires === undefined || features.has(b.requires));
}

/** Ids of the badges these facts newly earn, skipping ones already held. */
export function newlyEarnedBadges(
  facts: BadgeFacts,
  alreadyEarned: ReadonlySet<string>,
  features: ReadonlySet<BadgeFeature> = LIVE_BADGE_FEATURES,
): string[] {
  return availableBadges(features)
    .filter((b) => !alreadyEarned.has(b.id) && b.earned(facts))
    .map((b) => b.id);
}
