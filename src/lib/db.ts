import Database from "@tauri-apps/plugin-sql";

/**
 * Phase 0: proves the SQLite load/migrate path works end to end.
 * Real Project/Scene/Layer tables are Phase 1 — see PLAN.md.
 */
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:studio.db");
  }
  return dbPromise;
}
