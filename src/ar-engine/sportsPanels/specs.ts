import { createPrimitiveNode, vec3 } from "@/document/factory";
import type { SetNode } from "@/document/types";
import {
  KIT_MATERIALS,
  archRectOutline,
  chamferRectOutline,
  circleOutline,
  facetRectOutline,
  shieldOutline,
  drumPedestalBase,
  ovalPlinthBase,
  shelfBase,
  steppedPlinthBase,
  type SportsPanelParams,
} from "./panelKit";
import type { SportsPanelSpec } from "./panelBuilder";

/**
 * The 10 Sports AR Panel specs — one per attached reference image, each an
 * independent model. Only the STRUCTURAL FORM of each reference is
 * reproduced (silhouette, frame profile, base family, strip placement,
 * stance); every colour ships neutral and every content zone ships empty,
 * so the same asset serves football, basketball, rugby, cricket, tennis,
 * hockey, baseball and any other sport without carrying an identity.
 */

const deg = (a: number) => (a * Math.PI) / 180;

/** Shared reference defaults — each spec overrides what its silhouette needs. */
const COMMON: SportsPanelParams = {
  width: 2.4,
  height: 1.2,
  depth: 0.16,
  frameThickness: 0.075,
  frameDepth: 0.07,
  baseWidth: 2.7,
  baseDepth: 0.7,
  baseHeight: 0.14,
  cornerBevel: 0.2,
  leftAngle: 45,
  rightAngle: 45,
  topAngle: 0,
  bottomAngle: 0,
  contentInset: 0.02,
  stripWidth: 0.028,
  stripDepth: 0.03,
  tilt: 0,
};

// --- 01 · wide chrome panel, chamfered corners, side strips, low plinth ---
const panel01: SportsPanelSpec = {
  id: "ar_sports_panel_01",
  name: "Sports AR Panel 01",
  version: "1.0.0",
  description: "Wide scoreboard panel — chamfered corners, edge light strips left and right, low twin-tier plinth.",
  layout: "wide",
  defaults: { ...COMMON, width: 2.6, height: 1.3, cornerBevel: 0.24, baseWidth: 2.9, baseDepth: 0.66, baseHeight: 0.12 },
  outline: (p) =>
    chamferRectOutline(p.width, p.height, {
      bl: p.cornerBevel * 1.25,
      tl: p.cornerBevel * 1.25,
      tr: p.cornerBevel * 0.8,
      br: p.cornerBevel * 0.8,
    }),
  base: ovalPlinthBase,
  baseGlow: "oval",
  strips: ["left", "right"],
};

// --- 02 · left-pointed hex, tilted back, top+right strips, oval plinth ---
const panel02: SportsPanelSpec = {
  id: "ar_sports_panel_02",
  name: "Sports AR Panel 02",
  version: "1.0.0",
  description: "Wide hexagonal panel with a full left point, tilted stance, glow along the top edge, rounded plinth.",
  layout: "wide",
  defaults: { ...COMMON, width: 2.7, height: 1.15, leftAngle: 28, rightAngle: 40, tilt: 8, baseWidth: 2.4, baseDepth: 0.8, baseHeight: 0.16 },
  outline: (p) => {
    const leftCy = p.height / 2; // full point at the left
    const leftCx = leftCy * Math.tan(deg(p.leftAngle));
    const rightCy = p.height * 0.3;
    const rightCx = rightCy * Math.tan(deg(p.rightAngle));
    return facetRectOutline(p.width, p.height, {
      tl: { cx: leftCx, cy: leftCy },
      bl: { cx: leftCx, cy: leftCy },
      tr: { cx: rightCx, cy: rightCy },
      br: { cx: rightCx, cy: rightCy },
    });
  },
  base: ovalPlinthBase,
  baseGlow: "oval",
  strips: ["top", "right"],
};

// --- 03 · double-trim wide panel, chamfered left / stepped right, oval base ---
const panel03: SportsPanelSpec = {
  id: "ar_sports_panel_03",
  name: "Sports AR Panel 03",
  version: "1.0.0",
  description: "Wide panel with a pronounced double frame trim, angled left corners, stepped right edge, glowing base rim.",
  layout: "wide",
  defaults: { ...COMMON, width: 2.55, height: 1.25, frameThickness: 0.095, cornerBevel: 0.3, baseWidth: 2.9, baseDepth: 0.72, baseHeight: 0.15, tilt: 3 },
  outline: (p) =>
    facetRectOutline(p.width, p.height, {
      tl: { cx: p.cornerBevel * 1.15, cy: p.cornerBevel * 0.95 },
      bl: { cx: p.cornerBevel * 1.15, cy: p.cornerBevel * 0.95 },
      tr: { cx: p.cornerBevel * 0.75, cy: p.height * 0.34 },
      br: { cx: p.cornerBevel * 0.75, cy: p.height * 0.34 },
    }),
  base: ovalPlinthBase,
  baseGlow: "oval",
  strips: ["bottom", "left"],
};

// --- 04 · portrait arch, chrome, half-round shelf ---
const panel04: SportsPanelSpec = {
  id: "ar_sports_panel_04",
  name: "Sports AR Panel 04",
  version: "1.0.0",
  description: "Portrait panel with a genuine arched top, slim chrome frame, half-round shelf base.",
  layout: "portrait",
  defaults: {
    ...COMMON,
    width: 0.95,
    height: 1.55,
    depth: 0.12,
    frameThickness: 0.06,
    frameDepth: 0.06,
    cornerBevel: 0.3,
    baseWidth: 1.15,
    baseDepth: 0.42,
    baseHeight: 0.1,
    stripWidth: 0.022,
  },
  outline: (p) => archRectOutline(p.width, p.height, p.cornerBevel * 1.4, 16),
  base: shelfBase,
  baseGlow: "oval",
  strips: ["left", "right"],
};

// --- 05 · leaning wedge with rear fin, skid base ---
const panel05: SportsPanelSpec = {
  id: "ar_sports_panel_05",
  name: "Sports AR Panel 05",
  version: "1.0.0",
  description: "Forward-leaning wedge panel with an angled support fin on the right and a low skid base.",
  layout: "wide",
  defaults: {
    ...COMMON,
    width: 2.35,
    height: 1.15,
    rightAngle: 22,
    leftAngle: 8,
    tilt: -7,
    baseWidth: 2.0,
    baseDepth: 0.6,
    baseHeight: 0.1,
    cornerBevel: 0.12,
  },
  outline: (p) => {
    // A sheared stance: the right edge leans out, the left tucks in.
    const shear = Math.tan(deg(p.rightAngle)) * p.height * 0.28;
    const tuck = Math.tan(deg(p.leftAngle)) * p.height * 0.5;
    return [
      { x: -p.width / 2 + tuck, y: -p.height / 2 },
      { x: p.width / 2 - shear, y: -p.height / 2 },
      { x: p.width / 2, y: -p.height / 2 + p.height * 0.32 },
      { x: p.width / 2, y: p.height / 2 - p.cornerBevel },
      { x: p.width / 2 - p.cornerBevel, y: p.height / 2 },
      { x: -p.width / 2 + p.cornerBevel * 0.5, y: p.height / 2 },
      { x: -p.width / 2, y: p.height / 2 - p.cornerBevel * 0.5 },
    ];
  },
  base: ovalPlinthBase,
  baseGlow: "oval",
  strips: ["top", "bottom"],
  supports: (p, { panelCenterY }) => {
    // Angled fin plates bracing the right edge — reference 05's signature.
    const fin = (name: string, dz: number, s: number): SetNode =>
      createPrimitiveNode("box", {
        name,
        material: KIT_MATERIALS.framePrimary,
        transform: {
          position: vec3(p.width / 2 - 0.1, panelCenterY - p.height * 0.32, dz),
          rotation: vec3(0, 0, 52),
          scale: vec3(0.5 * s, 0.075, 0.05),
        },
      });
    return [fin("Fin plate front", -p.depth * 0.2, 1), fin("Fin plate rear", -p.depth * 0.85, 0.8)];
  },
};

// --- 06 · hex panel with top tag block, elongated plinth ---
const panel06: SportsPanelSpec = {
  id: "ar_sports_panel_06",
  name: "Sports AR Panel 06",
  version: "1.0.0",
  description: "Wide hexagonal panel with a handle tag on the top edge and an elongated oval plinth.",
  layout: "wide",
  defaults: { ...COMMON, width: 2.5, height: 1.2, leftAngle: 30, rightAngle: 34, baseWidth: 3.0, baseDepth: 0.62, baseHeight: 0.13, tilt: 2 },
  outline: (p) => {
    const lc = p.height * 0.42;
    const rc = p.height * 0.3;
    return facetRectOutline(p.width, p.height, {
      tl: { cx: lc * Math.tan(deg(p.leftAngle)), cy: lc },
      bl: { cx: lc * Math.tan(deg(p.leftAngle)), cy: lc },
      tr: { cx: rc * Math.tan(deg(p.rightAngle)), cy: rc },
      br: { cx: rc * Math.tan(deg(p.rightAngle)), cy: rc },
    });
  },
  base: ovalPlinthBase,
  baseGlow: "oval",
  strips: ["right", "bottom"],
  supports: (p, { panelCenterY, frontZ }) => [
    // The top-right carry tag: a small beveled block riding the top edge.
    createPrimitiveNode("box", {
      name: "Top tag",
      material: KIT_MATERIALS.frameRear,
      transform: {
        position: vec3(p.width * 0.22, panelCenterY + p.height / 2 + 0.055, frontZ - p.depth / 2),
        scale: vec3(0.42, 0.11, p.depth * 0.9),
      },
    }),
    createPrimitiveNode("box", {
      name: "Top tag trim",
      material: KIT_MATERIALS.baseTrim,
      transform: {
        position: vec3(p.width * 0.22, panelCenterY + p.height / 2 + 0.115, frontZ - p.depth / 2),
        scale: vec3(0.46, 0.022, p.depth * 0.96),
      },
    }),
  ],
};

// --- 07 · compact shield, faceted right, round dish base ---
const panel07: SportsPanelSpec = {
  id: "ar_sports_panel_07",
  name: "Sports AR Panel 07",
  version: "1.0.0",
  description: "Compact shield panel with faceted side layers on a round dish base.",
  layout: "shield",
  defaults: {
    ...COMMON,
    width: 1.15,
    height: 1.25,
    depth: 0.14,
    frameThickness: 0.065,
    cornerBevel: 0.22,
    baseWidth: 1.15,
    baseDepth: 0.9,
    baseHeight: 0.1,
    stripWidth: 0.024,
  },
  outline: (p) => shieldOutlineFromParams(p),
  base: ovalPlinthBase,
  baseGlow: "oval",
  strips: ["left", "right"],
  supports: (p, { panelCenterY }) => [
    // Layered facet plates behind the right shoulder — reference 07's detail.
    createPrimitiveNode("box", {
      name: "Facet layer 1",
      material: KIT_MATERIALS.frameSecondary,
      transform: { position: vec3(p.width * 0.42, panelCenterY - p.height * 0.08, -p.depth * 0.55), rotation: vec3(0, 0, -18), scale: vec3(0.09, p.height * 0.5, 0.04) },
    }),
    createPrimitiveNode("box", {
      name: "Facet layer 2",
      material: KIT_MATERIALS.frameRear,
      transform: { position: vec3(p.width * 0.47, panelCenterY - p.height * 0.12, -p.depth * 0.8), rotation: vec3(0, 0, -18), scale: vec3(0.07, p.height * 0.42, 0.035) },
    }),
  ],
};

// --- 08 · portrait deep-frame panel on rounded shelf ---
const panel08: SportsPanelSpec = {
  id: "ar_sports_panel_08",
  name: "Sports AR Panel 08",
  version: "1.0.0",
  description: "Portrait panel with an extra-deep wraparound frame on a rounded shelf base.",
  layout: "portrait",
  defaults: {
    ...COMMON,
    width: 0.95,
    height: 1.4,
    depth: 0.24,
    frameThickness: 0.085,
    frameDepth: 0.12,
    cornerBevel: 0.06,
    baseWidth: 1.2,
    baseDepth: 0.5,
    baseHeight: 0.12,
    stripWidth: 0.022,
  },
  outline: (p) =>
    chamferRectOutline(p.width, p.height, {
      bl: p.cornerBevel,
      br: p.cornerBevel,
      tr: p.cornerBevel,
      tl: p.cornerBevel,
    }),
  base: shelfBase,
  baseGlow: "oval",
  strips: ["left", "bottom"],
};

// --- 09 · widescreen on pedestal drum with orbit ring ---
const panel09: SportsPanelSpec = {
  id: "ar_sports_panel_09",
  name: "Sports AR Panel 09",
  version: "1.0.0",
  description: "Widescreen panel on a circular pedestal drum, wrapped by an orbit ring, glowing base dish.",
  layout: "wide",
  defaults: {
    ...COMMON,
    width: 1.9,
    height: 1.1,
    depth: 0.14,
    cornerBevel: 0.07,
    tilt: 6,
    baseWidth: 1.1,
    baseDepth: 1.1,
    baseHeight: 0.42,
    frameThickness: 0.06,
  },
  outline: (p) =>
    chamferRectOutline(p.width, p.height, {
      bl: p.cornerBevel,
      br: p.cornerBevel,
      tr: p.cornerBevel,
      tl: p.cornerBevel,
    }),
  base: drumPedestalBase,
  baseGlow: "round",
  strips: ["top", "bottom"],
  supports: (p, { panelCenterY }) => {
    // The orbit ring: a real annulus prism swept around the panel, banked
    // like reference 09's swoosh — genuine geometry, not a lens flare.
    const rx = p.width * 0.72;
    const ry = p.height * 0.62;
    const ring = createPrimitiveNode("prism", {
      name: "Orbit ring",
      outline: circleOutline(rx, ry, 40),
      holeOutline: circleOutline(rx - 0.035, ry - 0.035, 40),
      material: { ...KIT_MATERIALS.frameRear, metalness: 0.85, roughness: 0.35 },
      transform: {
        position: vec3(0, panelCenterY, -p.depth * 0.4),
        rotation: vec3(12, 0, -9),
        scale: vec3(1, 1, 0.03),
      },
    });
    return [ring];
  },
};

// --- 10 · shield on stepped angular plinth ---
const panel10: SportsPanelSpec = {
  id: "ar_sports_panel_10",
  name: "Sports AR Panel 10",
  version: "1.0.0",
  description: "Broad shield panel with a heavy frame on a three-step angular plinth.",
  layout: "shield",
  defaults: {
    ...COMMON,
    width: 1.35,
    height: 1.3,
    depth: 0.16,
    frameThickness: 0.09,
    cornerBevel: 0.26,
    baseWidth: 1.7,
    baseDepth: 0.95,
    baseHeight: 0.24,
    stripWidth: 0.026,
  },
  outline: (p) => shieldOutlineFromParams(p),
  base: steppedPlinthBase,
  baseGlow: "rect",
  strips: ["left", "right"],
};

/** Shield silhouette derived from the shared params (07/10). */
function shieldOutlineFromParams(p: SportsPanelParams) {
  return shieldOutline(p.width, p.height, p.cornerBevel, p.height * 0.32);
}

export const SPORTS_PANEL_SPECS: SportsPanelSpec[] = [
  panel01,
  panel02,
  panel03,
  panel04,
  panel05,
  panel06,
  panel07,
  panel08,
  panel09,
  panel10,
];
