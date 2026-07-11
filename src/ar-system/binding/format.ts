/**
 * Shared binding value formatting — ONE implementation used by the editor
 * render path (SetNodes' applyTextBinding), the output bake
 * (persistence.ts's resolveSetNodes) and the data-mapping UI, so a formatted
 * field can't read differently in the editor vs on air.
 *
 * A `format` string is either the legacy `{value}` template (kept working
 * verbatim) or a pipe list of named formatters, e.g. `uppercase`,
 * `integer|suffix: PTS`, `truncate:12|titlecase`. Named formatters are safe
 * string/number transforms — never evaluated code.
 */

export interface FormatterDef {
  id: string;
  label: string;
  /** Whether the formatter takes a `:arg`. */
  arg?: "text" | "number";
}

export const NAMED_FORMATTERS: FormatterDef[] = [
  { id: "uppercase", label: "Uppercase" },
  { id: "lowercase", label: "Lowercase" },
  { id: "titlecase", label: "Title case" },
  { id: "integer", label: "Integer" },
  { id: "decimal", label: "Decimal (1dp)" },
  { id: "decimal2", label: "Decimal (2dp)" },
  { id: "percentage", label: "Percentage" },
  { id: "score", label: "Score" },
  { id: "clock", label: "Match clock (mm:ss)" },
  { id: "time", label: "Time (HH:MM)" },
  { id: "date", label: "Date" },
  { id: "shortname", label: "Short team name", arg: "number" },
  { id: "truncate", label: "Truncate…", arg: "number" },
  { id: "prefix", label: "Prefix…", arg: "text" },
  { id: "suffix", label: "Suffix…", arg: "text" },
];

const FORMATTER_IDS = new Set(NAMED_FORMATTERS.map((f) => f.id));

function toTitleCase(raw: string): string {
  return raw.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (m) => m.toUpperCase());
}

/** `90` -> `90:00`, `12.5` (minutes) -> `12:30`, `12:30` passes through. */
function toClock(raw: string): string {
  if (/^\d{1,3}:\d{2}$/.test(raw.trim())) return raw.trim();
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return raw;
  const totalSec = Math.max(0, Math.round(num * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toTime(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function toDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function applyNamed(raw: string, id: string, arg: string | undefined): string {
  const num = parseFloat(raw);
  const isNum = Number.isFinite(num);
  switch (id) {
    case "uppercase":
      return raw.toUpperCase();
    case "lowercase":
      return raw.toLowerCase();
    case "titlecase":
      return toTitleCase(raw);
    case "integer":
      return isNum ? String(Math.round(num)) : raw;
    case "decimal":
      return isNum ? num.toFixed(1) : raw;
    case "decimal2":
      return isNum ? num.toFixed(2) : raw;
    case "percentage":
      return isNum ? `${Math.round(num * 10) / 10}%` : raw;
    case "score":
      // A score is a non-negative integer; anything else passes through.
      return isNum ? String(Math.max(0, Math.round(num))) : raw;
    case "clock":
      return toClock(raw);
    case "time":
      return toTime(raw);
    case "date":
      return toDate(raw);
    case "shortname": {
      const n = arg ? parseInt(arg, 10) : 3;
      const upper = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
      const words = upper.split(/\s+/).filter(Boolean);
      if (words.length >= 2) return words.map((w) => w[0]).join("").slice(0, Number.isFinite(n) ? n : 3);
      return upper.replace(/\s+/g, "").slice(0, Number.isFinite(n) ? n : 3);
    }
    case "truncate": {
      const n = arg ? parseInt(arg, 10) : 12;
      const max = Number.isFinite(n) && n > 0 ? n : 12;
      return raw.length > max ? `${raw.slice(0, Math.max(1, max - 1))}…` : raw;
    }
    case "prefix":
      return `${arg ?? ""}${raw}`;
    case "suffix":
      return `${raw}${arg ?? ""}`;
    default:
      return raw;
  }
}

/** True when a format string is a pipe list of named formatters. */
export function isNamedFormat(format: string): boolean {
  if (format.includes("{value")) return false;
  return format
    .split("|")
    .every((step) => FORMATTER_IDS.has(step.split(":")[0].trim().toLowerCase()) && step.trim().length > 0);
}

/**
 * Apply a Binding.format to a raw value. Supports both the legacy `{value}`
 * template (incl. the `{value:,}` thousands hint) and named formatter pipes.
 */
export function formatBindingValue(raw: string, format?: string): string {
  if (!format) return raw;
  if (isNamedFormat(format)) {
    return format.split("|").reduce((acc, step) => {
      const [id, ...rest] = step.split(":");
      // The arg is NOT trimmed — a leading space in `suffix: PTS` is the
      // separator the operator typed on purpose ("3 PTS", not "3PTS").
      return applyNamed(acc, id.trim().toLowerCase(), rest.length ? rest.join(":") : undefined);
    }, raw);
  }
  if (format.includes("{value:,}")) {
    const num = parseFloat(raw);
    if (!Number.isNaN(num)) return format.replace("{value:,}", num.toLocaleString("en-US"));
  }
  return format.replace("{value}", raw);
}
