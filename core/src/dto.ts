import type { PhaseKind } from "./timer/roomCycle";
import type { PresetKey, TimerPreset } from "./timer/presets";
import type { DayKey } from "./time/calendar";

/**
 * Transport-neutral shapes the engine produces. The server maps them to
 * Protobuf messages and the client maps those back, so the UI never depends
 * on generated code directly.
 */

export type MemberStatus = "roomFocus" | "roomBreak" | "soloFocus" | "soloBreak";
export type MyStatusKind = MemberStatus | "idle";
export type RoomPhase = "idle" | PhaseKind;

export interface RoomTimerDto {
  phase: RoomPhase;
  /** 1-based round, 0 when idle. */
  round: number;
  rounds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  preset: TimerPreset;
}

export interface MemberCardDto {
  userId: string;
  status: MemberStatus;
  /** When the member's current focus or break ends (server time). */
  endsAt: number;
  /** Empty when the member keeps goals private or has none open. */
  goalText: string;
  goalPrivate: boolean;
  level: number;
  streak: number;
  /** Up to three badge ids to show on the card. */
  badges: string[];
  /** Card style id (see CARD_STYLES). */
  cardStyle: string;
}

export interface BossDto {
  enabled: boolean;
  name: string;
  maxHpMinutes: number;
  damageMinutes: number;
  endsAt: number;
  defeated: boolean;
}

export interface RoomFeaturesDto {
  presetKey: PresetKey;
  xpEnabled: boolean;
  comboEnabled: boolean;
  bossEnabled: boolean;
  streakFreezesEnabled: boolean;
  goalsPublicByDefault: boolean;
  dailyXpCap: number;
  postChannelName: string;
}

export interface RoomStateDto {
  serverNow: number;
  timer: RoomTimerDto;
  members: MemberCardDto[];
  /** People with the app open or a session running. */
  presentCount: number;
  roomParticipantCount: number;
  /** Combo the room timer would earn right now. */
  combo: number;
  boss: BossDto;
  features: RoomFeaturesDto;
}

export interface GoalDto {
  id: string;
  text: string;
  done: boolean;
}

export interface MyStatusDto {
  userId: string;
  status: MyStatusKind;
  endsAt: number;
  onRoomTimer: boolean;
  xpTotal: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToday: number;
  streak: number;
  freezeAvailable: boolean;
  goals: GoalDto[];
  goalsPrivate: boolean;
}

export interface SnapshotDto {
  room: RoomStateDto;
  me: MyStatusDto;
}

/** Sent to everyone when a room phase ends. */
export interface PhaseCompletedDto {
  kind: PhaseKind;
  round: number;
  finisherIds: string[];
  roomDamageMinutes: number;
  combo: number;
  room: RoomStateDto;
}

/** Sent only to the member it is about, after a focus block they took part in. */
export interface PersonalResultDto {
  source: "room" | "solo";
  round: number;
  focusedMinutes: number;
  finished: boolean;
  baseXp: number;
  combo: number;
  xpEarned: number;
  /** True when the daily cap trimmed this award. */
  capped: boolean;
  streak: number;
  streakExtended: boolean;
  finisherIds: string[];
  roomDamageMinutes: number;
  goalPrompt: GoalDto | null;
  breakEndsAt: number;
  me: MyStatusDto;
}

export interface DayStatDto {
  day: DayKey;
  focusMinutes: number;
}

export interface EarnedBadgeDto {
  id: string;
  earnedAt: number;
}

export interface CardLookDto {
  /** The style the member picked, or "" for automatic. */
  chosenStyle: string;
  /** The badges the member picked, or empty for "most recent". */
  chosenShowcase: string[];
  /** What the card shows right now. */
  style: string;
  showcase: string[];
}

export interface ProgressDto {
  me: MyStatusDto;
  days: DayStatDto[];
  totalFocusMinutes: number;
  /** Earned badges, oldest first. The catalog itself lives in core (BADGES). */
  badges: EarnedBadgeDto[];
  card: CardLookDto;
}

export interface LeaderboardEntryDto {
  userId: string;
  /** Whole focus minutes this week. */
  focusMinutes: number;
  /** 1-based. Members with the same minutes share a rank. */
  rank: number;
}

/** This week's focus-minute standings. Members who opted out are never listed. */
export interface LeaderboardDto {
  /** Monday of this week, in the community time zone. */
  weekStart: DayKey;
  /** When the board resets (next Monday 00:00 in the community time zone). */
  endsAt: number;
  entries: LeaderboardEntryDto[];
  /** The caller's own week. rank is 0 when they're hidden or haven't focused yet. */
  me: { rank: number; focusMinutes: number; hidden: boolean };
}

export interface RecapDto {
  day: DayKey;
  weekday: string;
  focusMinutes: number;
  goalsDone: number;
  activeMembers: number;
  boss: { name: string; hpLeftMinutes: number; daysLeft: number; defeated: boolean } | null;
  topStreaks: { userId: string; streak: number }[];
  /** Most focus minutes so far this week. Empty when the admin turned it off. */
  topFocus: { userId: string; focusMinutes: number }[];
}
