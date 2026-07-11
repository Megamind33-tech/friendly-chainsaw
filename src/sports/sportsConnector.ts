import { create } from "zustand";
import { flattenJsonValues } from "@/document/externalConnector";
import { useDataStore } from "@/document/dataSources";
import { buildSportsTestPayload } from "./liveData";

/**
 * Sports live-data connector — feeds the `sports.*` flat keys from any
 * provider shape. Ingest paths:
 *   manual  → Data workspace (useDataStore.setFeedValue, already wired)
 *   JSON    → applySportsPayload(parsed) (schema-shaped object)
 *   CSV     → existing importCsvFile with `sports.`-prefixed keys
 *   REST    → startSportsRestPolling(url, ms)
 *   WS      → startSportsWebSocket(url)
 *   testing → loadSportsTestData()
 *
 * Validation is fallback-based, never throwing: invalid fields are dropped
 * with a recorded warning so bad data cannot crash the AR scene; the model
 * keeps its last good value (or its authored fallback).
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const CLOCK_RE = /^\d{1,3}:\d{2}$/;

export interface SportsIngestResult {
  applied: number;
  dropped: string[];
}

/** Field validators keyed by flat suffix — anything unlisted passes through. */
const VALIDATORS: Record<string, (v: string) => boolean> = {
  "home.score": (v) => /^\d+$/.test(v),
  "away.score": (v) => /^\d+$/.test(v),
  "score.home": (v) => /^\d+$/.test(v),
  "score.away": (v) => /^\d+$/.test(v),
  "event.clock": (v) => v === "" || CLOCK_RE.test(v),
  "home.colourPrimary": (v) => v === "" || HEX_RE.test(v),
  "home.colourSecondary": (v) => v === "" || HEX_RE.test(v),
  "away.colourPrimary": (v) => v === "" || HEX_RE.test(v),
  "away.colourSecondary": (v) => v === "" || HEX_RE.test(v),
  "home.logo": (v) => v === "" || /^(https?:\/\/|\/|data:image\/)/.test(v),
  "away.logo": (v) => v === "" || /^(https?:\/\/|\/|data:image\/)/.test(v),
  "player.photo": (v) => v === "" || /^(https?:\/\/|\/|data:image\/)/.test(v),
};

/** Validate + merge a flat sports key/value map into the live feed. */
export function applySportsValues(values: Record<string, string>): SportsIngestResult {
  const state = useDataStore.getState();
  const dropped: string[] = [];
  const valid: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(values)) {
    const key = rawKey.startsWith("sports.") ? rawKey.slice("sports.".length) : rawKey;
    const check = VALIDATORS[key];
    if (check && !check(String(value))) {
      dropped.push(`${key}=${value}`);
      continue;
    }
    valid[key] = String(value);
  }
  // One batched store update = one output bake/push per payload, however
  // many fields arrived — a live feed must never jank the render loop.
  if (Object.keys(valid).length) state.mergeFeedValues("sports", valid);
  if (dropped.length) {
    useSportsConnector.setState({ lastWarnings: dropped.slice(0, 12) });
  }
  return { applied: Object.keys(valid).length, dropped };
}

/** Ingest a schema-shaped payload (sports-live-data.schema.json object). */
export function applySportsPayload(payload: unknown): SportsIngestResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    useSportsConnector.setState({ lastWarnings: ["payload is not an object"] });
    return { applied: 0, dropped: ["payload"] };
  }
  return applySportsValues(flattenJsonValues(payload));
}

/** Load the built-in simulator payload — explicit rehearsal action. */
export function loadSportsTestData(): SportsIngestResult {
  return applySportsValues(buildSportsTestPayload());
}

// ---------------------------------------------------------------------------
// Live connections (REST poll / WebSocket) — status is honest state, never
// a fake "connected" while nothing flows.
// ---------------------------------------------------------------------------

export interface SportsConnectorState {
  wsUrl: string;
  wsStatus: "off" | "connecting" | "live" | "error";
  restUrl: string;
  restIntervalMs: number;
  restStatus: "off" | "polling" | "error";
  lastError: string | null;
  lastWarnings: string[];
  lastUpdateAt: number | null;
  setWsUrl: (url: string) => void;
  setRestUrl: (url: string) => void;
  setRestIntervalMs: (ms: number) => void;
}

export const useSportsConnector = create<SportsConnectorState>((set) => ({
  wsUrl: "",
  wsStatus: "off",
  restUrl: "",
  restIntervalMs: 5000,
  restStatus: "off",
  lastError: null,
  lastWarnings: [],
  lastUpdateAt: null,
  setWsUrl: (wsUrl) => set({ wsUrl }),
  setRestUrl: (restUrl) => set({ restUrl }),
  setRestIntervalMs: (restIntervalMs) => set({ restIntervalMs: Math.max(1000, restIntervalMs) }),
}));

let socket: WebSocket | null = null;
let restTimer: ReturnType<typeof setInterval> | null = null;

export function startSportsWebSocket(url: string): void {
  stopSportsWebSocket();
  if (!url) return;
  useSportsConnector.setState({ wsStatus: "connecting", lastError: null, wsUrl: url });
  try {
    socket = new WebSocket(url);
  } catch (err) {
    useSportsConnector.setState({ wsStatus: "error", lastError: err instanceof Error ? err.message : String(err) });
    return;
  }
  socket.onopen = () => useSportsConnector.setState({ wsStatus: "live" });
  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as unknown;
      const result = applySportsPayload(data);
      if (result.applied > 0) useSportsConnector.setState({ lastUpdateAt: Date.now() });
    } catch (err) {
      useSportsConnector.setState({ lastWarnings: [`bad WS message: ${err instanceof Error ? err.message : String(err)}`] });
    }
  };
  socket.onerror = () => useSportsConnector.setState({ wsStatus: "error", lastError: "WebSocket error" });
  socket.onclose = () => {
    if (useSportsConnector.getState().wsStatus !== "off") {
      useSportsConnector.setState({ wsStatus: "error", lastError: "WebSocket closed" });
    }
  };
}

export function stopSportsWebSocket(): void {
  if (socket) {
    useSportsConnector.setState({ wsStatus: "off" });
    try {
      socket.close();
    } catch {
      // already closed
    }
    socket = null;
  } else {
    useSportsConnector.setState({ wsStatus: "off" });
  }
}

export function startSportsRestPolling(url: string, intervalMs?: number): void {
  stopSportsRestPolling();
  if (!url) return;
  const ms = Math.max(1000, intervalMs ?? useSportsConnector.getState().restIntervalMs);
  useSportsConnector.setState({ restStatus: "polling", restUrl: url, restIntervalMs: ms, lastError: null });
  const poll = async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      const result = applySportsPayload(json);
      if (result.applied > 0) useSportsConnector.setState({ lastUpdateAt: Date.now(), lastError: null });
    } catch (err) {
      useSportsConnector.setState({ restStatus: "error", lastError: err instanceof Error ? err.message : String(err) });
    }
  };
  void poll();
  restTimer = setInterval(() => void poll(), ms);
}

export function stopSportsRestPolling(): void {
  if (restTimer) clearInterval(restTimer);
  restTimer = null;
  useSportsConnector.setState({ restStatus: "off" });
}

// HMR safety — the playout.ts lesson: a module-level timer/socket survives
// hot module replacement and doubles up unless disposed explicitly.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (restTimer) clearInterval(restTimer);
    try {
      socket?.close();
    } catch {
      // already closed
    }
  });
}
