import { useCallback, useEffect, useRef, useState } from "react";
import { listNdiSources, type NdiSourceInfo } from "@/document/ndiDiscovery";
import { useOutputStatus } from "@/output/useOutputStatus";
import { Button } from "@/components/ui/button";
import { RefreshCw, SatelliteDish, ShieldCheck } from "lucide-react";

const AUTO_REFRESH_MS = 4000;

/**
 * NDI Tools — Stage 1 (real source discovery only). Genuine
 * `NDIlib_find_*` network scan via `list_ndi_sources` (see ndi.rs) — no
 * mock rows, no placeholder count. An empty list means no NDI sources are
 * currently visible on the network, not "not implemented yet".
 *
 * Stage 2 (receive: pick a source, get a live preview, use it anywhere a
 * VideoSource is accepted) is a separate, larger change — deliberately not
 * built here yet, and the panel says so rather than implying it works.
 */
export function NdiToolsSettings() {
  const status = useOutputStatus();
  const ndi = status?.ndi ?? null;

  const [sources, setSources] = useState<NdiSourceInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const found = await listNdiSources(1500);
      setSources(found);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void refresh(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <SatelliteDish className="h-3.5 w-3.5 text-text-muted" />
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">NDI Tools — Source Discovery</span>
        </div>
        {ndi?.available ? (
          <span className="flex items-center gap-1 font-mono text-[9px] text-accent-blue-bright">
            <ShieldCheck className="h-3 w-3" /> runtime loaded
          </span>
        ) : (
          <span className="font-mono text-[9px] text-live-amber">{ndi?.reason ?? "checking…"}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading || !ndi?.available}
          className="gap-1.5 border-border-subtle bg-bg-surface text-[10px] text-text-muted-alt"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> {loading ? "Scanning…" : "Refresh"}
        </Button>
        <label className="flex items-center gap-1.5 font-mono text-[10px] text-text-muted">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-accent-blue" />
          auto-refresh every {AUTO_REFRESH_MS / 1000}s
        </label>
      </div>

      {error && <div className="rounded border border-live-red/40 bg-bg-surface p-2 font-mono text-[10px] text-live-red">{error}</div>}

      {!ndi?.available ? (
        <div className="rounded border border-border-subtle bg-bg-surface p-3 text-center font-mono text-[10px] text-text-muted">
          NDI runtime not loaded — {ndi?.reason ?? "checking…"}
        </div>
      ) : sources === null ? (
        <div className="rounded border border-border-subtle bg-bg-surface p-3 text-center font-mono text-[10px] text-text-muted">
          Scanning network…
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded border border-border-subtle bg-bg-surface p-3 text-center font-mono text-[10px] text-text-muted">
          No NDI sources found on this network right now.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {sources.map((s) => (
            <div key={s.name} className="flex items-center gap-2 rounded border border-border-subtle bg-bg-surface px-2 py-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-muted-alt" title={s.name}>
                {s.name}
              </span>
              <span
                className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[9px] text-text-muted"
                title="Receiving this source as a live input isn't built yet"
              >
                discover only
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="font-mono text-[9px] leading-relaxed text-text-muted">
        Real network discovery via the NDI SDK's Find API — not a mock list. Using a discovered source as a live
        video input (receive + preview) is Stage 2, not built yet.
      </p>
    </div>
  );
}
