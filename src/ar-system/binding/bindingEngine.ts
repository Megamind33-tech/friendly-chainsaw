import type { Binding } from "@/document/types";
import { applyLegacyFormat, applyTransform } from "./transforms";
import type { BindingTransform } from "../dataHub/types";

export interface ResolveBindingOptions {
  values: Record<string, string>;
  lastKnownGood?: Record<string, string>;
  transforms?: Record<string, BindingTransform>;
}

export interface ResolveBindingResult {
  value: string;
  usedFallback: boolean;
  rejected: boolean;
  reason?: string;
}

/**
 * Resolve a single binding with fallback and last-known-good protection.
 * Invalid (missing) values use fallback; if fallback absent, use LKG.
 */
export function resolveBinding(
  binding: Binding,
  opts: ResolveBindingOptions,
): ResolveBindingResult {
  const raw = opts.values[binding.source];
  const transform = opts.transforms?.[binding.source];

  if (raw === undefined || raw === null || raw === "") {
    if (binding.fallback !== undefined && binding.fallback !== null) {
      return { value: String(binding.fallback), usedFallback: true, rejected: false };
    }
    const lkg = opts.lastKnownGood?.[binding.targetPath];
    if (lkg !== undefined) {
      return { value: lkg, usedFallback: true, rejected: true, reason: "missing source — using last-known-good" };
    }
    return { value: "", usedFallback: true, rejected: true, reason: "missing source — no fallback" };
  }

  let value = transform ? applyTransform(raw, transform) : applyLegacyFormat(raw, binding.format);
  return { value, usedFallback: false, rejected: false };
}

/** Resolve all bindings for a text field, returning the first matching targetPath. */
export function resolveTextFromBindings(
  bindings: Binding[] | undefined,
  targetPath: string,
  values: Record<string, string>,
  lastKnownGood?: Record<string, string>,
): string | undefined {
  if (!bindings?.length) return undefined;
  const match = bindings.find((b) => b.targetPath === "text" || b.targetPath === targetPath);
  if (!match) return undefined;
  return resolveBinding(match, { values, lastKnownGood }).value;
}

/** Merge resolved values into last-known-good store (only successful resolutions). */
export function updateLastKnownGood(
  lkg: Record<string, string>,
  bindings: Binding[],
  values: Record<string, string>,
): Record<string, string> {
  const next = { ...lkg };
  for (const b of bindings) {
    const result = resolveBinding(b, { values, lastKnownGood: lkg });
    if (!result.rejected && result.value !== "") {
      next[b.targetPath] = result.value;
    }
  }
  return next;
}
