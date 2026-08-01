import { describe, expect, it } from "vitest";
import {
  clampTransitionMs,
  DEFAULT_TRANSITION_MS,
  isTransitionComplete,
  isTransitionCurrent,
  isTransitionType,
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  transitionMix,
  transitionProgress,
  type SceneTransition,
} from "./sceneTransition";

const START = 1_000_000;

function make(over: Partial<SceneTransition> = {}): SceneTransition {
  return {
    type: "dissolve",
    fromSceneId: "scene-a",
    toSceneId: "scene-b",
    durationMs: 1000,
    ease: "none",
    startedAt: START,
    fromLayerPlayback: {},
    ...over,
  };
}

describe("transitionProgress", () => {
  it("runs 0 -> 1 across the duration and clamps outside it", () => {
    const t = make();
    expect(transitionProgress(t, START - 500)).toBe(0);
    expect(transitionProgress(t, START)).toBe(0);
    expect(transitionProgress(t, START + 500)).toBeCloseTo(0.5);
    expect(transitionProgress(t, START + 1000)).toBe(1);
    expect(transitionProgress(t, START + 99_999)).toBe(1);
  });

  it("treats a zero or negative duration as already complete", () => {
    expect(transitionProgress(make({ durationMs: 0 }), START)).toBe(1);
    expect(transitionProgress(make({ durationMs: -5 }), START)).toBe(1);
  });
});

describe("transitionMix", () => {
  it("cross-dissolves through a 50/50 midpoint", () => {
    const t = make({ ease: "none" });
    const mid = transitionMix(t, START + 500);
    expect(mid.fromOpacity).toBeCloseTo(0.5);
    expect(mid.toOpacity).toBeCloseTo(0.5);
    expect(mid.done).toBe(false);
  });

  it("keeps dissolve opacities summing to 1 throughout", () => {
    const t = make({ ease: "none" });
    for (const ms of [1, 100, 250, 500, 750, 999]) {
      const m = transitionMix(t, START + ms);
      expect(m.fromOpacity + m.toOpacity).toBeCloseTo(1);
    }
  });

  it("never shows both scenes at once on a dip to clear", () => {
    const t = make({ type: "dipToClear", ease: "none" });
    for (const ms of [1, 100, 250, 499, 501, 750, 999]) {
      const m = transitionMix(t, START + ms);
      expect(Math.min(m.fromOpacity, m.toOpacity)).toBe(0);
    }
    // Outgoing gone by the midpoint, incoming not yet up.
    const mid = transitionMix(t, START + 500);
    expect(mid.fromOpacity).toBe(0);
    expect(mid.toOpacity).toBeCloseTo(0);
  });

  it("settles to the incoming scene alone once complete", () => {
    const t = make();
    const end = transitionMix(t, START + 1000);
    expect(end).toEqual({ fromOpacity: 0, toOpacity: 1, done: true });
    expect(isTransitionComplete(t, START + 1000)).toBe(true);
  });

  it("falls back to linear rather than throwing on an unknown ease", () => {
    // An ease typo must never take Program down mid-take.
    const t = make({ ease: "not-a-real-ease" });
    const mid = transitionMix(t, START + 500);
    expect(mid.fromOpacity).toBeGreaterThan(0);
    expect(mid.toOpacity).toBeGreaterThan(0);
  });

  it("applies a non-linear ease when one is given", () => {
    const eased = transitionMix(make({ ease: "power2.in" }), START + 500);
    const linear = transitionMix(make({ ease: "none" }), START + 500);
    expect(eased.toOpacity).toBeLessThan(linear.toOpacity);
  });
});

describe("isTransitionCurrent", () => {
  it("applies only to the scene Program is actually on", () => {
    const t = make();
    expect(isTransitionCurrent(t, "scene-b")).toBe(true);
    // A later take moved Program elsewhere — this record is stale and must
    // not resurrect a scene that is no longer part of the mix.
    expect(isTransitionCurrent(t, "scene-c")).toBe(false);
    expect(isTransitionCurrent(t, null)).toBe(false);
    expect(isTransitionCurrent(null, "scene-b")).toBe(false);
  });

  it("ignores a record whose from and to are the same scene", () => {
    expect(isTransitionCurrent(make({ fromSceneId: "scene-b" }), "scene-b")).toBe(false);
  });
});

describe("clampTransitionMs", () => {
  it("bounds duration and rejects non-finite input", () => {
    expect(clampTransitionMs(500)).toBe(500);
    expect(clampTransitionMs(0)).toBe(MIN_TRANSITION_MS);
    expect(clampTransitionMs(999_999)).toBe(MAX_TRANSITION_MS);
    expect(clampTransitionMs(Number.NaN)).toBe(DEFAULT_TRANSITION_MS);
    expect(clampTransitionMs(250.4)).toBe(250);
  });
});

describe("isTransitionType", () => {
  it("accepts known types and rejects anything else", () => {
    expect(isTransitionType("dissolve")).toBe(true);
    expect(isTransitionType("cut")).toBe(true);
    expect(isTransitionType("wipe")).toBe(false);
    expect(isTransitionType(undefined)).toBe(false);
    expect(isTransitionType(5)).toBe(false);
  });
});
