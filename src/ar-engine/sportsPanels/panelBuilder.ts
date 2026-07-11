import { createGroupNode, createPrimitiveNode, vec3 } from "@/document/factory";
import type { GroupNode, PrimitiveNode, SetNode } from "@/document/types";
import {
  KIT_ANIM,
  KIT_MATERIALS,
  ZONE_LAYOUTS,
  buildContentZones,
  buildLightStrips,
  baseGlowStrip,
  clampParams,
  insetOutline,
  outlineBounds,
  type BaseBuild,
  type Pt,
  type SportsPanelParams,
} from "./panelKit";

/**
 * Assembles one Sports AR Panel from its spec — the COMMON SCENE HIERARCHY
 * every model in the library shares:
 *
 *   AR_SPORTS_PANEL_XX
 *   ├── STRUCTURE            (base plinth + PANEL_ASSEMBLY with frames/surface)
 *   ├── LIGHT_STRIPS         (STRIP_TOP/LEFT/RIGHT/BOTTOM/BASE)
 *   ├── CONTENT_ZONES        (13 empty, bindable zones)
 *   ├── OPTIONAL_SPORT_PROPS (empty — props are opt-in modules, never baked)
 *   ├── ANIMATION_RIG        (reserved for operator-authored motion nodes)
 *   ├── COLLISION_BOUNDS     (invisible pick/placement volume)
 *   └── EDITOR_GUIDES        (invisible floor ring, editor-only)
 *
 * The panel-plane parts live inside STRUCTURE/PANEL_ASSEMBLY so a tilted
 * reference silhouette (02/05/09) tilts as one rigid assembly around its
 * seat on the base while the plinth stays flat on the floor — matching how
 * the physical object in each reference would actually stand.
 */

export interface SportsPanelSpec {
  id: string;
  name: string;
  version: string;
  description: string;
  layout: keyof typeof ZONE_LAYOUTS;
  defaults: SportsPanelParams;
  /** Outer silhouette in panel-plane coords, centered on (0,0). */
  outline: (p: SportsPanelParams) => Pt[];
  /** Base family builder (oval plinth / stepped / drum / shelf). */
  base: (p: SportsPanelParams) => BaseBuild;
  baseGlow?: "oval" | "rect" | "round" | "none";
  /** Which silhouette sides carry emissive strips. */
  strips: ("top" | "bottom" | "left" | "right")[];
  /** Extra structural flourishes (fins, tags, orbit rings) — attached to the
   * tilted panel assembly under SUPPORTS. */
  supports?: (p: SportsPanelParams, ctx: { panelCenterY: number; frontZ: number }) => SetNode[];
  /** Yaw the whole panel assembly (deg) — reference 05's angled stance. */
  yaw?: number;
}

/** Gap between the base seat and the panel's bottom edge. */
const SEAT_GAP = 0.015;

function seatTransform(seatY: number, p: SportsPanelParams, yaw = 0) {
  return { position: vec3(0, seatY, 0), rotation: vec3(-p.tilt, yaw, 0) };
}

export function buildSportsPanelNodes(spec: SportsPanelSpec, paramsIn?: Partial<SportsPanelParams>): GroupNode {
  const p = clampParams({ ...spec.defaults, ...paramsIn });
  const outline = spec.outline(p);
  const frameBevel = Math.min(p.frameDepth, p.frameThickness) * 0.3;

  const base = spec.base(p);
  const seatY = base.panelSeatY + SEAT_GAP;
  const bounds = outlineBounds(outline);
  // Panel-plane parts are authored relative to the SEAT (y=0 at the seat):
  // the outline is centered, so lift it by half its height above the seat.
  const panelCenterY = -bounds.minY;

  const frontZ = p.depth / 2;
  const holeFront = insetOutline(outline, p.frameThickness);
  const innerOuter = insetOutline(outline, p.frameThickness * 0.92);
  const innerHole = insetOutline(outline, p.frameThickness * 1.35);
  const contentOutline = insetOutline(outline, p.frameThickness + p.contentInset);

  const prism = (
    name: string,
    o: Pt[],
    z: number,
    depth: number,
    material: PrimitiveNode["material"],
    opts: { hole?: Pt[]; bevel?: number; animation?: PrimitiveNode["animation"] } = {},
  ): PrimitiveNode => {
    const node = createPrimitiveNode("prism", {
      name,
      outline: o,
      holeOutline: opts.hole,
      bevel: opts.bevel,
      material,
      transform: { position: vec3(0, panelCenterY, z), scale: vec3(1, 1, Math.max(depth, 0.004)) },
    });
    if (opts.animation) node.animation = opts.animation;
    return node;
  };

  // --- Frames + surface (all real geometry, all separately colourable) ----
  const outerFrameFront = prism("OUTER_FRAME_FRONT", outline, frontZ - p.frameDepth / 2, p.frameDepth, KIT_MATERIALS.framePrimary, {
    hole: holeFront,
    bevel: frameBevel,
    animation: KIT_ANIM.framePop(0.4),
  });
  const outerFrameRear = prism("OUTER_FRAME_REAR", outline, -frontZ + p.frameDepth / 2, p.frameDepth, KIT_MATERIALS.frameRear, {
    hole: insetOutline(outline, p.frameThickness * 1.4),
    bevel: frameBevel * 0.7,
    animation: KIT_ANIM.rearFade(0.18),
  });
  const innerFrame = prism("INNER_FRAME", innerOuter, frontZ + 0.004, 0.018, KIT_MATERIALS.frameSecondary, {
    hole: innerHole,
    animation: KIT_ANIM.framePop(0.5),
  });
  const contentSurface = prism("CONTENT_SURFACE", contentOutline, frontZ - p.frameDepth - 0.012, 0.02, KIT_MATERIALS.surface, {
    animation: KIT_ANIM.surfaceFade(0.55),
  });
  contentSurface.slotKind = "media";
  contentSurface.slotLabel = "Content Surface";

  // --- Depth shell: boxes along each silhouette edge, grouped by side ----
  const depthGroups = buildDepthShell(outline, p, panelCenterY);

  // --- Base (untilted, flat on the floor) --------------------------------
  const baseNodes = base.nodes;

  // --- Supports / flourishes ----------------------------------------------
  const supports = createGroupNode(spec.supports?.(p, { panelCenterY, frontZ }) ?? [], { name: "SUPPORTS" });

  const panelAssembly = createGroupNode(
    [contentSurface, innerFrame, outerFrameFront, outerFrameRear, ...depthGroups, supports],
    { name: "PANEL_ASSEMBLY", transform: seatTransform(seatY, p, spec.yaw) },
  );

  const structure = createGroupNode([panelAssembly, ...baseNodes], { name: "STRUCTURE" });

  // --- Light strips --------------------------------------------------------
  const stripGroups = buildLightStrips(outline, spec.strips, p, panelCenterY, frontZ);
  for (const g of stripGroups) g.transform = { ...g.transform, ...seatTransform(seatY, p, spec.yaw) };
  const stripChildren: SetNode[] = [...stripGroups];
  if (spec.baseGlow && spec.baseGlow !== "none") stripChildren.push(baseGlowStrip(p, spec.baseGlow));
  const lightStrips = createGroupNode(stripChildren, { name: "LIGHT_STRIPS" });

  // --- Content zones (empty by default) -----------------------------------
  const cb = outlineBounds(insetOutline(outline, p.frameThickness + p.contentInset + 0.02));
  const contentZones = buildContentZones(
    ZONE_LAYOUTS[spec.layout],
    { cx: (cb.minX + cb.maxX) / 2, cy: panelCenterY + (cb.minY + cb.maxY) / 2, w: cb.w, h: cb.h },
    frontZ,
  );
  contentZones.transform = { ...contentZones.transform, ...seatTransform(seatY, p, spec.yaw) };

  // --- Utility nodes -------------------------------------------------------
  const totalH = seatY + bounds.h + 0.05;
  const collision = createPrimitiveNode("box", {
    name: "COLLISION_BOUNDS",
    visible: false,
    transform: {
      position: vec3(0, totalH / 2, 0),
      scale: vec3(Math.max(bounds.w, p.baseWidth), totalH, Math.max(p.depth * 2, p.baseDepth)),
    },
    material: { color: "#00ff88", metalness: 0, roughness: 1, opacity: 0.15 },
  });
  const floorRing = createPrimitiveNode("cylinder", {
    name: "Floor marker",
    transform: { position: vec3(0, 0.005, 0), scale: vec3(Math.max(bounds.w, p.baseWidth) * 1.15, 0.005, Math.max(p.baseDepth, p.depth) * 2.4) },
    material: { color: "#4a90d9", metalness: 0, roughness: 1, opacity: 0.35, emissive: "#4a90d9", emissiveIntensity: 0.6 },
  });
  const guides = createGroupNode([floorRing], { name: "EDITOR_GUIDES", visible: false });
  const props = createGroupNode([], { name: "OPTIONAL_SPORT_PROPS" });
  const rig = createGroupNode([], { name: "ANIMATION_RIG" });

  return createGroupNode([structure, lightStrips, contentZones, props, rig, collision, guides], {
    name: spec.name,
    arModel: { modelId: spec.id, version: spec.version, params: p as unknown as Record<string, number> },
  });
}

/** Depth shell — SIDE_DEPTH_LEFT / SIDE_DEPTH_RIGHT / TOP_TRIM / BOTTOM_TRIM
 * as real boxes spanning the panel's thickness along every silhouette edge,
 * so the panel reads as a solid object from any camera angle. */
function buildDepthShell(outline: Pt[], p: SportsPanelParams, panelCenterY: number): GroupNode[] {
  const inset = p.frameThickness * 0.5;
  const shellDepth = Math.max(p.depth - p.frameDepth * 0.6, 0.02);
  const groups: Record<"left" | "right" | "top" | "bottom", PrimitiveNode[]> = { left: [], right: [], top: [], bottom: [] };
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.02) continue;
    const nx = dy / len;
    const ny = -dx / len; // outward normal (CCW polygon)
    const side: "left" | "right" | "top" | "bottom" =
      Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? "right" : "left") : ny > 0 ? "top" : "bottom";
    const midX = (a.x + b.x) / 2 - nx * inset;
    const midY = (a.y + b.y) / 2 - ny * inset;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const seg = createPrimitiveNode("box", {
      name: `${side} depth ${groups[side].length}`,
      material: KIT_MATERIALS.sideDepth,
      transform: {
        position: vec3(midX, panelCenterY + midY, 0),
        rotation: vec3(0, 0, angleDeg),
        scale: vec3(len * 1.01, p.frameThickness, shellDepth),
      },
    });
    groups[side].push(seg);
  }
  const named: [string, PrimitiveNode[], Parameters<typeof KIT_ANIM.sideWipe>[1]][] = [
    ["SIDE_DEPTH_LEFT", groups.left, "bottom"],
    ["SIDE_DEPTH_RIGHT", groups.right, "top"],
    ["TOP_TRIM", groups.top, "left"],
    ["BOTTOM_TRIM", groups.bottom, "right"],
  ];
  return named.map(([name, segs, dir], i) => {
    const g = createGroupNode(segs, { name });
    g.animation = KIT_ANIM.sideWipe(0.26 + i * 0.05, dir);
    return g;
  });
}

/**
 * Rebuild a placed model with new geometry params while PRESERVING operator
 * content: root id/transform, and every content zone's text, bindings,
 * visibility rule, update animation, fill and material. This is what the
 * Geometry panel's sliders and "Reset Geometry to Reference" call — data
 * updates never rebuild the model; only geometry edits do.
 */
export function rebuildSportsPanelNodes(
  spec: SportsPanelSpec,
  existing: GroupNode,
  params: Partial<SportsPanelParams>,
): GroupNode {
  const fresh = buildSportsPanelNodes(spec, params);
  fresh.id = existing.id;
  fresh.name = existing.name;
  fresh.transform = existing.transform;
  fresh.role = existing.role;
  if (existing.animation) fresh.animation = existing.animation;

  const oldZones = findChildGroup(existing, "CONTENT_ZONES");
  const newZones = findChildGroup(fresh, "CONTENT_ZONES");
  if (oldZones && newZones) {
    const oldByName = new Map(oldZones.children.map((c) => [c.name, c]));
    newZones.children = newZones.children.map((zone) => {
      const prev = oldByName.get(zone.name);
      if (!prev) return zone;
      const merged: SetNode = {
        ...zone,
        id: prev.id,
        visible: prev.visible,
        bindings: prev.bindings,
        visibilityRule: prev.visibilityRule,
        updateAnim: prev.updateAnim ?? zone.updateAnim,
      };
      if (merged.kind === "text3d" && prev.kind === "text3d") {
        merged.text = prev.text;
        merged.color = prev.color;
      }
      if (merged.kind === "primitive" && prev.kind === "primitive") {
        merged.textureAssetId = prev.textureAssetId;
        merged.material = prev.material;
        merged.display = prev.display;
      }
      return merged;
    });
  }
  // Operator-added prop modules and animation-rig nodes survive a rebuild.
  for (const groupName of ["OPTIONAL_SPORT_PROPS", "ANIMATION_RIG"]) {
    const oldGroup = findChildGroup(existing, groupName);
    const newGroup = findChildGroup(fresh, groupName);
    if (oldGroup && newGroup) newGroup.children = oldGroup.children;
  }
  return fresh;
}

export function findChildGroup(root: GroupNode, name: string): GroupNode | undefined {
  const hit = root.children.find((c) => c.kind === "group" && c.name === name);
  return hit?.kind === "group" ? hit : undefined;
}

/** Locates the model root (the group carrying arModel) for a selection. */
export function findModelRoot(nodes: SetNode[], selectedId: string | null): GroupNode | undefined {
  if (!selectedId) return undefined;
  const walk = (list: SetNode[], ancestors: GroupNode[]): GroupNode | undefined => {
    for (const node of list) {
      const chain = node.kind === "group" ? [...ancestors, node] : ancestors;
      if (node.id === selectedId) {
        for (let i = chain.length - 1; i >= 0; i--) if (chain[i].arModel) return chain[i];
        return undefined;
      }
      if (node.kind === "group") {
        const hit = walk(node.children, chain);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(nodes, []);
}

/** All model roots in a node list (for the Data Mapping panel's picker). */
export function findAllModelRoots(nodes: SetNode[]): GroupNode[] {
  const out: GroupNode[] = [];
  const walk = (list: SetNode[]) => {
    for (const node of list) {
      if (node.kind === "group") {
        if (node.arModel) out.push(node);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}
