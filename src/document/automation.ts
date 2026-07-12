import { create } from "zustand";
import type { ControlCommandType } from "./controlProtocol";
import { CONTROL_COMMAND_TYPES } from "./controlProtocol";

/**
 * Phase 10b — Automation scripting engine.
 *
 * Fires Phase 7 control-protocol actions in response to a fixed vocabulary
 * of triggers, gated by an optional single-condition check on the current
 * ControlStateSnapshot. Deliberately not Turing-complete — a runaway rule
 * on a live broadcast could take the operator out of Program, and the
 * mitigation strategy for that class of bug is "you can't write one",
 * not "we detect it after the fact".
 *
 * Design decisions (docs/PHASE10_DESIGN.md):
 *   * Fixed trigger vocabulary (no arbitrary event subscription).
 *   * Fixed action vocabulary (must be a Phase 7 command).
 *   * Single-condition eval, safe operators only.
 *   * Master kill switch + rolling-window rate limit.
 *   * Manual operator takes always win — see `notifyOperatorAction` in
 *     controlBridge.ts.
 */

export const AUTOMATION_TRIGGER_KINDS = [
  "on_take",
  "on_item_start",
  "on_item_end",
  "on_timer",
  "on_mos_message",
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGER_KINDS)[number];

export type AutomationTrigger =
  | { kind: "on_take" }
  | { kind: "on_item_start" }
  | { kind: "on_item_end" }
  | { kind: "on_timer"; seconds: number }
  /**
   * Phase 10.1 — fires when an NRCS pushes a MOS message through the
   * TCP listener. `roleFilter` restricts the rule to one message type
   * (`"roCreate"`, `"roStorySend"`, etc.); empty/absent matches any.
   */
  | { kind: "on_mos_message"; roleFilter?: string };

export const AUTOMATION_COMPARISON_OPS = ["==", "!=", ">", "<", ">=", "<="] as const;
export type AutomationComparisonOp = (typeof AUTOMATION_COMPARISON_OPS)[number];

/**
 * Phase 10.2 — group combinators for composable conditions. Deliberately
 * only two variants (no XOR, no NOT-of-group) — extending this without a
 * real operator use case adds UI complexity for imagined power. Empty-
 * group semantics: `all_of[] = true`, `any_of[] = false` (matches Rego,
 * K8s label selectors, and vacuous-truth math).
 */
export type AutomationConditionGroupKind = "all_of" | "any_of";

/**
 * Whitelisted field names from ControlStateSnapshot that a condition can
 * reference. Anything else is refused at save time. Prevents an operator
 * from writing a condition against a field that doesn't exist and getting
 * surprising always-true/always-false results.
 */
export const AUTOMATION_CONDITION_FIELDS = [
  "programSceneId",
  "previewSceneId",
  "onAir",
  "currentItemId",
  "currentItemTitle",
  "isSchedulePlaying",
  "recordingActive",
  "ndiStreaming",
  "ndiConnections",
  "sceneCount",
  "layerCount",
  "currentItemProgress",
  "currentItemDuration",
  // Phase 10.1 — synthetic fields available inside an on_mos_message
  // handler's condition. Empty string outside a MOS event.
  "mosRole",
  "mosRoId",
] as const;

export type AutomationConditionField = (typeof AUTOMATION_CONDITION_FIELDS)[number];

/**
 * Leaf condition — one whitelisted field, one operator, one literal.
 * Phase 10 shipped this as `AutomationCondition`; Phase 10.2 renames the
 * leaf shape to `AutomationLeafCondition` and makes `AutomationCondition`
 * a union of leaf + group.
 */
export interface AutomationLeafCondition {
  field: AutomationConditionField;
  op: AutomationComparisonOp;
  value: string | number | boolean;
}

export interface AutomationConditionGroup {
  kind: AutomationConditionGroupKind;
  /** Only leaves; nested groups are forbidden by design. */
  conditions: AutomationLeafCondition[];
}

export type AutomationCondition = AutomationLeafCondition | AutomationConditionGroup;

/** Type guard: is this a group (has a `kind` field) rather than a leaf? */
export function isConditionGroup(c: AutomationCondition): c is AutomationConditionGroup {
  return (c as AutomationConditionGroup).kind === "all_of" ||
    (c as AutomationConditionGroup).kind === "any_of";
}

export interface AutomationAction {
  type: ControlCommandType;
  params?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  condition?: AutomationCondition;
  /**
   * Phase 10.1 — was `action: AutomationAction` in v1. v1 persisted rules
   * are migrated in-memory on load (see `loadPersisted`). Rate limiting
   * counts each entry here separately: a 3-action rule firing at 3/sec
   * costs 9 against the 10/sec cap.
   */
  actions: AutomationAction[];
}

// ---------------------------------------------------------------------------
// Rule validation — refused at save time, not silently no-op'd at fire time.
// ---------------------------------------------------------------------------

export function validateRule(rule: AutomationRule): void {
  if (!rule.name.trim()) throw new Error("rule name is required");
  if (!AUTOMATION_TRIGGER_KINDS.includes(rule.trigger.kind)) {
    throw new Error(`unknown trigger kind: ${rule.trigger.kind}`);
  }
  if (rule.trigger.kind === "on_timer") {
    if (!Number.isFinite(rule.trigger.seconds) || rule.trigger.seconds < 1) {
      throw new Error("timer trigger requires seconds >= 1");
    }
  }
  if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
    throw new Error("rule must have at least one action");
  }
  for (const a of rule.actions) {
    if (!CONTROL_COMMAND_TYPES.includes(a.type)) {
      throw new Error(`unknown action type: ${a.type}`);
    }
  }
  if (rule.condition) {
    validateConditionShallow(rule.condition);
  }
}

function validateLeafCondition(c: AutomationLeafCondition): void {
  if (!AUTOMATION_CONDITION_FIELDS.includes(c.field)) {
    throw new Error(`condition field not in whitelist: ${c.field}`);
  }
  if (!AUTOMATION_COMPARISON_OPS.includes(c.op)) {
    throw new Error(`unknown condition op: ${c.op}`);
  }
}

/**
 * One level of validation only — a group may contain leaves, never
 * nested groups. TypeScript's type shape already forbids it at the
 * point of construction; this is the runtime guard for values coming
 * from persisted localStorage or a future migration.
 */
export function validateConditionShallow(c: AutomationCondition): void {
  if (isConditionGroup(c)) {
    if (!Array.isArray(c.conditions)) {
      throw new Error(`group ${c.kind}: conditions must be an array`);
    }
    for (const leaf of c.conditions) {
      if (isConditionGroup(leaf as AutomationCondition)) {
        throw new Error(`nested groups are not allowed (${c.kind} contains a group)`);
      }
      validateLeafCondition(leaf);
    }
    return;
  }
  validateLeafCondition(c);
}

// ---------------------------------------------------------------------------
// Condition evaluation — no eval, no dynamic key access, only whitelisted
// paths. `snapshot` is anything with the fields listed in
// AUTOMATION_CONDITION_FIELDS (typed as ControlStateSnapshot in real use).
// ---------------------------------------------------------------------------

export function evalCondition(
  cond: AutomationCondition,
  snapshot: Record<string, unknown>,
): boolean {
  if (isConditionGroup(cond)) {
    // Empty groups: all_of[] = true (vacuous truth), any_of[] = false.
    // Documented in docs/PHASE10_2_DESIGN.md.
    if (cond.conditions.length === 0) return cond.kind === "all_of";
    if (cond.kind === "all_of") {
      // Short-circuit on first false.
      for (const c of cond.conditions) {
        if (!evalLeafCondition(c, snapshot)) return false;
      }
      return true;
    }
    // any_of: short-circuit on first true.
    for (const c of cond.conditions) {
      if (evalLeafCondition(c, snapshot)) return true;
    }
    return false;
  }
  return evalLeafCondition(cond, snapshot);
}

function evalLeafCondition(
  cond: AutomationLeafCondition,
  snapshot: Record<string, unknown>,
): boolean {
  const lhs = snapshot[cond.field];
  const rhs = cond.value;
  switch (cond.op) {
    case "==":
      return lhs === rhs;
    case "!=":
      return lhs !== rhs;
    case ">":
      return typeof lhs === "number" && typeof rhs === "number" && lhs > rhs;
    case "<":
      return typeof lhs === "number" && typeof rhs === "number" && lhs < rhs;
    case ">=":
      return typeof lhs === "number" && typeof rhs === "number" && lhs >= rhs;
    case "<=":
      return typeof lhs === "number" && typeof rhs === "number" && lhs <= rhs;
    default: {
      const _: never = cond.op;
      void _;
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Rate limiter — 10 actions per rolling second across ALL rules combined.
// Exceeding it puts the engine into an error state until the operator
// clicks Resume.
// ---------------------------------------------------------------------------

export const RATE_LIMIT_MAX_ACTIONS = 10;
export const RATE_LIMIT_WINDOW_MS = 1000;

/**
 * Pure rate-limiter primitive. Records a timestamp; returns whether the
 * action should fire. Extracted so verify-phase10 can pin it directly.
 */
export function rateLimit(recentTimestampsMs: number[], nowMs: number): {
  allowed: boolean;
  pruned: number[];
} {
  const cutoff = nowMs - RATE_LIMIT_WINDOW_MS;
  const pruned = recentTimestampsMs.filter((t) => t > cutoff);
  const allowed = pruned.length < RATE_LIMIT_MAX_ACTIONS;
  return { allowed, pruned: allowed ? [...pruned, nowMs] : pruned };
}

// ---------------------------------------------------------------------------
// Rule store
// ---------------------------------------------------------------------------

const STORAGE_KEY = "automation-rules-v1";

interface AutomationState {
  rules: AutomationRule[];
  masterEnabled: boolean;
  /** True when the rate limiter tripped and the operator hasn't acknowledged. */
  rateLimited: boolean;
  /** Rolling window of action timestamps (ms) — internal to the engine. */
  actionTimestamps: number[];
  /** Last time the on_timer trigger fired per rule id (ms since epoch). */
  lastTimerFireMs: Record<string, number>;

  addRule: (rule: AutomationRule) => void;
  updateRule: (id: string, patch: Partial<AutomationRule>) => void;
  removeRule: (id: string) => void;
  toggleEnabled: (id: string) => void;
  setMasterEnabled: (v: boolean) => void;
  acknowledgeRateLimit: () => void;
  recordActionFired: (nowMs: number) => boolean;
  markTimerFired: (ruleId: string, nowMs: number) => void;
}

/**
 * Phase 10.1 — in-memory v1→v2 migration. v1 rules had a single
 * `action: AutomationAction`; v2 uses `actions: AutomationAction[]`.
 * Migration is not destructive on load (writes back on the next save).
 */
export function migrateRule(raw: unknown): AutomationRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const actions = Array.isArray(r.actions)
    ? (r.actions as AutomationAction[])
    : r.action && typeof r.action === "object"
      ? [r.action as AutomationAction]
      : [];
  if (typeof r.id !== "string" || typeof r.name !== "string" || !r.trigger) return null;
  return {
    id: r.id,
    name: r.name,
    enabled: Boolean(r.enabled),
    trigger: r.trigger as AutomationTrigger,
    condition: r.condition as AutomationCondition | undefined,
    actions,
  };
}

function loadPersisted(): { rules: AutomationRule[]; masterEnabled: boolean } {
  if (typeof window === "undefined") return { rules: [], masterEnabled: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rules: [], masterEnabled: true };
    const p = JSON.parse(raw);
    const rawRules: unknown[] = Array.isArray(p.rules) ? p.rules : [];
    const rules = rawRules
      .map(migrateRule)
      .filter((r): r is AutomationRule => r !== null && r.actions.length > 0);
    return {
      rules,
      masterEnabled: p.masterEnabled !== false,
    };
  } catch {
    return { rules: [], masterEnabled: true };
  }
}

function persist(state: AutomationState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rules: state.rules, masterEnabled: state.masterEnabled }),
    );
  } catch {
    /* localStorage full or blocked — silent, not fatal */
  }
}

let idCounter = 0;
export function newRuleId(): string {
  return `rule-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  ...loadPersisted(),
  rateLimited: false,
  actionTimestamps: [],
  lastTimerFireMs: {},

  addRule: (rule) => {
    validateRule(rule);
    set((s) => {
      const next = { ...s, rules: [...s.rules, rule] };
      persist(next);
      return next;
    });
  },

  updateRule: (id, patch) =>
    set((s) => {
      const rules = s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const target = rules.find((r) => r.id === id);
      if (target) validateRule(target);
      const next = { ...s, rules };
      persist(next);
      return next;
    }),

  removeRule: (id) =>
    set((s) => {
      const next = { ...s, rules: s.rules.filter((r) => r.id !== id) };
      persist(next);
      return next;
    }),

  toggleEnabled: (id) =>
    set((s) => {
      const rules = s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      const next = { ...s, rules };
      persist(next);
      return next;
    }),

  setMasterEnabled: (v) =>
    set((s) => {
      const next = { ...s, masterEnabled: v };
      persist(next);
      return next;
    }),

  acknowledgeRateLimit: () => set({ rateLimited: false, actionTimestamps: [] }),

  /**
   * Records that an action is about to fire and returns whether it's
   * permitted by the rate limit. `false` also transitions the engine into
   * the rateLimited state so the UI can surface it.
   */
  recordActionFired: (nowMs) => {
    const state = get();
    if (!state.masterEnabled) return false;
    if (state.rateLimited) return false;
    const { allowed, pruned } = rateLimit(state.actionTimestamps, nowMs);
    if (!allowed) {
      set({ actionTimestamps: pruned, rateLimited: true });
      return false;
    }
    set({ actionTimestamps: pruned });
    return true;
  },

  markTimerFired: (ruleId, nowMs) =>
    set((s) => ({ lastTimerFireMs: { ...s.lastTimerFireMs, [ruleId]: nowMs } })),
}));

// ---------------------------------------------------------------------------
// Engine — pure helpers a runtime driver uses to decide "should this rule
// fire right now against this snapshot?"
// ---------------------------------------------------------------------------

/**
 * Returns true if a rule with an on_timer trigger should fire at `nowMs`
 * given its last fire time and the configured interval. Never fires more
 * than once per interval, and always requires at least one interval to
 * have passed since the last fire (or since we've never fired: nowMs
 * relative to "never" treats the first tick after enable as ready).
 */
export function shouldTimerFire(
  intervalSeconds: number,
  lastFireMs: number | undefined,
  nowMs: number,
): boolean {
  const intervalMs = intervalSeconds * 1000;
  if (intervalMs < 1000) return false;
  if (lastFireMs === undefined) return true;
  return nowMs - lastFireMs >= intervalMs;
}
