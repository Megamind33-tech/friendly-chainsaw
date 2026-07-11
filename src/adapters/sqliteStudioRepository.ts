import { getDb } from "@/lib/db";
import type { ProjectRepository, SettingsRepository } from "./contracts";
import type { ID, Project } from "@/document/types";

export const OPEN_PROJECT_KEY = "open_project";

interface ProjectRow {
  id: string;
  doc: string;
  schema_version: number;
  program: string | null;
}

/** SQLite implementation kept at the edge; no feature code needs SQL syntax. */
export const sqliteSettingsRepository: SettingsRepository = {
  async get(key) {
    const db = await getDb();
    const rows = await db.select<{ v: string }[]>("SELECT v FROM app_state WHERE k = $1", [key]);
    return rows[0]?.v ?? null;
  },
  async set(key, value) {
    const db = await getDb();
    await db.execute(
      "INSERT INTO app_state (k, v) VALUES ($1, $2) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      [key, value],
    );
  },
};

export const sqliteProjectRepository: ProjectRepository = {
  async load(projectId) {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>(
      "SELECT id, doc, schema_version, program FROM projects WHERE id = $1",
      [projectId],
    );
    const row = rows[0];
    if (!row) return null;
    return { project: JSON.parse(row.doc) as Project, schemaVersion: row.schema_version, program: row.program };
  },
  async insert(project) {
    const db = await getDb();
    await db.execute("INSERT INTO projects (id, name, doc, schema_version) VALUES ($1, $2, $3, $4)", [
      project.id,
      project.name,
      JSON.stringify(project),
      project.schemaVersion,
    ]);
  },
  async save(project) {
    const db = await getDb();
    await db.execute("UPDATE projects SET doc = $1, schema_version = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3", [
      JSON.stringify(project),
      project.schemaVersion,
      project.id,
    ]);
  },
  async saveProgramState(projectId, state) {
    const db = await getDb();
    await db.execute("UPDATE projects SET program = $1 WHERE id = $2", [JSON.stringify(state), projectId]);
  },
};

export async function getOpenProjectId(): Promise<ID | null> {
  return sqliteSettingsRepository.get(OPEN_PROJECT_KEY);
}

export function setOpenProjectId(projectId: ID): Promise<void> {
  return sqliteSettingsRepository.set(OPEN_PROJECT_KEY, projectId);
}
