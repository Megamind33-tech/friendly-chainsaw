import type { Layer, RectElement, TextElement } from "@/document/types";
import type { SportId } from "./types";
import { bar, label, inSpec, outSpec, gfxLayer } from "@/graphics/motionKit";

/**
 * Broadcast lower-thirds pack (Phase 5.6), modeled on the operator's
 * reference (layered ~20°-skewed bars, gloss gradients, offset sub-strips,
 * kicker tabs) with real per-element choreography: main bar wipes in first,
 * tabs drop in late, text slides in staggered, sub-strip extends last —
 * ~1.1s total IN, faster OUT, per broadcast convention.
 *
 * Palettes are realistic and per-design (deliberately NOT all chained to
 * one Brand Kit color — operator direction); every color, timing and skew
 * stays editable per element in the Inspector. The skewed-bar geometry +
 * choreography helpers are shared with the genre packs via motionKit.
 */

// The reference's navy gloss.
const NAVY = { from: "#0a1240", mid: "#2b3fd6", to: "#050b26" } as const;
const WHITE = { from: "#ffffff", mid: "#f2f5fb", to: "#d8deea" } as const;

function lowerThirdLayer(name: string, elements: (RectElement | TextElement)[]): Layer {
  return gfxLayer(name, elements, { inDuration: 1.2, outDuration: 0.7 });
}

// ---------------------------------------------------------------------------
// 1. Breaking News — reference row 1: white channel tab, navy headline bar,
//    white kicker tab riding the top edge, offset white sub-strip.
// ---------------------------------------------------------------------------

export function createBreakingNewsLowerThird(): Layer {
  return lowerThirdLayer("Breaking News L3", [
    // Main navy bar first on air.
    bar("Headline Bar", 430, 812, 1140, 112, NAVY, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.15, { direction: "right" })),
    // White channel tab overlaps its left end.
    bar("Channel Tab", 130, 800, 340, 136, WHITE, inSpec(0.12, { duration: 0.45 }), outSpec(0.1)),
    // Kicker tab drops onto the top edge.
    bar("Kicker Tab", 1120, 762, 430, 58, WHITE, inSpec(0.3, { direction: "top", distance: 90, duration: 0.35, ease: "back.out(1.6)", fade: true }), outSpec(0, { direction: "top", distance: 80 })),
    // Sub-strip extends underneath, offset right (reference's stepped look).
    bar("Sub Strip", 560, 932, 1010, 52, WHITE, inSpec(0.42, { duration: 0.4, distance: 520 }), outSpec(0.05)),
    bar("Sub Accent", 400, 932, 150, 52, NAVY, inSpec(0.5, { duration: 0.35, distance: 300 }), outSpec(0)),

    label("Channel", 150, 830, 300, 46, "mock.channel", "CHANNEL", 38, "#0c1020", inSpec(0.25, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 2 }),
    label("Tagline", 150, 880, 300, 24, "mock.tagline", "TAGLINE GOES HERE", 15, "#3a4258", inSpec(0.32, { distance: 50, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 1.5, fontStyle: "normal" }),
    label("Headline", 500, 838, 1020, 62, "mock.headline", "HEADLINE TEXT HERE", 52, "#ffffff", inSpec(0.28, { distance: 140, fade: true }), outSpec(0, { distance: 100 }), { letterSpacing: 1, shadow: { color: "#000000", blur: 6, offsetX: 0, offsetY: 2, opacity: 0.5 } }),
    label("Kicker", 1140, 774, 390, 36, "mock.kicker", "BREAKING NEWS", 28, "#0c1020", inSpec(0.42, { direction: "top", distance: 40, duration: 0.3, fade: true }), outSpec(0, { direction: "top", distance: 40 }), { letterSpacing: 3 }),
    label("Subline", 590, 944, 950, 30, "mock.subline", "Live coverage continues", 24, "#10152e", inSpec(0.55, { distance: 90, fade: true, duration: 0.35 }), outSpec(0, { distance: 60 }), { uppercase: false, fontStyle: "normal", align: "left" }),
  ]);
}

// ---------------------------------------------------------------------------
// 2. Standard two-tier — reference row 2: one deep bar, headline + subline
//    stacked inside, white channel tab on the left.
// ---------------------------------------------------------------------------

export function createStandardLowerThird(): Layer {
  return lowerThirdLayer("Standard L3", [
    bar("Main Bar", 420, 810, 1150, 132, NAVY, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Channel Tab", 130, 796, 330, 158, WHITE, inSpec(0.12), outSpec(0.06)),
    bar("Top Sliver", 470, 796, 240, 12, WHITE, inSpec(0.35, { duration: 0.35, distance: 260 }), outSpec(0)),

    label("Channel", 150, 836, 290, 46, "mock.channel", "CHANNEL", 38, "#0c1020", inSpec(0.24, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 2 }),
    label("Tagline", 150, 888, 290, 24, "mock.tagline", "TAGLINE GOES HERE", 15, "#3a4258", inSpec(0.3, { distance: 50, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 1.5, fontStyle: "normal" }),
    label("Headline", 500, 826, 1030, 58, "mock.headline", "HEADLINE TEXT HERE", 48, "#ffffff", inSpec(0.26, { distance: 130, fade: true }), outSpec(0, { distance: 90 }), { letterSpacing: 1 }),
    label("Subline", 500, 892, 1030, 34, "mock.subline", "Secondary line goes here", 26, "#b9c4e4", inSpec(0.4, { distance: 100, fade: true }), outSpec(0, { distance: 70 }), { uppercase: false, fontStyle: "normal" }),
  ]);
}

// ---------------------------------------------------------------------------
// 3. LIVE tag — reference row 3, inverted: blue LIVE tab, white headline
//    bar, navy sub-strip.
// ---------------------------------------------------------------------------

export function createLiveLowerThird(): Layer {
  return lowerThirdLayer("LIVE L3", [
    bar("Headline Bar", 420, 806, 1150, 104, WHITE, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Live Tab", 130, 792, 330, 132, NAVY, inSpec(0.12), outSpec(0.06)),
    bar("Sub Strip", 545, 918, 1025, 54, NAVY, inSpec(0.4, { duration: 0.4, distance: 520 }), outSpec(0.05)),

    label("LIVE", 150, 826, 290, 56, "", "LIVE", 46, "#ffffff", inSpec(0.24, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 6 }),
    label("Headline", 495, 830, 1040, 56, "mock.headline", "HEADLINE TEXT HERE", 46, "#0c1020", inSpec(0.26, { distance: 130, fade: true }), outSpec(0, { distance: 90 }), { letterSpacing: 1 }),
    label("Subline", 580, 930, 960, 30, "mock.subline", "Live coverage continues", 24, "#ffffff", inSpec(0.52, { distance: 90, fade: true, duration: 0.35 }), outSpec(0, { distance: 60 }), { uppercase: false, fontStyle: "normal", align: "left" }),
  ]);
}

// ---------------------------------------------------------------------------
// 4. Sports angled — team vs team with live score, graphite + team colors +
//    gold accent, same skewed language.
// ---------------------------------------------------------------------------

const GRAPHITE = { from: "#12141c", mid: "#252a3a", to: "#0a0c14" } as const;
const HOME_BLUE = { from: "#12266e", mid: "#2a4ad0", to: "#0c1848" } as const;
const AWAY_RED = { from: "#6e1220", mid: "#c92a3e", to: "#480c14" } as const;

export function createSportsLowerThird(sport: SportId, sportLabel: string): Layer {
  return lowerThirdLayer(`${sportLabel} Score L3`, [
    bar("Score Bar", 620, 824, 680, 100, GRAPHITE, inSpec(0, { duration: 0.45, distance: 400, direction: "bottom" }), outSpec(0.1, { direction: "bottom" })),
    bar("Home Panel", 170, 824, 470, 100, HOME_BLUE, inSpec(0.1, { duration: 0.5, distance: 700 }), outSpec(0.05)),
    bar("Away Panel", 1280, 824, 470, 100, AWAY_RED, inSpec(0.1, { duration: 0.5, distance: 700, direction: "right" }), outSpec(0.05, { direction: "right" })),
    bar("Gold Sliver", 620, 806, 680, 10, { from: "#d9a441", mid: "#f4d488", to: "#a87820" }, inSpec(0.35, { duration: 0.35, distance: 300 }), outSpec(0)),
    bar("Clock Tab", 830, 932, 260, 44, GRAPHITE, inSpec(0.45, { direction: "bottom", distance: 60, duration: 0.35, fade: true }), outSpec(0, { direction: "bottom", distance: 50 })),

    label("Home Team", 200, 852, 410, 50, `${sport}.homeTeam`, "HOME", 40, "#ffffff", inSpec(0.28, { distance: 90, fade: true }), outSpec(0, { distance: 60 }), { letterSpacing: 1.5 }),
    label("Away Team", 1310, 852, 410, 50, `${sport}.awayTeam`, "AWAY", 40, "#ffffff", inSpec(0.28, { distance: 90, fade: true, direction: "right" }), outSpec(0, { distance: 60, direction: "right" }), { letterSpacing: 1.5 }),
    label("Home Score", 680, 840, 200, 66, `${sport}.homeScore`, "0", 58, "#ffffff", inSpec(0.3, { direction: "bottom", distance: 50, fade: true }), outSpec(0, { direction: "bottom", distance: 40 })),
    label("Score Divider", 880, 844, 160, 60, "", "–", 44, "#d9a441", inSpec(0.34, { direction: "none", fade: true }), outSpec(0, { direction: "none" })),
    label("Away Score", 1040, 840, 200, 66, `${sport}.awayScore`, "0", 58, "#ffffff", inSpec(0.3, { direction: "bottom", distance: 50, fade: true }), outSpec(0, { direction: "bottom", distance: 40 })),
    label("Clock", 850, 940, 220, 30, `${sport}.clock`, "00:00", 24, "#d9a441", inSpec(0.55, { direction: "bottom", distance: 30, fade: true, duration: 0.3 }), outSpec(0, { direction: "bottom", distance: 30 }), { letterSpacing: 2 }),
  ]);
}

export interface LowerThirdTemplate {
  id: string;
  label: string;
  create: (sport: SportId, sportLabel: string) => Layer;
}

/** Cards for the Templates panel — first three are news graphics (sport-
 * independent), the fourth follows the selected sport's live data. */
export const LOWER_THIRDS: LowerThirdTemplate[] = [
  { id: "l3-breaking", label: "Breaking News L3", create: () => createBreakingNewsLowerThird() },
  { id: "l3-standard", label: "Standard L3", create: () => createStandardLowerThird() },
  { id: "l3-live", label: "LIVE L3", create: () => createLiveLowerThird() },
  { id: "l3-sports", label: "Sports Score L3", create: (sport, label) => createSportsLowerThird(sport, label) },
];
