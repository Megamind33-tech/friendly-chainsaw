/** One-shot diagnostic: prove Panel 01's data mapping / colour edits are in
 * the RAW persisted SQLite doc (the source of truth the app reloads from). */
import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = join(process.env.APPDATA ?? "", "com.broadcastengine.app", "studio.db");
const db = new Database(dbPath, { readonly: true });
const rows = db.query("SELECT doc FROM projects").all() as { doc: string }[];

interface AnyNode {
  kind?: string;
  name?: string;
  children?: AnyNode[];
  arModel?: { modelId: string; params: Record<string, number> };
  bindings?: unknown;
  updateAnim?: string;
  material?: { color?: string };
  props?: { kind?: string; nodes?: AnyNode[] };
}

for (const row of rows) {
  const proj = JSON.parse(row.doc) as { scenes: { layers: AnyNode[] }[] };
  const walk = (nodes: AnyNode[]) => {
    for (const n of nodes) {
      if (n.arModel?.modelId === "ar_sports_panel_01") {
        const zones = (n.children ?? []).find((c) => c.name === "CONTENT_ZONES");
        const sh = zones?.children?.find((c) => c.name === "SCORE_HOME_ZONE");
        const ls = (n.children ?? []).find((c) => c.name === "LIGHT_STRIPS");
        const strip = ls?.children?.find((c) => c.name?.startsWith("STRIP_"));
        const seg = strip?.children?.[0] ?? strip;
        console.log(
          JSON.stringify(
            {
              panel: n.arModel.modelId,
              width: n.arModel.params.width,
              scoreBinding: sh?.bindings,
              scoreUpdateAnim: sh?.updateAnim,
              stripColour: seg?.material?.color,
            },
            null,
            2,
          ),
        );
      }
      if (n.kind === "group") walk(n.children ?? []);
    }
  };
  for (const sc of proj.scenes) {
    for (const ly of sc.layers) {
      if (ly.props?.kind === "set3d") walk(ly.props.nodes ?? []);
    }
  }
}
