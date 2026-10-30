import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  daysBetween,
  isValidTimeZone,
  lastOccurrence,
  nextOccurrence,
  nextWeekStart,
  weekdayIndex,
  weekdayName,
  weekKey,
  zonedTimeToUtc,
} from "../src";

const NY = "America/New_York";

describe("dayKey", () => {
  it("uses the community's local date, not UTC", () => {
    // 2026-10-29 02:00 UTC is still the 28th in New York.
    expect(dayKey(Date.UTC(2026, 9, 29, 2), NY)).toBe("2026-10-28");
    expect(dayKey(Date.UTC(2026, 9, 29, 2), "UTC")).toBe("2026-10-29");
    expect(dayKey(Date.UTC(2026, 9, 29, 2), "Asia/Tokyo")).toBe("2026-10-29");
  });
});

describe("day arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2027-01-02", "2026-12-30")).toBe(-3);
  });

  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-10-26")).toBe(0);
    expect(weekdayName("2026-10-27")).toBe("Tuesday");
    expect(weekKey("2026-11-01")).toBe("2026-10-26"); // Sunday belongs to the week before
    expect(weekKey("2026-11-02")).toBe("2026-11-02");
  });
});

describe("zonedTimeToUtc", () => {
  it("converts wall-clock time in standard and daylight time", () => {
    expect(zonedTimeToUtc("2026-07-01", 21, 0, NY)).toBe(Date.UTC(2026, 6, 2, 1, 0));
    expect(zonedTimeToUtc("2026-12-01", 21, 0, NY)).toBe(Date.UTC(2026, 11, 2, 2, 0));
  });

  it("handles the days the clocks change", () => {
    // DST ends 2026-11-01 in New York: 9 PM that evening is already EST.
    expect(zonedTimeToUtc("2026-11-01", 21, 0, NY)).toBe(Date.UTC(2026, 10, 2, 2, 0));
    // DST starts 2026-03-08: 9 PM is EDT.
    expect(zonedTimeToUtc("2026-03-08", 21, 0, NY)).toBe(Date.UTC(2026, 2, 9, 1, 0));
  });
});

describe("nextOccurrence", () => {
  it("returns later today when the time hasn't passed", () => {
    const now = Date.UTC(2026, 9, 28, 14); // 10 AM in NY
    expect(nextOccurrence(now, 21, 0, NY)).toBe(Date.UTC(2026, 9, 29, 1));
  });

  it("rolls to tomorrow when the time has passed or is exactly now", () => {
    const ninePm = Date.UTC(2026, 9, 29, 1);
    expect(nextOccurrence(ninePm, 21, 0, NY)).toBe(Date.UTC(2026, 9, 30, 1));
  });
});

describe("lastOccurrence", () => {
  it("returns earlier today when the time has passed or is exactly now", () => {
    const tenAm = Date.UTC(2026, 9, 28, 14);
    expect(lastOccurrence(tenAm, 4, 0, NY)).toBe(Date.UTC(2026, 9, 28, 8));
    expect(lastOccurrence(Date.UTC(2026, 9, 28, 8), 4, 0, NY)).toBe(Date.UTC(2026, 9, 28, 8));
  });

  it("rolls back to yesterday when the time hasn't come yet", () => {
    const oneAm = Date.UTC(2026, 9, 29, 5);
    expect(lastOccurrence(oneAm, 4, 0, NY)).toBe(Date.UTC(2026, 9, 28, 8));
  });
});

describe("nextWeekStart", () => {
  it("is next Monday at local midnight", () => {
    const wednesday = Date.UTC(2026, 9, 28, 14);
    // Monday 2026-11-02 00:00 EST = 05:00 UTC (DST ended on the 1st).
    expect(nextWeekStart(wednesday, NY)).toBe(Date.UTC(2026, 10, 2, 5));
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});
