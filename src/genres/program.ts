import type { Layer, RectElement, TextElement } from "@/document/types";
import { bar, label, inSpec, outSpec, gfxLayer } from "@/graphics/motionKit";
import { backdrop, panel, accent, fsTitle, fsText, fsLayer, fsIn, fsOut } from "./genreKit";

/**
 * Program / continuity pack (Phase 5.7) — Up Next strap + presenter
 * name-strap (lower thirds) + Coming Up rundown (full-screen). Sleek
 * purple/magenta promo palette, bound to the live `program.*` data source.
 */

const PURPLE = { from: "#1a0a33", mid: "#5a25b0", to: "#0f0620" } as const;
const MAGENTA = { from: "#8a0f52", mid: "#e84f9e", to: "#5a0a34" } as const;
const PLUM = { from: "#2a0f4a", mid: "#7a3ad0", to: "#180828" } as const;

function l3(name: string, els: (RectElement | TextElement)[]): Layer {
  return gfxLayer(name, els, { inDuration: 1.2, outDuration: 0.7 });
}

// ---------------------------------------------------------------------------
// Up Next strap — magenta "UP NEXT" tab + program name + start time.
// ---------------------------------------------------------------------------
export function createUpNextStrap(): Layer {
  return l3("Up Next Strap", [
    bar("Main Bar", 420, 810, 1150, 120, PURPLE, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Up Next Tab", 150, 796, 340, 148, MAGENTA, inSpec(0.12), outSpec(0.06)),
    bar("Time Tab", 1300, 828, 250, 84, PLUM, inSpec(0.4, { direction: "right", distance: 300, duration: 0.4, fade: true }), outSpec(0, { direction: "right", distance: 60 })),

    label("Up Next", 170, 836, 300, 70, "", "UP NEXT", 40, "#ffffff", inSpec(0.24, { distance: 60, fade: true }), outSpec(0, { distance: 40 }), { letterSpacing: 4 }),
    label("Program", 520, 838, 760, 66, "program.programName", "PROGRAM NAME", 52, "#ffffff", inSpec(0.28, { distance: 130, fade: true }), outSpec(0, { distance: 90 }), { align: "left", letterSpacing: 1 }),
    label("Start Time", 1310, 848, 230, 46, "program.startTime", "20:00", 40, "#f6c9e4", inSpec(0.5, { direction: "right", distance: 60, fade: true }), outSpec(0, { direction: "right", distance: 40 }), { letterSpacing: 2 }),
  ]);
}

// ---------------------------------------------------------------------------
// Presenter name-strap — name + role, classic identity lower third.
// ---------------------------------------------------------------------------
export function createPresenterStrap(): Layer {
  return l3("Presenter Name-Strap", [
    bar("Name Bar", 150, 812, 1000, 96, PURPLE, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Accent Tab", 130, 812, 40, 96, MAGENTA, inSpec(0.14, { distance: 120 }), outSpec(0.05)),
    bar("Role Strip", 190, 908, 720, 48, PLUM, inSpec(0.36, { duration: 0.4, distance: 420 }), outSpec(0.05)),

    label("Presenter", 210, 832, 900, 60, "program.presenter", "PRESENTER NAME", 48, "#ffffff", inSpec(0.26, { distance: 120, fade: true }), outSpec(0, { distance: 80 }), { align: "left", letterSpacing: 1 }),
    label("Role", 210, 916, 680, 34, "program.presenterRole", "HOST", 26, "#e2b8f4", inSpec(0.44, { distance: 90, fade: true }), outSpec(0, { distance: 60 }), { align: "left", letterSpacing: 3 }),
  ]);
}

// ---------------------------------------------------------------------------
// Coming Up rundown — full-screen list of what's next.
// ---------------------------------------------------------------------------
export function createComingUpRundown(): Layer {
  const rows: (RectElement | TextElement)[] = [];
  for (let i = 1; i <= 3; i++) {
    const y = 360 + (i - 1) * 190;
    const delay = 0.34 + (i - 1) * 0.12;
    rows.push(panel(`Row ${i} Panel`, 300, y, 1320, 150, "#1c0f38", i % 2 === 0 ? 0.82 : 0.94, fsIn(delay, { distance: 620, fade: false }), fsOut(0.06 + (3 - i) * 0.05)));
    rows.push(accent(`Row ${i} Cap`, 300, y, 14, 150, MAGENTA, fsIn(delay + 0.08, { direction: "top", distance: 160, fade: false }), fsOut(0)));
    rows.push(fsText(`Row ${i} Time`, 350, y + 44, 240, 64, `program.comingUp${i}Time`, "00:00", 52, "#e84f9e", delay + 0.14, { align: "left" }));
    rows.push(fsText(`Row ${i} Name`, 640, y + 46, 940, 60, `program.comingUp${i}`, "PROGRAM", 48, "#ffffff", delay + 0.18, { align: "left", letterSpacing: 1 }));
  }
  return fsLayer("Coming Up Rundown", [
    backdrop({ from: "#0d0620", mid: "#2a1152", to: "#080312" }),
    accent("Top Accent", -20, 0, 1960, 8, MAGENTA, fsIn(0.1, { duration: 0.45, distance: 900, fade: false }), fsOut(0.1)),
    fsTitle("COMING UP", "", 150, 60, "#ffffff", 0.2),
    ...rows,
  ]);
}
