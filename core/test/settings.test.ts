import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSettings, PRESETS, SETTINGS } from "../src";

const room = SETTINGS.room;
const game = SETTINGS.game;

describe("parseSettings", () => {
  it("falls back to defaults when Root sends nothing", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_CONFIG);
    expect(parseSettings({})).toEqual(DEFAULT_CONFIG);
  });

  it("reads select, channel, time and checkbox values in Root's shapes", () => {
    const config = parseSettings({
      [room.group]: {
        [room.preset]: ["50-10"],
        [room.postChannel]: ["channel-9"],
        [room.recapTime]: { hours: 20, minutes: 30, seconds: 0 },
        [room.timeZone]: ["Europe/Berlin"],
        [room.busyPosts]: false,
      },
      [game.group]: {
        [game.bossName]: "  The Final Boss: Calc II  ",
        [game.bossHp]: 40,
        [game.comboEnabled]: false,
      },
    });
    expect(config.preset).toEqual(PRESETS["50-10"]);
    expect(config.postChannelId).toBe("channel-9");
    expect(config.recap).toEqual({ enabled: true, hours: 20, minutes: 30 });
    expect(config.timeZone).toBe("Europe/Berlin");
    expect(config.busyPosts.enabled).toBe(false);
    expect(config.boss).toEqual({ enabled: true, name: "The Final Boss: Calc II", hpHours: 40 });
    expect(config.comboEnabled).toBe(false);
  });

  it("builds a custom preset and clamps it to sane ranges", () => {
    const config = parseSettings({
      [room.group]: { [room.preset]: ["custom"], [room.customFocus]: 500, [room.customBreak]: 0 },
    });
    expect(config.presetKey).toBe("custom");
    expect(config.preset.focusMinutes).toBe(120);
    expect(config.preset.breakMinutes).toBe(1);
  });

  it("reads numbers from select keys, the way the manifest declares them", () => {
    const config = parseSettings({
      [room.group]: { [room.busyThreshold]: ["8"] },
      [game.group]: { [game.dailyXpCap]: ["500"], [game.bossHp]: ["25"] },
    });
    expect(config.busyPosts.threshold).toBe(8);
    expect(config.xp.dailyCap).toBe(500);
    expect(config.boss.hpHours).toBe(25);
  });

  it("rejects bad values instead of trusting them", () => {
    const config = parseSettings({
      [room.group]: {
        [room.preset]: ["9000-1"],
        [room.timeZone]: ["Mars/Olympus"],
        [room.postChannel]: [],
        [room.recapTime]: "21:00",
        [room.busyThreshold]: Number.NaN,
      },
      [game.group]: {
        [game.xpEnabled]: "yes",
        [game.dailyXpCap]: -5,
        [game.bossName]: "   ",
        [game.bossHp]: ["lots"],
      },
    });
    expect(config.preset).toEqual(DEFAULT_CONFIG.preset);
    expect(config.timeZone).toBe(DEFAULT_CONFIG.timeZone);
    expect(config.postChannelId).toBeNull();
    expect(config.recap).toEqual(DEFAULT_CONFIG.recap);
    expect(config.busyPosts.threshold).toBe(5);
    expect(config.xp).toEqual({ enabled: true, dailyCap: 50 });
    expect(config.boss.name).toBe("Midterms");
  });
});
