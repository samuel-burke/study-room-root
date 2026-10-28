import { describe, expect, it } from "vitest";
import {
  addDays,
  QUEST_POOL,
  questProgress,
  questsForWeek,
  type DailyStatRecord,
  type QuestId,
  type SessionLogRecord,
} from "../src";

const quest = (id: QuestId) => QUEST_POOL.find((q) => q.id === id)!;

const day = (d: string, overrides: Partial<DailyStatRecord> = {}): DailyStatRecord => ({
  userId: "ana",
  day: d,
  focusMinutes: 0,
  xp: 0,
  goalsDone: 0,
  sessionsFinished: 0,
  ...overrides,
});

const session = (overrides: Partial<SessionLogRecord> = {}): SessionLogRecord => ({
  userId: "ana",
  kind: "room",
  startedAt: 0,
  endedAt: 1,
  focusedMinutes: 25,
  finished: true,
  xp: 50,
  combo: 1,
  ...overrides,
});

describe("quest rotation", () => {
  it("picks three quests per week, the same everywhere", () => {
    const week = questsForWeek("2026-10-26");
    expect(week.map((q) => q.id)).toEqual(["goals", "roomRounds", "weekendFocus"]);
    expect(questsForWeek("2026-10-26")).toEqual(week);
  });

  it("never repeats a quest in consecutive weeks and covers the pool in three", () => {
    let monday = "2026-01-05";
    for (let i = 0; i < 30; i++) {
      const ids = (w: string) => questsForWeek(w).map((q) => q.id);
      const next = addDays(monday, 7);
      expect(ids(monday).filter((id) => ids(next).includes(id))).toEqual([]);
      const threeWeeks = new Set([...ids(monday), ...ids(next), ...ids(addDays(next, 7))]);
      expect(threeWeeks.size).toBe(QUEST_POOL.length);
      monday = next;
    }
  });

  it("works for weeks before the rotation epoch", () => {
    expect(questsForWeek("2023-12-25")).toHaveLength(3);
  });
});

describe("quest progress", () => {
  it("counts goals finished across the week", () => {
    const days = [day("2026-10-26", { goalsDone: 2 }), day("2026-10-28", { goalsDone: 2 })];
    expect(questProgress(quest("goals"), { days, sessions: [] })).toMatchObject({
      progress: 4,
      done: false,
    });
  });

  it("counts only finished room rounds", () => {
    const sessions = [
      session(),
      session({ finished: false }),
      session({ kind: "solo" }),
      session(),
      session(),
    ];
    expect(questProgress(quest("roomRounds"), { days: [], sessions })).toMatchObject({
      progress: 3,
      done: true,
    });
  });

  it("counts a weekend day only with a finished session", () => {
    const measure = (days: DailyStatRecord[]) =>
      questProgress(quest("weekendFocus"), { days, sessions: [] }).done;
    expect(measure([day("2026-10-30", { sessionsFinished: 2 })])).toBe(false); // Friday
    expect(measure([day("2026-10-31", { focusMinutes: 3 })])).toBe(false); // left early
    expect(measure([day("2026-11-01", { sessionsFinished: 1 })])).toBe(true); // Sunday
  });

  it("measures time in whole minutes and caps progress at the target", () => {
    const days = [
      day("2026-10-26", { focusMinutes: 90.7 }),
      day("2026-10-27", { focusMinutes: 50 }),
    ];
    expect(questProgress(quest("focusTime"), { days, sessions: [] })).toMatchObject({
      progress: 120,
      done: true,
    });
    expect(questProgress(quest("bigDay"), { days, sessions: [] })).toMatchObject({
      progress: 60,
      done: true,
    });
    expect(
      questProgress(quest("bigDay"), {
        days: [day("2026-10-26", { focusMinutes: 59.9 })],
        sessions: [],
      }).progress,
    ).toBe(59);
  });

  it("counts distinct active days and finished solo timers", () => {
    const days = ["2026-10-26", "2026-10-27"].map((d) => day(d, { sessionsFinished: 1 }));
    expect(questProgress(quest("activeDays"), { days, sessions: [] }).progress).toBe(2);
    const sessions = [session({ kind: "solo" }), session({ kind: "solo", finished: false })];
    expect(questProgress(quest("soloTimers"), { days: [], sessions }).progress).toBe(1);
  });

  it("starts at zero for a new member", () => {
    for (const q of QUEST_POOL) {
      expect(questProgress(q, { days: [], sessions: [] })).toMatchObject({
        progress: 0,
        done: false,
      });
    }
  });
});
