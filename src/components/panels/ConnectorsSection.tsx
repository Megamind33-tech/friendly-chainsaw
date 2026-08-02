import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CONNECTOR_STATUS_LABELS,
  MAX_POLL_SEC,
  MIN_POLL_SEC,
  useConnectorStore,
  type ConnectorAuthKind,
  type ConnectorStatus,
  type ConnectorTransport,
  type DataConnectorConfig,
} from "@/document/connectors";

/**
 * Colour is doing real work here, so it follows one rule: only a connector
 * that has actually delivered a parsed payload gets the "good" colour. Every
 * failure mode is visually distinct from live AND from each other, because
 * "check the API key" and "the feed is down" need different operator actions.
 */
const STATUS_CLASS: Record<ConnectorStatus, string> = {
  live: "border-accent-blue text-accent-blue-bright",
  connecting: "border-live-amber text-live-amber",
  stale: "border-live-amber text-live-amber",
  "auth-failed": "border-live-red text-live-red",
  unreachable: "border-live-red text-live-red",
  malformed: "border-live-red text-live-red",
  idle: "border-border-subtle text-text-muted",
  disabled: "border-border-subtle text-text-muted",
};

const TRANSPORTS: { id: ConnectorTransport; label: string; hint: string }[] = [
  { id: "poll", label: "Poll", hint: "Fetch the URL on an interval" },
  { id: "sse", label: "SSE", hint: "Server-Sent Events — server pushes, no headers possible" },
  { id: "websocket", label: "WebSocket", hint: "Full-duplex socket — server pushes" },
];

const AUTH_KINDS: { id: ConnectorAuthKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "bearer", label: "Bearer token" },
  { id: "header", label: "Custom header" },
  { id: "query", label: "Query param" },
  { id: "basic", label: "Basic" },
];

function ConnectorRow({ config }: { config: DataConnectorConfig }) {
  const runtime = useConnectorStore((s) => s.runtime[config.id]);
  const update = useConnectorStore((s) => s.updateConnector);
  const remove = useConnectorStore((s) => s.removeConnector);
  const [open, setOpen] = useState(false);

  const status: ConnectorStatus = config.enabled ? (runtime?.status ?? "idle") : "disabled";
  // SSE runs through the browser's EventSource, which cannot set request
  // headers — saying so up front beats an operator debugging a 401 that no
  // amount of correct configuration could have avoided.
  const headerAuthUnavailable =
    config.transport === "sse" && (config.auth.kind === "bearer" || config.auth.kind === "header");

  return (
    <div className="rounded border border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-1.5 p-1.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-text-muted hover:text-text-bright"
          title={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update(config.id, { enabled: e.target.checked })}
          title="Enable this connector"
        />
        <Input
          value={config.name}
          onChange={(e) => update(config.id, { name: e.target.value })}
          className="h-6 min-w-0 flex-1 border-border-subtle bg-bg-panel font-mono text-[10px]"
        />
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wide ${STATUS_CLASS[status]}`}
          title={runtime?.lastError ?? CONNECTOR_STATUS_LABELS[status]}
        >
          {CONNECTOR_STATUS_LABELS[status]}
        </span>
        <button
          onClick={() => remove(config.id)}
          className="shrink-0 rounded p-0.5 text-text-muted hover:bg-live-red/20 hover:text-live-red"
          title="Delete connector"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-border-subtle p-1.5">
          <div className="flex gap-1">
            {TRANSPORTS.map((t) => (
              <button
                key={t.id}
                onClick={() => update(config.id, { transport: t.id })}
                title={t.hint}
                className={`flex-1 rounded border px-1 py-0.5 font-mono text-[9px] ${
                  config.transport === t.id
                    ? "border-stripe-active text-text-bright"
                    : "border-border-subtle text-text-muted hover:text-text-bright"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Input
            placeholder={config.transport === "websocket" ? "wss://feed.example.com/live" : "https://api.example.com/scores.json"}
            value={config.url}
            onChange={(e) => update(config.id, { url: e.target.value })}
            className="h-6 border-border-subtle bg-bg-panel font-mono text-[10px]"
          />

          {config.transport === "poll" && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] text-text-muted">Every</span>
              <Input
                type="number"
                min={MIN_POLL_SEC}
                max={MAX_POLL_SEC}
                value={config.pollIntervalSec}
                onChange={(e) => update(config.id, { pollIntervalSec: Number(e.target.value) })}
                className="h-6 w-14 border-border-subtle bg-bg-panel text-right font-mono text-[10px]"
              />
              <span className="font-mono text-[9px] text-text-muted">sec</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 font-mono text-[9px] text-text-muted">Auth</span>
            <select
              value={config.auth.kind}
              onChange={(e) => update(config.id, { auth: { kind: e.target.value as ConnectorAuthKind } })}
              className="min-w-0 flex-1 rounded border border-border-subtle bg-bg-panel px-1 py-0.5 font-mono text-[10px] text-text-muted-alt"
            >
              {AUTH_KINDS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {(config.auth.kind === "header" || config.auth.kind === "query") && (
            <Input
              placeholder={config.auth.kind === "header" ? "X-API-Key" : "apikey"}
              value={config.auth.name}
              onChange={(e) => update(config.id, { auth: { name: e.target.value } })}
              className="h-6 border-border-subtle bg-bg-panel font-mono text-[10px]"
            />
          )}

          {config.auth.kind !== "none" && config.auth.kind !== "basic" && (
            // type=password so the key is not readable over a shoulder or in a
            // screen share of the control room.
            <Input
              type="password"
              placeholder="token / key"
              value={config.auth.token}
              onChange={(e) => update(config.id, { auth: { token: e.target.value } })}
              className="h-6 border-border-subtle bg-bg-panel font-mono text-[10px]"
            />
          )}

          {config.auth.kind === "basic" && (
            <div className="flex gap-1">
              <Input
                placeholder="user"
                value={config.auth.username}
                onChange={(e) => update(config.id, { auth: { username: e.target.value } })}
                className="h-6 min-w-0 flex-1 border-border-subtle bg-bg-panel font-mono text-[10px]"
              />
              <Input
                type="password"
                placeholder="password"
                value={config.auth.password}
                onChange={(e) => update(config.id, { auth: { password: e.target.value } })}
                className="h-6 min-w-0 flex-1 border-border-subtle bg-bg-panel font-mono text-[10px]"
              />
            </div>
          )}

          {headerAuthUnavailable && (
            <div className="font-mono text-[9px] text-live-amber">
              SSE cannot send headers — use Query param auth, or switch to Poll/WebSocket.
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 font-mono text-[9px] text-text-muted">Into</span>
            <Input
              placeholder="source id (e.g. soccer) — blank to use incoming keys as-is"
              value={config.targetSource}
              onChange={(e) => update(config.id, { targetSource: e.target.value.trim() })}
              className="h-6 min-w-0 flex-1 border-border-subtle bg-bg-panel font-mono text-[10px]"
            />
          </div>

          {runtime?.lastError && (
            <div className="break-all font-mono text-[9px] text-live-red">{runtime.lastError}</div>
          )}
          {runtime?.lastSyncAt && (
            <div className="font-mono text-[9px] text-text-muted">
              Last payload {new Date(runtime.lastSyncAt).toLocaleTimeString()} · {runtime.lastKeyCount} keys
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Live data connectors.
 *
 * Replaces the single unauthenticated URL this panel used to expose, which
 * could not reach any commercial feed and floored update latency at the poll
 * interval.
 */
export function ConnectorsSection() {
  const connectors = useConnectorStore((s) => s.connectors);
  const add = useConnectorStore((s) => s.addConnector);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">LIVE DATA CONNECTORS</span>
        <button
          onClick={() => add()}
          className="flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active hover:text-text-bright"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-1">
        {connectors.length === 0 ? (
          <div className="rounded border border-border-subtle bg-bg-panel p-2 font-mono text-[9px] text-text-muted">
            No connectors configured. Add one to poll a JSON API, or subscribe to an SSE / WebSocket feed. Credentials
            are stored locally with the project and are never sent to the renderer.
          </div>
        ) : (
          connectors.map((c) => <ConnectorRow key={c.id} config={c} />)
        )}
      </div>
    </div>
  );
}
