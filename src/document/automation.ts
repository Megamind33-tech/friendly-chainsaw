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
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGER_KINDS)[number];

export type AutomationTrigger =
  | { kind: "on_take" }
  | { kind: "on_item_start" }
  | { kind: "on_item_end" }
  | { kind: "on_timer"; seconds: number };

export const AUTOMATION_COMPARISON_OPS = ["==", "!=", ">", "<", ">=", "<="] as const;
export type AutomationComparisonOp = (typeof AUTOMATION_COMPARISON_OPS)[number];

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
] as const;

export type AutomationConditionField = (typeof AUTOMATION_CONDITION_FIELDS)[number];

export interface AutomationCondition {
  field: AutomationConditionField;
  op: AutomationComparisonOp;
  value: string | number | boolean;
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
  action: AutomationAction;
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
  if (!CONTROL_COMMAND_TYPES.includes(rule.action.type)) {
    throw new Error(`unknown action type: ${rule.action.type}`);
  }
  if (rule.condition) {
    if (!AUTOMATION_CONDITION_FIELDS.includes(rule.condition.field)) {
      throw new Error(`condition field not in whitelist: ${rule.condition.field}`);
    }
    if (!AUTOMATION_COMPARISON_OPS.includes(rule.condition.op)) {
      throw new Error(`unknown condition op: ${rule.condition.op}`);
    }
  }
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

function loadPersisted(): { rules: AutomationRule[]; masterEnabled: boolean } {
  if (typeof window === "undefined") return { rules: [], masterEnabled: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rules: [], masterEnabled: true };
    const p = JSON.parse(raw);
    return {
      rules: Array.isArray(p.rules) ? p.rules : [],
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
