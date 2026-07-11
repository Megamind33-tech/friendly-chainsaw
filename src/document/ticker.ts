import { createLayer, createRectElement, defaultTimeline } from "@/document/factory";
import type { Layer } from "@/document/types";
import { boundText } from "@/sports/common";

/**
 * Phase 4 ticker — general broadcast content, not sport-specific (lives in
 * `document/`, not `sports/`). A continuously-scrolling headline band along
 * the bottom edge. `Layer.scrollSpeed` drives the scroll (see
 * timelineEngine.ts's `applyScroll`); `Layer.timeline` still drives the
 * band's own IN/OUT (slide up on Play In, down on Play Out) — those are two
 * genuinely different animations working together on the same layer.
 */
export const TICKER_KEYS = {
  headlines: "ticker.headlines",
} as const;

export const TICKER_DEFAULTS: Record<string, string> = {
  headlines: "Rebuild in progress  •  Software-defined broadcast graphics engine  •  Phase 4: sports package",
};

const BAND_Y = 1030;
const BAND_H = 50;
const LOOP_WIDTH = 1920;
const SCROLL_SPEED_PX_PER_SEC = 90;

const COLOR_BAND = "#0a0a18";
const COLOR_TEXT = "#ffffff";

export function createTickerLayer(): Layer {
  const layer = createLayer("gfx2d", {
    name: "Ticker",
    timeline: defaultTimeline({ inDuration: 0.5, outDuration: 0.35 }),
    scrollSpeed: SCROLL_SPEED_PX_PER_SEC,
  });

  if (layer.props.kind !== "gfx2d") return layer;

  const textTransform = (x: number) => ({ x, y: BAND_Y + 12, width: LOOP_WIDTH, height: BAND_H - 24, rotation: 0 });

  layer.props.elements = [
    createRectElement({
      name: "Ticker Band",
      fill: COLOR_BAND,
      transform: { x: 0, y: BAND_Y, width: LOOP_WIDTH, height: BAND_H, rotation: 0 },
    }),
    // Two copies, exactly LOOP_WIDTH apart, both bound to the same content —
    // applyScroll's shared modulo offset makes this loop seamlessly (the
    // standard infinite-marquee technique: as one copy wraps, the other is
    // passing through the identical position, so the seam is imperceptible).
    boundText("Ticker Text A", textTransform(0), TICKER_KEYS.headlines, TICKER_DEFAULTS.headlines, {
      align: "left",
      fontSize: 22,
      fill: COLOR_TEXT,
      fontStyle: "normal",
    }),
    boundText("Ticker Text B", textTransform(LOOP_WIDTH), TICKER_KEYS.headlines, TICKER_DEFAULTS.headlines, {
      align: "left",
      fontSize: 22,
      fill: COLOR_TEXT,
      fontStyle: "normal",
    }),
  ];

  return layer;
}
