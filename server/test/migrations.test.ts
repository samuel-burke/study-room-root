import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/persistence/database";
import { migrateToLatest, rollbackAll } from "../src/persistence/migrations";

describe("migrations", () => {
  it("migrates up idempotently and rolls back cleanly", async () => {
    const db = openDatabase(":memory:");
    try {
      await migrateToLatest(db);
      await migrateToLatest(db);
      const tables = async () =>
        (
          await db.raw(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'knex_%' AND name NOT LIKE 'sqlite_%'",
          )
        )
          .map((r: { name: string }) => r.name)
          .sort();
      expect(await tables()).toEqual([
        "bosses",
        "daily_stats",
        "goals",
        "kv",
        "leaderboard_opt_outs",
        "member_badges",
        "member_cards",
        "members",
        "room_cycle",
        "room_participants",
        "session_log",
        "solo_sessions",
      ]);
      await rollbackAll(db);
      expect(await tables()).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
});
