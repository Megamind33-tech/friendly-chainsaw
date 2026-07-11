/**
 * Phase 7 verification.
 *
 * These tests exercise the pure TypeScript surface of Phase 7 in isolation:
 *   * `parseRundownCsv` / `buildRundownCsv` round-trip
 *   * `parseRundownJson` / `buildRundownJson` round-trip
 *   * `CONTROL_COMMAND_TYPES` matches the wire vocabulary
 *   * `parseDuration` cases (via CSV import — no direct export)
 *
 * Deliberately does NOT try to spawn the Tauri sidecar; that requires a
 * built Tauri host and a GUI. Live end-to-end (real Companion pressing a
 * button, Control Room reacting, snapshot arriving over SSE) is an
 * operator pass documented in `docs/PHASE7_DESIGN.md`.
 *
 * Run with: `bun run scripts/verify-phase7.ts`
 */

import {
  buildRundownCsv,
  buildRundownJson,
  parseRundownCsv,
  parseRundownJson,
  type ProgramItem,
} from "../src/document/playout";
import { CONTROL_COMMAND_TYPES } from "../src/document/controlProtocol";

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

const scenesByName = { "6PM News": "sc_news", "Weather": "sc_weather" };
const scenesById = { sc_news: "6PM News", sc_weather: "Weather" };

console.log("Phase 7 verification\n");

console.log("Rundown CSV import");
test("parses header + rows", () => {
  const csv = [
    "title,type,duration,sceneName",
    "6PM News,program,300,6PM News",
    "Weather,live,120,Weather",
    "Unknown Scene,break,60,MissingScene",
  ].join("\n");
  const items = parseRundownCsv(csv, scenesByName);
  assertEq(items.length, 3, "three items parsed");
  assertEq(items[0].title, "6PM News", "row 0 title");
  assertEq(items[0].type, "program", "row 0 type");
  assertEq(items[0].duration, 300, "row 0 duration");
  assertEq(items[0].sceneId, "sc_news", "row 0 sceneId resolved by name");
  assertEq(items[1].type, "live", "row 1 type");
  assertEq(items[2].sceneId, null, "row 2 sceneId null for missing scene name");
});

test("blank title rows skipped", () => {
  const csv = ["title,duration", ",300", "Real one,60"].join("\n");
  const items = parseRundownCsv(csv, {});
  assertEq(items.length, 1, "only one item");
  assertEq(items[0].title, "Real one", "kept row's title");
});

test("mm:ss duration parses", () => {
  const csv = ["title,duration", "News,05:30"].join("\n");
  const items = parseRundownCsv(csv, {});
  assertEq(items[0].duration, 330, "5m 30s = 330s");
});

test("hh:mm:ss duration parses", () => {
  const csv = ["title,duration", "News,01:00:00"].join("\n");
  const items = parseRundownCsv(csv, {});
  assertEq(items[0].duration, 3600, "1h = 3600s");
});

test("unknown type falls back to program", () => {
  const csv = ["title,type,duration", "News,unknown_variant,60"].join("\n");
  const items = parseRundownCsv(csv, {});
  assertEq(items[0].type, "program", "invalid type coerced");
});

test("quoted cells with commas", () => {
  const csv = ["title,duration", '"Hello, world",60'].join("\n");
  const items = parseRundownCsv(csv, {});
  assertEq(items[0].title, "Hello, world", "quoted-comma title");
});

test("empty input yields empty result", () => {
  assertEq(parseRundownCsv("", {}), [] as ProgramItem[], "empty");
});

test("CSV without title column yields empty", () => {
  const csv = ["duration,type", "60,program"].join("\n");
  assertEq(parseRundownCsv(csv, {}), [] as ProgramItem[], "no title column → skip");
});

console.log("\nRundown CSV round-trip");
test("build → parse preserves fields", () => {
  const original: ProgramItem[] = [
    { id: "a", title: "Show A", type: "program", sceneId: "sc_news", duration: 300 },
    { id: "b", title: "Show B", type: "live", sceneId: null, duration: 60 },
  ];
  const csv = buildRundownCsv(original, scenesById);
  const reparsed = parseRundownCsv(csv, scenesByName);
  assertEq(reparsed.length, 2, "two items round-tripped");
  assertEq(reparsed[0].title, "Show A", "title survives");
  assertEq(reparsed[0].type, "program", "type survives");
  assertEq(reparsed[0].duration, 300, "duration survives");
  assertEq(reparsed[0].sceneId, "sc_news", "sceneId survives via scene name");
  assertEq(reparsed[1].sceneId, null, "null sceneId survives");
});

console.log("\nRundown JSON round-trip");
test("build → parse preserves everything", () => {
  const original: ProgramItem[] = [
    { id: "a", title: "Show A", type: "clip", sceneId: "sc_x", duration: 42 },
    { id: "b", title: "Show B", type: "id", sceneId: null, duration: 5 },
  ];
  const json = buildRundownJson(original);
  const reparsed = parseRundownJson(json);
  assertEq(reparsed.length, 2, "two items");
  assertEq(reparsed[0].title, "Show A", "title round-trips");
  assertEq(reparsed[0].type, "clip", "type round-trips");
  assertEq(reparsed[0].sceneId, "sc_x", "sceneId round-trips (JSON keeps id verbatim)");
  assertEq(reparsed[1].duration, 5, "duration round-trips");
});

test("plain array (no envelope) also parses", () => {
  const items: ProgramItem[] = [
    { id: "a", title: "Solo", type: "program", sceneId: null, duration: 60 },
  ];
  const reparsed = parseRundownJson(JSON.stringify(items));
  assertEq(reparsed.length, 1, "array form works");
});

test("malformed JSON throws", () => {
  let threw = false;
  try {
    parseRundownJson("{not-json}");
  } catch {
    threw = true;
  }
  assert(threw, "expected JSON parse error");
});

console.log("\nControl protocol vocabulary");
test("command types include every documented command", () => {
  const expected = [
    "take",
    "arm",
    "playIn",
    "playOut",
    "takeItem",
    "nextItem",
    "previousItem",
    "playSchedule",
    "pauseSchedule",
    "stopSchedule",
    "startRecord",
    "stopRecord",
    "ping",
  ];
  for (const cmd of expected) {
    assert(CONTROL_COMMAND_TYPES.includes(cmd as (typeof CONTROL_COMMAND_TYPES)[number]), `has ${cmd}`);
  }
  assertEq(CONTROL_COMMAND_TYPES.length, expected.length, "no extra commands");
});

console.log("\n---");
if (failures.length === 0) {
  console.log(`PASS (all Phase 7 verifications succeeded)`);
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
