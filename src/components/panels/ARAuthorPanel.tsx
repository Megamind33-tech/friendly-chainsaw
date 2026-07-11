import { useState } from "react";
import { createPrimitiveNode, createText3dNode, createVideoFeedNode, vec3 } from "@/document/factory";
import { AR_ANIMATION_PRESETS } from "@/ar-engine/types";
import { AR_TEMPLATES } from "@/ar-engine/templates";
import { SetNodeInspector, Vec3Fields } from "@/components/panels/SetInspector";
import { VideoSourceEditor } from "@/components/panels/VideoSourceEditor";
import { ImagePickerDialog } from "@/components/panels/ImagePickerDialog";
import { scalePrimitiveForImageAspect } from "@/components/set3d/displayTextures";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BroadcastTab, BroadcastTabBar } from "@/components/ui/broadcast";
import type { SetNode, Vec3 } from "@/document/types";
import {
  ArPanelBlock,
  AssetAction,
  SceneGraphRow,
  arToolbarButtonClass,
  downloadJson,
} from "./ar/arShared";
import { ArTemplateGrid, isFaithArTemplate } from "./ar/ArTemplateGrid";
import { ArPanelAppearance } from "./ar/ArPanelAppearance";
import { SportsModelsGrid } from "./ar/SportsModelsGrid";
import { SportsModelInspector } from "./ar/SportsModelInspector";
import { useArLayer } from "./ar/useArLayer";
import { AR_CENTER } from "@/ar-engine/nodeUtils";
import { findModelRoot } from "@/ar-engine/sportsPanels";

type AuthorTab = "objects" | "transform" | "data" | "motion" | "assets" | "build" | "model" | "ready";

const AUTHOR_TABS: { id: AuthorTab; label: string }[] = [
  { id: "objects", label: "Objects" },
  { id: "transform", label: "Transform" },
  { id: "data", label: "Data" },
  { id: "motion", label: "Motion" },
  { id: "assets", label: "Assets" },
  { id: "build", label: "Build" },
  { id: "model", label: "Model" },
  { id: "ready", label: "Ready" },
];

function NudgeRow({ label, axis, value, step, onChange }: { label: string; axis: keyof Vec3; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 font-mono text-[9px] text-text-muted">
      <span className="w-3 uppercase">{axis}</span>
      <button type="button" className="rounded border border-border-subtle px-1.5 py-0.5 hover:border-stripe-active" onClick={() => onChange(Number((value - step).toFixed(3)))}>
        −
      </button>
      <span className="min-w-[3rem] text-center text-text-muted-alt">{value.toFixed(2)}</span>
      <button type="button" className="rounded border border-border-subtle px-1.5 py-0.5 hover:border-stripe-active" onClick={() => onChange(Number((value + step).toFixed(3)))}>
        +
      </button>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

/**
 * Dedicated AR authoring surface — transforms, data bindings, animation, and
 * layer stack without relying on the 3D gizmo (which fights orbit and lags).
 */
export function ARAuthorPanel() {
  const ar = useArLayer();
  const [tab, setTab] = useState<AuthorTab>("objects");
  const [quickImageOpen, setQuickImageOpen] = useState(false);

  if (!ar.project) return <div className="p-3 font-mono text-xs text-text-muted">Loading...</div>;

  if (!ar.scene || !ar.layer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg-panel p-4 text-center">
        <div className="font-mono text-sm text-text-muted-alt">No AR / 3D layer in this scene</div>
        <button onClick={ar.createArLayer} className="rounded border border-stripe-active px-3 py-2 font-mono text-xs text-text-bright">
          Create AR Layer
        </button>
      </div>
    );
  }

  const { scene, layer, setProps, selectedNode } = ar;
  const layerFocus = ar.arFocusAll[layer.id] ?? null;
  const isFocused = !!selectedNode && !!layerFocus?.nodeIds.includes(selectedNode.id);

  const setTransform = (updates: Partial<SetNode["transform"]>) => {
    if (!selectedNode) return;
    ar.setNodeTransform(selectedNode, updates);
  };

  const nudgePosition = (axis: keyof Vec3, delta: number) => {
    if (!selectedNode) return;
    const p = selectedNode.transform.position;
    setTransform({ position: { ...p, [axis]: p[axis] + delta } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-xs">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-deepest px-3">
        <span className="font-mono text-[11px] font-bold tracking-wide text-text-bright">AR AUTHOR</span>
        <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold ${ar.ready ? "border-accent-blue/60 text-accent-blue-bright" : "border-live-red/60 text-live-red"}`}>
          {ar.ready ? "READY" : "NOT READY"}
        </span>
        <span className="ml-auto font-mono text-[9px] text-text-muted">{ar.arNodes.length} objects</span>
      </div>

      {selectedNode && (
        <div className="shrink-0 space-y-2 border-b border-border-subtle bg-bg-panel p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] uppercase text-text-muted">{selectedNode.kind}</span>
            <Input
              value={selectedNode.name}
              onChange={(e) => ar.updateNode(selectedNode, { name: e.target.value } as Partial<SetNode>)}
              className="h-7 w-36 border-border-subtle bg-bg-surface font-mono text-[11px]"
            />
            <button
              onClick={() => ar.focusArNodes(layer.id, [selectedNode.id])}
              className={`rounded border px-2 py-1 font-mono text-[9px] font-bold ${isFocused && layerFocus?.nodeIds.length === 1 ? "border-live-amber text-live-amber" : "border-border-subtle text-text-muted-alt hover:border-live-amber"}`}
            >
              FOCUS
            </button>
            {layerFocus && (
              <button onClick={() => ar.clearArFocus(layer.id)} className="rounded border border-live-amber/60 px-2 py-1 font-mono text-[9px] text-live-amber">
                SHOW ALL ({layerFocus.nodeIds.length})
              </button>
            )}
            {selectedNode.kind === "primitive" && (
              <button onClick={() => setQuickImageOpen(true)} className="rounded border border-accent-blue/60 px-2 py-1 font-mono text-[9px] text-accent-blue-bright">
                {selectedNode.textureAssetId ? "Replace image" : "Add image"}
              </button>
            )}
            {selectedNode.kind === "text3d" && (
              <Input
                value={selectedNode.text}
                onChange={(e) => ar.updateNode(selectedNode, { text: e.target.value } as Partial<SetNode>)}
                className="h-7 min-w-0 flex-1 border-border-subtle bg-bg-surface font-mono text-[11px]"
                placeholder="Text content"
              />
            )}
          </div>

          <ArPanelBlock title="Transform (panel — no 3D drag)">
            <Vec3Fields label="Position" value={selectedNode.transform.position} step={0.05} onChange={(v) => setTransform({ position: v })} />
            <div className="grid grid-cols-3 gap-2 pt-1">
              <NudgeRow label="0.1" axis="x" value={selectedNode.transform.position.x} step={0.1} onChange={(v) => nudgePosition("x", v - selectedNode.transform.position.x)} />
              <NudgeRow label="0.1" axis="y" value={selectedNode.transform.position.y} step={0.1} onChange={(v) => nudgePosition("y", v - selectedNode.transform.position.y)} />
              <NudgeRow label="0.1" axis="z" value={selectedNode.transform.position.z} step={0.1} onChange={(v) => nudgePosition("z", v - selectedNode.transform.position.z)} />
            </div>
            <Vec3Fields label="Rotation (°)" value={selectedNode.transform.rotation} step={1} onChange={(v) => setTransform({ rotation: v })} />
            <Vec3Fields label="Scale" value={selectedNode.transform.scale} step={0.05} onChange={(v) => setTransform({ scale: v })} />
          </ArPanelBlock>
          {selectedNode.kind === "primitive" && (
            <ArPanelAppearance
              node={selectedNode}
              onUpdate={(updates) => ar.updateNode(selectedNode, updates)}
              onBrightenAll={ar.brightenAllPanels}
            />
          )}
        </div>
      )}

      <BroadcastTabBar className="shrink-0 bg-bg-deepest px-1">
        {AUTHOR_TABS.map((t) => (
          <BroadcastTab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </BroadcastTab>
        ))}
      </BroadcastTabBar>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {tab === "objects" && (
            <>
              <ArPanelBlock title="Add AR Object">
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => ar.addNodes([createText3dNode({ name: "AR Text", text: "AR TEXT", transform: { position: vec3(AR_CENTER.x, AR_CENTER.y + 0.2, AR_CENTER.z) } })])} className={arToolbarButtonClass}>Text</button>
                  <button onClick={() => ar.addNodes([createPrimitiveNode("box", { name: "3D Panel", transform: { position: vec3(AR_CENTER.x, AR_CENTER.y - 0.1, AR_CENTER.z), scale: vec3(2.5, 0.7, 0.08) }, material: { color: "#1e3d66", metalness: 0.06, roughness: 0.65, emissive: "#1e3d66", emissiveIntensity: 0.55 } })])} className={arToolbarButtonClass}>Panel</button>
                  <button onClick={() => ar.addNodes([createVideoFeedNode({ label: "Virtual screen", transform: { position: vec3(AR_CENTER.x, AR_CENTER.y + 0.2, AR_CENTER.z) } })])} className={arToolbarButtonClass}>Screen</button>
                </div>
              </ArPanelBlock>
              <ArPanelBlock title="AR Layer Stack">
                <div className="space-y-0.5">
                  {ar.arRootNodes.map((node) => (
                    <SceneGraphRow
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedNodeId={ar.selectedNodeId}
                      onSelect={ar.selectSetNode}
                      onToggle={ar.updateNode}
                      onDuplicate={ar.duplicateNode}
                      onDelete={(id) => ar.removeSetNode(scene.id, layer.id, id)}
                      onMove={ar.moveNode}
                    />
                  ))}
                  {ar.arRootNodes.length === 0 && (
                    <div className="rounded border border-dashed border-border-subtle p-3 text-center font-mono text-[10px] text-text-muted">
                      Add objects here — reorder with ↑↓ without touching the 3D view.
                    </div>
                  )}
                </div>
              </ArPanelBlock>
              {selectedNode && (
                <ArPanelBlock title="Node Properties">
                  <SetNodeInspector sceneId={scene.id} layerId={layer.id} node={selectedNode} />
                </ArPanelBlock>
              )}
            </>
          )}

          {tab === "transform" && (
            <>
              {selectedNode ? (
                <ArPanelBlock title="Numeric Transform">
                  <p className="font-mono text-[9px] text-text-muted">Edit position, rotation, and scale here — the 3D viewport is view-only for framing.</p>
                  <Vec3Fields label="Position" value={selectedNode.transform.position} step={0.05} onChange={(v) => setTransform({ position: v })} />
                  <Vec3Fields label="Rotation (°)" value={selectedNode.transform.rotation} step={1} onChange={(v) => setTransform({ rotation: v })} />
                  <Vec3Fields label="Scale" value={selectedNode.transform.scale} step={0.05} onChange={(v) => setTransform({ scale: v })} />
                  <div className="grid grid-cols-3 gap-1 pt-1">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <div key={axis} className="space-y-0.5">
                        <div className="font-mono text-[8px] uppercase text-text-muted">{axis} nudge</div>
                        <button type="button" className={arToolbarButtonClass} onClick={() => nudgePosition(axis, -0.5)}>−0.5</button>
                        <button type="button" className={arToolbarButtonClass} onClick={() => nudgePosition(axis, 0.5)}>+0.5</button>
                      </div>
                    ))}
                  </div>
                </ArPanelBlock>
              ) : (
                <div className="rounded border border-dashed border-border-subtle p-4 text-center font-mono text-[10px] text-text-muted">
                  Select an AR object from the stack or click it in the preview.
                </div>
              )}
              {selectedNode?.kind === "primitive" && (
                <ArPanelAppearance
                  node={selectedNode}
                  onUpdate={(updates) => ar.updateNode(selectedNode, updates)}
                  onBrightenAll={ar.brightenAllPanels}
                />
              )}
            </>
          )}

          {tab === "data" && (
            <>
              <ArPanelBlock title="Bind Image URL (primitive)">
                {selectedNode?.kind === "primitive" ? (
                  <div className="space-y-1">
                    <input
                      value={ar.bindFilter}
                      onChange={(e) => ar.setBindFilter(e.target.value)}
                      placeholder="filter keys… (squad.p8photo, mock.headshot)"
                      className="h-7 w-full rounded border border-border-subtle bg-bg-deepest px-2 font-mono text-[10px]"
                    />
                    <div className="flex max-h-48 flex-wrap content-start gap-1 overflow-y-auto">
                      {Object.keys(ar.dataValues)
                        .filter((key) => key.toLowerCase().includes(ar.bindFilter.toLowerCase()))
                        .map((key) => (
                          <button key={key} onClick={() => ar.bindSelectedImageUrl(key)} className="rounded border border-border-subtle px-1.5 py-1 font-mono text-[9px] hover:border-stripe-active">
                            {key}
                          </button>
                        ))}
                    </div>
                    {selectedNode.bindings?.find((b) => b.targetPath === "textureUrl") ? (
                      <div className="font-mono text-[9px] text-accent-blue-bright">
                        image bound: {selectedNode.bindings.find((b) => b.targetPath === "textureUrl")!.source}
                      </div>
                    ) : null}
                    <p className="font-mono text-[8px] text-text-muted">Use squad.pNphoto keys from CSV/API, or type URLs in Data → Squad feed.</p>
                  </div>
                ) : (
                  <div className="font-mono text-[10px] text-text-muted">Select a panel / image slot primitive to bind a live image URL.</div>
                )}
              </ArPanelBlock>
              <ArPanelBlock title="Bind Selected Text">
                {selectedNode?.kind === "text3d" ? (
                  <div className="space-y-1">
                    <input
                      value={ar.bindFilter}
                      onChange={(e) => ar.setBindFilter(e.target.value)}
                      placeholder="filter keys…"
                      className="h-7 w-full rounded border border-border-subtle bg-bg-deepest px-2 font-mono text-[10px]"
                    />
                    <div className="flex max-h-48 flex-wrap content-start gap-1 overflow-y-auto">
                      {Object.keys(ar.dataValues)
                        .filter((key) => key.toLowerCase().includes(ar.bindFilter.toLowerCase()))
                        .map((key) => (
                          <button key={key} onClick={() => ar.bindSelectedText(key)} className="rounded border border-border-subtle px-1.5 py-1 font-mono text-[9px] hover:border-stripe-active">
                            {key}
                          </button>
                        ))}
                    </div>
                    {selectedNode.bindings?.length ? (
                      <div className="font-mono text-[9px] text-accent-blue-bright">bound: {selectedNode.bindings[0].source}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="font-mono text-[10px] text-text-muted">Select a 3D text object to bind live data.</div>
                )}
              </ArPanelBlock>
              <ArPanelBlock title="Manual Mock Values">
                <div className="grid grid-cols-2 gap-1">
                  {["guest_name", "title", "score_home", "score_away"].map((key) => (
                    <input
                      key={key}
                      value={ar.dataValues[`mock.${key}`] ?? ""}
                      placeholder={key}
                      onChange={(e) => ar.setMockValue(key, e.target.value)}
                      className="h-7 rounded border border-border-subtle bg-bg-deepest px-2 font-mono text-[10px]"
                    />
                  ))}
                </div>
              </ArPanelBlock>
            </>
          )}

          {tab === "motion" && (
            <>
              <ArPanelBlock title="Animation Presets">
                <div className="grid grid-cols-2 gap-1">
                  {AR_ANIMATION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      disabled={!selectedNode}
                      onClick={() => ar.applyAnimation(preset.id)}
                      className="rounded border border-border-subtle px-1.5 py-1 font-mono text-[10px] hover:border-stripe-active disabled:opacity-40"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </ArPanelBlock>
              {selectedNode?.animation && (
                <ArPanelBlock title="Animation Timing">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-0.5 font-mono text-[9px] text-text-muted">
                      IN duration (s)
                      <Input
                        type="number"
                        step={0.1}
                        value={selectedNode.animation.duration}
                        onChange={(e) => ar.updateAnimation({ duration: Number(e.target.value) })}
                        className="h-7 border-border-subtle bg-bg-surface"
                      />
                    </label>
                    <label className="space-y-0.5 font-mono text-[9px] text-text-muted">
                      IN delay (s)
                      <Input
                        type="number"
                        step={0.05}
                        value={selectedNode.animation.delay}
                        onChange={(e) => ar.updateAnimation({ delay: Number(e.target.value) })}
                        className="h-7 border-border-subtle bg-bg-surface"
                      />
                    </label>
                    <label className="space-y-0.5 font-mono text-[9px] text-text-muted">
                      OUT duration (s)
                      <Input
                        type="number"
                        step={0.1}
                        value={selectedNode.animation.outDuration ?? selectedNode.animation.duration}
                        onChange={(e) => ar.updateAnimation({ outDuration: Number(e.target.value) })}
                        className="h-7 border-border-subtle bg-bg-surface"
                      />
                    </label>
                    <label className="space-y-0.5 font-mono text-[9px] text-text-muted">
                      OUT delay (s)
                      <Input
                        type="number"
                        step={0.05}
                        value={selectedNode.animation.outDelay ?? 0}
                        onChange={(e) => ar.updateAnimation({ outDelay: Number(e.target.value) })}
                        className="h-7 border-border-subtle bg-bg-surface"
                      />
                    </label>
                  </div>
                  <label className="mt-2 block space-y-0.5 font-mono text-[9px] text-text-muted">
                    Direction
                    <select
                      value={selectedNode.animation.direction}
                      onChange={(e) => ar.updateAnimation({ direction: e.target.value as typeof selectedNode.animation.direction })}
                      className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-2 font-mono text-[10px]"
                    >
                      {["left", "right", "top", "bottom", "front", "back", "none"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 block space-y-0.5 font-mono text-[9px] text-text-muted">
                    Easing
                    <Input
                      value={selectedNode.animation.easing}
                      onChange={(e) => ar.updateAnimation({ easing: e.target.value })}
                      className="h-7 border-border-subtle bg-bg-surface font-mono text-[10px]"
                      placeholder="power2.out"
                    />
                  </label>
                  <div className="font-mono text-[9px] text-text-muted-alt">
                    preset: {selectedNode.animation.preset}
                    {selectedNode.animation.fade ? " · fade" : ""}
                    {selectedNode.animation.countUp ? " · count-up" : ""}
                  </div>
                  <button onClick={ar.clearAnimation} className={`${arToolbarButtonClass} w-full text-live-red`}>
                    Clear animation
                  </button>
                </ArPanelBlock>
              )}
              <ArPanelBlock title="Playback (Program / Preview)">
                <div className="flex gap-1">
                  <button onClick={() => ar.playIn(layer.id)} className={arToolbarButtonClass}>▶ IN</button>
                  <button onClick={() => ar.playOut(layer.id)} className={arToolbarButtonClass}>◀ OUT</button>
                </div>
              </ArPanelBlock>
            </>
          )}

          {tab === "assets" && (
            <>
              <ArPanelBlock title="AI Image">
                <textarea
                  value={ar.aiPrompt}
                  onChange={(e) => ar.setAiPrompt(e.target.value)}
                  placeholder="Prompt a broadcast AR graphic…"
                  className="h-16 w-full resize-none rounded border border-border-subtle bg-bg-deepest p-2 font-mono text-[10px]"
                />
                <button onClick={() => void ar.generateImageForAr()} disabled={ar.aiBusy || !ar.aiPrompt.trim()} className={`${arToolbarButtonClass} w-full`}>
                  {ar.aiBusy ? "Generating…" : "Generate + Place"}
                </button>
              </ArPanelBlock>
              <ArPanelBlock title="Import">
                <button onClick={() => ar.fileInput.current?.click()} className={`${arToolbarButtonClass} w-full`}>
                  Upload / add to scene
                </button>
                <input
                  ref={ar.fileInput}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,.glb,.gltf,.fbx,.obj,.mp4,.webm,.mov,.m4v"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void ar.importAsset(file);
                    e.target.value = "";
                  }}
                />
              </ArPanelBlock>
              <ArPanelBlock title="Library">
                <div className="grid gap-1">
                  {ar.assets.map((asset) => (
                    <AssetAction key={asset.id} asset={asset} onUse={ar.addAssetToScene} />
                  ))}
                </div>
              </ArPanelBlock>
            </>
          )}

          {tab === "build" && (
            <>
              <ArPanelBlock title="3D Models — Sports Graphics">
                <SportsModelsGrid
                  onInsert={(model) => {
                    ar.addNodes([model.build()]);
                    setTab("model");
                  }}
                />
              </ArPanelBlock>
              <ArPanelBlock title="Faith / Worship">
                <ArTemplateGrid
                  templates={AR_TEMPLATES.filter(isFaithArTemplate)}
                  onPick={(template) => ar.addNodes(template.create())}
                />
              </ArPanelBlock>
              <ArPanelBlock title="Scene Templates">
                <ArTemplateGrid
                  templates={AR_TEMPLATES.filter((t) => !isFaithArTemplate(t))}
                  onPick={(template) => ar.addNodes(template.create())}
                />
              </ArPanelBlock>
              <ArPanelBlock title="AR Backplate">
                {setProps && (
                  <VideoSourceEditor
                    source={setProps.environment.backplate ?? { type: "none" }}
                    onChange={(backplate) =>
                      ar.setSetEnvironment(scene.id, layer.id, {
                        backplate,
                        floor: { ...setProps.environment.floor, enabled: backplate.type === "none" },
                        grid: backplate.type === "none",
                      })
                    }
                  />
                )}
              </ArPanelBlock>
              <ArPanelBlock title="Save / Export">
                <button onClick={() => void ar.saveTemplate(layer.name, layer)} className={arToolbarButtonClass}>Save template</button>
                <button onClick={() => downloadJson(`${layer.name}.ar.json`, layer)} className={arToolbarButtonClass}>Export JSON</button>
              </ArPanelBlock>
            </>
          )}

          {tab === "model" && (
            <>
              {(() => {
                // The selected node's owning Sports AR model — or, with
                // nothing selected, the first model in the layer.
                const selectedRoot = findModelRoot(setProps?.nodes ?? [], ar.selectedNodeId);
                const anyRoot =
                  selectedRoot ??
                  (setProps?.nodes ?? []).flatMap((n) => (n.kind === "group" && n.arModel ? [n] : []))[0];
                if (!anyRoot) {
                  return (
                    <div className="rounded border border-dashed border-border-subtle p-4 text-center font-mono text-[10px] text-text-muted">
                      No Sports AR model in this layer — insert one from Build › 3D Models.
                    </div>
                  );
                }
                return (
                  <SportsModelInspector
                    sceneId={scene.id}
                    layerId={layer.id}
                    root={anyRoot}
                    dataKeys={Object.keys(ar.dataValues)}
                    onSaveVariant={() => void ar.saveTemplate(`${anyRoot.name} variant`, layer)}
                  />
                );
              })()}
            </>
          )}

          {tab === "ready" && (
            <>
              <ArPanelBlock title="Game Ready">
                <p className="mb-2 font-mono text-[9px] leading-relaxed text-text-muted-alt">
                  Animation specs upgrade automatically when your project loads — older scenes pick up fades, wipes, and count-ups without re-adding templates.
                </p>
                <button onClick={ar.prepForAir} className={`${arToolbarButtonClass} w-full`}>
                  Prep for Air (on-air flags)
                </button>
                <button onClick={ar.rehearseInOut} className={`${arToolbarButtonClass} w-full`}>
                  Rehearse IN → OUT
                </button>
                {ar.verseScene && (
                  <>
                    <label className="flex items-center justify-between gap-2 font-mono text-[9px] text-text-muted">
                      Auto verse transitions
                      <Switch checked={ar.verseTransitions} onCheckedChange={ar.setVerseTransitions} />
                    </label>
                    <button onClick={ar.cueVerseTransition} className={`${arToolbarButtonClass} w-full`}>
                      Cue verse transition (OUT → IN)
                    </button>
                  </>
                )}
              </ArPanelBlock>
              <ArPanelBlock title="Readiness">
                <div className="space-y-1">
                  {ar.checks.map((check) => (
                    <div key={check.id} className="rounded border border-border-subtle bg-bg-deepest p-1.5 font-mono text-[9px]">
                      <div className={check.level === "ok" ? "text-accent-blue-bright" : check.level === "error" ? "text-live-red" : "text-live-amber"}>{check.label}</div>
                      <div className="text-text-muted">{check.detail}</div>
                    </div>
                  ))}
                </div>
              </ArPanelBlock>
              <ArPanelBlock title="Broadcast">
                <button onClick={ar.loadToPreview} className={arToolbarButtonClass}>Load Preview</button>
                <button onClick={ar.takeOnAir} className={`${arToolbarButtonClass} text-live-red`}>Take On Air</button>
                <button onClick={ar.duplicateAllObjects} className={arToolbarButtonClass}>Duplicate AR objects</button>
              </ArPanelBlock>
            </>
          )}
        </div>
      </div>

      {ar.status && (
        <div className="shrink-0 truncate border-t border-border-subtle px-3 py-1 font-mono text-[9px] text-accent-blue-bright">{ar.status}</div>
      )}

      <ImagePickerDialog
        open={quickImageOpen}
        onOpenChange={setQuickImageOpen}
        onPick={(assetId) => {
          if (selectedNode?.kind === "primitive") {
            const asset = ar.project?.assets.find((a) => a.id === assetId && a.kind === "image");
            const updates: Partial<SetNode> = {
              textureAssetId: assetId,
              material: { ...selectedNode.material, color: "#ffffff", metalness: 0, roughness: 1 },
            };
            if (asset?.imageWidth && asset?.imageHeight) {
              updates.transform = scalePrimitiveForImageAspect(
                selectedNode.transform,
                asset.imageWidth,
                asset.imageHeight,
              );
            }
            ar.updateNode(selectedNode, updates);
          }
          setQuickImageOpen(false);
        }}
      />
    </div>
  );
}
