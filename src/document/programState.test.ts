import { describe, expect, it, beforeEach } from "vitest";
import { useDocStore } from "./store";
import { isTransitionCurrent, transitionMix } from "./sceneTransition";

/**
 * Take/Cut state machine.
 *
 * `take()` was a bare alias of `cut()` from Phase 2 until this change, with
 * the transition seam deliberately left empty. These tests pin the contract
 * that fills it: the end state is committed immediately (so a consumer that
 * renders no in-between frame is still correct), and a transition record is
 * only ever added on top of an already-correct Program.
 */
function setup(): { a: string; b: string; c: string } {
  const store = useDocStore.getState();
  store.createDefaultProject();
  const a = useDocStore.getState().project!.scenes[0].id;
  const b = useDocStore.getState().addScene();
  const c = useDocStore.getState().addScene();
  useDocStore.getState().setProgramDirect(a);
  return { a, b, c };
}

describe("take", () => {
  let ids: { a: string; b: string; c: string };
  beforeEach(() => {
    ids = setup();
  });

  it("commits the scene change before any animation runs", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take();

    // Program is on the incoming scene from the instant the take is issued.
    // This is what makes a dropped/late envelope render the right final frame.
    expect(useDocStore.getState().programSceneId).toBe(ids.b);
  });

  it("records a transition describing the mix", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "dissolve", durationMs: 800 });

    const t = useDocStore.getState().transition!;
    expect(t.type).toBe("dissolve");
    expect(t.fromSceneId).toBe(ids.a);
    expect(t.toSceneId).toBe(ids.b);
    expect(t.durationMs).toBe(800);
    expect(isTransitionCurrent(t, useDocStore.getState().programSceneId)).toBe(true);
  });

  it("uses the configured default when the caller names no transition", () => {
    useDocStore.getState().setDefaultTransition({ type: "dipToClear", durationMs: 1200 });
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take();

    const t = useDocStore.getState().transition!;
    expect(t.type).toBe("dipToClear");
    expect(t.durationMs).toBe(1200);
  });

  it("clamps an out-of-range duration rather than trusting it", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ durationMs: 10_000_000 });
    expect(useDocStore.getState().transition!.durationMs).toBe(10_000);
  });

  it("still takes, but records nothing, for an explicit cut", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "cut" });

    expect(useDocStore.getState().programSceneId).toBe(ids.b);
    expect(useDocStore.getState().transition).toBeNull();
  });

  it("is a no-op when nothing is armed or preview already equals program", () => {
    const before = useDocStore.getState().programSceneId;
    useDocStore.getState().take();
    expect(useDocStore.getState().programSceneId).toBe(before);
    expect(useDocStore.getState().transition).toBeNull();

    useDocStore.getState().armPreview(ids.a); // already on air
    useDocStore.getState().take();
    expect(useDocStore.getState().transition).toBeNull();
  });

  it("replaces an in-flight transition instead of stacking a third scene", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ durationMs: 5000 });
    const first = useDocStore.getState().transition!;

    useDocStore.getState().armPreview(ids.c);
    useDocStore.getState().take({ durationMs: 5000 });
    const second = useDocStore.getState().transition!;

    // Deterministic: the new mix runs b -> c. The original outgoing scene is
    // dropped outright rather than leaving a stuck three-way blend.
    expect(second.fromSceneId).toBe(ids.b);
    expect(second.toSceneId).toBe(ids.c);
    expect(second.startedAt).toBeGreaterThanOrEqual(first.startedAt);
    expect(isTransitionCurrent(first, useDocStore.getState().programSceneId)).toBe(false);
  });

  it("carries wipe softness onto the record", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "wipeRight", softness: 0.2 });
    const t = useDocStore.getState().transition!;
    expect(t.type).toBe("wipeRight");
    expect(t.softness).toBeCloseTo(0.2);
  });

  it("clamps an absurd softness rather than trusting it", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "wipeUp", softness: 99 });
    expect(useDocStore.getState().transition!.softness).toBe(0.5);
  });

  it("records the clip and cut point for a stinger", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "stinger", stingerAssetId: "vid-1", cutAt: 0.3 });
    const t = useDocStore.getState().transition!;
    expect(t.type).toBe("stinger");
    expect(t.stingerAssetId).toBe("vid-1");
    expect(t.cutAt).toBeCloseTo(0.3);
  });

  it("degrades a stinger with no clip to a hard cut, never an empty overlay", () => {
    // An operator who selects Stinger but picks no clip must get a clean cut,
    // not a transition that silently shows nothing over a frozen frame.
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "stinger", stingerAssetId: null });

    expect(useDocStore.getState().programSceneId).toBe(ids.b);
    expect(useDocStore.getState().transition).toBeNull();
  });

  it("does not attach stinger fields to a non-stinger transition", () => {
    useDocStore.getState().setDefaultTransition({ stingerAssetId: "vid-1" });
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ type: "dissolve" });
    expect(useDocStore.getState().transition!.stingerAssetId).toBeUndefined();
  });

  it("snapshots the outgoing scene's playback so its timelined layers can fade", () => {
    const layerId = useDocStore.getState().addLayer(ids.a, "gfx2d");
    useDocStore.getState().playIn(layerId);
    expect(useDocStore.getState().layerPlayback[layerId]).toBeDefined();

    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take();

    // cut() prunes live playback to the incoming scene's layers; without the
    // snapshot the outgoing scene's timelined layers would pop off instead of
    // dissolving.
    expect(useDocStore.getState().layerPlayback[layerId]).toBeUndefined();
    expect(useDocStore.getState().transition!.fromLayerPlayback[layerId]).toBeDefined();
  });
});

describe("cut", () => {
  let ids: { a: string; b: string; c: string };
  beforeEach(() => {
    ids = setup();
  });

  it("stays a hard instant switch with no transition record", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().cut();
    expect(useDocStore.getState().programSceneId).toBe(ids.b);
    expect(useDocStore.getState().transition).toBeNull();
  });

  it("snaps an in-flight mix — a CUT mid-dissolve means now", () => {
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ durationMs: 5000 });
    expect(useDocStore.getState().transition).not.toBeNull();

    useDocStore.getState().armPreview(ids.c);
    useDocStore.getState().cut();

    expect(useDocStore.getState().programSceneId).toBe(ids.c);
    expect(useDocStore.getState().transition).toBeNull();
  });
});

describe("transition lifecycle", () => {
  it("renders as the settled end state once elapsed, even if never cleared", () => {
    const ids = setup();
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take({ durationMs: 200 });
    const t = useDocStore.getState().transition!;

    // A record left in the envelope forever must be visually inert, which is
    // what makes explicit clearing housekeeping rather than correctness.
    expect(transitionMix(t, t.startedAt + 5000)).toEqual({
      fromOpacity: 0,
      toOpacity: 1,
      done: true,
      wipe: null,
      stingerElapsedSec: null,
    });
  });

  it("clearTransition drops the record without moving Program", () => {
    const ids = setup();
    useDocStore.getState().armPreview(ids.b);
    useDocStore.getState().take();
    useDocStore.getState().clearTransition();

    expect(useDocStore.getState().transition).toBeNull();
    expect(useDocStore.getState().programSceneId).toBe(ids.b);
  });
});
