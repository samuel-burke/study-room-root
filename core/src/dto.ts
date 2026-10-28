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
}

export interface BossDto {
  enabled: boolean;
  name: string;
  /** HP and damage are in XP. */
  maxHpXp: number;
  damageXp: number;
  /** 0.5 to 2: how much tougher than the admin's base HP this boss is. */
  strength: number;
  /** XP each contributor gets when it's defeated. */
  lootXp: number;
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
  /** Boss damage, in XP. */
  roomDamageXp: number;
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
  /** Boss damage, in XP. */
  roomDamageXp: number;
  goalPrompt: GoalDto | null;
  breakEndsAt: number;
  me: MyStatusDto;
}

export interface DayStatDto {
  day: DayKey;
  focusMinutes: number;
}

export interface ProgressDto {
  me: MyStatusDto;
  days: DayStatDto[];
  totalFocusMinutes: number;
}

export interface RecapDto {
  day: DayKey;
  weekday: string;
  focusMinutes: number;
  goalsDone: number;
  activeMembers: number;
  boss: { name: string; hpLeftXp: number; daysLeft: number; defeated: boolean } | null;
  topStreaks: { userId: string; streak: number }[];
}
