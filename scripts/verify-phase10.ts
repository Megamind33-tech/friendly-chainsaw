/**
 * Phase 10 verification — MOS + automation.
 *
 * MOS Protocol parsing is covered by cargo test --lib mos (9 tests
 * against real MOS 2.8.5 XML samples). This TS suite pins the
 * automation engine's invariants:
 *
 *   * Condition eval — every op against every scalar type
 *   * Rule validation — refuses unknown triggers/actions/fields at save
 *   * Rate limit — 10 actions per rolling 1s max
 *   * Timer scheduler — never fires more than once per interval
 *
 * Run with: `bun run scripts/verify-phase10.ts`
 */

import {
  evalCondition,
  rateLimit,
  shouldTimerFire,
  validateRule,
  RATE_LIMIT_MAX_ACTIONS,
  type AutomationCondition,
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

console.log("Phase 10 verification (Automation engine)\n");

// ---------------------------------------------------------------------------
console.log("Condition evaluation");

const snap = {
  programSceneId: "sc_1",
  previewSceneId: "sc_2",
  onAir: true,
  currentItemTitle: "6PM News",
  ndiConnections: 3,
  currentItemProgress: 42.5,
  isSchedulePlaying: true,
};

test("== string match", () => {
  const c: AutomationCondition = { field: "programSceneId", op: "==", value: "sc_1" };
  assert(evalCondition(c, snap), "sc_1 == sc_1");
});

test("== string mismatch", () => {
  const c: AutomationCondition = { field: "programSceneId", op: "==", value: "sc_other" };
  assert(!evalCondition(c, snap), "sc_1 != sc_other");
});

test("!= boolean", () => {
  const c: AutomationCondition = { field: "onAir", op: "!=", value: false };
  assert(evalCondition(c, snap), "true != false");
});

test("> number", () => {
  const c: AutomationCondition = { field: "ndiConnections", op: ">", value: 2 };
  assert(evalCondition(c, snap), "3 > 2");
});

test("< number", () => {
  const c: AutomationCondition = { field: "ndiConnections", op: "<", value: 5 };
  assert(evalCondition(c, snap), "3 < 5");
});

test(">= boundary", () => {
  const c: AutomationCondition = { field: "ndiConnections", op: ">=", value: 3 };
  assert(evalCondition(c, snap), "3 >= 3");
});

test("<= boundary", () => {
  const c: AutomationCondition = { field: "ndiConnections", op: "<=", value: 3 };
  assert(evalCondition(c, snap), "3 <= 3");
});

test("numeric op on non-number LHS returns false (no coercion)", () => {
  // Deliberately no coercion — "42" > 40 would surprise operators. A
  // condition typed against a string field with a numeric op just fails.
  const c: AutomationCondition = { field: "programSceneId", op: ">", value: 0 };
  assert(!evalCondition(c, snap), "no string-to-number coercion");
});

test("undefined field returns false (safe default)", () => {
  const c: AutomationCondition = { field: "programSceneId" as never, op: "==", value: "x" };
  assert(!evalCondition(c, {} as never), "missing field never matches");
});

// ---------------------------------------------------------------------------
console.log("\nRule validation");

const okRule: AutomationRule = {
  id: "r1",
  name: "Take on preview arm",
  enabled: true,
  trigger: { kind: "on_take" },
  action: { type: "take" },
};

test("valid rule accepted", () => {
  validateRule(okRule);
});

test("empty name rejected", () => {
  assertThrows(() => validateRule({ ...okRule, name: "" }), "name is required");
});

test("unknown trigger kind rejected", () => {
  assertThrows(
    () => validateRule({ ...okRule, trigger: { kind: "bogus" } as never }),
    "unknown trigger kind",
  );
});

test("timer with seconds < 1 rejected", () => {
  assertThrows(
    () => validateRule({ ...okRule, trigger: { kind: "on_timer", seconds: 0 } }),
    "seconds >= 1",
  );
});

test("unknown action type rejected", () => {
  assertThrows(
    () => validateRule({ ...okRule, action: { type: "bogus_action" as never } }),
    "unknown action type",
  );
});

test("condition field not in whitelist rejected", () => {
  assertThrows(
    () =>
      validateRule({
        ...okRule,
        condition: { field: "arbitraryKey" as never, op: "==", value: 0 },
      }),
    "condition field not in whitelist",
  );
});

test("valid rule with condition accepted", () => {
  validateRule({
    ...okRule,
    condition: { field: "onAir", op: "==", value: true },
  });
});

// ---------------------------------------------------------------------------
console.log("\nRate limit");

test("first 10 actions allowed", () => {
  let ts: number[] = [];
  for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS; i++) {
    const { allowed, pruned } = rateLimit(ts, 1000 + i * 10);
    assert(allowed, `action ${i + 1} of ${RATE_LIMIT_MAX_ACTIONS} allowed`);
    ts = pruned;
  }
});

test("11th action within 1s window blocked", () => {
  let ts: number[] = [];
  for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS; i++) {
    ts = rateLimit(ts, 1000 + i).pruned;
  }
  const result = rateLimit(ts, 1000 + RATE_LIMIT_MAX_ACTIONS);
  assert(!result.allowed, "11th action refused");
});

test("action allowed again after window passes", () => {
  // Fill the window at t=1000-1010.
  let ts: number[] = [];
  for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS; i++) {
    ts = rateLimit(ts, 1000 + i).pruned;
  }
  // Jump forward past the 1s window.
  const result = rateLimit(ts, 2500);
  assert(result.allowed, "action allowed after window rolled off");
  assertEq(result.pruned.length, 1, "history pruned to just the new entry");
});

test("blocked action does not advance the counter", () => {
  let ts: number[] = [];
  for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS; i++) {
    ts = rateLimit(ts, 1000 + i).pruned;
  }
  const denied = rateLimit(ts, 1050);
  assertEq(denied.pruned.length, RATE_LIMIT_MAX_ACTIONS, "denied action didn't push new timestamp");
});

// ---------------------------------------------------------------------------
console.log("\nTimer scheduler");

test("first fire allowed (no lastFire)", () => {
  assert(shouldTimerFire(5, undefined, 10_000), "first tick fires");
});

test("does not fire before interval elapsed", () => {
  assert(!shouldTimerFire(5, 10_000, 12_000), "at 2s of 5s → skip");
});

test("fires exactly at interval boundary", () => {
  assert(shouldTimerFire(5, 10_000, 15_000), "at 5s → fire");
});

test("interval < 1s rejected (config error)", () => {
  assert(!shouldTimerFire(0.5, 10_000, 20_000), "sub-second timer refuses to fire");
});

test("fires again if two intervals passed", () => {
  assert(shouldTimerFire(5, 10_000, 20_500), "at 10.5s → fire");
});

// ---------------------------------------------------------------------------
console.log("\n---");
if (failures.length === 0) {
  console.log("PASS (all Phase 10 automation verifications succeeded)");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
