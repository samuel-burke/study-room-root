import { describe, expect, it } from "vitest";
import { bossDefeatedPost, busyRoomPost, dailyRecapPost, streakMilestonePost } from "../src";

describe("channel posts", () => {
  it("announces a busy room", () => {
    expect(busyRoomPost(6, 1.5)).toContain("6 people are focusing right now. Combo is at 1.5x.");
  });

  it("celebrates streak milestones", () => {
    expect(streakMilestonePost("Ana R.", 30)).toBe("🔥 Ana R. just hit a 30 day streak.");
  });

  it("announces boss defeats with or without loot", () => {
    expect(bossDefeatedPost("Midterms", 12, 50)).toContain(
      "12 people dealt damage this week. Everyone who pitched in earned +50 XP.",
    );
    expect(bossDefeatedPost("Midterms", 1, 0)).not.toContain("XP");
  });

  it("writes the daily recap like the design", () => {
    const text = dailyRecapPost(
      {
        day: "2026-10-27",
        weekday: "Tuesday",
        focusMinutes: 41.5 * 60,
        goalsDone: 23,
        activeMembers: 14,
        boss: { name: "Midterms", hpLeftMinutes: 57 * 60, daysLeft: 4, defeated: false },
        topStreaks: [
          { userId: "p", streak: 54 },
          { userId: "a", streak: 31 },
          { userId: "missing", streak: 17 },
        ],
      },
      new Map([
        ["p", "Priya"],
        ["a", "Ana R."],
      ]),
    );
    expect(text).toBe(
      [
        "Tuesday recap",
        "41.5 hrs focused as a community · 23 goals finished · 14 members showed up",
        "Midterms: down to 57 hrs HP · 4 days left",
        "Top streaks: Priya 54 · Ana R. 31 · Someone 17",
      ].join("\n"),
    );
  });

  it("leaves out the boss and streak lines when there's nothing to show", () => {
    const text = dailyRecapPost(
      {
        day: "d",
        weekday: "Monday",
        focusMinutes: 30,
        goalsDone: 1,
        activeMembers: 1,
        boss: null,
        topStreaks: [],
      },
      new Map(),
    );
    expect(text.split("\n")).toHaveLength(2);
  });
});
