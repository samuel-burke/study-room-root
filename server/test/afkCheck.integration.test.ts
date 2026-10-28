import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, StudyRoomEngine, type Logger } from "@studyroom/core";
import type { Knex } from "knex";
import { RequestFailure, StudyRoomHandlers } from "../src/handlers";
import { KnexStore } from "../src/persistence/knexStore";
import {
  configWith,
  FakeClock,
  ManualScheduler,
  RecordingAnnouncer,
  RecordingNotifier,
  silentLogger,
  T0,
} from "../../core/test/helpers";
import { freshDatabase } from "./sqlite";

const MINUTE = 60_000;
/** With random() = 0 the cycle's check opens one minute into round 2 (25/5 rounds). */
const ROUND_2 = T0 + 30 * MINUTE;
const ROUND_2_ENDS = ROUND_2 + 25 * MINUTE;
const CHECK_AT = ROUND_2 + MINUTE;
const CHECK_ENDS = CHECK_AT + 2 * MINUTE;

const mockLogger = () => ({
  info: vi.fn<Logger["info"]>(),
  warn: vi.fn<Logger["warn"]>(),
  error: vi.fn<Logger["error"]>(),
});

async function failure(promise: Promise<unknown>): Promise<RequestFailure> {
  const error = await promise.then(
    () => {
      throw new Error("expected failure");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RequestFailure);
  return error as RequestFailure;
}

describe("AFK check through the handlers on SQLite", () => {
  let db: Knex;
  let clock: FakeClock;
  let scheduler: ManualScheduler;
  let notifier: RecordingNotifier;
  let engine: StudyRoomEngine;
  let handlers: StudyRoomHandlers;
  let logger: ReturnType<typeof mockLogger>;

  function boot(options: ConstructorParameters<typeof StudyRoomHandlers>[2] = {}) {
    scheduler = new ManualScheduler();
    notifier = new RecordingNotifier();
    engine = new StudyRoomEngine({
      store: new KnexStore(db),
      clock,
      scheduler,
      notifier,
      announcer: new RecordingAnnouncer(),
      logger: silentLogger,
      config: configWith({ afkChecksEnabled: true }),
      newId: () => "unused",
      random: () => 0,
    });
    logger = mockLogger();
    handlers = new StudyRoomHandlers(engine, logger, options);
  }

  async function advanceTo(at: number) {
    while (scheduler.at !== null && scheduler.at <= at) {
      clock.current = scheduler.at;
      scheduler.fireIfDue(clock.current);
      await engine.idle();
    }
    clock.current = at;
  }

  beforeEach(async () => {
    db = await freshDatabase();
    clock = new FakeClock(T0);
    boot();
  });

  afterEach(async () => {
    await engine.idle();
    await db.destroy();
  });

  it("opens the check, takes the tap, and finishes the round only for who answered", async () => {
    await handlers.joinRoomTimer("ana", { goals: [] });
    await handlers.joinRoomTimer("kai", { goals: [] });
    expect((await handlers.getRoom("ana")).me?.afkCheckEndsAtMs).toBe(0);

    await advanceTo(CHECK_AT);
    const pushed = notifier.statuses.filter((s) => s.me.afkCheckEndsAt > 0);
    expect(pushed.map((s) => [s.userId, s.me.afkCheckEndsAt]).sort()).toEqual([
      ["ana", CHECK_ENDS],
      ["kai", CHECK_ENDS],
    ]);
    expect((await handlers.getRoom("ana")).me?.afkCheckEndsAtMs).toBe(CHECK_ENDS);

    clock.current = CHECK_AT + 30_000;
    const me = await handlers.confirmPresence("ana");
    expect(me.afkCheckEndsAtMs).toBe(0);
    expect(me.userId).toBe("ana");

    await advanceTo(ROUND_2_ENDS);
    const result = (userId: string) =>
      notifier.personal.find((p) => p.userId === userId && p.event.round === 2)!.event;
    expect(result("ana")).toMatchObject({ finished: true, afkCheckMissed: false });
    expect(result("kai")).toMatchObject({ finished: false, afkCheckMissed: true, xpEarned: 50 });
    // Round 1 had no check, so it counted for both.
    expect(notifier.phases.find((p) => p.round === 1)!.finisherIds.sort()).toEqual(["ana", "kai"]);
  });

  it("keeps the planned check across a server restart", async () => {
    await handlers.joinRoomTimer("ana", { goals: [] });
    await advanceTo(ROUND_2);
    expect(scheduler.at).toBe(CHECK_AT);
    engine.stop();

    boot();
    await engine.start();
    expect(scheduler.at).toBe(CHECK_AT);
    await advanceTo(CHECK_AT);
    await handlers.confirmPresence("ana");
    await advanceTo(ROUND_2_ENDS);
    expect(
      notifier.personal.find((p) => p.userId === "ana" && p.event.round === 2)!.event.finished,
    ).toBe(true);
  });

  it("treats a tap with no open check as a harmless no-op", async () => {
    // Not on any timer.
    expect((await handlers.confirmPresence("ana")).afkCheckEndsAtMs).toBe(0);
    // On the timer, before the check opens, then after it closes.
    await handlers.joinRoomTimer("ana", { goals: [] });
    await handlers.confirmPresence("ana");
    await advanceTo(CHECK_ENDS);
    await handlers.confirmPresence("ana");
    await advanceTo(ROUND_2_ENDS);
    expect(
      notifier.personal.find((p) => p.userId === "ana" && p.event.round === 2)!.event
        .afkCheckMissed,
    ).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("refuses a tap without a caller identity", async () => {
    const error = await failure(handlers.confirmPresence(""));
    expect(error.code).toBe(ErrorCode.Validation);
  });

  it("rate limits taps like any other write", async () => {
    boot({ writeLimit: { capacity: 1, perSecond: 0.001 }, now: () => 0 });
    await handlers.confirmPresence("ana");
    const error = await failure(handlers.confirmPresence("ana"));
    expect(error.code).toBe(ErrorCode.RateLimited);
    expect(logger.warn).toHaveBeenCalledWith("rate limited", {
      operation: "confirmPresence",
      userId: "ana",
    });
  });

  it("hides storage failures behind a generic message, logs them and keeps the check open", async () => {
    await handlers.joinRoomTimer("ana", { goals: [] });
    await advanceTo(CHECK_AT);
    const store = new KnexStore(db);
    // Fail the write of the answer inside the engine's transaction, so it must roll back.
    const transaction = KnexStore.prototype.transaction;
    const spy = vi.spyOn(KnexStore.prototype, "transaction").mockImplementationOnce(function (
      this: KnexStore,
      work,
    ) {
      return transaction.call(this, async (tx) => {
        tx.room.addParticipant = async () => {
          throw new Error("SQLITE_BUSY: database is locked");
        };
        return work(tx);
      });
    });
    const error = await failure(handlers.confirmPresence("ana"));
    spy.mockRestore();
    expect(error.code).toBe(ErrorCode.Internal);
    expect(error.message).not.toContain("SQLITE");
    expect(logger.error).toHaveBeenCalledWith(
      "request failed",
      expect.objectContaining({
        operation: "confirmPresence",
        error: expect.stringContaining("SQLITE_BUSY"),
      }),
    );
    // Nothing was saved, so the check is still open and a retry works.
    expect((await store.room.listParticipants())[0]).toMatchObject({ afkCheckAnswered: false });
    expect((await handlers.confirmPresence("ana")).afkCheckEndsAtMs).toBe(0);
  });
});
