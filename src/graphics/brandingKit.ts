import { createImageSlot } from "@/document/factory";
import { boundText } from "@/sports/common";
import { bar, label, inSpec, outSpec, gfxLayer, type Gloss } from "./motionKit";
import { backdrop, accent, fsText, fsLayer, fsIn, fsOut, FS_W } from "@/genres/genreKit";
import type { Element, Layer, TextElement } from "@/document/types";

/**
 * Branding + show-elements pack (Phase 5.11) — Sponsor Bug, Logo Bug,
 * Countdown and Quote Card, the four templates missing from the operator's
 * requested library after everything else (lower thirds, scoreboards,
 * fullscreens, ticker, genre packs) was confirmed to already exist. Built
 * from the same skewed-gloss toolkit as the rest of the package, plus the
 * new Phase 5.11 animation primitives: `scaleFrom` (pop-in) and `loop`
 * (continuous idle pulse) — see timelineEngine.ts.
 */

const NAVY: Gloss = { from: "#0a1230", mid: "#1e2a5e", to: "#050815" };
const GOLD: Gloss = { from: "#a87820", mid: "#f4d488", to: "#d9a441" };
const GOLD_TEXT = "#f0d493";

/** Pop-in: starts small (scaleFrom) with a bouncy overshoot ease, unlike the
 * slide-based `inSpec` everywhere else — distinguishes "branding" elements
 * (logos, bugs) from editorial content bars. */
function popIn(delay: number, scaleFrom = 0.4) {
  return inSpec(delay, { direction: "none", distance: 0, duration: 0.45, ease: "back.out(1.8)", fade: true, scaleFrom });
}
function popOut(delay: number) {
  return outSpec(delay, { direction: "none", distance: 0, duration: 0.3, ease: "power2.in", fade: true });
}

// ---------------------------------------------------------------------------
// Sponsor Bug — bottom-left, logo slot + "SPONSORED BY" label, gentle pulse.
// ---------------------------------------------------------------------------
export function createSponsorBug(): Layer {
  const x = 60;
  const y = 900;
  const w = 420;
  const h = 130;
  const els: Element[] = [
    bar("Sponsor Panel", x, y, w, h, NAVY, popIn(0), popOut(0.1), {
      anim: { in: popIn(0), out: popOut(0.1), loop: { periodSec: 3.5, opacityTo: 0.85 } },
    }),
    createImageSlot("Sponsor Logo", { x: x + 150, y: y + 14, width: 250, height: 102 }, {
      anim: { in: popIn(0.12), out: popOut(0.05) },
    }),
    boundText("Sponsored By", { x: x + 18, y: y + 46, width: 120, height: 44, rotation: 0 }, "", "SPONSORED\nBY", {
      fontSize: 16,
      fill: GOLD_TEXT,
      align: "left",
      letterSpacing: 1.5,
      anim: { in: popIn(0.06, 0.7), out: popOut(0) },
    }),
  ];
  return gfxLayer("Sponsor Bug", els, { inDuration: 0.7, outDuration: 0.5 });
}

// ---------------------------------------------------------------------------
// Logo Bug — small persistent corner mark, top-right, minimal chrome.
// ---------------------------------------------------------------------------
export function createLogoBug(): Layer {
  const s = 130;
  const x = FS_W - s - 50;
  const y = 50;
  const els: Element[] = [
    bar("Logo Backing", x, y, s, s, NAVY, popIn(0, 0.5), popOut(0.1), {
      cornerRadius: s / 2,
      skewX: 0,
      anim: { in: popIn(0, 0.5), out: popOut(0.1), loop: { periodSec: 4, scaleTo: 1.04 } },
    }),
    createImageSlot("Logo", { x: x + 15, y: y + 15, width: s - 30, height: s - 30 }, {
      anim: { in: popIn(0.1, 0.5), out: popOut(0.05) },
    }),
  ];
  return gfxLayer("Logo Bug", els, { inDuration: 0.6, outDuration: 0.4 });
}

// ---------------------------------------------------------------------------
// Countdown — bound to the live `countdown.*` source (see dataSources.ts).
// ---------------------------------------------------------------------------
export function createCountdown(): Layer {
  const x = 660;
  const y = 880;
  const w = 600;
  const h = 150;
  const els: Element[] = [
    bar("Countdown Panel", x, y, w, h, NAVY, popIn(0), popOut(0.08), {
      anim: { in: popIn(0), out: popOut(0.08) },
    }),
    bar("Gold Sliver", x, y - 8, w, 8, GOLD, popIn(0.15, 0.9), popOut(0), {}),
    label("Countdown Label", x, y + 24, w, 32, "countdown.label", "KICKOFF", 24, GOLD_TEXT, popIn(0.18, 0.85), popOut(0.02), {
      letterSpacing: 4,
    }),
    label("Countdown Remaining", x, y + 56, w, 80, "countdown.remaining", "--:--", 68, "#ffffff", popIn(0.1, 0.6), popOut(0), {
      letterSpacing: 2,
    }),
  ];
  return gfxLayer("Countdown", els, { inDuration: 0.65, outDuration: 0.45 });
}

// ---------------------------------------------------------------------------
// Quote Card — fullscreen, bound to the `quote.*` source.
// ---------------------------------------------------------------------------
function quoteMark(x: number, y: number, flip: boolean, delay: number): TextElement {
  return boundText("Quote Mark", { x, y, width: 140, height: 140, rotation: flip ? 180 : 0 }, "", "“", {
    fontSize: 160,
    fill: GOLD_TEXT,
    align: "left",
    fontStyle: "bold",
    anim: { in: fsIn(delay, { direction: "none", duration: 0.5, fade: true }), out: fsOut(0, { direction: "none" }) },
  });
}

export function createQuoteCard(): Layer {
  return fsLayer("Quote Card", [
    backdrop({ from: "#0a0e1c", mid: "#161c34", to: "#05070f" }, 0.96),
    accent("Top Accent", -20, 0, FS_W + 40, 8, GOLD, fsIn(0.1, { duration: 0.45, distance: 900, fade: false }), fsOut(0.1)),
    quoteMark(240, 260, false, 0.2),
    boundText("Quote Text", { x: 300, y: 400, width: 1320, height: 380, rotation: 0 }, "quote.text", "Great things are done by a series of small things brought together.", {
      fontSize: 54,
      fill: "#ffffff",
      align: "center",
      uppercase: false,
      fontStyle: "italic",
      shadow: { color: "#000000", blur: 10, offsetX: 0, offsetY: 4, opacity: 0.55 },
      anim: { in: fsIn(0.32, { direction: "none", duration: 0.7, distance: 40 }), out: fsOut(0.05, { direction: "none" }) },
    }),
    accent("Divider", 860, 800, 200, 6, GOLD, fsIn(0.6, { duration: 0.4, distance: 300, fade: false }), fsOut(0)),
    fsText("Author", 0, 840, FS_W, 60, "quote.author", "AUTHOR NAME", 34, GOLD_TEXT, 0.68, { letterSpacing: 4 }),
    fsText("Role", 0, 900, FS_W, 40, "quote.role", "", 22, "#8898b8", 0.75, { letterSpacing: 3, fontStyle: "normal" }),
  ]);
}

export interface BrandingTemplate {
  id: string;
  label: string;
  note: string;
  create: () => Layer;
}

export const BRANDING_TEMPLATES: BrandingTemplate[] = [
  { id: "branding-sponsor-bug", label: "Sponsor Bug", note: "lower-third · logo slot", create: createSponsorBug },
  { id: "branding-logo-bug", label: "Logo Bug", note: "corner mark · pulsing", create: createLogoBug },
  { id: "branding-countdown", label: "Countdown", note: "live · bound to Data Sources", create: createCountdown },
  { id: "branding-quote-card", label: "Quote Card", note: "full-screen · animated", create: createQuoteCard },
];
