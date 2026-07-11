/**
 * Phase 9 verification — Rundown Studio connector.
 *
 * Every test here pins an invariant of the Cue → ProgramItem mapping in
 * src/document/rundowncloud.ts. The Rust side has its own unit tests
 * (rundown-id validation + settings round-trip); this script covers the
 * pure JS mapping the UI runs on Import.
 *
 * Run with: `bun run scripts/verify-phase9.ts`
 */

import { mapCueToItem, mapCuesToItems, type RundownCue } from "../src/document/rundowncloud";

type Failure = { name: string; err: unknown };
const failures: Failure[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  fail ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${b}`);
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function cue(overrides: Partial<RundownCue> = {}): RundownCue {
  return {
    id: "rs_1234567890abcdefghij",
    type: "cue",
    title: "Welcome",
    subtitle: "",
    duration: 180000,
    backgroundColor: "#450a0a",
    createdAt: "2026-07-11T18:51:23.326Z",
    updatedAt: "2026-07-11T18:51:23.326Z",
    ...overrides,
  };
}

console.log("Phase 9 verification (Rundown Studio Cue → ProgramItem)\n");

// ---------------------------------------------------------------------------
console.log("Duration ms → seconds");

test("180000 ms → 180 seconds", () => {
  const item = mapCueToItem(cue({ duration: 180000 }));
  assertEq(item.duration, 180, "180s from 180000ms");
});

test("999 ms clamps to 1s (minimum)", () => {
  // The playout ticker will divide-by-zero if we let a 0-duration item
  // through. Clamp is deliberate; see rundowncloud.ts docstring.
  const item = mapCueToItem(cue({ duration: 999 }));
  assertEq(item.duration, 1, "sub-1s cue clamped to 1s minimum");
});

test("0 ms clamps to 1s", () => {
  const item = mapCueToItem(cue({ duration: 0 }));
  assertEq(item.duration, 1, "0ms cue clamped to 1s");
});

test("negative ms clamps to 1s (defensive)", () => {
  // Rundown Studio's spec doesn't allow negative durations, but if their
  // API ever ships one we should still yield a valid item.
  const item = mapCueToItem(cue({ duration: -5000 }));
  assertEq(item.duration, 1, "negative duration clamped");
});

test("rounding half-second", () => {
  // 500ms rounds to 1s (Math.round default: banker's rounding not used here,
  // Math.round(0.5) → 1). Deliberately not floor — a 0.5s cue is more
  // useful as 1s than 0s.
  const item = mapCueToItem(cue({ duration: 500 }));
  assertEq(item.duration, 1, "500ms → 1s");
});

test("large duration preserved", () => {
  const item = mapCueToItem(cue({ duration: 3_600_000 }));
  assertEq(item.duration, 3600, "1h cue → 3600s");
});

// ---------------------------------------------------------------------------
console.log("\nTitle handling");

test("verbatim title round-trips", () => {
  const item = mapCueToItem(cue({ title: "6PM News Open" }));
  assertEq(item.title, "6PM News Open", "title kept exact");
});

test("leading/trailing whitespace trimmed", () => {
  const item = mapCueToItem(cue({ title: "  Weather block  " }));
  assertEq(item.title, "Weather block", "trimmed");
});

test("empty title falls back to 'Untitled cue'", () => {
  const item = mapCueToItem(cue({ title: "" }));
  assertEq(item.title, "Untitled cue", "empty → placeholder");
});

test("whitespace-only title falls back", () => {
  const item = mapCueToItem(cue({ title: "   " }));
  assertEq(item.title, "Untitled cue", "whitespace-only → placeholder");
});

// ---------------------------------------------------------------------------
console.log("\nType inference from title");

test("title with word 'Live' becomes 'live' item type", () => {
  const item = mapCueToItem(cue({ title: "Live remote from City Hall" }));
  assertEq(item.type, "live", "Live → live");
});

test("title with lowercase 'live' also detected", () => {
  const item = mapCueToItem(cue({ title: "going live in 5" }));
  assertEq(item.type, "live", "live → live");
});

test("title with 'LIVE' all caps also detected", () => {
  const item = mapCueToItem(cue({ title: "LIVE BREAKING NEWS" }));
  assertEq(item.type, "live", "LIVE → live");
});

test("title 'delivery' is NOT live (word boundary check)", () => {
  // Naive substring match would false-positive here. The regex is \blive\b
  // so "delivery" (which contains "live" mid-word) stays "program".
  const item = mapCueToItem(cue({ title: "News delivery segment" }));
  assertEq(item.type, "program", "delivery → program (word boundary respected)");
});

test("title 'alive' is NOT live (word boundary check)", () => {
  const item = mapCueToItem(cue({ title: "Show is alive" }));
  assertEq(item.type, "program", "alive → program");
});

test("plain title defaults to 'program'", () => {
  const item = mapCueToItem(cue({ title: "Package rolls" }));
  assertEq(item.type, "program", "default type");
});

// ---------------------------------------------------------------------------
console.log("\nSceneId + fields we discard");

test("sceneId is always null", () => {
  // No scene correlation is knowable at import time — operator assigns
  // scenes after import from the panel.
  const item = mapCueToItem(cue());
  assertEq(item.sceneId, null, "sceneId always null on import");
});

test("id is regenerated locally (not the RS id)", () => {
  const rsId = "rs_1234567890abcdefghij";
  const item = mapCueToItem(cue({ id: rsId }));
  assert(item.id !== rsId, "local id differs from RS id");
  assert(item.id.startsWith("po-rs-"), "local id uses po-rs- prefix");
});

test("subtitle + backgroundColor discarded (not surfaced on ProgramItem)", () => {
  const item = mapCueToItem(cue({ subtitle: "should be gone", backgroundColor: "#ff0000" }));
  // ProgramItem's shape doesn't have subtitle/backgroundColor — this test
  // just confirms the mapping produces the expected shape.
  assertEq(Object.keys(item).sort(), ["duration", "id", "sceneId", "title", "type"], "5 fields exactly");
});

// ---------------------------------------------------------------------------
console.log("\nBatch mapping");

test("mapCuesToItems preserves order + count", () => {
  const cues: RundownCue[] = [
    cue({ title: "A", duration: 60000 }),
    cue({ title: "B", duration: 120000 }),
    cue({ title: "C", duration: 30000 }),
  ];
  const items = mapCuesToItems(cues);
  assertEq(items.length, 3, "three items");
  assertEq(items.map((i) => i.title), ["A", "B", "C"], "order preserved");
  assertEq(items.map((i) => i.duration), [60, 120, 30], "durations preserved");
});

test("empty cue array yields empty item array", () => {
  assertEq(mapCuesToItems([]), [], "empty in, empty out");
});

test("unique local ids across batch", () => {
  const cues: RundownCue[] = Array.from({ length: 20 }, () => cue({ title: "Same title" }));
  const items = mapCuesToItems(cues);
  const ids = new Set(items.map((i) => i.id));
  assertEq(ids.size, 20, "every item gets a unique id");
});

// ---------------------------------------------------------------------------
console.log("\n---");
if (failures.length === 0) {
  console.log("PASS (all Phase 9 verifications succeeded)");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
