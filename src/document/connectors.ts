import { create } from "zustand";
import { sqliteSettingsRepository } from "@/adapters/sqliteStudioRepository";
import { newId } from "./ids";
import type { ID } from "./types";

/**
 * Real external data connectors.
 *
 * This replaces the single global `{ enabled, apiUrl, pollIntervalSec }` that
 * `externalConnector.ts` carried. That shape could only ever talk to one
 * endpoint, over one transport, with no credentials — which meant it could not
 * consume any commercial feed (they all require a key) and floored scorebug
 * latency at the poll interval. A data-driven graphics engine whose data layer
 * can only reach unauthenticated public URLs is a demo of a data layer.
 *
 * Three things this gets right that the old one did not:
 *
 *  1. **Credentials.** Bearer / custom header / query param / basic. Secrets
 *     are write-only in the UI, scrubbed out of every error message, and never
 *     enter the render envelope (see `redactError`).
 *  2. **Push.** SSE and WebSocket transports, so a feed that pushes arrives in
 *     milliseconds instead of waiting out a poll.
 *  3. **Honest status.** `auth-failed`, `unreachable` and `malformed` are
 *     distinct states and *none of them read as live* — the same rule the
 *     election data hub had to be fixed to obey (AUDIT-2026-08.md S0-2).
 */

const CONNECTORS_KEY = "data_connectors";
/** The pre-connector single-endpoint setting, migrated on first load. */
const LEGACY_KEY = "external_connector";

export type ConnectorTransport = "poll" | "sse" | "websocket";

export type ConnectorAuthKind = "none" | "bearer" | "header" | "query" | "basic";

export interface ConnectorAuth {
  kind: ConnectorAuthKind;
  /** Header name for `header`, query parameter name for `query`. */
  name: string;
  /** Bearer token, header value, or query value. Secret. */
  token: string;
  username: string;
  password: string;
}

/**
 * Every state a connector can be in.
 *
 * "live" requires a payload to have actually arrived and parsed. A connector
 * that is merely configured, or connecting, or erroring, is never live — an
 * operator glancing at this list must be able to trust green.
 */
export type ConnectorStatus =
  | "disabled"
  | "idle"
  | "connecting"
  | "live"
  | "stale"
  | "auth-failed"
  | "unreachable"
  | "malformed";

export const CONNECTOR_STATUS_LABELS: Record<ConnectorStatus, string> = {
  disabled: "Disabled",
  idle: "Idle",
  connecting: "Connecting",
  live: "Live",
  stale: "Stale",
  "auth-failed": "Auth failed",
  unreachable: "Unreachable",
  malformed: "Bad payload",
};

/** Only one of these means the data on air is current and trustworthy. */
export function isConnectorLive(status: ConnectorStatus): boolean {
  return status === "live";
}

export interface DataConnectorConfig {
  id: ID;
  name: string;
  enabled: boolean;
  transport: ConnectorTransport;
  url: string;
  auth: ConnectorAuth;
  /** Poll transport only. */
  pollIntervalSec: number;
  /**
   * Prefix every incoming key with `<source>.` so one connector feeds one data
   * source. Empty means keys arrive already namespaced (or land on `mock`).
   */
  targetSource: string;
  /** Incoming key -> binding key. Empty map is pass-through. */
  fieldMap: Record<string, string>;
  /** No update within this window marks the connector stale. */
  staleAfterSec: number;
}

export interface ConnectorRuntime {
  status: ConnectorStatus;
  lastSyncAt: number | null;
  /** Already redacted — safe to render. */
  lastError: string | null;
  /** Consecutive failures, driving reconnect backoff. */
  failureCount: number;
  lastKeyCount: number;
}

export const MIN_POLL_SEC = 1;
export const MAX_POLL_SEC = 3600;
export const DEFAULT_POLL_SEC = 5;
export const DEFAULT_STALE_AFTER_SEC = 30;

export function clampPollSec(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POLL_SEC;
  return Math.min(MAX_POLL_SEC, Math.max(MIN_POLL_SEC, Math.round(value)));
}

export const EMPTY_AUTH: ConnectorAuth = { kind: "none", name: "", token: "", username: "", password: "" };

export function createConnector(over: Partial<DataConnectorConfig> = {}): DataConnectorConfig {
  return {
    id: newId(),
    name: "New connector",
    enabled: false,
    transport: "poll",
    url: "",
    auth: { ...EMPTY_AUTH },
    pollIntervalSec: DEFAULT_POLL_SEC,
    targetSource: "",
    fieldMap: {},
    staleAfterSec: DEFAULT_STALE_AFTER_SEC,
    ...over,
  };
}

export const IDLE_RUNTIME: ConnectorRuntime = {
  status: "idle",
  lastSyncAt: null,
  lastError: null,
  failureCount: 0,
  lastKeyCount: 0,
};

// ---------------------------------------------------------------------------
// Pure helpers — all unit-tested, none of them touch the network or the store.
// ---------------------------------------------------------------------------

/** Every secret a connector holds, for scrubbing. */
function secretsOf(auth: ConnectorAuth): string[] {
  return [auth.token, auth.password].filter((s): s is string => !!s && s.length > 0);
}

/**
 * Strip credentials out of a message before it is ever stored or displayed.
 *
 * Error text routinely echoes the request — a 401 body can quote the header it
 * rejected, and a bad URL throws with the full query string, which for
 * `query`-kind auth contains the key. `lastError` is rendered in the panel and
 * kept in memory, so scrubbing has to happen at the boundary rather than at
 * each display site, where one missed call leaks the key.
 */
export function redactError(message: string, auth: ConnectorAuth): string {
  let out = message;
  for (const secret of secretsOf(auth)) {
    // Split/join rather than a RegExp: a token can contain regex metacharacters.
    out = out.split(secret).join("***");
  }
  return out;
}

/** Applies auth to a request, returning the URL and headers to use. */
export function applyAuth(url: string, auth: ConnectorAuth): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  switch (auth.kind) {
    case "bearer":
      if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
      break;
    case "header":
      if (auth.name && auth.token) headers[auth.name] = auth.token;
      break;
    case "basic":
      if (auth.username || auth.password) {
        headers.Authorization = `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
      }
      break;
    case "query": {
      if (auth.name && auth.token) {
        try {
          const parsed = new URL(url);
          parsed.searchParams.set(auth.name, auth.token);
          return { url: parsed.toString(), headers };
        } catch {
          // Malformed URL: leave it untouched so the transport reports the
          // real failure rather than this helper inventing one.
          return { url, headers };
        }
      }
      break;
    }
    case "none":
      break;
  }
  return { url, headers };
}

/**
 * Map an HTTP status onto a connector status.
 *
 * 401/403 is specifically `auth-failed` rather than a generic error: "check
 * your API key" and "the feed is down" call for completely different operator
 * actions, and lumping them together is why bad-credential problems get
 * misdiagnosed as outages minutes before air.
 */
export function statusForHttpCode(code: number): ConnectorStatus {
  if (code === 401 || code === 403) return "auth-failed";
  return "unreachable";
}

/** Reconnect backoff: 1s, 2s, 4s … capped, so a dead endpoint is retried
 * without hammering it or waiting minutes once it recovers. */
export function backoffMs(failureCount: number): number {
  const capped = Math.min(failureCount, 6);
  return Math.min(30_000, 1000 * 2 ** Math.max(0, capped - 1));
}

/**
 * Apply a connector's field map and target source to raw incoming keys.
 *
 * Order matters: the field map is applied first (it renames the feed's own key
 * to whatever the templates bind), then the target source namespaces it. A
 * mapped key that already contains a dot is treated as fully qualified and is
 * left alone, so an operator can point one field at a different source without
 * having to disable the prefix for the whole connector.
 */
export function applyFieldMapping(
  values: Record<string, string>,
  config: Pick<DataConnectorConfig, "fieldMap" | "targetSource">,
): Record<string, string> {
  const out: Record<string, string> = {};
  const source = config.targetSource.trim();
  for (const [rawKey, value] of Object.entries(values)) {
    const mapped = config.fieldMap[rawKey] ?? rawKey;
    if (!mapped) continue; // Mapped to empty string = explicitly dropped.
    const key = source && !mapped.includes(".") ? `${source}.${mapped}` : mapped;
    out[key] = value;
  }
  return out;
}

/** True once a live connector has gone quiet for longer than its window. */
export function isStale(runtime: ConnectorRuntime, staleAfterSec: number, now: number): boolean {
  if (runtime.status !== "live" || runtime.lastSyncAt === null) return false;
  return now - runtime.lastSyncAt > staleAfterSec * 1000;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type ConnectorPatch = Partial<Omit<DataConnectorConfig, "auth">> & { auth?: Partial<ConnectorAuth> };

interface ConnectorState {
  connectors: DataConnectorConfig[];
  runtime: Record<ID, ConnectorRuntime>;
  addConnector: (over?: Partial<DataConnectorConfig>) => ID;
  /** `auth` is merged field-by-field so a UI control can set one key without
   * having to resend the whole credential block (and risk blanking a secret
   * it never displayed). */
  updateConnector: (id: ID, patch: ConnectorPatch) => void;
  removeConnector: (id: ID) => void;
  setRuntime: (id: ID, patch: Partial<ConnectorRuntime>) => void;
  replaceAll: (connectors: DataConnectorConfig[]) => void;
}

export const useConnectorStore = create<ConnectorState>((set) => ({
  connectors: [],
  runtime: {},

  addConnector: (over) => {
    const connector = createConnector(over);
    set((state) => ({
      connectors: [...state.connectors, connector],
      runtime: { ...state.runtime, [connector.id]: { ...IDLE_RUNTIME } },
    }));
    return connector.id;
  },

  updateConnector: (id, patch) =>
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              auth: patch.auth ? { ...c.auth, ...patch.auth } : c.auth,
              pollIntervalSec:
                patch.pollIntervalSec !== undefined ? clampPollSec(patch.pollIntervalSec) : c.pollIntervalSec,
            }
          : c,
      ),
    })),

  removeConnector: (id) =>
    set((state) => {
      const runtime = { ...state.runtime };
      delete runtime[id];
      return { connectors: state.connectors.filter((c) => c.id !== id), runtime };
    }),

  setRuntime: (id, patch) =>
    set((state) => ({
      runtime: { ...state.runtime, [id]: { ...(state.runtime[id] ?? IDLE_RUNTIME), ...patch } },
    })),

  replaceAll: (connectors) =>
    set(() => ({
      connectors,
      runtime: Object.fromEntries(connectors.map((c) => [c.id, { ...IDLE_RUNTIME }])),
    })),
}));

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Normalise anything read back off disk.
 *
 * A settings blob is user-writable and survives across versions, so every
 * field is re-defaulted rather than trusted. A connector that fails to parse
 * is dropped rather than crashing the panel it appears in.
 */
export function parseConnectors(raw: unknown): DataConnectorConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: DataConnectorConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<DataConnectorConfig> & { auth?: Partial<ConnectorAuth> };
    if (typeof c.url !== "string") continue;
    out.push({
      id: typeof c.id === "string" && c.id ? c.id : newId(),
      name: typeof c.name === "string" && c.name ? c.name : "Connector",
      enabled: !!c.enabled,
      transport: c.transport === "sse" || c.transport === "websocket" ? c.transport : "poll",
      url: c.url,
      auth: {
        kind:
          c.auth?.kind === "bearer" ||
          c.auth?.kind === "header" ||
          c.auth?.kind === "query" ||
          c.auth?.kind === "basic"
            ? c.auth.kind
            : "none",
        name: typeof c.auth?.name === "string" ? c.auth.name : "",
        token: typeof c.auth?.token === "string" ? c.auth.token : "",
        username: typeof c.auth?.username === "string" ? c.auth.username : "",
        password: typeof c.auth?.password === "string" ? c.auth.password : "",
      },
      pollIntervalSec: clampPollSec(Number(c.pollIntervalSec ?? DEFAULT_POLL_SEC)),
      targetSource: typeof c.targetSource === "string" ? c.targetSource : "",
      fieldMap:
        c.fieldMap && typeof c.fieldMap === "object" && !Array.isArray(c.fieldMap)
          ? Object.fromEntries(
              Object.entries(c.fieldMap as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
            )
          : {},
      staleAfterSec: Number.isFinite(Number(c.staleAfterSec))
        ? Math.max(1, Number(c.staleAfterSec))
        : DEFAULT_STALE_AFTER_SEC,
    });
  }
  return out;
}

/**
 * Carry the pre-connector single-endpoint setting forward.
 *
 * An operator who had configured the old global URL must not silently lose it
 * on upgrade — a data feed vanishing between shows with no message is exactly
 * the kind of surprise this codebase is otherwise careful to avoid.
 */
export function migrateLegacyConnector(raw: unknown): DataConnectorConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const legacy = raw as { enabled?: unknown; apiUrl?: unknown; pollIntervalSec?: unknown };
  if (typeof legacy.apiUrl !== "string" || !legacy.apiUrl.trim()) return null;
  return createConnector({
    name: "Imported endpoint",
    enabled: !!legacy.enabled,
    transport: "poll",
    url: legacy.apiUrl,
    pollIntervalSec: clampPollSec(Number(legacy.pollIntervalSec ?? DEFAULT_POLL_SEC)),
  });
}

export async function loadConnectors(): Promise<void> {
  try {
    const raw = await sqliteSettingsRepository.get(CONNECTORS_KEY);
    if (raw) {
      useConnectorStore.getState().replaceAll(parseConnectors(JSON.parse(raw)));
      return;
    }
    // Nothing stored under the new key — try the legacy single endpoint once.
    const legacyRaw = await sqliteSettingsRepository.get(LEGACY_KEY);
    if (legacyRaw) {
      const migrated = migrateLegacyConnector(JSON.parse(legacyRaw));
      if (migrated) {
        useConnectorStore.getState().replaceAll([migrated]);
        await saveConnectors();
      }
    }
  } catch (err) {
    console.warn("failed to load data connectors", err);
  }
}

export async function saveConnectors(): Promise<void> {
  const { connectors } = useConnectorStore.getState();
  await sqliteSettingsRepository.set(CONNECTORS_KEY, JSON.stringify(connectors));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
useConnectorStore.subscribe((state, prev) => {
  if (state.connectors === prev.connectors) return; // Runtime churn must not write.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveConnectors().catch((err) => console.error("connector save failed", err));
  }, 500);
});
