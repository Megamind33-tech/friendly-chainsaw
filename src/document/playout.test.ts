import { describe, expect, it } from "vitest";
import {
  buildAsRunCsv,
  buildRundownCsv,
  buildRundownJson,
  endStatusFor,
  fmtDuration,
  fmtTimeOfDay,
  parseRundownCsv,
  parseRundownJson,
  projectedStartSecs,
  type AsRunEntry,
  type ProgramItem,
} from "./playout";

/**
 * Rundown timing and import/export. The as-run log is the station's record of
 * what actually aired, and the rundown files are the interchange format with
 * whatever the newsroom already uses — both have to be exactly right, and
 * neither had unit coverage.
 */

function item(over: Partial<ProgramItem> = {}): ProgramItem {
  return { id: "i1", title: "Item", type: "program", sceneId: null, duration: 300, ...over };
}

describe("projectedStartSecs", () => {
  it("accumulates durations from the schedule start", () => {
    const starts = projectedStartSecs(
      [item({ duration: 60 }), item({ duration: 120 }), item({ duration: 30 })],
      // 18:00:00
      64800,
    );
    expect(starts).toEqual([64800, 64860, 64980]);
  });

  it("wraps past midnight instead of running past 24h", () => {
    // A late-night rundown crossing midnight must show 00:00:30, not 24:00:30.
    const starts = projectedStartSecs([item({ duration: 60 }), item({ duration: 60 })], 86_370);
    expect(starts[0]).toBe(86_370);
    expect(starts[1]).toBe(30);
  });

  it("returns nothing for an empty rundown", () => {
    expect(projectedStartSecs([], 0)).toEqual([]);
  });
});

describe("endStatusFor", () => {
  it("never marks a live item as cut", () => {
    // Live items are open-ended: the control room ends them, so taking out of
    // a live hit early is a normal completion, not an early cut. This is
    // operator-visible in the as-run log.
    expect(endStatusFor(item({ type: "live", duration: 600 }), 5)).toBe("completed");
    expect(endStatusFor(item({ type: "live", duration: 600 }), 0)).toBe("completed");
  });

  it("marks a non-live item taken early as cut", () => {
    expect(endStatusFor(item({ duration: 300 }), 100)).toBe("cut");
  });

  it("counts a full run as completed, with a small tolerance", () => {
    expect(endStatusFor(item({ duration: 300 }), 300)).toBe("completed");
    // 0.3s of tolerance so a frame of scheduler jitter is not logged as a cut.
    expect(endStatusFor(item({ duration: 300 }), 299.8)).toBe("completed");
    expect(endStatusFor(item({ duration: 300 }), 299.5)).toBe("cut");
  });

  it("treats a missing item as completed rather than throwing", () => {
    expect(endStatusFor(undefined, 0)).toBe("completed");
  });
});

describe("fmtTimeOfDay", () => {
  it("formats seconds since midnight as a 24h clock", () => {
    expect(fmtTimeOfDay(0)).toBe("00:00:00");
    expect(fmtTimeOfDay(64_800)).toBe("18:00:00");
    expect(fmtTimeOfDay(86_399)).toBe("23:59:59");
  });

  it("wraps rather than overflowing past 24h", () => {
    expect(fmtTimeOfDay(86_400)).toBe("00:00:00");
    expect(fmtTimeOfDay(90_000)).toBe("01:00:00");
  });

  it("normalises a negative time instead of printing a minus sign", () => {
    // A rundown that backs up before its start must not display "-1:00:00".
    expect(fmtTimeOfDay(-1)).toBe("23:59:59");
  });

  it("renders an em dash for no time", () => {
    expect(fmtTimeOfDay(null)).toBe("—");
  });
});

describe("fmtDuration", () => {
  it("uses mm:ss under an hour and h:mm:ss at or above", () => {
    expect(fmtDuration(0)).toBe("00:00");
    expect(fmtDuration(65)).toBe("01:05");
    expect(fmtDuration(3600)).toBe("1:00:00");
    expect(fmtDuration(3725)).toBe("1:02:05");
  });

  it("clamps a negative duration to zero", () => {
    expect(fmtDuration(-30)).toBe("00:00");
  });
});

describe("rundown CSV", () => {
  const scenes = { "News Open": "scene-1" };

  it("parses title, type, duration and scene name", () => {
    const items = parseRundownCsv("title,type,duration,sceneName\nOpener,live,90,News Open", scenes);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Opener");
    expect(items[0].type).toBe("live");
    expect(items[0].duration).toBe(90);
    expect(items[0].sceneId).toBe("scene-1");
  });

  it("accepts mm:ss and hh:mm:ss durations as well as bare seconds", () => {
    const items = parseRundownCsv("title,duration\nA,90\nB,01:30\nC,01:00:30", scenes);
    expect(items.map((i) => i.duration)).toEqual([90, 90, 3630]);
  });

  it("defaults an unknown type to program rather than an invalid enum", () => {
    const items = parseRundownCsv("title,type\nA,nonsense", scenes);
    expect(items[0].type).toBe("program");
  });

  it("leaves an unmatched scene name unassigned instead of failing the import", () => {
    // The operator assigns it later; refusing the whole file would be worse.
    const items = parseRundownCsv("title,sceneName\nA,No Such Scene", scenes);
    expect(items[0].sceneId).toBeNull();
  });

  it("skips rows with no title", () => {
    const items = parseRundownCsv("title,duration\nA,60\n,120\nB,30", scenes);
    expect(items.map((i) => i.title)).toEqual(["A", "B"]);
  });

  it("returns nothing when there is no title column", () => {
    expect(parseRundownCsv("foo,bar\n1,2", scenes)).toEqual([]);
    expect(parseRundownCsv("", scenes)).toEqual([]);
  });

  it("enforces a minimum duration of one second", () => {
    expect(parseRundownCsv("title,duration\nA,0", scenes)[0].duration).toBe(1);
  });

  it("round-trips through build and parse", () => {
    const items = [
      item({ title: "Opener", type: "live", duration: 90, sceneId: "scene-1" }),
      item({ id: "i2", title: "Package", type: "clip", duration: 150, sceneId: null }),
    ];
    const csv = buildRundownCsv(items, { "scene-1": "News Open" });
    const parsed = parseRundownCsv(csv, scenes);
    expect(parsed.map((i) => [i.title, i.type, i.duration, i.sceneId])).toEqual([
      ["Opener", "live", 90, "scene-1"],
      ["Package", "clip", 150, null],
    ]);
  });

  it("round-trips a title containing a comma and quotes", () => {
    // Story titles routinely contain commas; a naive split would shift every
    // later column and silently corrupt durations.
    const tricky = 'Budget, jobs and the "gap"';
    const csv = buildRundownCsv([item({ title: tricky })], {});
    expect(parseRundownCsv(csv, {})[0].title).toBe(tricky);
  });
});

describe("rundown JSON", () => {
  it("round-trips through build and parse", () => {
    const items = [item({ title: "A", type: "break", duration: 45 })];
    const parsed = parseRundownJson(buildRundownJson(items));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("A");
    expect(parsed[0].type).toBe("break");
    expect(parsed[0].duration).toBe(45);
  });

  it("accepts a bare array as well as the wrapped envelope", () => {
    expect(parseRundownJson(JSON.stringify([{ title: "A", duration: 30 }]))).toHaveLength(1);
  });

  it("drops entries with no title and returns nothing for junk", () => {
    expect(parseRundownJson(JSON.stringify({ items: [{ duration: 30 }, null, "x"] }))).toEqual([]);
    expect(parseRundownJson(JSON.stringify({ nope: true }))).toEqual([]);
  });
});

describe("as-run CSV", () => {
  const entry = (over: Partial<AsRunEntry> = {}): AsRunEntry =>
    ({
      id: "a1",
      title: "Opener",
      type: "live",
      scheduledSec: 64_800,
      actualStartMs: null,
      actualEndMs: null,
      plannedSec: 90,
      actualSec: 92,
      status: "completed",
      ...over,
    }) as AsRunEntry;

  it("emits a header and one row per entry", () => {
    const lines = buildAsRunCsv([entry()]).split("\r\n").filter(Boolean);
    expect(lines[0]).toContain("Title");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Opener");
  });

  it("emits chronologically even though the store keeps entries newest-first", () => {
    // The archive is read top-down as a record of the show.
    const csv = buildAsRunCsv([entry({ id: "b", title: "Second" }), entry({ id: "a", title: "First" })]);
    expect(csv.indexOf("First")).toBeLessThan(csv.indexOf("Second"));
  });

  it("quotes a title containing a comma", () => {
    const csv = buildAsRunCsv([entry({ title: "Budget, jobs" })]);
    expect(csv).toContain('"Budget, jobs"');
  });

  it("produces just a header for an empty log", () => {
    expect(buildAsRunCsv([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});
