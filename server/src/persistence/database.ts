import knex, { type Knex } from "knex";

/**
 * Opens the app's SQLite database. Root gives each installed app its own
 * database file (rootServer.dataStore.config). One connection keeps SQLite's
 * single-writer model simple, and the engine serialises writes anyway.
 */
export function openDatabase(filename: string): Knex {
  return knex({
    client: "sqlite3",
    connection: { filename },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (
        conn: { run: (sql: string, cb: (err: Error | null) => void) => void },
        done: (err: Error | null, conn: unknown) => void,
      ) => {
        conn.run("PRAGMA foreign_keys = ON", (err) => {
          if (err) return done(err, conn);
          conn.run("PRAGMA journal_mode = WAL", (walErr) => done(walErr, conn));
        });
      },
    },
  });
}
