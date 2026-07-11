import { createTextElement } from "@/document/factory";
import type { Binding, TextElement, Transform } from "@/document/types";

/**
 * Brand Kit theming (Phase 4): station-wide colors every sport's scorebug
 * chrome binds to, so a network refresh recolors all 8+ sports from one
 * live-editable source instead of 8 hardcoded hex literals. Scoped to the
 * two chrome properties every sport already shares identically (panel
 * background, clock/period accent text) — per-team accent colors stay
 * sport-authored, since those genuinely vary by team, not by network brand.
 */
export const BRAND_KEYS = {
  panelBg: "brand.panelBg",
  accentText: "brand.accentText",
} as const;

export const BRAND_DEFAULTS: Record<string, string> = {
  panelBg: "#0a0a18",
  accentText: "#d9a441",
};

/**
 * Extra per-sport keys consumed by the full-screen templates (Phase 5.5's
 * Matchup/Lineup/Stat Board/Final Score). Merged into every sport source's
 * defaults in dataSources.ts, so all of them are live-editable in the Data
 * Sources panel like any scorebug field. Empty-string defaults mean "not
 * provided yet" — templates author fallbacks for every one of these.
 */
export const FULLSCREEN_DEFAULTS: Record<string, string> = {
  matchTitle: "MATCH DAY",
  venue: "",
  player1: "",
  player2: "",
  player3: "",
  player4: "",
  player5: "",
  player6: "",
  stat1Label: "POSSESSION",
  stat1Home: "",
  stat1Away: "",
  stat2Label: "SHOTS",
  stat2Home: "",
  stat2Away: "",
  stat3Label: "FOULS",
  stat3Home: "",
  stat3Away: "",
  stat4Label: "CORNERS",
  stat4Home: "",
  stat4Away: "",
};

/** Shared by every `src/sports/<sport>.ts` — was duplicated identically 8 times. */
export function boundText(
  name: string,
  transform: Transform,
  key: string,
  fallback: string,
  overrides: Partial<TextElement> = {},
): TextElement {
  const binding: Binding = { targetPath: "text", source: key, fallback };
  return createTextElement({
    name,
    text: fallback,
    align: "center",
    fontSize: 34,
    fill: "#ffffff",
    fontStyle: "bold",
    transform,
    bindings: [binding],
    ...overrides,
  });
}

/** A second binding on a text element already built by `boundText`, for the
 * Brand Kit accent color (clock/period labels) — the element keeps its
 * `text` binding, this just adds a `fill` binding alongside it. */
export function withAccentFill(el: TextElement, fallback: string): TextElement {
  const binding: Binding = { targetPath: "fill", source: BRAND_KEYS.accentText, fallback };
  return { ...el, bindings: [...el.bindings, binding] };
}
