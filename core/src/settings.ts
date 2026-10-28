import { isValidTimeZone } from "./time/calendar";
import {
  customPreset,
  DEFAULT_PRESET,
  PRESETS,
  type PresetKey,
  type TimerPreset,
} from "./timer/presets";

/**
 * Keys of the Global Settings declared in root-manifest.json. Admins edit
 * these in Root's App settings; the server reads them on start and on update.
 * A unit test checks the manifest declares exactly these keys.
 */
export const SETTINGS = {
  room: {
    group: "room",
    preset: "timerPreset",
    customFocus: "customFocusMinutes",
    customBreak: "customBreakMinutes",
    postChannel: "postChannel",
    recapEnabled: "recapEnabled",
    recapTime: "recapTime",
    recapLeaderboard: "recapLeaderboard",
    timeZone: "timeZone",
    goalsPublic: "goalsPublicByDefault",
    busyPosts: "busyPosts",
    busyThreshold: "busyThreshold",
  },
  game: {
    group: "game",
    xpEnabled: "xpEnabled",
    dailyXpCap: "dailyXpCap",
    comboEnabled: "comboEnabled",
    bossEnabled: "bossEnabled",
    bossName: "bossName",
    bossHp: "bossHpHours",
    streakFreezes: "streakFreezes",
    milestonePosts: "milestonePosts",
  },
} as const;

export interface AppConfig {
  presetKey: PresetKey;
  preset: TimerPreset;
  timeZone: string;
  /** Channel for recaps, busy-room and milestone posts. null = don't post. */
  postChannelId: string | null;
  /** Display name of that channel, resolved by the server. Empty if unknown. */
  postChannelName: string;
  recap: { enabled: boolean; hours: number; minutes: number };
  /** List the week's top focusers in the daily recap. */
  recapLeaderboardEnabled: boolean;
  goalsPublicByDefault: boolean;
  busyPosts: { enabled: boolean; threshold: number };
  xp: { enabled: boolean; dailyCap: number };
  comboEnabled: boolean;
  /** name is the admin's custom boss name, or "" for a new built-in name each week. */
  boss: { enabled: boolean; name: string; hpHours: number };
  streakFreezesEnabled: boolean;
  milestonePostsEnabled: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  presetKey: "25-5",
  preset: DEFAULT_PRESET,
  timeZone: "America/New_York",
  postChannelId: null,
  postChannelName: "",
  recap: { enabled: true, hours: 21, minutes: 0 },
  recapLeaderboardEnabled: true,
  goalsPublicByDefault: true,
  busyPosts: { enabled: true, threshold: 5 },
  xp: { enabled: true, dailyCap: 300 },
  comboEnabled: true,
  boss: { enabled: true, name: "", hpHours: 100 },
  streakFreezesEnabled: true,
  milestonePostsEnabled: true,
};

/** The loosely typed shape Root hands us: groups of items, each a primitive or array. */
export type RawSettings = Record<string, Record<string, unknown> | undefined> | undefined;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/** Accepts a number, or a select's numeric key ("300" or ["300"]). Clamped to [min, max]. */
function int(value: unknown, fallback: number, min: number, max: number): number {
  const raw = typeof value === "number" ? value : Number(firstString(value) ?? Number.NaN);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function text(value: unknown, fallback: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function timeOfDay(value: unknown, fallback: { hours: number; minutes: number }) {
  if (value && typeof value === "object") {
    const v = value as { hours?: unknown; minutes?: unknown };
    return {
      hours: int(v.hours, fallback.hours, 0, 23),
      minutes: int(v.minutes, fallback.minutes, 0, 59),
    };
  }
  return fallback;
}

function presetFrom(key: string | undefined, focus: number, rest: number) {
  if (key === "50-10" || key === "25-5") return { presetKey: key, preset: PRESETS[key] } as const;
  if (key === "custom") return { presetKey: key, preset: customPreset(focus, rest) } as const;
  return { presetKey: DEFAULT_CONFIG.presetKey, preset: DEFAULT_CONFIG.preset };
}

/** Turns untrusted settings into a complete, range-checked config. Never throws. */
export function parseSettings(raw: RawSettings): AppConfig {
  const room = raw?.[SETTINGS.room.group] ?? {};
  const game = raw?.[SETTINGS.game.group] ?? {};
  const r = SETTINGS.room;
  const g = SETTINGS.game;
  const d = DEFAULT_CONFIG;

  const tz = firstString(room[r.timeZone]);
  const channel = firstString(room[r.postChannel]);

  return {
    ...presetFrom(
      firstString(room[r.preset]),
      int(room[r.customFocus], 25, 5, 120),
      int(room[r.customBreak], 5, 1, 30),
    ),
    timeZone: tz && isValidTimeZone(tz) ? tz : d.timeZone,
    postChannelId: channel && channel.length > 0 ? channel : null,
    postChannelName: "",
    recap: {
      enabled: bool(room[r.recapEnabled], d.recap.enabled),
      ...timeOfDay(room[r.recapTime], d.recap),
    },
    recapLeaderboardEnabled: bool(room[r.recapLeaderboard], d.recapLeaderboardEnabled),
    goalsPublicByDefault: bool(room[r.goalsPublic], d.goalsPublicByDefault),
    busyPosts: {
      enabled: bool(room[r.busyPosts], d.busyPosts.enabled),
      threshold: int(room[r.busyThreshold], d.busyPosts.threshold, 2, 100),
    },
    xp: {
      enabled: bool(game[g.xpEnabled], d.xp.enabled),
      dailyCap: int(game[g.dailyXpCap], d.xp.dailyCap, 50, 2000),
    },
    comboEnabled: bool(game[g.comboEnabled], d.comboEnabled),
    boss: {
      enabled: bool(game[g.bossEnabled], d.boss.enabled),
      name: text(game[g.bossName], "", 40),
      hpHours: int(game[g.bossHp], d.boss.hpHours, 1, 10_000),
    },
    streakFreezesEnabled: bool(game[g.streakFreezes], d.streakFreezesEnabled),
    milestonePostsEnabled: bool(game[g.milestonePosts], d.milestonePostsEnabled),
  };
}
