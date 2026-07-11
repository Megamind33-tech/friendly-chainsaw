import { createLayer, defaultTimeline } from "@/document/factory";
import type { AnimPhaseSpec, Layer, RectElement, TextElement } from "@/document/types";
import type { SportId } from "./types";
import { boundText, withAccentFill } from "@/sports/common";
import { bar, label, inSpec as kitInSpec, outSpec as kitOutSpec } from "@/graphics/motionKit";

/**
 * Modern corner scorebug — a compact top-left bug (roughly x 60-620,
 * y 40-140), distinct from the centered lower-band scorebug in
 * src/sports/scorebug.ts. Skewed gloss panels (graphite center, blue home /
 * red away side tabs), homeTeam/awayTeam abbreviated names, homeScore/
 * awayScore, clock + period on a slim under-tab, gold accent sliver — same
 * skewed-bar language and per-element choreography as the rest of the
 * package (src/graphics/motionKit.ts, src/sports/lowerThirds.ts). Every
 * dynamic field binds to the sport's live `<sport>.<field>` source (the 6
 * core keys every sport shares: homeTeam/awayTeam/homeScore/awayScore/clock/
 * period).
 */

const GRAPHITE = { from: "#12141c", mid: "#252a3a", to: "#0a0c14" } as const;
const HOME_BLUE = { from: "#12266e", mid: "#2a4ad0", to: "#0c1848" } as const;
const AWAY_RED = { from: "#6e1220", mid: "#c92a3e", to: "#480c14" } as const;
const GOLD = { from: "#a87820", mid: "#f4d488", to: "#d9a441" } as const;
const GOLD_TEXT = "#f0d493";

function inSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return kitInSpec(delay, { duration: 0.4, distance: 380, fade: false, ...overrides });
}
function outSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return kitOutSpec(delay, { duration: 0.3, distance: 280, ...overrides });
}

export function createModernScorebug(sport: SportId, sportLabel: string): Layer {
  const k = (field: string) => `${sport}.${field}`;

  const layer = createLayer("gfx2d", {
    name: `${sportLabel} Modern Scorebug`,
    timeline: defaultTimeline({ inDuration: 0.95, outDuration: 0.55, inEase: "power3.out", outEase: "power2.in" }),
  });
  if (layer.props.kind !== "gfx2d") return layer;

  const elements: (RectElement | TextElement)[] = [
    // Center graphite score block lands first.
    bar("Score Block", 250, 40, 180, 68, GRAPHITE, inSpec(0, { direction: "top", distance: 100 }), outSpec(0.12, { direction: "top" })),
    bar("Gold Sliver", 250, 106, 180, 6, GOLD, inSpec(0.3, { duration: 0.28, distance: 180, fade: false }), outSpec(0), { shadow: undefined }),

    // Home tab wipes in from the left, behind the score block.
    bar("Home Tab", 60, 40, 200, 68, HOME_BLUE, inSpec(0.08, { distance: 340 }), outSpec(0.05)),
    // Away tab wipes in from the right.
    bar("Away Tab", 420, 40, 200, 68, AWAY_RED, inSpec(0.08, { direction: "right", distance: 340 }), outSpec(0.05, { direction: "right" })),

    // Slim under-tab for clock + period, rides in from the bottom last.
    bar("Under Tab", 60, 112, 400, 28, GRAPHITE, inSpec(0.4, { direction: "bottom", distance: 50, duration: 0.32 }), outSpec(0, { direction: "bottom", distance: 40 })),

    label("Home Team", 70, 58, 180, 34, k("homeTeam"), "HOM", 24, "#ffffff", inSpec(0.22, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { align: "center", letterSpacing: 1 }),
    label("Away Team", 430, 58, 180, 34, k("awayTeam"), "AWY", 24, "#ffffff", inSpec(0.22, { direction: "right", distance: 60, fade: true }), outSpec(0, { direction: "right", distance: 40 }), { align: "center", letterSpacing: 1 }),

    label("Home Score", 255, 48, 80, 52, k("homeScore"), "0", 42, "#ffffff", inSpec(0.28, { direction: "top", distance: 40, fade: true }), outSpec(0, { direction: "top", distance: 30 }), { align: "center" }),
    label("Away Score", 345, 48, 80, 52, k("awayScore"), "0", 42, "#ffffff", inSpec(0.28, { direction: "top", distance: 40, fade: true }), outSpec(0, { direction: "top", distance: 30 }), { align: "center" }),

    withAccentFill(
      boundText("Score Divider", { x: 330, y: 48, width: 20, height: 52, rotation: 0 }, "", "-", {
        fontSize: 34,
        fill: GOLD_TEXT,
        align: "center",
        anim: { in: inSpec(0.32, { direction: "none", fade: true }), out: outSpec(0, { direction: "none" }) },
      }),
      GOLD_TEXT,
    ),

    withAccentFill(
      boundText("Clock", { x: 65, y: 116, width: 190, height: 22, rotation: 0 }, k("clock"), "00:00", {
        fontSize: 17,
        fill: GOLD_TEXT,
        align: "left",
        letterSpacing: 1,
        anim: { in: inSpec(0.48, { direction: "bottom", distance: 30, fade: true, duration: 0.28 }), out: outSpec(0, { direction: "bottom", distance: 24 }) },
      }),
      GOLD_TEXT,
    ),
    withAccentFill(
      boundText("Period", { x: 255, y: 116, width: 200, height: 22, rotation: 0 }, k("period"), "1ST", {
        fontSize: 15,
        fill: GOLD_TEXT,
        align: "right",
        fontStyle: "normal",
        letterSpacing: 2,
        anim: { in: inSpec(0.52, { direction: "bottom", distance: 30, fade: true, duration: 0.28 }), out: outSpec(0, { direction: "bottom", distance: 24 }) },
      }),
      GOLD_TEXT,
    ),
  ];

  layer.props.elements = elements;
  return layer;
}
