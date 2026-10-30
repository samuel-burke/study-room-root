import { describe, expect, it, vi } from "vitest";
import { bossNameFor, DomainError, ErrorCode, LIMITS, PRESETS, type RecapDto } from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

const FOCUS = 25 * MINUTE;
const BREAK = 5 * MINUTE;

async function expectError(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("room timer", () => {
  it("starts a cycle when the first person joins and derives the countdown from server time", async () => {
    const { engine } = createHarness();
    const snap = await engine.joinRoomTimer("ana", { goals: ["Orgo ch. 4 notes"] });
    expect(snap.room.timer).toMatchObject({
      phase: "focus",
      round: 1,
      rounds: 4,
      phaseStartedAt: T0,
      phaseEndsAt: T0 + FOCUS,
    });
    expect(snap.room.serverNow).toBe(T0);
    expect(snap.room.members).toEqual([
      expect.objectContaining({
        userId: "ana",
        status: "roomFocus",
        goalText: "Orgo ch. 4 notes",
        endsAt: T0 + FOCUS,
      }),
    ]);
    expect(snap.me).toMatchObject({ status: "roomFocus", onRoomTimer: true });
  });

  it("puts later joiners on the same shared countdown", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(10 * MINUTE);
    const snap = await engine.joinRoomTimer("marcus");
    expect(snap.room.timer.phaseEndsAt).toBe(T0 + FOCUS);
    expect(snap.room.members.map((m) => m.endsAt)).toEqual([T0 + FOCUS, T0 + FOCUS]);
    expect(snap.room.combo).toBe(1.1);
  });

  it("is idempotent when someone joins twice", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(MINUTE);
    const snap = await engine.joinRoomTimer("ana");
    expect(snap.room.roomParticipantCount).toBe(1);
    expect(snap.room.timer.phaseStartedAt).toBe(T0);
  });

  it("ends the round for everyone at the same moment with shared combo and boss damage", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana", { goals: ["Make 20 flashcards"] });
    await engine.joinRoomTimer("marcus");
    await advance(FOCUS);

    expect(notifier.phases).toHaveLength(1);
    const phase = notifier.phases[0]!;
    expect(phase).toMatchObject({ kind: "focus", round: 1, combo: 1.1 });
    expect(phase.finisherIds.sort()).toEqual(["ana", "marcus"]);
    expect(phase.roomDamageXp).toBe(110); // 2 × 50 base XP × 1.1
    expect(phase.room.timer.phase).toBe("break");

    const ana = notifier.personal.find((p) => p.userId === "ana")!.event;
    expect(ana).toMatchObject({
      source: "room",
      round: 1,
      finished: true,
      baseXp: 50,
      combo: 1.1,
      xpEarned: 55,
      streak: 1,
      streakExtended: true,
      goalPrompt: expect.objectContaining({ text: "Make 20 flashcards" }),
      breakEndsAt: T0 + FOCUS + BREAK,
    });
    expect(ana.me.status).toBe("roomBreak");
    expect(notifier.lastRoom?.boss.damageXp).toBe(110);
  });

  it("doesn't let a last-second joiner count toward the combo or a finished round", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(22 * MINUTE);
    await engine.joinRoomTimer("late");
    await advance(3 * MINUTE);

    expect(notifier.phases[0]!.finisherIds).toEqual(["ana"]);
    expect(notifier.phases[0]!.combo).toBe(1);
    const late = notifier.personal.find((p) => p.userId === "late")!.event;
    expect(late).toMatchObject({ finished: false, xpEarned: 6, streak: 0, streakExtended: false });
  });

  it("credits partial minutes when someone leaves mid-round and goes idle when the room empties", async () => {
    const { engine, store, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(10 * MINUTE);
    const snap = await engine.leaveRoomTimer("ana");

    expect(snap.room.timer.phase).toBe("idle");
    expect(snap.room.members).toEqual([]);
    expect(snap.me).toMatchObject({ status: "idle", xpTotal: 20, streak: 0 });
    expect(store.sessionLog).toEqual([
      expect.objectContaining({
        userId: "ana",
        kind: "room",
        focusedMinutes: 10,
        finished: false,
        xp: 20,
      }),
    ]);
  });

  it("doesn't credit anything for leaving during a break", async () => {
    const { engine, store, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(FOCUS + MINUTE);
    const before = store.sessionLog.length;
    await engine.leaveRoomTimer("ana");
    expect(store.sessionLog.length).toBe(before);
  });

  it("counts a break-time joiner from the next focus round", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(FOCUS + 2 * MINUTE);
    const snap = await engine.joinRoomTimer("kai");
    expect(snap.room.members.find((m) => m.userId === "kai")?.status).toBe("roomBreak");
    await advance(3 * MINUTE + FOCUS);
    const kai = notifier.personal.filter((p) => p.userId === "kai");
    expect(kai).toHaveLength(1);
    expect(kai[0]!.event).toMatchObject({ round: 2, focusedMinutes: 25, finished: true });
  });

  it("releases everyone when the cycle ends, so a timer can't run forever", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance((25 * 4 + 5 * 3 + 15) * MINUTE);
    expect(notifier.phases.map((p) => p.round)).toEqual([1, 2, 3, 4]);
    const snap = await engine.getSnapshot("ana");
    expect(snap.room.timer.phase).toBe("idle");
    expect(snap.me.onRoomTimer).toBe(false);
  });

  it("rolls long-break joiners into a fresh cycle", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance((25 * 4 + 5 * 3 + 2) * MINUTE); // inside the long break
    await engine.joinRoomTimer("theo");
    await advance(13 * MINUTE);
    const snap = await engine.getSnapshot("theo");
    expect(snap.room.timer).toMatchObject({ phase: "focus", round: 1 });
    expect(snap.room.members.map((m) => m.userId)).toEqual(["theo"]);
  });

  it("settles every phase that ended while the server was down", async () => {
    const { engine, clock, notifier } = createHarness();
    await engine.joinRoomTimer("ana");
    clock.advance(3 * 60 * MINUTE); // no wake-ups fired
    const snap = await engine.getSnapshot("ana");
    expect(notifier.phases).toHaveLength(4);
    expect(snap.me.onRoomTimer).toBe(false);
    // 4 rounds × 25 min × 2 XP, plus this week's "Finish 3 room rounds" quest.
    expect(snap.me.xpTotal).toBe(200 + 40);
  });

  it("uses the preset captured when the cycle began", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.setConfig(configWith({ presetKey: "50-10", preset: PRESETS["50-10"] }));
    await advance(MINUTE);
    const snap = await engine.getSnapshot("ana");
    expect(snap.room.timer.phaseEndsAt).toBe(T0 + FOCUS);
    expect(snap.room.features.presetKey).toBe("50-10");
  });

  it("schedules a wake-up for the next phase boundary", async () => {
    const { engine, scheduler } = createHarness();
    expect(scheduler.at).toBeNull();
    await engine.joinRoomTimer("ana");
    expect(scheduler.at).toBe(T0 + FOCUS);
  });
});

describe("solo timer", () => {
  it("shows on the board and finishes with a solo result and a break", async () => {
    const { engine, notifier, advance } = createHarness();
    const snap = await engine.startSolo("priya", 30, { goals: ["Practice set B"] });
    expect(snap.room.members).toEqual([
      expect.objectContaining({ userId: "priya", status: "soloFocus", endsAt: T0 + 30 * MINUTE }),
    ]);
    await advance(30 * MINUTE);
    const result = notifier.personal.find((p) => p.userId === "priya")!.event;
    expect(result).toMatchObject({
      source: "solo",
      combo: 1,
      xpEarned: 60,
      finished: true,
      streak: 1,
    });
    expect((await engine.getSnapshot("priya")).me.status).toBe("soloBreak");
    await advance(BREAK);
    expect((await engine.getSnapshot("priya")).me.status).toBe("idle");
  });

  it("credits minutes so far when ended early", async () => {
    const { engine, advance } = createHarness();
    await engine.startSolo("priya", 60);
    await advance(12 * MINUTE);
    const snap = await engine.endSolo("priya");
    expect(snap.me).toMatchObject({ status: "idle", xpTotal: 24, streak: 0 });
  });

  it("validates the length", async () => {
    const { engine } = createHarness();
    await expectError(engine.startSolo("priya", 2), ErrorCode.Validation);
    await expectError(engine.startSolo("priya", "25"), ErrorCode.Validation);
  });

  it("can't overlap with the room timer", async () => {
    const { engine } = createHarness();
    await engine.joinRoomTimer("ana");
    await expectError(engine.startSolo("ana", 25), ErrorCode.Conflict);
    await engine.startSolo("priya", 25);
    await expectError(engine.joinRoomTimer("priya"), ErrorCode.Conflict);
    await expectError(engine.startSolo("priya", 25), ErrorCode.Conflict);
  });

  it("lets someone on a solo break hop onto the room timer", async () => {
    const { engine, advance } = createHarness();
    await engine.startSolo("priya", 25);
    await advance(26 * MINUTE);
    const snap = await engine.joinRoomTimer("priya");
    expect(snap.me.status).toBe("roomFocus");
    expect(snap.room.members).toHaveLength(1);
  });
});

describe("goals", () => {
  it("shows the oldest open goal on the card, or nothing when private", async () => {
    const { engine } = createHarness();
    await engine.joinRoomTimer("ana", { goals: ["First", "Second"] });
    let snap = await engine.getSnapshot("ana");
    expect(snap.room.members[0]).toMatchObject({ goalText: "First", goalPrivate: false });
    await engine.setGoalsPrivate("ana", true);
    snap = await engine.getSnapshot("ana");
    expect(snap.room.members[0]).toMatchObject({ goalText: "", goalPrivate: true });
    expect(snap.me.goals.map((g) => g.text)).toEqual(["First", "Second"]);
  });

  it("follows the community default until a member chooses", async () => {
    const { engine } = createHarness(configWith({ goalsPublicByDefault: false }));
    const snap = await engine.joinRoomTimer("ana", { goals: ["Secret"] });
    expect(snap.room.members[0]).toMatchObject({ goalText: "", goalPrivate: true });
  });

  it("awards goal XP once, so toggling can't farm it", async () => {
    const { engine } = createHarness();
    const me = await engine.addGoal("ana", "Stats HW 5");
    const id = me.goals[0]!.id;
    expect((await engine.setGoalDone("ana", id, true)).xpTotal).toBe(25);
    await engine.setGoalDone("ana", id, false);
    expect((await engine.setGoalDone("ana", id, true)).xpTotal).toBe(25);
  });

  it("keeps finished goals visible for the rest of the day", async () => {
    const { engine, advance } = createHarness();
    const id = (await engine.addGoal("ana", "Essay intro draft")).goals[0]!.id;
    await engine.setGoalDone("ana", id, true);
    expect((await engine.getSnapshot("ana")).me.goals).toEqual([
      { id, text: "Essay intro draft", done: true },
    ]);
    await advance(24 * 60 * MINUTE);
    expect((await engine.getSnapshot("ana")).me.goals).toEqual([]);
  });

  it("refuses to touch someone else's goal and doesn't reveal that it exists", async () => {
    const { engine } = createHarness();
    const id = (await engine.addGoal("ana", "Mine")).goals[0]!.id;
    await expectError(engine.setGoalDone("mallory", id, true), ErrorCode.NotFound);
    await expectError(engine.deleteGoal("mallory", id), ErrorCode.NotFound);
    await expectError(engine.deleteGoal("ana", "does-not-exist"), ErrorCode.NotFound);
    expect((await engine.getSnapshot("ana")).me.goals).toHaveLength(1);
  });

  it("validates input", async () => {
    const { engine } = createHarness();
    await expectError(engine.addGoal("ana", ""), ErrorCode.Validation);
    await expectError(
      engine.addGoal("ana", "x".repeat(LIMITS.goalTextMaxLength + 1)),
      ErrorCode.Validation,
    );
    await expectError(engine.setGoalDone("ana", "../x", true), ErrorCode.Validation);
    await expectError(engine.setGoalDone("ana", "abc", "yes"), ErrorCode.Validation);
    await expectError(engine.setGoalsPrivate("ana", 1), ErrorCode.Validation);
  });

  it("limits open goals", async () => {
    const { engine } = createHarness();
    for (let i = 0; i < LIMITS.maxOpenGoals; i++) await engine.addGoal("ana", `Goal ${i}`);
    await expectError(engine.addGoal("ana", "One too many"), ErrorCode.Validation);
  });

  it("deletes goals", async () => {
    const { engine } = createHarness();
    const id = (await engine.addGoal("ana", "Oops")).goals[0]!.id;
    expect((await engine.deleteGoal("ana", id)).goals).toEqual([]);
  });
});

describe("XP rules", () => {
  it("caps XP per day and resets the next day", async () => {
    const { engine, advance } = createHarness(configWith({ xp: { enabled: true, dailyCap: 100 } }));
    await engine.startSolo("ana", 60);
    await advance(60 * MINUTE);
    let me = (await engine.getSnapshot("ana")).me;
    expect(me.xpTotal).toBe(100);
    expect(me.xpToday).toBe(100);
    await advance(24 * 60 * MINUTE);
    await engine.startSolo("ana", 10);
    await advance(10 * MINUTE);
    me = (await engine.getSnapshot("ana")).me;
    expect(me.xpTotal).toBe(120);
  });

  it("awards nothing when XP is off, but still tracks streaks", async () => {
    const { engine, advance } = createHarness(
      configWith({ xp: { enabled: false, dailyCap: 300 } }),
    );
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    const me = (await engine.getSnapshot("ana")).me;
    expect(me.xpTotal).toBe(0);
    expect(me.streak).toBe(1);
  });
});

describe("weekly boss", () => {
  it("is defeated by XP earned, pays out loot scaled by strength and posts once", async () => {
    // "Quiz" is a 0.75x boss: 200 base HP becomes 150, and loot is 75 XP.
    const config = configWith({ boss: { enabled: true, name: "Quiz", baseHpXp: 200 } });
    const { engine, announcer, advance } = createHarness(config);
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("kai");
    await advance(FOCUS); // 2 × 55 XP = 110 damage
    const before = (await engine.getSnapshot("ana")).room.boss;
    expect(before).toMatchObject({ defeated: false, damageXp: 110, maxHpXp: 150 });
    expect(before).toMatchObject({ strength: 0.75, lootXp: 75 });
    await advance(BREAK + FOCUS);
    const snap = await engine.getSnapshot("ana");
    expect(snap.room.boss).toMatchObject({ defeated: true, damageXp: 150, maxHpXp: 150 });
    // 55 XP per round + 75 loot.
    expect(snap.me.xpTotal).toBe(55 + 55 + 75);
    expect(announcer.posts.filter((p) => p.kind === "boss")).toEqual([
      {
        kind: "boss",
        channelId: "channel-1",
        detail: { bossName: "Quiz", contributorCount: 2, lootXp: 75 },
      },
    ]);
  });

  it("takes the XP a session earns before the daily cap", async () => {
    const { engine, advance } = createHarness(configWith({ xp: { enabled: true, dailyCap: 20 } }));
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    const snap = await engine.getSnapshot("ana");
    expect(snap.me.xpToday).toBe(20);
    expect(snap.room.boss.damageXp).toBe(50);
  });

  it("still takes damage with XP turned off, but drops no loot", async () => {
    const { engine, advance } = createHarness(
      configWith({ xp: { enabled: false, dailyCap: 300 } }),
    );
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    const boss = (await engine.getSnapshot("ana")).room.boss;
    expect(boss.damageXp).toBe(50);
    expect(boss.lootXp).toBe(0);
  });

  it("can be renamed and resized live by admins, with strength from the name", async () => {
    const { engine } = createHarness();
    await engine.setConfig(configWith({ boss: { enabled: true, name: "Finals", baseHpXp: 1000 } }));
    const snap = await engine.getSnapshot("ana");
    expect(snap.room.boss).toMatchObject({
      name: "Finals",
      maxHpXp: 2000,
      strength: 2,
      lootXp: 200,
      enabled: true,
    });
  });

  it("takes no damage when turned off", async () => {
    const { engine, advance } = createHarness(
      configWith({ boss: { enabled: false, name: "x", baseHpXp: 100 } }),
    );
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    expect((await engine.getSnapshot("ana")).room.boss.enabled).toBe(false);
  });
});

describe("channel posts", () => {
  const busyConfig = configWith({ busyPosts: { enabled: true, threshold: 3 } });

  it("posts once when the room gets busy, then waits for the cool-down", async () => {
    const { engine, announcer, advance } = createHarness(busyConfig);
    await engine.joinRoomTimer("a");
    await engine.joinRoomTimer("b");
    expect(announcer.posts).toEqual([]);
    await engine.startSolo("c", 25);
    await engine.joinRoomTimer("d");
    await engine.idle();
    expect(announcer.posts).toEqual([
      { kind: "busy", channelId: "channel-1", detail: { focusingCount: 3, combo: 1.1 } },
    ]);
    // Drop below the threshold and come back quickly: still quiet.
    await engine.leaveRoomTimer("a");
    await engine.leaveRoomTimer("b");
    await engine.joinRoomTimer("a");
    await engine.joinRoomTimer("b");
    await engine.idle();
    expect(announcer.posts.filter((p) => p.kind === "busy")).toHaveLength(1);
    // After the cool-down it can post again.
    await advance(3 * 60 * MINUTE);
    for (const id of ["a", "b", "c", "d", "e"]) await engine.joinRoomTimer(id);
    await engine.idle();
    expect(announcer.posts.filter((p) => p.kind === "busy")).toHaveLength(2);
  });

  it("stays quiet without a post channel", async () => {
    const { engine, announcer } = createHarness({ ...busyConfig, postChannelId: null });
    for (const id of ["a", "b", "c"]) await engine.joinRoomTimer(id);
    await engine.idle();
    expect(announcer.posts).toEqual([]);
  });

  describe("study and break callouts", () => {
    const callouts = (posts: { kind: string; detail: unknown }[]) =>
      posts.filter((p) => p.kind === "callout").map((p) => p.detail);

    it("mentions everyone in the room each time the clock switches, rotating the lines", async () => {
      const { engine, announcer, advance } = createHarness();
      await engine.joinRoomTimer("ana");
      await engine.joinRoomTimer("kai");
      expect(callouts(announcer.posts)).toEqual([]);
      await advance(FOCUS);
      await advance(BREAK);
      await advance(FOCUS);
      expect(announcer.posts.filter((p) => p.kind === "callout")[0]?.channelId).toBe("channel-1");
      expect(callouts(announcer.posts)).toEqual([
        { kind: "break", userIds: ["ana", "kai"], line: 0 },
        { kind: "focus", userIds: ["ana", "kai"], line: 0 },
        { kind: "break", userIds: ["ana", "kai"], line: 1 },
      ]);
    });

    it("calls the long break, then only those who kept going into the next cycle", async () => {
      const { engine, announcer, advance } = createHarness();
      await engine.joinRoomTimer("ana");
      await engine.joinRoomTimer("kai");
      await advance(115 * MINUTE);
      expect(callouts(announcer.posts).at(-1)).toEqual({
        kind: "longBreak",
        userIds: ["ana", "kai"],
        line: 0,
      });
      await engine.keepGoing("ana");
      await advance(15 * MINUTE);
      expect(callouts(announcer.posts).at(-1)).toEqual({
        kind: "focus",
        userIds: ["ana"],
        line: 3,
      });
    });

    it("says nothing when the cycle ends with nobody carrying on", async () => {
      const { engine, announcer, advance } = createHarness();
      await engine.joinRoomTimer("ana");
      await advance(130 * MINUTE);
      expect(callouts(announcer.posts).map((c) => (c as { kind: string }).kind)).toEqual([
        "break",
        "focus",
        "break",
        "focus",
        "break",
        "focus",
        "longBreak",
      ]);
    });

    it("skips a switch that is old news after downtime", async () => {
      const { engine, announcer, clock } = createHarness();
      await engine.joinRoomTimer("ana");
      clock.current = T0 + FOCUS + 3 * MINUTE;
      await engine.tick();
      await engine.idle();
      expect(callouts(announcer.posts)).toEqual([]);
      clock.current = T0 + FOCUS + BREAK + MINUTE;
      await engine.tick();
      await engine.idle();
      expect(callouts(announcer.posts)).toEqual([{ kind: "focus", userIds: ["ana"], line: 0 }]);
    });

    it("stays quiet when turned off or without a post channel", async () => {
      for (const config of [
        configWith({ phaseCalloutsEnabled: false }),
        configWith({ postChannelId: null }),
      ]) {
        const { engine, announcer, advance } = createHarness(config);
        await engine.joinRoomTimer("ana");
        await advance(FOCUS + BREAK);
        expect(callouts(announcer.posts)).toEqual([]);
      }
    });
  });

  it("posts a streak milestone on day 7", async () => {
    const { engine, announcer, advance } = createHarness();
    for (let day = 0; day < 7; day++) {
      await engine.startSolo("ana", 10);
      await advance(10 * MINUTE);
      await advance(24 * 60 * MINUTE - 10 * MINUTE);
    }
    expect(announcer.posts.filter((p) => p.kind === "milestone")).toEqual([
      { kind: "milestone", channelId: "channel-1", detail: { userId: "ana", streak: 7 } },
    ]);
  });

  it("posts the daily recap once, and skips quiet days", async () => {
    const { engine, announcer, advance } = createHarness();
    expect(await engine.postDailyRecap()).toBe(false);
    await engine.startSolo("ana", 30, { goals: ["Read"] });
    await advance(30 * MINUTE);
    const goalId = (await engine.getSnapshot("ana")).me.goals[0]!.id;
    await engine.setGoalDone("ana", goalId, true);
    expect(await engine.postDailyRecap()).toBe(true);
    expect(await engine.postDailyRecap()).toBe(false);
    await engine.idle();
    const recap = announcer.posts.find((p) => p.kind === "recap")!.detail;
    expect(recap).toMatchObject({
      weekday: "Wednesday",
      focusMinutes: 30,
      goalsDone: 1,
      activeMembers: 1,
      topStreaks: [{ userId: "ana", streak: 1 }],
      boss: expect.objectContaining({ name: bossNameFor("2026-10-26", ""), daysLeft: 5 }),
    });
  });

  it("doesn't post a recap when recaps are off", async () => {
    const { engine, advance } = createHarness(
      configWith({ recap: { enabled: false, hours: 21, minutes: 0 } }),
    );
    await engine.startSolo("ana", 10);
    await advance(10 * MINUTE);
    expect(await engine.postDailyRecap()).toBe(false);
  });

  it("logs post failures without breaking the operation", async () => {
    const harness = createHarness(busyConfig);
    harness.announcer.busyRoom = async () => {
      throw new Error("Root is down");
    };
    for (const id of ["a", "b", "c"]) await harness.engine.joinRoomTimer(id);
    await expect(harness.engine.idle()).resolves.toBeUndefined();
  });
});

describe("failed wake-ups", () => {
  it("retries a tick that failed instead of letting the timer stall", async () => {
    const { engine, store, scheduler, clock, advance, notifier } = createHarness();
    await engine.joinRoomTimer("ana");
    const original = store.transaction.bind(store);
    const spy = vi
      .spyOn(store, "transaction")
      .mockImplementationOnce(() => Promise.reject(new Error("database is locked")))
      .mockImplementation(original);
    const phases = notifier.phases.length;
    await advance(FOCUS);
    // The tick at the end of focus failed, so a retry is queued 30s later.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(scheduler.at).toBe(clock.current + 30_000);
    await advance(30_000);
    expect(notifier.phases.length).toBe(phases + 1);
    expect((await engine.getSnapshot("ana")).room.timer.phase).toBe("break");
  });

  it("doesn't retry a tick that fails after the engine is stopped", async () => {
    const { engine, store, scheduler, clock } = createHarness();
    await engine.joinRoomTimer("ana");
    let fail: (error: Error) => void = () => undefined;
    vi.spyOn(store, "transaction").mockImplementation(
      () => new Promise((_resolve, reject) => (fail = reject)),
    );
    clock.advance(FOCUS);
    scheduler.fireIfDue(clock.current); // the tick is now in flight
    await vi.waitFor(() => expect(store.transaction).toHaveBeenCalled());
    engine.stop();
    fail(new Error("database closed"));
    await engine.idle();
    expect(scheduler.at).toBeNull();
  });
});

describe("presence and notifications", () => {
  it("counts people with the app open plus anyone with a session", async () => {
    const { engine } = createHarness();
    await engine.setPresence(["ana", "marcus"]);
    await engine.startSolo("priya", 25);
    expect((await engine.getSnapshot("ana")).room.presentCount).toBe(3);
    await engine.userDetached("marcus");
    await engine.userAttached("priya");
    expect((await engine.getSnapshot("ana")).room.presentCount).toBe(2);
  });

  it("shows who is in the voice channel, and nothing when none is picked", async () => {
    const voiceConfig = configWith({
      voiceChannelId: "voice-1",
      voiceChannelName: "Study voice",
      voiceChannelUrl: "https://rootapp.com/voice-1",
    });
    const { engine, notifier } = createHarness(voiceConfig);
    await engine.setVoiceMembers(["ana", "kai"]);
    expect(notifier.lastRoom?.voice).toEqual({
      channelName: "Study voice",
      joinUrl: "https://rootapp.com/voice-1",
      userIds: ["ana", "kai"],
    });
    await engine.setConfig(configWith());
    expect((await engine.getSnapshot("ana")).room.voice).toEqual({
      channelName: "",
      joinUrl: "",
      userIds: [],
    });
  });

  it("pushes the room to everyone and status to the member after a change", async () => {
    const { engine, notifier } = createHarness();
    await engine.joinRoomTimer("ana");
    expect(notifier.lastRoom?.members).toHaveLength(1);
    expect(notifier.statuses.at(-1)).toMatchObject({ userId: "ana", me: { status: "roomFocus" } });
  });

  it("rolls back and stays silent when an operation fails halfway", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.startSolo("ana", 25);
    await advance(26 * MINUTE); // solo break
    for (let i = 0; i < LIMITS.maxOpenGoals; i++) await engine.addGoal("ana", `Goal ${i}`);
    const rooms = notifier.rooms.length;
    // Joining deletes the solo break, then fails on the goal limit. Nothing should stick.
    await expectError(engine.joinRoomTimer("ana", { goals: ["extra"] }), ErrorCode.Validation);
    expect(notifier.rooms.length).toBe(rooms);
    expect((await engine.getSnapshot("ana")).me.status).toBe("soloBreak");
  });
});

describe("progress", () => {
  it("returns a 35-day window ending today", async () => {
    const { engine, advance } = createHarness();
    await engine.startSolo("ana", 45);
    await advance(45 * MINUTE);
    const progress = await engine.getProgress("ana");
    expect(progress.days).toHaveLength(35);
    expect(progress.days.at(-1)).toEqual({ day: "2026-10-28", focusMinutes: 45 });
    expect(progress.totalFocusMinutes).toBe(45);
    expect(progress.me.streak).toBe(1);
  });
});

describe("weekly quests", () => {
  // T0's week (Monday 2026-10-26) rotates in: goals, room rounds, weekend focus.
  const questIds = (quests: { id: string }[]) => quests.map((q) => q.id);

  it("shows this week's three quests with progress", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana", { goals: ["One", "Two"] });
    const goals = (await engine.getSnapshot("ana")).me.goals;
    await engine.setGoalDone("ana", goals[0]!.id, true);
    await advance(FOCUS);
    const { quests } = await engine.getProgress("ana");
    expect(questIds(quests)).toEqual(["goals", "roomRounds", "weekendFocus"]);
    expect(quests).toEqual([
      expect.objectContaining({ progress: 1, target: 5, xp: 40, done: false }),
      expect.objectContaining({ progress: 1, target: 3, unit: "count", done: false }),
      expect.objectContaining({ progress: 0, target: 1, done: false }),
    ]);
  });

  it("pays a finished quest once, outside the daily cap", async () => {
    const { engine } = createHarness(configWith({ xp: { enabled: true, dailyCap: 50 } }));
    for (let i = 0; i < 6; i++) await engine.addGoal("ana", `Goal ${i}`);
    const goals = (await engine.getSnapshot("ana")).me.goals;
    for (const goal of goals.slice(0, 5)) await engine.setGoalDone("ana", goal.id, true);
    // Two goals fill the 50 XP cap; the quest adds 40 on top.
    expect((await engine.getSnapshot("ana")).me.xpTotal).toBe(50 + 40);
    await engine.setGoalDone("ana", goals[5]!.id, true);
    await engine.setGoalDone("ana", goals[0]!.id, false);
    await engine.setGoalDone("ana", goals[0]!.id, true);
    expect((await engine.getSnapshot("ana")).me.xpTotal).toBe(90);
    const goalsQuest = (await engine.getProgress("ana")).quests[0]!;
    expect(goalsQuest).toMatchObject({ id: "goals", progress: 5, done: true });
  });

  it("counts a weekend day and resets on Monday", async () => {
    const saturday = Date.UTC(2026, 9, 31, 14, 0, 0);
    const { engine, advance } = createHarness(configWith(), saturday);
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    let progress = await engine.getProgress("ana");
    expect(progress.quests[2]).toMatchObject({ id: "weekendFocus", done: true });
    expect(progress.me.xpTotal).toBe(50 + 30);

    await advance(2 * 24 * 60 * MINUTE);
    progress = await engine.getProgress("ana");
    expect(questIds(progress.quests)).toEqual(["focusTime", "soloTimers", "activeDays"]);
    expect(progress.quests.every((q) => q.progress === 0 && !q.done)).toBe(true);
  });

  it("earns the quest badges", async () => {
    const { engine } = createHarness();
    for (let i = 0; i < 5; i++) await engine.addGoal("ana", `Goal ${i}`);
    for (const goal of (await engine.getSnapshot("ana")).me.goals)
      await engine.setGoalDone("ana", goal.id, true);
    const badges = (await engine.getProgress("ana")).badges.map((b) => b.id);
    expect(badges).toContain("quest-first");
    expect(badges).not.toContain("quest-sweep");
  });

  it("shows no reward and pays none when XP is off", async () => {
    const { engine } = createHarness(configWith({ xp: { enabled: false, dailyCap: 300 } }));
    for (let i = 0; i < 5; i++) await engine.addGoal("ana", `Goal ${i}`);
    for (const goal of (await engine.getSnapshot("ana")).me.goals)
      await engine.setGoalDone("ana", goal.id, true);
    const progress = await engine.getProgress("ana");
    expect(progress.quests[0]).toMatchObject({ done: true, xp: 0 });
    expect(progress.me.xpTotal).toBe(0);
  });
});

describe("deleting my data", () => {
  it("erases the member everywhere and leaves everyone else alone", async () => {
    const { engine, store, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana", { goals: ["Mine"] });
    await engine.joinRoomTimer("kai", { goals: ["Kai's"] });
    await advance(FOCUS + BREAK + 3 * MINUTE);

    const me = await engine.deleteMyData("ana");
    expect(me).toMatchObject({
      status: "idle",
      onRoomTimer: false,
      xpTotal: 0,
      streak: 0,
      goals: [],
    });
    expect(store.sessionLog.some((s) => s.userId === "ana")).toBe(false);
    expect((await engine.getProgress("ana")).totalFocusMinutes).toBe(0);
    expect(notifier.lastRoom?.members.map((m) => m.userId)).toEqual(["kai"]);

    const kai = await engine.getSnapshot("kai");
    expect(kai.me.xpTotal).toBeGreaterThan(0);
    expect(kai.me.goals.map((g) => g.text)).toEqual(["Kai's"]);
    expect(kai.room.timer.phase).toBe("focus");
  });

  it("stops the room timer if they were the last one on it", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(5 * MINUTE);
    await engine.deleteMyData("ana");
    expect((await engine.getSnapshot("ana")).room.timer.phase).toBe("idle");
  });

  it("removes them from the boss's contributors so loot can't reach them", async () => {
    const { engine, store, advance } = createHarness();
    await engine.startSolo("ana", 25);
    await advance(5 * MINUTE);
    await engine.endSolo("ana");
    expect((await store.bosses.get("2026-10-26"))?.contributorIds).toContain("ana");
    await engine.deleteMyData("ana");
    expect((await store.bosses.get("2026-10-26"))?.contributorIds).toEqual([]);
  });

  it("ends a solo timer without crediting it", async () => {
    const { engine, store, advance } = createHarness();
    await engine.startSolo("ana", 60);
    await advance(10 * MINUTE);
    await engine.deleteMyData("ana");
    expect(store.sessionLog).toEqual([]);
    expect((await engine.getSnapshot("ana")).room.members).toEqual([]);
  });
});

describe("weekly leaderboard", () => {
  it("ranks this week's focus minutes, sharing ranks on ties", async () => {
    const { engine, store, advance } = createHarness();
    await store.stats.add("ana", "2026-10-26", { focusMinutes: 40.9 });
    await store.stats.add("kai", "2026-10-27", { focusMinutes: 70 });
    await store.stats.add("lena", "2026-10-27", { focusMinutes: 70.4 });
    // Last week and goal-only days don't count.
    await store.stats.add("priya", "2026-10-25", { focusMinutes: 900 });
    await store.stats.add("devon", "2026-10-28", { goalsDone: 5 });
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);

    const board = await engine.getLeaderboard("ana");
    expect(board.weekStart).toBe("2026-10-26");
    // Monday 2026-11-02 00:00 in New York (UTC-5 after DST ends).
    expect(board.endsAt).toBe(Date.UTC(2026, 10, 2, 5, 0, 0));
    expect(board.entries).toEqual([
      { userId: "ana", focusMinutes: 70, rank: 1 },
      { userId: "kai", focusMinutes: 70, rank: 1 },
      { userId: "lena", focusMinutes: 70, rank: 1 },
    ]);
    expect(board.me).toEqual({ rank: 1, focusMinutes: 70, hidden: false });

    await store.stats.add("kai", "2026-10-28", { focusMinutes: 1 });
    expect((await engine.getLeaderboard("ana")).entries.map((e) => [e.userId, e.rank])).toEqual([
      ["kai", 1],
      ["ana", 2],
      ["lena", 2],
    ]);
  });

  it("shows only the top entries, but always tells you your own rank", async () => {
    const { engine, store } = createHarness();
    for (let i = 0; i < LIMITS.leaderboardSize + 2; i++) {
      await store.stats.add(`m${String(i).padStart(2, "0")}`, "2026-10-27", {
        focusMinutes: 100 - i,
      });
    }
    const board = await engine.getLeaderboard("m11");
    expect(board.entries).toHaveLength(LIMITS.leaderboardSize);
    expect(board.me).toEqual({ rank: 12, focusMinutes: 89, hidden: false });
    expect((await engine.getLeaderboard("newcomer")).me).toEqual({
      rank: 0,
      focusMinutes: 0,
      hidden: false,
    });
  });

  it("lets members hide themselves, and back", async () => {
    const { engine, store } = createHarness();
    await store.stats.add("ana", "2026-10-27", { focusMinutes: 50 });
    await store.stats.add("kai", "2026-10-27", { focusMinutes: 20 });

    const hidden = await engine.setLeaderboardHidden("ana", true);
    expect(hidden.entries).toEqual([{ userId: "kai", focusMinutes: 20, rank: 1 }]);
    expect(hidden.me).toEqual({ rank: 0, focusMinutes: 50, hidden: true });
    expect((await engine.getLeaderboard("kai")).entries.map((e) => e.userId)).toEqual(["kai"]);

    const shown = await engine.setLeaderboardHidden("ana", false);
    expect(shown.entries.map((e) => e.userId)).toEqual(["ana", "kai"]);
    await expectError(engine.setLeaderboardHidden("ana", "yes"), ErrorCode.Validation);
  });

  it("starts over on Monday in the community time zone", async () => {
    // Sunday 2026-11-01 23:30 in New York.
    const { engine, store, clock } = createHarness(configWith(), Date.UTC(2026, 10, 2, 4, 30));
    await store.stats.add("ana", "2026-11-01", { focusMinutes: 60 });
    expect((await engine.getLeaderboard("ana")).entries).toHaveLength(1);
    clock.advance(31 * MINUTE);
    const board = await engine.getLeaderboard("ana");
    expect(board.weekStart).toBe("2026-11-02");
    expect(board.entries).toEqual([]);
  });

  it("puts the top 3 in the daily recap, without anyone who opted out", async () => {
    const { engine, store, announcer, advance } = createHarness();
    for (const [userId, minutes] of [
      ["ana", 90],
      ["kai", 80],
      ["lena", 70],
      ["jordan", 60],
    ] as const) {
      await store.stats.add(userId, "2026-10-27", { focusMinutes: minutes });
    }
    await engine.setLeaderboardHidden("kai", true);
    await engine.startSolo("kai", 30);
    await advance(30 * MINUTE);
    await engine.postDailyRecap();
    await engine.idle();
    const recap = announcer.posts.find((p) => p.kind === "recap")!.detail as RecapDto;
    expect(recap.topFocus).toEqual([
      { userId: "ana", focusMinutes: 90 },
      { userId: "lena", focusMinutes: 70 },
      { userId: "jordan", focusMinutes: 60 },
    ]);
    expect(recap.topStreaks).toEqual([]);
  });

  it("leaves the leaderboard out of the recap when the admin turns it off", async () => {
    const { engine } = createHarness(configWith({ recapLeaderboardEnabled: false }));
    await engine.startSolo("ana", 30);
    expect((await engine.buildRecap(T0 + 30 * MINUTE)).topFocus).toEqual([]);
  });

  it("forgets the opt-out when a member deletes their data", async () => {
    const { engine } = createHarness();
    await engine.setLeaderboardHidden("ana", true);
    await engine.deleteMyData("ana");
    expect((await engine.getLeaderboard("ana")).me.hidden).toBe(false);
  });
});
