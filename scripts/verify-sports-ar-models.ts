/**
 * Verify suite for the Sports AR 3D Models library — runs the SHIPPED
 * modules (registry, builder, formatters, visibility, data feed, schema
 * round-trip, generated manifests + GLBs), not copies. Mirrors the
 * REQUIRED TESTS list that is script-checkable; the live click-through
 * (insert / Preview / Programme / save-reload) is verified in-app.
 *
 * Run: bun run scripts/verify-sports-ar-models.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SPORTS_AR_MODELS,
  buildLibraryManifest,
  buildModelManifest,
  getSportsArModel,
  nodesInColourGroup,
  rebuildSportsArModel,
  resetSportsArModelGeometry,
} from "../src/ar-engine/sportsPanels";
import { findChildGroup } from "../src/ar-engine/sportsPanels/panelBuilder";
import { formatBindingValue } from "../src/ar-system/binding/format";
import { evaluateVisibilityRule } from "../src/ar-engine/visibility";
import { applySportsValues, loadSportsTestData } from "../src/sports/sportsConnector";
import { SPORTS_LIVE_DEFAULTS } from "../src/sports/liveData";
import { useDataStore, buildDataValues } from "../src/document/dataSources";
import { createDefaultProject, createSet3dLayer } from "../src/document/factory";
import { projectSchema } from "../src/document/schema";
import type { GroupNode, SetNode, Text3dNode } from "../src/document/types";

let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string) {
  checks += 1;
  if (cond) console.log(`  ok  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

function flatten(nodes: SetNode[]): SetNode[] {
  return nodes.flatMap((n) => (n.kind === "group" ? [n, ...flatten(n.children)] : [n]));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v as unknown;
  });
}

/** Perceived saturation of a hex colour — neutrality check. */
function saturation(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

const ROOT = join(import.meta.dir, "..", "public", "assets", "ar", "sports");

const HIERARCHY = ["STRUCTURE", "LIGHT_STRIPS", "CONTENT_ZONES", "OPTIONAL_SPORT_PROPS", "ANIMATION_RIG", "COLLISION_BOUNDS", "EDITOR_GUIDES"];
const STRUCTURE_PARTS = [
  "CONTENT_SURFACE",
  "INNER_FRAME",
  "OUTER_FRAME_FRONT",
  "OUTER_FRAME_REAR",
  "SIDE_DEPTH_LEFT",
  "SIDE_DEPTH_RIGHT",
  "TOP_TRIM",
  "BOTTOM_TRIM",
  "BASE_TOP",
  "BASE_MIDDLE",
  "BASE_BOTTOM",
  "SUPPORTS",
];
const ZONE_NODES = [
  "TITLE_ZONE",
  "TEAM_HOME_ZONE",
  "TEAM_AWAY_ZONE",
  "SCORE_HOME_ZONE",
  "SCORE_AWAY_ZONE",
  "LOGO_HOME_ZONE",
  "LOGO_AWAY_ZONE",
  "CLOCK_ZONE",
  "STATUS_ZONE",
  "STATS_ZONE",
  "PLAYER_ZONE",
  "PHOTO_ZONE",
  "FOOTER_ZONE",
];

async function main() {
  console.log("[1] Registry: 10 independent models");
  ok(SPORTS_AR_MODELS.length === 10, "registry holds exactly 10 models");
  for (let i = 0; i < 10; i++) {
    const id = `ar_sports_panel_${String(i + 1).padStart(2, "0")}`;
    ok(SPORTS_AR_MODELS[i]?.id === id, `model ${i + 1} id is ${id}`);
    ok(SPORTS_AR_MODELS[i]?.name === `Sports AR Panel ${String(i + 1).padStart(2, "0")}`, `model ${i + 1} display name`);
  }
  ok(new Set(SPORTS_AR_MODELS.map((m) => m.id)).size === 10, "no duplicate ids — 10 separate assets, never one collage");

  console.log("[2] Every model builds the common hierarchy with real 3D geometry and opens EMPTY");
  for (const model of SPORTS_AR_MODELS) {
    const root = model.build();
    ok(root.kind === "group" && !!root.arModel && root.arModel.modelId === model.id, `${model.id}: root carries arModel ref`);
    for (const name of HIERARCHY) {
      ok(root.children.some((c) => c.name === name), `${model.id}: has ${name}`);
    }
    const structure = findChildGroup(root, "STRUCTURE")!;
    const assembly = findChildGroup(structure, "PANEL_ASSEMBLY");
    const structNames = new Set([...structure.children.map((c) => c.name), ...(assembly?.children.map((c) => c.name) ?? [])]);
    for (const part of STRUCTURE_PARTS) {
      ok(structNames.has(part), `${model.id}: STRUCTURE has ${part}`);
    }
    const all = flatten([root]);
    const prisms = all.filter((n) => n.kind === "primitive" && n.shape === "prism");
    ok(prisms.length >= 3, `${model.id}: ${prisms.length} real extruded prisms (front/rear frames + surface)`);
    ok(
      prisms.some((n) => n.kind === "primitive" && (n.bevel ?? 0) > 0),
      `${model.id}: beveled frame geometry present`,
    );
    ok(
      prisms.some((n) => n.kind === "primitive" && !!n.holeOutline && n.holeOutline.length >= 3),
      `${model.id}: real frame ring (outline + hole), not a flat plate`,
    );
    const frontFrame = all.find((n) => n.name === "OUTER_FRAME_FRONT");
    const rearFrame = all.find((n) => n.name === "OUTER_FRAME_REAR");
    ok(!!frontFrame && !!rearFrame && frontFrame.transform.position.z > rearFrame.transform.position.z, `${model.id}: real front AND rear frames with thickness between them`);

    // EMPTY default state — the heart of the brief.
    const texts = all.filter((n): n is Text3dNode => n.kind === "text3d");
    ok(texts.length >= 8 && texts.every((t) => t.text === ""), `${model.id}: every text zone opens EMPTY (no words, no teams, no scores)`);
    ok(all.every((n) => !n.bindings || n.bindings.length === 0), `${model.id}: no data bindings pre-attached (manual mapping only)`);
    ok(
      all.every((n) => n.kind !== "primitive" || !n.textureAssetId),
      `${model.id}: no embedded images/logos`,
    );
    const props = findChildGroup(root, "OPTIONAL_SPORT_PROPS")!;
    ok(props.children.length === 0, `${model.id}: OPTIONAL_SPORT_PROPS empty — no permanent balls/trophies`);
    const structural = all.filter((n) => n.kind === "primitive" && n.name !== "Floor marker" && n.name !== "COLLISION_BOUNDS");
    ok(
      structural.every((n) => n.kind === "primitive" && saturation(n.material.color) < 0.25),
      `${model.id}: neutral chrome only — no permanent colour identity`,
    );
    const zones = findChildGroup(root, "CONTENT_ZONES")!;
    for (const z of ZONE_NODES) {
      ok(zones.children.some((c) => c.name === z), `${model.id}: content zone ${z}`);
    }
    const scoreZone = zones.children.find((c) => c.name === "SCORE_HOME_ZONE");
    ok(scoreZone?.updateAnim === "flash", `${model.id}: score zone defaults to score-flash update animation`);
  }

  console.log("[3] Zod round-trip — nothing stripped (the recurring field-drop bug class)");
  {
    const project = createDefaultProject();
    const layer = createSet3dLayer(SPORTS_AR_MODELS.map((m) => m.build()));
    layer.props.kind === "set3d" &&
      (layer.props.nodes[0].arPlacement = { mode: "cameraFacing", cameraFacingStrength: 0.8 });
    project.scenes[0].layers.push(layer);
    const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    ok(stableStringify(parsed) === stableStringify(project), "project with all 10 models round-trips value-identical (outline/holeOutline/bevel/arModel/visibilityRule/updateAnim/arPlacement survive)");
  }

  console.log("[4] Geometry rebuild + Reset to Reference (content preserved)");
  {
    const model = getSportsArModel("ar_sports_panel_01")!;
    const root = model.build();
    const zones = findChildGroup(root, "CONTENT_ZONES")!;
    const scoreZone = zones.children.find((c) => c.name === "SCORE_HOME_ZONE")!;
    scoreZone.bindings = [{ targetPath: "text", source: "sports.home.score", fallback: "" }];
    scoreZone.visibilityRule = { source: "sports.event.status", op: "notEmpty" };
    const rebuilt = rebuildSportsArModel(root, { width: 4.2 })!;
    ok(rebuilt.id === root.id, "rebuild preserves the root node id");
    ok((rebuilt.arModel!.params as { width: number }).width === 4.2, "rebuild applies the new width");
    const rebuiltZone = findChildGroup(rebuilt, "CONTENT_ZONES")!.children.find((c) => c.name === "SCORE_HOME_ZONE")!;
    ok(rebuiltZone.bindings?.[0]?.source === "sports.home.score", "rebuild preserves zone data mapping");
    ok(rebuiltZone.visibilityRule?.op === "notEmpty", "rebuild preserves visibility rule");
    const reset = resetSportsArModelGeometry(rebuilt)!;
    ok((reset.arModel!.params as { width: number }).width === model.spec.defaults.width, "Reset Geometry to Reference restores the reference silhouette params");
    const zoneAfterReset = findChildGroup(reset, "CONTENT_ZONES")!.children.find((c) => c.name === "SCORE_HOME_ZONE")!;
    ok(zoneAfterReset.bindings?.[0]?.source === "sports.home.score", "reset also preserves the mapping");
    const outlineNow = flatten([reset]).find((n) => n.name === "OUTER_FRAME_FRONT");
    const outlineRef = flatten([model.build()]).find((n) => n.name === "OUTER_FRAME_FRONT");
    ok(
      JSON.stringify(outlineNow?.kind === "primitive" && outlineNow.outline) === JSON.stringify(outlineRef?.kind === "primitive" && outlineRef.outline),
      "reset restores the exact reference outline",
    );
  }

  console.log("[5] Colour groups");
  {
    const root = getSportsArModel("ar_sports_panel_03")!.build();
    for (const group of ["content", "framePrimary", "base", "emissive"] as const) {
      ok(nodesInColourGroup(root, group).length > 0, `colour group '${group}' resolves to real parts`);
    }
  }

  console.log("[6] Formatters (shared editor/bake implementation)");
  ok(formatBindingValue("hello world", "uppercase") === "HELLO WORLD", "uppercase");
  ok(formatBindingValue("MANCHESTER UNITED", "titlecase") === "Manchester United", "titlecase");
  ok(formatBindingValue("47.6", "integer") === "48", "integer");
  ok(formatBindingValue("58", "percentage") === "58%", "percentage");
  ok(formatBindingValue("90", "clock") === "90:00", "clock from minutes");
  ok(formatBindingValue("12:30", "clock") === "12:30", "clock passthrough");
  ok(formatBindingValue("A very long team name", "truncate:10") === "A very lo…", "truncate");
  ok(formatBindingValue("3", "suffix: PTS") === "3 PTS", "suffix");
  ok(formatBindingValue("real madrid", "shortname:3") === "RM", "short team name initials");
  ok(formatBindingValue("7", "{value} - LIVE") === "7 - LIVE", "legacy {value} template still works");

  console.log("[7] Visibility rules");
  const vals = { "sports.event.status": "FT", "sports.player.photo": "" };
  ok(evaluateVisibilityRule({ source: "sports.event.status", op: "notEquals", value: "FT" }, vals) === false, "hide clock when match finished");
  ok(evaluateVisibilityRule({ source: "sports.player.photo", op: "notEmpty" }, vals) === false, "photo zone hidden when no photo provided");
  ok(evaluateVisibilityRule({ source: "sports.event.status", op: "equals", value: "FT" }, vals) === true, "equals");
  ok(evaluateVisibilityRule({ source: "sports.player.photo", op: "empty" }, vals) === true, "empty");
  ok(evaluateVisibilityRule(undefined, vals) === true, "no rule = visible");

  console.log("[8] Sports live feed: empty defaults, ingest, validation");
  ok(Object.values(SPORTS_LIVE_DEFAULTS).every((v) => v === ""), "sports feed defaults are ALL empty — models open blank");
  {
    const before = buildDataValues(useDataStore.getState());
    ok(before["sports.home.score"] === "", "flattened sports.* keys exist and are empty");
    const result = applySportsValues({ "home.score": "2", "away.score": "abc", "event.clock": "45:00", "home.colourPrimary": "not-a-colour" });
    ok(result.applied === 2 && result.dropped.length === 2, "invalid score/colour dropped with warnings, valid fields applied — bad data cannot crash the scene");
    const after = buildDataValues(useDataStore.getState());
    ok(after["sports.home.score"] === "2" && after["sports.event.clock"] === "45:00", "manual/JSON updates reach the live values");
    ok(after["sports.away.score"] === "", "invalid value fell back (kept last good/empty)");
    const sim = loadSportsTestData();
    ok(sim.applied > 10 && sim.dropped.length === 0, "test simulator payload applies cleanly");
    const withSim = buildDataValues(useDataStore.getState());
    ok(withSim["sports.score.display"] === "1 - 0", "simulator score reached the flat keys");
  }

  console.log("[9] Generated manifests + GLBs on disk match the registry");
  {
    const libRaw = JSON.parse(await readFile(join(ROOT, "manifests", "sports-ar-models.manifest.json"), "utf8")) as {
      models: { id: string; modelPath: string; manifestPath: string; enabled: boolean }[];
      category: string;
      subcategory: string;
    };
    ok(libRaw.models.length === 10, "library manifest lists all 10 models");
    ok(libRaw.category === "AR 3D Models" && libRaw.subcategory === "Sports Graphics", "library manifest category is AR 3D Models > Sports Graphics");
    ok(stableStringify(libRaw) === stableStringify(buildLibraryManifest()), "library manifest on disk matches the registry (no drift)");
    for (const model of SPORTS_AR_MODELS) {
      const raw = JSON.parse(await readFile(join(ROOT, "manifests", `${model.id}.manifest.json`), "utf8"));
      ok(stableStringify(raw) === stableStringify(buildModelManifest(model)), `${model.id}.manifest.json matches the registry`);
      const glb = await readFile(join(ROOT, "models", `${model.id}.glb`));
      ok(glb.length > 10_000 && glb.subarray(0, 4).toString("latin1") === "glTF", `${model.id}.glb is a real binary glTF (${(glb.length / 1024).toFixed(0)} KB)`);
    }
    const schema = JSON.parse(await readFile(join(ROOT, "schemas", "sports-live-data.schema.json"), "utf8"));
    ok(!!schema.properties?.event && !!schema.properties?.home && !!schema.properties?.standings && !!schema.properties?.extensions, "sports-live-data.schema.json has event/home/away/standings/extensions blocks");
    const sources = JSON.parse(await readFile(join(ROOT, "manifests", "sports-data-sources.manifest.json"), "utf8")) as { sources: { id: string }[] };
    const ids = new Set(sources.sources.map((s) => s.id));
    ok(["manual", "local_json", "rest_api", "websocket"].every((id) => ids.has(id)), "data-sources manifest covers manual/JSON/REST/WebSocket");
  }

  console.log(`\n${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
  console.log("ALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("verify-sports-ar-models CRASHED:", err);
  process.exit(1);
});
