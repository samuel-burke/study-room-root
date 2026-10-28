import { formatCombo } from "./game/combo";
import { formatHours, pluralize } from "./format";
import type { RecapDto } from "./dto";

/**
 * Text for the posts Study Squad drops into a Root channel. Names passed in
 * must already be cleaned with safeDisplayName.
 */

export function busyRoomPost(focusingCount: number, combo: number): string {
  return `📚 ${focusingCount} people are focusing right now. Combo is at ${formatCombo(combo)}. Open Study Squad to join the room timer.`;
}

export function streakMilestonePost(name: string, streak: number): string {
  return `🔥 ${name} just hit a ${streak} day streak.`;
}

export function bossDefeatedPost(
  bossName: string,
  contributorCount: number,
  lootXp: number,
): string {
  const loot = lootXp > 0 ? ` Everyone who pitched in earned +${lootXp} XP.` : "";
  return `⚔️ The room defeated ${bossName}! ${pluralize(contributorCount, "person", "people")} dealt damage this week.${loot}`;
}

export function dailyRecapPost(recap: RecapDto, names: ReadonlyMap<string, string>): string {
  const lines = [
    `${recap.weekday} recap`,
    `${formatHours(recap.focusMinutes)} focused as a community · ${pluralize(recap.goalsDone, "goal")} finished · ${pluralize(recap.activeMembers, "member")} showed up`,
  ];
  if (recap.boss) {
    lines.push(
      recap.boss.defeated
        ? `${recap.boss.name}: defeated 🎉`
        : `${recap.boss.name}: down to ${formatHours(recap.boss.hpLeftMinutes)} HP · ${pluralize(recap.boss.daysLeft, "day")} left`,
    );
  }
  if (recap.topStreaks.length > 0) {
    const streaks = recap.topStreaks.map((s) => `${names.get(s.userId) ?? "Someone"} ${s.streak}`);
    lines.push(`Top streaks: ${streaks.join(" · ")}`);
  }
  return lines.join("\n");
}
