import { useState } from "react";
import { useDocStore } from "@/document/store";
import {
  createRectElement,
  createTextElement,
  createVideoElement,
  createImageElement,
  createLottieElement,
} from "@/document/factory";
import type { ID, Layer, SetNode } from "@/document/types";
import { SET_BUILDERS } from "@/sets/studioSets";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { LottiePickerDialog } from "./LottiePickerDialog";
import { useUserTemplates } from "@/document/userTemplates";
import { KindBadge, SET_NODE_KIND_LABEL, LAYER_KIND_LABEL, ELEMENT_KIND_LABEL } from "@/components/ui/broadcast";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

/** Click-to-edit name — double-click enters an input, Enter/blur commits. */
function InlineName({
  value,
  className,
  onRename,
}: {
  value: string;
  className?: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        className={`flex-1 truncate font-mono ${className ?? ""}`}
        title={`${value} — double-click to rename`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
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
        if (draft.trim() && draft !== value) onRename(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="h-5 min-w-0 flex-1 rounded border border-accent-blue bg-bg-deepest px-1 font-mono text-[11px] text-text-muted-alt outline-none"
    />
  );
}

/** Recursive outliner row for the set3d node tree — groups indent their
 * children, every node selects/hides/locks/deletes individually. */
function SetNodeRow({
  node,
  depth,
  sceneId,
  layerId,
}: {
  node: SetNode;
  depth: number;
  sceneId: ID;
  layerId: ID;
}) {
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);
  const selectSetNode = useDocStore((s) => s.selectSetNode);
  const updateSetNode = useDocStore((s) => s.updateSetNode);
  const removeSetNode = useDocStore((s) => s.removeSetNode);
  const isSelected = selectedNodeId === node.id;

  return (
    <>
      <div
        onClick={() => selectSetNode(node.id)}
        style={{ paddingLeft: 6 + depth * 12 }}
        className={`group flex cursor-pointer items-center gap-1 rounded py-1 pr-1.5 ${
          isSelected ? "bg-bg-surface text-text-bright" : "text-text-muted-alt hover:bg-bg-surface"
        }`}
      >
        <KindBadge label={SET_NODE_KIND_LABEL[node.kind] ?? node.kind} title={node.kind} />
        <InlineName value={node.name} onRename={(name) => updateSetNode(sceneId, layerId, node.id, { name })} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateSetNode(sceneId, layerId, node.id, { visible: !node.visible });
          }}
          title={node.visible ? "Hide" : "Show"}
          className="hover:text-accent-blue"
        >
          {node.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-text-muted" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateSetNode(sceneId, layerId, node.id, { locked: !node.locked });
          }}
          title={node.locked ? "Unlock" : "Lock"}
          className="hover:text-accent-blue"
        >
          {node.locked ? <Lock className="h-3 w-3 text-live-red" /> : <Unlock className="h-3 w-3 text-text-muted" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeSetNode(sceneId, layerId, node.id);
          }}
          title="Delete node"
          className="rounded p-0.5 font-mono text-[8px] hover:bg-live-red/20 hover:text-live-red"
        >
          del
        </button>
      </div>
      {node.kind === "group" &&
        node.children.map((child) => (
          <SetNodeRow key={child.id} node={child} depth={depth + 1} sceneId={sceneId} layerId={layerId} />
        ))}
    </>
  );
}

export function LayersPanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const activeLayerId = useDocStore((s) => s.activeLayerId);
  const selectedElementIds = useDocStore((s) => s.selectedElementIds);
  const addLayer = useDocStore((s) => s.addLayer);
  const addSet3dLayer = useDocStore((s) => s.addSet3dLayer);
  const removeLayer = useDocStore((s) => s.removeLayer);
  const duplicateLayer = useDocStore((s) => s.duplicateLayer);
  const renameLayer = useDocStore((s) => s.renameLayer);
  const reorderLayer = useDocStore((s) => s.reorderLayer);
  const setLayerFlag = useDocStore((s) => s.setLayerFlag);
  const setActiveLayer = useDocStore((s) => s.setActiveLayer);
  const addElement = useDocStore((s) => s.addElement);
  const removeElement = useDocStore((s) => s.removeElement);
  const reorderElement = useDocStore((s) => s.reorderElement);
  const updateElement = useDocStore((s) => s.updateElement);
  const selectElements = useDocStore((s) => s.selectElements);
  const setElementBinding = useDocStore((s) => s.setElementBinding);
  const layerPlayback = useDocStore((s) => s.layerPlayback);
  const playIn = useDocStore((s) => s.playIn);
  const playOut = useDocStore((s) => s.playOut);
  const [imagePickerFor, setImagePickerFor] = useState<{ sceneId: ID; layerId: ID } | null>(null);
  const [lottiePickerFor, setLottiePickerFor] = useState<{ sceneId: ID; layerId: ID } | null>(null);
  const saveUserTemplate = useUserTemplates((s) => s.save);
  const [savedTemplateFor, setSavedTemplateFor] = useState<ID | null>(null);

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];

  if (!project || !scene) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  const sortedLayers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-xs">
      <Button
        size="sm"
        variant="outline"
        className="justify-start border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
        onClick={() => addLayer(scene.id, "gfx2d")}
      >
        + GFX Layer
      </Button>

      <div className="space-y-1">
        <div className="border-b-2 border-stripe-accent pb-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">3D Sets</div>
        <div className="grid grid-cols-2 gap-1">
          {SET_BUILDERS.map((builder) => (
            <button
              key={builder.id}
              onClick={() => addSet3dLayer(scene.id, builder.create())}
              className="rounded border border-border-subtle bg-bg-surface px-1.5 py-1 font-mono text-[9px] text-text-muted-alt shadow-[inset_0_-2px_0_0_var(--stripe-accent)] hover:border-stripe-active hover:text-text-bright"
            >
              {builder.label}
            </button>
          ))}
          <button
            onClick={() => addLayer(scene.id, "set3d")}
            className="rounded border border-dashed border-border-subtle bg-bg-surface px-1.5 py-1 font-mono text-[9px] text-text-muted hover:border-stripe-active hover:text-text-bright"
          >
            Empty Set
          </button>
        </div>
        <div className="font-mono text-[9px] text-text-muted">
          Scorebugs, tickers &amp; full-screens live in the Templates panel.
        </div>
      </div>

      {sortedLayers.map((layer, i) => {
        const elements = layer.props.kind === "gfx2d" ? layer.props.elements : [];
        const isActiveLayer = layer.id === activeLayerId;
        return (
          <div
            key={layer.id}
            className={`rounded border bg-bg-panel shadow-[inset_0_-2px_0_0_var(--stripe-accent)] ${
              isActiveLayer ? "border-stripe-active" : "border-border-subtle"
            }`}
          >
            <div className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5" onClick={() => setActiveLayer(layer.id)}>
              <KindBadge label={LAYER_KIND_LABEL[layer.kind] ?? layer.kind} title={layer.kind} />
              <InlineName
                value={layer.name}
                className="text-text-muted-alt"
                onRename={(name) => renameLayer(scene.id, layer.id, name)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLayerFlag(scene.id, layer.id, "visible", !layer.visible);
                }}
                title={layer.visible ? "Hide layer" : "Show layer"}
                className="p-0.5 hover:text-accent-blue"
              >
                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-text-muted" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLayerFlag(scene.id, layer.id, "locked", !layer.locked);
                }}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
                className="p-0.5 hover:text-accent-blue"
              >
                {layer.locked ? <Lock className="h-3.5 w-3.5 text-live-red" /> : <Unlock className="h-3.5 w-3.5 text-text-muted" />}
              </button>
              {/* Always visible, not gated behind isActiveLayer below — an
                  operator triggering Play In/Out during a live show can't
                  be expected to first click into a layer to reveal the
                  button that controls whether it's on-air. */}
              {layer.timeline && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playIn(layer.id);
                    }}
                    title="Play In"
                    className={`rounded border px-1 py-0.5 font-mono text-[9px] ${
                      layerPlayback[layer.id]?.phase === "in"
                        ? "border-live-red text-live-red"
                        : "border-border-subtle text-text-muted-alt hover:border-live-red hover:text-live-red"
                    }`}
                  >
                    IN
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playOut(layer.id);
                    }}
                    title="Play Out"
                    className={`rounded border px-1 py-0.5 font-mono text-[9px] ${
                      layerPlayback[layer.id]?.phase === "out"
                        ? "border-stripe-active text-text-bright"
                        : "border-border-subtle text-text-muted-alt hover:border-stripe-active hover:text-text-bright"
                    }`}
                  >
                    OUT
                  </button>
                </>
              )}
            </div>

            {/* The active layer's action bar: real hit targets, labeled,
                delete unmistakably red — no hunt-the-tiny-icon. */}
            {isActiveLayer && (
              <div className="flex items-center gap-1 border-t border-border-subtle bg-bg-surface/40 px-1.5 py-1">
                <button
                  onClick={() => reorderLayer(scene.id, layer.id, Math.max(0, i - 1))}
                  title="Move layer up (renders earlier)"
                  className="rounded border border-border-subtle p-1 text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => reorderLayer(scene.id, layer.id, Math.min(sortedLayers.length - 1, i + 1))}
                  title="Move layer down (renders later, on top)"
                  className="rounded border border-border-subtle p-1 text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => {
                      void saveUserTemplate(layer.name, JSON.parse(JSON.stringify(layer)) as Layer);
                      setSavedTemplateFor(layer.id);
                      setTimeout(() => setSavedTemplateFor(null), 1500);
                    }}
                    title="Save this layer as a reusable template (Templates panel → My Templates)"
                    className={`rounded border px-1.5 py-1 font-mono text-[9px] ${
                      savedTemplateFor === layer.id
                        ? "border-stripe-active text-text-bright"
                        : "border-border-subtle text-text-muted-alt hover:border-stripe-active hover:text-text-bright"
                    }`}
                  >
                    {savedTemplateFor === layer.id ? "Saved!" : "Save"}
                  </button>
                  <button
                    onClick={() => duplicateLayer(scene.id, layer.id)}
                    title="Duplicate layer"
                    className="rounded border border-border-subtle px-1.5 py-1 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active hover:text-text-bright"
                  >
                    Dup
                  </button>
                  <button
                    onClick={() => removeLayer(scene.id, layer.id)}
                    title="Delete layer (undoable)"
                    className="rounded border border-live-red/40 px-1.5 py-1 font-mono text-[9px] text-live-red hover:bg-live-red/15"
                  >
                    Del
                  </button>
                </div>
              </div>
            )}

            {isActiveLayer && layer.props.kind === "set3d" && (
              <div className="space-y-0.5 border-t border-border-subtle p-1.5">
                {layer.props.nodes.length === 0 && (
                  <div className="p-1 font-mono text-[10px] text-text-muted">
                    Empty set — add nodes from the Virtual Set toolbar.
                  </div>
                )}
                {layer.props.nodes.map((node) => (
                  <SetNodeRow key={node.id} node={node} depth={0} sceneId={scene.id} layerId={layer.id} />
                ))}
              </div>
            )}

            {isActiveLayer && layer.props.kind === "gfx2d" && (
              <div className="space-y-1 border-t border-border-subtle p-1.5">
                <div className="grid grid-cols-5 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-text-muted-alt"
                    onClick={() => addElement(scene.id, layer.id, createRectElement())}
                  >
                    + Rect
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-text-muted-alt"
                    onClick={() => addElement(scene.id, layer.id, createTextElement())}
                  >
                    + Text
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-text-muted-alt"
                    onClick={() => setImagePickerFor({ sceneId: scene.id, layerId: layer.id })}
                  >
                    + Image
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-text-muted-alt"
                    onClick={() => addElement(scene.id, layer.id, createVideoElement())}
                  >
                    + Video
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-text-muted-alt"
                    onClick={() => setLottiePickerFor({ sceneId: scene.id, layerId: layer.id })}
                    title="After-Effects-authored motion graphic (Lottie/Bodymovin JSON)"
                  >
                    + Motion
                  </Button>
                </div>
                {elements.map((el, elIndex) => {
                  return (
                    <div
                      key={el.id}
                      onClick={() => selectElements([el.id])}
                      className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 ${
                        selectedElementIds.includes(el.id)
                          ? "bg-bg-surface text-text-bright"
                          : "text-text-muted-alt hover:bg-bg-surface"
                      }`}
                    >
                      <KindBadge label={ELEMENT_KIND_LABEL[el.kind] ?? el.kind} title={el.kind} />
                      <InlineName
                        value={el.name}
                        onRename={(name) => updateElement(scene.id, layer.id, el.id, { name })}
                      />
                      {el.bindings.length > 0 && (
                        <span className="font-mono text-[7px] text-text-muted" title="Has data bindings">
                          bind
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderElement(scene.id, layer.id, el.id, Math.max(0, elIndex - 1));
                        }}
                        className="hover:text-accent-blue"
                        title="Send backward"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderElement(scene.id, layer.id, el.id, Math.min(elements.length - 1, elIndex + 1));
                        }}
                        className="hover:text-accent-blue"
                        title="Bring forward"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetPath = el.kind === "text" ? "text" : "fill";
                          if (el.bindings.some((b) => b.targetPath === targetPath)) return;
                          setElementBinding(scene.id, layer.id, el.id, { targetPath, source: "" });
                        }}
                        className="font-mono text-[8px] text-text-muted hover:text-text-bright"
                        title="Bind to data"
                      >
                        bind
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeElement(scene.id, layer.id, el.id);
                        }}
                        title="Delete element"
                        className="rounded p-0.5 font-mono text-[8px] hover:bg-live-red/20 hover:text-live-red"
                      >
                        del
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <ImagePickerDialog
        open={imagePickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setImagePickerFor(null);
        }}
        onPick={(assetId) => {
          if (imagePickerFor) {
            addElement(imagePickerFor.sceneId, imagePickerFor.layerId, createImageElement(assetId));
          }
        }}
      />
      <LottiePickerDialog
        open={lottiePickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setLottiePickerFor(null);
        }}
        onPick={(assetId) => {
          if (lottiePickerFor) {
            addElement(lottiePickerFor.sceneId, lottiePickerFor.layerId, createLottieElement(assetId));
          }
        }}
      />
    </div>
  );
}
