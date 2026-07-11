import type { Layer, RectElement, TextElement } from "@/document/types";
import { bar, label, inSpec, outSpec, gfxLayer } from "@/graphics/motionKit";
import { backdrop, accent, fsText, fsLayer, fsIn, fsOut } from "./genreKit";
import { boundText } from "@/sports/common";

/**
 * Faith / Events pack (Phase 5.7) — scripture board (full-screen) + speaker
 * strap + worship "now playing" strap (lower thirds). Warm plum/gold/cream
 * palette, bound to the live `event.*` data source. The scripture board sets
 * the verse in mixed case (prose, not uppercase) — unlike the shouty kicker
 * convention everywhere else.
 */

const PLUM = { from: "#1a0f28", mid: "#4a2a6a", to: "#0f0818" } as const;
const GOLD = { from: "#a87820", mid: "#f4d488", to: "#d9a441" } as const;
const GOLD_TEXT = "#f0d493";
const CREAM = "#f5ecd8";

function l3(name: string, els: (RectElement | TextElement)[]): Layer {
  return gfxLayer(name, els, { inDuration: 1.2, outDuration: 0.7 });
}

// ---------------------------------------------------------------------------
// Scripture board — full-screen centered verse + reference.
// ---------------------------------------------------------------------------
export function createScriptureBoard(): Layer {
  return fsLayer("Scripture Board", [
    backdrop({ from: "#0f0818", mid: "#241338", to: "#080410" }, 0.96),
    accent("Top Accent", -20, 0, 1960, 8, GOLD, fsIn(0.1, { duration: 0.45, distance: 900, fade: false }), fsOut(0.1)),
    accent("Bottom Accent", -20, 1072, 1960, 8, GOLD, fsIn(0.1, { direction: "right", duration: 0.45, distance: 900, fade: false }), fsOut(0.1, { direction: "right" })),

    // The verse itself — large, mixed-case prose, centered, gently faded in.
    boundText("Verse", { x: 260, y: 360, width: 1400, height: 340, rotation: 0 }, "event.verseText", "For God so loved the world, that he gave his only begotten Son", {
      fontSize: 62,
      fill: CREAM,
      align: "center",
      uppercase: false,
      fontStyle: "italic",
      shadow: { color: "#000000", blur: 10, offsetX: 0, offsetY: 4, opacity: 0.55 },
      anim: { in: fsIn(0.3, { direction: "none", duration: 0.7, distance: 40 }), out: fsOut(0.05, { direction: "none" }) },
    }),
    accent("Divider", 860, 760, 200, 6, GOLD, fsIn(0.55, { duration: 0.4, distance: 300, fade: false }), fsOut(0)),
    fsText("Reference", 0, 800, 1920, 70, "event.verseRef", "JOHN 3:16", 46, GOLD_TEXT, 0.62, { letterSpacing: 6 }),
  ]);
}

// ---------------------------------------------------------------------------
// Speaker strap — name + role identity lower third.
// ---------------------------------------------------------------------------
export function createSpeakerStrap(): Layer {
  return l3("Speaker Strap", [
    bar("Name Bar", 150, 812, 1040, 96, PLUM, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Gold Tab", 130, 812, 44, 96, GOLD, inSpec(0.14, { distance: 120 }), outSpec(0.05)),
    bar("Role Strip", 190, 908, 760, 48, { from: "#12091f", mid: "#2a1840", to: "#0c0616" }, inSpec(0.36, { duration: 0.4, distance: 420 }), outSpec(0.05)),

    label("Speaker", 210, 832, 940, 60, "event.speaker", "SPEAKER NAME", 48, CREAM, inSpec(0.26, { distance: 120, fade: true }), outSpec(0, { distance: 80 }), { align: "left", letterSpacing: 1 }),
    label("Role", 210, 916, 720, 34, "event.speakerRole", "SENIOR PASTOR", 26, "#e6c98a", inSpec(0.44, { distance: 90, fade: true }), outSpec(0, { distance: 60 }), { align: "left", letterSpacing: 3 }),
  ]);
}

// ---------------------------------------------------------------------------
// Worship strap — "now playing" song title + writer.
// ---------------------------------------------------------------------------
export function createWorshipStrap(): Layer {
  return l3("Worship Now-Playing", [
    bar("Main Bar", 420, 812, 1150, 116, PLUM, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Now Playing Tab", 150, 798, 340, 144, GOLD, inSpec(0.12), outSpec(0.06)),

    label("Now Playing", 170, 838, 300, 66, "", "NOW\nSINGING", 30, "#241338", inSpec(0.24, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 2, align: "left" }),
    label("Song", 520, 838, 1010, 60, "event.songTitle", "AMAZING GRACE", 50, CREAM, inSpec(0.28, { distance: 130, fade: true }), outSpec(0, { distance: 90 }), { align: "left", letterSpacing: 1 }),
    label("Writer", 520, 902, 1010, 34, "event.songWriter", "JOHN NEWTON", 26, "#e6c98a", inSpec(0.42, { distance: 100, fade: true }), outSpec(0, { distance: 70 }), { align: "left", letterSpacing: 2, uppercase: false, fontStyle: "normal" }),
  ]);
}
