import { createLayer, createRectElement, defaultTimeline } from "@/document/factory";
import type { AnimPhaseSpec, Layer, RectElement, TextElement } from "@/document/types";
import type { SportId } from "./types";
import { BRAND_KEYS, boundText, withAccentFill } from "./common";
import type { Gloss } from "@/graphics/motionKit";

/**
 * Modern unified scorebug (Phase 5.7) — one builder for all 8 sports,
 * replacing the flat Phase-4 per-sport bands. Skewed gloss panels, drop
 * shadows, a graphite score block with a gold sliver, team-color accents and
 * choreographed IN/OUT. Every dynamic field is a real Binding into the
 * sport's live `<sport>.<field>` source (the 6 core keys every sport shares:
 * homeTeam/awayTeam/homeScore/awayScore/clock/period); brand panels bind to
 * the Brand Kit so the whole package re-themes from Data Sources. Inserted
 * layers are ordinary editable gfx2d layers, never locked templates.
 */

const SKEW = -12;
const Y = 900;
const H = 84;
const SHADOW = { color: "#000000", blur: 14, offsetX: 0, offsetY: 6, opacity: 0.5 } as const;

const GRAPHITE: Gloss = { from: "#12141c", mid: "#252a3a", to: "#0a0c14" };
const GOLD: Gloss = { from: "#a87820", mid: "#f4d488", to: "#d9a441" };
const HOME_ACCENT: Gloss = { from: "#12266e", mid: "#2a4ad0", to: "#0c1848" };
const AWAY_ACCENT: Gloss = { from: "#6e1220", mid: "#c92a3e", to: "#480c14" };
const GOLD_TEXT = "#f0d493";

function inSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.4, direction: "left", distance: 420, ease: "power3.out", fade: false, ...overrides };
}
function outSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.32, direction: "left", distance: 320, ease: "power2.in", fade: true, ...overrides };
}

/** Skewed flat-fill panel, optionally brand-bound (the scorebug convention). */
function panel(name: string, x: number, w: number, h: number, y: number, fill: string, animIn: AnimPhaseSpec, animOut: AnimPhaseSpec, brandKey?: string): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill,
    skewX: SKEW,
    shadow: { ...SHADOW },
    bindings: brandKey ? [{ targetPath: "fill", source: brandKey, fallback: fill }] : [],
    anim: { in: animIn, out: animOut },
  });
}

/** Skewed gloss bar/accent (gradient, no brand binding). */
function gloss(name: string, x: number, w: number, h: number, y: number, gradient: Gloss, animIn: AnimPhaseSpec, animOut: AnimPhaseSpec): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill: gradient.from,
    gradient: { ...gradient, direction: "diagonal" },
    skewX: SKEW,
    shadow: { ...SHADOW },
    anim: { in: animIn, out: animOut },
  });
}

function label(name: string, x: number, y: number, w: number, h: number, key: string, fallback: string, fontSize: number, fill: string, animIn: AnimPhaseSpec, animOut: AnimPhaseSpec, overrides: Partial<TextElement> = {}): TextElement {
  return boundText(name, { x, y, width: w, height: h, rotation: 0 }, key, fallback, {
    fontSize,
    fill,
    uppercase: true,
    anim: { in: animIn, out: animOut },
    ...overrides,
  });
}

export function createScorebug(sport: SportId, sportLabel: string): Layer {
  const k = (field: string) => `${sport}.${field}`;

  const layer = createLayer("gfx2d", {
    name: `${sportLabel} Scorebug`,
    timeline: defaultTimeline({ inDuration: 0.95, outDuration: 0.55, inEase: "power3.out", outEase: "power2.in" }),
  });
  if (layer.props.kind !== "gfx2d") return layer;

  layer.props.elements = [
    // Score block lands first, center; panels wipe out from behind it.
    gloss("Score Block", 500, 240, H, Y, GRAPHITE, inSpec(0, { direction: "bottom", distance: 120, duration: 0.42 }), outSpec(0.12, { direction: "bottom" })),
    gloss("Gold Sliver", 500, 240, 8, Y - 12, GOLD, inSpec(0.34, { duration: 0.3, distance: 240, fade: false }), outSpec(0)),

    panel("Home Panel", 150, 360, H, Y, "#0a0a18", inSpec(0.1, { distance: 700 }), outSpec(0.06), BRAND_KEYS.panelBg),
    gloss("Home Accent", 138, 14, H, Y, HOME_ACCENT, inSpec(0.28, { distance: 200, fade: true }), outSpec(0)),
    panel("Away Panel", 740, 360, H, Y, "#0a0a18", inSpec(0.1, { direction: "right", distance: 700 }), outSpec(0.06, { direction: "right" }), BRAND_KEYS.panelBg),
    gloss("Away Accent", 1092, 14, H, Y, AWAY_ACCENT, inSpec(0.28, { direction: "right", distance: 200, fade: true }), outSpec(0, { direction: "right" })),

    // Clock/period tab rides off the right end.
    panel("Clock Tab", 1110, 250, 62, Y + 11, "#111122", inSpec(0.42, { direction: "right", distance: 300, duration: 0.38, fade: true }), outSpec(0, { direction: "right", distance: 60 })),

    label("Home Team", 175, Y + 24, 330, 44, k("homeTeam"), "HOME", 36, "#ffffff", inSpec(0.3, { distance: 90, fade: true }), outSpec(0, { distance: 60 }), { align: "left", letterSpacing: 1 }),
    label("Home Score", 505, Y + 18, 100, 52, k("homeScore"), "0", 46, "#ffffff", inSpec(0.34, { direction: "bottom", distance: 50, fade: true }), outSpec(0, { direction: "bottom", distance: 40 })),
    withAccentFill(
      boundText("Divider", { x: 605, y: Y + 18, width: 30, height: 52, rotation: 0 }, "", "–", {
        fontSize: 40,
        fill: GOLD_TEXT,
        anim: { in: inSpec(0.4, { direction: "none", fade: true }), out: outSpec(0, { direction: "none" }) },
      }),
      GOLD_TEXT,
    ),
    label("Away Score", 635, Y + 18, 100, 52, k("awayScore"), "0", 46, "#ffffff", inSpec(0.34, { direction: "bottom", distance: 50, fade: true }), outSpec(0, { direction: "bottom", distance: 40 })),
    label("Away Team", 760, Y + 24, 330, 44, k("awayTeam"), "AWAY", 36, "#ffffff", inSpec(0.3, { direction: "right", distance: 90, fade: true }), outSpec(0, { direction: "right", distance: 60 }), { align: "left", letterSpacing: 1 }),

    withAccentFill(
      boundText("Clock", { x: 1120, y: Y + 16, width: 230, height: 38, rotation: 0 }, k("clock"), "00:00", {
        fontSize: 30,
        fill: GOLD_TEXT,
        letterSpacing: 1,
        anim: { in: inSpec(0.5, { direction: "right", distance: 60, fade: true, duration: 0.32 }), out: outSpec(0, { direction: "right", distance: 40 }) },
      }),
      GOLD_TEXT,
    ),
    withAccentFill(
      boundText("Period", { x: 1120, y: Y + 52, width: 230, height: 24, rotation: 0 }, k("period"), "1ST", {
        fontSize: 17,
        fill: GOLD_TEXT,
        fontStyle: "normal",
        letterSpacing: 3,
        anim: { in: inSpec(0.56, { direction: "right", distance: 50, fade: true, duration: 0.3 }), out: outSpec(0, { direction: "right", distance: 40 }) },
      }),
      GOLD_TEXT,
    ),
  ];

  return layer;
}
