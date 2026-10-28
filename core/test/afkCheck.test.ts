import { describe, expect, it } from "vitest";
import { customPreset, planAfkCheck } from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

const FOCUS = 25 * MINUTE;
const BREAK = 5 * MINUTE;
const WINDOW = 2 * MINUTE;
const on = (overrides = {}) => configWith({ afkChecksEnabled: true, ...overrides });

const resultFor = (
  notifier: ReturnType<typeof createHarness>["notifier"],
  userId: string,
  round = 1,
) => notifier.personal.find((p) => p.userId === userId && p.event.round === round)!.event;

describe("planAfkCheck", () => {
  const block = { startsAt: T0, endsAt: T0 + FOCUS, minutes: 25 };

  it("asks somewhere after the first minute, leaving the full window to answer", () => {
    expect(planAfkCheck(block, T0, () => 0).afkCheckAt).toBe(T0 + MINUTE);
    expect(planAfkCheck(block, T0, () => 1).afkCheckAt).toBe(T0 + FOCUS - WINDOW);
  });

  it("skips short blocks and late starts", () => {
    expect(planAfkCheck({ ...block, minutes: 24 }, T0, () => 0.5).afkCheckAt).toBeNull();
    expect(planAfkCheck(block, T0 + 23 * MINUTE, () => 0.5).afkCheckAt).toBeNull();
  });
});

describe("AFK check on the room timer", () => {
  it("opens at a random point in the round and pushes the prompt to that member only", async () => {
    const { engine, notifier, scheduler, advance } = createHarness(on(), T0, 0.5);
    await engine.joinRoomTimer("ana");
    const checkAt = T0 + 12 * MINUTE; // halfway between minute 1 and minute 23
    expect(scheduler.at).toBe(checkAt);
    expect((await engine.getSnapshot("ana")).me.afkCheckEndsAt).toBe(0);

    notifier.statuses = [];
    await advance(12 * MINUTE);
    expect(notifier.statuses).toEqual([
      { userId: "ana", me: expect.objectContaining({ afkCheckEndsAt: checkAt + WINDOW }) },
    ]);

    await advance(WINDOW);
    expect((await engine.getSnapshot("ana")).me.afkCheckEndsAt).toBe(0);
  });

  it("keeps a missed check's minutes but drops its combo and streak credit", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    for (const id of ["ana", "ben", "cal"]) await engine.joinRoomTimer(id);
    await advance(MINUTE);
    await engine.confirmPresence("ana");
    const me = await engine.confirmPresence("ben");
    expect(me.afkCheckEndsAt).toBe(0);
    await advance(FOCUS - MINUTE);

    expect(notifier.phases.at(-1)!.finisherIds).toEqual(["ana", "ben"]);
    expect(resultFor(notifier, "ana")).toMatchObject({
      finished: true,
      afkCheckMissed: false,
      combo: 1.1,
      xpEarned: 55,
      streak: 1,
    });
    expect(resultFor(notifier, "cal")).toMatchObject({
      finished: false,
      afkCheckMissed: true,
      focusedMinutes: 25,
      combo: 1,
      xpEarned: 50,
      streak: 0,
      streakExtended: false,
    });
    // Boss damage: 25 min x 1.1 for each finisher, plus cal's 25 at 1.0x.
    expect(notifier.phases.at(-1)!.roomDamageMinutes).toBeCloseTo(25 * 1.1 * 2 + 25);
  });

  it("ignores a tap after the window closes", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(MINUTE + WINDOW);
    await engine.confirmPresence("ana");
    await advance(FOCUS);
    expect(resultFor(notifier, "ana")).toMatchObject({ finished: false, afkCheckMissed: true });
  });

  it("asks again in every round, including after a break-time join", async () => {
    const { engine, notifier, store, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(MINUTE);
    await engine.confirmPresence("ana");
    await advance(FOCUS + MINUTE);
    await engine.joinRoomTimer("ben"); // during the break

    const round2 = T0 + FOCUS + BREAK;
    const participants = await store.room.listParticipants();
    expect(participants.map((p) => [p.userId, p.afkCheckAt, p.afkCheckAnswered])).toEqual([
      ["ana", round2 + MINUTE, false],
      ["ben", round2 + MINUTE, false],
    ]);

    await advance(round2 + FOCUS - (T0 + FOCUS + 2 * MINUTE));
    expect(resultFor(notifier, "ana", 1).finished).toBe(true);
    expect(resultFor(notifier, "ana", 2)).toMatchObject({ finished: false, afkCheckMissed: true });
    expect(resultFor(notifier, "ben", 2)).toMatchObject({ finished: false, afkCheckMissed: true });
  });

  it("doesn't ask someone who joins too late for a prompt", async () => {
    const { engine, notifier, store, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(23 * MINUTE);
    await engine.joinRoomTimer("late");
    expect((await store.room.listParticipants()).find((p) => p.userId === "late")).toMatchObject({
      afkCheckAt: null,
    });
    await advance(2 * MINUTE);
    expect(resultFor(notifier, "late").afkCheckMissed).toBe(false);
  });

  it("doesn't ask during focus rounds shorter than 25 minutes", async () => {
    const config = on({ presetKey: "custom", preset: customPreset(20, 5) });
    const { engine, notifier, advance } = createHarness(config);
    await engine.joinRoomTimer("ana");
    notifier.statuses = [];
    await advance(20 * MINUTE);
    expect(notifier.statuses.some((s) => s.me.afkCheckEndsAt > 0)).toBe(false);
    expect(resultFor(notifier, "ana")).toMatchObject({ finished: true, afkCheckMissed: false });
  });

  it("stops counting a check against anyone once admins turn checks off", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(10 * MINUTE);
    await engine.setConfig(configWith());
    await advance(FOCUS);
    expect(resultFor(notifier, "ana")).toMatchObject({ finished: true, afkCheckMissed: false });
  });
});

describe("AFK check on solo timers", () => {
  it("asks during a long solo and withholds the streak when missed", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.startSolo("priya", 30);
    await advance(MINUTE);
    expect((await engine.getSnapshot("priya")).me.afkCheckEndsAt).toBe(T0 + MINUTE + WINDOW);
    await advance(30 * MINUTE);
    expect(resultFor(notifier, "priya", 0)).toMatchObject({
      source: "solo",
      finished: false,
      afkCheckMissed: true,
      xpEarned: 60,
      streak: 0,
      finisherIds: [],
    });
  });

  it("counts a solo as finished once the check is answered", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 1);
    await engine.startSolo("priya", 30);
    await advance(28 * MINUTE);
    await engine.confirmPresence("priya");
    await advance(2 * MINUTE);
    expect(resultFor(notifier, "priya", 0)).toMatchObject({ finished: true, streak: 1 });
  });

  it("doesn't ask during short solos", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.startSolo("priya", 20);
    await advance(20 * MINUTE);
    expect(resultFor(notifier, "priya", 0)).toMatchObject({
      finished: true,
      afkCheckMissed: false,
    });
  });
});
