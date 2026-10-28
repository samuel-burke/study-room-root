import {
  bossDefeatedPost,
  busyRoomPost,
  dailyRecapPost,
  safeDisplayName,
  streakMilestonePost,
  type Announcer,
  type RecapDto,
} from "@studyroom/core";

export interface ChannelPort {
  postMessage(channelId: string, content: string): Promise<void>;
  /** The member's community nickname, unsanitised. */
  nickname(userId: string): Promise<string | undefined>;
}

const NAME_TTL_MS = 10 * 60 * 1000;

/** Formats and posts channel messages. Display names are sanitised before use. */
export class ChannelAnnouncer implements Announcer {
  private readonly names = new Map<string, { name: string; at: number }>();

  constructor(
    private readonly channel: ChannelPort,
    private readonly now: () => number = Date.now,
  ) {}

  async busyRoom(channelId: string, focusingCount: number, combo: number): Promise<void> {
    await this.channel.postMessage(channelId, busyRoomPost(focusingCount, combo));
  }

  async streakMilestone(channelId: string, userId: string, streak: number): Promise<void> {
    await this.channel.postMessage(
      channelId,
      streakMilestonePost(await this.displayName(userId), streak),
    );
  }

  async bossDefeated(
    channelId: string,
    bossName: string,
    contributorCount: number,
    lootXp: number,
  ): Promise<void> {
    await this.channel.postMessage(
      channelId,
      bossDefeatedPost(safeDisplayName(bossName), contributorCount, lootXp),
    );
  }

  async dailyRecap(channelId: string, recap: RecapDto): Promise<void> {
    const names = new Map<string, string>();
    for (const { userId } of recap.topStreaks) names.set(userId, await this.displayName(userId));
    const safeRecap = recap.boss
      ? { ...recap, boss: { ...recap.boss, name: safeDisplayName(recap.boss.name) } }
      : recap;
    await this.channel.postMessage(channelId, dailyRecapPost(safeRecap, names));
  }

  private async displayName(userId: string): Promise<string> {
    const cached = this.names.get(userId);
    if (cached && this.now() - cached.at < NAME_TTL_MS) return cached.name;
    let name = "Someone";
    try {
      name = safeDisplayName(await this.channel.nickname(userId));
    } catch {
      // A missing profile shouldn't block the post.
    }
    this.names.set(userId, { name, at: this.now() });
    return name;
  }
}
