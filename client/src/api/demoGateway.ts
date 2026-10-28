import {
  addDays,
  customPreset,
  dayKey,
  DEFAULT_CONFIG,
  newBoss,
  weekKey,
  MemoryStore,
  StudyRoomEngine,
  type AppConfig,
  type MyStatusDto,
  type PersonalResultDto,
  type PhaseCompletedDto,
  type RecapDto,
  type RoomStateDto,
  type WakeScheduler,
} from "@studyroom/core";
import type { GatewayHandlers, Profile, StartRequest, StudyRoomGateway } from "./gateway";
import { toGatewayError } from "./gateway";

const MINUTE = 60_000;
export const DEMO_USER_ID = "demo-you";

export interface DemoOptions {
  /** Room timer focus length in minutes. Fractions allowed so tests can run fast. */
  focusMinutes?: number;
  breakMinutes?: number;
  /** How far into round 1 the room is when the page opens. */
  elapsedMinutes: number;
  bots: boolean;
}

interface Bot {
  userId: string;
  name: string;
  goal: string;
  /** Lifetime XP and streak, so the board looks like a room that's been open a while. */
  xp: number;
  streak: number;
  /** Earned badges, oldest first, so cards show a few. */
  badges: string[];
  cardStyle?: string;
  private?: boolean;
  solo?: number;
}

const BOTS: Bot[] = [
  {
    userId: "bot-ana",
    name: "Ana R.",
    goal: "Orgo ch. 4 notes",
    xp: 5600,
    streak: 31,
    badges: ["first-boss", "streak-30", "night-owl"],
    cardStyle: "midnight",
  },
  {
    userId: "bot-marcus",
    name: "Marcus",
    goal: "LeetCode: 3 mediums",
    xp: 3200,
    streak: 12,
    badges: ["squad-up", "leet", "streak-7"],
  },
  {
    userId: "bot-priya",
    name: "Priya",
    goal: "Thesis lit review",
    xp: 8200,
    streak: 54,
    badges: ["focus-100h", "streak-50", "three-am"],
    private: true,
    solo: 45,
  },
  {
    userId: "bot-devon",
    name: "Devon",
    goal: "Essay intro draft",
    xp: 900,
    streak: 3,
    badges: ["streak-3"],
  },
  {
    userId: "bot-jordan",
    name: "Jordan",
    goal: "Stats HW 5",
    xp: 1700,
    streak: 8,
    badges: ["early-bird", "comeback"],
  },
  {
    userId: "bot-lena",
    name: "Lena",
    goal: "Anki: 120 cards",
    xp: 2200,
    streak: 9,
    badges: ["productive-day", "speedrun"],
    solo: 25,
  },
  {
    userId: "bot-kai",
    name: "Kai",
    goal: "Spanish reading",
    xp: 3900,
    streak: 17,
    badges: ["marathon", "full-house", "first-boss"],
  },
];

/** You start at level 7 on a 5-day streak, so finishing a round makes it 6. */
const YOU = {
  xp: 2315,
  streak: 5,
  badges: ["first-session", "squad-up", "first-goal", "streak-3", "level-5"],
};
/** The weekly boss starts 39% down. */
const BOSS_DAMAGE_SHARE = 0.39;

/** Reads demo knobs from the URL, e.g. `?focus=0.2&break=0.1&bots=0`. */
export function demoOptionsFromSearch(search: string): DemoOptions {
  const params = new URLSearchParams(search);
  const positive = (key: string) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  return {
    focusMinutes: positive("focus"),
    breakMinutes: positive("break"),
    elapsedMinutes: positive("elapsed") ?? (params.has("focus") ? 0 : 10.5),
    bots: params.get("bots") !== "0",
  };
}

class BrowserScheduler implements WakeScheduler {
  private handle: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly now: () => number) {}
  wakeAt(at: number, callback: () => void) {
    this.cancel();
    this.handle = setTimeout(callback, Math.max(0, at - this.now()));
  }
  cancel() {
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }
}

function demoConfig(options: DemoOptions): AppConfig {
  const custom = options.focusMinutes !== undefined || options.breakMinutes !== undefined;
  const preset = custom
    ? customPreset(options.focusMinutes ?? 25, options.breakMinutes ?? 5)
    : DEFAULT_CONFIG.preset;
  return {
    ...DEFAULT_CONFIG,
    presetKey: custom ? "custom" : DEFAULT_CONFIG.presetKey,
    preset,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    postChannelId: "demo-channel",
    postChannelName: "study-hall",
  };
}

/**
 * Runs the real StudyRoomEngine in the browser on an in-memory store, with a
 * few simulated members. Used for local UI work and end-to-end tests.
 */
export class DemoGateway implements StudyRoomGateway {
  readonly kind = "demo" as const;
  /** Posts the app would have made in a Root channel. */
  readonly posts: string[] = [];
  private readonly listeners = new Set<GatewayHandlers>();
  private readonly engine: StudyRoomEngine;
  private readonly store = new MemoryStore();
  private readonly config: AppConfig;
  private readonly pendingBots = new Set<string>();
  private skewMs = 0;
  private nextId = 1;

  private constructor(private readonly options: DemoOptions) {
    const now = () => Date.now() + this.skewMs;
    this.config = demoConfig(options);
    this.engine = new StudyRoomEngine({
      store: this.store,
      clock: { now },
      scheduler: new BrowserScheduler(now),
      notifier: {
        roomUpdated: (room: RoomStateDto) => this.emit((h) => h.roomUpdated(room)),
        phaseCompleted: (event: PhaseCompletedDto) => this.emit((h) => h.phaseCompleted(event)),
        personalResult: (userId: string, event: PersonalResultDto) => {
          if (userId === DEMO_USER_ID) this.emit((h) => h.personalResult(event));
        },
        myStatusUpdated: (userId: string, me: MyStatusDto) => {
          if (userId === DEMO_USER_ID) this.emit((h) => h.myStatus(me));
          else this.keepBotBusy(userId, me);
        },
        badgesEarned: (userId: string, badgeIds: string[]) => {
          if (userId === DEMO_USER_ID) this.emit((h) => h.badgesEarned(badgeIds));
        },
      },
      announcer: {
        busyRoom: async (_c, count, combo) =>
          this.post(`${count} people are focusing right now. Combo is at ${combo}x.`),
        streakMilestone: async (_c, userId, streak) =>
          this.post(`${this.nameOf(userId)} just hit a ${streak} day streak.`),
        bossDefeated: async (_c, name) => this.post(`The room defeated ${name}!`),
        dailyRecap: async (_c, recap: RecapDto) => this.post(`${recap.weekday} recap`),
      },
      logger: console,
      config: this.config,
      newId: () => `demo-${this.nextId++}`,
    });
  }

  static async create(options: DemoOptions): Promise<DemoGateway> {
    const gateway = new DemoGateway(options);
    await gateway.seed();
    return gateway;
  }

  /** Bots join in the past so the room opens mid-round, like a real busy evening. */
  private async seed() {
    await this.seedHistory();
    if (this.options.bots) {
      this.skewMs = -this.options.elapsedMinutes * MINUTE;
      for (const bot of BOTS) await this.startBot(bot);
      this.skewMs = 0;
    }
    await this.engine.setPresence([
      DEMO_USER_ID,
      ...(this.options.bots ? BOTS.map((b) => b.userId) : []),
    ]);
    await this.engine.start();
  }

  private async seedHistory() {
    const tz = this.config.timeZone;
    const yesterday = addDays(dayKey(Date.now(), tz), -1);
    const member = (userId: string, xp: number, streak: number) =>
      this.store.members.save({
        userId,
        xpTotal: xp,
        streak: { streak, lastActiveDay: yesterday, freezeWeeksUsed: [] },
        goalsPrivate: null,
      });
    await member(DEMO_USER_ID, YOU.xp, YOU.streak);
    const earnedAt = Date.now() - 30 * 24 * 60 * MINUTE;
    const award = async (userId: string, badges: readonly string[]) => {
      for (const [i, badgeId] of badges.entries())
        await this.store.badges.award({ userId, badgeId, earnedAt: earnedAt + i * MINUTE });
    };
    await award(DEMO_USER_ID, YOU.badges);
    // Five weeks of history: the last YOU.streak days active, a gap before that, then a mixed record.
    const today = dayKey(Date.now(), tz);
    for (let back = 1; back < 35; back++) {
      const minutes =
        back <= YOU.streak
          ? 30 + ((back * 37) % 90)
          : back === YOU.streak + 1
            ? 0
            : (back * 53) % 4 === 0
              ? 0
              : (back * 29) % 140;
      if (minutes > 0)
        await this.store.stats.add(DEMO_USER_ID, addDays(today, -back), { focusMinutes: minutes });
    }
    if (!this.options.bots) return;
    // Earlier days this week, so the weekly leaderboard has standings to show.
    for (const [i, bot] of BOTS.entries()) {
      for (let day = weekKey(today); day < today; day = addDays(day, 1)) {
        const focusMinutes = 30 + ((i * 47 + Number(day.slice(-2)) * 29) % 120);
        await this.store.stats.add(bot.userId, day, { focusMinutes });
      }
    }
    for (const bot of BOTS) {
      await member(bot.userId, bot.xp, bot.streak);
      await award(bot.userId, bot.badges);
      if (bot.cardStyle)
        await this.store.cards.save({ userId: bot.userId, style: bot.cardStyle, showcase: null });
    }
    const boss = newBoss(
      weekKey(dayKey(Date.now(), tz)),
      this.config.boss.name,
      this.config.boss.hpHours,
    );
    await this.store.bosses.save({
      ...boss,
      damageMinutes: Math.round(boss.maxHpMinutes * BOSS_DAMAGE_SHARE),
    });
  }

  private async startBot(bot: Bot) {
    const start = { goals: [bot.goal], goalsPrivate: bot.private ?? false };
    if (bot.solo) await this.engine.startSolo(bot.userId, bot.solo, start);
    else await this.engine.joinRoomTimer(bot.userId, start);
  }

  /**
   * Bots tap "Keep going?", and when a bot's session ends anyway it starts
   * another a few seconds later, so the room never empties.
   */
  private keepBotBusy(userId: string, me: MyStatusDto) {
    const bot = BOTS.find((b) => b.userId === userId);
    if (bot && me.keepGoingEndsAt > 0) {
      this.engine.keepGoing(userId).catch(() => undefined);
      return;
    }
    if (!bot || me.status !== "idle" || this.pendingBots.has(userId)) return;
    this.pendingBots.add(userId);
    setTimeout(() => {
      this.pendingBots.delete(userId);
      const start = {
        goals: me.goals.some((g) => !g.done) ? [] : [bot.goal],
        goalsPrivate: bot.private ?? false,
      };
      const work = bot.solo
        ? this.engine.startSolo(userId, bot.solo, start)
        : this.engine.joinRoomTimer(userId, start);
      work.catch(() => undefined);
    }, 3_000);
  }

  private emit(fn: (handlers: GatewayHandlers) => void) {
    for (const listener of this.listeners) fn(listener);
  }

  private post(text: string) {
    this.posts.push(text);
    console.info(`[demo] #study-hall: ${text}`);
  }

  private nameOf(userId: string) {
    return userId === DEMO_USER_ID
      ? "You"
      : (BOTS.find((b) => b.userId === userId)?.name ?? "Someone");
  }

  private async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw toGatewayError(error);
    }
  }

  currentUserId() {
    return DEMO_USER_ID;
  }

  now() {
    return Date.now() + this.skewMs;
  }

  getSnapshot() {
    return this.call(() => this.engine.getSnapshot(DEMO_USER_ID));
  }

  joinRoomTimer(request: StartRequest) {
    return this.call(() => this.engine.joinRoomTimer(DEMO_USER_ID, request));
  }

  leaveRoomTimer() {
    return this.call(() => this.engine.leaveRoomTimer(DEMO_USER_ID));
  }

  startSolo(minutes: number, request: StartRequest) {
    return this.call(() => this.engine.startSolo(DEMO_USER_ID, minutes, request));
  }

  endSolo() {
    return this.call(() => this.engine.endSolo(DEMO_USER_ID));
  }

  addGoal(text: string) {
    return this.call(() => this.engine.addGoal(DEMO_USER_ID, text));
  }

  setGoalDone(goalId: string, done: boolean) {
    return this.call(() => this.engine.setGoalDone(DEMO_USER_ID, goalId, done));
  }

  deleteGoal(goalId: string) {
    return this.call(() => this.engine.deleteGoal(DEMO_USER_ID, goalId));
  }

  setGoalsPrivate(goalsPrivate: boolean) {
    return this.call(() => this.engine.setGoalsPrivate(DEMO_USER_ID, goalsPrivate));
  }

  deleteMyData() {
    return this.call(() => this.engine.deleteMyData(DEMO_USER_ID));
  }

  keepGoing() {
    return this.call(() => this.engine.keepGoing(DEMO_USER_ID));
  }

  getProgress() {
    return this.call(() => this.engine.getProgress(DEMO_USER_ID));
  }

  getLeaderboard() {
    return this.call(() => this.engine.getLeaderboard(DEMO_USER_ID));
  }

  setLeaderboardHidden(hidden: boolean) {
    return this.call(() => this.engine.setLeaderboardHidden(DEMO_USER_ID, hidden));
  }

  setCardStyle(style: string) {
    return this.call(() => this.engine.setCardStyle(DEMO_USER_ID, style));
  }

  setBadgeShowcase(badgeIds: string[]) {
    return this.call(() => this.engine.setBadgeShowcase(DEMO_USER_ID, badgeIds));
  }

  async getProfiles(userIds: string[]): Promise<Profile[]> {
    return userIds.map((userId) => ({ userId, name: this.nameOf(userId) }));
  }

  subscribe(handlers: GatewayHandlers) {
    this.listeners.add(handlers);
    return () => {
      this.listeners.delete(handlers);
    };
  }
}
