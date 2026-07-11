import { useEffect, useState } from "react";
import gsap from "gsap";
import type { AnimPhaseSpec, Element, Layer, LoopPulseSpec, Timeline } from "./types";
import type { LayerPlayback, LayerPlaybackPhase } from "./playbackState";

const SLIDE_OFFSET_Y = 40;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Hidden-side offset for a given remaining amount (0 = arrived, 1 = fully
 * out). IN enters FROM the direction; OUT exits TO it — same math. */
function directionOffset(spec: AnimPhaseSpec, remaining: number): { dx: number; dy: number } {
  const off = spec.distance * remaining;
  switch (spec.direction) {
    case "left":
      return { dx: -off, dy: 0 };
    case "right":
      return { dx: off, dy: 0 };
    case "top":
      return { dx: 0, dy: -off };
    case "bottom":
      return { dx: 0, dy: off };
    case "none":
      return { dx: 0, dy: 0 };
  }
}

/** Applies one element's own choreography spec for the current phase. */
function applyElementAnim(el: Element, spec: AnimPhaseSpec, elapsedSec: number, phase: LayerPlaybackPhase): Element {
  const raw =
    spec.duration > 0 ? clamp01((elapsedSec - spec.delay) / spec.duration) : elapsedSec >= spec.delay ? 1 : 0;
  const eased = gsap.parseEase(spec.ease)(raw);
  // t: 0 = fully hidden/offset, 1 = authored resting state.
  const t = phase === "in" ? eased : 1 - eased;
  const { dx, dy } = directionOffset(spec, 1 - t);

  // Before its own delay on IN (and after it's fully exited on OUT) the
  // element must not sit visibly at its offset waiting — it's simply not
  // on screen yet / any more. Mid-flight, `fade` decides whether it also
  // dissolves (text) or wipes in fully opaque (bars).
  const notOnScreen = phase === "in" ? raw === 0 : raw === 1;
  const opacity = notOnScreen ? 0 : spec.fade ? el.opacity * t : el.opacity;

  let transform = { ...el.transform, x: el.transform.x + dx, y: el.transform.y + dy };

  // Optional scale (Phase 5.11: "pop in" / "scale bounce") — center-anchored
  // so the element grows/shrinks around its own middle rather than its
  // top-left corner. Skipped entirely when absent so byte-identical output
  // is preserved for every pre-5.11 spec (no floating-point drift).
  if (spec.scaleFrom !== undefined) {
    const s = spec.scaleFrom + (1 - spec.scaleFrom) * t;
    const cx = transform.x + transform.width / 2;
    const cy = transform.y + transform.height / 2;
    const w = transform.width * s;
    const h = transform.height * s;
    transform = { ...transform, x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }

  let result: Element = { ...el, opacity, transform };

  // Optional number count-up (Phase 5.11), IN only, text elements only, and
  // only when the already-resolved text is genuinely numeric — anything else
  // is a silent no-op rather than mangling non-numeric bound text.
  if (phase === "in" && spec.countUp && result.kind === "text") {
    const target = Number(result.text);
    if (Number.isFinite(target)) {
      const decimals = result.text.match(/\.(\d+)/)?.[1].length ?? 0;
      result = { ...result, text: (target * eased).toFixed(decimals) };
    }
  }

  return result;
}

/**
 * Pure: given how far (in seconds) we are into a layer's IN/OUT phase,
 * returns the element with opacity/position interpolated through real GSAP
 * easing curves. `gsap.parseEase` is a pure progress-in/progress-out
 * function with no DOM/Canvas coupling, so this works identically for the
 * interactive editor and the polling Program/Preview windows — no
 * imperative Konva-node tweening (which would fight react-konva's own
 * declarative re-renders) is needed anywhere.
 *
 * Elements with their own `anim` spec (Phase 5.6) get per-element staggered
 * choreography; elements without one keep the legacy layer-wide slide/fade.
 * Groups recurse so children can carry their own specs.
 */
export function applyPlayback(el: Element, elapsedSec: number, timeline: Timeline, phase: LayerPlaybackPhase): Element {
  const base: Element =
    el.kind === "group"
      ? { ...el, children: el.children.map((c) => applyPlayback(c, elapsedSec, timeline, phase)) }
      : el;

  const spec = phase === "in" ? base.anim?.in : base.anim?.out;
  if (spec) return applyElementAnim(base, spec, elapsedSec, phase);

  const duration = phase === "in" ? timeline.inDuration : timeline.outDuration;
  const easeName = phase === "in" ? timeline.inEase : timeline.outEase;
  const rawProgress = duration > 0 ? clamp01(elapsedSec / duration) : 1;
  const eased = gsap.parseEase(easeName)(rawProgress);
  // IN: eased 0 -> fully hidden/offset, 1 -> authored resting state. OUT is the mirror.
  const t = phase === "in" ? eased : 1 - eased;
  return {
    ...base,
    opacity: base.opacity * t,
    transform: { ...base.transform, y: base.transform.y + SLIDE_OFFSET_Y * (1 - t) },
  };
}

export function isPlaybackActive(elapsedSec: number, timeline: Timeline, phase: LayerPlaybackPhase): boolean {
  const duration = phase === "in" ? timeline.inDuration : timeline.outDuration;
  return elapsedSec < duration;
}

export function elapsedSeconds(playback: LayerPlayback, now = Date.now()): number {
  return Math.max(0, (now - playback.startedAt) / 1000);
}

/**
 * Pure: continuously scrolls an element left at `speedPxPerSec`, wrapping
 * every `loopWidth` px. Genuinely different shape than `applyPlayback` — a
 * ticker has no "settled" end state to stop animating at, so this is never
 * gated by duration the way IN/OUT is (see `isPlaybackActive` vs. plain
 * `scrollSpeed > 0` in the caller). Loop width is the layer's authored
 * width (typically full screen), not measured text width — content wider
 * than one loop cycle will jump at the wrap instead of scrolling seamlessly
 * (a known v1 simplification, not silently faked).
 */
export function applyScroll(el: Element, elapsedSec: number, speedPxPerSec: number, loopWidth: number): Element {
  if (loopWidth <= 0) return el;
  const offset = ((elapsedSec * speedPxPerSec) % loopWidth + loopWidth) % loopWidth;
  return { ...el, transform: { ...el.transform, x: el.transform.x - offset } };
}

/**
 * Pure: one element's continuous "loop pulse" (Phase 5.11) — a smooth
 * sine oscillation (0 -> 1 -> 0, period `periodSec`) driving scale and/or
 * opacity toward `scaleTo`/`opacityTo` and back to the authored resting
 * value. Unlike `applyPlayback`, this is never gated by IN/OUT duration —
 * it runs for as long as the element is shown, using wall-clock time (not
 * playback-relative), so a Logo Bug can pulse gently with no timeline at
 * all. Center-anchored scale, same math as `applyElementAnim`'s scale.
 */
function applyPulse(el: Element, elapsedSec: number, spec: LoopPulseSpec): Element {
  const period = Math.max(0.01, spec.periodSec);
  const wave = (Math.sin((elapsedSec / period) * Math.PI * 2) + 1) / 2; // 0..1..0
  let transform = el.transform;
  if (spec.scaleTo !== undefined) {
    const s = 1 + (spec.scaleTo - 1) * wave;
    const cx = transform.x + transform.width / 2;
    const cy = transform.y + transform.height / 2;
    const w = transform.width * s;
    const h = transform.height * s;
    transform = { ...transform, x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }
  const opacity = spec.opacityTo !== undefined ? el.opacity + (spec.opacityTo - el.opacity) * wave : el.opacity;
  return { ...el, opacity, transform };
}

/** Recurses through groups so a pulse spec on a child (or the group itself)
 * both apply; a no-op object identity-preserving pass when nothing in the
 * subtree has a `loop` spec. */
export function applyElementLoop(el: Element, elapsedSec: number): Element {
  const withChildren: Element =
    el.kind === "group" ? { ...el, children: el.children.map((c) => applyElementLoop(c, elapsedSec)) } : el;
  const spec = withChildren.anim?.loop;
  return spec ? applyPulse(withChildren, elapsedSec, spec) : withChildren;
}

function elementHasLoop(el: Element): boolean {
  if (el.anim?.loop) return true;
  return el.kind === "group" && el.children.some(elementHasLoop);
}

/** Whether any gfx2d layer's element tree has a `loop` pulse spec — used to
 * decide whether the animation ticker must keep scheduling frames even when
 * nothing is mid-IN/OUT and no layer has a ticker `scrollSpeed` (the two
 * cases that already forced ticking before Phase 5.11). */
export function hasAnyLoopPulse(layers: Layer[]): boolean {
  return layers.some((l) => l.props.kind === "gfx2d" && l.props.elements.some(elementHasLoop));
}

/**
 * Forces a re-render on every animation frame while `active`, so a
 * component driven purely by `Date.now() - startedAt` (rather than a
 * running tween object) animates smoothly at ~60fps. Stops scheduling
 * frames once `active` goes false so a settled layer costs nothing.
 */
export function useAnimationTicker(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
