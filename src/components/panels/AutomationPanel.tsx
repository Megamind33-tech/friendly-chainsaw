import { useState } from "react";
import { Zap, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  useAutomationStore,
  newRuleId,
  isConditionGroup,
  AUTOMATION_TRIGGER_KINDS,
  AUTOMATION_COMPARISON_OPS,
  AUTOMATION_CONDITION_FIELDS,
  RATE_LIMIT_MAX_ACTIONS,
  RATE_LIMIT_WINDOW_MS,
  type AutomationRule,
  type AutomationTriggerKind,
  type AutomationComparisonOp,
  type AutomationConditionField,
  type AutomationAction,
  type AutomationLeafCondition,
  type AutomationCondition,
  type AutomationConditionGroupKind,
} from "@/document/automation";
import { CONTROL_COMMAND_TYPES, type ControlCommandType } from "@/document/controlProtocol";

/**
 * Phase 10b — Automation panel. Rule list on the left, editor on the
 * right. Master kill switch across the top, rate-limit banner surfaces
 * automatically when the engine hits `RATE_LIMIT_MAX_ACTIONS` in a
 * rolling second and requires operator acknowledgment.
 *
 * Deliberately compact — automation is a broadcast-critical surface,
 * and a modal-heavy multi-page editor is exactly the operator-hostile
 * pattern Phase 4's rebuild worked to avoid.
 */
export function AutomationPanel() {
  const rules = useAutomationStore((s) => s.rules);
  const masterEnabled = useAutomationStore((s) => s.masterEnabled);
  const rateLimited = useAutomationStore((s) => s.rateLimited);
  const addRule = useAutomationStore((s) => s.addRule);
  const updateRule = useAutomationStore((s) => s.updateRule);
  const removeRule = useAutomationStore((s) => s.removeRule);
  const toggleEnabled = useAutomationStore((s) => s.toggleEnabled);
  const setMasterEnabled = useAutomationStore((s) => s.setMasterEnabled);
  const acknowledgeRateLimit = useAutomationStore((s) => s.acknowledgeRateLimit);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = rules.find((r) => r.id === selectedId) ?? null;

  const handleAdd = () => {
    const rule: AutomationRule = {
      id: newRuleId(),
      name: "New rule",
      enabled: false,
      trigger: { kind: "on_take" },
      actions: [{ type: "take" }],
    };
    try {
      addRule(rule);
      setSelectedId(rule.id);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleUpdate = (patch: Partial<AutomationRule>) => {
    if (!selected) return;
    try {
      updateRule(selected.id, patch);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg-deepest font-mono text-xs">
      {/* Header + master kill switch */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-base px-2 py-1.5">
        <Zap className="h-3.5 w-3.5 text-accent-blue-bright" />
        <span className="font-semibold text-text-muted-alt">Automation</span>
        <label className="ml-2 flex cursor-pointer items-center gap-1 text-[10px] text-text-muted">
          <input
            type="checkbox"
            checked={masterEnabled}
            onChange={(e) => setMasterEnabled(e.target.checked)}
          />
          Master {masterEnabled ? "ON" : "OFF"}
        </label>
        <span className="ml-auto text-[9px] text-text-muted">
          rate limit: {RATE_LIMIT_MAX_ACTIONS} actions / {RATE_LIMIT_WINDOW_MS}ms
        </span>
      </div>

      {rateLimited && (
        <div className="flex shrink-0 items-center gap-2 border-b border-live-red/50 bg-live-red/10 px-2 py-1 text-[10px] text-live-red">
          <AlertTriangle className="h-3 w-3" />
          Rate limit tripped — engine paused. Acknowledge to resume.
          <button
            onClick={acknowledgeRateLimit}
            className="ml-auto rounded border border-live-red bg-live-red/20 px-2 py-0.5 hover:bg-live-red/40"
          >
            Resume
          </button>
        </div>
      )}

      {error && (
        <div className="shrink-0 border-b border-live-red/50 bg-live-red/10 px-2 py-1 text-[10px] text-live-red">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* Two-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Rule list */}
        <div className="flex w-1/3 flex-col border-r border-border-subtle">
          <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-text-muted">rules ({rules.length})</span>
            <button
              onClick={handleAdd}
              className="ml-auto flex items-center gap-1 rounded border border-border-subtle bg-bg-surface px-2 py-0.5 text-[10px] text-text-muted-alt hover:border-accent-blue"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {rules.length === 0 && (
              <div className="p-4 text-center text-[10px] text-text-muted">
                No rules yet. Click New to add one.
              </div>
            )}
            {rules.map((rule) => (
              <div
                key={rule.id}
                onClick={() => setSelectedId(rule.id)}
                className={`group flex cursor-pointer items-center gap-2 border-b border-border-subtle/60 px-2 py-1 ${
                  rule.id === selectedId ? "bg-accent-blue/20" : "hover:bg-bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleEnabled(rule.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="flex-1 truncate text-[11px] text-text-muted-alt">{rule.name}</span>
                <span className="text-[9px] text-text-muted">
                  {rule.trigger.kind} → {rule.actions.length === 1 ? rule.actions[0].type : `${rule.actions.length} actions`}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRule(rule.id);
                    if (selectedId === rule.id) setSelectedId(null);
                  }}
                  className="opacity-0 group-hover:opacity-100"
                  title="Remove rule"
                >
                  <Trash2 className="h-3 w-3 text-text-muted hover:text-live-red" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="min-w-0 flex-1 overflow-auto p-3">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-[10px] text-text-muted">
              Select a rule to edit, or click New.
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">Name</span>
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => handleUpdate({ name: e.target.value })}
                  className="rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
                />
              </label>

              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">Trigger</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selected.trigger.kind}
                    onChange={(e) => {
                      const kind = e.target.value as AutomationTriggerKind;
                      handleUpdate({
                        trigger: kind === "on_timer" ? { kind, seconds: 60 } : { kind },
                      });
                    }}
                    className="rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
                  >
                    {AUTOMATION_TRIGGER_KINDS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                  {selected.trigger.kind === "on_timer" && (
                    <label className="flex items-center gap-1 text-[10px] text-text-muted">
                      every
                      <input
                        type="number"
                        min={1}
                        value={selected.trigger.seconds}
                        onChange={(e) =>
                          handleUpdate({
                            trigger: { kind: "on_timer", seconds: Math.max(1, Number(e.target.value)) },
                          })
                        }
                        className="w-16 rounded border border-border-subtle bg-bg-surface px-2 py-0.5 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
                      />
                      seconds
                    </label>
                  )}
                  {selected.trigger.kind === "on_mos_message" && (
                    <label className="flex items-center gap-1 text-[10px] text-text-muted">
                      role filter (optional)
                      <input
                        type="text"
                        value={selected.trigger.roleFilter ?? ""}
                        placeholder="roCreate, roStorySend…"
                        onChange={(e) =>
                          handleUpdate({
                            trigger: { kind: "on_mos_message", roleFilter: e.target.value || undefined },
                          })
                        }
                        className="w-40 rounded border border-border-subtle bg-bg-surface px-2 py-0.5 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
                      />
                    </label>
                  )}
                </div>
              </div>

              <ConditionEditor
                condition={selected.condition}
                onChange={(condition) => handleUpdate({ condition })}
              />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-text-muted">
                    Actions ({selected.actions.length})
                  </span>
                  <button
                    onClick={() =>
                      handleUpdate({
                        actions: [...selected.actions, { type: "take" } satisfies AutomationAction],
                      })
                    }
                    className="ml-auto flex items-center gap-1 rounded border border-border-subtle bg-bg-surface px-2 py-0.5 text-[10px] text-text-muted-alt hover:border-accent-blue"
                  >
                    <Plus className="h-3 w-3" /> Add action
                  </button>
                </div>
                <div className="text-[9px] text-text-muted">
                  Each action fires in order and counts separately against the rate limit
                  ({RATE_LIMIT_MAX_ACTIONS}/1000ms across all rules).
                </div>
                {selected.actions.map((action, i) => (
                  <div
                    key={i}
                    className="space-y-1 rounded border border-border-subtle bg-bg-surface/40 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-text-muted">#{i + 1}</span>
                      <select
                        value={action.type}
                        onChange={(e) => {
                          const next = [...selected.actions];
                          next[i] = { ...action, type: e.target.value as ControlCommandType };
                          handleUpdate({ actions: next });
                        }}
                        className="rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
                      >
                        {CONTROL_COMMAND_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        disabled={selected.actions.length <= 1}
                        onClick={() =>
                          handleUpdate({
                            actions: selected.actions.filter((_, idx) => idx !== i),
                          })
                        }
                        className="ml-auto text-text-muted hover:text-live-red disabled:opacity-30"
                        title={selected.actions.length <= 1 ? "Rules must have at least one action" : "Remove"}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <textarea
                      value={JSON.stringify(action.params ?? {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const params = JSON.parse(e.target.value);
                          const next = [...selected.actions];
                          next[i] = { ...action, params };
                          handleUpdate({ actions: next });
                        } catch {
                          // Invalid JSON — don't save until it parses.
                        }
                      }}
                      className="h-16 w-full rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
                      placeholder="{}"
                    />
                  </div>
                ))}
              </div>

              <div className="text-[9px] text-text-muted">
                Rule id: <span className="font-mono">{selected.id}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Condition tree editor — Phase 10.2. Depth-1 nesting max: root is either
// a single leaf or an all_of/any_of group with leaf children.
// ---------------------------------------------------------------------------

const emptyLeaf = (): AutomationLeafCondition => ({ field: "onAir", op: "==", value: true });

function coerceValueText(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

interface ConditionEditorProps {
  condition: AutomationCondition | undefined;
  onChange: (next: AutomationCondition | undefined) => void;
}

function ConditionEditor({ condition, onChange }: ConditionEditorProps) {
  // The "shape" dropdown is the operator's model: "no condition" |
  // "single clause" | "all of..." | "any of...". Behind it, undefined
  // vs leaf vs group.
  const currentShape: "off" | "single" | "all_of" | "any_of" = !condition
    ? "off"
    : isConditionGroup(condition)
      ? condition.kind
      : "single";

  const setShape = (shape: "off" | "single" | "all_of" | "any_of") => {
    if (shape === "off") return onChange(undefined);
    if (shape === "single") {
      const leaf = condition && !isConditionGroup(condition) ? condition : emptyLeaf();
      return onChange(leaf);
    }
    // Group. Reuse existing clauses if we're switching combinator; else
    // seed with one leaf so the operator sees an editable row.
    const existing =
      condition && isConditionGroup(condition) ? condition.conditions : condition ? [condition] : [emptyLeaf()];
    onChange({ kind: shape, conditions: existing });
  };

  const updateGroupClause = (idx: number, next: AutomationLeafCondition) => {
    if (!condition || !isConditionGroup(condition)) return;
    const conditions = condition.conditions.map((c, i) => (i === idx ? next : c));
    onChange({ ...condition, conditions });
  };

  const addGroupClause = () => {
    if (!condition || !isConditionGroup(condition)) return;
    onChange({ ...condition, conditions: [...condition.conditions, emptyLeaf()] });
  };

  const removeGroupClause = (idx: number) => {
    if (!condition || !isConditionGroup(condition)) return;
    const conditions = condition.conditions.filter((_, i) => i !== idx);
    onChange({ ...condition, conditions });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">Condition</span>
        <select
          value={currentShape}
          onChange={(e) => setShape(e.target.value as typeof currentShape)}
          className="rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
        >
          <option value="off">no condition</option>
          <option value="single">single clause</option>
          <option value="all_of">all of…</option>
          <option value="any_of">any of…</option>
        </select>
        {condition && isConditionGroup(condition) && (
          <button
            onClick={addGroupClause}
            className="ml-auto flex items-center gap-1 rounded border border-border-subtle bg-bg-surface px-2 py-0.5 text-[10px] text-text-muted-alt hover:border-accent-blue"
          >
            <Plus className="h-3 w-3" /> Add clause
          </button>
        )}
      </div>

      {condition && !isConditionGroup(condition) && (
        <LeafEditor
          leaf={condition}
          onChange={onChange}
          onRemove={undefined}
        />
      )}

      {condition && isConditionGroup(condition) && (
        <div className="space-y-1">
          {condition.conditions.length === 0 && (
            <div className="text-[9px] text-text-muted">
              Empty group — {condition.kind === "all_of" ? "evaluates true (vacuous truth)" : "evaluates false"}.
              Add a clause to gate the trigger.
            </div>
          )}
          {condition.conditions.map((leaf, i) => (
            <LeafEditor
              key={i}
              leaf={leaf}
              onChange={(next) => updateGroupClause(i, next)}
              onRemove={() => removeGroupClause(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LeafEditorProps {
  leaf: AutomationLeafCondition;
  onChange: (next: AutomationLeafCondition) => void;
  onRemove: (() => void) | undefined;
}

function LeafEditor({ leaf, onChange, onRemove }: LeafEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border-subtle bg-bg-surface/40 p-2">
      <select
        value={leaf.field}
        onChange={(e) => onChange({ ...leaf, field: e.target.value as AutomationConditionField })}
        className="rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
      >
        {AUTOMATION_CONDITION_FIELDS.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <select
        value={leaf.op}
        onChange={(e) => onChange({ ...leaf, op: e.target.value as AutomationComparisonOp })}
        className="rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
      >
        {AUTOMATION_COMPARISON_OPS.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>
      <input
        type="text"
        value={String(leaf.value)}
        onChange={(e) => onChange({ ...leaf, value: coerceValueText(e.target.value) })}
        className="w-32 rounded border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-muted-alt outline-none focus:border-accent-blue"
      />
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-auto text-text-muted hover:text-live-red"
          title="Remove clause"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// The AutomationConditionGroupKind is exported from the store module; we
// import it above to keep the shape editor's types honest, even if the
// UI here only pattern-matches on the four string literals.
void (null as unknown as AutomationConditionGroupKind);
