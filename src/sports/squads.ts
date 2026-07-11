import { createRectElement, createGroupElement, createImageSlot } from "@/document/factory";
import type { AnimPhaseSpec, Element, Layer, RectElement, TextElement, GroupElement } from "@/document/types";
import { boundText, withAccentFill, BRAND_KEYS } from "./common";
import { bar, label, inSpec, outSpec, gfxLayer } from "@/graphics/motionKit";
import type { Gloss } from "@/graphics/motionKit";

/**
 * Squad / lineup broadcast graphics (soccer-style formation board + player
 * spotlight card). Modeled on fullscreens.ts / lowerThirds.ts: skewed gloss
 * bars, drop shadows, per-element cascading choreography, every dynamic
 * field a real Binding into the live `squad.<field>` source (merged into
 * dataSources.ts by the app) with an authored fallback. Chrome panels bind
 * to the Brand Kit so the package re-themes from Data Sources like every
 * other sport template. Inserted layers are ordinary editable gfx2d layers.
 */

// ---------------------------------------------------------------------------
// 1. Squad feed data schema.
// ---------------------------------------------------------------------------

const PLAYER_NAME_WORDS = [
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
] as const;

/** Raw field names for the `squad` data source (mounted as `squad.<key>` by
 * dataSources.ts) — team meta plus name/number for all 11 starters. */
export const SQUAD_KEYS: string[] = [
  "teamName",
  "formation",
  "coach",
  ...Array.from({ length: 11 }, (_, i) => i + 1).flatMap((n) => [`p${n}name`, `p${n}num`, `p${n}photo`]),
];

/** Live defaults for the `squad` source — a realistic placeholder XI. */
export const SQUAD_DEFAULTS: Record<string, string> = {
  teamName: "FC UNITED",
  formation: "4-3-3",
  coach: "A. MANAGER",
  ...Object.fromEntries(
    Array.from({ length: 11 }, (_, i) => i + 1).flatMap((n) => [
      [`p${n}name`, `PLAYER ${PLAYER_NAME_WORDS[n - 1]}`],
      [`p${n}num`, String(n)],
      [`p${n}photo`, `https://api.dicebear.com/9.x/personas/png?seed=squad-player-${n}&size=512&backgroundColor=243d63`],
    ]),
  ),
};

// ---------------------------------------------------------------------------
// 2. Formations — 11 normalized (0..1) positions on a vertical pitch,
//    GK at the bottom (index 0), attack at the top.
// ---------------------------------------------------------------------------

export interface Formation {
  id: string;
  label: string;
  positions: { x: number; y: number }[];
}

export const FORMATIONS: Formation[] = [
  {
    id: "4-3-3",
    label: "4-3-3",
    positions: [
      { x: 0.5, y: 0.92 }, // GK
      { x: 0.16, y: 0.72 },
      { x: 0.38, y: 0.76 },
      { x: 0.62, y: 0.76 },
      { x: 0.84, y: 0.72 }, // DF
      { x: 0.28, y: 0.48 },
      { x: 0.5, y: 0.44 },
      { x: 0.72, y: 0.48 }, // MF
      { x: 0.18, y: 0.2 },
      { x: 0.5, y: 0.14 },
      { x: 0.82, y: 0.2 }, // FW
    ],
  },
  {
    id: "4-4-2",
    label: "4-4-2",
    positions: [
      { x: 0.5, y: 0.92 }, // GK
      { x: 0.16, y: 0.72 },
      { x: 0.38, y: 0.76 },
      { x: 0.62, y: 0.76 },
      { x: 0.84, y: 0.72 }, // DF
      { x: 0.12, y: 0.48 },
      { x: 0.38, y: 0.44 },
      { x: 0.62, y: 0.44 },
      { x: 0.88, y: 0.48 }, // MF
      { x: 0.38, y: 0.16 },
      { x: 0.62, y: 0.16 }, // FW
    ],
  },
  {
    id: "3-5-2",
    label: "3-5-2",
    positions: [
      { x: 0.5, y: 0.92 }, // GK
      { x: 0.28, y: 0.76 },
      { x: 0.5, y: 0.8 },
      { x: 0.72, y: 0.76 }, // DF
      { x: 0.08, y: 0.5 },
      { x: 0.32, y: 0.46 },
      { x: 0.5, y: 0.42 },
      { x: 0.68, y: 0.46 },
      { x: 0.92, y: 0.5 }, // MF
      { x: 0.38, y: 0.16 },
      { x: 0.62, y: 0.16 }, // FW
    ],
  },
  {
    id: "4-2-3-1",
    label: "4-2-3-1",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.16, y: 0.72 },
      { x: 0.38, y: 0.76 },
      { x: 0.62, y: 0.76 },
      { x: 0.84, y: 0.72 },
      { x: 0.38, y: 0.56 },
      { x: 0.62, y: 0.56 },
      { x: 0.18, y: 0.34 },
      { x: 0.5, y: 0.3 },
      { x: 0.82, y: 0.34 },
      { x: 0.5, y: 0.14 },
    ],
  },
  {
    id: "3-4-3",
    label: "3-4-3",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.28, y: 0.76 },
      { x: 0.5, y: 0.8 },
      { x: 0.72, y: 0.76 },
      { x: 0.12, y: 0.5 },
      { x: 0.38, y: 0.46 },
      { x: 0.62, y: 0.46 },
      { x: 0.88, y: 0.5 },
      { x: 0.22, y: 0.18 },
      { x: 0.5, y: 0.12 },
      { x: 0.78, y: 0.18 },
    ],
  },
  {
    id: "5-3-2",
    label: "5-3-2",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.1, y: 0.74 },
      { x: 0.3, y: 0.78 },
      { x: 0.5, y: 0.8 },
      { x: 0.7, y: 0.78 },
      { x: 0.9, y: 0.74 },
      { x: 0.32, y: 0.48 },
      { x: 0.5, y: 0.44 },
      { x: 0.68, y: 0.48 },
      { x: 0.38, y: 0.16 },
      { x: 0.62, y: 0.16 },
    ],
  },
  {
    id: "4-1-4-1",
    label: "4-1-4-1",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.16, y: 0.72 },
      { x: 0.38, y: 0.76 },
      { x: 0.62, y: 0.76 },
      { x: 0.84, y: 0.72 },
      { x: 0.5, y: 0.58 },
      { x: 0.12, y: 0.4 },
      { x: 0.38, y: 0.36 },
      { x: 0.62, y: 0.36 },
      { x: 0.88, y: 0.4 },
      { x: 0.5, y: 0.14 },
    ],
  },
  {
    id: "4-5-1",
    label: "4-5-1",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.16, y: 0.72 },
      { x: 0.38, y: 0.76 },
      { x: 0.62, y: 0.76 },
      { x: 0.84, y: 0.72 },
      { x: 0.08, y: 0.46 },
      { x: 0.28, y: 0.42 },
      { x: 0.5, y: 0.4 },
      { x: 0.72, y: 0.42 },
      { x: 0.92, y: 0.46 },
      { x: 0.5, y: 0.14 },
    ],
  },
  {
    id: "3-4-2-1",
    label: "3-4-2-1",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.28, y: 0.76 },
      { x: 0.5, y: 0.8 },
      { x: 0.72, y: 0.76 },
      { x: 0.12, y: 0.5 },
      { x: 0.38, y: 0.46 },
      { x: 0.62, y: 0.46 },
      { x: 0.88, y: 0.5 },
      { x: 0.38, y: 0.26 },
      { x: 0.62, y: 0.26 },
      { x: 0.5, y: 0.12 },
    ],
  },
  {
    id: "4-3-2-1",
    label: "4-3-2-1",
    positions: [
      { x: 0.5, y: 0.92 },
      { x: 0.16, y: 0.72 },
      { x: 0.38, y: 0.76 },
      { x: 0.62, y: 0.76 },
      { x: 0.84, y: 0.72 },
      { x: 0.28, y: 0.48 },
      { x: 0.5, y: 0.44 },
      { x: 0.72, y: 0.48 },
      { x: 0.38, y: 0.24 },
      { x: 0.62, y: 0.24 },
      { x: 0.5, y: 0.12 },
    ],
  },
];

/** Resolve a formation id/label from data (e.g. squad.formation) to coordinates. */
export function resolveFormation(idOrLabel: string | undefined): Formation {
  const key = (idOrLabel ?? "4-3-3").trim().toLowerCase();
  return (
    FORMATIONS.find((f) => f.id.toLowerCase() === key || f.label.toLowerCase() === key) ?? FORMATIONS[0]
  );
}

/** AR floor-plan position for player slot index (0 = GK). */
export function formationSlotWorldPosition(
  slotIndex: number,
  formation: Formation,
): { x: number; z: number } {
  const pos = formation.positions[slotIndex];
  if (!pos) return { x: 0, z: -3 };
  return {
    x: (pos.x - 0.5) * 7,
    z: -1.5 - pos.y * 5,
  };
}

// ---------------------------------------------------------------------------
// 3. Formation board — full-screen 1920x1080 animated squad graphic.
// ---------------------------------------------------------------------------

const PITCH_X = 60;
const PITCH_Y = 60;
const PITCH_W = 1140;
const PITCH_H = 960;

const PANEL_X = 1260;
const PANEL_W = 620;

const MARKER_W = 150;
const MARKER_H = 112;
const CIRCLE = 78;
const TEAM_MARKER_FALLBACK = "#123a6e";

function popIn(delay: number, scaleFrom = 0.3): AnimPhaseSpec {
  return { delay, duration: 0.4, direction: "none", distance: 0, ease: "back.out(1.8)", fade: false, scaleFrom };
}
function popOut(scaleFrom = 0.4): AnimPhaseSpec {
  return { delay: 0, duration: 0.22, direction: "none", distance: 0, ease: "power2.in", fade: false, scaleFrom };
}
function fadeIn(delay: number, duration = 0.35): AnimPhaseSpec {
  return { delay, duration, direction: "none", distance: 0, ease: "power2.out", fade: true };
}
function fadeOut(duration = 0.22): AnimPhaseSpec {
  return { delay: 0, duration, direction: "none", distance: 0, ease: "power2.in", fade: true };
}

/** Dark-green vertical gradient pitch panel — wipes in first. */
function pitchPanel(): RectElement {
  return createRectElement({
    name: "Pitch",
    transform: { x: PITCH_X, y: PITCH_Y, width: PITCH_W, height: PITCH_H, rotation: 0 },
    fill: "#123a1e",
    gradient: { from: "#1f7a3c", mid: "#155229", to: "#08210f", direction: "vertical" },
    cornerRadius: 18,
    shadow: { color: "#000000", blur: 24, offsetX: 0, offsetY: 10, opacity: 0.5 },
    anim: {
      in: { delay: 0, duration: 0.55, direction: "top", distance: 140, ease: "power3.out", fade: false },
      out: { delay: 0.35, duration: 0.35, direction: "top", distance: 100, ease: "power2.in", fade: true },
    },
  });
}

/** A single white pitch marking — a plain filled strip, or (when
 * `strokeOnly`) a stroke-only outline for the boxes/center circle. */
function pitchLine(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  delay: number,
  opts: { strokeOnly?: boolean; cornerRadius?: number } = {},
): RectElement {
  const strokeOnly = opts.strokeOnly ?? false;
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill: strokeOnly ? "rgba(0,0,0,0)" : "#ffffff",
    stroke: strokeOnly ? "#ffffff" : undefined,
    strokeWidth: strokeOnly ? 3 : undefined,
    cornerRadius: opts.cornerRadius ?? 0,
    opacity: 0.6,
    anim: { in: fadeIn(delay), out: fadeOut() },
  });
}

function pitchLines(): RectElement[] {
  const boxW = 520;
  const boxH = 170;
  const boxX = PITCH_X + PITCH_W / 2 - boxW / 2;
  return [
    pitchLine("Touchline Top", PITCH_X + 20, PITCH_Y + 8, PITCH_W - 40, 3, 0.1),
    pitchLine("Touchline Bottom", PITCH_X + 20, PITCH_Y + PITCH_H - 11, PITCH_W - 40, 3, 0.1),
    pitchLine("Sideline Left", PITCH_X + 8, PITCH_Y + 20, 3, PITCH_H - 40, 0.1),
    pitchLine("Sideline Right", PITCH_X + PITCH_W - 11, PITCH_Y + 20, 3, PITCH_H - 40, 0.1),
    pitchLine("Halfway Line", PITCH_X + 20, PITCH_Y + PITCH_H / 2 - 1.5, PITCH_W - 40, 3, 0.16),
    pitchLine("Center Circle", PITCH_X + PITCH_W / 2 - 90, PITCH_Y + PITCH_H / 2 - 90, 180, 180, 0.2, {
      strokeOnly: true,
      cornerRadius: 90,
    }),
    pitchLine("Penalty Box Attacking", boxX, PITCH_Y + 8, boxW, boxH, 0.22, { strokeOnly: true, cornerRadius: 4 }),
    pitchLine("Penalty Box Defending", boxX, PITCH_Y + PITCH_H - 8 - boxH, boxW, boxH, 0.22, {
      strokeOnly: true,
      cornerRadius: 4,
    }),
  ];
}

/** One player marker: team-color circle (Brand Kit bound), shirt number,
 * and name below — a single GroupElement so the whole marker cascades in
 * as one unit while the circle still gets its own pop/scale. */
function playerMarker(n: number, pos: { x: number; y: number }, delay: number): GroupElement {
  const cx = PITCH_X + pos.x * PITCH_W;
  const cy = PITCH_Y + pos.y * PITCH_H;
  const gx = cx - MARKER_W / 2;
  const gy = cy - CIRCLE / 2;

  const circle = createRectElement({
    name: `P${n} Circle`,
    transform: { x: (MARKER_W - CIRCLE) / 2, y: 0, width: CIRCLE, height: CIRCLE, rotation: 0 },
    fill: TEAM_MARKER_FALLBACK,
    cornerRadius: CIRCLE / 2,
    stroke: "#ffffff",
    strokeWidth: 3,
    shadow: { color: "#000000", blur: 12, offsetX: 0, offsetY: 5, opacity: 0.5 },
    bindings: [{ targetPath: "fill", source: BRAND_KEYS.panelBg, fallback: TEAM_MARKER_FALLBACK }],
    anim: { in: popIn(delay), out: popOut() },
  });

  const number = boundText(
    `P${n} Number`,
    { x: (MARKER_W - CIRCLE) / 2, y: CIRCLE * 0.22, width: CIRCLE, height: CIRCLE * 0.6, rotation: 0 },
    `squad.p${n}num`,
    SQUAD_DEFAULTS[`p${n}num`],
    { fontSize: 32, fontStyle: "bold", anim: { in: fadeIn(delay + 0.04, 0.3), out: fadeOut(0.2) } },
  );

  const name = boundText(
    `P${n} Name`,
    { x: 0, y: CIRCLE + 8, width: MARKER_W, height: 26, rotation: 0 },
    `squad.p${n}name`,
    SQUAD_DEFAULTS[`p${n}name`],
    {
      fontSize: 15,
      uppercase: true,
      letterSpacing: 1,
      fill: "#f4f7ff",
      shadow: { color: "#000000", blur: 6, offsetX: 0, offsetY: 2, opacity: 0.6 },
      anim: { in: fadeIn(delay + 0.04, 0.3), out: fadeOut(0.2) },
    },
  );

  return createGroupElement({
    name: `Player ${n} Marker`,
    transform: { x: gx, y: gy, width: MARKER_W, height: MARKER_H, rotation: 0 },
    children: [circle, number, name],
    anim: { in: fadeIn(delay, 0.4), out: fadeOut(0.22) },
  });
}

/** Right-side title stack: team name, formation, coach — skewed gloss bars
 * sliding in from the right, motionKit's shared visual language. */
function titleStack(): (RectElement | TextElement)[] {
  const GRAPHITE: Gloss = { from: "#12141c", mid: "#252a3a", to: "#0a0c14" };
  const GOLD: Gloss = { from: "#a87820", mid: "#f4d488", to: "#d9a441" };

  return [
    bar(
      "Team Panel",
      PANEL_X,
      300,
      PANEL_W,
      190,
      GRAPHITE,
      inSpec(0.15, { direction: "right", duration: 0.5, distance: 480 }),
      outSpec(0.1, { direction: "right" }),
    ),
    bar(
      "Gold Sliver",
      PANEL_X,
      476,
      PANEL_W,
      8,
      GOLD,
      inSpec(0.38, { direction: "right", duration: 0.35, distance: 300, fade: false }),
      outSpec(0, { direction: "right" }),
    ),
    bar(
      "Formation Panel",
      PANEL_X,
      500,
      PANEL_W,
      90,
      GRAPHITE,
      inSpec(0.24, { direction: "right", duration: 0.45, distance: 420 }),
      outSpec(0.06, { direction: "right" }),
    ),
    bar(
      "Coach Panel",
      PANEL_X,
      606,
      PANEL_W,
      74,
      GRAPHITE,
      inSpec(0.32, { direction: "right", duration: 0.45, distance: 380 }),
      outSpec(0.02, { direction: "right" }),
    ),

    label(
      "Team Name",
      PANEL_X + 40,
      330,
      PANEL_W - 80,
      130,
      "squad.teamName",
      SQUAD_DEFAULTS.teamName,
      58,
      "#ffffff",
      inSpec(0.3, { direction: "right", distance: 90, fade: true }),
      outSpec(0, { direction: "right", distance: 70 }),
      { align: "left", letterSpacing: 1 },
    ),
    withAccentFill(
      label(
        "Formation",
        PANEL_X + 40,
        522,
        PANEL_W - 80,
        50,
        "squad.formation",
        SQUAD_DEFAULTS.formation,
        40,
        "#d9a441",
        inSpec(0.42, { direction: "right", distance: 70, fade: true }),
        outSpec(0, { direction: "right", distance: 50 }),
        { align: "left", letterSpacing: 2 },
      ),
      "#d9a441",
    ),
    label(
      "Coach",
      PANEL_X + 40,
      624,
      PANEL_W - 80,
      40,
      "squad.coach",
      SQUAD_DEFAULTS.coach,
      26,
      "#c7cede",
      inSpec(0.5, { direction: "right", distance: 60, fade: true }),
      outSpec(0, { direction: "right", distance: 40 }),
      { align: "left", letterSpacing: 1 },
    ),
  ];
}

/** Full-screen animated formation board — pitch + 11 player markers (team
 * circle, number, name) laid out per the chosen formation, plus a title
 * stack (team / formation / coach) on the right. */
export function createFormationBoard(formationId?: string): Layer {
  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0];
  const markers = formation.positions.map((pos, i) => playerMarker(i + 1, pos, 0.35 + i * 0.08));
  const elements: Element[] = [pitchPanel(), ...pitchLines(), ...markers, ...titleStack()];
  return gfxLayer(`${formation.label} Squad Board`, elements, { inDuration: 1.75, outDuration: 0.9 });
}

// ---------------------------------------------------------------------------
// 4. Player spotlight card — compact lower-third (~700x320).
// ---------------------------------------------------------------------------

/** Lower-third player spotlight: headshot slot, big shirt number, player
 * name, team kicker — skewed gloss bars, staggered choreography. */
export function createPlayerCard(): Layer {
  const GRAPHITE: Gloss = { from: "#12141c", mid: "#252a3a", to: "#0a0c14" };
  const GOLD: Gloss = { from: "#a87820", mid: "#f4d488", to: "#d9a441" };

  const elements: Element[] = [
    bar("Main Bar", 60, 730, 700, 250, GRAPHITE, inSpec(0, { duration: 0.5, distance: 420 }), outSpec(0.12, { direction: "right" })),
    bar(
      "Kicker Tab",
      60,
      680,
      260,
      46,
      GOLD,
      inSpec(0.16, { direction: "top", distance: 70, duration: 0.35, ease: "back.out(1.6)", fade: true }),
      outSpec(0, { direction: "top", distance: 50 }),
    ),
    bar("Gold Sliver", 290, 900, 430, 8, GOLD, inSpec(0.4, { duration: 0.3, distance: 260, fade: false }), outSpec(0)),

    createImageSlot(
      "Headshot",
      { x: 80, y: 748, width: 190, height: 210 },
      { anim: { in: inSpec(0.08, { duration: 0.4, distance: 320 }), out: outSpec(0.1) } },
    ),

    label(
      "Team Kicker",
      82,
      692,
      220,
      26,
      "squad.teamName",
      SQUAD_DEFAULTS.teamName,
      19,
      "#0c1020",
      inSpec(0.24, { direction: "top", distance: 40, duration: 0.3, fade: true }),
      outSpec(0, { direction: "top", distance: 30 }),
      { letterSpacing: 2 },
    ),

    withAccentFill(
      label(
        "Number",
        290,
        752,
        170,
        150,
        "squad.p1num",
        SQUAD_DEFAULTS.p1num,
        100,
        "#d9a441",
        inSpec(0.3, { distance: 60, fade: true }),
        outSpec(0, { distance: 40 }),
        {},
      ),
      "#d9a441",
    ),

    label(
      "Player Name",
      470,
      798,
      260,
      60,
      "squad.p1name",
      SQUAD_DEFAULTS.p1name,
      34,
      "#ffffff",
      inSpec(0.36, { distance: 90, fade: true }),
      outSpec(0, { distance: 60 }),
      { align: "left", letterSpacing: 1 },
    ),
  ];

  return gfxLayer("Player Spotlight Card", elements, { inDuration: 0.95, outDuration: 0.55 });
}

// Frame constant kept for reference/consistency with the fullscreen 1920x1080
// canvas convention every other sports template builds against.
export const SQUAD_BOARD_SIZE = { width: 1920, height: 1080 };
