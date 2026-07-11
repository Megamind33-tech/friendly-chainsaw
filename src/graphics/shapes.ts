import { createRectElement, createTextElement, createGroupElement } from "@/document/factory";
import type { Element } from "@/document/types";

/**
 * Built-in customizable shape/preset arsenal (2D). Every preset is composed
 * from the same native rect/text/group primitives the rest of the editor
 * uses, so once inserted it's fully editable — colors, gradients, skew,
 * corners, text, everything. No external/binary assets, no licensing
 * concerns; the operator drops one in and customizes it in place. Multi-part
 * presets (badges, lower-thirds) come pre-grouped so they move as one unit.
 *
 * `build(cx, cy)` returns a single Element centered on (cx, cy) in project
 * coordinates. Group children are authored relative to the group origin (the
 * Konva coordinate-container convention renderNodes relies on).
 */

export interface ShapePreset {
  id: string;
  label: string;
  category: "Basic" | "Broadcast" | "Accents";
  build: (cx: number, cy: number) => Element;
}

const NAVY = "#0a1230";
const BLUE = "#2a4ad0";
const GOLD = "#d9a441";
const WHITE = "#ffffff";
const RED = "#c92a3e";

function rect(x: number, y: number, w: number, h: number, over: Parameters<typeof createRectElement>[0] = {}) {
  return createRectElement({ transform: { x, y, width: w, height: h, rotation: 0 }, ...over });
}
function text(name: string, x: number, y: number, w: number, h: number, body: string, over: Parameters<typeof createTextElement>[0] = {}) {
  return createTextElement({ name, text: body, transform: { x, y, width: w, height: h, rotation: 0 }, align: "center", ...over });
}

export const SHAPE_PRESETS: ShapePreset[] = [
  // --- Basic ---------------------------------------------------------------
  {
    id: "panel",
    label: "Panel",
    category: "Basic",
    build: (cx, cy) => rect(cx - 200, cy - 90, 400, 180, { name: "Panel", fill: NAVY }),
  },
  {
    id: "rounded",
    label: "Rounded",
    category: "Basic",
    build: (cx, cy) => rect(cx - 200, cy - 80, 400, 160, { name: "Rounded Panel", fill: NAVY, cornerRadius: 20 }),
  },
  {
    id: "pill",
    label: "Pill",
    category: "Basic",
    build: (cx, cy) => rect(cx - 160, cy - 36, 320, 72, { name: "Pill", fill: BLUE, cornerRadius: 36 }),
  },
  {
    id: "circle",
    label: "Circle",
    category: "Basic",
    build: (cx, cy) => rect(cx - 90, cy - 90, 180, 180, { name: "Circle", fill: BLUE, cornerRadius: 90 }),
  },
  {
    id: "outline",
    label: "Outline",
    category: "Basic",
    build: (cx, cy) => rect(cx - 200, cy - 80, 400, 160, { name: "Outline Box", fill: "rgba(0,0,0,0)", stroke: WHITE, strokeWidth: 3, cornerRadius: 8 }),
  },
  {
    id: "divider",
    label: "Divider",
    category: "Basic",
    build: (cx, cy) => rect(cx - 240, cy - 3, 480, 6, { name: "Divider", fill: GOLD }),
  },
  // --- Broadcast -----------------------------------------------------------
  {
    id: "gloss-bar",
    label: "Gloss Bar",
    category: "Broadcast",
    build: (cx, cy) =>
      rect(cx - 260, cy - 45, 520, 90, {
        name: "Gloss Bar",
        fill: NAVY,
        gradient: { from: "#0a1240", mid: "#2b3fd6", to: "#050b26", direction: "diagonal" },
        skewX: -18,
        shadow: { color: "#000000", blur: 14, offsetX: 0, offsetY: 6, opacity: 0.45 },
      }),
  },
  {
    id: "gradient-panel",
    label: "Gradient",
    category: "Broadcast",
    build: (cx, cy) =>
      rect(cx - 240, cy - 130, 480, 260, {
        name: "Gradient Panel",
        fill: NAVY,
        gradient: { from: "#141a2e", to: "#05070f", direction: "vertical" },
        cornerRadius: 10,
      }),
  },
  {
    id: "lower-third",
    label: "Lower Third",
    category: "Broadcast",
    build: (cx, cy) => {
      const w = 900;
      const h = 200;
      return createGroupElement({
        name: "Lower Third",
        transform: { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: 0 },
        children: [
          rect(0, 40, w, 96, { name: "Main Bar", fill: NAVY, gradient: { from: "#0a1240", mid: "#2b3fd6", to: "#050b26", direction: "diagonal" }, skewX: -14, shadow: { color: "#000000", blur: 16, offsetX: 0, offsetY: 8, opacity: 0.45 } }),
          rect(30, 24, 220, 40, { name: "Kicker Tab", fill: GOLD, skewX: -14 }),
          text("Kicker", 44, 30, 200, 30, "KICKER", { fontSize: 22, fill: "#0c1020", align: "left", uppercase: true, letterSpacing: 2 }),
          text("Headline", 60, 56, w - 120, 56, "HEADLINE TEXT", { fontSize: 46, fill: WHITE, align: "left", letterSpacing: 1 }),
          text("Subline", 60, 112, w - 120, 32, "Secondary line goes here", { fontSize: 24, fill: "#b9c4e4", align: "left" }),
        ],
      });
    },
  },
  {
    id: "badge",
    label: "Badge",
    category: "Broadcast",
    build: (cx, cy) => {
      const s = 160;
      return createGroupElement({
        name: "Badge",
        transform: { x: cx - s / 2, y: cy - s / 2, width: s, height: s, rotation: 0 },
        children: [
          rect(0, 0, s, s, { name: "Badge BG", fill: RED, cornerRadius: 16, shadow: { color: "#000000", blur: 12, offsetX: 0, offsetY: 5, opacity: 0.4 } }),
          rect(10, 10, s - 20, s - 20, { name: "Badge Ring", fill: "rgba(0,0,0,0)", stroke: WHITE, strokeWidth: 3, cornerRadius: 12 }),
          text("Badge Text", 0, s / 2 - 26, s, 52, "LIVE", { fontSize: 44, fill: WHITE, letterSpacing: 2 }),
        ],
      });
    },
  },
  // --- Accents -------------------------------------------------------------
  {
    id: "ribbon",
    label: "Ribbon",
    category: "Accents",
    build: (cx, cy) => {
      const w = 340;
      const h = 64;
      return createGroupElement({
        name: "Ribbon",
        transform: { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: 0 },
        children: [
          rect(0, 0, w, h, { name: "Ribbon BG", fill: GOLD, gradient: { from: "#a87820", mid: "#f4d488", to: "#d9a441", direction: "horizontal" }, skewX: -16 }),
          text("Ribbon Text", 0, h / 2 - 18, w, 36, "FEATURED", { fontSize: 30, fill: "#241338", letterSpacing: 3, uppercase: true }),
        ],
      });
    },
  },
  {
    id: "corner-accent",
    label: "Corner",
    category: "Accents",
    build: (cx, cy) => rect(cx - 120, cy - 6, 240, 12, { name: "Corner Accent", fill: GOLD, skewX: -30 }),
  },
  {
    id: "swatch",
    label: "Swatch",
    category: "Accents",
    build: (cx, cy) => rect(cx - 40, cy - 40, 80, 80, { name: "Swatch", fill: BLUE, cornerRadius: 6 }),
  },
];
