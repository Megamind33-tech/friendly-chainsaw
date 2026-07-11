import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDocStore } from "@/document/store";
import { useOutputStatus } from "@/output/useOutputStatus";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const DEFAULT_SOURCE_NAME = "Broadcast Engine Program";
type SourceMode = "program" | "test";

/**
 * Dedicated NDI panel — real settings, not a buried toggle. Resolution/fps
 * shown here are the project's own (`project.resolution`/`project.fps`),
 * the same values sent over the wire (see `src-tauri/src/lib.rs`'s
 * `NdiOutputConfig`) — never arbitrary placeholder numbers. Source name is a
 * persisted project setting (`project.ndiSourceName`), so it survives restarts
 * instead of resetting to a hardcoded string.
 *
 * Source mode picks what NDI sends: PROGRAM (Stage 2) captures the live
 * Program window frame-by-frame via WebView2 CapturePreview; TEST sends the
 * Stage-1 scrolling color bars (a connectivity check). Switching takes effect
 * on the next frame — no stop/start needed.
 */
export function NdiPanel() {
  const project = useDocStore((s) => s.project);
  const setNdiSourceName = useDocStore((s) => s.setNdiSourceName);
  const status = useOutputStatus();
  const ndi = status?.ndi ?? null;

  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SourceMode>("program");

  const sourceName = project?.ndiSourceName || DEFAULT_SOURCE_NAME;
  const width = project?.resolution.width ?? 1280;
  const height = project?.resolution.height ?? 720;
  const fps = project?.fps ?? 30;

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    try {
      if (next) {
        await invoke("start_ndi_output", {
          sourceName,
          width,
          height,
          fpsN: Math.round(fps * 1000),
          fpsD: 1000,
        });
      } else {
        await invoke("stop_ndi_output");
      }
      setStreaming(next);
    } catch (err) {
      setError(String(err));
      setStreaming(false);
    } finally {
      setPending(false);
    }
  }

  async function chooseMode(next: SourceMode) {
    setMode(next);
    setError(null);
    try {
      await invoke("set_ndi_source_mode", { mode: next });
    } catch (err) {
      setError(String(err));
    }
  }

  const statusLine = error
    ? error
    : !ndi
      ? "checking…"
      : !ndi.available
        ? (ndi.reason ?? "unavailable")
        : streaming
          ? `live — ${ndi.connections ?? 0} receiver(s) connected`
          : "ready";

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">NDI OUTPUT</span>
        <Switch checked={streaming} disabled={pending || !ndi?.available || !project} onCheckedChange={toggle} />
      </div>
      <p className="font-mono text-[10px] text-text-muted">{statusLine}</p>

      <div>
        <label className="font-mono text-[10px] tracking-wide text-text-muted-alt">SOURCE NAME</label>
        <Input
          className="mt-1 h-7 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
          value={sourceName}
          disabled={streaming}
          onChange={(e) => setNdiSourceName(e.target.value)}
          placeholder={DEFAULT_SOURCE_NAME}
        />
        {streaming && <p className="mt-1 font-mono text-[9px] text-text-muted">stop output to rename</p>}
      </div>

      <div>
        <label className="font-mono text-[10px] tracking-wide text-text-muted-alt">SOURCE</label>
        <div className="mt-1 flex gap-1">
          {(["program", "test"] as const).map((m) => (
            <button
              key={m}
              onClick={() => chooseMode(m)}
              title={
                m === "program"
                  ? "Captures the live Program window and sends it over NDI at its own size"
                  : "Scrolling color bars at project resolution/fps — a connectivity check"
              }
              className={`flex-1 rounded border px-2 py-1 font-mono text-[10px] ${
                mode === m
                  ? "border-accent-blue bg-bg-surface text-accent-blue-bright"
                  : "border-border-subtle text-text-muted-alt hover:border-accent-blue/50"
              }`}
            >
              {m === "program" ? "PROGRAM" : "TEST BARS"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="resolution" value={mode === "program" ? "program size" : `${width}×${height}`} />
        <Stat label="fps" value={Number.isInteger(fps) ? String(fps) : fps.toFixed(2)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-panel px-2 py-1.5 font-mono">
      <div className="text-[9px] text-text-muted">{label}</div>
      <div className="text-text-muted-alt">{value}</div>
    </div>
  );
}
