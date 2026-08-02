import { describe, expect, it } from "vitest";
import { resolveElement, resolveElements } from "./bindings";
import type { Element, GroupElement, TextElement } from "./types";

/**
 * Binding resolution decides what a graphic literally says on air, and it is
 * where S0-2(d) lived — a fallback of "live" on a status field, firing exactly
 * when the feed was broken. These tests pin the resolution order that decides
 * live value vs fallback vs authored default.
 */

function text(over: Partial<TextElement> = {}): TextElement {
  return {
    id: "t1",
    kind: "text",
    name: "Text",
    text: "AUTHORED",
    transform: { x: 0, y: 0, width: 100, height: 20, rotation: 0 },
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

describe("resolveElement", () => {
  it("returns the element untouched when it has no bindings", () => {
    const el = text();
    expect(resolveElement(el, { anything: "x" })).toBe(el);
  });

  it("overrides the bound field with the live value", () => {
    const el = text({ bindings: [{ targetPath: "text", source: "mock.headline" }] });
    expect((resolveElement(el, { "mock.headline": "LIVE NOW" }) as TextElement).text).toBe("LIVE NOW");
  });

  it("uses the fallback when the source key is absent", () => {
    const el = text({ bindings: [{ targetPath: "text", source: "mock.headline", fallback: "FALLBACK" }] });
    expect((resolveElement(el, {}) as TextElement).text).toBe("FALLBACK");
  });

  it("keeps the authored value when the key is absent and there is no fallback", () => {
    // Never blank a field just because a feed went away mid-show.
    const el = text({ bindings: [{ targetPath: "text", source: "mock.headline" }] });
    expect((resolveElement(el, {}) as TextElement).text).toBe("AUTHORED");
  });

  it("prefers a present-but-empty live value over the fallback", () => {
    // An empty string is data the feed actually sent — deliberately clearing a
    // field is a real operation, and must not silently resurrect the fallback.
    const el = text({ bindings: [{ targetPath: "text", source: "mock.headline", fallback: "FALLBACK" }] });
    expect((resolveElement(el, { "mock.headline": "" }) as TextElement).text).toBe("");
  });

  it("applies the binding format to the live value", () => {
    const el = text({ bindings: [{ targetPath: "text", source: "s.score", format: "{value} PTS" }] });
    expect((resolveElement(el, { "s.score": "12" }) as TextElement).text).toBe("12 PTS");
  });

  it("does NOT format the fallback", () => {
    // The fallback is authored text, already in its final form; formatting it
    // would double-apply a suffix an operator typed into the fallback itself.
    const el = text({
      bindings: [{ targetPath: "text", source: "s.score", format: "{value} PTS", fallback: "— PTS" }],
    });
    expect((resolveElement(el, {}) as TextElement).text).toBe("— PTS");
  });

  it("resolves several bindings on one element", () => {
    const el = text({
      bindings: [
        { targetPath: "text", source: "a" },
        { targetPath: "fill", source: "b" },
      ],
    });
    const out = resolveElement(el, { a: "TEXT", b: "#ff0000" }) as TextElement;
    expect(out.text).toBe("TEXT");
    expect(out.fill).toBe("#ff0000");
  });

  it("applies the last binding when two target the same field", () => {
    const el = text({
      bindings: [
        { targetPath: "text", source: "a" },
        { targetPath: "text", source: "b" },
      ],
    });
    expect((resolveElement(el, { a: "FIRST", b: "SECOND" }) as TextElement).text).toBe("SECOND");
  });

  it("never mutates the input element", () => {
    // The store holds the authored default; only the rendered copy carries
    // resolved values. Mutating here would write live data into the document.
    const el = text({ bindings: [{ targetPath: "text", source: "a" }] });
    const snapshot = JSON.parse(JSON.stringify(el));
    resolveElement(el, { a: "LIVE" });
    expect(el).toEqual(snapshot);
  });
});

describe("groups", () => {
  function group(children: Element[]): GroupElement {
    return {
      id: "g1",
      kind: "group",
      name: "Group",
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      visible: true,
      locked: false,
      opacity: 1,
      bindings: [],
      children,
    } as GroupElement;
  }

  it("resolves nested children", () => {
    const g = group([text({ id: "c1", bindings: [{ targetPath: "text", source: "a" }] })]);
    const out = resolveElement(g, { a: "NESTED" }) as GroupElement;
    expect((out.children[0] as TextElement).text).toBe("NESTED");
  });

  it("resolves through two levels of nesting", () => {
    const inner = group([text({ id: "deep", bindings: [{ targetPath: "text", source: "a" }] })]);
    const outer = group([inner]);
    const out = resolveElement(outer, { a: "DEEP" }) as GroupElement;
    const nested = (out.children[0] as GroupElement).children[0] as TextElement;
    expect(nested.text).toBe("DEEP");
  });

  it("does not mutate the original children", () => {
    const g = group([text({ id: "c1", bindings: [{ targetPath: "text", source: "a" }] })]);
    const snapshot = JSON.parse(JSON.stringify(g));
    resolveElement(g, { a: "NESTED" });
    expect(g).toEqual(snapshot);
  });
});

describe("resolveElements", () => {
  it("resolves a list independently", () => {
    const out = resolveElements(
      [
        text({ id: "a", bindings: [{ targetPath: "text", source: "k1" }] }),
        text({ id: "b", bindings: [{ targetPath: "text", source: "k2" }] }),
      ],
      { k1: "ONE", k2: "TWO" },
    ) as TextElement[];
    expect(out.map((e) => e.text)).toEqual(["ONE", "TWO"]);
  });

  it("survives an empty value map without throwing", () => {
    expect(() => resolveElements([text({ bindings: [{ targetPath: "text", source: "x" }] })], {})).not.toThrow();
  });
});
