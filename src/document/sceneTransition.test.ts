import { describe, expect, it } from "vitest";
import {
  clampCutAt,
  clampTransitionMs,
  DEFAULT_TRANSITION_MS,
  DEFAULT_WIPE_SOFTNESS,
  isWipe,
  MAX_WIPE_SOFTNESS,
  wipeMaskGradient,
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
    expect(end).toEqual({
      fromOpacity: 0,
      toOpacity: 1,
      done: true,
      wipe: null,
      stingerElapsedSec: null,
    });
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

describe("wipes", () => {
  it("keeps both scenes fully opaque and lets the mask do the work", () => {
    const m = transitionMix(make({ type: "wipeRight", ease: "none" }), START + 500);
    expect(m.fromOpacity).toBe(1);
    expect(m.toOpacity).toBe(1);
    expect(m.wipe).not.toBeNull();
  });

  it("travels the edge across the axis with progress", () => {
    const t = make({ type: "wipeRight", ease: "none" });
    expect(transitionMix(t, START + 1).wipe!.edgePct).toBeCloseTo(0.1, 1);
    expect(transitionMix(t, START + 250).wipe!.edgePct).toBeCloseTo(25);
    expect(transitionMix(t, START + 750).wipe!.edgePct).toBeCloseTo(75);
  });

  it("maps each wipe type to the direction its edge travels", () => {
    const at = (type: SceneTransition["type"]) =>
      transitionMix(make({ type, ease: "none" }), START + 500).wipe!.direction;
    expect(at("wipeRight")).toBe("right");
    expect(at("wipeLeft")).toBe("left");
    expect(at("wipeDown")).toBe("down");
    expect(at("wipeUp")).toBe("up");
  });

  it("clamps softness and defaults a missing value", () => {
    expect(transitionMix(make({ type: "wipeRight", softness: 99 }), START + 500).wipe!.softnessPct).toBe(
      MAX_WIPE_SOFTNESS * 100,
    );
    expect(transitionMix(make({ type: "wipeRight", softness: -1 }), START + 500).wipe!.softnessPct).toBe(0);
    expect(
      transitionMix(make({ type: "wipeRight", softness: undefined }), START + 500).wipe!.softnessPct,
    ).toBeCloseTo(DEFAULT_WIPE_SOFTNESS * 100);
  });

  it("settles with no wipe geometry once complete", () => {
    expect(transitionMix(make({ type: "wipeRight" }), START + 1000).wipe).toBeNull();
  });

  it("identifies wipe types", () => {
    expect(isWipe("wipeUp")).toBe(true);
    expect(isWipe("dissolve")).toBe(false);
    expect(isWipe("stinger")).toBe(false);
  });
});

describe("wipeMaskGradient", () => {
  const geo = { direction: "right", edgePct: 40, softnessPct: 10 } as const;

  it("produces exactly complementary masks so the edge cannot seam", () => {
    const reveal = wipeMaskGradient(geo, true);
    const hide = wipeMaskGradient(geo, false);
    // Same axis, same two stop positions, opposite fills.
    expect(reveal).toContain("to right");
    expect(hide).toContain("to right");
    expect(reveal).toContain("#000 0%");
    expect(hide).toContain("transparent 0%");
    expect(reveal).toContain("35%");
    expect(hide).toContain("35%");
    expect(reveal).toContain("45%");
    expect(hide).toContain("45%");
  });

  it("uses the right gradient axis per direction", () => {
    expect(wipeMaskGradient({ ...geo, direction: "left" }, true)).toContain("to left");
    expect(wipeMaskGradient({ ...geo, direction: "up" }, true)).toContain("to top");
    expect(wipeMaskGradient({ ...geo, direction: "down" }, true)).toContain("to bottom");
  });

  it("keeps stops inside 0-100 and non-decreasing at the extremes", () => {
    // A wide feather at either end would otherwise produce a negative stop or
    // a reversed pair, which renders as a garbage gradient.
    const stops = (css: string) => [...css.matchAll(/(-?[\d.]+)%/g)].map((m) => Number(m[1]));
    for (const edgePct of [0, 5, 50, 95, 100]) {
      for (const reveal of [true, false]) {
        const css = wipeMaskGradient({ direction: "right", edgePct, softnessPct: 40 }, reveal);
        const values = stops(css);
        expect(values.length).toBeGreaterThan(0);
        for (const v of values) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
        for (let i = 1; i < values.length; i++) {
          expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
        }
      }
    }
  });
});

describe("stingers", () => {
  const stinger = make({ type: "stinger", durationMs: 1000, cutAt: 0.5, stingerAssetId: "vid-1" });

  it("hard cuts under the clip rather than fading", () => {
    // The clip exists precisely so the cut is never seen; fading under it
    // would defeat the entire point.
    const before = transitionMix(stinger, START + 400);
    expect(before.fromOpacity).toBe(1);
    expect(before.toOpacity).toBe(0);

    const after = transitionMix(stinger, START + 600);
    expect(after.fromOpacity).toBe(0);
    expect(after.toOpacity).toBe(1);
  });

  it("swaps at the configured cut point, not the midpoint", () => {
    const late = make({ type: "stinger", durationMs: 1000, cutAt: 0.8 });
    expect(transitionMix(late, START + 700).toOpacity).toBe(0);
    expect(transitionMix(late, START + 850).toOpacity).toBe(1);
  });

  it("reports clip elapsed time in real seconds, unaffected by ease", () => {
    // An ease would drift the video against its own audio and against the
    // frame the artist drew the cut for.
    const eased = make({ type: "stinger", durationMs: 2000, ease: "power2.inOut" });
    expect(transitionMix(eased, START + 500).stingerElapsedSec).toBeCloseTo(0.5);
    expect(transitionMix(eased, START + 1500).stingerElapsedSec).toBeCloseTo(1.5);
  });

  it("clamps an out-of-range cut point", () => {
    expect(clampCutAt(0)).toBe(0.05);
    expect(clampCutAt(1)).toBe(0.95);
    expect(clampCutAt(Number.NaN)).toBe(0.5);
  });

  it("carries no stinger data on other transition types", () => {
    expect(transitionMix(make({ type: "dissolve" }), START + 500).stingerElapsedSec).toBeNull();
    expect(transitionMix(make({ type: "wipeRight" }), START + 500).stingerElapsedSec).toBeNull();
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
