import { describe, expect, it, vi } from "vitest";
import { createShutdown, loadConfig, presenceHandlers } from "../src/wiring";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("loadConfig", () => {
  const lookup = (name = async (_id: string) => "study-hall") => ({
    name: vi.fn(name),
    link: vi.fn(async (id: string) => `https://rootapp.com/${id}`),
  });

  it("adds the post channel's name", async () => {
    const channels = lookup();
    const config = await loadConfig({ room: { postChannel: "channel-1" } }, channels, logger());
    expect(channels.name).toHaveBeenCalledWith("channel-1");
    expect(config).toMatchObject({ postChannelId: "channel-1", postChannelName: "study-hall" });
  });

  it("adds the voice channel's name and link", async () => {
    const channels = lookup(async () => "Study voice");
    const config = await loadConfig({ room: { voiceChannel: "voice-1" } }, channels, logger());
    expect(config).toMatchObject({
      voiceChannelId: "voice-1",
      voiceChannelName: "Study voice",
      voiceChannelUrl: "https://rootapp.com/voice-1",
    });
  });

  it("skips the lookups when no channel is set", async () => {
    const channels = lookup();
    const config = await loadConfig(undefined, channels, logger());
    expect(channels.name).not.toHaveBeenCalled();
    expect(channels.link).not.toHaveBeenCalled();
    expect(config.postChannelId).toBeNull();
    expect(config.voiceChannelId).toBeNull();
  });

  it("keeps the settings and logs when a channel can't be read", async () => {
    const log = logger();
    const config = await loadConfig(
      { room: { postChannel: "channel-1", voiceChannel: "voice-1" } },
      lookup(async () => {
        throw new Error("403");
      }),
      log,
    );
    expect(config).toMatchObject({
      postChannelId: "channel-1",
      voiceChannelId: "voice-1",
      voiceChannelUrl: "",
    });
    expect(log.warn).toHaveBeenCalledWith("could not read post channel", { error: "Error: 403" });
    expect(log.warn).toHaveBeenCalledWith("could not read voice channel", { error: "Error: 403" });
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
