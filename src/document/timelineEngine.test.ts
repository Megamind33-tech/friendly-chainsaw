import { describe, expect, it } from "vitest";
import {
  applyElementLoop,
  applyPlayback,
  applyScroll,
  elapsedSeconds,
  hasAnyLoopPulse,
  isPlaybackActive,
} from "./timelineEngine";
import type { AnimPhaseSpec, Element, Layer, TextElement, Timeline } from "./types";

/**
 * Playback gating decides whether a layer is visible on air at all, and the
 * interpolation decides where it sits mid-animation. Every consumer (the
 * editor, Program, Preview, and the sidecar-served renderer OBS reads) runs
 * this same pure code against its own clock, so these are the guarantees that
 * keep those surfaces showing the same frame.
 */

const timeline: Timeline = { inDuration: 1, outDuration: 1, inEase: "none", outEase: "none" };

function text(over: Partial<TextElement> = {}): TextElement {
  return {
    id: "t1",
    kind: "text",
    name: "Text",
    text: "HELLO",
    transform: { x: 100, y: 200, width: 300, height: 40, rotation: 0 },
    visible: true,
    locked: false,
    opacity: 1,
    bindings: [],
    fontSize: 16,
    fontFamily: "sans-serif",
    fill: "#fff",
    align: "left",
    ...over,
  } as TextElement;
}

describe("applyPlayback — layer-wide timeline", () => {
  it("starts an IN fully hidden and offset", () => {
    const out = applyPlayback(text(), 0, timeline, "in");
    expect(out.opacity).toBe(0);
    expect(out.transform.y).toBeGreaterThan(200);
  });

  it("lands an IN exactly on the authored resting state", () => {
    // The end state must be pixel-exact: a layer that settles one pixel off
    // its authored position is visibly wrong against a lower-third safe area.
    const out = applyPlayback(text(), 1, timeline, "in");
    expect(out.opacity).toBe(1);
    expect(out.transform.y).toBe(200);
    expect(out.transform.x).toBe(100);
  });

  it("stays settled past the end of the duration", () => {
    const out = applyPlayback(text(), 99, timeline, "in");
    expect(out.opacity).toBe(1);
    expect(out.transform.y).toBe(200);
  });

  it("mirrors IN for OUT", () => {
    const start = applyPlayback(text(), 0, timeline, "out");
    expect(start.opacity).toBe(1);
    expect(start.transform.y).toBe(200);

    const end = applyPlayback(text(), 1, timeline, "out");
    expect(end.opacity).toBe(0);
    expect(end.transform.y).toBeGreaterThan(200);
  });

  it("scales opacity by the element's own authored opacity", () => {
    // A half-transparent element must not become fully opaque just because
    // its IN completed.
    const out = applyPlayback(text({ opacity: 0.5 }), 1, timeline, "in");
    expect(out.opacity).toBeCloseTo(0.5);
  });

  it("treats a zero duration as instantly settled rather than dividing by zero", () => {
    const instant: Timeline = { ...timeline, inDuration: 0 };
    const out = applyPlayback(text(), 0, instant, "in");
    expect(out.opacity).toBe(1);
    expect(Number.isFinite(out.transform.y)).toBe(true);
  });

  it("never mutates the input element", () => {
    const el = text();
    const snapshot = JSON.parse(JSON.stringify(el));
    applyPlayback(el, 0.5, timeline, "in");
    expect(el).toEqual(snapshot);
  });

  it("recurses into groups so children animate too", () => {
    const group = {
      id: "g",
      kind: "group",
      name: "G",
      transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      visible: true,
      locked: false,
      opacity: 1,
      bindings: [],
      children: [text({ id: "child" })],
    } as unknown as Element;
    const out = applyPlayback(group, 0, timeline, "in");
    const child = (out as unknown as { children: Element[] }).children[0];
    expect(child.opacity).toBe(0);
  });
});

describe("applyPlayback — per-element choreography", () => {
  const spec = (over: Partial<AnimPhaseSpec> = {}): AnimPhaseSpec =>
    ({ duration: 1, delay: 0, ease: "none", direction: "left", distance: 100, fade: true, ...over }) as AnimPhaseSpec;

  it("holds an element off screen until its own delay", () => {
    // Before its delay it must be invisible, not parked at its offset in
    // plain sight waiting for its turn.
    const el = text({ anim: { in: spec({ delay: 0.5 }) } } as Partial<TextElement>);
    expect(applyPlayback(el, 0.2, timeline, "in").opacity).toBe(0);
  });

  it("enters from the specified direction", () => {
    const left = applyPlayback(text({ anim: { in: spec({ direction: "left" }) } } as Partial<TextElement>), 0, timeline, "in");
    expect(left.transform.x).toBeLessThan(100);

    const right = applyPlayback(text({ anim: { in: spec({ direction: "right" }) } } as Partial<TextElement>), 0, timeline, "in");
    expect(right.transform.x).toBeGreaterThan(100);

    const top = applyPlayback(text({ anim: { in: spec({ direction: "top" }) } } as Partial<TextElement>), 0, timeline, "in");
    expect(top.transform.y).toBeLessThan(200);
  });

  it("does not move at all for direction none", () => {
    const el = text({ anim: { in: spec({ direction: "none" }) } } as Partial<TextElement>);
    const out = applyPlayback(el, 0.5, timeline, "in");
    expect(out.transform.x).toBe(100);
    expect(out.transform.y).toBe(200);
  });

  it("wipes in fully opaque when fade is off", () => {
    // Bars slide in solid; only text dissolves. Mid-flight opacity must be
    // full, not interpolated.
    const el = text({ anim: { in: spec({ fade: false }) } } as Partial<TextElement>);
    expect(applyPlayback(el, 0.5, timeline, "in").opacity).toBe(1);
  });

  it("scales around the element's own centre, not its corner", () => {
    // direction "none" isolates scale from slide: with a direction the centre
    // legitimately moves, and scale is applied around the *slid* centre.
    const el = text({ anim: { in: spec({ direction: "none", scaleFrom: 0 }) } } as Partial<TextElement>);
    const originalCx = 100 + 300 / 2;
    const originalCy = 200 + 40 / 2;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const frame = applyPlayback(el, t, timeline, "in");
      expect(frame.transform.x + frame.transform.width / 2).toBeCloseTo(originalCx);
      expect(frame.transform.y + frame.transform.height / 2).toBeCloseTo(originalCy);
    }
  });

  it("grows from scaleFrom to the authored size", () => {
    const el = text({ anim: { in: spec({ direction: "none", scaleFrom: 0.5 }) } } as Partial<TextElement>);
    expect(applyPlayback(el, 0, timeline, "in").transform.width).toBeCloseTo(150);
    expect(applyPlayback(el, 1, timeline, "in").transform.width).toBeCloseTo(300);
  });

  it("leaves geometry byte-identical when no scale is specified", () => {
    // Pre-5.11 specs must not pick up floating-point drift from a scale
    // computation that should be skipped entirely.
    const el = text({ anim: { in: spec({ direction: "none" }) } } as Partial<TextElement>);
    const out = applyPlayback(el, 0.37, timeline, "in");
    expect(out.transform.width).toBe(300);
    expect(out.transform.height).toBe(40);
    expect(out.transform.x).toBe(100);
  });

  it("counts a numeric value up and lands exactly on target", () => {
    const el = text({ text: "1000", anim: { in: spec({ countUp: true }) } } as Partial<TextElement>);
    expect((applyPlayback(el, 0.5, timeline, "in") as TextElement).text).toBe("500");
    expect((applyPlayback(el, 1, timeline, "in") as TextElement).text).toBe("1000");
  });

  it("preserves decimal places while counting up", () => {
    const el = text({ text: "52.30", anim: { in: spec({ countUp: true }) } } as Partial<TextElement>);
    expect((applyPlayback(el, 1, timeline, "in") as TextElement).text).toBe("52.30");
  });

  it("leaves non-numeric text alone rather than mangling it", () => {
    // countUp on a bound field that resolved to a name must be a no-op.
    const el = text({ text: "ADA LOVELACE", anim: { in: spec({ countUp: true }) } } as Partial<TextElement>);
    expect((applyPlayback(el, 0.5, timeline, "in") as TextElement).text).toBe("ADA LOVELACE");
  });

  it("does not count up on the way out", () => {
    const el = text({ text: "1000", anim: { out: spec({ countUp: true }) } } as Partial<TextElement>);
    expect((applyPlayback(el, 0.5, timeline, "out") as TextElement).text).toBe("1000");
  });
});

describe("isPlaybackActive", () => {
  it("is active only while inside the phase duration", () => {
    // This gates the animation ticker: returning true forever would keep
    // Program requesting frames for a settled graphic.
    expect(isPlaybackActive(0, timeline, "in")).toBe(true);
    expect(isPlaybackActive(0.99, timeline, "in")).toBe(true);
    expect(isPlaybackActive(1, timeline, "in")).toBe(false);
    expect(isPlaybackActive(5, timeline, "in")).toBe(false);
  });

  it("uses the phase's own duration", () => {
    const asym: Timeline = { ...timeline, inDuration: 0.5, outDuration: 3 };
    expect(isPlaybackActive(1, asym, "in")).toBe(false);
    expect(isPlaybackActive(1, asym, "out")).toBe(true);
  });
});

describe("elapsedSeconds", () => {
  it("measures from startedAt against the supplied clock", () => {
    expect(elapsedSeconds({ phase: "in", startedAt: 1000 }, 3500)).toBeCloseTo(2.5);
  });

  it("never goes negative for a future timestamp", () => {
    // Clock skew between windows must not drive an animation backwards.
    expect(elapsedSeconds({ phase: "in", startedAt: 5000 }, 1000)).toBe(0);
  });
});

describe("applyScroll", () => {
  it("moves the element left over time", () => {
    const out = applyScroll(text(), 1, 100, 1000);
    expect(out.transform.x).toBeLessThan(100);
  });

  it("wraps at the loop width instead of running off forever", () => {
    const atWrap = applyScroll(text(), 10, 100, 1000);
    const atStart = applyScroll(text(), 0, 100, 1000);
    expect(atWrap.transform.x).toBeCloseTo(atStart.transform.x);
  });

  it("does not move at zero speed", () => {
    expect(applyScroll(text(), 5, 0, 1000).transform.x).toBe(100);
  });
});

describe("loop pulses", () => {
  it("reports no pulse for plain layers", () => {
    const layers = [{ props: { kind: "gfx2d", elements: [text()] } }] as unknown as Layer[];
    expect(hasAnyLoopPulse(layers)).toBe(false);
  });

  it("leaves an element without a loop spec untouched", () => {
    const el = text();
    expect(applyElementLoop(el, 1.23)).toBe(el);
  });
});
