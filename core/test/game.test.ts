import { describe, expect, it } from "vitest";
import {
  applyDailyCap,
  applyDamage,
  BOSS_NAMES,
  bossNameFor,
  baseFocusXp,
  bossHpLeftMinutes,
  comboFor,
  formatCombo,
  focusXp,
  levelFromXp,
  newBoss,
  reconfigureBoss,
  xpForLevel,
} from "../src";

describe("comboFor", () => {
  it("starts at 1.0x and adds 0.1x per extra person", () => {
    expect(comboFor(0)).toBe(1);
    expect(comboFor(1)).toBe(1);
    expect(comboFor(6)).toBe(1.5);
    expect(formatCombo(comboFor(6))).toBe("1.5x");
  });

  it("caps at 2.0x", () => {
    expect(comboFor(11)).toBe(2);
    expect(comboFor(500)).toBe(2);
  });

  it("is always 1.0x when admins turn it off", () => {
    expect(comboFor(8, false)).toBe(1);
  });
});

describe("XP", () => {
  it("matches the design's break screen: 25 minutes at 1.5x is 50 base, 75 earned", () => {
    expect(baseFocusXp(25)).toBe(50);
    expect(focusXp(25, 1.5)).toBe(75);
  });

  it("only counts whole minutes", () => {
    expect(baseFocusXp(4.99)).toBe(8);
  });

  it("applies the daily cap without going negative", () => {
    expect(applyDailyCap(75, 0, 300)).toBe(75);
    expect(applyDailyCap(75, 260, 300)).toBe(40);
    expect(applyDailyCap(75, 300, 300)).toBe(0);
    expect(applyDailyCap(75, 350, 300)).toBe(0);
    expect(applyDailyCap(-5, 0, 300)).toBe(0);
  });

  it("needs 500 XP at level 7, like the design", () => {
    expect(xpForLevel(7)).toBe(500);
  });

  it("derives level progress from total XP", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 200 });
    expect(levelFromXp(199).level).toBe(1);
    expect(levelFromXp(200)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 250 });
    // Levels 1-6 need 200+250+300+350+400+450 = 1950.
    expect(levelFromXp(1950 + 415)).toEqual({ level: 7, xpIntoLevel: 415, xpForNextLevel: 500 });
    expect(levelFromXp(-10).level).toBe(1);
  });
});

describe("boss", () => {
  const boss = newBoss("2026-10-26", "Midterms", 100);

  it("converts HP hours into minutes", () => {
    expect(boss.maxHpMinutes).toBe(6000);
    expect(bossHpLeftMinutes(boss)).toBe(6000);
  });

  it("takes damage and tracks contributors once each", () => {
    const first = applyDamage(boss, 225, ["a", "b"], 1);
    const second = applyDamage(first.boss, 30, ["b", "c"], 2);
    expect(second.boss.damageMinutes).toBe(255);
    expect(second.boss.contributorIds.sort()).toEqual(["a", "b", "c"]);
    expect(second.defeatedNow).toBe(false);
  });

  it("is defeated exactly once and never overkilled", () => {
    const small = newBoss("w", "Quiz", 1);
    const hit = applyDamage(small, 90, ["a"], 5);
    expect(hit.defeatedNow).toBe(true);
    expect(hit.boss.damageMinutes).toBe(60);
    expect(hit.boss.defeatedAt).toBe(5);
    const again = applyDamage(hit.boss, 10, ["b"], 6);
    expect(again.defeatedNow).toBe(false);
    expect(again.boss).toBe(hit.boss);
  });

  it("ignores zero or negative damage", () => {
    expect(applyDamage(boss, 0, ["a"], 1).boss).toBe(boss);
    expect(applyDamage(boss, -5, ["a"], 1).boss).toBe(boss);
  });

  describe("reconfigureBoss", () => {
    it("renames and resizes without healing", () => {
      const hurt = applyDamage(boss, 600, ["a"], 1).boss;
      const result = reconfigureBoss(hurt, "Finals", 50, 2);
      expect(result.boss.name).toBe("Finals");
      expect(result.boss.maxHpMinutes).toBe(3000);
      expect(result.boss.damageMinutes).toBe(600);
      expect(result.defeatedNow).toBe(false);
    });

    it("defeats the boss when HP drops below damage dealt", () => {
      const hurt = applyDamage(boss, 600, ["a"], 1).boss;
      const result = reconfigureBoss(hurt, "Midterms", 5, 2);
      expect(result.defeatedNow).toBe(true);
      expect(result.boss.damageMinutes).toBe(300);
    });

    it("keeps a defeated boss defeated", () => {
      const dead = applyDamage(newBoss("w", "Quiz", 1), 60, ["a"], 1).boss;
      const result = reconfigureBoss(dead, "Quiz 2", 100, 2);
      expect(result.boss.defeatedAt).toBe(1);
      expect(result.boss.maxHpMinutes).toBe(60);
      expect(result.defeatedNow).toBe(false);
    });
  });
});

describe("bossNameFor", () => {
  it("keeps the admin's custom name", () => {
    expect(bossNameFor("2026-10-26", "Calc II")).toBe("Calc II");
  });

  it("gives every week a built-in name and moves to the next one each Monday", () => {
    const first = BOSS_NAMES.indexOf(bossNameFor("2026-10-26", ""));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(bossNameFor("2026-11-02", "")).toBe(BOSS_NAMES[(first + 1) % BOSS_NAMES.length]);
  });

  it("does not repeat a name until the list runs out", () => {
    const names = new Set<string>();
    for (let week = 0; week < BOSS_NAMES.length; week++) {
      const monday = new Date(Date.UTC(2026, 9, 26) + week * 7 * 86_400_000);
      names.add(bossNameFor(monday.toISOString().slice(0, 10), ""));
    }
    expect(names.size).toBe(BOSS_NAMES.length);
  });

  it("only has names that fit the 40-character limit", () => {
    expect(new Set(BOSS_NAMES).size).toBe(BOSS_NAMES.length);
    for (const name of BOSS_NAMES) expect(name.length).toBeLessThanOrEqual(40);
  });
});
