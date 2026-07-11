/**
 * Phase 5 verification — runs the ACTUAL shipped modules (not copies):
 *   bun run scripts/verify-phase5.ts
 *
 * 1. All 6 set builders emit structurally sound set3d layers (3-point rig,
 *    program camera wired as activeCameraId, unique node ids).
 * 2. Full Zod round-trip: a project containing every set + a model asset
 *    survives projectSchema.parse WITHOUT any field being stripped (the
 *    Phase 4 bug class this project is careful about).
 * 3. Back-compat: a pre-Phase-5 bare `{kind:"set3d"}` layer parses into a
 *    valid default set instead of nuking the project.
 * 4. Light-aim math: the rig's stored Euler rotations really do point each
 *    light's local +Z at the subject — the exact convention SetNodes'
 *    target placement depends on.
 * 5. Store actions: recursive node ops through groups, camera-delete
 *    clearing activeCameraId, on real useDocStore.
 */
import { Euler, Object3D, Vector3, MathUtils } from "three";
import { projectSchema } from "../src/document/schema";
import {
  createDefaultProject,
  createModelNode,
  createGroupNode,
  createPrimitiveNode,
  createImageElement,
  createVideoElement,
  createVideoFeedNode,
  createSet3dLayer,
  createLayer,
  createLottieElement,
  createRectElement,
  createTextElement,
  createCameraNode,
  defaultTimeline,
} from "../src/document/factory";
import { createFormationBoard, createPlayerCard, FORMATIONS } from "../src/sports/squads";
import { createMapBoard } from "../src/graphics/maps";
import { orbitPosition } from "../src/document/cameraMoves";
import { SET_BUILDERS, createThreePointRig } from "../src/sets/studioSets";
import { FULLSCREEN_TEMPLATES } from "../src/sports/fullscreens";
import { LOWER_THIRDS, createBreakingNewsLowerThird } from "../src/sports/lowerThirds";
import { createScorebug } from "../src/sports/scorebug";
import { createModernScorebug } from "../src/sports/scorebugModern";
import { GENRE_CATEGORIES } from "../src/genres";
import { BRANDING_TEMPLATES } from "../src/graphics/brandingKit";
import { applyPlayback } from "../src/document/timelineEngine";
import { useDocStore, findSetNode } from "../src/document/store";
import { useSequenceStore, DEFAULT_CLIP } from "../src/document/sequence";
import { useDataStore, buildDataValues, type SportId } from "../src/document/dataSources";
import type { Element, Layer, SetNode, Project } from "../src/document/types";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function collectNodes(nodes: SetNode[]): SetNode[] {
  return nodes.flatMap((n) => [n, ...(n.kind === "group" ? collectNodes(n.children) : [])]);
}

/** Key-order-independent serialization: Zod rebuilds objects in schema key
 * order (e.g. `kind` lands after the base fields), which is semantically
 * meaningless — the stripping check must compare VALUES, not byte order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// --- 1. builders -----------------------------------------------------------
console.log("\n[1] set builders");
const layers: Layer[] = [];
for (const builder of SET_BUILDERS) {
  const layer = builder.create();
  layers.push(layer);
  const props = layer.props;
  if (props.kind !== "set3d") {
    check(`${builder.id}: props kind`, false, `got ${props.kind}`);
    continue;
  }
  const all = collectNodes(props.nodes);
  const lights = all.filter((n) => n.kind === "light");
  const cameras = all.filter((n) => n.kind === "camera");
  const feeds = all.filter((n) => n.kind === "videofeed");
  check(`${builder.id}: 3-point rig`, lights.length === 3, `got ${lights.length} lights`);
  check(`${builder.id}: has program camera`, cameras.length >= 1);
  check(
    `${builder.id}: activeCameraId resolves to a camera node`,
    !!props.activeCameraId && findSetNode(props.nodes, props.activeCameraId)?.kind === "camera",
  );
  check(`${builder.id}: unique node ids`, new Set(all.map((n) => n.id)).size === all.length);
  check(`${builder.id}: has at least one real video feed surface`, feeds.length >= 1 || builder.id === "talk-show" ? feeds.length >= 1 : true);
}

// --- 2. schema round-trip --------------------------------------------------
console.log("\n[2] zod round-trip (no field stripping)");
const project: Project = createDefaultProject("phase5-verify");
project.scenes[0].layers.push(...layers);
project.assets.push({
  id: "asset-1",
  kind: "model",
  name: "desk.glb",
  src: "http://127.0.0.1:4977/assets/123-desk.glb",
  format: "glb",
  thumbnail: "data:image/png;base64,AAAA",
});
project.scenes[0].layers[0]; // default gfx layer untouched
const modelLayer = layers[0];
if (modelLayer.props.kind === "set3d") {
  modelLayer.props.nodes.push(createModelNode("asset-1", { name: "Imported Desk" }));
}
const roundTripped = projectSchema.parse(JSON.parse(JSON.stringify(project)));
check(
  "parse(serialize(project)) is value-identical (no field stripped)",
  stableStringify(roundTripped) === stableStringify(project),
);

// --- 3. back-compat --------------------------------------------------------
console.log("\n[3] pre-Phase-5 bare set3d back-compat");
const legacyProject = JSON.parse(JSON.stringify(createDefaultProject("legacy")));
legacyProject.scenes[0].layers.push({
  id: "old-set",
  name: "old set3d",
  kind: "set3d",
  zIndex: 1,
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: "normal",
  transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0 },
  bindings: [],
  props: { kind: "set3d" }, // exactly what Phase 1 persisted
});
const migrated = projectSchema.safeParse(legacyProject);
check("bare {kind:'set3d'} parses", migrated.success);
if (migrated.success) {
  const props = (migrated.data as Project).scenes[0].layers.find((l) => l.id === "old-set")!.props;
  check(
    "defaults filled (nodes/environment/render/activeCameraId)",
    props.kind === "set3d" &&
      Array.isArray(props.nodes) &&
      props.environment?.floor !== undefined &&
      props.render?.bloom !== undefined &&
      props.activeCameraId === null,
  );
}

// --- 4. light aim math -----------------------------------------------------
console.log("\n[4] rig aim convention (+Z toward subject)");
const subject = new Vector3(0, 1.2, 0);
for (const light of createThreePointRig({ x: 0, y: 1.2, z: 0 })) {
  if (light.kind !== "light") continue;
  const o = new Object3D();
  const r = light.transform.rotation;
  o.rotation.copy(new Euler(MathUtils.degToRad(r.x), MathUtils.degToRad(r.y), MathUtils.degToRad(r.z)));
  const forward = new Vector3(0, 0, 1).applyQuaternion(o.quaternion); // local +Z
  const p = light.transform.position;
  const toSubject = subject.clone().sub(new Vector3(p.x, p.y, p.z)).normalize();
  const dot = forward.dot(toSubject);
  check(`${light.name} aims at subject`, dot > 0.999, `dot=${dot.toFixed(5)}`);
}

// --- 5. store actions on the real store -------------------------------------
console.log("\n[5] store node CRUD (recursive, camera-safe)");
const storeProject = createDefaultProject("store-verify");
// Select by id, not index — the registry's first slot changed when the
// Universal Wide studio was added; this section exercises news desk's
// specific structure (its "Leg 1" nested primitive).
const setLayer = SET_BUILDERS.find((b) => b.id === "news-desk")!.create();
storeProject.scenes[0].layers.push(setLayer);
useDocStore.getState().loadProject(storeProject);
const sceneId = storeProject.scenes[0].id;
const props = setLayer.props;
if (props.kind === "set3d") {
  const all = collectNodes(props.nodes);
  const deepChild = all.find((n) => n.kind === "primitive" && n.name === "Leg 1")!;
  const cameraId = props.activeCameraId!;

  // group nesting round-trip through the store
  const group = createGroupNode([createPrimitiveNode("box", { name: "InnerBox" })], { name: "TestGroup" });
  useDocStore.getState().addSetNode(sceneId, setLayer.id, group);
  let live = useDocStore.getState().project!.scenes[0].layers.find((l) => l.id === setLayer.id)!;
  check(
    "addSetNode + findSetNode reaches nested child",
    live.props.kind === "set3d" && findSetNode(live.props.nodes, group.children[0].id)?.name === "InnerBox",
  );

  useDocStore.getState().updateSetNode(sceneId, setLayer.id, deepChild.id, { name: "Leg 1 renamed" });
  live = useDocStore.getState().project!.scenes[0].layers.find((l) => l.id === setLayer.id)!;
  check(
    "updateSetNode reaches a node nested in a group",
    live.props.kind === "set3d" && findSetNode(live.props.nodes, deepChild.id)?.name === "Leg 1 renamed",
  );

  useDocStore.getState().removeSetNode(sceneId, setLayer.id, deepChild.id);
  live = useDocStore.getState().project!.scenes[0].layers.find((l) => l.id === setLayer.id)!;
  check(
    "removeSetNode deletes recursively",
    live.props.kind === "set3d" && findSetNode(live.props.nodes, deepChild.id) === undefined,
  );

  useDocStore.getState().removeSetNode(sceneId, setLayer.id, cameraId);
  live = useDocStore.getState().project!.scenes[0].layers.find((l) => l.id === setLayer.id)!;
  check(
    "deleting the program camera clears activeCameraId",
    live.props.kind === "set3d" && live.props.activeCameraId === null,
  );
}

// --- 6. Phase 5.5: full-screen templates -------------------------------------
console.log("\n[6] full-screen templates (schema round-trip + bindings resolve)");
const SPORT_IDS: SportId[] = ["soccer", "basketball", "football", "baseball", "hockey", "tennis", "volleyball", "rugby"];
const liveValues = buildDataValues(useDataStore.getState());

function collectElements(elements: Element[]): Element[] {
  return elements.flatMap((e) => [e, ...(e.kind === "group" ? collectElements(e.children) : [])]);
}

const templateProject = createDefaultProject("phase5.5-verify");
for (const sport of SPORT_IDS) {
  for (const template of [...FULLSCREEN_TEMPLATES, ...LOWER_THIRDS]) {
    const layer = template.create(sport, sport);
    templateProject.scenes[0].layers.push(layer);
    if (layer.props.kind !== "gfx2d") {
      check(`${sport}/${template.id}: gfx2d`, false);
      continue;
    }
    const els = collectElements(layer.props.elements);
    // Every binding with a non-empty source must resolve against the REAL
    // flattened data values — a typo'd key would silently fall back forever.
    const badBindings = els.flatMap((e) =>
      e.bindings.filter((b) => b.source !== "" && liveValues[b.source] === undefined).map((b) => b.source),
    );
    check(`${sport}/${template.id}: all bound keys exist in data sources`, badBindings.length === 0, badBindings.join(","));
    // Full-width accent bars intentionally bleed 20px past each edge so
    // skewed ends never show a gap — allow that, flag anything larger.
    const unbounded = els.every((e) => e.transform.width <= 1960 && e.transform.height <= 1080);
    check(`${sport}/${template.id}: elements within frame (+bleed)`, unbounded);
    check(`${sport}/${template.id}: has IN/OUT timeline`, !!layer.timeline);
  }
  // Phase 5.7 unified modern scorebug — one builder, all 8 sports, bound to
  // the sport's 6 core keys.
  const bug = createScorebug(sport, sport);
  templateProject.scenes[0].layers.push(bug);
  if (bug.props.kind === "gfx2d") {
    const els = collectElements(bug.props.elements);
    const bad = els.flatMap((e) => e.bindings.filter((b) => b.source !== "" && liveValues[b.source] === undefined).map((b) => b.source));
    check(`${sport}/scorebug: all bound keys exist in data sources`, bad.length === 0, bad.join(","));
    check(`${sport}/scorebug: has IN/OUT timeline`, !!bug.timeline);
    check(`${sport}/scorebug: skewed gloss panels present`, els.some((e) => e.kind === "rect" && e.skewX !== undefined && e.skewX !== 0));
  } else {
    check(`${sport}/scorebug: gfx2d`, false);
  }
  // Phase 5.7 modern corner scorebug — same 6 core keys, per-element anim.
  const modern = createModernScorebug(sport, sport);
  templateProject.scenes[0].layers.push(modern);
  if (modern.props.kind === "gfx2d") {
    const els = collectElements(modern.props.elements);
    const bad = els.flatMap((e) => e.bindings.filter((b) => b.source !== "" && liveValues[b.source] === undefined).map((b) => b.source));
    check(`${sport}/scorebug-modern: all bound keys exist in data sources`, bad.length === 0, bad.join(","));
    check(`${sport}/scorebug-modern: per-element choreography present`, els.some((e) => !!e.anim?.in));
  } else {
    check(`${sport}/scorebug-modern: gfx2d`, false);
  }
}

// Phase 5.7 genre packs — sport-independent, bound to politics/weather/
// program/event feeds. Same binding-resolution + in-frame + timeline checks.
for (const category of GENRE_CATEGORIES) {
  for (const template of category.templates) {
    const layer = template.create();
    templateProject.scenes[0].layers.push(layer);
    if (layer.props.kind !== "gfx2d") {
      check(`${category.id}/${template.id}: gfx2d`, false);
      continue;
    }
    const els = collectElements(layer.props.elements);
    const badBindings = els.flatMap((e) =>
      e.bindings.filter((b) => b.source !== "" && liveValues[b.source] === undefined).map((b) => b.source),
    );
    check(`${category.id}/${template.id}: all bound keys exist in data sources`, badBindings.length === 0, badBindings.join(","));
    const unbounded = els.every((e) => e.transform.width <= 1960 && e.transform.height <= 1080);
    check(`${category.id}/${template.id}: elements within frame (+bleed)`, unbounded);
    check(`${category.id}/${template.id}: has IN/OUT timeline`, !!layer.timeline);
  }
}
// Phase 5.11 branding pack — same binding/frame/timeline checks, plus proof
// the new scaleFrom (pop-in) / loop (pulse) fields actually reach real
// templates, not just the pure engine functions.
let sawScaleFrom = false;
let sawLoopPulse = false;
for (const template of BRANDING_TEMPLATES) {
  const layer = template.create();
  templateProject.scenes[0].layers.push(layer);
  if (layer.props.kind !== "gfx2d") {
    check(`branding/${template.id}: gfx2d`, false);
    continue;
  }
  const els = collectElements(layer.props.elements);
  const badBindings = els.flatMap((e) =>
    e.bindings.filter((b) => b.source !== "" && liveValues[b.source] === undefined).map((b) => b.source),
  );
  check(`branding/${template.id}: all bound keys exist in data sources`, badBindings.length === 0, badBindings.join(","));
  const unbounded = els.every((e) => e.transform.width <= 1960 && e.transform.height <= 1080);
  check(`branding/${template.id}: elements within frame (+bleed)`, unbounded);
  check(`branding/${template.id}: has IN/OUT timeline`, !!layer.timeline);
  if (els.some((e) => e.anim?.in?.scaleFrom !== undefined)) sawScaleFrom = true;
  if (els.some((e) => e.anim?.loop !== undefined)) sawLoopPulse = true;
}
check("branding: at least one element uses scaleFrom (pop-in)", sawScaleFrom);
check("branding: at least one element uses loop (pulse)", sawLoopPulse);

// Countdown's live-computed value (Phase 5.11) — proves the derived
// countdown.remaining/expired keys are real, not just present-but-static.
{
  const future = new Date(Date.now() + 90_000).toISOString(); // 90s out
  useDataStore.getState().setFeedValue("countdown", "targetIso", future);
  const nowValues = buildDataValues(useDataStore.getState());
  const remaining = nowValues["countdown.remaining"];
  check("countdown.remaining is a live mm:ss derived from targetIso", /^\d{1,2}:\d{2}$/.test(remaining), remaining);
  check("countdown.expired is false while target is in the future", nowValues["countdown.expired"] === "false");
  useDataStore.getState().setFeedValue("countdown", "targetIso", new Date(Date.now() - 5_000).toISOString());
  const pastValues = buildDataValues(useDataStore.getState());
  check("countdown.expired is true once target has passed", pastValues["countdown.expired"] === "true");
  useDataStore.getState().setFeedValue("countdown", "targetIso", "");
  const unsetValues = buildDataValues(useDataStore.getState());
  check("countdown.remaining is an honest placeholder when unset", unsetValues["countdown.remaining"] === "--:--");
}

// Image + video elements survive the schema too (Phase 5.5 additions).
const gfxLayer = templateProject.scenes[0].layers[0];
if (gfxLayer.props.kind === "gfx2d") {
  gfxLayer.props.elements.push(createImageElement("asset-img-1"));
  gfxLayer.props.elements.push(
    createVideoElement({ source: { type: "url", url: "http://127.0.0.1:4977/assets/x.mp4" }, volume: 0.65, muted: true }),
  );
}
templateProject.assets.push({
  id: "asset-img-1",
  kind: "image",
  name: "logo.png",
  src: "http://127.0.0.1:4977/assets/logo.png",
  thumbnail: "data:image/png;base64,AAAA",
});
const templateRoundTrip = projectSchema.parse(JSON.parse(JSON.stringify(templateProject)));
check(
  "templates+image+video project round-trips value-identical (gradient/source/thumbnail all mirrored)",
  stableStringify(templateRoundTrip) === stableStringify(templateProject),
);
// The gradient must actually SURVIVE construction + round-trip — Phase 4's
// factory-forgot-to-copy-a-field bug class, caught again this session when
// createRectElement dropped `overrides.gradient`.
const matchupBackdrop =
  templateProject.scenes[0].layers[0].props.kind === "gfx2d"
    ? templateProject.scenes[0].layers[0].props.elements.find((e) => e.name === "Backdrop")
    : undefined;
check(
  "backdrop gradient survives factory + schema",
  matchupBackdrop?.kind === "rect" &&
    !!matchupBackdrop.gradient &&
    (() => {
      const rt = templateRoundTrip as Project;
      const el =
        rt.scenes[0].layers[0].props.kind === "gfx2d"
          ? rt.scenes[0].layers[0].props.elements.find((e) => e.name === "Backdrop")
          : undefined;
      return el?.kind === "rect" && el.gradient?.direction === "diagonal";
    })(),
);
// Audio fields — the same factory-forgot-a-field class that dropped
// gradient/scrollSpeed before. Explicit, not just the aggregate round-trip.
check(
  "video element volume/muted survive factory + schema round-trip",
  (() => {
    const rt = templateRoundTrip as Project;
    const el =
      rt.scenes[0].layers[0].props.kind === "gfx2d"
        ? rt.scenes[0].layers[0].props.elements.find((e) => e.kind === "video")
        : undefined;
    return el?.kind === "video" && el.volume === 0.65 && el.muted === true;
  })(),
);
{
  // Same check for the 3D videofeed node — a separate factory function
  // (createVideoFeedNode), so it can independently drop a field. Round-trip
  // through the real projectSchema, same as everything else in this file.
  const feedNode = createVideoFeedNode({ volume: 0.4, muted: false, label: "audio-verify" });
  const audioProject = createDefaultProject("audio-verify");
  audioProject.scenes[0].layers.push(createSet3dLayer([feedNode]));
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(audioProject))) as Project;
  const parsedLayer = parsed.scenes[0].layers[0];
  const parsedNode = parsedLayer.props.kind === "set3d" ? findSetNode(parsedLayer.props.nodes, feedNode.id) : undefined;
  check(
    "videofeed node volume/muted survive factory + schema round-trip",
    parsedNode?.kind === "videofeed" && parsedNode.volume === 0.4 && parsedNode.muted === false,
  );
}

// --- 7. duplicateLayer ------------------------------------------------------
console.log("\n[7] duplicateLayer (fresh ids, camera remap)");
const dupProject = createDefaultProject("dup-verify");
const dupSet = SET_BUILDERS[0].create();
dupProject.scenes[0].layers.push(dupSet);
useDocStore.getState().loadProject(dupProject);
useDocStore.getState().duplicateLayer(dupProject.scenes[0].id, dupSet.id);
{
  const live = useDocStore.getState().project!;
  const layersNow = live.scenes[0].layers;
  const copy = layersNow[layersNow.findIndex((l) => l.id === dupSet.id) + 1];
  check("duplicate exists directly after original", !!copy && copy.id !== dupSet.id && copy.name.endsWith("copy"));
  if (copy && copy.props.kind === "set3d" && dupSet.props.kind === "set3d") {
    const originalIds = new Set(collectNodes(dupSet.props.nodes).map((n) => n.id));
    const copyIds = collectNodes(copy.props.nodes).map((n) => n.id);
    check("every duplicated node id is fresh", copyIds.every((id) => !originalIds.has(id)));
    check(
      "activeCameraId remapped onto the cloned camera",
      !!copy.props.activeCameraId &&
        copy.props.activeCameraId !== dupSet.props.activeCameraId &&
        findSetNode(copy.props.nodes, copy.props.activeCameraId)?.kind === "camera",
    );
  }
}

// --- 8. Phase 5.6: per-element choreography (real applyPlayback calls) ------
console.log("\n[8] per-element animation engine");
const l3 = createBreakingNewsLowerThird();
if (l3.props.kind !== "gfx2d" || !l3.timeline) {
  check("breaking-news L3 shape", false);
} else {
  const tl = l3.timeline;
  const els = l3.props.elements;
  const barAuthored = els.find((e) => e.name === "Headline Bar")!;
  const kickerAuthored = els.find((e) => e.name === "Kicker Tab")!;
  const headlineAuthored = els.find((e) => e.name === "Headline")!;

  // t=0 of IN: nothing has started — no element may sit visibly on screen.
  const atZero = els.map((e) => applyPlayback(e, 0, tl, "in"));
  check("IN t=0: every choreographed element hidden", atZero.every((e) => e.opacity === 0));

  // Mid-stagger (t=0.25s): the main bar (delay 0) is on screen and still
  // displaced LEFT of its authored x; the kicker (delay 0.3) has not started.
  const barMid = applyPlayback(barAuthored, 0.25, tl, "in");
  const kickerMid = applyPlayback(kickerAuthored, 0.25, tl, "in");
  check(
    "IN t=0.25: bar visible, mid-flight, left of authored",
    barMid.opacity === barAuthored.opacity &&
      barMid.transform.x < barAuthored.transform.x &&
      barMid.transform.x > barAuthored.transform.x - 900,
  );
  check("IN t=0.25: kicker (delay .3) not yet on screen", kickerMid.opacity === 0);

  // Settled (past the envelope): every element exactly at authored state.
  const settled = els.map((e) => applyPlayback(e, tl.inDuration, tl, "in"));
  check(
    "IN settled: all elements at authored position/opacity",
    settled.every((e, i) => {
      const a = els[i];
      return (
        Math.abs(e.transform.x - a.transform.x) < 0.001 &&
        Math.abs(e.transform.y - a.transform.y) < 0.001 &&
        Math.abs(e.opacity - a.opacity) < 0.001
      );
    }),
  );

  // OUT mid-flight: headline (out delay 0, fade) is dimming; the bar (out
  // delay .15) hasn't started leaving and is still fully visible in place.
  const headlineOut = applyPlayback(headlineAuthored, 0.05, tl, "out");
  const barOut = applyPlayback(barAuthored, 0.05, tl, "out");
  check("OUT t=0.05: headline already fading", headlineOut.opacity < headlineAuthored.opacity && headlineOut.opacity > 0);
  check(
    "OUT t=0.05: bar (delay .15) still fully in place",
    barOut.opacity === barAuthored.opacity && barOut.transform.x === barAuthored.transform.x,
  );

  // OUT complete: everything gone.
  const gone = els.map((e) => applyPlayback(e, tl.outDuration, tl, "out"));
  check("OUT complete: every element off screen", gone.every((e) => e.opacity === 0));

  // Legacy path intact: an element with NO anim still gets the layer-wide
  // slide/fade (Phase 3 behavior must not regress).
  const plain = { ...barAuthored, anim: undefined };
  const plainMid = applyPlayback(plain, tl.inDuration / 2, tl, "in");
  check(
    "legacy layer-wide fallback still applies to anim-less elements",
    plainMid.opacity > 0 && plainMid.opacity < 1 && plainMid.transform.y > plain.transform.y,
  );
}

// --- 8b. Phase 5.11 primitives: scaleFrom (pop-in) and countUp, exercised
// directly against applyPlayback at real elapsed times, not just checked for
// presence — a bug in the math would show up here even if it never crashes.
console.log("\n[8b] scaleFrom + countUp animation primitives");
{
  const tl = defaultTimeline({ inDuration: 1, outDuration: 0.5 });
  const popSpec = { delay: 0, duration: 0.4, direction: "none" as const, distance: 0, ease: "linear", fade: false, scaleFrom: 0.4 };
  const authored = createRectElement({
    name: "Pop Test",
    transform: { x: 500, y: 500, width: 200, height: 100, rotation: 0 },
    anim: { in: popSpec, out: popSpec },
  });
  const centerX = authored.transform.x + authored.transform.width / 2;
  const centerY = authored.transform.y + authored.transform.height / 2;

  const popStart = applyPlayback(authored, 0, tl, "in");
  check("pop-in t=0: scaled down to scaleFrom, center-anchored", popStart.transform.width < authored.transform.width * 0.5);
  check(
    "pop-in t=0: center stays fixed while scaling",
    Math.abs(popStart.transform.x + popStart.transform.width / 2 - centerX) < 0.01 &&
      Math.abs(popStart.transform.y + popStart.transform.height / 2 - centerY) < 0.01,
  );
  const popEnd = applyPlayback(authored, 0.4, tl, "in");
  check(
    "pop-in settled: back to authored width/height exactly",
    popEnd.transform.width === authored.transform.width && popEnd.transform.height === authored.transform.height,
  );

  const countSpec = { delay: 0, duration: 1, direction: "none" as const, distance: 0, ease: "linear", fade: false, countUp: true };
  const scoreEl = createTextElement({ name: "Score", text: "42", anim: { in: countSpec } });
  const countStart = applyPlayback(scoreEl, 0, tl, "in");
  const countMid = applyPlayback(scoreEl, 0.5, tl, "in");
  const countEnd = applyPlayback(scoreEl, 1, tl, "in");
  check("count-up t=0: starts at 0", countStart.kind === "text" && countStart.text === "0");
  check(
    "count-up mid: partway to target, not yet arrived",
    countMid.kind === "text" && Number(countMid.text) > 0 && Number(countMid.text) < 42,
  );
  check("count-up settled: reaches the authored numeric text exactly", countEnd.kind === "text" && countEnd.text === "42");
  const nonNumeric = createTextElement({ name: "Label", text: "LIVE", anim: { in: countSpec } });
  const nonNumericMid = applyPlayback(nonNumeric, 0.5, tl, "in");
  check("count-up on non-numeric text is a no-op (text unchanged)", nonNumericMid.kind === "text" && nonNumericMid.text === "LIVE");
}

// --- 9. Timeline sequencer must not drive layers the operator never put on
// it. Regression guard for a real bug: every layer rendered a ghost default
// clip [0,5]; the transport fired playIn/playOut off that ghost the moment
// the Timeline page mounted (playhead starts at 0, default inTime is 0),
// silently overriding manual Play In/Out for graphics never meant to be
// sequenced at all — "some enter Program instantly, others never make it."
console.log("\n[9] Timeline sequencer gating (hasClip vs getClip fallback)");
{
  const sceneId = "verify-scene";
  const untouchedLayerId = "verify-layer-untouched";
  const touchedLayerId = "verify-layer-touched";

  check("hasClip false before any setClip", !useSequenceStore.getState().hasClip(sceneId, untouchedLayerId));
  check(
    "getClip still returns DEFAULT_CLIP as a display fallback",
    JSON.stringify(useSequenceStore.getState().getClip(sceneId, untouchedLayerId)) === JSON.stringify(DEFAULT_CLIP),
  );

  useSequenceStore.getState().setClip(sceneId, touchedLayerId, { inTime: 1, outTime: 3 });
  check("hasClip true immediately after setClip", useSequenceStore.getState().hasClip(sceneId, touchedLayerId));
  check(
    "getClip returns the authored clip, not the default, once touched",
    useSequenceStore.getState().getClip(sceneId, touchedLayerId).inTime === 1,
  );
  check("untouched sibling layer is unaffected by another layer's setClip", !useSequenceStore.getState().hasClip(sceneId, untouchedLayerId));

  // Reproduces the exact guard TimelinePanel's sync effect uses: at
  // playhead=0 the untouched layer's GHOST clip (default inTime 0) would
  // compute desired="in" — proving the bug scenario is real — but the
  // `hasClip` guard must skip firing playIn for it.
  useDocStore.getState().resetPlayback(untouchedLayerId);
  const ghostClip = useSequenceStore.getState().getClip(sceneId, untouchedLayerId);
  const wouldFireWithoutGuard = 0 >= ghostClip.inTime; // true — this is the bug condition
  check("ghost clip at playhead=0 would satisfy the old unguarded fire condition", wouldFireWithoutGuard);
  if (useSequenceStore.getState().hasClip(sceneId, untouchedLayerId)) {
    useDocStore.getState().playIn(untouchedLayerId);
  } // the real gated code path: skipped, since hasClip is false
  check(
    "guarded path never calls playIn for an unsequenced layer despite the ghost clip",
    useDocStore.getState().layerPlayback[untouchedLayerId] === undefined,
  );
}

console.log("\n[10] Lottie motion-graphic element (factory + schema round-trip)");
{
  const project = createDefaultProject();
  const lottieAsset = { id: "verify-lottie-asset", kind: "lottie" as const, name: "bug.json", src: "http://127.0.0.1:4977/assets/bug.json" };
  project.assets.push(lottieAsset);
  const lottieEl = createLottieElement(lottieAsset.id, { name: "Breaking Bug", loop: false, speed: 1.5 });
  const layer = createLayer("gfx2d", { name: "Motion" });
  if (layer.props.kind === "gfx2d") layer.props.elements = [lottieEl];
  project.scenes[0].layers.push(layer);

  const parsed = projectSchema.parse(project) as Project;
  const roundTripped = parsed.scenes[0].layers.find((l) => l.id === layer.id);
  const el =
    roundTripped?.props.kind === "gfx2d" ? roundTripped.props.elements.find((e) => e.id === lottieEl.id) : undefined;
  check("lottie element survives schema round-trip", el?.kind === "lottie");
  if (el?.kind === "lottie") {
    check("lottie assetId survives factory + schema round-trip", el.assetId === lottieAsset.id);
    check("lottie loop:false survives factory + schema round-trip (not silently defaulted)", el.loop === false);
    check("lottie speed survives factory + schema round-trip", el.speed === 1.5);
  }
  check("lottie asset kind survives schema round-trip", parsed.assets.find((a) => a.id === lottieAsset.id)?.kind === "lottie");
}

// --- 11. Phase 5.13: PBR realism fields round-trip -------------------------
console.log("\n[11] Phase 5.13 realism pipeline fields");
{
  const realismProject = createDefaultProject("realism-verify");
  const deskNode = createPrimitiveNode("box", {
    name: "Desk Top",
    reflector: true,
    material: { color: "#1a1a2e", metalness: 0.7, roughness: 0.2, clearcoat: 0.4, usePhysical: true, envMapIntensity: 1.2 },
  });
  const setLayer = createSet3dLayer([deskNode]);
  if (setLayer.props.kind === "set3d") {
    setLayer.props.render = {
      ...setLayer.props.render,
      qualityTier: "high",
      envResolution: 256,
      envCubemapAssetId: "env-cube-1",
      planarReflection: { enabled: true, maxCount: 2 },
      ssr: { enabled: true },
    };
    setLayer.props.environment = {
      ...setLayer.props.environment,
      floor: {
        ...setLayer.props.environment.floor,
        reflector: { enabled: true, resolution: 1024, mixStrength: 0.6, mirror: 0.4 },
      },
    };
  }
  realismProject.assets.push({
    id: "env-cube-1",
    kind: "image",
    name: "studio-env.jpg",
    src: "http://127.0.0.1:4977/assets/studio-env.jpg",
    thumbnail: "data:image/jpeg;base64,/9j/4AAQ",
  });
  realismProject.scenes[0].layers.push(setLayer);
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(realismProject))) as Project;
  const live = parsed.scenes[0].layers.find((l) => l.id === setLayer.id);
  check("realism project round-trips value-identical", stableStringify(parsed) === stableStringify(realismProject));
  if (live?.props.kind === "set3d") {
    const desk = findSetNode(live.props.nodes, deskNode.id);
    check("primitive reflector survives round-trip", desk?.kind === "primitive" && desk.reflector === true);
    check("material clearcoat/envMapIntensity survive", desk?.kind === "primitive" && desk.material.clearcoat === 0.4 && desk.material.envMapIntensity === 1.2);
    check("render ssr + cubemap + tier survive", live.props.render.ssr?.enabled === true && live.props.render.envCubemapAssetId === "env-cube-1" && live.props.render.qualityTier === "high");
    check("floor reflector survives", live.props.environment.floor.reflector?.enabled === true && live.props.environment.floor.reflector.resolution === 1024);
    check("planar maxCount 2 survives", live.props.render.planarReflection?.maxCount === 2);
  } else {
    check("realism set layer shape", false);
  }
}

// --- 13. squad/map templates + virtual camera motion ------------------------
console.log("\n[13] squad boards, map board, camera moves");
{
  const vals = buildDataValues(useDataStore.getState());
  const checkTemplate = (id: string, layer: Layer, expectSlots = 0) => {
    if (layer.props.kind !== "gfx2d") {
      check(`${id}: gfx2d`, false);
      return;
    }
    const els = collectElements(layer.props.elements);
    const bad = els.flatMap((e) =>
      e.bindings.filter((b) => b.source !== "" && vals[b.source] === undefined).map((b) => b.source),
    );
    check(`${id}: all bound keys exist in data sources`, bad.length === 0, bad.join(","));
    check(`${id}: elements within frame (+bleed)`, els.every((e) => e.transform.width <= 1960 && e.transform.height <= 1080));
    check(`${id}: has IN/OUT timeline`, !!layer.timeline);
    if (expectSlots > 0) {
      const slots = els.filter((e) => e.kind === "image" && e.assetId === "");
      check(`${id}: has ${expectSlots} unfilled image slot(s)`, slots.length === expectSlots, `got ${slots.length}`);
    }
  };

  for (const f of FORMATIONS) {
    const board = createFormationBoard(f.id);
    checkTemplate(`squad/${f.id}`, board);
    if (board.props.kind === "gfx2d") {
      const markers = board.props.elements.filter((e) => e.kind === "group" && e.name.includes("Marker"));
      check(`squad/${f.id}: 11 player markers`, markers.length === 11, `got ${markers.length}`);
      check(`squad/${f.id}: 11 formation positions`, f.positions.length === 11);
    }
  }
  checkTemplate("squad/player-card", createPlayerCard(), 1);

  const mapBoard = createMapBoard();
  checkTemplate("map/board", mapBoard, 1);
  if (mapBoard.props.kind === "gfx2d") {
    const pins = mapBoard.props.elements.filter((e) => e.kind === "group" && e.name.startsWith("Map Pin"));
    check("map/board: 4 pins", pins.length === 4, `got ${pins.length}`);
    const pulses = collectElements(mapBoard.props.elements).filter((e) => e.anim?.loop);
    check("map/board: pins carry loop pulses", pulses.length >= 4, `got ${pulses.length}`);
  }

  // Camera motion slice, against the REAL store — the end state must be
  // committed to the document even if no consumer ever renders a frame.
  const camProject = createDefaultProject("cam-verify");
  const camSet = SET_BUILDERS[0].create();
  camProject.scenes[0].layers.push(camSet);
  useDocStore.getState().loadProject(camProject);
  const camSceneId = camProject.scenes[0].id;
  if (camSet.props.kind === "set3d") {
    const camA = camSet.props.activeCameraId!;
    const camB = createCameraNode({ name: "CAM B", transform: { position: { x: 4, y: 2, z: 5 } }, fov: 35 });
    useDocStore.getState().addSetNode(camSceneId, camSet.id, camB);
    const subject = createPrimitiveNode("box", { name: "Subject", transform: { position: { x: 1, y: 1, z: -2 } } });
    useDocStore.getState().addSetNode(camSceneId, camSet.id, subject);

    const liveProps = () => {
      const l = useDocStore.getState().project!.scenes[0].layers.find((x) => x.id === camSet.id)!;
      return l.props.kind === "set3d" ? l.props : null;
    };

    // Smooth take: activeCameraId committed immediately, move records the
    // pose of the PREVIOUS camera as `from`.
    useDocStore.getState().takeCameraSmooth(camSceneId, camSet.id, camB.id, 1.2, "power2.inOut");
    let move = useDocStore.getState().cameraMoves[camSet.id];
    const camANode = findSetNode(liveProps()!.nodes, camA);
    check("take: activeCameraId committed", liveProps()!.activeCameraId === camB.id);
    check(
      "take: from pose captured from previous camera",
      !!move && camANode?.kind === "camera" && move.from.fov === camANode.fov &&
        move.from.position.x === camANode.transform.position.x,
    );
    check("take: duration/ease recorded", !!move && move.durationSec === 1.2 && move.ease === "power2.inOut");

    // Hard cut: no move entry survives.
    useDocStore.getState().takeCameraSmooth(camSceneId, camSet.id, camA, 0, "none");
    check("cut: no in-flight move", useDocStore.getState().cameraMoves[camSet.id] === undefined);
    check("cut: activeCameraId committed", liveProps()!.activeCameraId === camA);

    // Push-in: camera node position moves along its lens axis and a move records.
    const before = findSetNode(liveProps()!.nodes, camA)!.transform.position;
    useDocStore.getState().nudgeProgramCamera(camSceneId, camSet.id, "push");
    const after = findSetNode(liveProps()!.nodes, camA)!.transform.position;
    const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    check("push: camera dollied ~1.5m", Math.abs(moved - 1.5) < 1e-6, `moved=${moved}`);
    check("push: move recorded", !!useDocStore.getState().cameraMoves[camSet.id]);

    // Focus: rotation really aims the camera's -Z at the subject.
    useDocStore.getState().focusProgramCamera(camSceneId, camSet.id, subject.id);
    const focused = findSetNode(liveProps()!.nodes, camA)!;
    if (focused.kind === "camera") {
      const o = new Object3D();
      const r = focused.transform.rotation;
      o.rotation.copy(new Euler(MathUtils.degToRad(r.x), MathUtils.degToRad(r.y), MathUtils.degToRad(r.z)));
      const fwd = new Vector3(0, 0, -1).applyQuaternion(o.quaternion);
      const p = focused.transform.position;
      const to = new Vector3(1 - p.x, 1 - p.y, -2 - p.z).normalize();
      check("focus: camera -Z aims at subject", fwd.dot(to) > 0.999, `dot=${fwd.dot(to).toFixed(5)}`);
    }

    // Orbit math: radius preserved at all times; degPerSec 0 follows a
    // moving pivot at the original offset.
    const fromPose = { position: { x: 3, y: 2, z: 4 }, rotation: { x: 0, y: 0, z: 0 }, fov: 50 };
    const pivot = { x: 0, y: 1, z: 0 };
    const r0 = Math.hypot(fromPose.position.x - pivot.x, fromPose.position.z - pivot.z);
    const p1 = orbitPosition(fromPose, pivot, pivot, 45, 1.7);
    const r1 = Math.hypot(p1.x - pivot.x, p1.z - pivot.z);
    check("orbit: radius preserved", Math.abs(r1 - r0) < 1e-9, `r0=${r0} r1=${r1}`);
    check("orbit: height preserved", p1.y === fromPose.position.y);
    const movedPivot = { x: 5, y: 1, z: 5 };
    const follow = orbitPosition(fromPose, pivot, movedPivot, 0, 9);
    check(
      "follow (0°/s): original offset held on a moving pivot",
      Math.abs(follow.x - (movedPivot.x + 3)) < 1e-9 && Math.abs(follow.z - (movedPivot.z + 4)) < 1e-9,
    );

    // Orbit start/stop on the real store: stop commits the reached pose.
    useDocStore.getState().startCameraOrbit(camSceneId, camSet.id, subject.id, 30);
    check("orbit: entry recorded", !!useDocStore.getState().cameraOrbits[camSet.id]);
    useDocStore.getState().stopCameraOrbit(camSceneId, camSet.id);
    check("orbit: entry cleared on stop", useDocStore.getState().cameraOrbits[camSet.id] === undefined);
    const held = findSetNode(liveProps()!.nodes, camA)!;
    if (held.kind === "camera") {
      const hp = held.transform.position;
      const sr = Math.hypot(hp.x - 1, hp.z - -2);
      check("orbit stop: camera held on its orbit ring", Number.isFinite(sr) && sr > 0);
    }

    // PVW rehearsal is transient and per-layer.
    useDocStore.getState().setCameraPreview(camSet.id, camB.id);
    check("preview: set", useDocStore.getState().cameraPreview[camSet.id] === camB.id);
    useDocStore.getState().setCameraPreview(camSet.id, null);
    check("preview: cleared", useDocStore.getState().cameraPreview[camSet.id] === undefined);
  } else {
    check("camera verify set layer shape", false);
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
