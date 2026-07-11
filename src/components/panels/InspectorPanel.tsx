import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDocStore, locateElement, locateSetNode, findSetNode } from "@/document/store";
import { useDataStore, buildDataValues } from "@/document/dataSources";
import type { Transform } from "@/document/types";
import { SetNodeInspector, SetSettingsInspector } from "./SetInspector";
import { ElementFxSections } from "./ElementFxInspector";
import { VideoSourceEditor } from "./VideoSourceEditor";
import { AudioControls } from "./AudioControls";
import { MotionGraphicControls } from "./MotionGraphicControls";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { LottiePickerDialog } from "./LottiePickerDialog";
import { FontPickerDialog } from "./FontPickerDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Type as FontIcon, Trash2, Sparkles as SparklesIcon } from "lucide-react";

export function InspectorPanel() {
  const project = useDocStore((s) => s.project);
  const selectedElementIds = useDocStore((s) => s.selectedElementIds);
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const activeLayerId = useDocStore((s) => s.activeLayerId);
  const updateElement = useDocStore((s) => s.updateElement);
  const removeElement = useDocStore((s) => s.removeElement);
  const commitTransform = useDocStore((s) => s.commitTransform);
  const updateElementBinding = useDocStore((s) => s.updateElementBinding);
  const removeElementBinding = useDocStore((s) => s.removeElementBinding);
  // useShallow required — buildDataValues returns a fresh object per call
  // (see the matching note in GfxEditor.tsx).
  const dataValues = useDataStore(useShallow(buildDataValues));

  // 3D node selection takes the panel when one exists — selections are
  // mutually exclusive by construction (see selectElements/selectSetNode).
  if (project && selectedNodeId) {
    const nodeLocation = locateSetNode(project, selectedNodeId);
    const nodeLayer =
      nodeLocation &&
      project.scenes.find((s) => s.id === nodeLocation.sceneId)?.layers.find((l) => l.id === nodeLocation.layerId);
    const node =
      nodeLayer?.props.kind === "set3d" ? findSetNode(nodeLayer.props.nodes, selectedNodeId) : undefined;
    if (nodeLocation && node) {
      return <SetNodeInspector sceneId={nodeLocation.sceneId} layerId={nodeLocation.layerId} node={node} />;
    }
  }

  const elementId = selectedElementIds[0];
  const location = project && elementId ? locateElement(project, elementId) : null;
  const layer =
    location && project
      ? project.scenes.find((s) => s.id === location.sceneId)?.layers.find((l) => l.id === location.layerId)
      : undefined;
  const element = layer?.props.kind === "gfx2d" ? layer.props.elements.find((e) => e.id === elementId) : undefined;

  if (!project || !location || !element) {
    // Nothing picked, but a 3D set active → edit its environment/render
    // settings here (the set-wide knobs have no other home).
    const activeScene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
    const activeLayer = activeScene?.layers.find((l) => l.id === activeLayerId);
    if (project && activeScene && activeLayer?.props.kind === "set3d") {
      return <SetSettingsInspector sceneId={activeScene.id} layer={activeLayer} />;
    }
    return <div className="p-3 font-mono text-xs text-text-muted">No selection</div>;
  }

  const setTransform = (updates: Partial<Transform>) => {
    commitTransform(location.sceneId, location.layerId, elementId, { ...element.transform, ...updates });
  };
  const setField = (updates: Record<string, unknown>) => {
    updateElement(location.sceneId, location.layerId, elementId, updates);
  };

  // Every key buildDataValues() flattens for resolution — kept in sync by
  // construction since both read from the same useDataStore.
  const availableSourceKeys = Object.keys(dataValues);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-text-muted-alt">
          {element.name} <span className="text-text-muted">({element.kind})</span>
        </span>
        <button
          onClick={() => {
            removeElement(location.sceneId, location.layerId, element.id);
          }}
          title="Delete element (undoable — also: Del key on canvas)"
          className="flex shrink-0 items-center gap-1 rounded border border-live-red/40 px-1.5 py-1 font-mono text-[10px] text-live-red hover:bg-live-red/15"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.transform.x} onChange={(v) => setTransform({ x: v })} />
        <NumberField label="Y" value={element.transform.y} onChange={(v) => setTransform({ y: v })} />
        <NumberField label="Width" value={element.transform.width} onChange={(v) => setTransform({ width: v })} />
        <NumberField label="Height" value={element.transform.height} onChange={(v) => setTransform({ height: v })} />
        <NumberField label="Rotation" value={element.transform.rotation} onChange={(v) => setTransform({ rotation: v })} />
        <NumberField label="Opacity" value={element.opacity} step={0.05} onChange={(v) => setField({ opacity: v })} />
      </div>

      {element.kind === "rect" && <ColorField label="Fill" value={element.fill} onChange={(v) => setField({ fill: v })} />}

      {element.kind === "text" && (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] text-text-muted">Text</Label>
            <Input
              value={element.text}
              onChange={(e) => setField({ text: e.target.value })}
              className="h-7 border-border-subtle bg-bg-surface text-text-muted-alt"
            />
          </div>
          <NumberField label="Font size" value={element.fontSize} onChange={(v) => setField({ fontSize: v })} />
          <ColorField label="Fill" value={element.fill} onChange={(v) => setField({ fill: v })} />
          <FontFieldEditor family={element.fontFamily} onChoose={(family) => setField({ fontFamily: family })} />
        </>
      )}

      {element.kind === "image" && (
        <ImageSlotEditor assetId={element.assetId} onChoose={(assetId) => setField({ assetId })} />
      )}

      {element.kind === "lottie" && (
        <LottieSlotEditor
          assetId={element.assetId}
          loop={element.loop ?? true}
          speed={element.speed ?? 1}
          onChoose={(assetId) => setField({ assetId })}
          onChange={(updates) => setField(updates)}
        />
      )}

      {element.kind === "video" && (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <Label className="text-[10px] text-text-muted">Source</Label>
          <VideoSourceEditor source={element.source} onChange={(source) => setField({ source })} />
          <Label className="text-[10px] text-text-muted" title="Real audio only plays in the Program window">
            Audio
          </Label>
          <AudioControls
            volume={element.volume ?? 1}
            muted={element.muted ?? false}
            onChange={(updates) => setField(updates)}
          />
        </div>
      )}

      <ElementFxSections element={element} setField={setField} />

      {element.bindings.length > 0 && (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <Label className="text-[10px] text-text-muted">Bindings</Label>
          {element.bindings.map((binding, i) => (
            <div key={i} className="space-y-1.5 rounded border border-border-subtle bg-bg-surface p-2">
              <div className="flex items-center gap-1">
                <span className="w-12 shrink-0 font-mono text-[10px] text-text-muted">{binding.targetPath}</span>
                <select
                  value={binding.source}
                  onChange={(e) => updateElementBinding(location.sceneId, location.layerId, elementId, i, { source: e.target.value })}
                  className="h-7 flex-1 rounded border border-border-subtle bg-bg-panel px-1 font-mono text-[11px] text-text-muted-alt"
                >
                  <option value="">— none —</option>
                  {availableSourceKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeElementBinding(location.sceneId, location.layerId, elementId, i)}
                  className="shrink-0 hover:text-live-red"
                  title="Remove binding"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="flex gap-1">
                <Input
                  placeholder="format, e.g. Score: {value}"
                  value={binding.format ?? ""}
                  onChange={(e) =>
                    updateElementBinding(location.sceneId, location.layerId, elementId, i, {
                      format: e.target.value || undefined,
                    })
                  }
                  className="h-6 flex-1 border-border-subtle bg-bg-panel text-[10px] text-text-muted-alt"
                />
                <Input
                  placeholder="fallback"
                  value={typeof binding.fallback === "string" ? binding.fallback : ""}
                  onChange={(e) =>
                    updateElementBinding(location.sceneId, location.layerId, elementId, i, {
                      fallback: e.target.value || undefined,
                    })
                  }
                  className="h-6 flex-1 border-border-subtle bg-bg-panel text-[10px] text-text-muted-alt"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Image element "slot" editor — thumbnail of the current fill (or an empty
 * placeholder for an unfilled template slot) plus a "Choose image" button
 * that opens the shared thumbnail-card picker. Two clicks to fill a slot. */
function ImageSlotEditor({ assetId, onChoose }: { assetId: string; onChoose: (assetId: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const project = useDocStore((s) => s.project);
  const asset = project?.assets.find((a) => a.id === assetId);
  const filled = !!asset && asset.kind === "image";

  return (
    <div className="space-y-1.5 border-t border-border-subtle pt-2">
      <Label className="text-[10px] text-text-muted">Image</Label>
      <div className="flex items-center gap-2">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-bg-surface">
          {filled && asset.thumbnail ? (
            <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-5 w-5 text-text-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] text-text-muted-alt">
            {filled ? asset.name : "empty slot"}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="mt-1 h-6 gap-1.5 border-border-subtle bg-bg-surface text-[10px] text-text-muted-alt"
          >
            <ImageIcon className="h-3 w-3" /> Choose image
          </Button>
        </div>
      </div>
      <ImagePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={onChoose} />
    </div>
  );
}

/** Lottie element "slot" editor — same shape as ImageSlotEditor (no
 * thumbnail, since a motion graphic has no single representative frame),
 * plus loop/speed playback controls (see LottieElementView). */
function LottieSlotEditor({
  assetId,
  loop,
  speed,
  onChoose,
  onChange,
}: {
  assetId: string;
  loop: boolean;
  speed: number;
  onChoose: (assetId: string) => void;
  onChange: (updates: { loop?: boolean; speed?: number }) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const project = useDocStore((s) => s.project);
  const asset = project?.assets.find((a) => a.id === assetId);
  const filled = !!asset && asset.kind === "lottie";

  return (
    <div className="space-y-1.5 border-t border-border-subtle pt-2">
      <Label className="text-[10px] text-text-muted">Motion graphic</Label>
      <div className="flex items-center gap-2">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-bg-surface">
          <SparklesIcon className="h-5 w-5 text-text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] text-text-muted-alt">
            {filled ? asset.name : "empty slot"}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="mt-1 h-6 gap-1.5 border-border-subtle bg-bg-surface text-[10px] text-text-muted-alt"
          >
            <SparklesIcon className="h-3 w-3" /> Choose motion graphic
          </Button>
        </div>
      </div>
      <MotionGraphicControls loop={loop} speed={speed} onChange={onChange} />
      <LottiePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={onChoose} />
    </div>
  );
}

/** Text element font picker — a button showing the current family (rendered
 * in that face) that opens the shared card picker. */
function FontFieldEditor({ family, onChoose }: { family: string; onChoose: (family: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-text-muted">Font</Label>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        style={{ fontFamily: family }}
        className="h-8 w-full justify-between gap-1.5 border-border-subtle bg-bg-surface text-text-muted-alt"
      >
        <span className="truncate">{family}</span>
        <FontIcon className="h-3 w-3 shrink-0" />
      </Button>
      <FontPickerDialog open={open} onOpenChange={setOpen} onPick={onChoose} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-text-muted">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 border-border-subtle bg-bg-surface text-text-muted-alt"
      />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-text-muted">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 rounded border border-border-subtle bg-transparent"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
        />
      </div>
    </div>
  );
}
