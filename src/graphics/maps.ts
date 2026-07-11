import { createGroupElement, createImageSlot, createRectElement } from "@/document/factory";
import { boundText } from "@/sports/common";
import { bar, gfxLayer, inSpec, label, outSpec, SKEW, SOFT_SHADOW } from "./motionKit";
import type { GroupElement, RectElement } from "@/document/types";

/**
 * Map board broadcast graphics (Phase 6's practical, offline-first cut).
 * This network cannot reach tile servers or CDNs, so there is no live
 * MapLibre here and no fake drawn continents either: the operator drops
 * their own map artwork (screenshot / vector export / weather chart) into a
 * real image slot, and this template supplies the broadcast chrome — header
 * straps, pulsing location pins with live-bound labels/values, and a legend.
 * Usable for weather, elections, and news maps alike; every dynamic field is
 * a real Binding into the live `map.<field>` source (merged into
 * dataSources.ts) with an authored fallback.
 */

// ---------------------------------------------------------------------------
// 1. Map feed data schema.
// ---------------------------------------------------------------------------

export const MAP_KEYS: string[] = [
  "title",
  "subtitle",
  ...[1, 2, 3, 4].flatMap((n) => [`loc${n}label`, `loc${n}value`]),
];

export const MAP_DEFAULTS: Record<string, string> = {
  title: "REGIONAL OVERVIEW",
  subtitle: "LIVE SITUATION MAP",
  loc1label: "NORTHFIELD",
  loc1value: "34°",
  loc2label: "PORT ELLIS",
  loc2value: "28°",
  loc3label: "KINGS CROSS",
  loc3value: "31°",
  loc4label: "WESTMERE",
  loc4value: "26°",
};

// Shared palette — realistic per-design colors, deliberately NOT chained to
// the Brand Kit (the genre-template convention, see genreKit.ts).
const INK = { from: "#0b1430", mid: "#16224a", to: "#0a1028" };
const ACCENT = "#3fa9f5";
const ACCENT_DEEP = "#1d5f96";

// ---------------------------------------------------------------------------
// 2. Reusable pin.
// ---------------------------------------------------------------------------

/**
 * A pulsing location pin + bound label tab, positioned at canvas coords.
 * Children are group-relative (the GroupElement convention), so the whole
 * pin drags/animates as one unit and extra pins can be inserted anywhere.
 */
export function createMapPin(index: 1 | 2 | 3 | 4, x: number, y: number): GroupElement {
  const halo: RectElement = createRectElement({
    name: `Pin ${index} Halo`,
    transform: { x: 0, y: 10, width: 44, height: 44, rotation: 0 },
    fill: ACCENT,
    cornerRadius: 22,
    opacity: 0.28,
    anim: { loop: { periodSec: 1.6, scaleTo: 1.35, opacityTo: 0.08 } },
  });
  const dot: RectElement = createRectElement({
    name: `Pin ${index} Dot`,
    transform: { x: 10, y: 20, width: 24, height: 24, rotation: 0 },
    fill: ACCENT,
    cornerRadius: 12,
    shadow: { ...SOFT_SHADOW, blur: 10, offsetY: 3 },
    anim: { loop: { periodSec: 1.6, scaleTo: 1.15 } },
  });
  const tab: RectElement = createRectElement({
    name: `Pin ${index} Tab`,
    transform: { x: 56, y: 2, width: 168, height: 38, rotation: 0 },
    fill: "#0a1028",
    gradient: { ...INK, direction: "diagonal" },
    skewX: SKEW,
    shadow: { ...SOFT_SHADOW, blur: 12, offsetY: 4 },
    opacity: 0.94,
  });
  const labelText = boundText(
    `Pin ${index} Label`,
    { x: 62, y: 9, width: 156, height: 24, rotation: 0 },
    `map.loc${index}label`,
    MAP_DEFAULTS[`loc${index}label`],
    { fontSize: 17, align: "left", uppercase: true, letterSpacing: 1.5 },
  );
  const valueText = boundText(
    `Pin ${index} Value`,
    { x: 62, y: 42, width: 156, height: 22, rotation: 0 },
    `map.loc${index}value`,
    MAP_DEFAULTS[`loc${index}value`],
    { fontSize: 19, align: "left", fill: ACCENT },
  );

  return createGroupElement({
    name: `Map Pin ${index}`,
    transform: { x, y, width: 224, height: 66, rotation: 0 },
    children: [halo, dot, tab, labelText, valueText],
    // Pins pop in staggered after the frame lands; quick fade on OUT.
    anim: {
      in: inSpec(0.5 + (index - 1) * 0.12, {
        direction: "none",
        duration: 0.4,
        ease: "back.out(1.6)",
        fade: true,
        scaleFrom: 0,
      }),
      out: outSpec((index - 1) * 0.05, { direction: "none", duration: 0.25 }),
    },
  });
}

// ---------------------------------------------------------------------------
// 3. Full-screen map board.
// ---------------------------------------------------------------------------

export function createMapBoard() {
  const backdrop = createRectElement({
    name: "Backdrop",
    transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0 },
    fill: "#070b1a",
    gradient: { from: "#0a1028", to: "#05070f", direction: "vertical" },
    anim: {
      in: inSpec(0, { direction: "none", duration: 0.35, fade: true }),
      out: outSpec(0.3, { direction: "none", duration: 0.3 }),
    },
  });

  const headerBar = bar(
    "Header Bar",
    70,
    58,
    780,
    88,
    INK,
    inSpec(0.15),
    outSpec(0.1),
  );
  const headerAccent = bar(
    "Header Accent",
    52,
    58,
    14,
    88,
    { from: ACCENT, to: ACCENT_DEEP },
    inSpec(0.1),
    outSpec(0.05),
  );
  const title = label(
    "Title",
    96,
    76,
    720,
    52,
    "map.title",
    MAP_DEFAULTS.title,
    40,
    "#ffffff",
    inSpec(0.3, { distance: 260 }),
    outSpec(0),
    { align: "left", letterSpacing: 3 },
  );
  const subtitleBar = bar(
    "Subtitle Bar",
    70,
    156,
    460,
    42,
    { from: ACCENT_DEEP, mid: ACCENT, to: ACCENT_DEEP },
    inSpec(0.35),
    outSpec(0.05),
  );
  const subtitle = label(
    "Subtitle",
    92,
    165,
    420,
    26,
    "map.subtitle",
    MAP_DEFAULTS.subtitle,
    19,
    "#eaf4ff",
    inSpec(0.45, { distance: 200 }),
    outSpec(0),
    { align: "left", letterSpacing: 2.5 },
  );

  // Map area — accent frame + the operator's own artwork in a real slot.
  const frame = createRectElement({
    name: "Map Frame",
    transform: { x: 206, y: 246, width: 1508, height: 768, rotation: 0 },
    fill: "#0a1028",
    stroke: ACCENT_DEEP,
    strokeWidth: 2,
    opacity: 0.9,
    shadow: { ...SOFT_SHADOW },
    anim: {
      in: inSpec(0.1, { direction: "none", duration: 0.45, fade: true }),
      out: outSpec(0.2, { direction: "none", duration: 0.3 }),
    },
  });
  const mapSlot = createImageSlot("Map Artwork", { x: 214, y: 254, width: 1492, height: 752 }, {
    anim: {
      in: inSpec(0.25, { direction: "none", duration: 0.45, fade: true }),
      out: outSpec(0.15, { direction: "none", duration: 0.3 }),
    },
  });

  const pins = [
    createMapPin(1, 480, 380),
    createMapPin(2, 1180, 480),
    createMapPin(3, 720, 700),
    createMapPin(4, 1320, 820),
  ];

  // Legend strip.
  const legendBar = createRectElement({
    name: "Legend Bar",
    transform: { x: 206, y: 1024, width: 1508, height: 34, rotation: 0 },
    fill: "#0a1028",
    opacity: 0.85,
    anim: {
      in: inSpec(1.0, { direction: "bottom", distance: 60, duration: 0.35, fade: true }),
      out: outSpec(0, { direction: "bottom", distance: 60, duration: 0.25 }),
    },
  });
  const legendSwatch = createRectElement({
    name: "Legend Swatch",
    transform: { x: 224, y: 1033, width: 16, height: 16, rotation: 0 },
    fill: ACCENT,
    cornerRadius: 8,
    anim: {
      in: inSpec(1.1, { direction: "none", duration: 0.3, fade: true }),
      out: outSpec(0, { direction: "none", duration: 0.2 }),
    },
  });
  // Chrome caption, not data — a literal is honest here (same convention as
  // the genre packs' fixed kickers).
  const legendCaption = boundText(
    "Legend Caption",
    { x: 252, y: 1036, width: 400, height: 20, rotation: 0 },
    "map.subtitle",
    MAP_DEFAULTS.subtitle,
    {
      fontSize: 14,
      align: "left",
      fill: "#9fb6d8",
      uppercase: true,
      letterSpacing: 2,
      anim: {
        in: inSpec(1.15, { direction: "none", duration: 0.3, fade: true }),
        out: outSpec(0, { direction: "none", duration: 0.2 }),
      },
    },
  );

  return gfxLayer(
    "Map Board",
    [backdrop, frame, mapSlot, headerBar, headerAccent, title, subtitleBar, subtitle, ...pins, legendBar, legendSwatch, legendCaption],
    { inDuration: 1.5, outDuration: 0.7 },
  );
}
