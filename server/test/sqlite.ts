import type { Knex } from "knex";
import { openDatabase } from "../src/persistence/database";
import { migrateToLatest } from "../src/persistence/migrations";

/** A fresh, migrated in-memory SQLite database. One pooled connection keeps it alive. */
export async function freshDatabase(): Promise<Knex> {
  const db = openDatabase(":memory:");
  await migrateToLatest(db);
  return db;
}
