import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  phaseCompletedFromProto,
  personalResultFromProto,
  roomFromProto,
} from "@studyroom/contract";
import { StudyRoomEngine } from "@studyroom/core";
import type { Knex } from "knex";
import {
  MyStatusEvent,
  PersonalResultEvent,
  PhaseCompletedEvent,
  RoomUpdatedEvent,
} from "@studyroom/gen-shared";
import { PushNotifier, type Broadcaster, type BroadcastTarget } from "../src/adapters/pushNotifier";
import { KnexStore } from "../src/persistence/knexStore";
import {
  configWith,
  FakeClock,
  ManualScheduler,
  RecordingAnnouncer,
  silentLogger,
  T0,
} from "../../core/test/helpers";
import { freshDatabase } from "./sqlite";

const MINUTE = 60_000;

interface FakeClient {
  userId: string;
}

/**
 * Simulates Root's broadcast fan-out: every message is encoded to bytes and
 * decoded again per receiving client, exactly as it would cross the wire.
 */
class FanOut implements Broadcaster<FakeClient> {
  readonly inbox = new Map<string, { type: string; payload: unknown }[]>();

  constructor(private readonly connected: FakeClient[]) {
    for (const c of connected) this.inbox.set(c.userId, []);
  }

  private deliver(
    type: string,
    bytes: Uint8Array,
    decode: (b: Uint8Array) => unknown,
    target: BroadcastTarget<FakeClient>,
  ) {
    const recipients = target === "all" ? this.connected : target;
    for (const c of recipients) this.inbox.get(c.userId)?.push({ type, payload: decode(bytes) });
  }

  broadcastRoomUpdated(m: RoomUpdatedEvent, t: BroadcastTarget<FakeClient>) {
    this.deliver(
      "room",
      RoomUpdatedEvent.toBinary(m),
      (b) => roomFromProto(RoomUpdatedEvent.fromBinary(b).room),
      t,
    );
  }
  broadcastPhaseCompleted(m: PhaseCompletedEvent, t: BroadcastTarget<FakeClient>) {
    this.deliver(
      "phase",
      PhaseCompletedEvent.toBinary(m),
      (b) => phaseCompletedFromProto(PhaseCompletedEvent.fromBinary(b)),
      t,
    );
  }
  broadcastPersonalResult(m: PersonalResultEvent, t: BroadcastTarget<FakeClient>) {
    this.deliver(
      "personal",
      PersonalResultEvent.toBinary(m),
      (b) => personalResultFromProto(PersonalResultEvent.fromBinary(b)),
      t,
    );
  }
  broadcastMyStatus(m: MyStatusEvent, t: BroadcastTarget<FakeClient>) {
    this.deliver("status", MyStatusEvent.toBinary(m), (b) => MyStatusEvent.fromBinary(b).me, t);
  }

  of(userId: string, type?: string) {
    return (this.inbox.get(userId) ?? []).filter((m) => !type || m.type === type);
  }
}

describe("room timer sync across clients (engine + SQLite + push adapter)", () => {
  let db: Knex;
  let clock: FakeClock;
  let scheduler: ManualScheduler;
  let fanOut: FanOut;
  let engine: StudyRoomEngine;
  const ana = { userId: "ana" };
  const marcus = { userId: "marcus" };
  const viewer = { userId: "viewer" };

  beforeEach(async () => {
    db = await freshDatabase();
    clock = new FakeClock(T0);
    scheduler = new ManualScheduler();
    fanOut = new FanOut([ana, marcus, viewer]);
    const clients = new Map([ana, marcus, viewer].map((c) => [c.userId, c]));
    engine = new StudyRoomEngine({
      store: new KnexStore(db),
      clock,
      scheduler,
      notifier: new PushNotifier(fanOut, (id) => clients.get(id)),
      announcer: new RecordingAnnouncer(),
      logger: silentLogger,
      config: configWith(),
      newId: (() => {
        let n = 0;
        return () => `goal-${++n}`;
      })(),
    });
  });

  afterEach(async () => {
    await engine.idle();
    await db.destroy();
  });

  async function advanceTo(at: number) {
    while (scheduler.at !== null && scheduler.at <= at) {
      clock.current = scheduler.at;
      scheduler.fireIfDue(clock.current);
      await engine.idle();
    }
    clock.current = at;
  }

  it("gives every client the same phase end, so countdowns match", async () => {
    await engine.joinRoomTimer("ana", { goals: ["Orgo ch. 4 notes"] });
    clock.advance(7 * MINUTE);
    await engine.joinRoomTimer("marcus", { goals: ["LeetCode: 3 mediums"], goalsPrivate: true });
    await engine.idle();

    const lastRoom = (userId: string) =>
      fanOut.of(userId, "room").at(-1)!.payload as ReturnType<typeof roomFromProto>;
    for (const user of ["ana", "marcus", "viewer"]) {
      const room = lastRoom(user);
      expect(room.timer.phaseEndsAt).toBe(T0 + 25 * MINUTE);
      expect(room.serverNow).toBe(T0 + 7 * MINUTE);
      expect(room.members.map((m) => m.goalText)).toEqual(["Orgo ch. 4 notes", ""]);
    }
  });

  it("lands the break on every screen at the same moment, with personal results only for participants", async () => {
    await engine.joinRoomTimer("ana", { goals: ["Make 20 flashcards"] });
    await engine.joinRoomTimer("marcus");
    await advanceTo(T0 + 25 * MINUTE);

    for (const user of ["ana", "marcus", "viewer"]) {
      const phases = fanOut.of(user, "phase");
      expect(phases).toHaveLength(1);
      expect(phases[0]!.payload).toMatchObject({
        kind: "focus",
        round: 1,
        combo: 1.1,
        room: { timer: { phase: "break" } },
      });
    }
    const anaResult = fanOut.of("ana", "personal")[0]!.payload;
    expect(anaResult).toMatchObject({ xpEarned: 55, goalPrompt: { text: "Make 20 flashcards" } });
    expect(fanOut.of("marcus", "personal")).toHaveLength(1);
    expect(fanOut.of("viewer", "personal")).toHaveLength(0);
  });

  it("keeps each member's status private to their own devices", async () => {
    await engine.joinRoomTimer("ana");
    await engine.idle();
    expect(fanOut.of("ana", "status").length).toBeGreaterThan(0);
    expect(fanOut.of("viewer", "status")).toHaveLength(0);
  });

  it("survives a server restart mid-round: state comes back from SQLite", async () => {
    await engine.joinRoomTimer("ana");
    await engine.idle();
    const restarted = new StudyRoomEngine({
      store: new KnexStore(db),
      clock,
      scheduler: new ManualScheduler(),
      notifier: new PushNotifier(fanOut, () => undefined),
      announcer: new RecordingAnnouncer(),
      logger: silentLogger,
      config: configWith(),
      newId: () => "x",
    });
    clock.advance(30 * MINUTE);
    await restarted.start();
    const snap = await restarted.getSnapshot("ana");
    expect(snap.room.timer).toMatchObject({ phase: "focus", round: 2 });
    expect(snap.me.xpTotal).toBe(50);
    await restarted.idle();
  });
});
