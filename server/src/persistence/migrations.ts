import type { Knex } from "knex";

/**
 * Schema migrations, defined in code so they ship inside server/dist with no
 * extra files to package. Append new migrations; never edit a released one.
 */
interface Migration {
  name: string;
  up(db: Knex): Promise<void>;
  down(db: Knex): Promise<void>;
}

const migrations: Migration[] = [
  {
    name: "001_initial",
    async up(db) {
      await db.schema.createTable("members", (t) => {
        t.string("user_id").primary();
        t.integer("xp_total").notNullable().defaultTo(0);
        t.integer("streak").notNullable().defaultTo(0);
        t.string("last_active_day").nullable().index();
        t.text("freeze_weeks_used").notNullable().defaultTo("[]");
        t.boolean("goals_private").nullable();
      });
      await db.schema.createTable("goals", (t) => {
        t.string("id").primary();
        t.string("user_id").notNullable();
        t.string("text", 140).notNullable();
        t.boolean("done").notNullable().defaultTo(false);
        t.boolean("xp_awarded").notNullable().defaultTo(false);
        t.bigInteger("created_at").notNullable();
        t.bigInteger("completed_at").nullable();
        t.index(["user_id", "done"]);
      });
      await db.schema.createTable("solo_sessions", (t) => {
        t.string("user_id").primary();
        t.bigInteger("started_at").notNullable();
        t.bigInteger("ends_at").notNullable();
        t.double("minutes").notNullable();
        t.string("phase").notNullable();
        t.bigInteger("break_ends_at").notNullable();
      });
      await db.schema.createTable("room_cycle", (t) => {
        t.integer("id").primary();
        t.bigInteger("cycle_started_at").notNullable();
        t.text("preset").notNullable();
        t.integer("settled_count").notNullable().defaultTo(0);
      });
      await db.schema.createTable("room_participants", (t) => {
        t.string("user_id").primary();
        t.bigInteger("joined_at").notNullable();
      });
      await db.schema.createTable("session_log", (t) => {
        t.increments("id");
        t.string("user_id").notNullable().index();
        t.string("kind").notNullable();
        t.bigInteger("started_at").notNullable();
        t.bigInteger("ended_at").notNullable();
        t.double("focused_minutes").notNullable();
        t.boolean("finished").notNullable();
        t.integer("xp").notNullable();
        t.double("combo").notNullable();
      });
      await db.schema.createTable("daily_stats", (t) => {
        t.string("user_id").notNullable();
        t.string("day").notNullable().index();
        t.double("focus_minutes").notNullable().defaultTo(0);
        t.integer("xp").notNullable().defaultTo(0);
        t.integer("goals_done").notNullable().defaultTo(0);
        t.integer("sessions_finished").notNullable().defaultTo(0);
        t.primary(["user_id", "day"]);
      });
      await db.schema.createTable("bosses", (t) => {
        t.string("week_key").primary();
        t.string("name").notNullable();
        t.double("max_hp_minutes").notNullable();
        t.double("damage_minutes").notNullable().defaultTo(0);
        t.bigInteger("defeated_at").nullable();
        t.text("contributor_ids").notNullable().defaultTo("[]");
      });
      await db.schema.createTable("kv", (t) => {
        t.string("key").primary();
        t.text("value").notNullable();
      });
    },
    async down(db) {
      for (const table of [
        "kv",
        "bosses",
        "daily_stats",
        "session_log",
        "room_participants",
        "room_cycle",
        "solo_sessions",
        "goals",
        "members",
      ]) {
        await db.schema.dropTableIfExists(table);
      }
    },
  },
  {
    // Progress toward badges is read from daily_stats, session_log and bosses;
    // these only record which badges were earned and how each card looks.
    name: "002_badges",
    async up(db) {
      await db.schema.createTable("member_badges", (t) => {
        t.string("user_id").notNullable();
        t.string("badge_id").notNullable();
        t.bigInteger("earned_at").notNullable();
        t.primary(["user_id", "badge_id"]);
      });
      await db.schema.createTable("member_cards", (t) => {
        t.string("user_id").primary();
        t.string("style").nullable();
        t.text("showcase").nullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists("member_cards");
      await db.schema.dropTableIfExists("member_badges");
    },
  },
  {
    name: "004_leaderboard_opt_outs",
    async up(db) {
      // A row means the member hid themselves from the weekly leaderboard.
      await db.schema.createTable("leaderboard_opt_outs", (t) => {
        t.string("user_id").primary();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists("leaderboard_opt_outs");
    },
  },
];

class CodeMigrationSource implements Knex.MigrationSource<Migration> {
  async getMigrations() {
    return migrations;
  }
  getMigrationName(migration: Migration) {
    return migration.name;
  }
  async getMigration(migration: Migration) {
    return { up: (db: Knex) => migration.up(db), down: (db: Knex) => migration.down(db) };
  }
}

export async function migrateToLatest(db: Knex): Promise<void> {
  await db.migrate.latest({
    migrationSource: new CodeMigrationSource(),
    tableName: "knex_migrations",
  });
}

export async function rollbackAll(db: Knex): Promise<void> {
  await db.migrate.rollback(
    { migrationSource: new CodeMigrationSource(), tableName: "knex_migrations" },
    true,
  );
}
