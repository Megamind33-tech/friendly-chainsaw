import { create } from "zustand";
import { getDb } from "@/lib/db";
import { newId } from "./ids";
import { layerSchema } from "./schema";
import type { ID, Layer } from "./types";

/**
 * Operator-saved graphics templates (Phase 5.8) — "Save as Template" on any
 * layer stores its full JSON in SQLite (user_templates, migration v4);
 * the Templates panel lists them under "My Templates" for one-click
 * re-insertion with fresh ids. Validated through the same layerSchema as
 * project loads — a corrupt row is skipped with a console warning, never
 * silently rendered.
 */

export interface UserTemplate {
  id: ID;
  name: string;
  layer: Layer;
}

interface UserTemplatesState {
  templates: UserTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (name: string, layer: Layer) => Promise<void>;
  remove: (id: ID) => Promise<void>;
}

interface TemplateRow {
  id: string;
  name: string;
  layer: string;
}

export const useUserTemplates = create<UserTemplatesState>((set, get) => ({
  templates: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const db = await getDb();
    const rows = await db.select<TemplateRow[]>("SELECT id, name, layer FROM user_templates ORDER BY created_at DESC");
    const templates: UserTemplate[] = [];
    for (const row of rows) {
      const parsed = layerSchema.safeParse(JSON.parse(row.layer));
      if (parsed.success) {
        templates.push({ id: row.id, name: row.name, layer: parsed.data as Layer });
      } else {
        console.warn(`user template "${row.name}" failed validation, skipping`, parsed.error);
      }
    }
    set({ templates, loaded: true });
  },

  save: async (name, layer) => {
    const db = await getDb();
    const id = newId();
    await db.execute("INSERT INTO user_templates (id, name, layer) VALUES ($1, $2, $3)", [
      id,
      name,
      JSON.stringify(layer),
    ]);
    set((state) => ({ templates: [{ id, name, layer }, ...state.templates] }));
  },

  remove: async (id) => {
    const db = await getDb();
    await db.execute("DELETE FROM user_templates WHERE id = $1", [id]);
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
  },
}));
