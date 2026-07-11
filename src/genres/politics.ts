import type { Layer, RectElement, TextElement } from "@/document/types";
import { bar, label, inSpec, outSpec, gfxLayer } from "@/graphics/motionKit";
import { backdrop, panel, accent, fsTitle, fsText, fsLayer, fsIn, fsOut } from "./genreKit";

/**
 * Politics pack (Phase 5.7) — election strap (lower third) + results board
 * (full-screen). Authoritative deep blue/red/white palette, bound to the
 * live `politics.*` data source (raceTitle, reporting, candidate1/party1/
 * votes1/pct1, candidate2/party2/votes2/pct2 — see
 * src/document/dataSources.ts). Same skewed-gloss language and per-element
 * choreography as the rest of the genre pack (genreKit.ts / motionKit.ts).
 */

const NAVY = { from: "#0a1533", mid: "#1a3f96", to: "#050b1f" } as const;
const RED = { from: "#7a1020", mid: "#d0263c", to: "#4a0a14" } as const;
const BLUE_PANEL = { from: "#12266e", mid: "#2a4ad0", to: "#0c1848" } as const;
const RED_PANEL = { from: "#6e1220", mid: "#c92a3e", to: "#480c14" } as const;

function l3(name: string, els: (RectElement | TextElement)[]): Layer {
  return gfxLayer(name, els, { inDuration: 1.2, outDuration: 0.7 });
}

// ---------------------------------------------------------------------------
// Election Strap — race title kicker, candidate1+party1+pct1 on a blue
// panel vs candidate2+party2+pct2 on a red panel, reporting tag.
// ---------------------------------------------------------------------------
export function createElectionStrap(): Layer {
  return l3("Election Strap", [
    bar("Title Bar", 160, 792, 1600, 66, NAVY, inSpec(0, { duration: 0.5, distance: 1000 }), outSpec(0.12, { direction: "right" })),
    bar("Reporting Tab", 1360, 780, 420, 46, RED, inSpec(0.3, { direction: "top", distance: 80, duration: 0.35, ease: "back.out(1.6)", fade: true }), outSpec(0, { direction: "top", distance: 70 })),
    bar("Cand1 Panel", 160, 864, 790, 120, BLUE_PANEL, inSpec(0.14, { duration: 0.5, distance: 900 }), outSpec(0.06)),
    bar("Cand2 Panel", 970, 864, 790, 120, RED_PANEL, inSpec(0.14, { direction: "right", duration: 0.5, distance: 900 }), outSpec(0.06, { direction: "right" })),

    label("Race Title", 190, 806, 1100, 44, "politics.raceTitle", "ELECTION RESULTS", 36, "#ffffff", inSpec(0.22, { distance: 80, fade: true }), outSpec(0, { distance: 60 }), { align: "left", letterSpacing: 2 }),
    label("Reporting", 1370, 790, 400, 30, "politics.reporting", "0% REPORTING", 22, "#ffffff", inSpec(0.42, { direction: "top", distance: 40, duration: 0.3, fade: true }), outSpec(0, { direction: "top", distance: 40 }), { letterSpacing: 2 }),

    label("Cand1", 190, 878, 520, 48, "politics.candidate1", "CANDIDATE A", 40, "#ffffff", inSpec(0.3, { distance: 90, fade: true }), outSpec(0, { distance: 60 }), { align: "left", letterSpacing: 1 }),
    label("Party1", 190, 928, 320, 30, "politics.party1", "PARTY A", 20, "#cdd8f4", inSpec(0.36, { distance: 70, fade: true }), outSpec(0, { distance: 50 }), { align: "left", letterSpacing: 2 }),
    label("Pct1", 710, 884, 220, 70, "politics.pct1", "0%", 58, "#ffffff", inSpec(0.32, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { align: "right" }),

    label("Cand2", 1000, 878, 520, 48, "politics.candidate2", "CANDIDATE B", 40, "#ffffff", inSpec(0.3, { direction: "right", distance: 90, fade: true }), outSpec(0, { direction: "right", distance: 60 }), { align: "left", letterSpacing: 1 }),
    label("Party2", 1000, 928, 320, 30, "politics.party2", "PARTY B", 20, "#f4cdd4", inSpec(0.36, { direction: "right", distance: 70, fade: true }), outSpec(0, { direction: "right", distance: 50 }), { align: "left", letterSpacing: 2 }),
    label("Pct2", 1520, 884, 220, 70, "politics.pct2", "0%", 58, "#ffffff", inSpec(0.32, { direction: "right", distance: 60, fade: true }), outSpec(0, { direction: "right", distance: 40 }), { align: "right" }),
  ]);
}

// ---------------------------------------------------------------------------
// Results Board — full-screen two-candidate result with party panels, big
// pct numbers, votes below, reporting line.
// ---------------------------------------------------------------------------
export function createResultsBoard(): Layer {
  return fsLayer("Election Results Board", [
    backdrop({ from: "#04081a", mid: "#0e1c44", to: "#03060f" }),
    accent("Top Accent", -20, 0, 1960, 8, RED, fsIn(0.1, { duration: 0.45, distance: 900, fade: false }), fsOut(0.1)),
    fsTitle("ELECTION RESULTS", "politics.raceTitle", 110, 56, "#ffffff", 0.2),
    fsText("Reporting", 0, 190, 1920, 40, "politics.reporting", "0% REPORTING", 30, "#8fa6d8", 0.32, { letterSpacing: 4, fontStyle: "normal" }),

    panel("Cand1 Panel", 120, 330, 780, 470, "#12266e", 0.95, fsIn(0.28, { distance: 700, fade: false }), fsOut(0.08)),
    accent("Cand1 Stripe", 120, 800, 780, 10, BLUE_PANEL, fsIn(0.5, { duration: 0.4, distance: 400, fade: false }), fsOut(0)),
    fsText("Cand1", 150, 380, 720, 90, "politics.candidate1", "CANDIDATE A", 66, "#ffffff", 0.42, { align: "left", letterSpacing: 1 }),
    fsText("Party1", 150, 476, 720, 44, "politics.party1", "PARTY A", 30, "#aebff0", 0.5, { align: "left", letterSpacing: 3, fontStyle: "normal" }),
    fsText("Pct1", 150, 560, 720, 180, "politics.pct1", "0%", 150, "#ffffff", 0.58, { align: "left" }),
    fsText("Votes1", 150, 740, 720, 44, "politics.votes1", "0 VOTES", 30, "#8fa6d8", 0.66, { align: "left", letterSpacing: 2, fontStyle: "normal" }),

    panel("Cand2 Panel", 1020, 330, 780, 470, "#6e1220", 0.95, fsIn(0.28, { direction: "right", distance: 700, fade: false }), fsOut(0.08, { direction: "right" })),
    accent("Cand2 Stripe", 1020, 800, 780, 10, RED_PANEL, fsIn(0.5, { direction: "right", duration: 0.4, distance: 400, fade: false }), fsOut(0, { direction: "right" })),
    fsText("Cand2", 1050, 380, 720, 90, "politics.candidate2", "CANDIDATE B", 66, "#ffffff", 0.46, { align: "left", letterSpacing: 1, anim: { in: fsIn(0.46, { direction: "right", distance: 110 }), out: fsOut(0, { direction: "right", distance: 80 }) } }),
    fsText("Party2", 1050, 476, 720, 44, "politics.party2", "PARTY B", 30, "#f0aeb9", 0.54, { align: "left", letterSpacing: 3, fontStyle: "normal", anim: { in: fsIn(0.54, { direction: "right", distance: 90 }), out: fsOut(0, { direction: "right", distance: 60 }) } }),
    fsText("Pct2", 1050, 560, 720, 180, "politics.pct2", "0%", 150, "#ffffff", 0.62, { align: "left", anim: { in: fsIn(0.62, { direction: "right", distance: 90 }), out: fsOut(0, { direction: "right", distance: 70 }) } }),
    fsText("Votes2", 1050, 740, 720, 44, "politics.votes2", "0 VOTES", 30, "#d8929e", 0.7, { align: "left", letterSpacing: 2, fontStyle: "normal", anim: { in: fsIn(0.7, { direction: "right", distance: 80 }), out: fsOut(0, { direction: "right", distance: 60 }) } }),
    fsText("Reporting Line", 0, 900, 1920, 46, "politics.reporting", "0% REPORTING", 26, "#8898b8", 0.8, { align: "center", letterSpacing: 3, fontStyle: "normal" }),
  ]);
}
