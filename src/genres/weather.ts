import type { Layer, RectElement, TextElement } from "@/document/types";
import { bar, label, inSpec, outSpec, gfxLayer } from "@/graphics/motionKit";
import { backdrop, panel, accent, fsTitle, fsText, fsLayer, fsIn, fsOut } from "./genreKit";

/**
 * Weather pack (Phase 5.7) — conditions strap (lower third) + 5-day forecast
 * board (full-screen). Cool teal/blue palette with a warm sun accent, bound
 * to the live `weather.*` data source. Forecast rows cascade in like the
 * sports lineup board.
 */

const TEAL = { from: "#082433", mid: "#11a0d4", to: "#051824" } as const;
const DEEP = { from: "#06202e", mid: "#0d5f88", to: "#041420" } as const;
const WARM = { from: "#d9821f", mid: "#ffd27a", to: "#c46a12" } as const;

function l3(name: string, els: (RectElement | TextElement)[]): Layer {
  return gfxLayer(name, els, { inDuration: 1.2, outDuration: 0.7 });
}

// ---------------------------------------------------------------------------
// Conditions strap — current conditions lower third.
// ---------------------------------------------------------------------------
export function createConditionsStrap(): Layer {
  return l3("Weather Conditions", [
    bar("Main Bar", 420, 806, 1150, 132, TEAL, inSpec(0, { duration: 0.5, distance: 900 }), outSpec(0.12, { direction: "right" })),
    bar("Temp Tab", 150, 792, 300, 160, DEEP, inSpec(0.12), outSpec(0.06)),
    bar("Warm Sliver", 470, 792, 260, 12, WARM, inSpec(0.35, { duration: 0.35, distance: 260 }), outSpec(0)),
    bar("Sub Strip", 545, 914, 1025, 50, DEEP, inSpec(0.4, { duration: 0.4, distance: 520 }), outSpec(0.05)),

    label("Temp", 150, 828, 300, 96, "weather.temp", "24°", 78, "#ffffff", inSpec(0.24, { distance: 60, fade: true }), outSpec(0, { distance: 40 })),
    label("Location", 500, 824, 1040, 58, "weather.location", "CITY NAME", 50, "#ffffff", inSpec(0.26, { distance: 130, fade: true }), outSpec(0, { distance: 90 }), { align: "left", letterSpacing: 1 }),
    label("Condition", 500, 888, 1040, 36, "weather.condition", "PARTLY CLOUDY", 28, "#a9e2f4", inSpec(0.4, { distance: 100, fade: true }), outSpec(0, { distance: 70 }), { align: "left", letterSpacing: 2 }),
    label("High", 560, 922, 200, 34, "weather.high", "28°", 26, "#ffffff", inSpec(0.5, { distance: 80, fade: true }), outSpec(0, { distance: 50 }), { align: "left", letterSpacing: 2 }),
    label("Low", 700, 922, 200, 34, "weather.low", "17°", 26, "#cfeaf6", inSpec(0.54, { distance: 70, fade: true }), outSpec(0, { distance: 50 }), { align: "left", letterSpacing: 2 }),
    label("Wind", 980, 922, 260, 34, "weather.wind", "12 KM/H", 24, "#cfeaf6", inSpec(0.58, { distance: 70, fade: true }), outSpec(0, { distance: 50 }), { align: "left", letterSpacing: 2 }),
    label("Humidity", 1280, 922, 260, 34, "weather.humidity", "58%", 24, "#cfeaf6", inSpec(0.62, { distance: 70, fade: true }), outSpec(0, { distance: 50 }), { align: "left", letterSpacing: 2 }),
  ]);
}

// ---------------------------------------------------------------------------
// 5-day forecast board — full-screen 5-column outlook.
// ---------------------------------------------------------------------------
export function createForecastBoard(): Layer {
  const cols: (RectElement | TextElement)[] = [];
  const colW = 320;
  const gap = 20;
  const totalW = 5 * colW + 4 * gap;
  const startX = (1920 - totalW) / 2;
  for (let i = 1; i <= 5; i++) {
    const x = startX + (i - 1) * (colW + gap);
    const delay = 0.35 + (i - 1) * 0.09;
    cols.push(panel(`Day ${i} Panel`, x, 360, colW, 480, "#0a3346", 0.92, fsIn(delay, { direction: "bottom", distance: 260 }), fsOut(0.05 + (5 - i) * 0.04, { direction: "bottom" })));
    cols.push(accent(`Day ${i} Cap`, x, 360, colW, 10, WARM, fsIn(delay + 0.1, { duration: 0.35, distance: 200, fade: false }), fsOut(0)));
    cols.push(fsText(`Day ${i} Name`, x, 400, colW, 50, `weather.day${i}Name`, "DAY", 38, "#a9e2f4", delay + 0.12, { letterSpacing: 4 }));
    cols.push(fsText(`Day ${i} Temp`, x, 520, colW, 130, `weather.day${i}Temp`, "0°", 110, "#ffffff", delay + 0.16));
    cols.push(fsText(`Day ${i} Cond`, x, 720, colW, 44, `weather.day${i}Cond`, "—", 26, "#cfeaf6", delay + 0.2, { letterSpacing: 2, fontStyle: "normal" }));
  }
  return fsLayer("5-Day Forecast Board", [
    backdrop({ from: "#041420", mid: "#0a3a52", to: "#03101a" }),
    accent("Top Accent", -20, 0, 1960, 8, WARM, fsIn(0.1, { duration: 0.45, distance: 900, fade: false }), fsOut(0.1)),
    fsTitle("5-DAY FORECAST", "", 120, 54, "#ffffff", 0.2),
    fsText("Location", 0, 250, 1920, 50, "weather.location", "CITY NAME", 36, "#8fd4ec", 0.32, { letterSpacing: 4 }),
    ...cols,
  ]);
}
