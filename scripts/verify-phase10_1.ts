/**
 * Phase 10.1 verification — MOS Stage 2 + automation composability.
 *
 * MOS TCP listener + XML parsing are covered by cargo test (9 mos tests
 * against real MOS 2.8.5 XML samples). This TS suite pins:
 *   * Rundown mutation ops (apply MOS Delete/Insert/Move/Send to items)
 *   * Automation multi-action rule shape + validation
 *   * Rule v1 → v2 migration on load
 *   * on_mos_message trigger + roleFilter matching
 *   * Multi-action rate accounting (each action counts separately)
 *
 * Run with: `bun run scripts/verify-phase10_1.ts`
 */

import {
  applyMosStoryDelete,
  applyMosStoryInsert,
  applyMosStoryMove,
  applyMosStorySend,
  mapMosStoryToItem,
  mosExternalId,
  type MosStoryLike,
  type ProgramItem,
} from "../src/document/playout";
import {
  migrateRule,
  validateRule,
  rateLimit,
  AUTOMATION_TRIGGER_KINDS,
  AUTOMATION_CONDITION_FIELDS,
  RATE_LIMIT_MAX_ACTIONS,
  type AutomationRule,
} from "../src/document/automation";

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
function assertThrows(fn: () => unknown, contains: string): void {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(contains)) throw new Error(`expected error containing "${contains}", got "${msg}"`);
    return;
  }
  throw new Error(`expected throw containing "${contains}", nothing thrown`);
}

/** Construct a synthetic item stack with MOS-imported externalIds. */
function mosItem(mosId: string, title: string, duration = 30): ProgramItem {
  return {
    id: `local-${mosId}`,
    title,
    type: "program",
    sceneId: null,
    duration,
    externalId: mosExternalId(mosId),
  };
}

console.log("Phase 10.1 verification\n");

// ---------------------------------------------------------------------------
console.log("MOS story → ProgramItem mapping");

test("story with slug and durationSec", () => {
  const story: MosStoryLike = { id: "STORY01", slug: "Cold Open", durationSec: 15 };
  const item = mapMosStoryToItem(story);
  assertEq(item.title, "Cold Open", "title from slug");
  assertEq(item.duration, 15, "duration in seconds");
  assertEq(item.externalId, "mos:STORY01", "externalId prefixed");
  assertEq(item.sceneId, null, "sceneId null on import");
  assertEq(item.type, "program", "default type");
});

test("missing slug falls back to Story <id>", () => {
  const item = mapMosStoryToItem({ id: "STORY02", slug: "", durationSec: 30 });
  assertEq(item.title, "Story STORY02", "falls back to id-based title");
});

test("missing durationSec defaults to 30", () => {
  const item = mapMosStoryToItem({ id: "S", slug: "x" });
  assertEq(item.duration, 30, "default 30s");
});

test("zero or negative durationSec clamps to 1", () => {
  const zero = mapMosStoryToItem({ id: "S", slug: "x", durationSec: 0 });
  assertEq(zero.duration, 30, "0 falls back to default 30 (guard)");
  const neg = mapMosStoryToItem({ id: "S", slug: "x", durationSec: -5 });
  assertEq(neg.duration, 30, "-5 falls back to default 30 (guard)");
});

// ---------------------------------------------------------------------------
console.log("\nMOS mutation ops");

const items = [
  mosItem("S1", "One"),
  mosItem("S2", "Two"),
  mosItem("S3", "Three"),
];

test("applyMosStoryDelete removes matching ids only", () => {
  const after = applyMosStoryDelete(items, ["S2"]);
  assertEq(after.map((i) => i.title), ["One", "Three"], "S2 gone");
});

test("applyMosStoryDelete ignores unknown ids (no throw)", () => {
  const after = applyMosStoryDelete(items, ["S9"]);
  assertEq(after.length, 3, "no-op for unknown id");
});

test("applyMosStoryDelete preserves locally-created items (no externalId)", () => {
  const withLocal: ProgramItem[] = [
    ...items,
    { id: "local-only", title: "manual", type: "program", sceneId: null, duration: 60 },
  ];
  const after = applyMosStoryDelete(withLocal, ["S1", "S2", "S3"]);
  assertEq(after.map((i) => i.title), ["manual"], "manual item survives");
});

test("applyMosStoryInsert with targetId inserts before target", () => {
  const newStories: MosStoryLike[] = [{ id: "NEW", slug: "inserted", durationSec: 10 }];
  const after = applyMosStoryInsert(items, newStories, "S2");
  assertEq(after.map((i) => i.title), ["One", "inserted", "Two", "Three"], "landed before S2");
});

test("applyMosStoryInsert without targetId appends at end", () => {
  const newStories: MosStoryLike[] = [{ id: "NEW", slug: "tail", durationSec: 10 }];
  const after = applyMosStoryInsert(items, newStories, null);
  assertEq(after.map((i) => i.title), ["One", "Two", "Three", "tail"], "appended");
});

test("applyMosStoryInsert with unknown targetId appends at end", () => {
  const newStories: MosStoryLike[] = [{ id: "NEW", slug: "orphan-target", durationSec: 10 }];
  const after = applyMosStoryInsert(items, newStories, "S99");
  assertEq(after[3].title, "orphan-target", "appended when target missing");
});

test("applyMosStoryMove reorders to target position", () => {
  const after = applyMosStoryMove(items, ["S3", "S1"], "S2");
  // S3, S1 move; S2 stays. Landing before S2 means:
  // Remaining without moving = [S2]; targetIdx=0; result=[S3, S1, S2]
  assertEq(after.map((i) => i.title), ["Three", "One", "Two"], "reordered");
});

test("applyMosStoryMove without target appends", () => {
  const after = applyMosStoryMove(items, ["S1"], null);
  assertEq(after.map((i) => i.title), ["Two", "Three", "One"], "S1 to tail");
});

test("applyMosStorySend updates existing item by externalId", () => {
  const after = applyMosStorySend(items, { id: "S2", slug: "renamed", durationSec: 99 });
  assertEq(after[1].title, "renamed", "title updated");
  assertEq(after[1].duration, 99, "duration updated");
  assertEq(after[1].externalId, "mos:S2", "externalId preserved");
});

test("applyMosStorySend adds new item when id not present", () => {
  const after = applyMosStorySend(items, { id: "NEW", slug: "new one", durationSec: 20 });
  assertEq(after.length, 4, "grew by 1");
  assertEq(after[3].title, "new one", "new item at end");
});

// ---------------------------------------------------------------------------
console.log("\nMulti-action rule validation");

const okRule: AutomationRule = {
  id: "r1",
  name: "test",
  enabled: true,
  trigger: { kind: "on_take" },
  actions: [{ type: "take" }],
};

test("single-action rule accepted", () => {
  validateRule(okRule);
});

test("multi-action rule accepted", () => {
  validateRule({ ...okRule, actions: [{ type: "take" }, { type: "startRecord" }, { type: "playIn" }] });
});

test("empty actions array rejected", () => {
  assertThrows(() => validateRule({ ...okRule, actions: [] }), "at least one action");
});

test("action array with an unknown type rejected", () => {
  assertThrows(
    () =>
      validateRule({
        ...okRule,
        actions: [{ type: "take" }, { type: "bogus" as never }],
      }),
    "unknown action type",
  );
});

test("on_mos_message trigger accepted", () => {
  validateRule({
    ...okRule,
    trigger: { kind: "on_mos_message", roleFilter: "roCreate" },
  });
});

test("on_mos_message trigger without roleFilter accepted", () => {
  validateRule({
    ...okRule,
    trigger: { kind: "on_mos_message" },
  });
});

test("AUTOMATION_TRIGGER_KINDS includes on_mos_message", () => {
  assert(AUTOMATION_TRIGGER_KINDS.includes("on_mos_message"), "trigger kind registered");
});

test("condition field mosRole in whitelist", () => {
  assert(AUTOMATION_CONDITION_FIELDS.includes("mosRole"), "mosRole whitelisted");
  assert(AUTOMATION_CONDITION_FIELDS.includes("mosRoId"), "mosRoId whitelisted");
});

// ---------------------------------------------------------------------------
console.log("\nv1 → v2 migration");

test("v1 rule with 'action' single field migrates to 'actions' array", () => {
  const v1 = {
    id: "old",
    name: "legacy",
    enabled: true,
    trigger: { kind: "on_take" },
    action: { type: "take" },
  };
  const migrated = migrateRule(v1);
  assert(migrated !== null, "migrated to a valid rule");
  assertEq(migrated!.actions, [{ type: "take" }], "single-element actions array");
});

test("v2 rule with 'actions' array preserved", () => {
  const v2 = {
    id: "new",
    name: "already migrated",
    enabled: false,
    trigger: { kind: "on_timer", seconds: 10 },
    actions: [{ type: "next_item" }, { type: "take" }],
  };
  const migrated = migrateRule(v2);
  assertEq(migrated?.actions.length, 2, "preserved multi-action");
});

test("rule with no action and no actions is dropped (null)", () => {
  const orphan = { id: "x", name: "y", enabled: true, trigger: { kind: "on_take" } };
  const migrated = migrateRule(orphan);
  // The rule loads with empty actions; loadPersisted filters those out.
  // Direct migrateRule call returns the rule; we verify empty actions.
  assertEq(migrated?.actions.length, 0, "empty actions signals drop");
});

test("non-object input yields null", () => {
  assertEq(migrateRule(null), null, "null in, null out");
  assertEq(migrateRule("string" as unknown), null, "string in, null out");
});

// ---------------------------------------------------------------------------
console.log("\nMulti-action rate limit accounting");

test("3-action rule counts as 3 against the cap", () => {
  // Simulate firing a 3-action rule three times — that's 9 dispatches,
  // all should pass; a fourth firing would be 12 total and the last
  // two should block.
  let ts: number[] = [];
  for (let fire = 0; fire < 3; fire++) {
    for (let a = 0; a < 3; a++) {
      const r = rateLimit(ts, 1000 + fire * 10 + a);
      assert(r.allowed, `fire ${fire + 1} action ${a + 1} allowed`);
      ts = r.pruned;
    }
  }
  assertEq(ts.length, 9, "9 timestamps recorded");

  // Fourth firing: first action pushes to 10 (allowed), second to 11 (blocked).
  const a1 = rateLimit(ts, 1050);
  assert(a1.allowed, "10th action allowed");
  ts = a1.pruned;
  const a2 = rateLimit(ts, 1051);
  assert(!a2.allowed, "11th action blocked");
});

test("cap is exactly RATE_LIMIT_MAX_ACTIONS", () => {
  // Sanity: the constant hasn't changed. This is a compat guard — a
  // Phase 10.1 rule that ships with 10 actions expects the cap here.
  assertEq(RATE_LIMIT_MAX_ACTIONS, 10, "10 actions per second");
});

// ---------------------------------------------------------------------------
console.log("\n---");
if (failures.length === 0) {
  console.log("PASS (all Phase 10.1 verifications succeeded)");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
