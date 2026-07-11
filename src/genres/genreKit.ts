import { createLayer, createRectElement, defaultTimeline } from "@/document/factory";
import { boundText } from "@/sports/common";
import type { AnimPhaseSpec, Element, Layer, RectElement, TextElement } from "@/document/types";
import type { Gloss } from "@/graphics/motionKit";

/**
 * Full-screen board toolkit for the genre packs (Phase 5.7) — the same
 * skewed-gloss / cascading-row language the sports full-screens use
 * (fullscreens.ts), factored so news/weather/program/faith boards build
 * identically. Genre boards bind to their own feed sources with realistic
 * per-genre palettes (they do NOT chain to the Brand Kit — that's the sports
 * chrome convention), so each helper takes explicit colors.
 */

export const FS_W = 1920;
export const FS_H = 1080;
const FS_SKEW = -14;
const FS_SHADOW = { color: "#000000", blur: 18, offsetX: 0, offsetY: 9, opacity: 0.5 } as const;

export function fsIn(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.5, direction: "left", distance: 420, ease: "power3.out", fade: true, ...overrides };
}
export function fsOut(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.35, direction: "left", distance: 300, ease: "power2.in", fade: true, ...overrides };
}

/** Full-frame depth-gradient backdrop — fades in first, semi-opaque so the
 * virtual set stays faintly visible behind the board. */
export function backdrop(gradient: Gloss, opacity = 0.94): RectElement {
  return createRectElement({
    name: "Backdrop",
    transform: { x: 0, y: 0, width: FS_W, height: FS_H, rotation: 0 },
    fill: gradient.from,
    gradient: { ...gradient, direction: "diagonal" },
    opacity,
    anim: { in: fsIn(0, { direction: "none", duration: 0.35 }), out: fsOut(0.2, { direction: "none", duration: 0.3 }) },
  });
}

/** A skewed flat-fill panel with a drop shadow. */
export function panel(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  opacity: number,
  animIn: AnimPhaseSpec,
  animOut: AnimPhaseSpec,
): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill,
    opacity,
    skewX: FS_SKEW,
    shadow: { ...FS_SHADOW },
    anim: { in: animIn, out: animOut },
  });
}

/** A thin skewed gloss accent stripe. */
export function accent(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  gradient: Gloss,
  animIn: AnimPhaseSpec,
  animOut: AnimPhaseSpec,
): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill: gradient.from,
    gradient: { ...gradient, direction: "horizontal" },
    skewX: FS_SKEW,
    anim: { in: animIn, out: animOut },
  });
}

/** Big centered board title with a back-eased top drop. */
export function fsTitle(text: string, key: string, y: number, fontSize: number, fill: string, delay: number): TextElement {
  return boundText("Title", { x: 0, y, width: FS_W, height: fontSize * 1.4, rotation: 0 }, key, text, {
    fontSize,
    fill,
    uppercase: true,
    letterSpacing: 6,
    shadow: { color: "#000000", blur: 8, offsetX: 0, offsetY: 3, opacity: 0.6 },
    anim: {
      in: fsIn(delay, { direction: "top", distance: 60, ease: "back.out(1.4)" }),
      out: fsOut(0, { direction: "top", distance: 50 }),
    },
  });
}

/** Bound board text with a standard slide-in. */
export function fsText(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  key: string,
  fallback: string,
  fontSize: number,
  fill: string,
  delay: number,
  overrides: Partial<TextElement> = {},
): TextElement {
  return boundText(name, { x, y, width: w, height: h, rotation: 0 }, key, fallback, {
    fontSize,
    fill,
    uppercase: true,
    anim: { in: fsIn(delay, { distance: 110 }), out: fsOut(0, { distance: 80 }) },
    ...overrides,
  });
}

export function fsLayer(name: string, elements: Element[]): Layer {
  const layer = createLayer("gfx2d", {
    name,
    timeline: defaultTimeline({ inDuration: 1.5, outDuration: 0.8, inEase: "power3.out", outEase: "power2.in" }),
  });
  if (layer.props.kind === "gfx2d") layer.props.elements = elements;
  return layer;
}
