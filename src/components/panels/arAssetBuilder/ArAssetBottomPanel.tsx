import { useArAssetBuilder } from "@/ar-asset-builder/useArAssetBuilder";
import { WORKFLOW_STEPS } from "@/ar-asset-builder/constants";
import { ArTimelinePanel } from "@/components/panels/ArTimelinePanel";
import { AlertTriangle, CheckCircle, Eye, EyeOff, Lock, Unlock } from "lucide-react";

/**
 * AR Asset Builder — bottom panel: layers, workflow, validation, animation timeline.
 */
export function ArAssetBottomPanel() {
  const builder = useArAssetBuilder();
  const { activeAsset, session, validationMessages } = builder;

  return (
    <div className="flex h-full flex-col bg-bg-deepest text-xs">
      {/* Workflow tracker */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">Workflow</div>
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {WORKFLOW_STEPS.map((step, i) => {
            const active = session.workflowStep === step.id;
            const past = WORKFLOW_STEPS.findIndex((s) => s.id === session.workflowStep) > i;
            return (
              <button
                key={step.id}
                onClick={() => session.setWorkflowStep(step.id)}
                className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 font-mono text-[8px] ${
                  active ? "border-accent-blue bg-accent-blue/10 text-accent-blue-bright" :
                  past ? "border-stripe-active/50 text-text-muted-alt" :
                  "border-border-subtle text-text-muted"
                }`}
              >
                <span className="font-bold">{step.step}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Layers list */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-border-subtle p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-wide text-text-muted">Layers</span>
            <button onClick={() => builder.addLayer("New Layer")} className="font-mono text-[9px] text-accent-blue-bright hover:underline">+ Add</button>
          </div>
          {!activeAsset ? (
            <div className="font-mono text-[9px] text-text-muted">No asset selected</div>
          ) : (
            <div className="space-y-0.5">
              {[...activeAsset.layers].reverse().map((layer, idx) => (
                <div
                  key={layer.id}
                  onClick={() => session.selectLayer(layer.id)}
                  className={`flex cursor-pointer items-center gap-1 rounded border px-1.5 py-1 font-mono text-[9px] ${
                    session.selectedLayerIds.includes(layer.id)
                      ? "border-accent-blue bg-accent-blue/5 text-accent-blue-bright"
                      : "border-transparent text-text-muted-alt hover:bg-bg-panel"
                  }`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); builder.updateLayer(layer.id, { visible: !layer.visible }); }}
                    className="text-text-muted hover:text-text-bright"
                  >
                    {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); builder.updateLayer(layer.id, { locked: !layer.locked }); }}
                    className="text-text-muted hover:text-text-bright"
                  >
                    {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                  <span className="truncate flex-1">{layer.name}</span>
                  <span className="text-[8px] text-text-muted">{activeAsset.layers.length - idx}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Animation timeline (reuse existing AR timeline when AR layer exists) */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <ArTimelinePanel />
        </div>

        {/* Validation + lifecycle */}
        <div className="w-48 shrink-0 overflow-y-auto border-l border-border-subtle p-2">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-wide text-text-muted">Validation</div>
          {validationMessages.length === 0 ? (
            <div className="flex items-center gap-1 font-mono text-[9px] text-accent-blue-bright">
              <CheckCircle className="h-3 w-3" /> No issues
            </div>
          ) : (
            validationMessages.map((msg, i) => (
              <div key={i} className="mb-1 flex items-start gap-1 font-mono text-[8px] text-live-amber">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {msg}
              </div>
            ))
          )}

          {activeAsset && (
            <div className="mt-4">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">Lifecycle</div>
              <div className="space-y-1">
                {(["edit", "preview", "ready", "live"] as const).map((state) => (
                  <button
                    key={state}
                    onClick={() => builder.setLifecycle(state)}
                    disabled={activeAsset.lifecycle === state}
                    className={`w-full rounded border py-1 font-mono text-[9px] uppercase ${
                      activeAsset.lifecycle === state
                        ? state === "live" ? "border-live-red text-live-red" : "border-accent-blue text-accent-blue-bright"
                        : "border-border-subtle text-text-muted hover:border-stripe-active"
                    }`}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeAsset && (
            <div className="mt-4 space-y-1">
              <button onClick={() => builder.patchAsset({ favorite: !activeAsset.favorite })} className="w-full rounded border border-border-subtle py-1 font-mono text-[9px] text-text-muted-alt">
                {activeAsset.favorite ? "★ Unfavorite" : "☆ Favorite"}
              </button>
              <button onClick={() => builder.duplicateAsset(activeAsset.id)} className="w-full rounded border border-border-subtle py-1 font-mono text-[9px] text-text-muted-alt">
                Duplicate
              </button>
              <button onClick={() => builder.deleteAsset(activeAsset.id)} className="w-full rounded border border-live-red/40 py-1 font-mono text-[9px] text-live-red">
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
