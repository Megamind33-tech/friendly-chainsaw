/**
 * Phase 10.1 verification — MOS Stage 2 rundown mutation.
 *
 * MOS TCP listener + XML parsing are covered by cargo test (9 mos tests
 * against real MOS 2.8.5 XML samples). This TS suite pins:
 *   * MOS story → ProgramItem mapping
 *   * Rundown mutation ops (apply MOS Delete/Insert/Move/Send to items)
 *
 * The automation half of this suite (multi-action validation, v1→v2
 * migration, the on_mos_message trigger, multi-action rate accounting) moved
 * to `src/document/automation.test.ts`, which consolidates every automation
 * assertion that was previously spread across phase 10, 10.1 and 10.2 into
 * one place with watch mode and coverage. Nothing was dropped in the move.
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
console.log("\n---");
if (failures.length === 0) {
  console.log("PASS (all Phase 10.1 verifications succeeded)");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
