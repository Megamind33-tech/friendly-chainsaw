import { Set3dEditor } from "@/components/set3d/Set3dEditor";
import { MonitorTile } from "./ar/arShared";
import { useArLayer } from "./ar/useArLayer";

/**
 * AR scene preview — orbit + click-to-select only. All transforms live in
 * AR Author panel to avoid gizmo/orbit fighting and viewport lag.
 */
export function ARViewportPanel() {
  const ar = useArLayer();

  if (!ar.project) return <div className="p-3 font-mono text-xs text-text-muted">Loading...</div>;

  if (!ar.scene || !ar.layer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg-deepest p-4 text-center">
        <div className="font-mono text-sm text-text-muted-alt">No AR layer — use AR Author to create one</div>
      </div>
    );
  }

  const { scene, layer } = ar;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-deepest text-xs">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-base px-3">
        <span className="font-mono text-[11px] font-bold tracking-wide text-text-muted-alt">AR PREVIEW</span>
        {ar.isPreview && <span className="rounded border border-accent-blue/60 px-2 py-0.5 font-mono text-[9px] text-accent-blue-bright">PVW</span>}
        {ar.isProgram && <span className="rounded border border-live-red/70 px-2 py-0.5 font-mono text-[9px] text-live-red">ON AIR</span>}
        <span className="font-mono text-[9px] text-text-muted">{ar.visibleArObjects.length} visible · studio locked: {ar.studioBackdropCount}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => ar.playIn(layer.id)} className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] font-bold hover:border-stripe-active" title="Animate IN on Program/Preview">
            ▶ IN
          </button>
          <button onClick={() => ar.playOut(layer.id)} className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] font-bold hover:border-live-amber" title="Animate OUT">
            ◀ OUT
          </button>
          <button onClick={ar.loadToPreview} className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] hover:border-accent-blue">
            Load PVW
          </button>
          <button onClick={ar.takeOnAir} className="rounded border border-live-red/60 px-2 py-1 font-mono text-[9px] text-live-red hover:bg-live-red/10">
            Take Air
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <Set3dEditor sceneId={scene.id} layer={layer} editableNodeIds={ar.arNodeIds} disableGizmo />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
          <div className="rounded border border-border-subtle bg-bg-base/85 px-2 py-1 font-mono text-[9px] text-accent-blue-bright backdrop-blur">
            {ar.isProgram ? "LIVE" : ar.isPreview ? "PREVIEW" : "VIEW ONLY"}
          </div>
          <div className="rounded border border-border-subtle bg-bg-base/85 px-2 py-1 font-mono text-[8px] text-text-muted backdrop-blur">
            click to select · edit in AR Author
          </div>
        </div>
      </div>

      <div className="flex h-32 shrink-0 gap-2 border-t border-border-subtle bg-bg-base p-2">
        <MonitorTile label="PREVIEW" tone="preview" sceneId={ar.previewSceneId} />
        <MonitorTile label="PROGRAM" tone="program" sceneId={ar.programSceneId} />
        <div className="w-[200px] rounded border border-border-subtle bg-bg-panel p-2 font-mono text-[9px] text-text-muted">
          <div className="mb-1 text-text-muted-alt">AR STATUS</div>
          <div className="grid grid-cols-2 gap-y-0.5">
            <span>Objects</span><span className="text-right text-text-muted-alt">{ar.arNodes.length}</span>
            <span>Bound</span><span className="text-right text-text-muted-alt">{ar.arNodes.filter((n) => (n.bindings?.length ?? 0) > 0).length}</span>
            <span>Animated</span><span className="text-right text-text-muted-alt">{ar.arNodes.filter((n) => n.animation).length}</span>
            <span>Ready</span><span className={`text-right ${ar.ready ? "text-accent-blue-bright" : "text-live-red"}`}>{ar.ready ? "yes" : "no"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
