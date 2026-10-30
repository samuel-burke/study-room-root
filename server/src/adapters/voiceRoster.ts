import type { Logger } from "@studyroom/core";

export interface VoiceDevice {
  channelId: string;
  userId: string;
  deviceId: string;
}

/**
 * Tracks who is in the admin's voice channel from Root's voice events. A
 * member can join from more than one device, so they count as in voice until
 * their last device leaves. Failures are logged, never thrown, because the
 * events arrive outside any request.
 */
export class VoiceRoster {
  private channelId: string | null = null;
  private readonly devices = new Map<string, Set<string>>();

  constructor(
    private readonly list: (channelId: string) => Promise<Omit<VoiceDevice, "channelId">[]>,
    private readonly publish: (userIds: string[]) => Promise<void>,
    private readonly logger: Logger,
  ) {}

  /** Switches to a channel (or none) and loads who is already in it. */
  async watch(channelId: string | null): Promise<void> {
    this.channelId = channelId;
    this.devices.clear();
    if (channelId) {
      try {
        const members = await this.list(channelId);
        if (this.channelId !== channelId) return;
        for (const m of members) this.add(m.userId, m.deviceId);
      } catch (error) {
        this.logger.warn("could not list voice channel", { error: String(error) });
      }
    }
    await this.send();
  }

  async attached(event: VoiceDevice): Promise<void> {
    if (event.channelId !== this.channelId) return;
    if (this.add(event.userId, event.deviceId)) await this.send();
  }

  async detached(event: VoiceDevice): Promise<void> {
    if (event.channelId !== this.channelId) return;
    const devices = this.devices.get(event.userId);
    if (!devices?.delete(event.deviceId) || devices.size > 0) return;
    this.devices.delete(event.userId);
    await this.send();
  }

  userIds(): string[] {
    return [...this.devices.keys()];
  }

  /** Returns true when the member wasn't in voice before. */
  private add(userId: string, deviceId: string): boolean {
    const devices = this.devices.get(userId);
    if (devices) {
      devices.add(deviceId);
      return false;
    }
    this.devices.set(userId, new Set([deviceId]));
    return true;
  }

  private async send(): Promise<void> {
    try {
      await this.publish(this.userIds());
    } catch (error) {
      this.logger.error("voice update failed", { error: String(error) });
    }
  }
}
