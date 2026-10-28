import type { DailyStatRecord, SessionLogRecord } from "../engine/ports";
import { daysBetween, weekdayIndex, type DayKey } from "../time/calendar";

export type QuestId =
  "goals" | "roomRounds" | "weekendFocus" | "activeDays" | "focusTime" | "soloTimers" | "bigDay";

/** "count" progress shows as "2 / 3"; "minutes" progress shows as time. */
export type QuestUnit = "count" | "minutes";

/** One member's activity in one week, read from daily_stats and session_log. */
export interface QuestActivity {
  days: readonly DailyStatRecord[];
  sessions: readonly SessionLogRecord[];
}

export interface QuestDefinition {
  id: QuestId;
  title: string;
  target: number;
  unit: QuestUnit;
  xp: number;
  measure(activity: QuestActivity): number;
}

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
const finishedSessions = (a: QuestActivity, kind: SessionLogRecord["kind"]) =>
  a.sessions.filter((s) => s.kind === kind && s.finished).length;

/**
 * Every quest is small enough for a new member to finish in a normal week.
 * The order matters: each week takes three neighbours, so neighbours should
 * mix goals, time and showing up.
 */
export const QUEST_POOL: readonly QuestDefinition[] = [
  {
    id: "goals",
    title: "Finish 5 goals",
    target: 5,
    unit: "count",
    xp: 40,
    measure: (a) => sum(a.days.map((d) => d.goalsDone)),
  },
  {
    id: "roomRounds",
    title: "Finish 3 room rounds",
    target: 3,
    unit: "count",
    xp: 40,
    measure: (a) => finishedSessions(a, "room"),
  },
  {
    id: "weekendFocus",
    title: "Focus on a weekend day",
    target: 1,
    unit: "count",
    xp: 30,
    measure: (a) => a.days.filter((d) => weekdayIndex(d.day) >= 5 && d.sessionsFinished > 0).length,
  },
  {
    id: "focusTime",
    title: "Focus for 2 hours",
    target: 120,
    unit: "minutes",
    xp: 40,
    measure: (a) => Math.floor(sum(a.days.map((d) => d.focusMinutes))),
  },
  {
    id: "soloTimers",
    title: "Finish 2 solo timers",
    target: 2,
    unit: "count",
    xp: 30,
    measure: (a) => finishedSessions(a, "solo"),
  },
  {
    id: "activeDays",
    title: "Study on 3 different days",
    target: 3,
    unit: "count",
    xp: 40,
    measure: (a) => a.days.filter((d) => d.sessionsFinished > 0).length,
  },
  {
    id: "bigDay",
    title: "Focus for an hour in one day",
    target: 60,
    unit: "minutes",
    xp: 30,
    measure: (a) => Math.floor(Math.max(0, ...a.days.map((d) => d.focusMinutes))),
  },
];

export const QUESTS_PER_WEEK = 3;

/** A Monday, used to number weeks so the rotation is the same on every server. */
const ROTATION_EPOCH: DayKey = "2024-01-01";

/**
 * This week's quests. Week n takes three neighbouring quests starting at 3n,
 * so with seven quests consecutive weeks share none and every quest comes
 * around within three weeks.
 */
export function questsForWeek(week: DayKey): QuestDefinition[] {
  const n = Math.floor(daysBetween(ROTATION_EPOCH, week) / 7);
  const size = QUEST_POOL.length;
  const start = (((n * QUESTS_PER_WEEK) % size) + size) % size;
  return Array.from({ length: QUESTS_PER_WEEK }, (_, i) => QUEST_POOL[(start + i) % size]!);
}

export interface QuestProgress {
  quest: QuestDefinition;
  /** Never above the target. */
  progress: number;
  done: boolean;
}

export function questProgress(quest: QuestDefinition, activity: QuestActivity): QuestProgress {
  const progress = Math.min(quest.target, Math.max(0, quest.measure(activity)));
  return { quest, progress, done: progress >= quest.target };
}
