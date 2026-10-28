import { describe, expect, it } from "vitest";
import {
  buildCycle,
  customPreset,
  DEFAULT_PRESET,
  planAfkCheck,
  planRoomAfkCheck,
  planSoloAfkCheck,
} from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

const FOCUS = 25 * MINUTE;
const BREAK = 5 * MINUTE;
const ROUND = FOCUS + BREAK;
const WINDOW = 2 * MINUTE;
/** Default 25/5 preset: round n starts at T0 + (n - 1) * 30 minutes. */
const roundStart = (n: number, cycleStart = T0) => cycleStart + (n - 1) * ROUND;
const on = (overrides = {}) => configWith({ afkChecksEnabled: true, ...overrides });

const resultFor = (
  notifier: ReturnType<typeof createHarness>["notifier"],
  userId: string,
  round = 1,
) => notifier.personal.find((p) => p.userId === userId && p.event.round === round)!.event;

describe("planning", () => {
  const phases = buildCycle(T0, DEFAULT_PRESET);

  it("asks once per cycle, in a random round after your first", () => {
    expect(planRoomAfkCheck(phases, T0, () => 0).afkCheckAt).toBe(roundStart(2) + MINUTE);
    expect(planRoomAfkCheck(phases, T0, () => 0.5).afkCheckAt).toBe(
      roundStart(3) + MINUTE + 11 * MINUTE,
    );
    expect(planRoomAfkCheck(phases, T0, () => 1).afkCheckAt).toBe(roundStart(4) + FOCUS - WINDOW);
  });

  it("counts a break-time joiner's first round as the next one", () => {
    const from = roundStart(1) + FOCUS + MINUTE;
    expect(planRoomAfkCheck(phases, from, () => 0).afkCheckAt).toBe(roundStart(3) + MINUTE);
  });

  it("doesn't ask someone who joins in the last round", () => {
    expect(planRoomAfkCheck(phases, roundStart(4) + MINUTE, () => 0).afkCheckAt).toBeNull();
  });

  it("asks during solos of an hour or more, never in the first 25 minutes", () => {
    expect(planSoloAfkCheck(T0, 45, () => 0).afkCheckAt).toBeNull();
    expect(planSoloAfkCheck(T0, 90, () => 0).afkCheckAt).toBe(T0 + 26 * MINUTE);
    expect(planSoloAfkCheck(T0, 90, () => 1).afkCheckAt).toBe(T0 + 90 * MINUTE - WINDOW);
  });

  it("leaves the full window to answer, or skips the check", () => {
    const block = { startsAt: T0, endsAt: T0 + FOCUS };
    expect(planAfkCheck(block, T0 + 23 * MINUTE, () => 0.5).afkCheckAt).toBeNull();
  });
});

describe("AFK check on the room timer", () => {
  it("leaves the first round alone and pushes the prompt later in the cycle", async () => {
    const { engine, notifier, scheduler, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    expect(scheduler.at).toBe(T0 + FOCUS); // the end of round 1, not a check

    await advance(FOCUS);
    expect(resultFor(notifier, "ana", 1)).toMatchObject({ finished: true, afkCheckMissed: false });

    const checkAt = roundStart(2) + MINUTE;
    notifier.statuses = [];
    await advance(checkAt - (T0 + FOCUS));
    expect(notifier.statuses).toEqual([
      { userId: "ana", me: expect.objectContaining({ afkCheckEndsAt: checkAt + WINDOW }) },
    ]);
    await advance(WINDOW);
    expect((await engine.getSnapshot("ana")).me.afkCheckEndsAt).toBe(0);
  });

  it("costs only the round with the missed check: minutes count, combo and streak don't", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    for (const id of ["ana", "ben", "cal"]) await engine.joinRoomTimer(id);
    await advance(roundStart(2) + MINUTE - T0);
    await engine.confirmPresence("ana");
    expect((await engine.confirmPresence("ben")).afkCheckEndsAt).toBe(0);
    await advance(roundStart(4) + FOCUS - (roundStart(2) + MINUTE));

    expect(resultFor(notifier, "cal", 1)).toMatchObject({ finished: true, combo: 1.2 });
    expect(notifier.phases.find((p) => p.round === 2)!.finisherIds).toEqual(["ana", "ben"]);
    expect(resultFor(notifier, "ana", 2)).toMatchObject({ finished: true, combo: 1.1 });
    expect(resultFor(notifier, "cal", 2)).toMatchObject({
      finished: false,
      afkCheckMissed: true,
      focusedMinutes: 25,
      combo: 1,
    });
    // The timer keeps running, and the next rounds count again.
    for (const round of [3, 4]) {
      expect(resultFor(notifier, "cal", round)).toMatchObject({
        finished: true,
        afkCheckMissed: false,
        combo: 1.2,
      });
    }
    // Boss damage in round 2: 25 min x 1.1 for each finisher, plus cal's 25 at 1.0x.
    expect(notifier.phases.find((p) => p.round === 2)!.roomDamageMinutes).toBeCloseTo(
      25 * 1.1 * 2 + 25,
    );
  });

  it("ignores a tap after the window closes", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(roundStart(2) + MINUTE + WINDOW - T0);
    await engine.confirmPresence("ana");
    await advance(FOCUS);
    expect(resultFor(notifier, "ana", 2)).toMatchObject({ finished: false, afkCheckMissed: true });
  });

  it("plans a fresh check for each new cycle", async () => {
    const { engine, store, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    // Join during the long break, then get carried into the next cycle.
    await advance(roundStart(4) + FOCUS + MINUTE - T0);
    const next = roundStart(4) + FOCUS + 15 * MINUTE;
    await engine.joinRoomTimer("ben");
    expect((await store.room.listParticipants()).find((p) => p.userId === "ben")).toMatchObject({
      afkCheckAt: null,
    });
    await advance(next - (roundStart(4) + FOCUS + MINUTE));
    expect(await store.room.listParticipants()).toEqual([
      {
        userId: "ben",
        joinedAt: next,
        afkCheckAt: roundStart(2, next) + MINUTE,
        afkCheckAnswered: false,
      },
    ]);
  });

  it("doesn't ask someone who joins in the last round", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(roundStart(4) - T0);
    await engine.joinRoomTimer("late");
    notifier.statuses = [];
    await advance(FOCUS);
    expect(notifier.statuses.some((s) => s.userId === "late" && s.me.afkCheckEndsAt > 0)).toBe(
      false,
    );
    expect(resultFor(notifier, "late", 4)).toMatchObject({ finished: true, afkCheckMissed: false });
  });

  it("works the same way with short custom rounds", async () => {
    const config = on({ presetKey: "custom", preset: customPreset(15, 5) });
    const { engine, notifier, advance } = createHarness(config, T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(15 * MINUTE + 5 * MINUTE + MINUTE);
    expect((await engine.getSnapshot("ana")).me.afkCheckEndsAt).toBe(T0 + 21 * MINUTE + WINDOW);
    await engine.confirmPresence("ana");
    await advance(14 * MINUTE);
    expect(resultFor(notifier, "ana", 2)).toMatchObject({ finished: true, afkCheckMissed: false });
  });

  it("stops counting a check against anyone once admins turn checks off", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.joinRoomTimer("ana");
    await advance(roundStart(2) + 10 * MINUTE - T0);
    await engine.setConfig(configWith());
    await advance(FOCUS);
    expect(resultFor(notifier, "ana", 2)).toMatchObject({ finished: true, afkCheckMissed: false });
  });
});

describe("AFK check on solo timers", () => {
  it("asks during a long solo and withholds the streak when missed", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.startSolo("priya", 90);
    await advance(26 * MINUTE);
    expect((await engine.getSnapshot("priya")).me.afkCheckEndsAt).toBe(T0 + 26 * MINUTE + WINDOW);
    await advance(64 * MINUTE);
    expect(resultFor(notifier, "priya", 0)).toMatchObject({
      source: "solo",
      finished: false,
      afkCheckMissed: true,
      xpEarned: 180,
      streak: 0,
      finisherIds: [],
    });
  });

  it("counts a long solo as finished once the check is answered", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 1);
    await engine.startSolo("priya", 60);
    await advance(58 * MINUTE);
    await engine.confirmPresence("priya");
    await advance(2 * MINUTE);
    expect(resultFor(notifier, "priya", 0)).toMatchObject({ finished: true, streak: 1 });
  });

  it("doesn't ask during solos under an hour", async () => {
    const { engine, notifier, advance } = createHarness(on(), T0, 0);
    await engine.startSolo("priya", 45);
    await advance(45 * MINUTE);
    expect(resultFor(notifier, "priya", 0)).toMatchObject({
      finished: true,
      afkCheckMissed: false,
    });
  });
});
