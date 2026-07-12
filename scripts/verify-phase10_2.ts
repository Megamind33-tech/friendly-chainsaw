/**
 * Phase 10.2 verification — composable conditions + MOS outbound plumbing.
 *
 * MOS outbound XML builders are covered by cargo test (6 new tests over
 * roAck, roItemCue, xml_escape, and parser round-trip of our own frames).
 * This TS suite pins:
 *   * Composable condition eval (all_of / any_of, empty groups, mixed)
 *   * Short-circuiting behavior
 *   * validateRule rejects nested groups at runtime
 *   * Backward compat: v2 leaf conditions still work unchanged
 *
 * Run with: `bun run scripts/verify-phase10_2.ts`
 */

import {
  evalCondition,
  validateRule,
  validateConditionShallow,
  isConditionGroup,
  type AutomationRule,
  type AutomationCondition,
  type AutomationLeafCondition,
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
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

const snap = {
  programSceneId: "sc_1",
  previewSceneId: "sc_2",
  onAir: true,
  currentItemTitle: "6PM News",
  ndiConnections: 3,
  currentItemProgress: 42.5,
  isSchedulePlaying: true,
};

console.log("Phase 10.2 verification\n");

// ---------------------------------------------------------------------------
console.log("Backward compat: leaf conditions unchanged");

test("v2 leaf condition still evaluates", () => {
  const leaf: AutomationLeafCondition = { field: "onAir", op: "==", value: true };
  assert(evalCondition(leaf, snap), "leaf true");
});

test("isConditionGroup returns false for leaf", () => {
  const leaf: AutomationLeafCondition = { field: "onAir", op: "==", value: true };
  assert(!isConditionGroup(leaf), "leaf is not a group");
});

// ---------------------------------------------------------------------------
console.log("\nall_of semantics");

test("all_of all-true → true", () => {
  const g: AutomationCondition = {
    kind: "all_of",
    conditions: [
      { field: "onAir", op: "==", value: true },
      { field: "ndiConnections", op: ">", value: 0 },
    ],
  };
  assert(evalCondition(g, snap), "both leaves true → group true");
});

test("all_of one false → false", () => {
  const g: AutomationCondition = {
    kind: "all_of",
    conditions: [
      { field: "onAir", op: "==", value: true },
      { field: "ndiConnections", op: ">", value: 999 }, // false
      { field: "isSchedulePlaying", op: "==", value: true },
    ],
  };
  assert(!evalCondition(g, snap), "one false ruins the group");
});

test("all_of empty → true (vacuous truth)", () => {
  const g: AutomationCondition = { kind: "all_of", conditions: [] };
  assert(evalCondition(g, snap), "empty all_of is trivially satisfied");
});

test("all_of short-circuits on first false", () => {
  // Signal via a side-effect proxy: an object whose getter throws
  // if accessed. If short-circuit works, only the first (falsy) leaf
  // reads it and the throw never fires on the second.
  let secondEvaluated = false;
  const g: AutomationCondition = {
    kind: "all_of",
    conditions: [
      { field: "onAir", op: "==", value: false }, // false — short-circuit here
      { field: "poison", op: "==" as never, value: true },
    ],
  };
  const withProxy = new Proxy(snap as unknown as Record<string, unknown>, {
    get(target, prop, receiver) {
      if (prop === "poison") secondEvaluated = true;
      return Reflect.get(target, prop, receiver);
    },
  });
  assert(!evalCondition(g, withProxy), "all_of returns false");
  assert(!secondEvaluated, "second leaf never touched");
});

// ---------------------------------------------------------------------------
console.log("\nany_of semantics");

test("any_of one-true → true", () => {
  const g: AutomationCondition = {
    kind: "any_of",
    conditions: [
      { field: "onAir", op: "==", value: false }, // false
      { field: "ndiConnections", op: ">", value: 0 }, // true
    ],
  };
  assert(evalCondition(g, snap), "one true wins");
});

test("any_of all-false → false", () => {
  const g: AutomationCondition = {
    kind: "any_of",
    conditions: [
      { field: "onAir", op: "==", value: false },
      { field: "ndiConnections", op: ">", value: 999 },
    ],
  };
  assert(!evalCondition(g, snap), "nothing matched");
});

test("any_of empty → false", () => {
  const g: AutomationCondition = { kind: "any_of", conditions: [] };
  assert(!evalCondition(g, snap), "empty any_of has no clauses to match");
});

test("any_of short-circuits on first true", () => {
  let secondEvaluated = false;
  const g: AutomationCondition = {
    kind: "any_of",
    conditions: [
      { field: "onAir", op: "==", value: true }, // true — short-circuit here
      { field: "poison", op: "==" as never, value: true },
    ],
  };
  const withProxy = new Proxy(snap as unknown as Record<string, unknown>, {
    get(target, prop, receiver) {
      if (prop === "poison") secondEvaluated = true;
      return Reflect.get(target, prop, receiver);
    },
  });
  assert(evalCondition(g, withProxy), "any_of returns true");
  assert(!secondEvaluated, "second leaf never touched");
});

// ---------------------------------------------------------------------------
console.log("\nValidation");

const okRule: AutomationRule = {
  id: "r1",
  name: "test",
  enabled: true,
  trigger: { kind: "on_take" },
  actions: [{ type: "take" }],
};

test("rule with a leaf condition validates", () => {
  validateRule({
    ...okRule,
    condition: { field: "onAir", op: "==", value: true },
  });
});

test("rule with all_of leaves validates", () => {
  validateRule({
    ...okRule,
    condition: {
      kind: "all_of",
      conditions: [
        { field: "onAir", op: "==", value: true },
        { field: "ndiConnections", op: ">", value: 0 },
      ],
    },
  });
});

test("rule with any_of leaves validates", () => {
  validateRule({
    ...okRule,
    condition: {
      kind: "any_of",
      conditions: [{ field: "recordingActive", op: "==", value: true }],
    },
  });
});

test("nested groups rejected", () => {
  assertThrows(
    () =>
      validateConditionShallow({
        kind: "all_of",
        conditions: [
          // A nested group forced via the escape hatch — should
          // be caught by the runtime guard even though TS forbids it.
          { kind: "any_of", conditions: [] } as unknown as AutomationLeafCondition,
        ],
      }),
    "nested groups are not allowed",
  );
});

test("group with leaf field not in whitelist rejected", () => {
  assertThrows(
    () =>
      validateConditionShallow({
        kind: "all_of",
        conditions: [{ field: "arbitrary" as never, op: "==", value: 0 }],
      }),
    "condition field not in whitelist",
  );
});

test("empty all_of validates (semantics: true)", () => {
  validateRule({
    ...okRule,
    condition: { kind: "all_of", conditions: [] },
  });
});

test("empty any_of validates (semantics: false)", () => {
  validateRule({
    ...okRule,
    condition: { kind: "any_of", conditions: [] },
  });
});

// ---------------------------------------------------------------------------
console.log("\nMixed / real-world scenarios");

test("all_of two-clause matches real broadcast rule", () => {
  // "Fire this rule when program is on air AND schedule is playing"
  const g: AutomationCondition = {
    kind: "all_of",
    conditions: [
      { field: "onAir", op: "==", value: true },
      { field: "isSchedulePlaying", op: "==", value: true },
    ],
  };
  assert(evalCondition(g, snap), "broadcast-shaped all_of matches");
});

test("any_of with numeric range", () => {
  // "Fire when NDI has few OR very many receivers" — sanity that the
  // numeric ops still work inside a group.
  const g: AutomationCondition = {
    kind: "any_of",
    conditions: [
      { field: "ndiConnections", op: "<", value: 1 },
      { field: "ndiConnections", op: ">=", value: 10 },
    ],
  };
  assert(!evalCondition(g, snap), "3 is neither <1 nor >=10");
  assert(evalCondition(g, { ...snap, ndiConnections: 0 }), "0 hits the <1 clause");
  assert(evalCondition(g, { ...snap, ndiConnections: 12 }), "12 hits the >=10 clause");
});

// ---------------------------------------------------------------------------
console.log("\n---");
if (failures.length === 0) {
  console.log("PASS (all Phase 10.2 verifications succeeded)");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures.length} failure(s)`);
  process.exit(1);
}
