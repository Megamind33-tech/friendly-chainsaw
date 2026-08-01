import gsap from "gsap";
import type { LayerPlayback } from "./playbackState";
import type { ID } from "./types";

/**
 * Scene transitions on Take.
 *
 * Until now `take()` was a bare alias of `cut()` — the seam was deliberately
 * left in place in Phase 2 ("so Phase 3 can give it a real animated
 * transition") and never filled in. `cut()` stays exactly what it was: a hard
 * instant switch. `take()` now runs a real timed mix.
 *
 * State model follows cameraMoves.ts exactly, and for the same reasons:
 *
 *   * **Transient.** Never persisted — a half-finished dissolve restored
 *     across an app restart is meaningless.
 *   * **Wall-clock `startedAt`.** Every consumer (Program window, Preview
 *     window, the sidecar-served renderer OBS reads) independently
 *     reconstructs the same mid-transition frame from `Date.now() -
 *     startedAt`. No frame-sync protocol between windows is needed.
 *   * **End state committed up front.** `programSceneId` is already the
 *     incoming scene the moment the take is issued, so a consumer that
 *     renders zero in-between frames — or joins late, or drops the envelope
 *     entirely — still lands on the correct final frame. The transition
 *     record only ever *adds* the outgoing scene back on top for a while.
 *
 * That last property is what makes a stale record harmless: once
 * `elapsed >= durationMs` the math below returns the settled end state, so a
 * transition that is never explicitly cleared renders identically to no
 * transition at all.
 */

export type WipeDirection = "left" | "right" | "up" | "down";

export type TransitionType =
  | "cut"
  | "dissolve"
  | "dipToClear"
  | "wipeRight"
  | "wipeLeft"
  | "wipeDown"
  | "wipeUp"
  | "stinger";

/** Operator-facing labels. "dipToClear", not "fade to black": this engine
 * outputs an alpha overlay, so there is no black to dip through — the old
 * scene fades out to transparent before the new one fades up. Naming it
 * "fade" invited exactly the wrong expectation.
 *
 * Wipes are named for the direction the EDGE TRAVELS, and the arrow in the
 * label says it out loud — "wipe left" is ambiguous in every control room
 * (does the picture move left, or is it revealed from the left?). */
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: "Cut",
  dissolve: "Dissolve",
  dipToClear: "Dip to Clear",
  wipeRight: "Wipe →",
  wipeLeft: "Wipe ←",
  wipeDown: "Wipe ↓",
  wipeUp: "Wipe ↑",
  stinger: "Stinger",
};

export const TRANSITION_TYPES: readonly TransitionType[] = [
  "cut",
  "dissolve",
  "dipToClear",
  "wipeRight",
  "wipeLeft",
  "wipeDown",
  "wipeUp",
  "stinger",
] as const;

/** Maps a wipe type to the direction its edge travels. */
const WIPE_DIRECTIONS: Partial<Record<TransitionType, WipeDirection>> = {
  wipeRight: "right",
  wipeLeft: "left",
  wipeDown: "down",
  wipeUp: "up",
};

export function isWipe(type: TransitionType): boolean {
  return type in WIPE_DIRECTIONS;
}

/** Softness is a fraction of the travel axis (0 = hard edge, 0.25 = a feather
 * a quarter of the frame wide). Capped well below 1 so the edge stays a
 * readable wipe rather than degenerating into a directional dissolve. */
export const MAX_WIPE_SOFTNESS = 0.5;
export const DEFAULT_WIPE_SOFTNESS = 0.04;

export function clampSoftness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WIPE_SOFTNESS;
  return Math.min(MAX_WIPE_SOFTNESS, Math.max(0, value));
}

/** Where in a stinger's run the scene actually changes — the frame at which
 * the clip is expected to fully cover the picture. */
export const DEFAULT_STINGER_CUT_AT = 0.5;

export function clampCutAt(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STINGER_CUT_AT;
  return Math.min(0.95, Math.max(0.05, value));
}

export function isTransitionType(value: unknown): value is TransitionType {
  return typeof value === "string" && (TRANSITION_TYPES as readonly string[]).includes(value);
}

export const MIN_TRANSITION_MS = 100;
export const MAX_TRANSITION_MS = 10_000;
export const DEFAULT_TRANSITION_MS = 500;

/** A real vision mixer's dissolve is linear on the T-bar; easing a dissolve
 * makes it read as a "swoosh" rather than a mix. Individual takes can still
 * override this. */
export const DEFAULT_TRANSITION_EASE = "none";

export interface TransitionSettings {
  type: TransitionType;
  durationMs: number;
  /** Wipe edge feather, 0..MAX_WIPE_SOFTNESS. Ignored by non-wipes. */
  softness: number;
  /** Video asset id for `stinger`. Null means no clip is chosen — a stinger
   * take then degrades to a hard cut rather than mixing to nothing. */
  stingerAssetId: ID | null;
  /** 0..1 point in the stinger at which the scene changes. */
  cutAt: number;
}

export const DEFAULT_TRANSITION_SETTINGS: TransitionSettings = {
  type: "dissolve",
  durationMs: DEFAULT_TRANSITION_MS,
  softness: DEFAULT_WIPE_SOFTNESS,
  stingerAssetId: null,
  cutAt: DEFAULT_STINGER_CUT_AT,
};

/** An in-flight scene transition. `type` is never "cut" — a cut produces no
 * record at all, because there is nothing to animate. */
export interface SceneTransition {
  type: Exclude<TransitionType, "cut">;
  /** Wipe edge feather as a fraction of the travel axis. Wipes only. */
  softness?: number;
  /** Resolved video asset for a stinger. A stinger take with no clip never
   * gets this far — it degrades to a cut at `take()`. */
  stingerAssetId?: ID;
  /** 0..1 point in a stinger at which the scene changes under the clip. */
  cutAt?: number;
  /** The scene leaving air. Re-rendered *on top of* the incoming scene for
   * the duration, since `programSceneId` already points at the incoming one. */
  fromSceneId: ID;
  /** Where Program has already landed. Kept for consumer sanity checks: a
   * record whose `toSceneId` no longer matches `programSceneId` is stale and
   * must be ignored (see `isTransitionCurrent`). */
  toSceneId: ID;
  durationMs: number;
  /** GSAP ease name — same convention as Timeline / ElementAnim / CameraMove. */
  ease: string;
  startedAt: number;
  /**
   * The outgoing scene's layer playback, snapshotted *before* the take.
   *
   * `cut()` prunes `layerPlayback` down to the layers of the scene it lands
   * on, and a timelined gfx2d layer with no playback entry renders as off-air
   * (`DocumentRenderer`: `if (layer.timeline && !playback) return null`).
   * Without this snapshot every timelined layer in the outgoing scene would
   * vanish on frame one of the mix — the graphics would pop off and only the
   * untimelined backplate would dissolve, which reads worse than a plain cut.
   *
   * Carried in the record rather than left in the store so the transition is
   * self-describing: every consumer reconstructs the same outgoing frame, and
   * `cut()`'s pruning semantics stay untouched.
   */
  fromLayerPlayback: Record<ID, LayerPlayback>;
}

export function clampTransitionMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_TRANSITION_MS;
  return Math.min(MAX_TRANSITION_MS, Math.max(MIN_TRANSITION_MS, Math.round(ms)));
}

/** Raw 0..1 time progress. A non-positive duration is already complete rather
 * than dividing by zero. */
export function transitionProgress(transition: SceneTransition, now: number): number {
  if (transition.durationMs <= 0) return 1;
  const raw = (now - transition.startedAt) / transition.durationMs;
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

export function isTransitionComplete(transition: SceneTransition, now: number): boolean {
  return transitionProgress(transition, now) >= 1;
}

/**
 * A transition record only applies to the scene Program is actually on. If a
 * later take (or a direct `setProgramDirect`/hydrate) moved Program elsewhere,
 * the record is stale and must not resurrect a scene that is no longer part of
 * the current mix.
 */
export function isTransitionCurrent(transition: SceneTransition | null, programSceneId: ID | null): boolean {
  return !!transition && transition.toSceneId === programSceneId && transition.fromSceneId !== programSceneId;
}

/**
 * Where a wipe's edge is, in geometry rather than CSS.
 *
 * Deliberately not a mask string: keeping this as numbers is what lets the
 * tests assert the wipe without asserting on a gradient's text, and lets the
 * compositor own the one place CSS is written.
 */
export interface WipeGeometry {
  /** Direction the edge travels. The incoming scene is revealed behind it. */
  direction: WipeDirection;
  /** Edge position along the travel axis, 0..100 (%), measured from the edge
   * the wipe starts at. */
  edgePct: number;
  /** Feather width as a percentage of the axis; 0 is a hard edge. */
  softnessPct: number;
}

export interface TransitionMix {
  /** Opacity for the scene leaving air, composited above the incoming one. */
  fromOpacity: number;
  /** Opacity for the scene Program has already committed to. */
  toOpacity: number;
  /** True once the mix has settled — the outgoing scene can stop rendering
   * entirely, which also releases its WebGL contexts. */
  done: boolean;
  /** Set for wipes only. Opacities stay at 1 and the mask does the work. */
  wipe: WipeGeometry | null;
  /** Seconds into the stinger clip, for seeking the overlay video. Null for
   * every other type. */
  stingerElapsedSec: number | null;
}

const SETTLED: TransitionMix = {
  fromOpacity: 0,
  toOpacity: 1,
  done: true,
  wipe: null,
  stingerElapsedSec: null,
};

/**
 * The whole visual contract, as one pure function so renderers and tests agree
 * by construction.
 *
 * * `dissolve` — a true A/B mix; the two scenes cross at 50/50.
 * * `dipToClear` — sequenced; the outgoing scene is fully gone by the midpoint
 *   before the incoming one comes up, so the two are never both visible.
 * * `wipe*` — both scenes stay fully opaque and a travelling masked edge
 *   reveals the incoming one. Softness feathers that edge.
 * * `stinger` — the scene change is a HARD CUT at `cutAt`, hidden under a
 *   full-frame clip. Fading under a stinger would defeat its whole purpose:
 *   the clip exists precisely so the cut is never seen.
 */
export function transitionMix(transition: SceneTransition, now: number): TransitionMix {
  const raw = transitionProgress(transition, now);
  if (raw >= 1) return SETTLED;

  let eased: number;
  try {
    eased = gsap.parseEase(transition.ease || DEFAULT_TRANSITION_EASE)(raw);
  } catch {
    // An unknown ease name must not take Program down mid-take.
    eased = raw;
  }
  const p = Math.min(1, Math.max(0, eased));

  if (transition.type === "stinger") {
    // The clip is timed against real elapsed time, not the eased curve — an
    // ease would drift the video against its own audio and against the frame
    // the artist drew the cut for.
    const cutAt = clampCutAt(transition.cutAt ?? DEFAULT_STINGER_CUT_AT);
    const swapped = raw >= cutAt;
    return {
      fromOpacity: swapped ? 0 : 1,
      toOpacity: swapped ? 1 : 0,
      done: false,
      wipe: null,
      stingerElapsedSec: (raw * transition.durationMs) / 1000,
    };
  }

  const direction = WIPE_DIRECTIONS[transition.type];
  if (direction) {
    const softnessPct = clampSoftness(transition.softness ?? DEFAULT_WIPE_SOFTNESS) * 100;
    return {
      // A wipe is not a fade: both scenes stay fully opaque and the mask
      // decides which pixels each contributes.
      fromOpacity: 1,
      toOpacity: 1,
      done: false,
      wipe: { direction, edgePct: p * 100, softnessPct },
      stingerElapsedSec: null,
    };
  }

  if (transition.type === "dipToClear") {
    return p < 0.5
      ? { fromOpacity: 1 - p * 2, toOpacity: 0, done: false, wipe: null, stingerElapsedSec: null }
      : { fromOpacity: 0, toOpacity: (p - 0.5) * 2, done: false, wipe: null, stingerElapsedSec: null };
  }
  return { fromOpacity: 1 - p, toOpacity: p, done: false, wipe: null, stingerElapsedSec: null };
}

/** CSS gradient direction for a wipe's travel axis. */
export const WIPE_GRADIENT_DIRECTION: Record<WipeDirection, string> = {
  right: "to right",
  left: "to left",
  down: "to bottom",
  up: "to top",
};

/**
 * Mask gradient for one side of a wipe.
 *
 * `reveal: true` returns the mask for the scene being revealed (opaque behind
 * the edge), `false` the exact complement for the scene being wiped away. One
 * function for both so the two masks can never drift out of step and leave a
 * seam or a double-exposed band at the edge.
 */
export function wipeMaskGradient(wipe: WipeGeometry, reveal: boolean): string {
  const half = wipe.softnessPct / 2;
  const start = Math.max(0, Math.min(100, wipe.edgePct - half));
  const end = Math.max(start, Math.min(100, wipe.edgePct + half));
  const dir = WIPE_GRADIENT_DIRECTION[wipe.direction];
  return reveal
    ? `linear-gradient(${dir}, #000 0%, #000 ${start}%, transparent ${end}%, transparent 100%)`
    : `linear-gradient(${dir}, transparent 0%, transparent ${start}%, #000 ${end}%, #000 100%)`;
}
