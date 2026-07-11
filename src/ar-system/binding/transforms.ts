import type { BindingTransform } from "../dataHub/types";

/** Safe binding transforms — no arbitrary JavaScript execution. */
export function applyTransform(raw: string, transform?: BindingTransform): string {
  if (!transform || transform.type === "direct") {
    return transform?.format ? transform.format.replace("{value}", raw) : raw;
  }

  const num = parseFloat(raw);
  const isNum = !Number.isNaN(num);

  switch (transform.type) {
    case "number":
      if (!isNum) return raw;
      return formatNumber(num, transform.decimals ?? 0, transform.prefix, transform.suffix, transform.format);
    case "percent":
      if (!isNum) return raw;
      return formatNumber(num, transform.decimals ?? 1, transform.prefix ?? "", transform.suffix ?? "%", transform.format);
    case "currency":
      if (!isNum) return raw;
      return formatNumber(num, transform.decimals ?? 0, transform.prefix ?? "", transform.suffix ?? "", transform.format ?? "${value}");
    case "uppercase":
      return raw.toUpperCase();
    case "lowercase":
      return raw.toLowerCase();
    case "clamp":
      if (!isNum) return raw;
      const clamped = Math.max(transform.min ?? -Infinity, Math.min(transform.max ?? Infinity, num));
      return String(clamped);
    default:
      return transform.format ? transform.format.replace("{value}", raw) : raw;
  }
}

function formatNumber(
  n: number,
  decimals: number,
  prefix = "",
  suffix = "",
  format?: string,
): string {
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (format) return format.replace("{value}", formatted);
  return `${prefix}${formatted}${suffix}`;
}

/** Legacy `{value}` format support from existing bindings. */
export function applyLegacyFormat(raw: string, format?: string): string {
  if (!format) return raw;
  // Support {value:,} as thousands separator hint
  if (format.includes("{value:,}")) {
    const num = parseFloat(raw);
    if (!Number.isNaN(num)) {
      return format.replace("{value:,}", num.toLocaleString("en-US"));
    }
  }
  return format.replace("{value}", raw);
}
