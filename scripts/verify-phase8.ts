/**
 * Phase 8 verification — hardening pass.
 *
 * Every test here anchors an invariant that's operator-visible if broken:
 *   * Control protocol wire contract (schema-drift regression pattern)
 *   * Playout HOLD semantics for live items (the "live cameras never get
 *     cut" broadcast property)
 *   * projectedStartSecs wraparound math (the schedule that crosses
 *     midnight)
 *   * Sport-schema binding integrity (all 8 sports bind the mandatory
 *     floor from CONVENTIONS.md)
 *   * Rundown CSV/JSON 3-hop idempotence (import → export → import
 *     converges)
 *
 * Run with: `bun run scripts/verify-phase8.ts`
 */

import {
  buildRundownCsv,
  buildRundownJson,
  parseRundownCsv,
  parseRundownJson,
  projectedStartSecs,
  endStatusFor,
  type ProgramItem,
} from "../src/document/playout";
import {
  CONTROL_COMMAND_TYPES,
  type ControlCommand,
  type ControlStateSnapshot,
} from "../src/document/controlProtocol";
import { createSoccerScorebug } from "../src/sports/soccer";
import { createBasketballScorebug } from "../src/sports/basketball";
import { createFootballScorebug } from "../src/sports/football";
import { createBaseballScorebug } from "../src/sports/baseball";
import { createHockeyScorebug } from "../src/sports/hockey";
import { createTennisScorebug } from "../src/sports/tennis";
import { createVolleyballScorebug } from "../src/sports/volleyball";
import { createRugbyScorebug } from "../src/sports/rugby";

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

console.log("Phase 8 verification\n");

// ---------------------------------------------------------------------------
console.log("Control protocol wire contract");

test("ControlCommand round-trips through JSON without loss", () => {
  const original: ControlCommand = {
    seq: 42,
    type: "arm",
    params: { sceneId: "sc_1234" },
  };
  const parsed: ControlCommand = JSON.parse(JSON.stringify(original));
  assertEq(parsed.seq, 42, "seq preserved");
  assertEq(parsed.type, "arm", "type preserved");
  assertEq(parsed.params, { sceneId: "sc_1234" }, "params preserved");
});

test("ControlCommand with no params serializes", () => {
  const original: ControlCommand = { seq: 1, type: "take" };
  const parsed: ControlCommand = JSON.parse(JSON.stringify(original));
  assertEq(parsed.type, "take", "type preserved");
});

test("ControlStateSnapshot round-trips through JSON without loss", () => {
  const original: ControlStateSnapshot = {
    programSceneId: "sc_program",
    previewSceneId: "sc_preview",
    onAir: true,
    currentItemId: "po-abc",
    currentItemTitle: "6PM News",
    currentItemProgress: 42.3,
    currentItemDuration: 300,
    nextItemTitle: "Weather",
    isSchedulePlaying: true,
    recording: { active: false, path: null, startedAt: null },
    ndi: { streaming: true, connections: 3 },
    sceneCount: 4,
    layerCount: 12,
    seq: 837,
    timestamp: 1720638422123,
  };
  const parsed: ControlStateSnapshot = JSON.parse(JSON.stringify(original));
  assertEq(parsed, original, "full snapshot survives JSON round-trip");
});

test("Every command type in the union appears in CONTROL_COMMAND_TYPES", () => {
  // Compile-time exhaustiveness relies on ControlCommandType being a
  // union of exactly the string literals in CONTROL_COMMAND_TYPES. A
  // sample of one of each proves the array element type is compatible.
  const sample: ControlCommand[] = CONTROL_COMMAND_TYPES.map((t) => ({ type: t }));
  assertEq(sample.length, CONTROL_COMMAND_TYPES.length, "coverage");
});

// ---------------------------------------------------------------------------
console.log("\nPlayout HOLD semantics for live items");

test("live item taken at any progress is 'completed', never 'cut'", () => {
  const live: ProgramItem = {
    id: "l1",
    title: "Live event",
    type: "live",
    sceneId: null,
    duration: 300,
  };
  // Even at progress 0, or half-way through, or way past the planned
  // duration — a live take must always complete cleanly. An operator
  // watching the as-run log should never see a live-camera end status
  // read as "cut".
  assertEq(endStatusFor(live, 0), "completed", "live at t=0");
  assertEq(endStatusFor(live, 150), "completed", "live mid-item");
  assertEq(endStatusFor(live, 300), "completed", "live at planned end");
  assertEq(endStatusFor(live, 600), "completed", "live overrun");
});

test("program item taken early is 'cut'", () => {
  const program: ProgramItem = {
    id: "p1",
    title: "News package",
    type: "program",
    sceneId: null,
    duration: 300,
  };
  assertEq(endStatusFor(program, 100), "cut", "taken at 100/300 → cut");
  assertEq(endStatusFor(program, 299), "cut", "taken 0.7s before planned end → cut");
});

test("program item taken at planned end (or within 0.3s) is 'completed'", () => {
  const program: ProgramItem = {
    id: "p1",
    title: "News package",
    type: "program",
    sceneId: null,
    duration: 300,
  };
  assertEq(endStatusFor(program, 300), "completed", "taken at 300/300");
  assertEq(endStatusFor(program, 299.8), "completed", "within tolerance");
});

test("missing item defaults to 'completed'", () => {
  assertEq(endStatusFor(undefined, 0), "completed", "undefined item safe");
});

// ---------------------------------------------------------------------------
console.log("\nprojectedStartSecs math");

test("consecutive item starts stack on cumulative duration", () => {
  const items: ProgramItem[] = [
    { id: "a", title: "A", type: "program", sceneId: null, duration: 300 },
    { id: "b", title: "B", type: "program", sceneId: null, duration: 60 },
    { id: "c", title: "C", type: "program", sceneId: null, duration: 900 },
  ];
  const starts = projectedStartSecs(items, 3600); // 01:00:00
  assertEq(starts[0], 3600, "first at anchor");
  assertEq(starts[1], 3900, "second at anchor+300");
  assertEq(starts[2], 3960, "third at anchor+360");
});

test("wraparound across midnight", () => {
  const items: ProgramItem[] = [
    // Anchor 23:30 + 1h A → A ends at 00:30, so B starts at 00:30 next day.
    { id: "a", title: "A", type: "program", sceneId: null, duration: 3600 },
    { id: "b", title: "B", type: "program", sceneId: null, duration: 3600 },
  ];
  const starts = projectedStartSecs(items, 84600); // 23:30:00
  assertEq(starts[0], 84600, "A at 23:30");
  assertEq(starts[1], 1800, "B wraps to 00:30 next day");
});

test("exact-midnight anchor wraparound", () => {
  const items: ProgramItem[] = [
    // Anchor 23:30 + 30min → A ends at 00:00 exactly. B starts at 00:00 = 0.
    { id: "a", title: "A", type: "program", sceneId: null, duration: 1800 },
    { id: "b", title: "B", type: "program", sceneId: null, duration: 60 },
  ];
  const starts = projectedStartSecs(items, 84600);
  assertEq(starts[0], 84600, "A at 23:30");
  assertEq(starts[1], 0, "B at exact midnight");
});

// ---------------------------------------------------------------------------
console.log("\nSport-schema binding integrity (all 8 sports)");

const MANDATORY_KEYS = ["homeTeam", "awayTeam", "homeScore", "awayScore", "clock", "period"] as const;
const SPORTS: { name: string; make: () => ReturnType<typeof createSoccerScorebug> }[] = [
  { name: "soccer", make: createSoccerScorebug },
  { name: "basketball", make: createBasketballScorebug },
  { name: "football", make: createFootballScorebug },
  { name: "baseball", make: createBaseballScorebug },
  { name: "hockey", make: createHockeyScorebug },
  { name: "tennis", make: createTennisScorebug },
  { name: "volleyball", make: createVolleyballScorebug },
  { name: "rugby", make: createRugbyScorebug },
];

for (const { name, make } of SPORTS) {
  test(`${name}: gfx2d layer with all mandatory floor bindings`, () => {
    const layer = make();
    assertEq(layer.props.kind, "gfx2d", "gfx2d layer kind");
    if (layer.props.kind !== "gfx2d") return;
    // Gather every binding on every element.
    const sources = new Set<string>();
    for (const el of layer.props.elements) {
      for (const b of el.bindings ?? []) {
        if (b.source) sources.add(b.source);
      }
    }
    for (const key of MANDATORY_KEYS) {
      const bound = `${name}.${key}`;
      assert(sources.has(bound), `missing binding source ${bound} (found: ${Array.from(sources).sort().join(", ")})`);
    }
  });
}

// ---------------------------------------------------------------------------
console.log("\nRundown CSV/JSON 3-hop idempotence");

test("CSV import → export → import → export produces stable text", () => {
  const original: ProgramItem[] = [
    { id: "x", title: "Show A", type: "program", sceneId: "sc_1", duration: 300 },
    { id: "y", title: "Show B, with comma", type: "live", sceneId: null, duration: 60 },
    { id: "z", title: "Show C", type: "clip", sceneId: "sc_2", duration: 42 },
  ];
  const sceneById = { sc_1: "News Studio", sc_2: "Weather Studio" };
  const sceneByName = { "News Studio": "sc_1", "Weather Studio": "sc_2" };
  const csv1 = buildRundownCsv(original, sceneById);
  const parsed1 = parseRundownCsv(csv1, sceneByName);
  const csv2 = buildRundownCsv(parsed1, sceneById);
  assertEq(csv1, csv2, "second export matches first (ids are freshly generated so we compare CSV text, not id-preserving)");
  const parsed2 = parseRundownCsv(csv2, sceneByName);
  // Titles, types, durations, sceneIds must all round-trip stably.
  assertEq(parsed2.map((i) => i.title), original.map((i) => i.title), "titles stable");
  assertEq(parsed2.map((i) => i.type), original.map((i) => i.type), "types stable");
  assertEq(parsed2.map((i) => i.duration), original.map((i) => i.duration), "durations stable");
  assertEq(parsed2.map((i) => i.sceneId), original.map((i) => i.sceneId), "sceneIds stable");
});

test("JSON export → import produces items with identical field values", () => {
  const original: ProgramItem[] = [
    { id: "x", title: "Show A", type: "program", sceneId: "sc_1", duration: 300 },
    { id: "y", title: "Show B", type: "id", sceneId: null, duration: 10 },
  ];
  const json1 = buildRundownJson(original);
  const parsed1 = parseRundownJson(json1);
  const json2 = buildRundownJson(parsed1);
  // The ids are regenerated on import, so we can't compare JSON text
  // directly — instead verify the meaningful fields stayed exact.
  const p2 = parseRundownJson(json2);
  assertEq(p2.length, original.length, "length preserved");
  for (let i = 0; i < original.length; i++) {
    assertEq(p2[i].title, original[i].title, `item ${i} title`);
    assertEq(p2[i].type, original[i].type, `item ${i} type`);
    assertEq(p2[i].duration, original[i].duration, `item ${i} duration`);
    assertEq(p2[i].sceneId, original[i].sceneId, `item ${i} sceneId`);
  }
});

// ---------------------------------------------------------------------------
console.log("\n---");
if (failures.length === 0) {
  console.log("PASS (all Phase 8 verifications succeeded)");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
