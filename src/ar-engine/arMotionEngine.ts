import gsap from "gsap";
import type { ARAnimation, SetNode } from "@/document/types";
import type { LayerPlaybackPhase } from "@/document/playbackState";

export interface ArMotionResult {
  visible: boolean;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  opacity: number;
  /** When count-up is active, the string to render instead of the bound value. */
  textDisplay?: string;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const EASE_CACHE = new Map<string, (t: number) => number>();
function parseEase(name: string): (t: number) => number {
  const hit = EASE_CACHE.get(name);
  if (hit) return hit;
  let fn: (t: number) => number;
  try {
    fn = (gsap.parseEase(name) as (t: number) => number) ?? ((t) => t);
  } catch {
    fn = (t) => t;
  }
  EASE_CACHE.set(name, fn);
  return fn;
}

function directionOffset(
  direction: ARAnimation["direction"],
  distance: number,
  remaining: number,
): { x: number; y: number; z: number } {
  const off = distance * remaining;
  switch (direction) {
    case "left":
      return { x: -off, y: 0, z: 0 };
    case "right":
      return { x: off, y: 0, z: 0 };
    case "top":
      return { x: 0, y: off, z: 0 };
    case "bottom":
      return { x: 0, y: -off, z: 0 };
    case "front":
      return { x: 0, y: 0, z: off };
    case "back":
      return { x: 0, y: 0, z: -off };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

function phaseProgress(anim: ARAnimation, elapsedSec: number, phase: LayerPlaybackPhase): number {
  const dur = Math.max(phase === "out" ? anim.outDuration ?? anim.duration : anim.duration, 0.001);
  const delay = phase === "out" ? anim.outDelay ?? 0 : anim.delay;
  const easing = phase === "out" ? anim.outEasing ?? anim.easing : anim.easing;
  const raw = clamp01((elapsedSec - delay) / dur);
  const eased = parseEase(easing)(raw);
  return phase === "in" ? eased : 1 - eased;
}

function isBeforeInDelay(anim: ARAnimation, elapsedSec: number, phase: LayerPlaybackPhase): boolean {
  return phase === "in" && elapsedSec < anim.delay;
}

function isFullyOut(anim: ARAnimation, elapsedSec: number, phase: LayerPlaybackPhase): boolean {
  if (phase !== "out") return false;
  const dur = Math.max(anim.outDuration ?? anim.duration, 0.001);
  const delay = anim.outDelay ?? 0;
  return elapsedSec >= delay + dur;
}

function countUpText(resolvedText: string | undefined, t: number): string | undefined {
  if (!resolvedText) return undefined;
  const target = Number(resolvedText.replace(/,/g, ""));
  if (!Number.isFinite(target)) return undefined;
  const decimals = resolvedText.match(/\.(\d+)/)?.[1].length ?? 0;
  return (target * t).toFixed(decimals);
}

/**
 * Pure AR choreography — mirrors gfx2d timelineEngine semantics in 3D space.
 * `t` is 0 = hidden/off-screen, 1 = authored resting pose.
 */
export function computeArMotion(
  node: SetNode,
  anim: ARAnimation,
  phase: LayerPlaybackPhase,
  elapsedSec: number,
  resolvedText?: string,
): ArMotionResult {
  const t = phaseProgress(anim, elapsedSec, phase);
  const notOnScreen = isBeforeInDelay(anim, elapsedSec, phase) || isFullyOut(anim, elapsedSec, phase);
  const distance = anim.distance ?? (anim.preset === "fly" ? 3 : 1.2);
  const remaining = 1 - t;
  const offset = directionOffset(anim.direction, distance, remaining);

  const base: ArMotionResult = {
    visible: !notOnScreen && t > 0,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    opacity: notOnScreen ? 0 : 1,
  };

  const useFade = anim.fade ?? anim.preset === "fade";
  if (useFade) base.opacity = notOnScreen ? 0 : t;

  const scaleFrom =
    anim.scaleFrom ??
    (anim.preset === "pop"
      ? 0.72
      : anim.preset === "scale" || anim.preset === "count-up"
        ? 0.01
        : undefined);

  switch (anim.preset) {
    case "slide":
    case "fly": {
      base.position = offset;
      if (!useFade) base.opacity = notOnScreen ? 0 : 1;
      break;
    }
    case "wipe": {
      if (anim.direction === "left" || anim.direction === "right") {
        base.scale.x = Math.max(t, 0.001);
        base.scale.y = 1;
      } else if (anim.direction === "top" || anim.direction === "bottom") {
        base.scale.x = 1;
        base.scale.y = Math.max(t, 0.001);
      } else {
        base.scale.z = Math.max(t, 0.001);
      }
      if (!useFade) base.opacity = notOnScreen ? 0 : 1;
      break;
    }
    case "bar-grow": {
      if (anim.direction === "top" || anim.direction === "bottom") {
        base.scale.y = Math.max(t, 0.001);
      } else {
        base.scale.x = Math.max(t, 0.001);
      }
      break;
    }
    case "rotate": {
      base.rotation.y = (-Math.PI / 2) * remaining;
      const s = scaleFrom !== undefined ? scaleFrom + (1 - scaleFrom) * t : t;
      base.scale = { x: Math.max(s, 0.001), y: Math.max(s, 0.001), z: Math.max(s, 0.001) };
      break;
    }
    case "ticker-crawl": {
      if (phase === "in" && t < 1) {
        base.position = offset;
      } else if (phase === "in") {
        const crawl = anim.distance ?? 6;
        const speed = crawl / Math.max(anim.duration, 0.5);
        const settleElapsed = Math.max(0, elapsedSec - anim.delay - anim.duration);
        base.position.x = -((settleElapsed * speed) % crawl);
      } else {
        base.position = offset;
      }
      break;
    }
    case "loop-pulse": {
      const settled = phase === "in" && t >= 1 && !notOnScreen;
      const period = anim.loopPeriod ?? 1.6;
      const amp = anim.loopScale ?? 0.05;
      if (settled) {
        const wave = 1 + amp * Math.sin((elapsedSec / period) * Math.PI * 2);
        base.scale = { x: wave, y: wave, z: wave };
      } else {
        const s = scaleFrom !== undefined ? scaleFrom + (1 - scaleFrom) * t : t;
        base.scale = { x: Math.max(s, 0.001), y: Math.max(s, 0.001), z: Math.max(s, 0.001) };
      }
      break;
    }
    case "count-up": {
      const s = scaleFrom !== undefined ? scaleFrom + (1 - scaleFrom) * t : t;
      base.scale = { x: Math.max(s, 0.001), y: Math.max(s, 0.001), z: Math.max(s, 0.001) };
      if ((anim.countUp ?? true) && node.kind === "text3d" && phase === "in") {
        const counted = countUpText(resolvedText ?? node.text, t);
        if (counted !== undefined) base.textDisplay = counted;
      }
      break;
    }
    case "fade":
    case "scale":
    case "pop":
    default: {
      const s = scaleFrom !== undefined ? scaleFrom + (1 - scaleFrom) * t : t;
      base.scale = { x: Math.max(s, 0.001), y: Math.max(s, 0.001), z: Math.max(s, 0.001) };
      break;
    }
  }

  return base;
}

/** Default animation knobs when applying a preset from the author panel. */
export function defaultAnimationForPreset(preset: ARAnimation["preset"]): ARAnimation {
  const base: ARAnimation = {
    preset,
    duration: 0.6,
    delay: 0,
    easing: "power2.out",
    direction: "bottom",
  };
  switch (preset) {
    case "pop":
      return { ...base, easing: "back.out(1.6)", scaleFrom: 0.72, delay: 0.08 };
    case "fade":
      return { ...base, fade: true, duration: 0.7 };
    case "wipe":
      return { ...base, easing: "expo.out", direction: "left", duration: 0.55 };
    case "fly":
      return { ...base, easing: "power4.out", distance: 3, duration: 0.85 };
    case "rotate":
      return { ...base, easing: "back.out(1.4)", duration: 0.65 };
    case "count-up":
      return { ...base, countUp: true, easing: "power3.out", duration: 0.75, delay: 0.12 };
    case "bar-grow":
      return { ...base, direction: "left", duration: 0.5, easing: "power3.out" };
    case "ticker-crawl":
      return { ...base, direction: "left", duration: 12, distance: 8, easing: "none" };
    case "loop-pulse":
      return { ...base, easing: "back.out(1.6)", loopPeriod: 1.6, loopScale: 0.05, delay: 0.1 };
    case "slide":
      return { ...base, easing: "power4.out", duration: 0.8 };
    case "scale":
      return { ...base, easing: "power3.out", scaleFrom: 0.01, delay: 0.06 };
    default:
      return base;
  }
}
