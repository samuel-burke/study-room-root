import { describe, expect, it } from "vitest";
import { DomainError, ErrorCode, EMPTY_STREAK, DEFAULT_CONFIG, addDays } from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

const FOCUS = 25 * MINUTE;
/** Wednesday 2026-10-28 07:00 in New York. */
const SEVEN_AM = Date.UTC(2026, 9, 28, 11, 0, 0);
/** XP that puts a member at the start of level 8. */
const LEVEL_8_XP = 2450;

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

describe("earning badges", () => {
  it("awards first-round badges when a room round ends, pushes them once, and shows them on the card", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("marcus");
    await advance(FOCUS);

    expect(notifier.badgesFor("ana")).toEqual(["first-session", "squad-up"]);
    expect(notifier.badges.filter((b) => b.userId === "ana")).toHaveLength(1);
    const progress = await engine.getProgress("ana");
    expect(progress.badges).toEqual([
      { id: "first-session", earnedAt: T0 + FOCUS },
      { id: "squad-up", earnedAt: T0 + FOCUS },
    ]);
    const card = notifier.lastRoom!.members.find((m) => m.userId === "ana")!;
    expect(card.badges).toEqual(["squad-up", "first-session"]);
    expect(card.cardStyle).toBe("classic");

    // The next round earns nothing new, so nothing is pushed.
    const pushes = notifier.badges.length;
    await advance(5 * MINUTE + FOCUS);
    expect(notifier.badges.length).toBe(pushes);
  });

  it("gives Early Bird for a solo timer started before 8am", async () => {
    const { engine, notifier, advance } = createHarness(configWith(), SEVEN_AM);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expect(notifier.badgesFor("ana")).toEqual(["first-session", "early-bird"]);
  });

  it("gives nothing for a session cut short, apart from time already banked", async () => {
    const { engine, notifier, advance } = createHarness(configWith(), SEVEN_AM);
    await engine.startSolo("ana", 30);
    await advance(10 * MINUTE);
    await engine.endSolo("ana");
    expect(notifier.badgesFor("ana")).toEqual([]);
  });

  it("gives Marathon for a fourth finished session in a day", async () => {
    const { engine, notifier, advance } = createHarness();
    for (let i = 0; i < 4; i++) {
      await engine.startSolo("ana", 5);
      await advance(5 * MINUTE);
      await engine.endSolo("ana");
    }
    expect(notifier.badgesFor("ana")).toContain("marathon");
  });

  it("gives Speedrun and Checked Off for a goal finished right after adding it", async () => {
    const { engine, notifier, advance } = createHarness();
    const me = await engine.addGoal("ana", "Answer one email");
    await advance(30_000);
    await engine.setGoalDone("ana", me.goals[0]!.id, true);
    expect(notifier.badgesFor("ana")).toEqual(["first-goal", "speedrun"]);
    // Unchecking and checking again can't earn anything new.
    await engine.setGoalDone("ana", me.goals[0]!.id, false);
    await engine.setGoalDone("ana", me.goals[0]!.id, true);
    expect(notifier.badgesFor("ana")).toEqual(["first-goal", "speedrun"]);
  });

  it("gives boss badges to everyone who helped, and Final Blow to whoever finished it", async () => {
    const config = configWith({ boss: { ...DEFAULT_CONFIG.boss, hpHours: 1 } });
    const { engine, notifier, advance } = createHarness(config);
    await engine.startSolo("kai", 30);
    await advance(30 * MINUTE);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);

    expect(notifier.badgesFor("ana")).toEqual(expect.arrayContaining(["first-boss", "final-blow"]));
    expect(notifier.badgesFor("kai")).toContain("first-boss");
    expect(notifier.badgesFor("kai")).not.toContain("final-blow");
    expect(notifier.badgesFor("ana")).not.toContain("one-person-army");
  });

  it("gives One-Person Army for a boss defeated alone", async () => {
    const config = configWith({ boss: { ...DEFAULT_CONFIG.boss, hpHours: 0.5 } });
    const { engine, notifier, advance } = createHarness(config);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expect(notifier.badgesFor("ana")).toEqual(
      expect.arrayContaining(["first-boss", "final-blow", "one-person-army"]),
    );
  });

  it("gives Comeback to someone whose streak broke and who came back", async () => {
    const config = configWith({ streakFreezesEnabled: false });
    const { engine, notifier, store, advance } = createHarness(config);
    await store.members.save({
      userId: "ana",
      xpTotal: 0,
      streak: { ...EMPTY_STREAK, streak: 6, lastActiveDay: addDays("2026-10-28", -4) },
      goalsPrivate: null,
    });
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    expect(notifier.badgesFor("ana")).toContain("comeback");
  });

  it("gives level badges when XP crosses the level", async () => {
    const { engine, notifier, store, advance } = createHarness();
    // 10 XP short of level 5 (200 + 250 + 300 + 350 = 1100).
    await store.members.save({
      userId: "ana",
      xpTotal: 1090,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    await engine.startSolo("ana", 5);
    await advance(5 * MINUTE);
    expect(notifier.badgesFor("ana")).toContain("level-5");
  });
});

describe("card looks", () => {
  it("shows the gold border automatically at level 8", async () => {
    const { engine, store } = createHarness();
    await store.members.save({
      userId: "ana",
      xpTotal: LEVEL_8_XP,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    const snap = await engine.joinRoomTimer("ana");
    expect(snap.room.members[0]!.cardStyle).toBe("gold");
    expect((await engine.getProgress("ana")).card).toEqual({
      chosenStyle: "",
      chosenShowcase: [],
      style: "gold",
      showcase: [],
    });
  });

  it("lets members pick an unlocked style, refuses locked ones, and goes back to automatic", async () => {
    const { engine, store, notifier } = createHarness();
    await store.members.save({
      userId: "ana",
      xpTotal: LEVEL_8_XP,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    await engine.joinRoomTimer("ana");

    expect((await engine.setCardStyle("ana", "lagoon")).card.style).toBe("lagoon");
    expect(notifier.lastRoom!.members[0]!.cardStyle).toBe("lagoon");
    await expectError(engine.setCardStyle("ana", "legend"), ErrorCode.Validation);
    await expectError(engine.setCardStyle("ana", "midnight"), ErrorCode.Validation);
    await expectError(engine.setCardStyle("ana", "sparkles"), ErrorCode.Validation);
    await expectError(engine.setCardStyle("ana", 7), ErrorCode.Validation);
    const back = await engine.setCardStyle("ana", "");
    expect(back.card).toMatchObject({ chosenStyle: "", style: "gold" });
  });

  it("unlocks badge styles with the badge", async () => {
    const { engine, store } = createHarness();
    await store.badges.award({ userId: "ana", badgeId: "night-owl", earnedAt: T0 });
    expect((await engine.setCardStyle("ana", "midnight")).card.style).toBe("midnight");
  });

  it("lets members pin up to three earned badges", async () => {
    const { engine, store } = createHarness();
    for (const [i, badgeId] of ["first-session", "leet", "night-owl", "spooky"].entries()) {
      await store.badges.award({ userId: "ana", badgeId, earnedAt: T0 + i });
    }
    expect((await engine.getProgress("ana")).card.showcase).toEqual([
      "spooky",
      "night-owl",
      "leet",
    ]);
    const pinned = await engine.setBadgeShowcase("ana", ["first-session", "leet"]);
    expect(pinned.card).toMatchObject({
      chosenShowcase: ["first-session", "leet"],
      showcase: ["first-session", "leet"],
    });
    await expectError(engine.setBadgeShowcase("ana", ["marathon"]), ErrorCode.Validation);
    await expectError(
      engine.setBadgeShowcase("ana", ["first-session", "leet", "night-owl", "spooky"]),
      ErrorCode.Validation,
    );
    await expectError(engine.setBadgeShowcase("ana", "leet"), ErrorCode.Validation);
    expect((await engine.setBadgeShowcase("ana", [])).card.chosenShowcase).toEqual([]);
  });

  it("erases badges and card looks with the rest of a member's data", async () => {
    const { engine, store } = createHarness();
    await store.badges.award({ userId: "ana", badgeId: "night-owl", earnedAt: T0 });
    await engine.setCardStyle("ana", "midnight");
    await engine.deleteMyData("ana");
    const progress = await engine.getProgress("ana");
    expect(progress.badges).toEqual([]);
    expect(progress.card.style).toBe("classic");
  });
});
