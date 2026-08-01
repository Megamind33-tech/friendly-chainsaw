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

export type TransitionType = "cut" | "dissolve" | "dipToClear";

/** Operator-facing labels. "dipToClear", not "fade to black": this engine
 * outputs an alpha overlay, so there is no black to dip through — the old
 * scene fades out to transparent before the new one fades up. Naming it
 * "fade" invited exactly the wrong expectation. */
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: "Cut",
  dissolve: "Dissolve",
  dipToClear: "Dip to Clear",
};

export const TRANSITION_TYPES: readonly TransitionType[] = ["cut", "dissolve", "dipToClear"] as const;

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
}

export const DEFAULT_TRANSITION_SETTINGS: TransitionSettings = {
  type: "dissolve",
  durationMs: DEFAULT_TRANSITION_MS,
};

/** An in-flight scene transition. `type` is never "cut" — a cut produces no
 * record at all, because there is nothing to animate. */
export interface SceneTransition {
  type: Exclude<TransitionType, "cut">;
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

export interface TransitionMix {
  /** Opacity for the scene leaving air, composited above the incoming one. */
  fromOpacity: number;
  /** Opacity for the scene Program has already committed to. */
  toOpacity: number;
  /** True once the mix has settled — the outgoing scene can stop rendering
   * entirely, which also releases its WebGL contexts. */
  done: boolean;
}

const SETTLED: TransitionMix = { fromOpacity: 0, toOpacity: 1, done: true };

/**
 * The whole visual contract, as one pure function so both renderers and tests
 * agree by construction.
 *
 * `dissolve` is a true A/B mix: the two scenes cross at 50/50.
 * `dipToClear` sequences them — the outgoing scene is fully gone by the
 * midpoint, before the incoming one starts coming up, so the two are never
 * simultaneously visible.
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

  if (transition.type === "dipToClear") {
    return p < 0.5
      ? { fromOpacity: 1 - p * 2, toOpacity: 0, done: false }
      : { fromOpacity: 0, toOpacity: (p - 0.5) * 2, done: false };
  }
  return { fromOpacity: 1 - p, toOpacity: p, done: false };
}
