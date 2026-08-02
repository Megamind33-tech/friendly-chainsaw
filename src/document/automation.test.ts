import { describe, expect, it, beforeEach } from "vitest";
import {
  AUTOMATION_COMPARISON_OPS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_TRIGGER_KINDS,
  evalCondition,
  isConditionGroup,
  migrateRule,
  newRuleId,
  rateLimit,
  RATE_LIMIT_MAX_ACTIONS,
  RATE_LIMIT_WINDOW_MS,
  shouldTimerFire,
  useAutomationStore,
  validateConditionShallow,
  validateRule,
  type AutomationCondition,
  type AutomationLeafCondition,
  type AutomationRule,
} from "./automation";

/**
 * The automation engine, consolidated.
 *
 * These assertions previously lived across `verify-phase10.ts` and
 * `verify-phase10_2.ts`, plus the automation half of `verify-phase10_1.ts` —
 * three phase-acceptance scripts each pinning part of one module. Same
 * assertions, one home, now with watch mode and coverage; nothing was dropped
 * in the move and several gaps those scripts left are closed below.
 *
 * What the engine has to get right: a rule fires only when it genuinely
 * matches, a malformed rule is refused at SAVE time rather than silently
 * no-op'd at fire time, and a runaway rule cannot flood the control surface.
 */

const leaf = (over: Partial<AutomationLeafCondition> = {}): AutomationLeafCondition => ({
  field: "onAir",
  op: "==",
  value: true,
  ...over,
});

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: "r1",
  name: "Rule",
  enabled: true,
  trigger: { kind: "on_take" },
  actions: [{ type: "take" }],
  ...over,
});

// ---------------------------------------------------------------------------
// Leaf conditions
// ---------------------------------------------------------------------------

describe("evalCondition — leaves", () => {
  const snap = { onAir: true, sceneCount: 3, currentItemTitle: "Opener" };

  it("compares strings with == and !=", () => {
    expect(evalCondition(leaf({ field: "currentItemTitle", value: "Opener" }), snap)).toBe(true);
    expect(evalCondition(leaf({ field: "currentItemTitle", value: "Other" }), snap)).toBe(false);
    expect(evalCondition(leaf({ field: "currentItemTitle", op: "!=", value: "Other" }), snap)).toBe(true);
  });

  it("compares booleans", () => {
    expect(evalCondition(leaf({ field: "onAir", value: true }), snap)).toBe(true);
    expect(evalCondition(leaf({ field: "onAir", op: "!=", value: true }), snap)).toBe(false);
  });

  it("compares numbers across every ordering operator", () => {
    expect(evalCondition(leaf({ field: "sceneCount", op: ">", value: 2 }), snap)).toBe(true);
    expect(evalCondition(leaf({ field: "sceneCount", op: ">", value: 3 }), snap)).toBe(false);
    expect(evalCondition(leaf({ field: "sceneCount", op: "<", value: 4 }), snap)).toBe(true);
    expect(evalCondition(leaf({ field: "sceneCount", op: ">=", value: 3 }), snap)).toBe(true);
    expect(evalCondition(leaf({ field: "sceneCount", op: "<=", value: 3 }), snap)).toBe(true);
  });

  it("refuses to coerce for ordering operators", () => {
    // "3" > 2 is true in JavaScript. A rule that fires because a string
    // happened to coerce is a rule that fires on air for the wrong reason.
    expect(evalCondition(leaf({ field: "currentItemTitle", op: ">", value: 2 }), snap)).toBe(false);
    expect(evalCondition(leaf({ field: "sceneCount", op: ">", value: "2" as never }), snap)).toBe(false);
  });

  it("uses strict equality, so 1 never equals true", () => {
    expect(evalCondition(leaf({ field: "onAir", value: 1 as never }), snap)).toBe(false);
  });

  it("returns false for a field absent from the snapshot", () => {
    // Safe default: an unknown field must not accidentally satisfy a rule.
    expect(evalCondition(leaf({ field: "recordingActive" }), {})).toBe(false);
    expect(evalCondition(leaf({ field: "recordingActive", op: ">", value: 0 }), {})).toBe(false);
  });

  it("matches an explicitly false value rather than treating it as absent", () => {
    expect(evalCondition(leaf({ field: "onAir", value: false }), { onAir: false })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Condition groups
// ---------------------------------------------------------------------------

describe("evalCondition — groups", () => {
  const snap = { onAir: true, sceneCount: 3 };

  it("distinguishes a group from a leaf", () => {
    expect(isConditionGroup(leaf())).toBe(false);
    expect(isConditionGroup({ kind: "all_of", conditions: [] })).toBe(true);
  });

  it("all_of is true only when every clause holds", () => {
    expect(
      evalCondition({ kind: "all_of", conditions: [leaf(), leaf({ field: "sceneCount", op: ">", value: 2 })] }, snap),
    ).toBe(true);
    expect(
      evalCondition({ kind: "all_of", conditions: [leaf(), leaf({ field: "sceneCount", op: ">", value: 9 })] }, snap),
    ).toBe(false);
  });

  it("any_of is true when a single clause holds", () => {
    expect(
      evalCondition({ kind: "any_of", conditions: [leaf({ value: false }), leaf()] }, snap),
    ).toBe(true);
    expect(
      evalCondition(
        { kind: "any_of", conditions: [leaf({ value: false }), leaf({ field: "sceneCount", op: ">", value: 9 })] },
        snap,
      ),
    ).toBe(false);
  });

  it("treats an empty all_of as true and an empty any_of as false", () => {
    // Vacuous truth, documented in docs/PHASE10_2_DESIGN.md: "all of nothing"
    // holds, "any of nothing" cannot.
    expect(evalCondition({ kind: "all_of", conditions: [] }, snap)).toBe(true);
    expect(evalCondition({ kind: "any_of", conditions: [] }, snap)).toBe(false);
  });

  it("short-circuits all_of on the first false", () => {
    // Evaluation must not touch clauses it does not need — the snapshot is a
    // live object and reading it has cost.
    let touched = 0;
    const counting = new Proxy(snap as Record<string, unknown>, {
      get(target, key) {
        touched += 1;
        return target[key as string];
      },
    });
    evalCondition(
      { kind: "all_of", conditions: [leaf({ value: false }), leaf({ field: "sceneCount" })] },
      counting,
    );
    expect(touched).toBe(1);
  });

  it("short-circuits any_of on the first true", () => {
    let touched = 0;
    const counting = new Proxy(snap as Record<string, unknown>, {
      get(target, key) {
        touched += 1;
        return target[key as string];
      },
    });
    evalCondition({ kind: "any_of", conditions: [leaf(), leaf({ field: "sceneCount" })] }, counting);
    expect(touched).toBe(1);
  });

  it("evaluates a realistic two-clause broadcast rule", () => {
    // "on air AND more than one scene" — the shape an operator actually writes.
    const cond: AutomationCondition = {
      kind: "all_of",
      conditions: [leaf({ field: "onAir", value: true }), leaf({ field: "sceneCount", op: ">", value: 1 })],
    };
    expect(evalCondition(cond, { onAir: true, sceneCount: 3 })).toBe(true);
    expect(evalCondition(cond, { onAir: false, sceneCount: 3 })).toBe(false);
    expect(evalCondition(cond, { onAir: true, sceneCount: 1 })).toBe(false);
  });

  it("evaluates a numeric range through any_of", () => {
    const cond: AutomationCondition = {
      kind: "any_of",
      conditions: [leaf({ field: "sceneCount", op: "<", value: 2 }), leaf({ field: "sceneCount", op: ">", value: 10 })],
    };
    expect(evalCondition(cond, { sceneCount: 1 })).toBe(true);
    expect(evalCondition(cond, { sceneCount: 11 })).toBe(true);
    expect(evalCondition(cond, { sceneCount: 5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Validation — refused at save time, not silently no-op'd at fire time
// ---------------------------------------------------------------------------

describe("validateRule", () => {
  it("accepts a well-formed rule", () => {
    expect(() => validateRule(rule())).not.toThrow();
    expect(() => validateRule(rule({ condition: leaf() }))).not.toThrow();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => validateRule(rule({ name: "" }))).toThrow(/name/);
    expect(() => validateRule(rule({ name: "   " }))).toThrow(/name/);
  });

  it("rejects an unknown trigger kind", () => {
    expect(() => validateRule(rule({ trigger: { kind: "on_nonsense" } as never }))).toThrow(/trigger/);
  });

  it("rejects a timer under one second", () => {
    // Below a second the engine's own tick cannot honour it, so accepting it
    // would create a rule that silently never fires at the configured rate.
    expect(() => validateRule(rule({ trigger: { kind: "on_timer", seconds: 0 } }))).toThrow(/seconds/);
    expect(() => validateRule(rule({ trigger: { kind: "on_timer", seconds: Number.NaN } }))).toThrow(/seconds/);
    expect(() => validateRule(rule({ trigger: { kind: "on_timer", seconds: 1 } }))).not.toThrow();
  });

  it("requires at least one action", () => {
    expect(() => validateRule(rule({ actions: [] }))).toThrow(/action/);
    expect(() => validateRule(rule({ actions: undefined as never }))).toThrow(/action/);
  });

  it("accepts multiple actions and rejects an unknown type among them", () => {
    expect(() => validateRule(rule({ actions: [{ type: "take" }, { type: "playIn" }] }))).not.toThrow();
    expect(() =>
      validateRule(rule({ actions: [{ type: "take" }, { type: "selfDestruct" } as never] })),
    ).toThrow(/action type/);
  });

  it("rejects a condition field outside the whitelist", () => {
    // The whitelist is the security boundary: evaluation does no dynamic key
    // access beyond it, so an arbitrary field must never be storable.
    expect(() => validateRule(rule({ condition: leaf({ field: "__proto__" as never }) }))).toThrow(/whitelist/);
  });

  it("rejects an unknown comparison operator", () => {
    expect(() => validateRule(rule({ condition: leaf({ op: "~=" as never }) }))).toThrow(/op/);
  });

  it("accepts the MOS trigger, with and without a role filter", () => {
    expect(() => validateRule(rule({ trigger: { kind: "on_mos_message", roleFilter: "roStorySend" } }))).not.toThrow();
    expect(() => validateRule(rule({ trigger: { kind: "on_mos_message" } }))).not.toThrow();
  });
});

describe("validateConditionShallow", () => {
  it("accepts leaves and single-level groups", () => {
    expect(() => validateConditionShallow(leaf())).not.toThrow();
    expect(() => validateConditionShallow({ kind: "all_of", conditions: [leaf()] })).not.toThrow();
    expect(() => validateConditionShallow({ kind: "any_of", conditions: [leaf()] })).not.toThrow();
  });

  it("accepts empty groups, whose semantics are defined", () => {
    expect(() => validateConditionShallow({ kind: "all_of", conditions: [] })).not.toThrow();
    expect(() => validateConditionShallow({ kind: "any_of", conditions: [] })).not.toThrow();
  });

  it("rejects a nested group", () => {
    // The type shape forbids it at construction; this is the runtime guard for
    // values arriving from persisted localStorage or a future migration.
    expect(() =>
      validateConditionShallow({
        kind: "all_of",
        conditions: [{ kind: "any_of", conditions: [leaf()] } as never],
      }),
    ).toThrow(/nested/);
  });

  it("rejects a bad leaf inside a group", () => {
    expect(() =>
      validateConditionShallow({ kind: "all_of", conditions: [leaf({ field: "nope" as never })] }),
    ).toThrow(/whitelist/);
  });

  it("rejects a group whose conditions are not an array", () => {
    expect(() =>
      validateConditionShallow({ kind: "all_of", conditions: "nope" as never }),
    ).toThrow(/array/);
  });
});

describe("whitelists", () => {
  it("registers the MOS trigger and its condition fields", () => {
    expect(AUTOMATION_TRIGGER_KINDS).toContain("on_mos_message");
    expect(AUTOMATION_CONDITION_FIELDS).toContain("mosRole");
    expect(AUTOMATION_CONDITION_FIELDS).toContain("mosRoId");
  });

  it("exposes every comparison operator the evaluator implements", () => {
    for (const op of AUTOMATION_COMPARISON_OPS) {
      expect(() => evalCondition(leaf({ op, value: 1 }), { onAir: 1 })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — a runaway rule must not flood the control surface
// ---------------------------------------------------------------------------

describe("rateLimit", () => {
  it("allows actions up to the cap within one window", () => {
    let stamps: number[] = [];
    for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS; i++) {
      const r = rateLimit(stamps, 1000 + i);
      expect(r.allowed).toBe(true);
      stamps = r.pruned;
    }
    expect(stamps).toHaveLength(RATE_LIMIT_MAX_ACTIONS);
  });

  it("blocks the action past the cap", () => {
    const stamps = Array.from({ length: RATE_LIMIT_MAX_ACTIONS }, (_, i) => 1000 + i);
    expect(rateLimit(stamps, 1050).allowed).toBe(false);
  });

  it("does not let a blocked action advance the counter", () => {
    // Otherwise a rule stuck in a loop would keep pushing its own window
    // forward and never recover.
    const stamps = Array.from({ length: RATE_LIMIT_MAX_ACTIONS }, (_, i) => 1000 + i);
    expect(rateLimit(stamps, 1050).pruned).toHaveLength(RATE_LIMIT_MAX_ACTIONS);
  });

  it("allows again once the window has rolled off", () => {
    const stamps = Array.from({ length: RATE_LIMIT_MAX_ACTIONS }, (_, i) => 1000 + i);
    const r = rateLimit(stamps, 1000 + RATE_LIMIT_WINDOW_MS + 100);
    expect(r.allowed).toBe(true);
    expect(r.pruned.length).toBeLessThanOrEqual(RATE_LIMIT_MAX_ACTIONS);
  });

  it("prunes only timestamps outside the rolling window", () => {
    const stamps = [0, 500, 1500];
    // At t=1600 the cutoff is 600, so 0 and 500 age out and 1500 survives.
    expect(rateLimit(stamps, 1600).pruned).toEqual([1500, 1600]);
  });

  it("starts from empty without throwing", () => {
    expect(rateLimit([], 0).allowed).toBe(true);
  });

  it("counts every action of a multi-action rule against the cap", () => {
    // A 3-action rule fired three times is 9 dispatches, not 3. Counting per
    // rule instead of per action would let a rule with ten actions flood the
    // control surface while appearing to fire once.
    let ts: number[] = [];
    for (let fire = 0; fire < 3; fire++) {
      for (let a = 0; a < 3; a++) {
        const r = rateLimit(ts, 1000 + fire * 10 + a);
        expect(r.allowed).toBe(true);
        ts = r.pruned;
      }
    }
    expect(ts).toHaveLength(9);

    // The 10th is allowed, the 11th is not.
    const tenth = rateLimit(ts, 1050);
    expect(tenth.allowed).toBe(true);
    expect(rateLimit(tenth.pruned, 1051).allowed).toBe(false);
  });

  it("keeps the cap at 10 — a compatibility guard", () => {
    // Rules that ship with ten actions were written against this number.
    expect(RATE_LIMIT_MAX_ACTIONS).toBe(10);
    expect(RATE_LIMIT_WINDOW_MS).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Timer triggers
// ---------------------------------------------------------------------------

describe("shouldTimerFire", () => {
  it("fires on the first tick after being enabled", () => {
    expect(shouldTimerFire(5, undefined, 1000)).toBe(true);
  });

  it("holds until the interval has elapsed", () => {
    expect(shouldTimerFire(5, 1000, 5999)).toBe(false);
  });

  it("fires exactly at the interval boundary", () => {
    expect(shouldTimerFire(5, 1000, 6000)).toBe(true);
  });

  it("fires once, not repeatedly, when several intervals have passed", () => {
    // The caller marks the fire; this only answers "is it due", so a long gap
    // must not be reported as several pending fires.
    expect(shouldTimerFire(5, 1000, 20_000)).toBe(true);
  });

  it("refuses a sub-second interval as a configuration error", () => {
    expect(shouldTimerFire(0.5, undefined, 1000)).toBe(false);
    expect(shouldTimerFire(0, undefined, 1000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persistence migration
// ---------------------------------------------------------------------------

describe("migrateRule", () => {
  it("lifts a v1 single `action` into the v2 `actions` array", () => {
    // An operator's saved rules must survive the upgrade; dropping them would
    // silently disarm their show automation.
    const migrated = migrateRule({
      id: "r1",
      name: "Old",
      enabled: true,
      trigger: { kind: "on_take" },
      action: { type: "take" },
    });
    expect(migrated).not.toBeNull();
    expect(migrated!.actions).toEqual([{ type: "take" }]);
  });

  it("passes a v2 rule through unchanged", () => {
    const migrated = migrateRule(rule({ actions: [{ type: "take" }, { type: "nextItem" }] }));
    expect(migrated!.actions).toHaveLength(2);
  });

  it("returns null for a rule with no actions at all", () => {
    expect(migrateRule({ id: "r", name: "n", trigger: { kind: "on_take" } })?.actions).toEqual([]);
  });

  it("returns null for anything missing an id, name or trigger", () => {
    expect(migrateRule({ name: "n", trigger: {} })).toBeNull();
    expect(migrateRule({ id: "r", trigger: {} })).toBeNull();
    expect(migrateRule({ id: "r", name: "n" })).toBeNull();
  });

  it("returns null for non-object input rather than throwing", () => {
    for (const junk of [null, undefined, 42, "nope", []]) {
      expect(migrateRule(junk)).toBeNull();
    }
  });

  it("coerces a missing enabled flag to false rather than leaving it undefined", () => {
    // A rule restored in an indeterminate state could fire unexpectedly.
    expect(migrateRule({ id: "r", name: "n", trigger: { kind: "on_take" }, action: { type: "take" } })!.enabled).toBe(
      false,
    );
  });
});

describe("newRuleId", () => {
  it("does not collide across rapid successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newRuleId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

describe("automation store", () => {
  beforeEach(() => {
    useAutomationStore.setState({
      rules: [],
      masterEnabled: true,
      rateLimited: false,
      actionTimestamps: [],
      lastTimerFireMs: {},
    });
  });

  const store = () => useAutomationStore.getState();

  it("adds, updates and removes rules", () => {
    store().addRule(rule({ id: "r1" }));
    expect(store().rules).toHaveLength(1);
    store().updateRule("r1", { name: "Renamed" });
    expect(store().rules[0].name).toBe("Renamed");
    store().removeRule("r1");
    expect(store().rules).toHaveLength(0);
  });

  it("toggles a single rule without touching the others", () => {
    store().addRule(rule({ id: "r1", enabled: true }));
    store().addRule(rule({ id: "r2", enabled: true }));
    store().toggleEnabled("r1");
    expect(store().rules.find((r) => r.id === "r1")!.enabled).toBe(false);
    expect(store().rules.find((r) => r.id === "r2")!.enabled).toBe(true);
  });

  it("trips into a rate-limited state once the cap is exceeded", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS; i++) {
      expect(store().recordActionFired(1000 + i)).toBe(true);
    }
    expect(store().recordActionFired(1050)).toBe(false);
    // Latched, not momentary: the operator has to acknowledge, so a runaway
    // rule cannot quietly resume the moment its window rolls off.
    expect(store().rateLimited).toBe(true);
  });

  it("stays rate-limited until acknowledged", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ACTIONS + 1; i++) store().recordActionFired(1000 + i);
    expect(store().rateLimited).toBe(true);
    store().acknowledgeRateLimit();
    expect(store().rateLimited).toBe(false);
  });

  it("records timer fires per rule", () => {
    store().markTimerFired("r1", 5000);
    expect(store().lastTimerFireMs.r1).toBe(5000);
    expect(store().lastTimerFireMs.r2).toBeUndefined();
  });

  it("toggles the master switch", () => {
    store().setMasterEnabled(false);
    expect(store().masterEnabled).toBe(false);
  });
});
