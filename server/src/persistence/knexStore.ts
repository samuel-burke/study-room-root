import type {
  BossState,
  CommunityDayStats,
  DailyStatDelta,
  DailyStatRecord,
  DayKey,
  GoalRecord,
  MemberRecord,
  ParticipantRecord,
  RoomCycleRecord,
  SessionLogRecord,
  SoloRecord,
  Store,
  TimerPreset,
} from "@studyroom/core";
import type { Knex } from "knex";

// SQLite hands booleans back as 0/1 and may return big integers as numbers or strings.
const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const bool = (value: unknown): boolean => value === true || value === 1 || value === "1";
const boolOrNull = (value: unknown): boolean | null =>
  value === null || value === undefined ? null : bool(value);

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type Row = Record<string, unknown>;

const toMember = (r: Row): MemberRecord => ({
  userId: String(r.user_id),
  xpTotal: num(r.xp_total),
  streak: {
    streak: num(r.streak),
    lastActiveDay: (r.last_active_day as string | null) ?? null,
    freezeWeeksUsed: parseJson<string[]>(r.freeze_weeks_used, []),
  },
  goalsPrivate: boolOrNull(r.goals_private),
});

const toGoal = (r: Row): GoalRecord => ({
  id: String(r.id),
  userId: String(r.user_id),
  text: String(r.text),
  done: bool(r.done),
  xpAwarded: bool(r.xp_awarded),
  createdAt: num(r.created_at),
  completedAt: numOrNull(r.completed_at),
});

const toSolo = (r: Row): SoloRecord => ({
  userId: String(r.user_id),
  startedAt: num(r.started_at),
  endsAt: num(r.ends_at),
  minutes: num(r.minutes),
  phase: r.phase === "break" ? "break" : "focus",
  breakEndsAt: num(r.break_ends_at),
});

const toStat = (r: Row): DailyStatRecord => ({
  userId: String(r.user_id),
  day: String(r.day),
  focusMinutes: num(r.focus_minutes),
  xp: num(r.xp),
  goalsDone: num(r.goals_done),
  sessionsFinished: num(r.sessions_finished),
});

const toBoss = (r: Row): BossState => ({
  weekKey: String(r.week_key),
  name: String(r.name),
  maxHpXp: num(r.max_hp_xp),
  damageXp: num(r.damage_xp),
  defeatedAt: numOrNull(r.defeated_at),
  contributorIds: parseJson<string[]>(r.contributor_ids, []),
});

const ROOM_CYCLE_ID = 1;
// SQLite's default limit on bound variables is 999; stay well under it.
const IN_CHUNK = 500;

async function inChunks<T>(
  ids: readonly string[],
  query: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK)
    results.push(...(await query(ids.slice(i, i + IN_CHUNK))));
  return results;
}

/** Store backed by Root's per-app SQLite database. All queries are parameterised by knex. */
export class KnexStore implements Store {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async eraseUser(userId: string): Promise<void> {
    await this.transaction(async (tx) => {
      const db = (tx as KnexStore).db;
      for (const table of [
        "members",
        "goals",
        "solo_sessions",
        "room_participants",
        "session_log",
        "daily_stats",
      ]) {
        await db(table).where({ user_id: userId }).delete();
      }
      // Contributor lists are JSON arrays; only rewrite bosses that mention this member.
      const bosses = await db("bosses").where(
        "contributor_ids",
        "like",
        `%${JSON.stringify(userId)}%`,
      );
      for (const row of bosses) {
        const ids = parseJson<string[]>(row.contributor_ids, []).filter((id) => id !== userId);
        await db("bosses")
          .where({ week_key: row.week_key })
          .update({ contributor_ids: JSON.stringify(ids) });
      }
    });
  }

  async transaction<T>(work: (tx: Store) => Promise<T>): Promise<T> {
    if (this.db.isTransaction) return work(this);
    return this.db.transaction((trx) => work(new KnexStore(trx)));
  }

  members = {
    get: async (userId: string) => {
      const row = await this.db("members").where({ user_id: userId }).first();
      return row ? toMember(row) : undefined;
    },
    list: async (userIds: readonly string[]) =>
      (await inChunks(userIds, (chunk) => this.db("members").whereIn("user_id", chunk))).map(
        toMember,
      ),
    listActiveSince: async (day: DayKey) =>
      (await this.db("members").where("last_active_day", ">=", day)).map(toMember),
    save: async (m: MemberRecord) => {
      await this.db("members")
        .insert({
          user_id: m.userId,
          xp_total: m.xpTotal,
          streak: m.streak.streak,
          last_active_day: m.streak.lastActiveDay,
          freeze_weeks_used: JSON.stringify(m.streak.freezeWeeksUsed),
          goals_private: m.goalsPrivate,
        })
        .onConflict("user_id")
        .merge();
    },
  };

  goals = {
    get: async (id: string) => {
      const row = await this.db("goals").where({ id }).first();
      return row ? toGoal(row) : undefined;
    },
    listForUser: async (userId: string, doneSince: number) =>
      (
        await this.db("goals")
          .where({ user_id: userId })
          .andWhere((q) => q.where({ done: false }).orWhere("completed_at", ">=", doneSince))
          .orderBy("created_at", "asc")
      ).map(toGoal),
    firstOpen: async (userIds: readonly string[]) => {
      const rows = await inChunks(userIds, (chunk) =>
        this.db("goals")
          .whereIn("user_id", chunk)
          .andWhere({ done: false })
          .orderBy("created_at", "asc"),
      );
      const result = new Map<string, GoalRecord>();
      for (const goal of rows.map(toGoal).sort((a, b) => a.createdAt - b.createdAt)) {
        if (!result.has(goal.userId)) result.set(goal.userId, goal);
      }
      return result;
    },
    countOpen: async (userId: string) => {
      const row = await this.db("goals")
        .where({ user_id: userId, done: false })
        .count({ n: "*" })
        .first();
      return num(row?.n ?? 0);
    },
    insert: async (g: GoalRecord) => {
      await this.db("goals").insert(this.goalRow(g));
    },
    update: async (g: GoalRecord) => {
      await this.db("goals").where({ id: g.id }).update(this.goalRow(g));
    },
    delete: async (id: string) => {
      await this.db("goals").where({ id }).delete();
    },
  };

  private goalRow(g: GoalRecord) {
    return {
      id: g.id,
      user_id: g.userId,
      text: g.text,
      done: g.done,
      xp_awarded: g.xpAwarded,
      created_at: g.createdAt,
      completed_at: g.completedAt,
    };
  }

  solos = {
    get: async (userId: string) => {
      const row = await this.db("solo_sessions").where({ user_id: userId }).first();
      return row ? toSolo(row) : undefined;
    },
    list: async () => (await this.db("solo_sessions").orderBy("started_at", "asc")).map(toSolo),
    save: async (s: SoloRecord) => {
      await this.db("solo_sessions")
        .insert({
          user_id: s.userId,
          started_at: s.startedAt,
          ends_at: s.endsAt,
          minutes: s.minutes,
          phase: s.phase,
          break_ends_at: s.breakEndsAt,
        })
        .onConflict("user_id")
        .merge();
    },
    delete: async (userId: string) => {
      await this.db("solo_sessions").where({ user_id: userId }).delete();
    },
  };

  room = {
    getCycle: async (): Promise<RoomCycleRecord | undefined> => {
      const row = await this.db("room_cycle").where({ id: ROOM_CYCLE_ID }).first();
      if (!row) return undefined;
      return {
        cycleStartedAt: num(row.cycle_started_at),
        preset: parseJson<TimerPreset>(row.preset, {
          focusMinutes: 25,
          breakMinutes: 5,
          longBreakMinutes: 15,
          rounds: 4,
        }),
        settledCount: num(row.settled_count),
      };
    },
    saveCycle: async (cycle: RoomCycleRecord | null) => {
      if (!cycle) {
        await this.db("room_cycle").where({ id: ROOM_CYCLE_ID }).delete();
        return;
      }
      await this.db("room_cycle")
        .insert({
          id: ROOM_CYCLE_ID,
          cycle_started_at: cycle.cycleStartedAt,
          preset: JSON.stringify(cycle.preset),
          settled_count: cycle.settledCount,
        })
        .onConflict("id")
        .merge();
    },
    listParticipants: async (): Promise<ParticipantRecord[]> =>
      (await this.db("room_participants").orderBy("joined_at", "asc")).map((r: Row) => ({
        userId: String(r.user_id),
        joinedAt: num(r.joined_at),
      })),
    addParticipant: async (p: ParticipantRecord) => {
      await this.db("room_participants")
        .insert({ user_id: p.userId, joined_at: p.joinedAt })
        .onConflict("user_id")
        .merge();
    },
    removeParticipant: async (userId: string) => {
      await this.db("room_participants").where({ user_id: userId }).delete();
    },
  };

  sessions = {
    insert: async (log: SessionLogRecord) => {
      await this.db("session_log").insert({
        user_id: log.userId,
        kind: log.kind,
        started_at: log.startedAt,
        ended_at: log.endedAt,
        focused_minutes: log.focusedMinutes,
        finished: log.finished,
        xp: log.xp,
        combo: log.combo,
      });
    },
  };

  stats = {
    get: async (userId: string, day: DayKey) => {
      const row = await this.db("daily_stats").where({ user_id: userId, day }).first();
      return row ? toStat(row) : undefined;
    },
    add: async (userId: string, day: DayKey, delta: DailyStatDelta) => {
      const values = {
        focus_minutes: delta.focusMinutes ?? 0,
        xp: delta.xp ?? 0,
        goals_done: delta.goalsDone ?? 0,
        sessions_finished: delta.sessionsFinished ?? 0,
      };
      await this.db("daily_stats")
        .insert({ user_id: userId, day, ...values })
        .onConflict(["user_id", "day"])
        .merge({
          focus_minutes: this.db.raw("daily_stats.focus_minutes + ?", [values.focus_minutes]),
          xp: this.db.raw("daily_stats.xp + ?", [values.xp]),
          goals_done: this.db.raw("daily_stats.goals_done + ?", [values.goals_done]),
          sessions_finished: this.db.raw("daily_stats.sessions_finished + ?", [
            values.sessions_finished,
          ]),
        });
    },
    listForUser: async (userId: string, fromDay: DayKey, toDay: DayKey) =>
      (
        await this.db("daily_stats")
          .where({ user_id: userId })
          .andWhere("day", ">=", fromDay)
          .andWhere("day", "<=", toDay)
          .orderBy("day", "asc")
      ).map(toStat),
    communityDay: async (day: DayKey): Promise<CommunityDayStats> => {
      const row = await this.db("daily_stats")
        .where({ day })
        .select(
          this.db.raw("COALESCE(SUM(focus_minutes), 0) AS focus_minutes"),
          this.db.raw("COALESCE(SUM(goals_done), 0) AS goals_done"),
          this.db.raw(
            "COALESCE(SUM(CASE WHEN focus_minutes > 0 THEN 1 ELSE 0 END), 0) AS active_members",
          ),
        )
        .first();
      return {
        focusMinutes: num(row?.focus_minutes ?? 0),
        goalsDone: num(row?.goals_done ?? 0),
        activeMembers: num(row?.active_members ?? 0),
      };
    },
  };

  bosses = {
    get: async (weekKey: DayKey) => {
      const row = await this.db("bosses").where({ week_key: weekKey }).first();
      return row ? toBoss(row) : undefined;
    },
    save: async (b: BossState) => {
      await this.db("bosses")
        .insert({
          week_key: b.weekKey,
          name: b.name,
          max_hp_xp: b.maxHpXp,
          damage_xp: b.damageXp,
          defeated_at: b.defeatedAt,
          contributor_ids: JSON.stringify(b.contributorIds),
        })
        .onConflict("week_key")
        .merge();
    },
  };

  kv = {
    get: async <T>(key: string): Promise<T | undefined> => {
      const row = await this.db("kv").where({ key }).first();
      return row ? parseJson<T | undefined>(row.value, undefined) : undefined;
    },
    set: async <T>(key: string, value: T) => {
      await this.db("kv")
        .insert({ key, value: JSON.stringify(value) })
        .onConflict("key")
        .merge();
    },
  };
}
