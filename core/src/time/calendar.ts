/**
 * Calendar math in a community time zone, using only the built-in Intl API.
 * Days are represented as "YYYY-MM-DD" keys so they sort and compare as strings.
 */

export type DayKey = string;

const DAY_MS = 86_400_000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(ms: number, timeZone: string): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** Offset of the zone from UTC at the given instant, in milliseconds. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toDayKey(year: number, month: number, day: number): DayKey {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDayKey(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

export function dayKey(ms: number, timeZone: string): DayKey {
  const p = zonedParts(ms, timeZone);
  return toDayKey(p.year, p.month, p.day);
}

export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = parseDayKey(key);
  const date = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return toDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: DayKey, to: DayKey): number {
  const [y1, m1, d1] = parseDayKey(from);
  const [y2, m2, d2] = parseDayKey(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: DayKey): number {
  const [y, m, d] = parseDayKey(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function weekdayName(key: DayKey): string {
  return WEEKDAY_NAMES[weekdayIndex(key)] ?? "";
}

/** Weeks start on Monday. A week is identified by its Monday's day key. */
export function weekKey(key: DayKey): DayKey {
  return addDays(key, -weekdayIndex(key));
}

/** The UTC instant of a local wall-clock time on a given day in the zone. */
export function zonedTimeToUtc(
  key: DayKey,
  hours: number,
  minutes: number,
  timeZone: string,
): number {
  const [y, m, d] = parseDayKey(key);
  const wallAsUtc = Date.UTC(y, m - 1, d, hours, minutes);
  // Two passes settle the offset across DST transitions.
  let guess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  guess = wallAsUtc - zoneOffsetMs(guess, timeZone);
  return guess;
}

/** Start of the given day in the zone, as a UTC instant. */
export function startOfDay(key: DayKey, timeZone: string): number {
  return zonedTimeToUtc(key, 0, 0, timeZone);
}

/** Next instant strictly after `now` at which the zone's clock reads hours:minutes. */
export function nextOccurrence(
  now: number,
  hours: number,
  minutes: number,
  timeZone: string,
): number {
  const today = dayKey(now, timeZone);
  const candidate = zonedTimeToUtc(today, hours, minutes, timeZone);
  return candidate > now ? candidate : zonedTimeToUtc(addDays(today, 1), hours, minutes, timeZone);
}

/** Start of next Monday in the zone. */
export function nextWeekStart(now: number, timeZone: string): number {
  return startOfDay(addDays(weekKey(dayKey(now, timeZone)), 7), timeZone);
}
