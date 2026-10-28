/** Game tuning. Kept in one place so DESIGN.md and the code can't drift apart silently. */
export const GAME = {
  /** XP earned per focused minute, before the combo multiplier. */
  xpPerFocusMinute: 2,
  /** XP for finishing a goal. Awarded once per goal. */
  xpPerGoal: 25,
  /** Bonus XP each contributor gets when the weekly boss is defeated. Not capped. */
  bossLootXp: 50,
  /** Combo grows by this much per extra person who finishes a room round. */
  comboStep: 0.1,
  comboMax: 2,
  /** Minimum focused minutes in a room round to count as "finished together". */
  minRoundMinutesToFinish: 5,
  /** Streak lengths that trigger a channel post. */
  streakMilestones: [7, 30, 50, 100, 200, 365] as readonly number[],
} as const;

export const LIMITS = {
  goalTextMaxLength: 140,
  maxOpenGoals: 8,
  maxGoalsPerStart: 3,
  soloMinMinutes: 5,
  soloMaxMinutes: 180,
  displayNameMaxLength: 32,
  progressWindowDays: 35,
  topStreaksInRecap: 3,
  /** Rows on the weekly leaderboard. */
  leaderboardSize: 10,
  topFocusInRecap: 3,
} as const;

/** "Room is busy" posts re-arm only after this cool-down. */
export const BUSY_POST_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export const MINUTE_MS = 60_000;
