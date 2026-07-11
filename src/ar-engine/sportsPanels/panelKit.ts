import { createGroupNode, createPrimitiveNode, createText3dNode, vec3 } from "@/document/factory";
import type {
  ARAnimation,
  GroupNode,
  MaterialProps,
  PrimitiveNode,
  SetNode,
  Text3dNode,
  UpdateAnim,
  Vec3,
} from "@/document/types";

/**
 * Sports AR panel construction kit — the shared parametric geometry system
 * behind every model in the `AR 3D Models > Sports Graphics` library.
 *
 * Every panel is REAL 3D: front and rear frame rings are beveled extruded
 * prisms (never a flat plane with a baked picture), side depth is genuine
 * connecting geometry, bases are solid plinths, and the light strips are
 * emissive meshes following the silhouette's actual edges. The default
 * output is deliberately EMPTY and sport-neutral: no team, no score, no
 * logo, no words, no colour identity — the reference images inform only the
 * structural silhouette, and all chrome ships in neutral metal/white.
 */

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

/** Geometry controls exposed for every model (metres / degrees). Each spec
 * defines reference defaults; "Reset Geometry to Reference" re-builds with
 * exactly these. */
export interface SportsPanelParams {
  width: number;
  height: number;
  depth: number;
  frameThickness: number;
  frameDepth: number;
  baseWidth: number;
  baseDepth: number;
  baseHeight: number;
  cornerBevel: number;
  leftAngle: number;
  rightAngle: number;
  topAngle: number;
  bottomAngle: number;
  contentInset: number;
  stripWidth: number;
  stripDepth: number;
  /** Panel lean back in degrees (references 02/05/09 sit tilted). */
  tilt: number;
}

export interface ParamRange {
  min: number;
  max: number;
  step: number;
  label: string;
  unit: "m" | "°";
}

export const PARAM_RANGES: Record<keyof SportsPanelParams, ParamRange> = {
  width: { min: 0.5, max: 8, step: 0.05, label: "Width", unit: "m" },
  height: { min: 0.3, max: 5, step: 0.05, label: "Height", unit: "m" },
  depth: { min: 0.05, max: 1, step: 0.01, label: "Depth", unit: "m" },
  frameThickness: { min: 0.02, max: 0.4, step: 0.005, label: "Frame thickness", unit: "m" },
  frameDepth: { min: 0.02, max: 0.4, step: 0.005, label: "Frame depth", unit: "m" },
  baseWidth: { min: 0.2, max: 9, step: 0.05, label: "Base width", unit: "m" },
  baseDepth: { min: 0.1, max: 3, step: 0.05, label: "Base depth", unit: "m" },
  baseHeight: { min: 0.02, max: 1.5, step: 0.01, label: "Base height", unit: "m" },
  cornerBevel: { min: 0, max: 0.6, step: 0.01, label: "Corner bevel", unit: "m" },
  leftAngle: { min: 0, max: 60, step: 1, label: "Left angle", unit: "°" },
  rightAngle: { min: 0, max: 60, step: 1, label: "Right angle", unit: "°" },
  topAngle: { min: 0, max: 60, step: 1, label: "Top angle", unit: "°" },
  bottomAngle: { min: 0, max: 60, step: 1, label: "Bottom angle", unit: "°" },
  contentInset: { min: 0, max: 0.3, step: 0.005, label: "Content inset", unit: "m" },
  stripWidth: { min: 0.005, max: 0.12, step: 0.002, label: "Light-strip width", unit: "m" },
  stripDepth: { min: 0.005, max: 0.12, step: 0.002, label: "Light-strip depth", unit: "m" },
  tilt: { min: -30, max: 30, step: 0.5, label: "Tilt", unit: "°" },
};

export function clampParams(params: SportsPanelParams): SportsPanelParams {
  const out = { ...params };
  for (const key of Object.keys(PARAM_RANGES) as (keyof SportsPanelParams)[]) {
    const r = PARAM_RANGES[key];
    const v = out[key];
    out[key] = Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.min;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Neutral material presets — never a team colour, never a sponsor look.
// ---------------------------------------------------------------------------

export interface MaterialPreset {
  id: string;
  label: string;
  material: MaterialProps;
}

const preset = (id: string, label: string, material: MaterialProps): MaterialPreset => ({ id, label, material });

export const NEUTRAL_MATERIAL_PRESETS: MaterialPreset[] = [
  preset("matte-white", "Matte White", { color: "#f2f3f5", metalness: 0.02, roughness: 0.9 }),
  preset("satin-white", "Satin White", { color: "#eceef1", metalness: 0.1, roughness: 0.45 }),
  preset("light-grey", "Light Grey", { color: "#c7ccd3", metalness: 0.15, roughness: 0.55 }),
  preset("dark-grey", "Dark Grey", { color: "#5a6069", metalness: 0.3, roughness: 0.5 }),
  preset("charcoal", "Charcoal", { color: "#23272e", metalness: 0.45, roughness: 0.45 }),
  preset("black-metal", "Black Metal", { color: "#15181d", metalness: 0.85, roughness: 0.3 }),
  preset("brushed-metal", "Brushed Metal", { color: "#b9c0c9", metalness: 0.9, roughness: 0.3 }),
  preset("frosted-panel", "Frosted Panel", { color: "#dde3ea", metalness: 0.05, roughness: 0.25, opacity: 0.72 }),
  preset("clear-panel", "Clear Panel", { color: "#cfd9e4", metalness: 0.2, roughness: 0.08, opacity: 0.25 }),
  preset("gloss-trim", "Gloss Trim", { color: "#e6eaef", metalness: 0.75, roughness: 0.08, usePhysical: true, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
];

// Default part materials (all neutral — the operator recolours per team).
export const KIT_MATERIALS = {
  surface: { color: "#e9ecf0", metalness: 0.05, roughness: 0.4, emissive: "#e9ecf0", emissiveIntensity: 0.5, opacity: 0.98 } as MaterialProps,
  framePrimary: { color: "#bac1ca", metalness: 0.9, roughness: 0.26 } as MaterialProps,
  frameSecondary: { color: "#e2e6eb", metalness: 0.75, roughness: 0.14 } as MaterialProps,
  frameRear: { color: "#3a4048", metalness: 0.8, roughness: 0.4 } as MaterialProps,
  sideDepth: { color: "#4a515a", metalness: 0.82, roughness: 0.36 } as MaterialProps,
  base: { color: "#23272e", metalness: 0.6, roughness: 0.38 } as MaterialProps,
  baseTrim: { color: "#9aa2ac", metalness: 0.88, roughness: 0.2 } as MaterialProps,
  strip: { color: "#ffffff", metalness: 0.1, roughness: 0.3, emissive: "#ffffff", emissiveIntensity: 1.8 } as MaterialProps,
} as const;

/** Which colour group a structural part belongs to — drives "apply to
 * group" colour actions and the manifest's colourGroups. */
export const COLOUR_GROUP_BY_PART: Record<string, string> = {
  CONTENT_SURFACE: "content",
  INNER_FRAME: "frameSecondary",
  OUTER_FRAME_FRONT: "framePrimary",
  OUTER_FRAME_REAR: "frameSecondary",
  SIDE_DEPTH_LEFT: "frameSecondary",
  SIDE_DEPTH_RIGHT: "frameSecondary",
  TOP_TRIM: "accent",
  BOTTOM_TRIM: "accent",
  BASE_TOP: "base",
  BASE_MIDDLE: "base",
  BASE_BOTTOM: "base",
  SUPPORTS: "base",
  STRIP_TOP: "emissive",
  STRIP_LEFT: "emissive",
  STRIP_RIGHT: "emissive",
  STRIP_BOTTOM: "emissive",
  STRIP_BASE: "emissive",
};

export const COLOUR_GROUPS = ["content", "framePrimary", "frameSecondary", "base", "accent", "emissive"] as const;

// ---------------------------------------------------------------------------
// Outline math — convex silhouettes with real corner geometry.
// ---------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

/** Rectangle with per-corner 45° chamfers, CCW from bottom-left. Chamfer
 * sizes are clamped so opposing cuts can never cross. */
export function chamferRectOutline(
  w: number,
  h: number,
  c: { bl?: number; br?: number; tr?: number; tl?: number },
): Pt[] {
  const maxC = Math.min(w, h) * 0.45;
  const cl = (v?: number) => Math.min(Math.max(v ?? 0, 0), maxC);
  const [bl, br, tr, tl] = [cl(c.bl), cl(c.br), cl(c.tr), cl(c.tl)];
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const pts: Pt[] = [];
  // CCW starting on the bottom edge, after the bottom-left chamfer.
  pts.push({ x: x0 + bl, y: y0 });
  pts.push({ x: x1 - br, y: y0 });
  if (br > 0) pts.push({ x: x1, y: y0 + br });
  pts.push({ x: x1, y: y1 - tr });
  if (tr > 0) pts.push({ x: x1 - tr, y: y1 });
  pts.push({ x: x0 + tl, y: y1 });
  if (tl > 0) pts.push({ x: x0, y: y1 - tl });
  pts.push({ x: x0, y: y0 + bl });
  if (bl > 0) pts.push({ x: x0 + bl, y: y0 });
  return dedupe(pts);
}

/** Asymmetric corner cut: `cx` horizontal reach, `cy` vertical reach — a
 * non-45° facet (references 02/05/06 cut steep angles, not equal chamfers). */
export interface CornerCut {
  cx: number;
  cy: number;
}

/** Rectangle with independent per-corner facet cuts, CCW. Cuts clamp so the
 * two cuts on one side can meet exactly (a full point, reference 02's left
 * tip) but never cross. */
export function facetRectOutline(
  w: number,
  h: number,
  c: { bl?: CornerCut; br?: CornerCut; tr?: CornerCut; tl?: CornerCut },
): Pt[] {
  const cl = (cut: CornerCut | undefined, maxX: number, maxY: number): CornerCut => ({
    cx: Math.min(Math.max(cut?.cx ?? 0, 0), maxX),
    cy: Math.min(Math.max(cut?.cy ?? 0, 0), maxY),
  });
  const bl = cl(c.bl, w * 0.48, h / 2);
  const br = cl(c.br, w * 0.48, h / 2);
  const tr = cl(c.tr, w * 0.48, h / 2);
  const tl = cl(c.tl, w * 0.48, h / 2);
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const pts: Pt[] = [];
  pts.push({ x: x0 + bl.cx, y: y0 });
  pts.push({ x: x1 - br.cx, y: y0 });
  if (br.cx > 0 || br.cy > 0) pts.push({ x: x1, y: y0 + br.cy });
  pts.push({ x: x1, y: y1 - tr.cy });
  if (tr.cx > 0 || tr.cy > 0) pts.push({ x: x1 - tr.cx, y: y1 });
  pts.push({ x: x0 + tl.cx, y: y1 });
  if (tl.cx > 0 || tl.cy > 0) pts.push({ x: x0, y: y1 - tl.cy });
  pts.push({ x: x0, y: y0 + bl.cy });
  return dedupe(pts);
}

/** Circle / ellipse outline — orbit rings and round dishes. */
export function circleOutline(rx: number, ry: number, segments = 28): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: rx * Math.cos(t), y: ry * Math.sin(t) });
  }
  return pts;
}

/** Portrait rectangle whose top is a real arch (arc through `segments`
 * points) — reference 04's silhouette. */
export function archRectOutline(w: number, h: number, archHeight: number, segments = 14): Pt[] {
  const ah = Math.min(Math.max(archHeight, 0), h * 0.6);
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const yArc = h / 2 - ah;
  const pts: Pt[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: yArc },
  ];
  // Elliptical arc from right shoulder over the top to the left shoulder.
  for (let i = 1; i < segments; i++) {
    const t = (i / segments) * Math.PI;
    pts.push({ x: (w / 2) * Math.cos(t), y: yArc + ah * Math.sin(t) });
  }
  pts.push({ x: x0, y: yArc });
  return dedupe(pts);
}

/** Broadcast shield: flat top with cut top corners, sides tapering to a
 * soft point at the bottom — references 07/10. */
export function shieldOutline(w: number, h: number, topCut: number, pointDepth: number): Pt[] {
  const tc = Math.min(Math.max(topCut, 0), w * 0.4);
  const pd = Math.min(Math.max(pointDepth, 0), h * 0.5);
  const x1 = w / 2;
  const y1 = h / 2;
  const y0 = -h / 2;
  const shoulderY = y0 + pd;
  return dedupe([
    { x: 0, y: y0 }, // bottom point
    { x: x1 * 0.72, y: shoulderY },
    { x: x1, y: shoulderY + (y1 - shoulderY) * 0.42 },
    { x: x1, y: y1 - tc },
    { x: x1 - tc, y: y1 },
    { x: -(x1 - tc), y: y1 },
    { x: -x1, y: y1 - tc },
    { x: -x1, y: shoulderY + (y1 - shoulderY) * 0.42 },
    { x: -x1 * 0.72, y: shoulderY },
  ]);
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) out.pop();
  return out;
}

/** Uniform inward offset of a convex CCW polygon — each edge moves along its
 * inward normal and consecutive offset edges re-intersect, preserving corner
 * angles exactly (a real frame border, not a scaled copy). */
export function insetOutline(pts: Pt[], d: number): Pt[] {
  if (pts.length < 3 || d === 0) return pts.map((p) => ({ ...p }));
  const n = pts.length;
  const lines: { px: number; py: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // CCW polygon: interior is to the LEFT of each directed edge.
    const nx = -dy / len;
    const ny = dx / len;
    lines.push({ px: a.x + nx * d, py: a.y + ny * d, dx, dy });
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const cross = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(cross) < 1e-9) {
      out.push({ x: l2.px, y: l2.py });
      continue;
    }
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / cross;
    out.push({ x: l1.px + l1.dx * t, y: l1.py + l1.dy * t });
  }
  return out;
}

export function outlineBounds(pts: Pt[]): { minX: number; maxX: number; minY: number; maxY: number; w: number; h: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// Entrance choreography — Frame Assemble (base first, panel reveal, light
// sweep last), the library's default. Operators can re-time everything.
// ---------------------------------------------------------------------------

const anim = (
  presetId: ARAnimation["preset"],
  delay: number,
  duration: number,
  extra: Partial<ARAnimation> = {},
): ARAnimation => ({
  preset: presetId,
  duration,
  delay,
  easing: "power3.out",
  direction: "bottom",
  ...extra,
});

export const KIT_ANIM = {
  baseRise: (delay = 0) => anim("slide", delay, 0.7, { easing: "power4.out" }),
  rearFade: (delay = 0.18) => anim("fade", delay, 0.5, { fade: true }),
  sideWipe: (delay = 0.28, direction: ARAnimation["direction"] = "left") => anim("wipe", delay, 0.5, { easing: "expo.out", direction }),
  framePop: (delay = 0.4) => anim("scale", delay, 0.55, { scaleFrom: 0.85 }),
  surfaceFade: (delay = 0.55) => anim("fade", delay, 0.55, { fade: true }),
  stripSweep: (delay = 0.7, direction: ARAnimation["direction"] = "left") => anim("wipe", delay, 0.6, { easing: "expo.out", direction }),
  zonePop: (delay = 0.9) => anim("pop", delay, 0.5, { easing: "back.out(1.6)", scaleFrom: 0.72 }),
};

// ---------------------------------------------------------------------------
// Part builders
// ---------------------------------------------------------------------------

function prismPart(
  name: string,
  outline: Pt[],
  z: number,
  depth: number,
  material: MaterialProps,
  opts: { hole?: Pt[]; bevel?: number; animation?: ARAnimation; position?: Partial<Vec3> } = {},
): PrimitiveNode {
  const node = createPrimitiveNode("prism", {
    name,
    outline,
    holeOutline: opts.hole,
    bevel: opts.bevel,
    material,
    transform: {
      position: vec3(opts.position?.x ?? 0, opts.position?.y ?? 0, opts.position?.z ?? z),
      scale: vec3(1, 1, Math.max(depth, 0.004)),
    },
  });
  if (opts.animation) node.animation = opts.animation;
  return node;
}

function boxPart(name: string, position: Vec3, scale: Vec3, material: MaterialProps, animation?: ARAnimation, rotation?: Vec3): PrimitiveNode {
  const node = createPrimitiveNode("box", {
    name,
    material,
    transform: { position, scale, ...(rotation ? { rotation } : {}) },
  });
  if (animation) node.animation = animation;
  return node;
}

/** Classify an outline edge by its outward normal (CCW polygon). */
function edgeSide(a: Pt, b: Pt): "top" | "bottom" | "left" | "right" {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Outward normal of a CCW polygon = right of the edge direction.
  const nx = dy / len;
  const ny = -dx / len;
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? "right" : "left";
  return ny > 0 ? "top" : "bottom";
}

/** Emissive strip segments following the silhouette's actual edges on the
 * requested sides — real meshes hugging the frame, not a glow texture. */
export function buildLightStrips(
  outline: Pt[],
  sides: ("top" | "bottom" | "left" | "right")[],
  params: SportsPanelParams,
  panelCenterY: number,
  frontZ: number,
): GroupNode[] {
  const bySide = new Map<string, PrimitiveNode[]>();
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const side = edgeSide(a, b);
    if (!sides.includes(side)) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < params.stripWidth * 1.5) continue;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    // Sit the strip just outside the silhouette edge, along the outward normal.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const nx = dy / len;
    const ny = -dx / len;
    const off = params.stripWidth / 2 + 0.004;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const seg = boxPart(
      `${side} strip ${bySide.get(side)?.length ?? 0}`,
      vec3(midX + nx * off, panelCenterY + midY + ny * off, frontZ - params.frameDepth / 2),
      vec3(len + params.stripWidth * 0.6, params.stripWidth, params.stripDepth),
      KIT_MATERIALS.strip,
      undefined,
      vec3(0, 0, angleDeg),
    );
    const list = bySide.get(side) ?? [];
    list.push(seg);
    bySide.set(side, list);
  }
  const groups: GroupNode[] = [];
  const sweepDir: Record<string, ARAnimation["direction"]> = { top: "left", bottom: "right", left: "bottom", right: "top" };
  for (const side of ["top", "left", "right", "bottom"] as const) {
    const segs = bySide.get(side);
    if (!segs?.length) continue;
    const g = createGroupNode(segs, { name: `STRIP_${side.toUpperCase()}` });
    g.animation = KIT_ANIM.stripSweep(0.7 + groups.length * 0.06, sweepDir[side]);
    groups.push(g);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Content zones — every zone opens EMPTY (text "" / unfilled image slot):
// nothing renders on air until the operator types or maps data. Zone
// placement is computed from the content rect so geometry edits keep zones
// inside the surface.
// ---------------------------------------------------------------------------

export interface ZoneDef {
  /** Manifest id, e.g. "scoreHome". */
  id: string;
  node: string; // hierarchy node name, e.g. SCORE_HOME_ZONE
  type: "text" | "number" | "time" | "image";
  /** Normalised position inside the content rect (0..1, x right, y up). */
  u: number;
  v: number;
  /** Text size relative to content-rect height / slot size relative to rect. */
  size: number;
  updateAnim?: UpdateAnim;
  color?: string;
}

export const ZONE_LAYOUTS: Record<string, ZoneDef[]> = {
  // Wide scoreboard panels (01, 02, 03, 05, 06, 09).
  wide: [
    { id: "title", node: "TITLE_ZONE", type: "text", u: 0.5, v: 0.88, size: 0.11 },
    { id: "logoHome", node: "LOGO_HOME_ZONE", type: "image", u: 0.1, v: 0.56, size: 0.3 },
    { id: "teamHome", node: "TEAM_HOME_ZONE", type: "text", u: 0.28, v: 0.62, size: 0.12 },
    { id: "scoreHome", node: "SCORE_HOME_ZONE", type: "number", u: 0.42, v: 0.5, size: 0.26, updateAnim: "flash" },
    { id: "scoreAway", node: "SCORE_AWAY_ZONE", type: "number", u: 0.58, v: 0.5, size: 0.26, updateAnim: "flash" },
    { id: "teamAway", node: "TEAM_AWAY_ZONE", type: "text", u: 0.72, v: 0.62, size: 0.12 },
    { id: "logoAway", node: "LOGO_AWAY_ZONE", type: "image", u: 0.9, v: 0.56, size: 0.3 },
    { id: "clock", node: "CLOCK_ZONE", type: "time", u: 0.5, v: 0.72, size: 0.1 },
    { id: "status", node: "STATUS_ZONE", type: "text", u: 0.5, v: 0.3, size: 0.09, updateAnim: "fade" },
    { id: "stats", node: "STATS_ZONE", type: "text", u: 0.5, v: 0.18, size: 0.08, updateAnim: "pulse" },
    { id: "footer", node: "FOOTER_ZONE", type: "text", u: 0.5, v: 0.07, size: 0.07 },
    { id: "player", node: "PLAYER_ZONE", type: "text", u: 0.28, v: 0.3, size: 0.09 },
    { id: "photo", node: "PHOTO_ZONE", type: "image", u: 0.12, v: 0.24, size: 0.26 },
  ],
  // Portrait panels (04, 08) — player/photo-led.
  portrait: [
    { id: "title", node: "TITLE_ZONE", type: "text", u: 0.5, v: 0.93, size: 0.06 },
    { id: "photo", node: "PHOTO_ZONE", type: "image", u: 0.5, v: 0.62, size: 0.52 },
    { id: "player", node: "PLAYER_ZONE", type: "text", u: 0.5, v: 0.34, size: 0.06 },
    { id: "stats", node: "STATS_ZONE", type: "text", u: 0.5, v: 0.24, size: 0.045, updateAnim: "pulse" },
    { id: "logoHome", node: "LOGO_HOME_ZONE", type: "image", u: 0.16, v: 0.93, size: 0.12 },
    { id: "logoAway", node: "LOGO_AWAY_ZONE", type: "image", u: 0.84, v: 0.93, size: 0.12 },
    { id: "teamHome", node: "TEAM_HOME_ZONE", type: "text", u: 0.3, v: 0.15, size: 0.045 },
    { id: "teamAway", node: "TEAM_AWAY_ZONE", type: "text", u: 0.7, v: 0.15, size: 0.045 },
    { id: "scoreHome", node: "SCORE_HOME_ZONE", type: "number", u: 0.42, v: 0.15, size: 0.06, updateAnim: "flash" },
    { id: "scoreAway", node: "SCORE_AWAY_ZONE", type: "number", u: 0.58, v: 0.15, size: 0.06, updateAnim: "flash" },
    { id: "clock", node: "CLOCK_ZONE", type: "time", u: 0.5, v: 0.08, size: 0.04 },
    { id: "status", node: "STATUS_ZONE", type: "text", u: 0.5, v: 0.03, size: 0.035, updateAnim: "fade" },
    { id: "footer", node: "FOOTER_ZONE", type: "text", u: 0.5, v: 0.0, size: 0.03 },
  ],
  // Compact shield panels (07, 10) — crest/score-led.
  shield: [
    { id: "title", node: "TITLE_ZONE", type: "text", u: 0.5, v: 0.88, size: 0.08 },
    { id: "logoHome", node: "LOGO_HOME_ZONE", type: "image", u: 0.3, v: 0.66, size: 0.26 },
    { id: "logoAway", node: "LOGO_AWAY_ZONE", type: "image", u: 0.7, v: 0.66, size: 0.26 },
    { id: "scoreHome", node: "SCORE_HOME_ZONE", type: "number", u: 0.38, v: 0.42, size: 0.2, updateAnim: "flash" },
    { id: "scoreAway", node: "SCORE_AWAY_ZONE", type: "number", u: 0.62, v: 0.42, size: 0.2, updateAnim: "flash" },
    { id: "teamHome", node: "TEAM_HOME_ZONE", type: "text", u: 0.32, v: 0.55, size: 0.07 },
    { id: "teamAway", node: "TEAM_AWAY_ZONE", type: "text", u: 0.68, v: 0.55, size: 0.07 },
    { id: "clock", node: "CLOCK_ZONE", type: "time", u: 0.5, v: 0.3, size: 0.07 },
    { id: "status", node: "STATUS_ZONE", type: "text", u: 0.5, v: 0.2, size: 0.055, updateAnim: "fade" },
    { id: "stats", node: "STATS_ZONE", type: "text", u: 0.5, v: 0.55, size: 0.05, updateAnim: "pulse" },
    { id: "player", node: "PLAYER_ZONE", type: "text", u: 0.5, v: 0.12, size: 0.05 },
    { id: "photo", node: "PHOTO_ZONE", type: "image", u: 0.5, v: 0.42, size: 0.2 },
    { id: "footer", node: "FOOTER_ZONE", type: "text", u: 0.5, v: 0.05, size: 0.04 },
  ],
};

function zoneTextNode(def: ZoneDef, x: number, y: number, z: number, fontSize: number): Text3dNode {
  const node = createText3dNode({
    name: def.node,
    // EMPTY by default — the model must open with no words anywhere.
    text: "",
    fontSize,
    color: def.color ?? "#ffffff",
    transform: { position: vec3(x, y, z) },
    slotKind: "data",
    slotLabel: def.id,
    updateAnim: def.updateAnim,
  });
  node.animation = KIT_ANIM.zonePop(0.9);
  return node;
}

function zoneImageSlot(def: ZoneDef, x: number, y: number, z: number, size: number): PrimitiveNode {
  const node = createPrimitiveNode("plane", {
    name: def.node,
    transform: { position: vec3(x, y, z), scale: vec3(size, size, 1) },
    material: { color: "#2c2f33", metalness: 0, roughness: 1, opacity: 1 },
    slotKind: "branding",
    slotLabel: def.id,
  });
  node.animation = KIT_ANIM.zonePop(0.95);
  return node;
}

/** Build all CONTENT_ZONES for a layout, positioned inside the content rect.
 * `contentRect` is in panel-local coords (centered on the panel centre). */
export function buildContentZones(
  layout: ZoneDef[],
  contentRect: { cx: number; cy: number; w: number; h: number },
  frontZ: number,
): GroupNode {
  const { cx, cy, w, h } = contentRect;
  const z = frontZ + 0.012;
  const children: SetNode[] = layout.map((def) => {
    const x = cx + (def.u - 0.5) * w;
    const y = cy + (def.v - 0.5) * h;
    if (def.type === "image") return zoneImageSlot(def, x, y, z, def.size * Math.min(w, h));
    return zoneTextNode(def, x, y, z, def.size * h);
  });
  return createGroupNode(children, { name: "CONTENT_ZONES" });
}

// ---------------------------------------------------------------------------
// Base builders — the plinth/pedestal families the references show.
// ---------------------------------------------------------------------------

export interface BaseBuild {
  /** BASE_TOP / BASE_MIDDLE / BASE_BOTTOM (+ SUPPORTS) nodes. */
  nodes: SetNode[];
  /** Y where the panel's bottom edge should sit. */
  panelSeatY: number;
}

function cylPart(name: string, position: Vec3, rx: number, ry: number, rz: number, material: MaterialProps, animation?: ARAnimation): PrimitiveNode {
  // Unit cylinder: radius 0.5, height 1 → scale (2rx, height, 2rz).
  const node = createPrimitiveNode("cylinder", {
    name,
    material,
    transform: { position, scale: vec3(rx * 2, ry, rz * 2) },
  });
  if (animation) node.animation = animation;
  return node;
}

/** Layered oval plinth (references 01/02/03/06): three stacked ellipse
 * tiers, the middle one darker, plus an emissive base ring option. */
export function ovalPlinthBase(p: SportsPanelParams): BaseBuild {
  const h1 = p.baseHeight * 0.34;
  const h2 = p.baseHeight * 0.3;
  const h3 = p.baseHeight * 0.36;
  const nodes: SetNode[] = [
    cylPart("BASE_BOTTOM", vec3(0, h1 / 2, 0), p.baseWidth / 2, h1, p.baseDepth / 2, KIT_MATERIALS.base, KIT_ANIM.baseRise(0)),
    cylPart("BASE_MIDDLE", vec3(0, h1 + h2 / 2, 0), p.baseWidth / 2 - 0.05, h2, Math.max(p.baseDepth / 2 - 0.04, 0.05), { ...KIT_MATERIALS.base, color: "#1a1c1f" }, KIT_ANIM.baseRise(0.06)),
    cylPart("BASE_TOP", vec3(0, h1 + h2 + h3 / 2, 0), p.baseWidth / 2 - 0.02, h3, Math.max(p.baseDepth / 2 - 0.02, 0.06), KIT_MATERIALS.baseTrim, KIT_ANIM.baseRise(0.12)),
  ];
  return { nodes, panelSeatY: p.baseHeight };
}

/** Stepped rectangular plinth (reference 10): three beveled prism steps. */
export function steppedPlinthBase(p: SportsPanelParams): BaseBuild {
  const h = p.baseHeight / 3;
  const mk = (name: string, w: number, d: number, y: number, delay: number, material: MaterialProps) => {
    const outline = chamferRectOutline(w, d, { bl: 0.06, br: 0.06, tr: 0.06, tl: 0.06 });
    const node = prismPart(name, outline, 0, h, material, { bevel: 0.012, animation: KIT_ANIM.baseRise(delay) });
    // Extrusion runs along local Z — lay it flat so the step stacks in Y.
    node.transform = { position: vec3(0, y + h / 2, 0), rotation: vec3(-90, 0, 0), scale: vec3(1, 1, h) };
    return node;
  };
  const nodes: SetNode[] = [
    mk("BASE_BOTTOM", p.baseWidth, p.baseDepth, 0, 0, KIT_MATERIALS.base),
    mk("BASE_MIDDLE", p.baseWidth * 0.82, p.baseDepth * 0.82, h, 0.07, { ...KIT_MATERIALS.base, color: "#1a1c1f" }),
    mk("BASE_TOP", p.baseWidth * 0.64, p.baseDepth * 0.64, h * 2, 0.14, KIT_MATERIALS.baseTrim),
  ];
  return { nodes, panelSeatY: p.baseHeight };
}

/** Circular pedestal drum (reference 09): tall drum + dish + glow ring. */
export function drumPedestalBase(p: SportsPanelParams): BaseBuild {
  const r = Math.min(p.baseWidth, p.baseDepth) / 2;
  const dishH = p.baseHeight * 0.22;
  const drumH = p.baseHeight * 0.62;
  const capH = p.baseHeight * 0.16;
  const nodes: SetNode[] = [
    cylPart("BASE_BOTTOM", vec3(0, dishH / 2, 0), r, dishH, r, KIT_MATERIALS.base, KIT_ANIM.baseRise(0)),
    cylPart("BASE_MIDDLE", vec3(0, dishH + drumH / 2, 0), r * 0.66, drumH, r * 0.66, { ...KIT_MATERIALS.base, color: "#1a1c1f" }, KIT_ANIM.baseRise(0.06)),
    cylPart("BASE_TOP", vec3(0, dishH + drumH + capH / 2, 0), r * 0.78, capH, r * 0.78, KIT_MATERIALS.baseTrim, KIT_ANIM.baseRise(0.12)),
  ];
  return { nodes, panelSeatY: p.baseHeight };
}

/** Half-round wall shelf (references 04/08): panel sits on a bracket shelf
 * rather than a floor plinth. */
export function shelfBase(p: SportsPanelParams): BaseBuild {
  const h = p.baseHeight;
  const nodes: SetNode[] = [
    cylPart("BASE_TOP", vec3(0, h * 0.75, p.baseDepth * 0.18), p.baseWidth / 2, h * 0.5, p.baseDepth / 2, KIT_MATERIALS.baseTrim, KIT_ANIM.baseRise(0.1)),
    cylPart("BASE_MIDDLE", vec3(0, h * 0.35, p.baseDepth * 0.14), p.baseWidth / 2 - 0.04, h * 0.3, Math.max(p.baseDepth / 2 - 0.03, 0.04), { ...KIT_MATERIALS.base, color: "#1a1c1f" }, KIT_ANIM.baseRise(0.05)),
    cylPart("BASE_BOTTOM", vec3(0, h * 0.1, p.baseDepth * 0.1), p.baseWidth / 2 - 0.08, h * 0.2, Math.max(p.baseDepth / 2 - 0.06, 0.03), KIT_MATERIALS.base, KIT_ANIM.baseRise(0)),
  ];
  return { nodes, panelSeatY: h };
}

/** Emissive ring hugging the base footprint — STRIP_BASE. */
export function baseGlowStrip(p: SportsPanelParams, shape: "oval" | "rect" | "round"): PrimitiveNode {
  const y = 0.015;
  if (shape === "rect") {
    const outline = chamferRectOutline(p.baseWidth * 1.04, p.baseDepth * 1.04, { bl: 0.07, br: 0.07, tr: 0.07, tl: 0.07 });
    const hole = insetOutline(outline, p.stripWidth * 1.4);
    const node = prismPart("STRIP_BASE", outline, 0, 0.02, KIT_MATERIALS.strip, { hole });
    node.transform = { position: vec3(0, y, 0), rotation: vec3(-90, 0, 0), scale: vec3(1, 1, 0.02) };
    return node;
  }
  const rx = shape === "round" ? Math.min(p.baseWidth, p.baseDepth) / 2 : p.baseWidth / 2;
  const rz = shape === "round" ? Math.min(p.baseWidth, p.baseDepth) / 2 : p.baseDepth / 2;
  return cylPart("STRIP_BASE", vec3(0, y, 0), rx * 1.04, 0.02, rz * 1.04, KIT_MATERIALS.strip);
}
