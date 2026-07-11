/** Diagnoses "deletes revert / nothing saves": reads the ACTUAL persisted
 * project from studio.db and runs it through the ACTUAL load-path schema.
 * If validation fails, persistence.ts silently replaces the operator's work
 * with a blank default project on every launch. */
import { Database } from "bun:sqlite";
import { projectSchema } from "../src/document/schema";

const dbPath = `${process.env.APPDATA}\\com.broadcastengine.app\\studio.db`;
const db = new Database(dbPath, { readonly: true });

const rows = db.query("SELECT id, name, schema_version, length(doc) as len, updated_at, doc FROM projects").all() as {
  id: string;
  name: string;
  schema_version: number;
  len: number;
  updated_at: string;
  doc: string;
}[];

console.log(`projects in db: ${rows.length}`);
for (const row of rows) {
  console.log(`- ${row.name} (${row.id.slice(0, 8)}…) v${row.schema_version} ${row.len}B updated ${row.updated_at}`);
  const parsed = projectSchema.safeParse(JSON.parse(row.doc));
  if (parsed.success) {
    const p = parsed.data as { scenes: { layers: unknown[] }[]; assets: unknown[] };
    console.log(`  LOAD OK — scenes=${p.scenes.length} layers=${p.scenes.reduce((n, s) => n + s.layers.length, 0)} assets=${p.assets.length}`);
  } else {
    console.log(`  LOAD FAILS — the app would DISCARD this project on launch!`);
    console.log(`  first issues: ${JSON.stringify(parsed.error.issues.slice(0, 5), null, 1)}`);
  }
}

const appState = db.query("SELECT k, v FROM app_state").all();
console.log("app_state:", JSON.stringify(appState));
