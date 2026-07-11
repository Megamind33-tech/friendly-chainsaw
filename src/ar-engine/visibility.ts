import type { VisibilityRule } from "@/document/types";

/**
 * Declarative data-driven visibility for AR model content zones — "hide the
 * clock when the match is finished", "show the photo only when provided".
 * Pure and safe (string comparison only, never evaluated code) so the same
 * function runs in the live editor render path AND the output bake.
 */
export function evaluateVisibilityRule(
  rule: VisibilityRule | undefined,
  values: Record<string, string>,
): boolean {
  if (!rule || !rule.source) return true;
  const raw = (values[rule.source] ?? "").trim();
  switch (rule.op) {
    case "empty":
      return raw === "";
    case "notEmpty":
      return raw !== "";
    case "equals":
      return raw === (rule.value ?? "").trim();
    case "notEquals":
      return raw !== (rule.value ?? "").trim();
    default:
      return true;
  }
}
