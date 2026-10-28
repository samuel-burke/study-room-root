import { describe, expect, it, vi } from "vitest";
import { createShutdown, loadConfig, presenceHandlers } from "../src/wiring";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("loadConfig", () => {
  it("adds the post channel's name", async () => {
    const channelName = vi.fn(async () => "study-hall");
    const config = await loadConfig({ room: { postChannel: "channel-1" } }, channelName, logger());
    expect(channelName).toHaveBeenCalledWith("channel-1");
    expect(config).toMatchObject({ postChannelId: "channel-1", postChannelName: "study-hall" });
  });

  it("skips the lookup when no channel is set", async () => {
    const channelName = vi.fn(async () => "unused");
    const config = await loadConfig(undefined, channelName, logger());
    expect(channelName).not.toHaveBeenCalled();
    expect(config.postChannelId).toBeNull();
  });

  it("keeps the settings and logs when the channel can't be read", async () => {
    const log = logger();
    const config = await loadConfig(
      { room: { postChannel: "channel-1" } },
      async () => {
        throw new Error("403");
      },
      log,
    );
    expect(config.postChannelId).toBe("channel-1");
    expect(log.warn).toHaveBeenCalledWith("could not read post channel", { error: "Error: 403" });
  });
});

describe("presenceHandlers", () => {
  it("passes attach and detach through to the engine", async () => {
    const engine = { userAttached: vi.fn(async () => {}), userDetached: vi.fn(async () => {}) };
    const presence = presenceHandlers(engine, logger());
    await presence.attached("ana");
    await presence.detached("ana");
    expect(engine.userAttached).toHaveBeenCalledWith("ana");
    expect(engine.userDetached).toHaveBeenCalledWith("ana");
  });

  it("logs a failed update instead of rejecting", async () => {
    const log = logger();
    const engine = {
      userAttached: vi.fn(() => Promise.reject(new Error("database is locked"))),
      userDetached: vi.fn(() => Promise.reject("gone")),
    };
    const presence = presenceHandlers(engine, log);
    await expect(presence.attached("ana")).resolves.toBeUndefined();
    await expect(presence.detached("ana")).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(
      "presence update failed",
      expect.objectContaining({ operation: "userAttached" }),
    );
    expect(log.error).toHaveBeenCalledWith("presence update failed", {
      operation: "userDetached",
      error: "gone",
    });
  });
});

describe("createShutdown", () => {
  it("stops the engine, drains it, then closes the database", async () => {
    const order: string[] = [];
    const engine = {
      stop: vi.fn(() => order.push("stop")),
      idle: vi.fn(async () => void order.push("idle")),
    };
    await createShutdown(engine, async () => void order.push("close"), logger())();
    expect(order).toEqual(["stop", "idle", "close"]);
  });

  it("closes the database even when draining fails", async () => {
    const log = logger();
    const close = vi.fn(async () => {});
    const engine = { stop: vi.fn(), idle: vi.fn(() => Promise.reject(new Error("stuck"))) };
    await createShutdown(engine, close, log)();
    expect(close).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("shutdown drain failed", expect.anything());
  });
});
