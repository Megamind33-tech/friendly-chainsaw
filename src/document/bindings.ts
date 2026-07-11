import type { Element } from "./types";

import { applyLegacyFormat } from "@/ar-system/binding/transforms";

/** `{value}` is replaced with the resolved raw value; no placeholder means use the raw value as-is. */
function applyFormat(raw: string, format?: string): string {
  return applyLegacyFormat(raw, format);
}

/**
 * Returns a new element with every bound field (`binding.targetPath`)
 * overridden by live data — falling back to `binding.fallback` (or, if
 * that's also absent, the element's own authored value) when the source
 * key isn't present in `values`. Pure: never mutates `el`, so callers can
 * apply it at render/push time without touching the stored document —
 * the store still holds the authored default, only the rendered/pushed
 * copy carries the resolved value.
 */
export function resolveElement(el: Element, values: Record<string, string>): Element {
  const withResolvedChildren: Element =
    el.kind === "group" ? { ...el, children: el.children.map((c) => resolveElement(c, values)) } : el;

  if (el.bindings.length === 0) return withResolvedChildren;

  const resolved: Record<string, unknown> = { ...withResolvedChildren };
  for (const binding of el.bindings) {
    const raw = values[binding.source];
    const value = raw !== undefined ? applyFormat(raw, binding.format) : binding.fallback;
    if (value === undefined) continue;
    resolved[binding.targetPath] = value;
  }
  return resolved as unknown as Element;
}

export function resolveElements(elements: Element[], values: Record<string, string>): Element[] {
  return elements.map((el) => resolveElement(el, values));
}
