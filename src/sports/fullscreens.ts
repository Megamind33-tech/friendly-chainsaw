import { createLayer, createRectElement, defaultTimeline } from "@/document/factory";
import type { AnimPhaseSpec, Layer, RectElement, TextElement } from "@/document/types";
import type { SportId } from "./types";
import { BRAND_KEYS, boundText, withAccentFill } from "./common";

/**
 * Full-screen sports graphics (Phase 5.5, restyled in 5.6 to the operator's
 * reference language) — 1920×1080 boards built from skewed gloss bars, drop
 * shadows and per-element cascading choreography. Every dynamic field is a
 * real Binding into the sport's live data source with an authored fallback;
 * chrome panels bind to the Brand Kit; inserted layers are ordinary gfx2d
 * layers — fully editable, never locked templates.
 */

const W = 1920;
const H = 1080;
const SKEW = -14;
const SOFT_SHADOW = { color: "#000000", blur: 18, offsetX: 0, offsetY: 9, opacity: 0.5 };

function inSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.5, direction: "left", distance: 420, ease: "power3.out", fade: true, ...overrides };
}
function outSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.35, direction: "left", distance: 300, ease: "power2.in", fade: true, ...overrides };
}

/** Full-frame backdrop with a subtle depth gradient — fades in first,
 * semi-opaque so the virtual set stays faintly visible behind the board. */
function backdrop(): RectElement {
  return createRectElement({
    name: "Backdrop",
    transform: { x: 0, y: 0, width: W, height: H, rotation: 0 },
    fill: "#050510",
    gradient: { from: "#060614", mid: "#101a3d", to: "#04060f", direction: "diagonal" },
    opacity: 0.94,
    anim: {
      in: inSpec(0, { direction: "none", duration: 0.35 }),
      out: outSpec(0.2, { direction: "none", duration: 0.3 }),
    },
  });
}

/** Brand-bound skewed panel (flat fill + Brand Kit binding — the scorebug
 * convention — so the whole package re-themes from Data Sources). */
function brandPanel(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number,
  animIn: AnimPhaseSpec,
  animOut: AnimPhaseSpec,
): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill: "#0d1226",
    opacity,
    skewX: SKEW,
    shadow: { ...SOFT_SHADOW },
    bindings: [{ targetPath: "fill", source: BRAND_KEYS.panelBg, fallback: "#0d1226" }],
    anim: { in: animIn, out: animOut },
  });
}

function accentBar(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  animIn: AnimPhaseSpec,
  animOut: AnimPhaseSpec,
  gradient: { from: string; mid?: string; to: string } = { from: "#a87820", mid: "#f4d488", to: "#d9a441" },
): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill: gradient.from,
    gradient: { ...gradient, direction: "horizontal" },
    skewX: SKEW,
    anim: { in: animIn, out: animOut },
  });
}

function title(text: string, key: string | null, sport: SportId, y: number, fontSize: number, delay: number): TextElement {
  const el = boundText(
    "Title",
    { x: 0, y, width: W, height: fontSize * 1.4, rotation: 0 },
    key ? `${sport}.${key}` : "",
    text,
    {
      fontSize,
      uppercase: true,
      letterSpacing: 6,
      shadow: { color: "#000000", blur: 8, offsetX: 0, offsetY: 3, opacity: 0.6 },
      anim: {
        in: inSpec(delay, { direction: "top", distance: 60, ease: "back.out(1.4)" }),
        out: outSpec(0, { direction: "top", distance: 50 }),
      },
    },
  );
  return withAccentFill(el, "#d9a441");
}

function text(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  key: string,
  fallback: string,
  fontSize: number,
  delay: number,
  overrides: Partial<TextElement> = {},
): TextElement {
  return boundText(name, { x, y, width: w, height: h, rotation: 0 }, key, fallback, {
    fontSize,
    uppercase: true,
    anim: {
      in: inSpec(delay, { distance: 110 }),
      out: outSpec(0, { distance: 80 }),
    },
    ...overrides,
  });
}

function buildLayer(name: string, elements: (RectElement | TextElement)[]): Layer {
  const layer = createLayer("gfx2d", {
    // Envelope covers the longest element choreography.
    name,
    timeline: defaultTimeline({ inDuration: 1.4, outDuration: 0.8, inEase: "power3.out", outEase: "power2.in" }),
  });
  if (layer.props.kind === "gfx2d") layer.props.elements = elements;
  return layer;
}

// ---------------------------------------------------------------------------

export function createMatchupFullscreen(sport: SportId, label: string): Layer {
  return buildLayer(`${label} Matchup`, [
    backdrop(),
    accentBar("Top Accent", -20, 0, W + 40, 8, inSpec(0.1, { duration: 0.45, distance: 800, fade: false }), outSpec(0.1)),
    accentBar("Bottom Accent", -20, H - 8, W + 40, 8, inSpec(0.1, { direction: "right", duration: 0.45, distance: 800, fade: false }), outSpec(0.1, { direction: "right" })),
    title("MATCH DAY", "matchTitle", sport, 118, 54, 0.2),
    brandPanel("Home Panel", 90, 400, 780, 220, 0.94, inSpec(0.25, { distance: 700, fade: false }), outSpec(0.08)),
    brandPanel("Away Panel", 1070, 400, 780, 220, 0.94, inSpec(0.25, { direction: "right", distance: 700, fade: false }), outSpec(0.08, { direction: "right" })),
    accentBar("Home Stripe", 90, 620, 780, 8, inSpec(0.5, { duration: 0.4, distance: 400, fade: false }), outSpec(0), { from: "#12266e", mid: "#2a4ad0", to: "#0c1848" }),
    accentBar("Away Stripe", 1070, 620, 780, 8, inSpec(0.5, { direction: "right", duration: 0.4, distance: 400, fade: false }), outSpec(0, { direction: "right" }), { from: "#480c14", mid: "#c92a3e", to: "#6e1220" }),
    text("Home Team", 90, 458, 780, 110, `${sport}.homeTeam`, "HOME", 82, 0.45, { letterSpacing: 2 }),
    text("Away Team", 1070, 458, 780, 110, `${sport}.awayTeam`, "AWAY", 82, 0.45, {
      letterSpacing: 2,
      anim: { in: inSpec(0.45, { direction: "right", distance: 110 }), out: outSpec(0, { direction: "right", distance: 80 }) },
    }),
    withAccentFill(
      boundText("VS", { x: 860, y: 442, width: 200, height: 130, rotation: 0 }, "", "VS", {
        fontSize: 96,
        letterSpacing: 2,
        shadow: { color: "#000000", blur: 10, offsetX: 0, offsetY: 4, opacity: 0.6 },
        anim: {
          in: inSpec(0.62, { direction: "none", duration: 0.4, ease: "back.out(2)" }),
          out: outSpec(0, { direction: "none" }),
        },
      }),
      "#d9a441",
    ),
    text("Venue", 0, 862, W, 50, `${sport}.venue`, "", 32, 0.75, {
      fill: "#8898b8",
      fontStyle: "normal",
      uppercase: true,
      letterSpacing: 3,
    }),
  ]);
}

export function createLineupFullscreen(sport: SportId, label: string): Layer {
  const rows: (RectElement | TextElement)[] = [];
  for (let i = 1; i <= 6; i++) {
    const y = 320 + (i - 1) * 105;
    const delay = 0.3 + (i - 1) * 0.08;
    rows.push(
      brandPanel(`Row ${i}`, 360, y, 1200, 88, i % 2 === 0 ? 0.78 : 0.92, inSpec(delay, { distance: 520, fade: false }), outSpec(0.05 + (6 - i) * 0.04)),
    );
    rows.push(
      withAccentFill(
        boundText(`No ${i}`, { x: 400, y: y + 20, width: 90, height: 50, rotation: 0 }, "", String(i), {
          fontSize: 42,
          align: "left",
          anim: { in: inSpec(delay + 0.12, { distance: 60 }), out: outSpec(0, { distance: 40 }) },
        }),
        "#d9a441",
      ),
    );
    rows.push(
      text(`Player ${i}`, 530, y + 20, 990, 50, `${sport}.player${i}`, "—", 42, delay + 0.16, {
        align: "left",
        letterSpacing: 1,
      }),
    );
  }
  return buildLayer(`${label} Lineup`, [
    backdrop(),
    accentBar("Top Accent", -20, 0, W + 40, 8, inSpec(0.1, { duration: 0.45, distance: 800, fade: false }), outSpec(0.1)),
    brandPanel("Header", 360, 130, 1200, 130, 0.96, inSpec(0.18, { direction: "top", distance: 160 }), outSpec(0.1, { direction: "top", distance: 120 })),
    text("Team", 360, 152, 1200, 80, `${sport}.homeTeam`, "HOME", 62, 0.34, { letterSpacing: 3 }),
    title("STARTING LINEUP", null, sport, 268, 32, 0.4),
    ...rows,
  ]);
}

export function createStatBoardFullscreen(sport: SportId, label: string): Layer {
  const rows: (RectElement | TextElement)[] = [];
  for (let i = 1; i <= 4; i++) {
    const y = 380 + (i - 1) * 130;
    const delay = 0.35 + (i - 1) * 0.09;
    rows.push(
      brandPanel(`Stat Row ${i}`, 240, y, 1440, 108, i % 2 === 0 ? 0.78 : 0.92, inSpec(delay, { direction: i % 2 === 0 ? "right" : "left", distance: 560, fade: false }), outSpec(0.05 + (4 - i) * 0.05, { direction: i % 2 === 0 ? "right" : "left" })),
    );
    rows.push(
      text(`Stat ${i} Home`, 300, y + 28, 260, 56, `${sport}.stat${i}Home`, "0", 50, delay + 0.14, { align: "left" }),
    );
    rows.push(
      withAccentFill(
        boundText(`Stat ${i} Label`, { x: 560, y: y + 34, width: 800, height: 48, rotation: 0 }, `${sport}.stat${i}Label`, `STAT ${i}`, {
          fontSize: 34,
          uppercase: true,
          letterSpacing: 4,
          anim: { in: inSpec(delay + 0.18, { direction: "none", duration: 0.35 }), out: outSpec(0, { direction: "none" }) },
        }),
        "#d9a441",
      ),
    );
    rows.push(
      text(`Stat ${i} Away`, 1360, y + 28, 260, 56, `${sport}.stat${i}Away`, "0", 50, delay + 0.14, {
        align: "right",
        anim: { in: inSpec(delay + 0.14, { direction: "right", distance: 110 }), out: outSpec(0, { direction: "right", distance: 80 }) },
      }),
    );
  }
  return buildLayer(`${label} Stat Board`, [
    backdrop(),
    accentBar("Top Accent", -20, 0, W + 40, 8, inSpec(0.1, { duration: 0.45, distance: 800, fade: false }), outSpec(0.1)),
    title("MATCH STATS", null, sport, 128, 54, 0.2),
    text("Home Team", 240, 262, 640, 60, `${sport}.homeTeam`, "HOME", 42, 0.3, { align: "left", letterSpacing: 2 }),
    text("Away Team", 1040, 262, 640, 60, `${sport}.awayTeam`, "AWAY", 42, 0.3, {
      align: "right",
      letterSpacing: 2,
      anim: { in: inSpec(0.3, { direction: "right", distance: 110 }), out: outSpec(0, { direction: "right", distance: 80 }) },
    }),
    ...rows,
  ]);
}

export function createFinalScoreFullscreen(sport: SportId, label: string): Layer {
  return buildLayer(`${label} Final Score`, [
    backdrop(),
    accentBar("Top Accent", -20, 0, W + 40, 8, inSpec(0.1, { duration: 0.45, distance: 800, fade: false }), outSpec(0.1)),
    accentBar("Bottom Accent", -20, H - 8, W + 40, 8, inSpec(0.1, { direction: "right", duration: 0.45, distance: 800, fade: false }), outSpec(0.1, { direction: "right" })),
    title("FULL TIME", "matchTitle", sport, 128, 54, 0.2),
    brandPanel("Score Panel", 360, 340, 1200, 360, 0.94, inSpec(0.28, { direction: "bottom", distance: 220 }), outSpec(0.12, { direction: "bottom", distance: 180 })),
    text("Home Score", 420, 400, 460, 240, `${sport}.homeScore`, "0", 190, 0.5, {
      anim: { in: inSpec(0.5, { direction: "bottom", distance: 90 }), out: outSpec(0, { direction: "bottom", distance: 70 }) },
      shadow: { color: "#000000", blur: 12, offsetX: 0, offsetY: 5, opacity: 0.6 },
    }),
    withAccentFill(
      boundText("Divider", { x: 880, y: 430, width: 160, height: 180, rotation: 0 }, "", "–", {
        fontSize: 140,
        anim: { in: inSpec(0.6, { direction: "none", duration: 0.35 }), out: outSpec(0, { direction: "none" }) },
      }),
      "#d9a441",
    ),
    text("Away Score", 1040, 400, 460, 240, `${sport}.awayScore`, "0", 190, 0.5, {
      anim: { in: inSpec(0.55, { direction: "bottom", distance: 90 }), out: outSpec(0, { direction: "bottom", distance: 70 }) },
      shadow: { color: "#000000", blur: 12, offsetX: 0, offsetY: 5, opacity: 0.6 },
    }),
    text("Home Team", 360, 742, 560, 70, `${sport}.homeTeam`, "HOME", 48, 0.68, { letterSpacing: 2 }),
    text("Away Team", 1000, 742, 560, 70, `${sport}.awayTeam`, "AWAY", 48, 0.68, {
      anim: { in: inSpec(0.68, { direction: "right", distance: 110 }), out: outSpec(0, { direction: "right", distance: 80 }) },
      letterSpacing: 2,
    }),
    text("Venue", 0, 900, W, 46, `${sport}.venue`, "", 28, 0.8, {
      fill: "#8898b8",
      fontStyle: "normal",
      uppercase: true,
      letterSpacing: 3,
    }),
  ]);
}

export interface FullscreenTemplate {
  id: string;
  label: string;
  create: (sport: SportId, sportLabel: string) => Layer;
}

/** One entry per full-screen — the Templates panel renders these as cards. */
export const FULLSCREEN_TEMPLATES: FullscreenTemplate[] = [
  { id: "matchup", label: "Matchup", create: createMatchupFullscreen },
  { id: "lineup", label: "Starting Lineup", create: createLineupFullscreen },
  { id: "stats", label: "Stat Board", create: createStatBoardFullscreen },
  { id: "final", label: "Final Score", create: createFinalScoreFullscreen },
];
