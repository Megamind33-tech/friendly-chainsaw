import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { usePlayoutStore, type ProgramItem } from "./playout";

/**
 * Live rundown transport.
 *
 * The as-run log is the station's record of what actually aired, and it is
 * written by these actions. Every test here is really about that record being
 * truthful: an item that went to air appears exactly once, with the right
 * status, and a stopped show is genuinely off air rather than leaving a ghost
 * item advancing.
 */

const store = () => usePlayoutStore.getState();

function reset(items: ProgramItem[] = []) {
  store().stop();
  usePlayoutStore.setState({ items, asRun: [], currentId: null, progress: 0, isPlaying: false });
}

function item(over: Partial<ProgramItem> = {}): ProgramItem {
  return { id: "a", title: "A", type: "program", sceneId: null, duration: 300, ...over };
}

const three = () => [item({ id: "a", title: "A" }), item({ id: "b", title: "B" }), item({ id: "c", title: "C" })];

beforeEach(() => reset(three()));
// The transport starts a real interval; leaving it running would bleed
// progress into the next test.
afterEach(() => store().pause());

describe("play", () => {
  it("puts the first item to air when nothing is current", () => {
    store().play();
    expect(store().currentId).toBe("a");
    expect(store().isPlaying).toBe(true);
  });

  it("resumes the current item rather than restarting the rundown", () => {
    store().takeItem("b");
    store().play();
    expect(store().currentId).toBe("b");
  });

  it("does nothing with an empty rundown", () => {
    reset([]);
    store().play();
    expect(store().currentId).toBeNull();
  });
});

describe("takeItem", () => {
  it("puts the named item to air", () => {
    store().takeItem("b");
    expect(store().currentId).toBe("b");
  });

  it("logs the outgoing item as cut when taken early", () => {
    store().takeItem("a");
    store().takeItem("b");
    const entry = store().asRun.find((e) => e.title === "A");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("cut");
  });

  it("logs a live item as completed however early it is taken out of", () => {
    // Live hits are open-ended; the control room ends them, so taking out is a
    // normal completion. This is operator-visible in the as-run log.
    reset([item({ id: "live", title: "Live", type: "live", duration: 600 }), item({ id: "b" })]);
    store().takeItem("live");
    store().takeItem("b");
    expect(store().asRun.find((e) => e.title === "Live")!.status).toBe("completed");
  });

  it("writes exactly one as-run entry per item aired", () => {
    // A duplicated entry would misreport the show to whoever archives it.
    store().takeItem("a");
    store().takeItem("b");
    store().takeItem("c");
    expect(store().asRun.filter((e) => e.title === "A")).toHaveLength(1);
  });

  it("keeps the newest entry first, including the item still on air", () => {
    store().takeItem("a");
    store().takeItem("b");
    store().takeItem("c");
    // An entry is opened the moment an item goes to air and closed when it
    // leaves, so the log's head is the item currently airing with a null
    // actualEnd — the log shows the show as it happens, not only in arrears.
    // The store holds newest-first; buildAsRunCsv reverses it for the archive.
    expect(store().asRun[0].title).toBe("C");
    expect(store().asRun[0].actualEnd).toBeNull();
    expect(store().asRun[1].title).toBe("B");
    expect(store().asRun[1].actualEnd).not.toBeNull();
  });

  it("resets progress for the incoming item", () => {
    store().takeItem("a");
    usePlayoutStore.setState({ progress: 120 });
    store().takeItem("b");
    expect(store().progress).toBe(0);
  });
});

describe("next / previous", () => {
  it("advances through the rundown in order", () => {
    store().takeItem("a");
    store().next();
    expect(store().currentId).toBe("b");
    store().next();
    expect(store().currentId).toBe("c");
  });

  it("puts the first item to air when nothing is current", () => {
    store().next();
    expect(store().currentId).toBe("a");
  });

  it("steps back", () => {
    store().takeItem("c");
    store().previous();
    expect(store().currentId).toBe("b");
  });

  it("holds at the first item rather than falling off the top", () => {
    store().takeItem("a");
    store().previous();
    expect(store().currentId).toBe("a");
  });

  it("logs each item it advances past", () => {
    store().takeItem("a");
    store().next();
    store().next();
    expect(store().asRun.map((e) => e.title)).toContain("A");
    expect(store().asRun.map((e) => e.title)).toContain("B");
  });
});

describe("stop", () => {
  it("takes the show off air and closes the as-run entry", () => {
    store().takeItem("a");
    store().stop();
    expect(store().currentId).toBeNull();
    expect(store().isPlaying).toBe(false);
    expect(store().progress).toBe(0);
    const entry = store().asRun.find((e) => e.title === "A")!;
    expect(entry.actualEnd).not.toBeNull();
  });

  it("is safe with nothing on air", () => {
    expect(() => store().stop()).not.toThrow();
    expect(store().asRun).toHaveLength(0);
  });
});

describe("rundown editing while on air", () => {
  it("stops cleanly when an import drops the item currently airing", () => {
    // Otherwise the ticker keeps advancing a ghost currentId that no longer
    // resolves to anything, and the as-run entry is never closed.
    store().takeItem("a");
    store().replaceRundown([item({ id: "x", title: "X" })]);
    expect(store().currentId).toBeNull();
    expect(store().asRun.find((e) => e.title === "A")!.actualEnd).not.toBeNull();
  });

  it("keeps airing when the import retains the current item", () => {
    store().takeItem("a");
    store().replaceRundown([item({ id: "a", title: "A" }), item({ id: "z", title: "Z" })]);
    expect(store().currentId).toBe("a");
  });

  it("replaces rather than appends", () => {
    // Operators importing a new schedule expect the old one gone; merge
    // semantics would be ambiguous.
    store().replaceRundown([item({ id: "x", title: "X" })]);
    expect(store().items.map((i) => i.title)).toEqual(["X"]);
  });
});

describe("moveItem", () => {
  it("reorders within the rundown", () => {
    store().moveItem("a", 1);
    expect(store().items.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("holds at the ends rather than wrapping", () => {
    store().moveItem("a", -1);
    expect(store().items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    store().moveItem("c", 1);
    expect(store().items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("removeItem", () => {
  it("removes from the rundown", () => {
    store().removeItem("b");
    expect(store().items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("clearAsRun", () => {
  it("empties the log without touching the rundown or what is on air", () => {
    store().takeItem("a");
    store().takeItem("b");
    store().clearAsRun();
    expect(store().asRun).toHaveLength(0);
    expect(store().items).toHaveLength(3);
    expect(store().currentId).toBe("b");
  });
});
