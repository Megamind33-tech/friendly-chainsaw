import {
  createGroupNode,
  createPrimitiveNode,
  createText3dNode,
  createVideoFeedNode,
  vec3,
} from "@/document/factory";
import type { ARAnimation, SetNode, Vec3 } from "@/document/types";
import { markSetNodeAsAr } from "./nodeUtils";

/**
 * The AR Builder element library — a DaVinci/Photoshop-style palette of real
 * 2.5D broadcast elements (not flat 2D cards): every multi-part item layers
 * a backing panel, an emissive rim/accent, and text/media at staggered z
 * depths so it reads as dimensional AR rather than a co-planar sticker.
 * Same factory-only construction discipline as ar-engine/templates.ts, but
 * these items are generic chrome (no data bindings) meant to be dropped or
 * clicked into any AR layer via ArPalettePanel / ArStagePanel.
 */

// ---------------------------------------------------------------------------
// Entrance choreography — small, varied set mirroring templates.ts' presets
// so builder items land with the same broadcast-standard motion vocabulary.
// ---------------------------------------------------------------------------

function riseAnim(delay = 0, duration = 0.9): ARAnimation {
  return { preset: "slide", duration, delay, easing: "power4.out", direction: "bottom" };
}

function wipeAnim(delay: number, direction: ARAnimation["direction"] = "left", duration = 0.55): ARAnimation {
  return { preset: "wipe", duration, delay, easing: "expo.out", direction };
}

function popAnim(delay: number, duration = 0.5): ARAnimation {
  return { preset: "pop", duration, delay, easing: "back.out(1.6)", direction: "bottom", scaleFrom: 0.72 };
}

function settleAnim(delay: number, duration = 0.5): ARAnimation {
  return { preset: "scale", duration, delay, easing: "power3.out", direction: "bottom" };
}

function fadeAnim(delay: number, duration = 0.6): ARAnimation {
  return { preset: "fade", duration, delay, easing: "power2.out", direction: "bottom", fade: true };
}

// ---------------------------------------------------------------------------
// Shared palette — reused across items so the library reads as one system.
// ---------------------------------------------------------------------------

const PANEL_COLOR = "#182338";
const PANEL_DARK = "#141a2e";
const ACCENT = "#4a90d9";
const GOLD = "#ffd37a";
const KICKER_BLUE = "#9ed8ff";
const MUTED = "#8fa3bd";

/** Default spawn depth for standalone items — the "back wall" authoring
 * convention (see templates.ts); markSetNodeAsAr's centerArNode pulls it
 * onto the centered AR plane on insert, exactly like every AR_TEMPLATE. */
const DEFAULT_POS: Vec3 = vec3(0, 1.6, -3);

// ---------------------------------------------------------------------------
// Low-level node builders — the panel/boundText3d/imageSlot/colorBar style
// from templates.ts, minus data bindings (builder items are pure chrome).
// ---------------------------------------------------------------------------

/** A structural backing panel — boosted emissive + unlit render path so a
 * flat box reads as a lit broadcast card, not a shadowed slab. */
function panelBox(name: string, position: Vec3, scale: Vec3, color: string, animation: ARAnimation): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: { position, scale },
    material: { color, metalness: 0.08, roughness: 0.6, opacity: 0.94, emissive: color, emissiveIntensity: 0.5 },
  });
  node.animation = animation;
  return node;
}

/** A thin glowing accent/rim bar — the material-level detail that keeps a
 * flat panel from reading as a slab (edge rim, base bar, divider). */
function accentBar(name: string, position: Vec3, scale: Vec3, color: string, animation: ARAnimation): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: { position, scale },
    material: { color, metalness: 0.5, roughness: 0.3, opacity: 1, emissive: color, emissiveIntensity: 1.1 },
  });
  node.animation = animation;
  return node;
}

function textNode(name: string, text: string, fontSize: number, color: string, position: Vec3, animation: ARAnimation): SetNode {
  const node = createText3dNode({ name, text, fontSize, color, transform: { position } });
  node.animation = animation;
  return node;
}

/** An empty image-slot plane — operator assigns a real texture via the
 * Inspector, same convention as templates.ts' imageSlot. Never bound. */
function imageSlotPlane(name: string, position: Vec3, scale: Vec3, animation: ARAnimation): SetNode {
  const node = createPrimitiveNode("plane", {
    name,
    transform: { position, scale },
    material: { color: "#2a3548", metalness: 0, roughness: 1, opacity: 1 },
  });
  node.animation = animation;
  return node;
}

/** A dark backing frame sat a hair behind an image slot, larger on every
 * side — the physical-mount illusion so an assigned photo reads as mounted
 * print rather than a floating sticker. */
function backingFrame(name: string, slotPosition: Vec3, slotScale: Vec3, animation: ARAnimation, grow = 1.18): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: {
      position: vec3(slotPosition.x, slotPosition.y, slotPosition.z - 0.03),
      scale: vec3(slotScale.x * grow, slotScale.y * grow, 0.03),
    },
    material: { color: "#1a2838", metalness: 0.15, roughness: 0.5, opacity: 0.97, emissive: "#1a2838", emissiveIntensity: 0.4 },
  });
  node.animation = animation;
  return node;
}

export interface BuilderItem {
  id: string;
  label: string;
  category: "cards" | "text" | "shapes" | "media";
  description: string;
  build: () => SetNode;
}

export const BUILDER_ITEMS: BuilderItem[] = [
  // --- CARDS ---------------------------------------------------------------
  {
    id: "headline-card",
    label: "Headline Card",
    category: "cards",
    description: "Backing panel + emissive top rim + headline text, layered at staggered z depths.",
    build: () =>
      markSetNodeAsAr(
        createGroupNode(
          [
            panelBox("Headline panel", vec3(0, 0, 0), vec3(1.9, 0.5, 0.05), PANEL_COLOR, riseAnim(0, 0.85)),
            accentBar("Headline rim", vec3(0, 0.24, 0.02), vec3(1.78, 0.025, 0.02), ACCENT, wipeAnim(0.15, "left", 0.5)),
            textNode("Headline text", "HEADLINE", 0.22, "#ffffff", vec3(-0.8, 0, 0.05), popAnim(0.35)),
          ],
          { name: "Headline Card", transform: { position: DEFAULT_POS } },
        ),
      ),
  },
  {
    id: "info-card",
    label: "Info Card",
    category: "cards",
    description: "Panel with a title line and a smaller supporting subtitle.",
    build: () =>
      markSetNodeAsAr(
        createGroupNode(
          [
            panelBox("Info panel", vec3(0, 0, 0), vec3(1.7, 0.62, 0.05), PANEL_COLOR, riseAnim(0, 0.8)),
            textNode("Info title", "INFO TITLE", 0.16, "#ffffff", vec3(-0.72, 0.12, 0.05), popAnim(0.3)),
            textNode("Info subtitle", "Supporting detail line", 0.1, KICKER_BLUE, vec3(-0.72, -0.1, 0.05), popAnim(0.42)),
          ],
          { name: "Info Card", transform: { position: DEFAULT_POS } },
        ),
      ),
  },
  {
    id: "stat-chip",
    label: "Stat Chip",
    category: "cards",
    description: "Small chip with a big hero value and a caption label.",
    build: () =>
      markSetNodeAsAr(
        createGroupNode(
          [
            panelBox("Stat chip panel", vec3(0, 0, 0), vec3(0.62, 0.42, 0.05), "#1c2b46", settleAnim(0, 0.5)),
            textNode("Stat value", "42", 0.3, GOLD, vec3(0, 0.06, 0.05), popAnim(0.22)),
            textNode("Stat label", "STAT LABEL", 0.08, MUTED, vec3(0, -0.15, 0.05), popAnim(0.32)),
          ],
          { name: "Stat Chip", transform: { position: DEFAULT_POS } },
        ),
      ),
  },

  // --- MEDIA -----------------------------------------------------------------
  {
    id: "image-card",
    label: "Image Card",
    category: "media",
    description: "Mounted photo: dark backing frame behind an image slot, plus a base accent bar.",
    build: () => {
      const slotScale = vec3(0.9, 0.9, 1);
      return markSetNodeAsAr(
        createGroupNode(
          [
            backingFrame("Image backing frame", vec3(0, 0, 0), slotScale, settleAnim(0.05, 0.5)),
            imageSlotPlane("Image slot", vec3(0, 0, 0), slotScale, settleAnim(0.2, 0.5)),
            accentBar("Image base bar", vec3(0, -0.48, 0.02), vec3(0.9, 0.03, 0.02), ACCENT, wipeAnim(0.35, "left", 0.45)),
          ],
          { name: "Image Card", transform: { position: DEFAULT_POS } },
        ),
      );
    },
  },
  {
    id: "video-card",
    label: "Video Card",
    category: "media",
    description: "A live/URL video feed sized for a broadcast AR screen.",
    build: () => {
      const node = createVideoFeedNode({
        label: "AR VIDEO",
        width: 1.6,
        height: 0.9,
        transform: { position: DEFAULT_POS },
      });
      node.animation = riseAnim(0, 0.9);
      return markSetNodeAsAr(node);
    },
  },

  // --- TEXT ------------------------------------------------------------------
  {
    id: "hero-title",
    label: "Hero Title",
    category: "text",
    description: "Big standalone headline text (fontSize 0.4).",
    build: () => markSetNodeAsAr(textNode("Hero Title", "HERO TITLE", 0.4, "#ffffff", DEFAULT_POS, popAnim(0, 0.6))),
  },
  {
    id: "subtitle",
    label: "Subtitle",
    category: "text",
    description: "Smaller supporting line beneath a headline.",
    build: () => markSetNodeAsAr(textNode("Subtitle", "Subtitle line", 0.16, "#d7e2ee", DEFAULT_POS, fadeAnim(0, 0.6))),
  },
  {
    id: "kicker",
    label: "Kicker",
    category: "text",
    description: "Tiny letter-spaced eyebrow label, sits above a headline.",
    build: () => markSetNodeAsAr(textNode("Kicker", "K I C K E R", 0.09, KICKER_BLUE, DEFAULT_POS, settleAnim(0, 0.4))),
  },
  {
    id: "big-number",
    label: "Big Number",
    category: "text",
    description: "Large gold hero number for stats/scores (fontSize 0.6).",
    build: () => markSetNodeAsAr(textNode("Big Number", "42", 0.6, GOLD, DEFAULT_POS, popAnim(0, 0.65))),
  },

  // --- SHAPES ------------------------------------------------------------------
  {
    id: "panel",
    label: "Panel",
    category: "shapes",
    description: "A glass-dark backing panel — the base building block for custom cards.",
    build: () =>
      markSetNodeAsAr(panelBox("Panel", DEFAULT_POS, vec3(1.5, 1, 0.05), PANEL_DARK, riseAnim(0, 0.9))),
  },
  {
    id: "accent-bar",
    label: "Accent Bar",
    category: "shapes",
    description: "A thin glowing accent bar — a divider, rim, or live indicator.",
    build: () =>
      markSetNodeAsAr(accentBar("Accent Bar", DEFAULT_POS, vec3(1.2, 0.04, 0.02), ACCENT, wipeAnim(0, "left", 0.5))),
  },
  {
    id: "pedestal",
    label: "Pedestal",
    category: "shapes",
    description: "A low platform to stand other elements on — sits near the floor, not floating.",
    build: () => {
      const node = createPrimitiveNode("box", {
        name: "Pedestal",
        transform: { position: vec3(0, 0.05, -3), scale: vec3(0.6, 0.1, 0.6) },
        material: { color: "#20304a", metalness: 0.3, roughness: 0.5, emissive: "#20304a", emissiveIntensity: 0.2 },
      });
      node.animation = settleAnim(0, 0.5);
      return markSetNodeAsAr(node);
    },
  },
  {
    id: "ring",
    label: "Ring / Disc",
    category: "shapes",
    description: "A flat glowing disc (thin cylinder) — a floor marker, ring accent, or dais.",
    build: () => {
      const node = createPrimitiveNode("cylinder", {
        name: "Ring",
        transform: { position: DEFAULT_POS, scale: vec3(0.6, 0.02, 0.6) },
        material: { color: ACCENT, metalness: 0.4, roughness: 0.35, emissive: ACCENT, emissiveIntensity: 1.0 },
      });
      node.animation = settleAnim(0, 0.5);
      return markSetNodeAsAr(node);
    },
  },
  {
    id: "backdrop",
    label: "Backdrop",
    category: "shapes",
    description: "A large full backdrop plate to build a board on top of.",
    build: () =>
      markSetNodeAsAr(panelBox("Backdrop", DEFAULT_POS, vec3(3, 1.8, 0.06), PANEL_DARK, riseAnim(0, 1.0))),
  },

  {
    id: "talent-keyed",
    label: "Talent (Keyed)",
    category: "media",
    description:
      "A person-sized keyed camera surface: green screen removal pre-enabled with spill suppression — assign your camera in the Inspector's Source and the presenter stands in the studio.",
    build: () => {
      const node = createVideoFeedNode({
        label: "TALENT",
        width: 1.1,
        height: 1.95,
        // Standing on the floor: plane center at half its height.
        transform: { position: vec3(0, 0.98, -2.4) },
        chromaKey: { enabled: true, color: "#00b140", similarity: 0.32, smoothness: 0.08, spill: 0.6 },
      });
      node.animation = fadeAnim(0, 0.5);
      return markSetNodeAsAr(node);
    },
  },

  // -------------------------------------------------------------------------
  // Chart-building geometry — colorable primitives + a pre-grouped bar chart
  // so a whole chart (bars, values, logo slot) moves/animates as ONE object.
  // Recolor any part via the Inspector; scale a bar's Y to set its value.
  // -------------------------------------------------------------------------
  {
    id: "chart-bar",
    label: "Chart Bar",
    category: "shapes",
    description: "A single colorable 3D bar column — scale Y to set its value; recolor per party/team.",
    build: () => {
      const node = createPrimitiveNode("box", {
        name: "Chart Bar",
        transform: { position: vec3(0, 1.2, -3), scale: vec3(0.28, 0.9, 0.28) },
        material: { color: ACCENT, metalness: 0.2, roughness: 0.35, emissive: ACCENT, emissiveIntensity: 0.55 },
      });
      node.animation = { preset: "bar-grow", duration: 0.9, delay: 0, easing: "power3.out", direction: "bottom" };
      return markSetNodeAsAr(node);
    },
  },
  {
    id: "glass-panel",
    label: "Glass Panel",
    category: "shapes",
    description: "A translucent glass plate — put numbers and logos on it for the frosted broadcast look.",
    build: () => {
      const node = createPrimitiveNode("box", {
        name: "Glass Panel",
        transform: { position: DEFAULT_POS, scale: vec3(1.6, 1.0, 0.04) },
        material: { color: "#a8c4e8", metalness: 0.9, roughness: 0.12, opacity: 0.28 },
      });
      node.animation = fadeAnim(0, 0.7);
      return markSetNodeAsAr(node);
    },
  },
  {
    id: "sphere",
    label: "Sphere",
    category: "shapes",
    description: "A colorable 3D sphere — data points, globes, bullet markers.",
    build: () => {
      const node = createPrimitiveNode("sphere", {
        name: "Sphere",
        transform: { position: vec3(0, 1.6, -3), scale: vec3(0.3, 0.3, 0.3) },
        material: { color: GOLD, metalness: 0.35, roughness: 0.3, emissive: GOLD, emissiveIntensity: 0.4 },
      });
      node.animation = popAnim(0);
      return markSetNodeAsAr(node);
    },
  },
  {
    id: "column",
    label: "Column",
    category: "shapes",
    description: "A colorable cylinder column — podiums, pie segments, towers.",
    build: () => {
      const node = createPrimitiveNode("cylinder", {
        name: "Column",
        transform: { position: vec3(0, 1.1, -3), scale: vec3(0.24, 0.8, 0.24) },
        material: { color: ACCENT, metalness: 0.25, roughness: 0.4, emissive: ACCENT, emissiveIntensity: 0.45 },
      });
      node.animation = { preset: "bar-grow", duration: 0.8, delay: 0, easing: "power3.out", direction: "bottom" };
      return markSetNodeAsAr(node);
    },
  },
  {
    id: "bar-chart-group",
    label: "Bar Chart (Group)",
    category: "shapes",
    description: "A pre-grouped 3-bar chart: baseline, colored bars, value texts, logo slot — moves as ONE. Ungroup-free editing: double-click a bar to recolor/rescale it.",
    build: () => {
      const mkBar = (name: string, x: number, h: number, color: string, delay: number): SetNode => {
        const bar = createPrimitiveNode("box", {
          name,
          transform: { position: vec3(x, h / 2, 0), scale: vec3(0.26, h, 0.26) },
          material: { color, metalness: 0.2, roughness: 0.35, emissive: color, emissiveIntensity: 0.55 },
        });
        bar.animation = { preset: "bar-grow", duration: 0.9, delay, easing: "power3.out", direction: "bottom" };
        return bar;
      };
      const mkValue = (name: string, x: number, y: number, text: string, delay: number): SetNode => {
        const t = createText3dNode({ name, text, fontSize: 0.14, color: "#ffffff", transform: { position: vec3(x - 0.12, y + 0.14, 0.02) } });
        t.animation = popAnim(delay);
        return t;
      };
      const base = panelBox("Chart baseline", vec3(0, -0.02, 0), vec3(1.7, 0.05, 0.4), PANEL_COLOR, riseAnim(0, 0.8));
      const logo = createPrimitiveNode("plane", {
        name: "Chart logo slot",
        transform: { position: vec3(-0.72, 1.18, 0.02), scale: vec3(0.3, 0.3, 1) },
        material: { color: "#1c2230", metalness: 0.1, roughness: 0.8, opacity: 0.92 },
      });
      logo.animation = settleAnim(0.55, 0.5);
      const group = createGroupNode(
        [
          base,
          mkBar("Bar 1", -0.5, 0.9, ACCENT, 0.15),
          mkBar("Bar 2", 0, 1.25, GOLD, 0.3),
          mkBar("Bar 3", 0.5, 0.6, "#d43a3a", 0.45),
          mkValue("Value 1", -0.5, 0.9, "45", 0.65),
          mkValue("Value 2", 0, 1.25, "62", 0.75),
          mkValue("Value 3", 0.5, 0.6, "30", 0.85),
          logo,
        ],
        { name: "Bar Chart", transform: { position: vec3(0, 0.6, -3) } },
      );
      return markSetNodeAsAr(group);
    },
  },
];

/**
 * The "2.5D depth stack" — turns a flat, co-planar selection into a layered
 * dimensional AR cluster by staggering each node's z position 0.06 world
 * units apart in index order (mutates each node's `transform` in place, same
 * contract as the selection arrays SceneGraphRow/duplicateAllObjects pass
 * around). Later index = further back, so the stack reads front-to-back in
 * the order the nodes were selected/listed.
 */
export function applyDepthIllusion(nodes: SetNode[]): void {
  nodes.forEach((node, i) => {
    node.transform = {
      ...node.transform,
      position: { ...node.transform.position, z: node.transform.position.z - i * 0.06 },
    };
  });
}
