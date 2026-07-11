import { useState } from "react";
import { useDocStore } from "@/document/store";
import { useLiveShowStore } from "@/document/liveShowStore";
import { useOutputStatus } from "@/output/useOutputStatus";
import { Button } from "@/components/ui/button";
import { Radio, Plus, Trash2 } from "lucide-react";

/** Double-click to rename a scene in place. */
function SceneName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (!editing) {
    return (
      <span
        className="truncate text-text-muted-alt"
        title={`${name} — double-click to rename`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(name);
          setEditing(true);
        }}
      >
        {name}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        setEditing(false);
        if (draft.trim() && draft !== name) onRename(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-5 min-w-0 flex-1 rounded border border-accent-blue bg-bg-deepest px-1 font-mono text-[11px] text-text-muted-alt outline-none"
    />
  );
}

const LAMP_LABEL: Record<string, string> = {
  live: "ON AIR",
  stalled: "STALLED",
  no_consumer: "NO CONSUMER",
};

const LAMP_CLASS: Record<string, string> = {
  live: "border-live-red text-live-red",
  stalled: "border-live-amber text-live-amber",
  no_consumer: "border-border-subtle text-text-muted",
};

/** Real ON-AIR lamp — driven solely by /status (actual /program request
 * flow), never by programSceneId. Cutting to a new scene does not turn
 * this on; only a consumer actually pulling /program does. */
function OnAirLamp() {
  const status = useOutputStatus();
  const state = status?.programState ?? "no_consumer";

  return (
    <div
      className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] font-medium tracking-wide ${LAMP_CLASS[state]}`}
    >
      <Radio className="h-3 w-3" />
      {LAMP_LABEL[state]}
    </div>
  );
}

export function ProgramControlPanel() {
  const project = useDocStore((s) => s.project);
  const programSceneId = useLiveShowStore((s) => s.programSceneId);
  const previewSceneId = useLiveShowStore((s) => s.previewSceneId);
  const armPreview = useDocStore((s) => s.armPreview);
  const take = useDocStore((s) => s.take);
  const cut = useDocStore((s) => s.cut);
  const addScene = useDocStore((s) => s.addScene);
  const removeScene = useDocStore((s) => s.removeScene);
  const renameScene = useDocStore((s) => s.renameScene);

  if (!project) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  const canTakeOrCut = previewSceneId !== null && previewSceneId !== programSceneId;

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs">
      <div className="flex shrink-0 items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">PGM / PVW</span>
        <OnAirLamp />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {project.scenes.map((scene) => {
          const isProgram = scene.id === programSceneId;
          const isPreview = scene.id === previewSceneId;
          return (
            <div
              key={scene.id}
              onClick={() => armPreview(scene.id)}
              className={`group flex cursor-pointer items-center gap-1 rounded border px-2 py-1.5 text-left font-mono ${
                isProgram
                  ? "border-live-red bg-live-red/10"
                  : isPreview
                    ? "border-accent-blue bg-accent-blue/10"
                    : "border-border-subtle bg-bg-panel hover:border-accent-blue"
              }`}
            >
              <SceneName name={scene.name} onRename={(name) => renameScene(scene.id, name)} />
              <span className="ml-auto flex items-center gap-1">
                {isProgram && <span className="rounded bg-live-red px-1 text-[9px] font-bold text-white">PGM</span>}
                {isPreview && (
                  <span className="rounded bg-accent-blue px-1 text-[9px] font-bold text-white">PVW</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScene(scene.id);
                  }}
                  disabled={project.scenes.length <= 1}
                  title={project.scenes.length <= 1 ? "Can't delete the last scene" : "Delete scene (undoable)"}
                  className="rounded p-0.5 opacity-0 hover:bg-live-red/20 hover:text-live-red disabled:opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="shrink-0 justify-start gap-1.5 border-border-subtle bg-bg-surface text-text-muted-alt"
        onClick={() => addScene()}
      >
        <Plus className="h-3 w-3" /> Add Scene
      </Button>

      <div className="mt-auto flex shrink-0 gap-1.5 border-t border-border-subtle pt-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canTakeOrCut}
          onClick={() => take()}
          className="flex-1 border-border-subtle bg-bg-surface text-text-muted-alt disabled:opacity-30"
        >
          Take
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canTakeOrCut}
          onClick={() => cut()}
          className="flex-1 border-live-red text-live-red hover:bg-live-red/10 disabled:opacity-30 disabled:text-text-muted-alt disabled:border-border-subtle"
        >
          Cut
        </Button>
      </div>
    </div>
  );
}
