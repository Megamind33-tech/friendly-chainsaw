import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  getWebglContextStats,
  registerWebglContext,
  resetWebglContextStats,
  subscribeWebglContextStats,
  WEBGL_CONTEXT_BUDGET,
} from "./webglContext";

/**
 * Every visible set3d layer mounts its own WebGL canvas, and many surfaces can
 * be alive at once — Program, Preview, both multiviewer tiles, the Studio
 * editor, the AR viewport, and the outgoing scene during a Take. Chromium caps
 * concurrent contexts and silently kills the oldest to make room; the canvas
 * just stops painting, which reads as a preview that "won't open".
 */

function canvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

describe("context accounting", () => {
  beforeEach(() => resetWebglContextStats());

  it("counts contexts up and back down", () => {
    const a = registerWebglContext(canvas(), "a");
    const b = registerWebglContext(canvas(), "b");
    expect(getWebglContextStats().live).toBe(2);
    a();
    expect(getWebglContextStats().live).toBe(1);
    b();
    expect(getWebglContextStats().live).toBe(0);
  });

  it("remembers the peak after surfaces close", () => {
    const disposers = [1, 2, 3].map(() => registerWebglContext(canvas(), "x"));
    disposers.forEach((d) => d());
    expect(getWebglContextStats().live).toBe(0);
    expect(getWebglContextStats().peak).toBe(3);
  });

  it("never goes negative if a disposer runs twice", () => {
    // React strict mode double-invokes effects; a double dispose must not
    // corrupt the count and hide a real budget problem.
    const dispose = registerWebglContext(canvas(), "a");
    dispose();
    dispose();
    expect(getWebglContextStats().live).toBe(0);
  });

  it("flags nearBudget only once enough contexts are live", () => {
    expect(getWebglContextStats().nearBudget).toBe(false);
    const disposers = Array.from({ length: 8 }, () => registerWebglContext(canvas(), "x"));
    expect(getWebglContextStats().nearBudget).toBe(true);
    expect(getWebglContextStats().live).toBeLessThan(WEBGL_CONTEXT_BUDGET);
    disposers.forEach((d) => d());
    expect(getWebglContextStats().nearBudget).toBe(false);
  });
});

describe("snapshot identity", () => {
  beforeEach(() => resetWebglContextStats());

  it("keeps a stable identity between changes", () => {
    // useSyncExternalStore loops forever if getSnapshot returns a fresh object
    // each call — the same rule the data hub and behaviour log were fixed for.
    const first = getWebglContextStats();
    expect(getWebglContextStats()).toBe(first);
    const dispose = registerWebglContext(canvas(), "a");
    expect(getWebglContextStats()).not.toBe(first);
    const second = getWebglContextStats();
    expect(getWebglContextStats()).toBe(second);
    dispose();
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeWebglContextStats(() => {
      calls++;
    });
    const dispose = registerWebglContext(canvas(), "a");
    expect(calls).toBeGreaterThan(0);
    const seen = calls;
    unsubscribe();
    dispose();
    expect(calls).toBe(seen);
  });
});

describe("context loss", () => {
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetWebglContextStats();
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  it("reports a lost context instead of failing silently", () => {
    const el = canvas();
    const dispose = registerWebglContext(el, "program-set");
    el.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(error).toHaveBeenCalled();
    // The surface has to be named — with a dozen canvases alive, "context
    // lost" alone tells an operator nothing about which preview went dark.
    expect(String(error.mock.calls[0][0])).toContain("program-set");
    dispose();
  });

  it("cancels the event so the context can be restored at all", () => {
    // Without preventDefault the context is gone permanently and that canvas
    // never paints again.
    const el = canvas();
    const dispose = registerWebglContext(el, "a");
    const event = new Event("webglcontextlost", { cancelable: true });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    dispose();
  });

  it("stops listening once the surface unmounts", () => {
    const el = canvas();
    registerWebglContext(el, "a")();
    el.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(error).not.toHaveBeenCalled();
  });
});
