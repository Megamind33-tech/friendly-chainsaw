import { useDataStore, type SportId } from "./dataSources";
import { FEED_IDS } from "./dataSources";

/**
 * Routing and file-import helpers shared by every data path.
 *
 * The single global `{ enabled, apiUrl, pollIntervalSec }` connector that used
 * to live here is gone — see connectors.ts for the real multi-connector model
 * with credentials, push transports and per-connector status. Its persisted
 * settings are migrated on first load, so an operator does not lose a
 * configured endpoint on upgrade.
 */

const SPORT_IDS: SportId[] = ["soccer", "basketball", "football", "baseball", "hockey", "tennis", "volleyball", "rugby"];

/** Flatten nested JSON into dotted keys for binding (e.g. squad.p8photo). */
export function flattenJsonValues(data: unknown, prefix = ""): Record<string, string> {
  if (data === null || data === undefined) return {};
  if (typeof data !== "object" || Array.isArray(data)) {
    return prefix ? { [prefix]: String(data ?? "") } : {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenJsonValues(v, key));
    } else {
      out[key] = String(v ?? "");
    }
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse CSV / Excel-exported CSV into binding keys (key,value or header rows). */
export function parseCsvToValues(text: string): Record<string, string> {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return {};

  const first = parseCsvLine(lines[0]);
  const values: Record<string, string> = {};

  // 1. An explicit `key,value` header is unambiguous.
  if (first.length === 2 && first[0].toLowerCase() === "key") {
    for (let i = 1; i < lines.length; i++) {
      const [k, v = ""] = parseCsvLine(lines[i]);
      if (k) values[k] = v;
    }
    return values;
  }

  // 2. Exactly two lines is a header row plus one data row, whatever its
  //    width. This case used to be swallowed by the key/value branch below,
  //    which treated EVERY line — including the header — as a `key,value`
  //    pair: `home,away\n2,1` parsed to `{home: "away", "2": "1"}` instead of
  //    `{home: "2", away: "1"}`. Two-column exports out of Excel are the most
  //    common shape an operator produces, and the damage was silent — bindings
  //    resolved to plausible-looking wrong values.
  if (lines.length === 2) {
    const row = parseCsvLine(lines[1]);
    first.forEach((h, i) => {
      if (h && row[i] !== undefined) values[h] = row[i];
    });
    return values;
  }

  // 3. Three or more rows, none wider than two columns: a key/value list with
  //    no header (a header here would need a data row to pair with, which
  //    case 2 already handled).
  if (first.length === 2 && lines.every((l) => parseCsvLine(l).length <= 2)) {
    for (const line of lines) {
      const [k, v = ""] = parseCsvLine(line);
      if (k) values[k] = v;
    }
    return values;
  }

  const headers = first;
  if (lines.length >= 2) {
    const row = parseCsvLine(lines[1]);
    headers.forEach((h, i) => {
      if (h && row[i] !== undefined) values[h] = row[i];
    });
  }
  return values;
}

/**
 * Route external key/value pairs to their target source without writing to the
 * store, so callers can batch. Exported for tests and for any caller that
 * wants the routing decision without the side effect.
 */
export function routeExternalValues(
  values: Record<string, string>,
): Record<string, Record<string, string>> {
  const bySource: Record<string, Record<string, string>> = {};
  const put = (source: string, field: string, value: string) => {
    (bySource[source] ??= {})[field] = value;
  };

  for (const [key, value] of Object.entries(values)) {
    const dot = key.indexOf(".");
    if (dot === -1) {
      put("mock", key, value);
      continue;
    }
    const source = key.slice(0, dot);
    const field = key.slice(dot + 1);
    if ((FEED_IDS as string[]).includes(source)) put(source, field, value);
    else if ((SPORT_IDS as string[]).includes(source)) put(source, field, value);
    else if (source === "mock" || source === "brand" || source === "ticker") put(source, field, value);
    // Unrecognised prefix: keep the full dotted key under `mock` so the value
    // is still reachable, rather than silently splitting on a meaningless dot.
    else put("mock", key, value);
  }
  return bySource;
}

/**
 * Push external key/value pairs into the correct live data feeds in ONE store
 * update.
 *
 * This previously called a per-key setter (`setFeedValue`/`setSportValue`/...)
 * in a loop. Each of those is a full store write, and every write re-resolves
 * bindings and re-bakes the output — so a 200-key REST poll cost 200 output
 * bakes, on the live poll path, at whatever the operator set the interval to.
 * `mergeFeedValues` was added for exactly this reason but only the sports
 * connector ever used it.
 */
export function mergeExternalValues(values: Record<string, string>): void {
  const bySource = routeExternalValues(values);
  if (Object.keys(bySource).length === 0) return;
  useDataStore.getState().mergeSourceValues(bySource);
}

export async function importCsvFile(file: File): Promise<number> {
  const text = await file.text();
  const values = parseCsvToValues(text);
  mergeExternalValues(values);
  return Object.keys(values).length;
}
