import { describe, expect, it } from "vitest";
import type {
  MyStatusDto,
  PersonalResultDto,
  PhaseCompletedDto,
  ProgressDto,
  RoomStateDto,
  SnapshotDto,
} from "@studyroom/core";
import {
  type MemberStatus,
  PersonalResultEvent,
  PhaseCompletedEvent,
  Progress,
  RoomSnapshot,
} from "@studyroom/gen-shared";
import {
  personalResultFromProto,
  personalResultToProto,
  phaseCompletedFromProto,
  phaseCompletedToProto,
  progressFromProto,
  progressToProto,
  roomFromProto,
  snapshotFromProto,
  snapshotToProto,
} from "../src";

const room: RoomStateDto = {
  serverNow: 1_793_150_000_123,
  timer: {
    phase: "longBreak",
    round: 4,
    rounds: 4,
    phaseStartedAt: 1_793_149_000_000,
    phaseEndsAt: 1_793_149_900_000,
    preset: { focusMinutes: 0.25, breakMinutes: 5, longBreakMinutes: 15, rounds: 4 },
  },
  members: [
    {
      userId: "u1",
      status: "roomFocus",
      endsAt: 1,
      goalText: "Orgo ch. 4 notes",
      goalPrivate: false,
      level: 12,
      streak: 31,
      badges: ["night-owl", "first-boss", "longest-day"],
      cardStyle: "gold",
    },
    {
      userId: "u2",
      status: "roomBreak",
      endsAt: 2,
      goalText: "",
      goalPrivate: true,
      level: 9,
      streak: 0,
      badges: [],
      cardStyle: "classic",
    },
    {
      userId: "u3",
      status: "soloFocus",
      endsAt: 3,
      goalText: "",
      goalPrivate: false,
      level: 15,
      streak: 54,
      badges: [],
      cardStyle: "classic",
    },
    {
      userId: "u4",
      status: "soloBreak",
      endsAt: 4,
      goalText: "Lab report",
      goalPrivate: false,
      level: 3,
      streak: 2,
      badges: [],
      cardStyle: "classic",
    },
  ],
  presentCount: 9,
  roomParticipantCount: 2,
  combo: 1.1,
  boss: {
    enabled: true,
    name: "Midterms",
    maxHpXp: 12_000,
    damageXp: 4681,
    strength: 1.5,
    lootXp: 150,
    endsAt: 99,
    defeated: false,
  },
  features: {
    presetKey: "custom",
    xpEnabled: true,
    comboEnabled: false,
    bossEnabled: true,
    streakFreezesEnabled: false,
    goalsPublicByDefault: true,
    dailyXpCap: 300,
    postChannelName: "study-hall",
  },
};

const me: MyStatusDto = {
  userId: "u1",
  status: "roomFocus",
  endsAt: 1_793_150_900_000,
  onRoomTimer: true,
  xpTotal: 2365,
  level: 7,
  xpIntoLevel: 415,
  xpForNextLevel: 500,
  xpToday: 75,
  streak: 6,
  freezeAvailable: true,
  goals: [
    { id: "g1", text: "Read ch. 4", done: true },
    { id: "g2", text: "Make 20 flashcards", done: false },
  ],
  goalsPrivate: false,
  keepGoingEndsAt: 1_793_150_200_000,
};

describe("contract round trip", () => {
  it("preserves a full snapshot through the wire format", () => {
    const snapshot: SnapshotDto = { room, me };
    const bytes = RoomSnapshot.toBinary(snapshotToProto(snapshot));
    expect(snapshotFromProto(RoomSnapshot.fromBinary(bytes))).toEqual(snapshot);
  });

  it("covers every phase and preset", () => {
    for (const phase of ["idle", "focus", "break", "longBreak"] as const) {
      for (const presetKey of ["25-5", "50-10", "custom"] as const) {
        const value: SnapshotDto = {
          room: {
            ...room,
            timer: { ...room.timer, phase },
            features: { ...room.features, presetKey },
          },
          me: { ...me, status: "idle" },
        };
        const decoded = snapshotFromProto(
          RoomSnapshot.fromBinary(RoomSnapshot.toBinary(snapshotToProto(value))),
        );
        expect(decoded).toEqual(value);
      }
    }
  });

  it("preserves phase-completed events", () => {
    const event: PhaseCompletedDto = {
      kind: "focus",
      round: 2,
      finisherIds: ["u1", "u2"],
      roomDamageXp: 110,
      combo: 1.1,
      room,
    };
    const bytes = PhaseCompletedEvent.toBinary(phaseCompletedToProto(event));
    expect(phaseCompletedFromProto(PhaseCompletedEvent.fromBinary(bytes))).toEqual(event);
  });

  it("preserves personal results with and without a goal prompt", () => {
    const base: PersonalResultDto = {
      source: "solo",
      round: 0,
      focusedMinutes: 30,
      finished: true,
      baseXp: 60,
      combo: 1,
      xpEarned: 60,
      capped: false,
      streak: 6,
      streakExtended: true,
      finisherIds: ["u1"],
      roomDamageXp: 60,
      goalPrompt: { id: "g2", text: "Make 20 flashcards", done: false },
      breakEndsAt: 123,
      me,
    };
    for (const event of [base, { ...base, source: "room" as const, goalPrompt: null }]) {
      const bytes = PersonalResultEvent.toBinary(personalResultToProto(event));
      expect(personalResultFromProto(PersonalResultEvent.fromBinary(bytes))).toEqual(event);
    }
  });

  it("preserves progress", () => {
    const progress: ProgressDto = {
      me,
      days: [
        { day: "2026-10-27", focusMinutes: 0 },
        { day: "2026-10-28", focusMinutes: 42.5 },
      ],
      totalFocusMinutes: 42.5,
      badges: [
        { id: "first-session", earnedAt: 1_793_150_000_000 },
        { id: "leet", earnedAt: 1_793_150_000_500 },
      ],
      card: {
        chosenStyle: "",
        chosenShowcase: ["leet"],
        style: "lagoon",
        showcase: ["leet"],
      },
    };
    const bytes = Progress.toBinary(progressToProto(progress));
    expect(progressFromProto(Progress.fromBinary(bytes))).toEqual(progress);
  });
});

describe("decoding defensively", () => {
  it("fills safe defaults when fields are missing", () => {
    const decoded = roomFromProto(undefined);
    expect(decoded.timer.phase).toBe("idle");
    expect(decoded.members).toEqual([]);
    expect(decoded.boss.enabled).toBe(false);
  });

  it("treats unknown enum values as safe states", () => {
    const decoded = snapshotFromProto(
      RoomSnapshot.create({
        me: { status: 99 as MemberStatus },
        room: { members: [{ userId: "x", status: 0 }] },
      }),
    );
    expect(decoded.me.status).toBe("idle");
    expect(decoded.room.members[0]!.status).toBe("roomBreak");
  });
});
