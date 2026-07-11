import { useEffect, useState } from "react";
import { useDocStore, useDocStoreTemporal } from "@/document/store";
import { initPersistence } from "@/document/persistence";
import { useExternalDataPoller } from "@/document/useExternalDataPoller";
import { useOutputStatus } from "@/output/useOutputStatus";
import { initElectionFeed } from "@/ar-system/election/electionFeed";
import { dataHub } from "@/ar-system/dataHub/dataHub";
import { useWorkspaceStore, type WorkspaceId } from "@/document/workspace";
import { SettingsDialog } from "./SettingsDialog";
import { Circle, Wifi, WifiOff } from "lucide-react";

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: "design", label: "Design" },
  { id: "studio", label: "Studio" },
  { id: "ar", label: "AR" },
  { id: "builder", label: "AR Builder" },
  { id: "data", label: "Data" },
  { id: "timeline", label: "Timeline" },
  { id: "playout", label: "Playout" },
  { id: "show", label: "Show" },
];

const LAMP_LABEL: Record<string, string> = {
  live: "ON AIR",
  stalled: "STALLED",
  no_consumer: "NO CONSUMER",
};
const LAMP_CLASS: Record<string, string> = {
  live: "border-live-red text-live-red bg-live-red/10",
  stalled: "border-live-amber text-live-amber bg-live-amber/10",
  no_consumer: "border-border-subtle text-text-muted",
};

/**
 * The one always-visible strip (Phase A reorg). Workspace pages come and go
 * underneath it, but ON-AIR truth, Take/Cut, REC, and NDI health must never
 * be buried inside whichever page happens to be active — a live operator
 * needs them reachable from every page, not just "Show". Folds in what used
 * to be ControlRoomView's separate DocumentStatusBar so there's exactly one
 * bar of chrome, not two stacked ones.
 */
export function PersistentShell() {
  const active = useWorkspaceStore((s) => s.active);
  const setActive = useWorkspaceStore((s) => s.setActive);

  const project = useDocStore((s) => s.project);
  const dirty = useDocStore((s) => s.dirty);
  const programSceneId = useDocStore((s) => s.programSceneId);
  const previewSceneId = useDocStore((s) => s.previewSceneId);
  const take = useDocStore((s) => s.take);
  const cut = useDocStore((s) => s.cut);
  const { undo, redo, pastStates, futureStates } = useDocStoreTemporal();
  const [dbStatus, setDbStatus] = useState<"loading" | "ok" | "error">("loading");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const status = useOutputStatus();
  useExternalDataPoller();

  useEffect(() => {
    initPersistence()
      .then(() => setDbStatus("ok"))
      .catch((err) => {
        console.error("persistence init failed", err);
        setDbStatus("error");
      });
    initElectionFeed();
    const staleTimer = setInterval(() => dataHub.tickStaleCheck(), 5000);
    return () => clearInterval(staleTimer);
  }, []);

  const onAirState = status?.programState ?? "no_consumer";
  const canTakeOrCut = previewSceneId !== null && previewSceneId !== programSceneId;
  const ndi = status?.ndi ?? null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b-2 border-stripe-accent bg-bg-base px-2 font-mono text-[10px]">
      <div className="flex items-center gap-0">
        {WORKSPACES.map((w) => {
          const isActive = w.id === active;
          return (
            <button
              key={w.id}
              onClick={() => setActive(w.id)}
              title={w.label}
              className={`border-b-2 px-2.5 py-1.5 tracking-wide transition-colors ${
                isActive
                  ? "border-stripe-active text-text-bright"
                  : "border-transparent text-text-muted-alt hover:border-stripe-accent hover:text-text-bright"
              }`}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      <div className="mx-1 h-5 w-px bg-border-subtle" />

      <span className="text-text-muted">
        sqlite:{" "}
        <span className={dbStatus === "ok" ? "text-accent-blue-bright" : dbStatus === "error" ? "text-live-red" : "text-text-muted"}>
          {dbStatus}
        </span>
      </span>
      <span className="max-w-[140px] truncate text-text-muted-alt">{project?.name ?? "—"}</span>
      <span className={dirty ? "text-live-red" : "text-text-muted"}>{dirty ? "unsaved" : "saved"}</span>
      <button
        onClick={() => undo()}
        disabled={pastStates.length === 0}
        className="rounded border border-border-subtle px-1.5 py-0.5 text-text-muted-alt hover:border-stripe-active disabled:opacity-30"
      >
        undo
      </button>
      <button
        onClick={() => redo()}
        disabled={futureStates.length === 0}
        className="rounded border border-border-subtle px-1.5 py-0.5 text-text-muted-alt hover:border-stripe-active disabled:opacity-30"
      >
        redo
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          disabled={!canTakeOrCut}
          onClick={() => take()}
          title="Take (cut with a transition — currently a hard cut, matching Cut)"
          className="rounded border border-border-subtle px-2 py-1 text-text-muted-alt hover:border-stripe-active disabled:opacity-30"
        >
          Take
        </button>
        <button
          disabled={!canTakeOrCut}
          onClick={() => cut()}
          className="rounded border border-live-red px-2 py-1 text-live-red hover:bg-live-red/10 disabled:border-border-subtle disabled:text-text-muted-alt disabled:opacity-30"
        >
          Cut
        </button>
        <button
          disabled
          title="Record — not wired yet (Phase D, FFmpeg record)"
          className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-text-muted opacity-50"
        >
          <Circle className="h-2.5 w-2.5 fill-current" /> REC
        </button>
        <div
          title={ndi ? (ndi.available ? "NDI runtime available" : (ndi.reason ?? "NDI unavailable")) : "checking NDI…"}
          className={`flex items-center gap-1 rounded border px-2 py-1 ${
            ndi?.available ? "border-stripe-active text-text-bright" : "border-border-subtle text-text-muted"
          }`}
        >
          {ndi?.available ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          NDI
        </div>
        <div className={`flex items-center gap-1.5 rounded border px-2 py-1 font-medium tracking-wide ${LAMP_CLASS[onAirState]}`}>
          {LAMP_LABEL[onAirState]}
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="rounded border border-border-subtle px-2 py-1 text-text-muted-alt hover:border-stripe-active hover:text-text-bright"
        >
          set
        </button>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
