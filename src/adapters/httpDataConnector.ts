import type { DataConnector } from "./contracts";

function flattenJsonValues(data: unknown, prefix = ""): Record<string, string> {
  if (data === null || data === undefined) return {};
  if (typeof data !== "object" || Array.isArray(data)) return prefix ? { [prefix]: String(data ?? "") } : {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(values, flattenJsonValues(value, path));
    } else {
      values[path] = String(value ?? "");
    }
  }
  return values;
}

/** HTTP JSON connector. It owns transport details; feature code receives flat binding values. */
export function createHttpJsonDataConnector(url: string): DataConnector {
  return {
    async fetch() {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
      return flattenJsonValues(await response.json());
    },
  };
}
