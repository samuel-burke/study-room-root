import type { AfkCheckState } from "../game/afkCheck";
import type { BossState } from "../game/boss";
import type { StreakState } from "../game/streak";
import type { DayKey } from "../time/calendar";
import type { TimerPreset } from "../timer/presets";
import type {
  MyStatusDto,
  PersonalResultDto,
  PhaseCompletedDto,
  RecapDto,
  RoomStateDto,
} from "../dto";

// ---- Records the engine persists ----

export interface MemberRecord {
  userId: string;
  xpTotal: number;
  streak: StreakState;
  /** null = follow the community default. */
  goalsPrivate: boolean | null;
}

export interface GoalRecord {
  id: string;
  userId: string;
  text: string;
  done: boolean;
  /** Goal XP is granted once, so toggling a goal can't farm XP. */
  xpAwarded: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface SoloRecord extends AfkCheckState {
  userId: string;
  startedAt: number;
  endsAt: number;
  minutes: number;
  phase: "focus" | "break";
  breakEndsAt: number;
}

export interface RoomCycleRecord {
  cycleStartedAt: number;
  /** Captured at cycle start; settings changes apply from the next cycle. */
  preset: TimerPreset;
  /** How many phases of this cycle have been settled. */
  settledCount: number;
}

/** The AFK check covers the participant's current or next focus round. */
export interface ParticipantRecord extends AfkCheckState {
  userId: string;
  joinedAt: number;
}

export interface SessionLogRecord {
  userId: string;
  kind: "room" | "solo";
  startedAt: number;
  endedAt: number;
  focusedMinutes: number;
  finished: boolean;
  xp: number;
  combo: number;
}

export interface DailyStatRecord {
  userId: string;
  day: DayKey;
  focusMinutes: number;
  xp: number;
  goalsDone: number;
  sessionsFinished: number;
}

export type DailyStatDelta = Partial<Omit<DailyStatRecord, "userId" | "day">>;

export interface CommunityDayStats {
  focusMinutes: number;
  goalsDone: number;
  activeMembers: number;
}

// ---- Persistence port ----

export interface Store {
  members: {
    get(userId: string): Promise<MemberRecord | undefined>;
    list(userIds: readonly string[]): Promise<MemberRecord[]>;
    listActiveSince(day: DayKey): Promise<MemberRecord[]>;
    save(member: MemberRecord): Promise<void>;
  };
  goals: {
    get(id: string): Promise<GoalRecord | undefined>;
    /** Open goals plus goals finished at or after `doneSince`, oldest first. */
    listForUser(userId: string, doneSince: number): Promise<GoalRecord[]>;
    /** Oldest open goal per user. */
    firstOpen(userIds: readonly string[]): Promise<Map<string, GoalRecord>>;
    countOpen(userId: string): Promise<number>;
    insert(goal: GoalRecord): Promise<void>;
    update(goal: GoalRecord): Promise<void>;
    delete(id: string): Promise<void>;
  };
  solos: {
    get(userId: string): Promise<SoloRecord | undefined>;
    list(): Promise<SoloRecord[]>;
    save(solo: SoloRecord): Promise<void>;
    delete(userId: string): Promise<void>;
  };
  room: {
    getCycle(): Promise<RoomCycleRecord | undefined>;
    saveCycle(cycle: RoomCycleRecord | null): Promise<void>;
    listParticipants(): Promise<ParticipantRecord[]>;
    addParticipant(participant: ParticipantRecord): Promise<void>;
    removeParticipant(userId: string): Promise<void>;
  };
  sessions: {
    insert(log: SessionLogRecord): Promise<void>;
  };
  stats: {
    get(userId: string, day: DayKey): Promise<DailyStatRecord | undefined>;
    add(userId: string, day: DayKey, delta: DailyStatDelta): Promise<void>;
    listForUser(userId: string, fromDay: DayKey, toDay: DayKey): Promise<DailyStatRecord[]>;
    communityDay(day: DayKey): Promise<CommunityDayStats>;
  };
  bosses: {
    get(weekKey: DayKey): Promise<BossState | undefined>;
    save(boss: BossState): Promise<void>;
  };
  kv: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
  /**
   * Removes every record about a member: profile, goals, sessions, daily
   * stats, room and solo timers, and their id in boss contributor lists.
   * Community totals for past recaps are not recomputed.
   */
  eraseUser(userId: string): Promise<void>;
  /** Runs `work` atomically. Implementations must roll back if it throws. */
  transaction<T>(work: (tx: Store) => Promise<T>): Promise<T>;
}

// ---- Side-effect ports ----

export interface Clock {
  now(): number;
}

/** Holds at most one pending wake-up. Scheduling again replaces it. */
export interface WakeScheduler {
  wakeAt(at: number, callback: () => void): void;
  cancel(): void;
}

/** Pushes real-time updates to clients. Fire-and-forget. */
export interface Notifier {
  roomUpdated(room: RoomStateDto): void;
  phaseCompleted(event: PhaseCompletedDto): void;
  personalResult(userId: string, event: PersonalResultDto): void;
  myStatusUpdated(userId: string, me: MyStatusDto): void;
}

/** Posts to a Root text channel. Failures are logged, never surfaced to users. */
export interface Announcer {
  busyRoom(channelId: string, focusingCount: number, combo: number): Promise<void>;
  streakMilestone(channelId: string, userId: string, streak: number): Promise<void>;
  bossDefeated(
    channelId: string,
    bossName: string,
    contributorCount: number,
    lootXp: number,
  ): Promise<void>;
  dailyRecap(channelId: string, recap: RecapDto): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
