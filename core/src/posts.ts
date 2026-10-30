import { formatCombo } from "./game/combo";
import { formatHours, formatXp, pluralize } from "./format";
import type { RecapDto } from "./dto";
import type { PhaseKind } from "./timer/roomCycle";

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
        : `${recap.boss.name}: down to ${formatXp(recap.boss.hpLeftXp)} HP · ${pluralize(recap.boss.daysLeft, "day")} left`,
    );
  }
  if (recap.topStreaks.length > 0) {
    const streaks = recap.topStreaks.map((s) => `${names.get(s.userId) ?? "Someone"} ${s.streak}`);
    lines.push(`Top streaks: ${streaks.join(" · ")}`);
  }
  if (recap.topFocus.length > 0) {
    const leaders = recap.topFocus.map(
      (f, i) => `${i + 1}. ${names.get(f.userId) ?? "Someone"} ${formatHours(f.focusMinutes)}`,
    );
    lines.push(`This week: ${leaders.join(" · ")}`);
  }
  return lines.join("\n");
}

/** Rotating lines for the room clock switching. Each starts with the cue itself. */
export const PHASE_CALLOUT_LINES: Readonly<Record<PhaseKind, readonly string[]>> = {
  focus: [
    "Study time! Put the snacks down slowly and back away from the fridge.",
    "Break's over. The books missed you. They didn't say it, but they did.",
    "Study time. Phones face down, brains face up.",
    "Back to work. Your future self just sent a thank-you note in advance.",
    "Recess is over. The textbook is giving you that look again.",
    "Study time! Focus mode on, group chat dramatically ignored.",
    "Study time. Hydrated? Stretched? Out of excuses? Perfect.",
    "Back at it. Somewhere, a highlighter is trembling with excitement.",
    "Study time! Pretend the exam is tomorrow. For some of you, it is.",
    "The break has left the building. Time to get back to it.",
    "Study time! Make this the round you brag about later.",
    "Break's done. Productivity has entered the chat.",
  ],
  break: [
    "Break time! Step away from the notes. They'll still be confusing in five minutes.",
    "Break time. Stand up, stretch, and remember you have legs.",
    "Pens down! You've earned a snack. A small one. Okay, a medium one.",
    "Break time! Go drink some water, you magnificent scholar.",
    "Break! Your brain asked me to tell you it needs a minute.",
    "Break time. Look at something far away. A wall counts. Walls are nice.",
    "Round done! Go check your phone guilt-free. For once.",
    "Break time. Blink a few times. Your eyes have been through a lot.",
    "Pause! This is your official permission to stare out of a window.",
    "Break time! You studied, you conquered, you may now wander to the kitchen.",
    "Break time. Shake it out. Nobody's watching. Okay, we're watching a little.",
  ],
  longBreak: [
    "Long break! Four rounds down. You're basically a professor now.",
    "Cycle complete! Go touch some grass. Real grass, not a screenshot of grass.",
    "Long break time. Get a proper snack. You've earned the good one.",
    "Full cycle done! Somebody alert the dean. Take a long break, legends.",
    "Long break! Go lie on the floor dramatically. It's tradition.",
    "That's a whole cycle. Your brain is officially toast. Go butter it.",
  ],
};

const PHASE_CALLOUT_ICONS: Readonly<Record<PhaseKind, string>> = {
  focus: "📚",
  break: "☕",
  longBreak: "🎉",
};

/** Mentions shown before the rest are summed up, so a full room doesn't flood the post. */
export const PHASE_CALLOUT_MAX_MENTIONS = 10;

/**
 * The post when the room clock switches. `mentions` are ready-made mention
 * tags (or cleaned names) for the first few of `memberCount` people in the
 * room; `line` picks a line, wrapping around the list.
 */
export function phaseCalloutPost(
  kind: PhaseKind,
  mentions: readonly string[],
  memberCount: number,
  line: number,
): string {
  const lines = PHASE_CALLOUT_LINES[kind];
  const text = lines[((line % lines.length) + lines.length) % lines.length]!;
  const shown = mentions.slice(0, PHASE_CALLOUT_MAX_MENTIONS);
  const extra = Math.max(0, memberCount - shown.length);
  const who = extra > 0 ? `${shown.join(" ")} and ${pluralize(extra, "other")}` : shown.join(" ");
  const keepGoing =
    kind === "longBreak" ? " Tap Keep going in Study Squad to roll into the next cycle." : "";
  return `${PHASE_CALLOUT_ICONS[kind]} ${who} ${text}${keepGoing}`.replace(/ {2,}/g, " ");
}
