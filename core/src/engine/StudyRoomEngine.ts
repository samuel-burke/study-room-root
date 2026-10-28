import { BUSY_POST_COOLDOWN_MS, GAME, LIMITS, MINUTE_MS } from "../constants";
import type {
  BossDto,
  CardLookDto,
  GoalDto,
  MemberCardDto,
  MyStatusDto,
  PersonalResultDto,
  ProgressDto,
  QuestDto,
  RecapDto,
  RoomStateDto,
  RoomTimerDto,
  SnapshotDto,
} from "../dto";
import { conflictError, notFoundError, validationError } from "../errors";
import {
  applyDamage,
  bossHpLeftMinutes,
  newBoss,
  reconfigureBoss,
  type BossState,
} from "../game/boss";
import {
  newlyEarnedBadges,
  type BadgeFacts,
  type QuestFacts,
  type SessionFacts,
} from "../game/badges";
import { comboFor } from "../game/combo";
import { questProgress, questsForWeek, QUESTS_PER_WEEK, type QuestProgress } from "../game/quests";
import {
  cardStyleById,
  isCardStyleUnlocked,
  resolveCardStyle,
  resolveShowcase,
  SHOWCASE_SIZE,
} from "../game/cosmetics";
import { currentStreak, EMPTY_STREAK, freezeAvailable, recordActiveDay } from "../game/streak";
import { applyDailyCap, baseFocusXp, focusXp, levelFromXp } from "../game/xp";
import type { AppConfig } from "../settings";
import {
  addDays,
  dayKey,
  daysBetween,
  localTime,
  nextWeekStart,
  startOfDay,
  weekdayName,
  weekKey,
} from "../time/calendar";
import { buildCycle, cycleEndsAt, overlapMs, phaseAt, type CyclePhase } from "../timer/roomCycle";
import {
  validateGoalText,
  validateId,
  validateSoloMinutes,
  validateStartGoals,
} from "../validation";
import type {
  Announcer,
  CardRecord,
  Clock,
  EarnedBadgeRecord,
  GoalRecord,
  Logger,
  MemberRecord,
  Notifier,
  ParticipantRecord,
  Store,
  WakeScheduler,
} from "./ports";
import { SerialQueue } from "./serialQueue";

export interface EngineDeps {
  store: Store;
  clock: Clock;
  scheduler: WakeScheduler;
  notifier: Notifier;
  announcer: Announcer;
  logger: Logger;
  config: AppConfig;
  newId: () => string;
}

export interface StartOptions {
  goals?: readonly unknown[];
  goalsPrivate?: boolean;
}

interface BusyPostState {
  armed: boolean;
  lastPostedAt: number;
}

const BUSY_KEY = "busyPost";
const LAST_RECAP_KEY = "lastRecapDay";
/** How long to wait before retrying a wake-up whose tick failed. */
const TICK_RETRY_MS = 30_000;

/**
 * Side effects collected while a transaction runs, released only after it
 * commits. A failed operation therefore never notifies anyone.
 */
class Effects {
  readonly notifications: Array<(notifier: Notifier) => void> = [];
  readonly posts: Array<(announcer: Announcer) => Promise<void>> = [];
  roomChanged = false;
  readonly statusChanged = new Set<string>();
  /** Badges earned during the operation, per member, pushed once it commits. */
  readonly badges = new Map<string, string[]>();
}

/**
 * All Study Squad behaviour lives here, behind ports for storage, time,
 * scheduling, real-time pushes and channel posts. The Root server and the
 * browser demo both run this same class with different adapters.
 */
export class StudyRoomEngine {
  private readonly queue = new SerialQueue();
  private readonly pendingPosts = new Set<Promise<void>>();
  private readonly present = new Set<string>();
  private config: AppConfig;
  private stopped = false;

  constructor(private readonly deps: EngineDeps) {
    this.config = deps.config;
  }

  // ---------------------------------------------------------------- lifecycle

  /** Settles anything that came due while the server was down, then schedules wake-ups. */
  start(): Promise<void> {
    this.stopped = false;
    return this.run(async () => undefined);
  }

  stop(): void {
    this.stopped = true;
    this.deps.scheduler.cancel();
  }

  /** Waits for queued operations and in-flight channel posts. Used by tests and shutdown. */
  async idle(): Promise<void> {
    await this.queue.drain();
    await Promise.all([...this.pendingPosts]);
  }

  tick(): Promise<void> {
    return this.run(async () => undefined);
  }

  setConfig(config: AppConfig): Promise<void> {
    return this.run(async (tx, now, effects) => {
      this.config = config;
      if (config.boss.enabled) {
        const boss = await this.loadBoss(tx, now);
        const result = reconfigureBoss(boss, config.boss.name, config.boss.hpHours, now);
        await tx.bosses.save(result.boss);
        if (result.defeatedNow) await this.onBossDefeated(tx, result.boss, effects);
      }
      effects.roomChanged = true;
    });
  }

  getConfig(): AppConfig {
    return this.config;
  }

  // ---------------------------------------------------------------- presence

  setPresence(userIds: readonly string[]): Promise<void> {
    this.present.clear();
    for (const id of userIds) this.present.add(id);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  userAttached(userId: string): Promise<void> {
    this.present.add(userId);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  userDetached(userId: string): Promise<void> {
    this.present.delete(userId);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  // ---------------------------------------------------------------- queries

  getSnapshot(userId: string): Promise<SnapshotDto> {
    return this.run(async (tx, now) => ({
      room: await this.buildRoomState(tx, now),
      me: await this.buildMyStatus(tx, userId, now),
    }));
  }

  getProgress(userId: string): Promise<ProgressDto> {
    return this.run(async (tx, now) => this.buildProgress(tx, userId, now));
  }

  // ---------------------------------------------------------------- card looks

  /** Picks the card style other members see. "" goes back to automatic. */
  async setCardStyle(userId: string, styleInput: unknown): Promise<ProgressDto> {
    if (typeof styleInput !== "string") throw validationError("Pick a card style.");
    const style = styleInput === "" ? null : cardStyleById(styleInput);
    if (style === undefined) throw validationError("That card style doesn't exist.");
    return this.run(async (tx, now, effects) => {
      if (style) {
        const member = await this.loadMember(tx, userId);
        const held = new Set((await tx.badges.list([userId])).map((b) => b.badgeId));
        if (!isCardStyleUnlocked(style, levelFromXp(member.xpTotal).level, held)) {
          throw validationError(
            "level" in style.unlock
              ? `Reach level ${style.unlock.level} to unlock ${style.name}.`
              : `Earn the badge that unlocks ${style.name} first.`,
          );
        }
      }
      const card = await this.loadCard(tx, userId);
      await tx.cards.save({ ...card, style: style?.id ?? null });
      this.touch(effects, userId);
      return this.buildProgress(tx, userId, now);
    });
  }

  /** Picks up to three earned badges to show on the card. An empty list means "most recent". */
  async setBadgeShowcase(userId: string, badgeIdsInput: unknown): Promise<ProgressDto> {
    if (!Array.isArray(badgeIdsInput) || badgeIdsInput.some((id) => typeof id !== "string")) {
      throw validationError("Pick badges to show.");
    }
    const badgeIds = [...new Set(badgeIdsInput as string[])];
    if (badgeIds.length > SHOWCASE_SIZE) {
      throw validationError(`Pick up to ${SHOWCASE_SIZE} badges.`);
    }
    return this.run(async (tx, now, effects) => {
      const held = new Set((await tx.badges.list([userId])).map((b) => b.badgeId));
      if (badgeIds.some((id) => !held.has(id))) {
        throw validationError("You can only show badges you've earned.");
      }
      const card = await this.loadCard(tx, userId);
      await tx.cards.save({ ...card, showcase: badgeIds.length > 0 ? badgeIds : null });
      this.touch(effects, userId);
      return this.buildProgress(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- room timer

  async joinRoomTimer(userId: string, options: StartOptions = {}): Promise<SnapshotDto> {
    const goals = validateStartGoals(options.goals ?? []);
    return this.run(async (tx, now, effects) => {
      const solo = await tx.solos.get(userId);
      if (solo?.phase === "focus") {
        throw conflictError("You're on a solo timer. End it to join the room timer.");
      }
      if (solo) await tx.solos.delete(userId);

      await this.applyStartOptions(tx, userId, goals, options.goalsPrivate, now);
      const participants = await tx.room.listParticipants();
      if (!participants.some((p) => p.userId === userId)) {
        if (!(await tx.room.getCycle())) {
          await tx.room.saveCycle({
            cycleStartedAt: now,
            preset: this.config.preset,
            settledCount: 0,
          });
        }
        await tx.room.addParticipant({ userId, joinedAt: now });
      }
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  leaveRoomTimer(userId: string): Promise<SnapshotDto> {
    return this.run(async (tx, now, effects) => {
      const participants = await tx.room.listParticipants();
      const me = participants.find((p) => p.userId === userId);
      const cycle = await tx.room.getCycle();
      if (me && cycle) {
        const phase = phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now);
        if (phase?.kind === "focus") {
          const minutes = overlapMs(me.joinedAt, now, phase.startsAt, phase.endsAt) / MINUTE_MS;
          const combo = comboFor(participants.length, this.config.comboEnabled);
          await this.creditFocus(tx, effects, {
            userId,
            kind: "room",
            startedAt: Math.max(me.joinedAt, phase.startsAt),
            endedAt: now,
            minutes,
            combo,
            finished: false,
            plannedMinutes: cycle.preset.focusMinutes,
            now,
          });
          await this.damageBoss(tx, effects, minutes * combo, [userId], now);
        }
        await tx.room.removeParticipant(userId);
        if (participants.length === 1) await tx.room.saveCycle(null);
      }
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- solo timer

  async startSolo(
    userId: string,
    minutesInput: unknown,
    options: StartOptions = {},
  ): Promise<SnapshotDto> {
    const minutes = validateSoloMinutes(minutesInput);
    const goals = validateStartGoals(options.goals ?? []);
    return this.run(async (tx, now, effects) => {
      const participants = await tx.room.listParticipants();
      if (participants.some((p) => p.userId === userId)) {
        throw conflictError("You're on the room timer. Leave it to start a solo timer.");
      }
      const existing = await tx.solos.get(userId);
      if (existing?.phase === "focus") throw conflictError("Your solo timer is already running.");

      await this.applyStartOptions(tx, userId, goals, options.goalsPrivate, now);
      const endsAt = now + minutes * MINUTE_MS;
      await tx.solos.save({
        userId,
        startedAt: now,
        endsAt,
        minutes,
        phase: "focus",
        breakEndsAt: endsAt + this.config.preset.breakMinutes * MINUTE_MS,
      });
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  /** Stops a solo focus early (minutes so far still count) or skips the solo break. */
  endSolo(userId: string): Promise<SnapshotDto> {
    return this.run(async (tx, now, effects) => {
      const solo = await tx.solos.get(userId);
      if (solo?.phase === "focus") {
        const minutes = (now - solo.startedAt) / MINUTE_MS;
        await this.creditFocus(tx, effects, {
          userId,
          kind: "solo",
          startedAt: solo.startedAt,
          endedAt: now,
          minutes,
          combo: 1,
          finished: false,
          plannedMinutes: solo.minutes,
          now,
        });
        await this.damageBoss(tx, effects, minutes, [userId], now);
      }
      if (solo) await tx.solos.delete(userId);
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- goals

  async addGoal(userId: string, textInput: unknown): Promise<MyStatusDto> {
    const text = validateGoalText(textInput);
    return this.run(async (tx, now, effects) => {
      await this.insertGoals(tx, userId, [text], now);
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  async setGoalDone(userId: string, goalIdInput: unknown, done: unknown): Promise<MyStatusDto> {
    const goalId = validateId(goalIdInput, "goal id");
    if (typeof done !== "boolean") throw validationError("Expected true or false.");
    return this.run(async (tx, now, effects) => {
      const goal = await this.ownGoal(tx, userId, goalId);
      if (goal.done !== done) {
        const updated: GoalRecord = { ...goal, done, completedAt: done ? now : null };
        if (done && !goal.xpAwarded) {
          updated.xpAwarded = true;
          const day = dayKey(now, this.config.timeZone);
          const xp = this.config.xp.enabled
            ? applyDailyCap(
                GAME.xpPerGoal,
                (await tx.stats.get(userId, day))?.xp ?? 0,
                this.config.xp.dailyCap,
              )
            : 0;
          const member = await this.loadMember(tx, userId);
          await tx.members.save({ ...member, xpTotal: member.xpTotal + xp });
          await tx.stats.add(userId, day, { xp, goalsDone: 1 });
          const quests = await this.rewardQuests(tx, userId, now);
          await this.awardBadges(tx, effects, userId, now, {
            goal: { secondsOpen: Math.floor((now - goal.createdAt) / 1000) },
            quests,
            ...(await this.activityFacts(tx, userId, day)),
          });
        }
        await tx.goals.update(updated);
      }
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  async deleteGoal(userId: string, goalIdInput: unknown): Promise<MyStatusDto> {
    const goalId = validateId(goalIdInput, "goal id");
    return this.run(async (tx, now, effects) => {
      await this.ownGoal(tx, userId, goalId);
      await tx.goals.delete(goalId);
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  async setGoalsPrivate(userId: string, goalsPrivate: unknown): Promise<MyStatusDto> {
    if (typeof goalsPrivate !== "boolean") throw validationError("Expected true or false.");
    return this.run(async (tx, now, effects) => {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, goalsPrivate });
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- privacy

  /**
   * Erases everything Study Squad stores about the member, at their request.
   * Their card leaves the board at once, and the room timer goes idle if they
   * were the last one on it. No XP or minutes are credited for the session cut short.
   */
  deleteMyData(userId: string): Promise<MyStatusDto> {
    return this.run(async (tx, now, effects) => {
      const participants = await tx.room.listParticipants();
      if (participants.length === 1 && participants[0]!.userId === userId)
        await tx.room.saveCycle(null);
      await tx.eraseUser(userId);
      this.touch(effects, userId);
      this.deps.logger.info("member data erased", { userId });
      return this.buildMyStatus(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- daily recap

  /** Builds the recap for the community day containing `at`. */
  buildRecap(at?: number): Promise<RecapDto> {
    return this.run(async (tx, now) => this.recapFor(tx, at ?? now, now));
  }

  /** Posts today's recap once. Skips quiet days so the channel never reads "0 hours". */
  postDailyRecap(): Promise<boolean> {
    return this.run(async (tx, now, effects) => {
      const channelId = this.config.postChannelId;
      if (!this.config.recap.enabled || !channelId) return false;
      const day = dayKey(now, this.config.timeZone);
      if ((await tx.kv.get<string>(LAST_RECAP_KEY)) === day) return false;
      const recap = await this.recapFor(tx, now, now);
      if (recap.activeMembers === 0) return false;
      await tx.kv.set(LAST_RECAP_KEY, day);
      effects.posts.push((a) => a.dailyRecap(channelId, recap));
      return true;
    });
  }

  // ================================================================ internals

  /**
   * Every public operation goes through here: serialised, settled up to "now",
   * run in one transaction, then side effects released and the next wake-up set.
   */
  private run<T>(work: (tx: Store, now: number, effects: Effects) => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      const now = this.deps.clock.now();
      const effects = new Effects();
      const { result, nextWake } = await this.deps.store.transaction(async (tx) => {
        await this.settleDue(tx, now, effects);
        const result = await work(tx, now, effects);
        if (effects.roomChanged) {
          const room = await this.buildRoomState(tx, now);
          effects.notifications.push((n) => n.roomUpdated(room));
        }
        for (const userId of effects.statusChanged) {
          const me = await this.buildMyStatus(tx, userId, now);
          effects.notifications.push((n) => n.myStatusUpdated(userId, me));
        }
        for (const [userId, badgeIds] of effects.badges) {
          effects.notifications.push((n) => n.badgesEarned(userId, badgeIds));
        }
        return { result, nextWake: await this.nextWakeAt(tx, now) };
      });
      this.release(effects);
      this.schedule(nextWake);
      return result;
    });
  }

  private release(effects: Effects): void {
    for (const notify of effects.notifications) {
      try {
        notify(this.deps.notifier);
      } catch (error) {
        this.deps.logger.error("notify failed", { error: String(error) });
      }
    }
    for (const post of effects.posts) {
      const pending = post(this.deps.announcer)
        .catch((error: unknown) =>
          this.deps.logger.warn("channel post failed", { error: String(error) }),
        )
        .finally(() => this.pendingPosts.delete(pending));
      this.pendingPosts.add(pending);
    }
  }

  private schedule(at: number | null): void {
    if (at === null) {
      this.deps.scheduler.cancel();
      return;
    }
    this.deps.scheduler.wakeAt(at, () => this.wake());
  }

  /**
   * A failed tick (say, the database was briefly locked) schedules nothing,
   * so without a retry the room timer would stall until someone acts.
   */
  private wake(): void {
    this.tick().catch((error: unknown) => {
      this.deps.logger.error("tick failed", { error: String(error) });
      if (this.stopped) return;
      this.deps.scheduler.wakeAt(this.deps.clock.now() + TICK_RETRY_MS, () => this.wake());
    });
  }

  private touch(effects: Effects, userId: string): void {
    effects.roomChanged = true;
    effects.statusChanged.add(userId);
  }

  private async snapshot(tx: Store, userId: string, now: number): Promise<SnapshotDto> {
    return {
      room: await this.buildRoomState(tx, now),
      me: await this.buildMyStatus(tx, userId, now),
    };
  }

  // ---------------------------------------------------------------- settling

  private async settleDue(tx: Store, now: number, effects: Effects): Promise<void> {
    await this.settleRoomCycle(tx, now, effects);
    await this.settleSolos(tx, now, effects);
  }

  private async settleRoomCycle(tx: Store, now: number, effects: Effects): Promise<void> {
    const cycle = await tx.room.getCycle();
    if (!cycle) return;
    const phases = buildCycle(cycle.cycleStartedAt, cycle.preset);
    let settled = cycle.settledCount;
    while (settled < phases.length && phases[settled]!.endsAt <= now) {
      const phase = phases[settled]!;
      if (phase.kind === "focus") {
        await this.settleFocusPhase(tx, phases, phase, cycle.preset.focusMinutes, effects);
      }
      settled++;
      effects.roomChanged = true;
    }
    if (settled < phases.length) {
      if (settled !== cycle.settledCount)
        await tx.room.saveCycle({ ...cycle, settledCount: settled });
      return;
    }
    if (await this.finishCycle(tx, phases, effects)) await this.settleRoomCycle(tx, now, effects);
  }

  /**
   * At the end of a cycle everyone is released, so nobody can leave a timer
   * running for hours. People who joined during the final long break haven't
   * focused yet, so they roll straight into a fresh cycle.
   */
  private async finishCycle(tx: Store, phases: CyclePhase[], effects: Effects): Promise<boolean> {
    const end = cycleEndsAt(phases);
    const lastFocusEnd = phases.filter((p) => p.kind === "focus").at(-1)?.endsAt ?? end;
    const participants = await tx.room.listParticipants();
    const carried = participants.filter((p) => p.joinedAt >= lastFocusEnd);
    for (const p of participants) {
      if (!carried.includes(p)) {
        await tx.room.removeParticipant(p.userId);
        effects.statusChanged.add(p.userId);
      }
    }
    await tx.room.saveCycle(
      carried.length > 0
        ? { cycleStartedAt: end, preset: this.config.preset, settledCount: 0 }
        : null,
    );
    for (const p of carried) await tx.room.addParticipant({ ...p, joinedAt: end });
    effects.roomChanged = true;
    // Returns true when a new cycle started, which may itself be overdue after downtime.
    return carried.length > 0;
  }

  private async settleFocusPhase(
    tx: Store,
    phases: readonly CyclePhase[],
    phase: CyclePhase,
    focusMinutes: number,
    effects: Effects,
  ): Promise<void> {
    const participants = await tx.room.listParticipants();
    const minuteShares = participants
      .map((p) => ({
        participant: p,
        minutes: overlapMs(p.joinedAt, phase.endsAt, phase.startsAt, phase.endsAt) / MINUTE_MS,
      }))
      .filter((s) => s.minutes > 0);
    const finishThreshold = Math.min(GAME.minRoundMinutesToFinish, focusMinutes / 2);
    const finisherIds = minuteShares
      .filter((s) => s.minutes >= finishThreshold)
      .map((s) => s.participant.userId);
    const combo = comboFor(finisherIds.length, this.config.comboEnabled);
    const roomDamageMinutes = minuteShares.reduce((sum, s) => sum + s.minutes * combo, 0);
    // Stayed for the whole cycle: this is its last round and they finished round 1 too.
    const focusPhases = phases.filter((p) => p.kind === "focus");
    const lastRound = focusPhases.at(-1)?.index === phase.index;
    const firstRoundEnd = focusPhases[0]?.endsAt ?? phase.endsAt;
    const fullCycle = (joinedAt: number) =>
      lastRound && joinedAt <= firstRoundEnd - finishThreshold * MINUTE_MS;

    const credits = [];
    for (const share of minuteShares) {
      credits.push({
        share,
        credit: await this.creditFocus(tx, effects, {
          userId: share.participant.userId,
          kind: "room",
          startedAt: Math.max(share.participant.joinedAt, phase.startsAt),
          endedAt: phase.endsAt,
          minutes: share.minutes,
          combo,
          finished: finisherIds.includes(share.participant.userId),
          plannedMinutes: focusMinutes,
          fullCycle: fullCycle(share.participant.joinedAt),
          now: phase.endsAt,
        }),
      });
    }
    await this.damageBoss(
      tx,
      effects,
      roomDamageMinutes,
      minuteShares.map((s) => s.participant.userId),
      phase.endsAt,
    );

    const breakEndsAt = phases[phase.index + 1]?.endsAt ?? phase.endsAt;
    const room = await this.buildRoomState(tx, phase.endsAt);
    effects.notifications.push((n) =>
      n.phaseCompleted({
        kind: phase.kind,
        round: phase.round,
        finisherIds,
        roomDamageMinutes,
        combo,
        room,
      }),
    );
    for (const { share, credit } of credits) {
      const userId = share.participant.userId;
      const result: PersonalResultDto = {
        source: "room",
        round: phase.round,
        focusedMinutes: share.minutes,
        finished: finisherIds.includes(userId),
        baseXp: credit.baseXp,
        combo,
        xpEarned: credit.xpEarned,
        capped: credit.capped,
        streak: credit.streak,
        streakExtended: credit.streakExtended,
        finisherIds,
        roomDamageMinutes,
        goalPrompt: await this.goalPrompt(tx, userId),
        breakEndsAt,
        me: await this.buildMyStatus(tx, userId, phase.endsAt),
      };
      effects.notifications.push((n) => n.personalResult(userId, result));
    }
  }

  private async settleSolos(tx: Store, now: number, effects: Effects): Promise<void> {
    for (const solo of await tx.solos.list()) {
      if (solo.phase === "focus" && solo.endsAt <= now) {
        const credit = await this.creditFocus(tx, effects, {
          userId: solo.userId,
          kind: "solo",
          startedAt: solo.startedAt,
          endedAt: solo.endsAt,
          minutes: solo.minutes,
          combo: 1,
          finished: true,
          plannedMinutes: solo.minutes,
          now: solo.endsAt,
        });
        await this.damageBoss(tx, effects, solo.minutes, [solo.userId], solo.endsAt);
        const stillOnBreak = solo.breakEndsAt > now;
        if (stillOnBreak) await tx.solos.save({ ...solo, phase: "break" });
        else await tx.solos.delete(solo.userId);
        const result: PersonalResultDto = {
          source: "solo",
          round: 0,
          focusedMinutes: solo.minutes,
          finished: true,
          baseXp: credit.baseXp,
          combo: 1,
          xpEarned: credit.xpEarned,
          capped: credit.capped,
          streak: credit.streak,
          streakExtended: credit.streakExtended,
          finisherIds: [solo.userId],
          roomDamageMinutes: solo.minutes,
          goalPrompt: await this.goalPrompt(tx, solo.userId),
          breakEndsAt: solo.breakEndsAt,
          me: await this.buildMyStatus(tx, solo.userId, now),
        };
        effects.notifications.push((n) => n.personalResult(solo.userId, result));
        this.touch(effects, solo.userId);
      } else if (solo.phase === "break" && solo.breakEndsAt <= now) {
        await tx.solos.delete(solo.userId);
        this.touch(effects, solo.userId);
      }
    }
  }

  private async nextWakeAt(tx: Store, now: number): Promise<number | null> {
    const candidates: number[] = [];
    const cycle = await tx.room.getCycle();
    if (cycle) {
      const next = buildCycle(cycle.cycleStartedAt, cycle.preset)[cycle.settledCount];
      if (next) candidates.push(next.endsAt);
    }
    for (const solo of await tx.solos.list()) {
      candidates.push(solo.phase === "focus" ? solo.endsAt : solo.breakEndsAt);
    }
    // Wake when the week rolls over so everyone sees the new boss.
    if (this.config.boss.enabled && candidates.length > 0) {
      candidates.push(nextWeekStart(now, this.config.timeZone));
    }
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }

  // ---------------------------------------------------------------- rewards

  private async creditFocus(
    tx: Store,
    effects: Effects,
    input: {
      userId: string;
      kind: "room" | "solo";
      startedAt: number;
      endedAt: number;
      minutes: number;
      combo: number;
      finished: boolean;
      /** What the timer was set to, for badges. */
      plannedMinutes: number;
      fullCycle?: boolean;
      now: number;
    },
  ) {
    const { userId, minutes, combo, finished, now } = input;
    const day = dayKey(now, this.config.timeZone);
    const member = await this.loadMember(tx, userId);
    const xpToday = (await tx.stats.get(userId, day))?.xp ?? 0;
    const rawXp = this.config.xp.enabled ? focusXp(minutes, combo) : 0;
    const xpEarned = applyDailyCap(rawXp, xpToday, this.config.xp.dailyCap);

    let streak = member.streak;
    let streakExtended = false;
    let freezesSpent = 0;
    if (finished) {
      const update = recordActiveDay(member.streak, day, this.config.streakFreezesEnabled);
      streak = update.state;
      streakExtended = update.extended;
      freezesSpent = update.freezesSpent;
    }
    // A streak that restarted at 1 after an earlier one: that earlier one was broken.
    const comebackFrom =
      streakExtended && streak.streak === 1 && member.streak.lastActiveDay !== null
        ? member.streak.streak
        : 0;
    await tx.members.save({ ...member, xpTotal: member.xpTotal + xpEarned, streak });
    await tx.stats.add(userId, day, {
      focusMinutes: minutes,
      xp: xpEarned,
      sessionsFinished: finished ? 1 : 0,
    });
    await tx.sessions.insert({
      userId,
      kind: input.kind,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      focusedMinutes: minutes,
      finished,
      xp: xpEarned,
      combo,
    });
    const quests = await this.rewardQuests(tx, userId, now);

    const tz = this.config.timeZone;
    const session: SessionFacts = {
      kind: input.kind,
      finished,
      minutes: Math.floor(minutes),
      plannedMinutes: input.plannedMinutes,
      combo,
      start: localTime(input.startedAt, tz),
      end: localTime(input.endedAt, tz),
      fullCycle: finished && input.fullCycle === true,
    };
    await this.awardBadges(tx, effects, userId, now, {
      session,
      streak: { length: streak.streak, comebackFrom, freezeSaved: freezesSpent > 0 },
      quests,
      ...(await this.activityFacts(tx, userId, day)),
    });

    const channelId = this.config.postChannelId;
    if (
      streakExtended &&
      channelId &&
      this.config.milestonePostsEnabled &&
      GAME.streakMilestones.includes(streak.streak)
    ) {
      const length = streak.streak;
      effects.posts.push((a) => a.streakMilestone(channelId, userId, length));
    }

    return {
      baseXp: this.config.xp.enabled ? baseFocusXp(minutes) : 0,
      xpEarned,
      capped: xpEarned < rawXp,
      streak: streak.streak,
      streakExtended,
    };
  }

  private async damageBoss(
    tx: Store,
    effects: Effects,
    minutes: number,
    contributorIds: readonly string[],
    now: number,
  ): Promise<void> {
    if (!this.config.boss.enabled || minutes <= 0) return;
    const boss = await this.loadBoss(tx, now);
    const result = applyDamage(boss, minutes, contributorIds, now);
    await tx.bosses.save(result.boss);
    if (result.defeatedNow) await this.onBossDefeated(tx, result.boss, effects, contributorIds);
  }

  /** Loot: every contributor gets bonus XP, outside the daily cap because it happens once a week. */
  private async onBossDefeated(
    tx: Store,
    boss: BossState,
    effects: Effects,
    finalBlowIds: readonly string[] = [],
  ): Promise<void> {
    const lootXp = this.config.xp.enabled ? GAME.bossLootXp : 0;
    if (lootXp > 0) {
      for (const member of await tx.members.list(boss.contributorIds)) {
        await tx.members.save({ ...member, xpTotal: member.xpTotal + lootXp });
        effects.statusChanged.add(member.userId);
      }
    }
    const defeatedAt = boss.defeatedAt ?? this.deps.clock.now();
    for (const userId of boss.contributorIds) {
      await this.awardBadges(tx, effects, userId, defeatedAt, {
        boss: {
          name: boss.name,
          // Every boss is 1x until the boss roster (#28) gives them strengths.
          strength: 1,
          defeats: await tx.bosses.countDefeatedWith(userId),
          contributors: boss.contributorIds.length,
          finalBlow: finalBlowIds.includes(userId),
          at: localTime(defeatedAt, this.config.timeZone),
        },
      });
    }
    effects.roomChanged = true;
    const channelId = this.config.postChannelId;
    if (channelId) {
      effects.posts.push((a) =>
        a.bossDefeated(channelId, boss.name, boss.contributorIds.length, lootXp),
      );
    }
  }

  /**
   * Pays the reward for every quest the member has just finished this week.
   * Like boss loot it is outside the daily cap: it comes at most three times
   * a week, and a capped reward would often be zero. Returns the quest facts
   * badges look at.
   */
  private async rewardQuests(tx: Store, userId: string, now: number): Promise<QuestFacts> {
    const week = weekKey(dayKey(now, this.config.timeZone));
    const rewarded = new Set(await tx.quests.listRewarded(userId, week));
    let xp = 0;
    for (const { quest, done } of await this.weeklyQuests(tx, userId, now)) {
      if (!done || rewarded.has(quest.id)) continue;
      const questXp = this.config.xp.enabled ? quest.xp : 0;
      await tx.quests.markRewarded({
        userId,
        weekKey: week,
        questId: quest.id,
        xp: questXp,
        rewardedAt: now,
      });
      rewarded.add(quest.id);
      xp += questXp;
    }
    if (xp > 0) {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, xpTotal: member.xpTotal + xp });
    }
    return {
      doneThisWeek: rewarded.size,
      perWeek: QUESTS_PER_WEEK,
      totalDone: await tx.quests.countRewarded(userId),
    };
  }

  /** This week's quests and the member's progress, from daily_stats and session_log. */
  private async weeklyQuests(tx: Store, userId: string, now: number): Promise<QuestProgress[]> {
    const tz = this.config.timeZone;
    const week = weekKey(dayKey(now, tz));
    const days = await tx.stats.listForUser(userId, week, addDays(week, 6));
    const sessions = await tx.sessions.listForUser(
      userId,
      startOfDay(week, tz),
      startOfDay(addDays(week, 7), tz),
    );
    return questsForWeek(week).map((quest) => questProgress(quest, { days, sessions }));
  }

  private questDto({ quest, progress, done }: QuestProgress): QuestDto {
    return {
      id: quest.id,
      title: quest.title,
      progress,
      target: quest.target,
      unit: quest.unit,
      xp: this.config.xp.enabled ? quest.xp : 0,
      done,
    };
  }

  // ---------------------------------------------------------------- badges

  /**
   * Awards every badge these facts newly earn. XP and level are read here,
   * after the operation's own XP has been saved, so level badges always see
   * the latest total. The leaderboard passes its facts here too once it lands.
   */
  private async awardBadges(
    tx: Store,
    effects: Effects,
    userId: string,
    now: number,
    facts: Omit<BadgeFacts, "xpTotal" | "level">,
  ): Promise<void> {
    const member = await this.loadMember(tx, userId);
    const held = new Set((await tx.badges.list([userId])).map((b) => b.badgeId));
    const earned = newlyEarnedBadges(
      { ...facts, xpTotal: member.xpTotal, level: levelFromXp(member.xpTotal).level },
      held,
    );
    if (earned.length === 0) return;
    for (const badgeId of earned) await tx.badges.award({ userId, badgeId, earnedAt: now });
    effects.badges.set(userId, [...(effects.badges.get(userId) ?? []), ...earned]);
    // The card may show the new badge.
    this.touch(effects, userId);
  }

  /** Today's and all-time totals, for badges. */
  private async activityFacts(
    tx: Store,
    userId: string,
    day: string,
  ): Promise<Pick<BadgeFacts, "today" | "lifetime">> {
    const today = await tx.stats.get(userId, day);
    const lifetime = await tx.stats.lifetime(userId);
    return {
      today: {
        day,
        focusMinutes: today?.focusMinutes ?? 0,
        sessionsFinished: today?.sessionsFinished ?? 0,
        goalsDone: today?.goalsDone ?? 0,
      },
      lifetime: {
        ...lifetime,
        roomRoundsFinished: await tx.sessions.countFinished(userId, "room"),
      },
    };
  }

  private async checkBusyRoom(tx: Store, now: number, effects: Effects): Promise<void> {
    const { enabled, threshold } = this.config.busyPosts;
    const channelId = this.config.postChannelId;
    if (!enabled || !channelId) return;
    const room = await this.buildRoomState(tx, now);
    const focusing = room.members.filter(
      (m) => m.status === "roomFocus" || m.status === "soloFocus",
    ).length;
    const state = (await tx.kv.get<BusyPostState>(BUSY_KEY)) ?? { armed: true, lastPostedAt: 0 };
    if (focusing < threshold) {
      if (!state.armed) await tx.kv.set(BUSY_KEY, { ...state, armed: true });
      return;
    }
    if (!state.armed || now - state.lastPostedAt < BUSY_POST_COOLDOWN_MS) return;
    await tx.kv.set(BUSY_KEY, { armed: false, lastPostedAt: now });
    const combo = room.combo;
    effects.posts.push((a) => a.busyRoom(channelId, focusing, combo));
  }

  // ---------------------------------------------------------------- loading

  private async loadMember(tx: Store, userId: string): Promise<MemberRecord> {
    return (
      (await tx.members.get(userId)) ?? {
        userId,
        xpTotal: 0,
        streak: EMPTY_STREAK,
        goalsPrivate: null,
      }
    );
  }

  private async loadCard(tx: Store, userId: string): Promise<CardRecord> {
    return (await tx.cards.list([userId]))[0] ?? { userId, style: null, showcase: null };
  }

  private async loadBoss(tx: Store, now: number): Promise<BossState> {
    const week = weekKey(dayKey(now, this.config.timeZone));
    return (
      (await tx.bosses.get(week)) ?? newBoss(week, this.config.boss.name, this.config.boss.hpHours)
    );
  }

  private async ownGoal(tx: Store, userId: string, goalId: string): Promise<GoalRecord> {
    const goal = await tx.goals.get(goalId);
    // Same error for "missing" and "someone else's" so ids can't be probed.
    if (!goal || goal.userId !== userId) throw notFoundError("That goal doesn't exist.");
    return goal;
  }

  private async insertGoals(tx: Store, userId: string, texts: readonly string[], now: number) {
    if (texts.length === 0) return;
    const open = await tx.goals.countOpen(userId);
    if (open + texts.length > LIMITS.maxOpenGoals) {
      throw validationError(
        `You can have up to ${LIMITS.maxOpenGoals} open goals. Finish or remove one first.`,
      );
    }
    // Offset timestamps so goals typed together keep their order.
    for (const [i, text] of texts.entries()) {
      await tx.goals.insert({
        id: this.deps.newId(),
        userId,
        text,
        done: false,
        xpAwarded: false,
        createdAt: now + i,
        completedAt: null,
      });
    }
  }

  private async applyStartOptions(
    tx: Store,
    userId: string,
    goals: readonly string[],
    goalsPrivate: boolean | undefined,
    now: number,
  ): Promise<void> {
    await this.insertGoals(tx, userId, goals, now);
    if (typeof goalsPrivate === "boolean") {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, goalsPrivate });
    }
  }

  private async goalPrompt(tx: Store, userId: string): Promise<GoalDto | null> {
    const goal = (await tx.goals.firstOpen([userId])).get(userId);
    return goal ? { id: goal.id, text: goal.text, done: goal.done } : null;
  }

  private goalsArePrivate(member: MemberRecord | undefined): boolean {
    return member?.goalsPrivate ?? !this.config.goalsPublicByDefault;
  }

  // ---------------------------------------------------------------- views

  private async buildRoomState(tx: Store, now: number): Promise<RoomStateDto> {
    const cycle = await tx.room.getCycle();
    const participants = await tx.room.listParticipants();
    const phase = cycle ? phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now) : undefined;
    const timer: RoomTimerDto =
      cycle && phase
        ? {
            phase: phase.kind,
            round: phase.round,
            rounds: cycle.preset.rounds,
            phaseStartedAt: phase.startsAt,
            phaseEndsAt: phase.endsAt,
            preset: cycle.preset,
          }
        : {
            phase: "idle",
            round: 0,
            rounds: this.config.preset.rounds,
            phaseStartedAt: 0,
            phaseEndsAt: 0,
            preset: this.config.preset,
          };

    const solos = await tx.solos.list();
    const ids = [...participants.map((p) => p.userId), ...solos.map((s) => s.userId)];
    const members = new Map((await tx.members.list(ids)).map((m) => [m.userId, m]));
    const goals = await tx.goals.firstOpen(ids);
    const today = dayKey(now, this.config.timeZone);
    const looks = await this.cardLooks(tx, ids, members);

    const card = (
      userId: string,
      status: MemberCardDto["status"],
      endsAt: number,
    ): MemberCardDto => {
      const member = members.get(userId);
      const isPrivate = this.goalsArePrivate(member);
      return {
        userId,
        status,
        endsAt,
        goalText: isPrivate ? "" : (goals.get(userId)?.text ?? ""),
        goalPrivate: isPrivate,
        level: levelFromXp(member?.xpTotal ?? 0).level,
        streak: member ? currentStreak(member.streak, today, this.config.streakFreezesEnabled) : 0,
        badges: looks.get(userId)?.showcase ?? [],
        cardStyle: looks.get(userId)?.style ?? "classic",
      };
    };

    const cards = [
      ...participants.map((p: ParticipantRecord) =>
        card(p.userId, phase?.kind === "focus" ? "roomFocus" : "roomBreak", phase?.endsAt ?? now),
      ),
      ...solos.map((s) =>
        s.phase === "focus"
          ? card(s.userId, "soloFocus", s.endsAt)
          : card(s.userId, "soloBreak", s.breakEndsAt),
      ),
    ];

    return {
      serverNow: now,
      timer,
      members: cards,
      presentCount: new Set([...this.present, ...ids]).size,
      roomParticipantCount: participants.length,
      combo: comboFor(participants.length, this.config.comboEnabled),
      boss: await this.bossDto(tx, now),
      features: {
        presetKey: this.config.presetKey,
        xpEnabled: this.config.xp.enabled,
        comboEnabled: this.config.comboEnabled,
        bossEnabled: this.config.boss.enabled,
        streakFreezesEnabled: this.config.streakFreezesEnabled,
        goalsPublicByDefault: this.config.goalsPublicByDefault,
        dailyXpCap: this.config.xp.dailyCap,
        postChannelName: this.config.postChannelId ? this.config.postChannelName : "",
      },
    };
  }

  private async bossDto(tx: Store, now: number): Promise<BossDto> {
    const endsAt = nextWeekStart(now, this.config.timeZone);
    if (!this.config.boss.enabled) {
      return {
        enabled: false,
        name: "",
        maxHpMinutes: 0,
        damageMinutes: 0,
        endsAt,
        defeated: false,
      };
    }
    const boss = await this.loadBoss(tx, now);
    return {
      enabled: true,
      name: boss.name,
      maxHpMinutes: boss.maxHpMinutes,
      damageMinutes: boss.damageMinutes,
      endsAt,
      defeated: boss.defeatedAt !== null,
    };
  }

  /** What each member's card shows: their style and showcase badges. */
  private async cardLooks(
    tx: Store,
    userIds: readonly string[],
    members: ReadonlyMap<string, MemberRecord>,
  ): Promise<Map<string, CardLookDto>> {
    const earned = new Map<string, EarnedBadgeRecord[]>();
    for (const badge of await tx.badges.list(userIds)) {
      earned.set(badge.userId, [...(earned.get(badge.userId) ?? []), badge]);
    }
    const cards = new Map((await tx.cards.list(userIds)).map((c) => [c.userId, c]));
    const looks = new Map<string, CardLookDto>();
    for (const userId of userIds) {
      const mine = earned.get(userId) ?? [];
      const card = cards.get(userId);
      const level = levelFromXp(members.get(userId)?.xpTotal ?? 0).level;
      looks.set(userId, {
        chosenStyle: card?.style ?? "",
        chosenShowcase: card?.showcase ?? [],
        style: resolveCardStyle(card?.style ?? null, level, new Set(mine.map((b) => b.badgeId))),
        showcase: resolveShowcase(card?.showcase ?? null, mine),
      });
    }
    return looks;
  }

  private async buildProgress(tx: Store, userId: string, now: number): Promise<ProgressDto> {
    const today = dayKey(now, this.config.timeZone);
    const from = addDays(today, -(LIMITS.progressWindowDays - 1));
    const rows = await tx.stats.listForUser(userId, from, today);
    const byDay = new Map(rows.map((r) => [r.day, r.focusMinutes]));
    const days = Array.from({ length: LIMITS.progressWindowDays }, (_, i) => {
      const day = addDays(from, i);
      return { day, focusMinutes: byDay.get(day) ?? 0 };
    });
    const member = await tx.members.get(userId);
    const members = new Map(member ? [[userId, member]] : []);
    return {
      me: await this.buildMyStatus(tx, userId, now),
      days,
      totalFocusMinutes: days.reduce((sum, d) => sum + d.focusMinutes, 0),
      quests: (await this.weeklyQuests(tx, userId, now)).map((q) => this.questDto(q)),
      badges: (await tx.badges.list([userId])).map((b) => ({
        id: b.badgeId,
        earnedAt: b.earnedAt,
      })),
      card: (await this.cardLooks(tx, [userId], members)).get(userId)!,
    };
  }

  private async buildMyStatus(tx: Store, userId: string, now: number): Promise<MyStatusDto> {
    const tz = this.config.timeZone;
    const today = dayKey(now, tz);
    const member = await tx.members.get(userId);
    const streakState = member?.streak ?? EMPTY_STREAK;
    const progress = levelFromXp(member?.xpTotal ?? 0);
    const solo = await tx.solos.get(userId);
    const onRoomTimer = (await tx.room.listParticipants()).some((p) => p.userId === userId);

    let status: MyStatusDto["status"] = "idle";
    let endsAt = 0;
    if (onRoomTimer) {
      const cycle = await tx.room.getCycle();
      const phase = cycle
        ? phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now)
        : undefined;
      status = phase?.kind === "focus" ? "roomFocus" : "roomBreak";
      endsAt = phase?.endsAt ?? now;
    } else if (solo) {
      status = solo.phase === "focus" ? "soloFocus" : "soloBreak";
      endsAt = solo.phase === "focus" ? solo.endsAt : solo.breakEndsAt;
    }

    const goals = await tx.goals.listForUser(userId, startOfDay(today, tz));
    return {
      userId,
      status,
      endsAt,
      onRoomTimer,
      xpTotal: member?.xpTotal ?? 0,
      level: progress.level,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNextLevel: progress.xpForNextLevel,
      xpToday: (await tx.stats.get(userId, today))?.xp ?? 0,
      streak: currentStreak(streakState, today, this.config.streakFreezesEnabled),
      freezeAvailable: freezeAvailable(streakState, today, this.config.streakFreezesEnabled),
      goals: goals.map((g) => ({ id: g.id, text: g.text, done: g.done })),
      goalsPrivate: this.goalsArePrivate(member),
    };
  }

  private async recapFor(tx: Store, at: number, now: number): Promise<RecapDto> {
    const tz = this.config.timeZone;
    const day = dayKey(at, tz);
    const stats = await tx.stats.communityDay(day);
    const candidates = await tx.members.listActiveSince(addDays(day, -14));
    const topStreaks = candidates
      .map((m) => ({
        userId: m.userId,
        streak: currentStreak(m.streak, day, this.config.streakFreezesEnabled),
      }))
      .filter((s) => s.streak > 0)
      .sort((a, b) => b.streak - a.streak || a.userId.localeCompare(b.userId))
      .slice(0, LIMITS.topStreaksInRecap);
    let boss: RecapDto["boss"] = null;
    if (this.config.boss.enabled) {
      const state = await this.loadBoss(tx, at);
      const weekEnd = addDays(state.weekKey, 7);
      boss = {
        name: state.name,
        hpLeftMinutes: bossHpLeftMinutes(state),
        daysLeft: Math.max(0, daysBetween(dayKey(now, tz), weekEnd)),
        defeated: state.defeatedAt !== null,
      };
    }
    return {
      day,
      weekday: weekdayName(day),
      focusMinutes: stats.focusMinutes,
      goalsDone: stats.goalsDone,
      activeMembers: stats.activeMembers,
      boss,
      topStreaks,
    };
  }
}
