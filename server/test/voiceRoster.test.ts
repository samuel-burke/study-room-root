import { describe, expect, it, vi } from "vitest";
import { VoiceRoster } from "../src/adapters/voiceRoster";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function roster(already: { userId: string; deviceId: string }[] = []) {
  const published: string[][] = [];
  const log = logger();
  const voice = new VoiceRoster(
    vi.fn(async () => already),
    async (ids) => {
      published.push(ids);
    },
    log,
  );
  return { voice, published, log };
}

const at = (userId: string, deviceId = "d1", channelId = "voice") => ({
  channelId,
  userId,
  deviceId,
});

describe("VoiceRoster", () => {
  it("loads who is already in the channel", async () => {
    const { voice, published } = roster([at("ana"), at("kai")]);
    await voice.watch("voice");
    expect(published).toEqual([["ana", "kai"]]);
  });

  it("follows joins and leaves in the watched channel only", async () => {
    const { voice, published } = roster();
    await voice.watch("voice");
    await voice.attached(at("ana"));
    await voice.attached(at("kai", "d1", "other"));
    await voice.detached(at("ana"));
    expect(published).toEqual([[], ["ana"], []]);
  });

  it("keeps a member in voice until their last device leaves", async () => {
    const { voice, published } = roster();
    await voice.watch("voice");
    await voice.attached(at("ana", "phone"));
    await voice.attached(at("ana", "laptop"));
    await voice.detached(at("ana", "phone"));
    expect(voice.userIds()).toEqual(["ana"]);
    await voice.detached(at("ana", "laptop"));
    expect(published).toEqual([[], ["ana"], []]);
  });

  it("clears the list when the channel is removed", async () => {
    const { voice, published } = roster([at("ana")]);
    await voice.watch("voice");
    await voice.watch(null);
    await voice.attached(at("kai"));
    expect(published).toEqual([["ana"], []]);
  });

  it("logs instead of throwing when Root or the engine fails", async () => {
    const log = logger();
    const voice = new VoiceRoster(
      async () => {
        throw new Error("403");
      },
      async () => {
        throw new Error("database is locked");
      },
      log,
    );
    await expect(voice.watch("voice")).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith("could not list voice channel", { error: "Error: 403" });
    expect(log.error).toHaveBeenCalledWith("voice update failed", {
      error: "Error: database is locked",
    });
  });
});
