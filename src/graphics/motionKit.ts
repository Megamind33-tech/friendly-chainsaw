import { createLayer, createRectElement, defaultTimeline } from "@/document/factory";
import { boundText } from "@/sports/common";
import type { AnimPhaseSpec, Element, Layer, RectElement, TextElement } from "@/document/types";

/**
 * Shared broadcast-motion toolkit (Phase 5.6/5.7) — the skewed-gloss-bar
 * visual language, extracted from the sports lower-thirds pack so the genre
 * template families (news/weather/program/faith) build the exact same way
 * instead of re-deriving it. Palettes stay per-template (operator direction:
 * NOT one Brand Kit color for everything); this module owns only the generic
 * geometry + choreography helpers.
 */

export const SKEW = -20;
export const SOFT_SHADOW = { color: "#000000", blur: 16, offsetX: 0, offsetY: 8, opacity: 0.45 } as const;

export type Gloss = { from: string; mid?: string; to: string };

export function inSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.45, direction: "left", distance: 480, ease: "power3.out", fade: false, ...overrides };
}
export function outSpec(delay: number, overrides: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec {
  return { delay, duration: 0.35, direction: "left", distance: 360, ease: "power2.in", fade: true, ...overrides };
}

/** A skewed gloss bar — the building block of the whole broadcast package. */
export function bar(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  gradient: Gloss,
  animIn: AnimPhaseSpec,
  animOut: AnimPhaseSpec,
  overrides: Partial<RectElement> = {},
): RectElement {
  return createRectElement({
    name,
    transform: { x, y, width: w, height: h, rotation: 0 },
    fill: gradient.from,
    gradient: { ...gradient, direction: "diagonal" },
    skewX: SKEW,
    shadow: { ...SOFT_SHADOW },
    anim: { in: animIn, out: animOut },
    ...overrides,
  });
}

/** Staggered bound text; uppercase + optional letter-spacing by default (the
 * kicker/label convention). Pass `uppercase: false` in overrides for prose. */
export function label(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  key: string,
  fallback: string,
  fontSize: number,
  fill: string,
  animIn: AnimPhaseSpec,
  animOut: AnimPhaseSpec,
  overrides: Partial<TextElement> = {},
): TextElement {
  return boundText(name, { x, y, width: w, height: h, rotation: 0 }, key, fallback, {
    fontSize,
    fill,
    uppercase: true,
    anim: { in: animIn, out: animOut },
    ...overrides,
  });
}

/** A gfx2d layer whose timeline envelope covers the longest element
 * choreography (max delay+duration across the pack). */
export function gfxLayer(
  name: string,
  elements: Element[],
  timing: { inDuration?: number; outDuration?: number } = {},
): Layer {
  const layer = createLayer("gfx2d", {
    name,
    timeline: defaultTimeline({ inDuration: timing.inDuration ?? 1.2, outDuration: timing.outDuration ?? 0.7 }),
  });
  if (layer.props.kind === "gfx2d") layer.props.elements = elements;
  return layer;
}
