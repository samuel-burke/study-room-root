import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMPTY_STREAK, MemoryStore, newBoss, type GoalRecord, type Store } from "@studyroom/core";
import type { Knex } from "knex";
import { KnexStore } from "../src/persistence/knexStore";
import { freshDatabase } from "./sqlite";

/**
 * The same behavioural contract, run against both Store implementations.
 * The browser demo uses MemoryStore and production uses KnexStore, so any
 * difference between them would be a bug that only shows up in one place.
 */
const implementations: [string, () => Promise<{ store: Store; close: () => Promise<void> }>][] = [
  ["MemoryStore", async () => ({ store: new MemoryStore(), close: async () => {} })],
  [
    "KnexStore (SQLite)",
    async () => {
      const db: Knex = await freshDatabase();
      return { store: new KnexStore(db), close: () => db.destroy() };
    },
  ],
];

const goal = (overrides: Partial<GoalRecord>): GoalRecord => ({
  id: "g1",
  userId: "ana",
  text: "Read",
  done: false,
  xpAwarded: false,
  createdAt: 100,
  completedAt: null,
  ...overrides,
});

describe.each(implementations)("%s", (_name, open) => {
  let store: Store;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ store, close } = await open());
  });
  afterEach(async () => {
    await close();
  });

  it("saves and updates members, including nullable fields", async () => {
    await store.members.save({
      userId: "ana",
      xpTotal: 10,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    expect(await store.members.get("ana")).toEqual({
      userId: "ana",
      xpTotal: 10,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    const streak = { streak: 3, lastActiveDay: "2026-10-28", freezeWeeksUsed: ["2026-10-26"] };
    await store.members.save({ userId: "ana", xpTotal: 99, streak, goalsPrivate: true });
    expect(await store.members.get("ana")).toEqual({
      userId: "ana",
      xpTotal: 99,
      streak,
      goalsPrivate: true,
    });
    expect(await store.members.get("nobody")).toBeUndefined();
  });

  it("lists members by id and by recent activity", async () => {
    await store.members.save({
      userId: "a",
      xpTotal: 0,
      streak: { ...EMPTY_STREAK, lastActiveDay: "2026-10-01" },
      goalsPrivate: null,
    });
    await store.members.save({
      userId: "b",
      xpTotal: 0,
      streak: { ...EMPTY_STREAK, lastActiveDay: "2026-10-20" },
      goalsPrivate: null,
    });
    await store.members.save({ userId: "c", xpTotal: 0, streak: EMPTY_STREAK, goalsPrivate: null });
    expect((await store.members.list(["a", "c", "zzz"])).map((m) => m.userId).sort()).toEqual([
      "a",
      "c",
    ]);
    expect((await store.members.listActiveSince("2026-10-15")).map((m) => m.userId)).toEqual(["b"]);
    expect(await store.members.list([])).toEqual([]);
  });

  it("handles goals: open and recently finished, oldest first", async () => {
    await store.goals.insert(goal({ id: "g2", createdAt: 200 }));
    await store.goals.insert(goal({ id: "g1", createdAt: 100 }));
    await store.goals.insert(goal({ id: "old", done: true, completedAt: 50, createdAt: 10 }));
    await store.goals.insert(goal({ id: "new", done: true, completedAt: 500, createdAt: 20 }));
    await store.goals.insert(goal({ id: "other", userId: "kai", createdAt: 5 }));
    expect((await store.goals.listForUser("ana", 400)).map((g) => g.id)).toEqual([
      "new",
      "g1",
      "g2",
    ]);
    expect(await store.goals.countOpen("ana")).toBe(2);
    const first = await store.goals.firstOpen(["ana", "kai", "nobody"]);
    expect(first.get("ana")?.id).toBe("g1");
    expect(first.get("kai")?.id).toBe("other");
    expect(first.has("nobody")).toBe(false);
  });

  it("updates and deletes goals", async () => {
    await store.goals.insert(goal({}));
    await store.goals.update(goal({ done: true, xpAwarded: true, completedAt: 300 }));
    expect(await store.goals.get("g1")).toEqual(
      goal({ done: true, xpAwarded: true, completedAt: 300 }),
    );
    await store.goals.delete("g1");
    expect(await store.goals.get("g1")).toBeUndefined();
  });

  it("upserts solo sessions", async () => {
    const solo = {
      userId: "priya",
      startedAt: 1,
      endsAt: 2,
      minutes: 25,
      phase: "focus" as const,
      breakEndsAt: 3,
    };
    await store.solos.save(solo);
    await store.solos.save({ ...solo, phase: "break" });
    expect(await store.solos.list()).toEqual([{ ...solo, phase: "break" }]);
    await store.solos.delete("priya");
    expect(await store.solos.get("priya")).toBeUndefined();
  });

  it("stores the room cycle and participants", async () => {
    expect(await store.room.getCycle()).toBeUndefined();
    const preset = { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, rounds: 4 };
    await store.room.saveCycle({ cycleStartedAt: 1_793_150_000_000, preset, settledCount: 0 });
    await store.room.saveCycle({ cycleStartedAt: 1_793_150_000_000, preset, settledCount: 3 });
    expect(await store.room.getCycle()).toEqual({
      cycleStartedAt: 1_793_150_000_000,
      preset,
      settledCount: 3,
    });
    await store.room.addParticipant({ userId: "b", joinedAt: 20 });
    await store.room.addParticipant({ userId: "a", joinedAt: 10 });
    await store.room.addParticipant({ userId: "b", joinedAt: 30 });
    expect(await store.room.listParticipants()).toEqual([
      { userId: "a", joinedAt: 10 },
      { userId: "b", joinedAt: 30 },
    ]);
    await store.room.removeParticipant("a");
    await store.room.saveCycle(null);
    expect(await store.room.getCycle()).toBeUndefined();
    expect(await store.room.listParticipants()).toHaveLength(1);
  });

  it("accumulates daily stats and aggregates a community day", async () => {
    await store.stats.add("ana", "2026-10-28", { focusMinutes: 25.5, xp: 51 });
    await store.stats.add("ana", "2026-10-28", {
      focusMinutes: 10,
      goalsDone: 2,
      sessionsFinished: 1,
    });
    await store.stats.add("kai", "2026-10-28", { goalsDone: 1 });
    await store.stats.add("ana", "2026-10-27", { focusMinutes: 5 });
    expect(await store.stats.get("ana", "2026-10-28")).toEqual({
      userId: "ana",
      day: "2026-10-28",
      focusMinutes: 35.5,
      xp: 51,
      goalsDone: 2,
      sessionsFinished: 1,
    });
    expect(
      (await store.stats.listForUser("ana", "2026-10-01", "2026-10-31")).map((s) => s.day),
    ).toEqual(["2026-10-27", "2026-10-28"]);
    expect(await store.stats.communityDay("2026-10-28")).toEqual({
      focusMinutes: 35.5,
      goalsDone: 3,
      activeMembers: 1,
    });
    expect(await store.stats.communityDay("2026-01-01")).toEqual({
      focusMinutes: 0,
      goalsDone: 0,
      activeMembers: 0,
    });
  });

  it("sums a week of focus per member, leaving out hidden members", async () => {
    await store.stats.add("ana", "2026-10-26", { focusMinutes: 30 });
    await store.stats.add("ana", "2026-10-28", { focusMinutes: 15.5 });
    await store.stats.add("kai", "2026-10-27", { focusMinutes: 45.5 });
    await store.stats.add("lena", "2026-10-27", { focusMinutes: 45.5 });
    await store.stats.add("devon", "2026-10-28", { goalsDone: 2 });
    await store.stats.add("ana", "2026-10-25", { focusMinutes: 500 });
    await store.stats.add("priya", "2026-11-02", { focusMinutes: 500 });
    expect(await store.leaderboard.standings("2026-10-26", "2026-11-01")).toEqual([
      { userId: "ana", focusMinutes: 45.5 },
      { userId: "kai", focusMinutes: 45.5 },
      { userId: "lena", focusMinutes: 45.5 },
    ]);

    expect(await store.leaderboard.isHidden("kai")).toBe(false);
    await store.leaderboard.setHidden("kai", true);
    await store.leaderboard.setHidden("kai", true);
    await store.leaderboard.setHidden("ana", true);
    expect(await store.leaderboard.isHidden("kai")).toBe(true);
    expect(await store.leaderboard.listHidden()).toEqual(["ana", "kai"]);
    expect(
      (await store.leaderboard.standings("2026-10-26", "2026-11-01")).map((r) => r.userId),
    ).toEqual(["lena"]);
    await store.leaderboard.setHidden("ana", false);
    await store.leaderboard.setHidden("nobody", false);
    expect(await store.leaderboard.listHidden()).toEqual(["kai"]);
  });

  it("stores bosses and key-values", async () => {
    const boss = {
      ...newBoss("2026-10-26", "Midterms", 100),
      damageMinutes: 12.5,
      contributorIds: ["a"],
    };
    await store.bosses.save(boss);
    await store.bosses.save({ ...boss, defeatedAt: 999 });
    expect(await store.bosses.get("2026-10-26")).toEqual({ ...boss, defeatedAt: 999 });
    await store.kv.set("busy", { armed: false, lastPostedAt: 5 });
    expect(await store.kv.get("busy")).toEqual({ armed: false, lastPostedAt: 5 });
    expect(await store.kv.get("missing")).toBeUndefined();
  });

  it("commits successful transactions and rolls back failed ones", async () => {
    await store.transaction(async (tx) => {
      await tx.kv.set("a", 1);
    });
    await expect(
      store.transaction(async (tx) => {
        await tx.kv.set("b", 2);
        await tx.members.save({
          userId: "x",
          xpTotal: 1,
          streak: EMPTY_STREAK,
          goalsPrivate: null,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await store.kv.get("a")).toBe(1);
    expect(await store.kv.get("b")).toBeUndefined();
    expect(await store.members.get("x")).toBeUndefined();
  });

  it("treats nested transactions as part of the outer one", async () => {
    await expect(
      store.transaction(async (tx) => {
        await tx.transaction(async (inner) => inner.kv.set("nested", true));
        throw new Error("outer fails");
      }),
    ).rejects.toThrow();
    expect(await store.kv.get("nested")).toBeUndefined();
  });

  it("stores goal text safely, whatever it contains", async () => {
    const text = `'); DROP TABLE goals; -- "quotes" and emoji 📚`;
    await store.goals.insert(goal({ text }));
    expect((await store.goals.get("g1"))?.text).toBe(text);
  });

  it("erases one member completely, and only that member", async () => {
    const member = (userId: string) => ({
      userId,
      xpTotal: 5,
      streak: EMPTY_STREAK,
      goalsPrivate: true,
    });
    for (const id of ["ana", "kai"]) {
      await store.members.save(member(id));
      await store.goals.insert(goal({ id: `g-${id}`, userId: id }));
      await store.solos.save({
        userId: id,
        startedAt: 1,
        endsAt: 2,
        minutes: 25,
        phase: "focus",
        breakEndsAt: 3,
      });
      await store.room.addParticipant({ userId: id, joinedAt: 1 });
      await store.leaderboard.setHidden(id, true);
      await store.stats.add(id, "2026-10-28", { focusMinutes: 10, goalsDone: 1 });
      await store.sessions.insert({
        userId: id,
        kind: "solo",
        startedAt: 1,
        endedAt: 2,
        focusedMinutes: 10,
        finished: true,
        xp: 20,
        combo: 1,
      });
    }
    await store.bosses.save({
      ...newBoss("2026-10-26", "Midterms", 100),
      contributorIds: ["ana", "kai", "anabelle"],
    });

    await store.eraseUser("ana");

    expect(await store.members.get("ana")).toBeUndefined();
    expect(await store.goals.get("g-ana")).toBeUndefined();
    expect(await store.solos.get("ana")).toBeUndefined();
    expect((await store.room.listParticipants()).map((p) => p.userId)).toEqual(["kai"]);
    expect(await store.stats.get("ana", "2026-10-28")).toBeUndefined();
    expect(await store.leaderboard.listHidden()).toEqual(["kai"]);
    expect((await store.bosses.get("2026-10-26"))?.contributorIds).toEqual(["kai", "anabelle"]);
    expect(await store.stats.communityDay("2026-10-28")).toEqual({
      focusMinutes: 10,
      goalsDone: 1,
      activeMembers: 1,
    });

    expect(await store.members.get("kai")).toBeDefined();
    expect(await store.goals.get("g-kai")).toBeDefined();
    expect(await store.solos.get("kai")).toBeDefined();
  });

  it("erasing someone with no data is harmless", async () => {
    await expect(store.eraseUser("nobody")).resolves.toBeUndefined();
  });
});
