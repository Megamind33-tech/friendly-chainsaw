import { useState, type ReactNode } from "react";
import { useDocStore } from "@/document/store";
import { SET_NODE_INSPECTOR_DEFINITIONS } from "@/components/set3d/setNodeRegistry";
import type { Asset, ID, Layer, SetNode, SurfaceDisplaySettings, Transform3D, Vec3 } from "@/document/types";
import { detectMachineProfile, settingsForQualityTier, type QualityTier } from "@/document/qualityTiers";
import { NumberField, ColorField } from "./InspectorPanel";
import { VideoSourceEditor } from "./VideoSourceEditor";
import { AudioControls } from "./AudioControls";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { analyseSurfaceResolution } from "@/components/set3d/displayTextures";
import { ThumbSlot } from "@/components/ui/broadcast";
import { flattenSetNodes } from "@/ar-engine/nodeUtils";
import { createBrandingSurfaceNode, createMediaSurfaceNode, vec3 } from "@/document/factory";

/**
 * Inspector sections for the Virtual Set — structured like a DCC "Details"
 * panel (Unreal/Unity): a scrollable stack of collapsible, categorized
 * sections. The scroll container is load-bearing: without it, settings
 * below the fold are simply unreachable in a docked panel.
 */

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b-2 border-stripe-accent bg-bg-surface/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-bright"
      >
        <span className="text-[8px]">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="space-y-2 px-2 py-2">{children}</div>}
    </div>
  );
}

export function Vec3Fields({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: Vec3;
  step?: number;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-text-muted">{label}</Label>
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <div key={axis} className="relative">
            <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase text-text-muted">
              {axis}
            </span>
            <Input
              type="number"
              step={step}
              value={value[axis]}
              onChange={(e) => onChange({ ...value, [axis]: Number(e.target.value) })}
              className="h-7 border-border-subtle bg-bg-surface pl-5 text-text-muted-alt"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 font-mono text-[10px] text-text-muted-alt">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Primitive "surface image" slot — thumbnail of the current texture (or an
 * empty-slot placeholder), a "Choose image" button opening the shared
 * thumbnail-card picker, and a clear (X) button. Mirrors InspectorPanel's
 * ImageSlotEditor pattern (2D image element slots) for the 3D primitive
 * texture slot. */
function TextureSlotEditor({
  label = "Surface image",
  assetId,
  assets,
  onChoose,
  onClear,
}: {
  label?: string;
  assetId: ID | undefined;
  assets: Asset[];
  onChoose: (assetId: ID) => void;
  onClear: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const asset = assets.find((a) => a.id === assetId && a.kind === "image");

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] text-text-muted">{label}</Label>
      <div className="flex items-center gap-2">
        <ThumbSlot size={48}>
          {asset?.thumbnail ? (
            <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-[8px] text-text-muted">—</div>
          )}
        </ThumbSlot>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[10px] text-text-muted-alt">{asset ? asset.name : "empty slot"}</div>
          <div className="mt-1 flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="h-6 border-border-subtle bg-bg-surface font-mono text-[9px] text-text-muted-alt"
            >
              choose
            </Button>
            {asset && (
              <button
                onClick={onClear}
                title="Clear surface image"
                className="flex h-6 shrink-0 items-center justify-center rounded border border-border-subtle px-1.5 font-mono text-[8px] text-text-muted hover:text-live-red"
              >
                clr
              </button>
            )}
          </div>
        </div>
      </div>
      <ImagePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={onChoose} />
    </div>
  );
}

function SurfaceDisplayEditor({
  value,
  onChange,
}: {
  value: SurfaceDisplaySettings | undefined;
  onChange: (value: SurfaceDisplaySettings) => void;
}) {
  const display = value ?? { fit: "cover", anchor: "center", overscan: 1, opacity: 1 };
  const crop = display.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] text-text-muted">
          <span>Fit</span>
          <select
            value={display.fit}
            onChange={(e) => onChange({ ...display, fit: e.target.value as SurfaceDisplaySettings["fit"] })}
            className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-1 font-mono text-text-muted-alt"
          >
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
            <option value="stretch">Stretch</option>
          </select>
        </label>
        <label className="space-y-1 text-[10px] text-text-muted">
          <span>Alignment</span>
          <select
            value={display.anchor ?? "center"}
            onChange={(e) => onChange({ ...display, anchor: e.target.value as NonNullable<SurfaceDisplaySettings["anchor"]> })}
            className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-1 font-mono text-text-muted-alt"
          >
            {["center", "top", "bottom", "left", "right"].map((anchor) => <option key={anchor}>{anchor}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Overscan" value={display.overscan ?? 1} step={0.01} onChange={(overscan) => onChange({ ...display, overscan })} />
        <NumberField label="Rotation (rad)" value={display.rotation ?? 0} step={0.05} onChange={(rotation) => onChange({ ...display, rotation })} />
        <NumberField label="Opacity" value={display.opacity ?? 1} step={0.05} onChange={(opacity) => onChange({ ...display, opacity })} />
      </div>
      <Label className="text-[10px] text-text-muted">Normalized crop (x / y / width / height)</Label>
      <div className="grid grid-cols-4 gap-1">
        {(["x", "y", "w", "h"] as const).map((key) => (
          <Input key={key} type="number" min={0} max={1} step={0.01} value={crop[key]}
            onChange={(e) => onChange({ ...display, crop: { ...crop, [key]: Number(e.target.value) } })}
            className="h-7 border-border-subtle bg-bg-surface px-1 text-[10px] text-text-muted-alt" />
        ))}
      </div>
      <Button size="sm" variant="outline" className="h-6 w-full font-mono text-[9px]"
        onClick={() => onChange({ fit: "cover", anchor: "center", overscan: 1, opacity: 1 })}>
        Reset display
      </Button>
    </div>
  );
}

function surfaceSourceLabel(node: SetNode, assets: Asset[]): string {
  if (node.kind === "primitive") {
    const id = node.shape === "plane" ? node.textureAssetId : node.material.mapAssetId;
    return assets.find((asset) => asset.id === id)?.name ?? "No image assigned";
  }
  if (node.kind !== "videofeed") return "No source";
  switch (node.source.type) {
    case "none":
      return "No signal";
    case "url": {
      const url = node.source.url;
      return assets.find((asset) => asset.src === url)?.name ?? url;
    }
    case "device":
      return "Live capture device";
    case "screen":
      return "Screen/window share";
    case "program":
      return "Programme output";
    case "preview":
      return "Preview output";
  }
}

/** Set-level slot browser. Operators should not need to double-click through
 * nested geometry just to discover that a wall accepts branding or media. */
function SurfaceSlotsManager({
  sceneId,
  layerId,
  nodes,
}: {
  sceneId: ID;
  layerId: ID;
  nodes: SetNode[];
}) {
  const project = useDocStore((state) => state.project);
  const updateSetNode = useDocStore((state) => state.updateSetNode);
  const selectSetNode = useDocStore((state) => state.selectSetNode);
  const addSetNode = useDocStore((state) => state.addSetNode);
  const assets = project?.assets ?? [];
  const videoAssets = assets.filter((asset) => asset.kind === "video");
  const slots = flattenSetNodes(nodes).filter(
    (node) => node.slotKind || node.kind === "videofeed",
  );

  return (
    <div className="space-y-2">
      <p className="font-mono text-[9px] leading-relaxed text-text-muted">
        Assign logos, stills, clips, live cameras, Programme or Preview here. Select Configure for crop,
        material and advanced source controls.
      </p>
      {slots.length === 0 && (
        <div className="rounded border border-dashed border-border-subtle p-2 font-mono text-[9px] text-text-muted">
          This older set has no authored slots yet. Add a branding or media panel below.
        </div>
      )}
      {slots.map((slot) => {
        const isImageSurface = slot.kind === "primitive";
        const imageId =
          slot.kind === "primitive"
            ? slot.shape === "plane"
              ? slot.textureAssetId
              : slot.material.mapAssetId
            : undefined;
        return (
          <div key={slot.id} className="space-y-2 rounded border border-border-subtle bg-bg-panel/80 p-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10px] font-semibold text-text-bright">
                  {slot.slotLabel ?? slot.name}
                </div>
                <div className="truncate font-mono text-[8px] uppercase tracking-wide text-text-muted">
                  {slot.slotKind ?? (slot.kind === "videofeed" ? "media" : "surface")} · {surfaceSourceLabel(slot, assets)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateSetNode(sceneId, layerId, slot.id, { visible: !slot.visible })}
                className={`rounded border px-1.5 py-1 font-mono text-[8px] ${
                  slot.visible
                    ? "border-accent-blue text-accent-blue-bright"
                    : "border-border-subtle text-text-muted"
                }`}
              >
                {slot.visible ? "VISIBLE" : "HIDDEN"}
              </button>
              <button
                type="button"
                onClick={() => selectSetNode(slot.id)}
                className="rounded border border-border-subtle px-1.5 py-1 font-mono text-[8px] text-text-muted-alt hover:border-accent-blue"
              >
                CONFIGURE
              </button>
            </div>

            {isImageSurface && slot.kind === "primitive" && (
              <TextureSlotEditor
                label={slot.slotKind === "branding" ? "Logo / branding image" : "Surface image"}
                assetId={imageId}
                assets={assets}
                onChoose={(assetId) =>
                  updateSetNode(
                    sceneId,
                    layerId,
                    slot.id,
                    slot.shape === "plane"
                      ? {
                          textureAssetId: assetId,
                          visible: true,
                          material: { ...slot.material, color: "#ffffff", metalness: 0, roughness: 1 },
                        }
                      : {
                          visible: true,
                          material: { ...slot.material, mapAssetId: assetId },
                        },
                  )
                }
                onClear={() =>
                  updateSetNode(
                    sceneId,
                    layerId,
                    slot.id,
                    slot.shape === "plane"
                      ? { textureAssetId: undefined }
                      : { material: { ...slot.material, mapAssetId: undefined } },
                  )
                }
              />
            )}

            {slot.kind === "videofeed" && (
              <label className="block space-y-1">
                <span className="font-mono text-[9px] text-text-muted">Quick source</span>
                <select
                  value={
                    slot.source.type === "url"
                      ? slot.source.url
                      : slot.source.type
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    const source =
                      value === "none" || value === "program" || value === "preview" || value === "screen"
                        ? ({ type: value } as const)
                        : ({ type: "url", url: value } as const);
                    updateSetNode(sceneId, layerId, slot.id, { source, visible: true });
                  }}
                  className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-2 font-mono text-[9px] text-text-muted-alt"
                >
                  <option value="none">Off / no signal</option>
                  {slot.source.type === "device" && <option value="device">Live capture device</option>}
                  <option value="screen">Screen/window share</option>
                  <option value="program">Programme output</option>
                  <option value="preview">Preview output</option>
                  {videoAssets.map((asset) => (
                    <option key={asset.id} value={asset.src}>{asset.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 font-mono text-[9px]"
          onClick={() =>
            addSetNode(
              sceneId,
              layerId,
              createBrandingSurfaceNode({
                name: "Branding Panel",
                slotLabel: "Branding Panel",
                transform: { position: vec3(0, 2.2, -4), scale: vec3(3.2, 1.2, 1) },
              }),
            )
          }
        >
          + BRANDING PANEL
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 font-mono text-[9px]"
          onClick={() =>
            addSetNode(
              sceneId,
              layerId,
              createMediaSurfaceNode({
                name: "Media Panel",
                label: "MEDIA PANEL",
                transform: { position: vec3(0, 2.2, -4) },
                width: 3.2,
                height: 1.8,
              }),
            )
          }
        >
          + MEDIA PANEL
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SetNodeInspector({
  sceneId,
  layerId,
  node,
}: {
  sceneId: ID;
  layerId: ID;
  node: SetNode;
}) {
  const updateSetNode = useDocStore((s) => s.updateSetNode);
  const commitNodeTransform = useDocStore((s) => s.commitNodeTransform);
  const setActiveSetCamera = useDocStore((s) => s.setActiveSetCamera);
  const project = useDocStore((s) => s.project);

  const setField = (updates: Partial<SetNode>) => updateSetNode(sceneId, layerId, node.id, updates);
  const setTransform = (updates: Partial<Transform3D>) =>
    commitNodeTransform(sceneId, layerId, node.id, { ...node.transform, ...updates });

  const layer = project?.scenes.find((s) => s.id === sceneId)?.layers.find((l) => l.id === layerId);
  const activeCameraId = layer?.props.kind === "set3d" ? layer.props.activeCameraId : null;

  return (
    <div className="h-full overflow-y-auto text-xs">
      <div className="space-y-1 border-b border-border-subtle p-2">
        <Label className="text-[10px] text-text-muted">
          Node <span className="uppercase">({SET_NODE_INSPECTOR_DEFINITIONS[node.kind].label})</span>
        </Label>
        <Input
          value={node.name}
          onChange={(e) => setField({ name: e.target.value })}
          className="h-7 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
        />
      </div>

      <Section title="Transform">
        <Vec3Fields label="Position" value={node.transform.position} onChange={(v) => setTransform({ position: v })} />
        <Vec3Fields label="Rotation (°)" value={node.transform.rotation} step={1} onChange={(v) => setTransform({ rotation: v })} />
        <Vec3Fields label="Scale" value={node.transform.scale} onChange={(v) => setTransform({ scale: v })} />
      </Section>

      {node.kind === "primitive" && (
        <Section title="Material">
          <ColorField label="Color" value={node.material.color} onChange={(v) => setField({ material: { ...node.material, color: v } })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Metalness" value={node.material.metalness} step={0.05} onChange={(v) => setField({ material: { ...node.material, metalness: v } })} />
            <NumberField label="Roughness" value={node.material.roughness} step={0.05} onChange={(v) => setField({ material: { ...node.material, roughness: v } })} />
            <NumberField label="Emissive int." value={node.material.emissiveIntensity ?? 0} step={0.1} onChange={(v) => setField({ material: { ...node.material, emissiveIntensity: v, emissive: node.material.emissive ?? node.material.color } })} />
            <NumberField label="Opacity" value={node.material.opacity ?? 1} step={0.05} onChange={(v) => setField({ material: { ...node.material, opacity: v } })} />
            <NumberField
              label="Clearcoat"
              value={node.material.clearcoat ?? 0}
              step={0.05}
              onChange={(v) => setField({ material: { ...node.material, clearcoat: v, usePhysical: v > 0 || node.material.usePhysical } })}
            />
            <NumberField
              label="Clearcoat rough"
              value={node.material.clearcoatRoughness ?? 0.25}
              step={0.05}
              onChange={(v) => setField({ material: { ...node.material, clearcoatRoughness: v } })}
            />
            <NumberField
              label="Env intensity"
              value={node.material.envMapIntensity ?? 1}
              step={0.05}
              onChange={(v) => setField({ material: { ...node.material, envMapIntensity: v } })}
            />
            <NumberField label="Transmission" value={node.material.transmission ?? 0} step={0.05}
              onChange={(transmission) => setField({ material: { ...node.material, transmission, usePhysical: transmission > 0 || node.material.usePhysical } })} />
            <NumberField label="Thickness" value={node.material.thickness ?? 0} step={0.01}
              onChange={(thickness) => setField({ material: { ...node.material, thickness } })} />
            <NumberField label="IOR" value={node.material.ior ?? 1.5} step={0.01}
              onChange={(ior) => setField({ material: { ...node.material, ior } })} />
          </div>
          <ColorField label="Emissive" value={node.material.emissive ?? "#000000"} onChange={(v) => setField({ material: { ...node.material, emissive: v } })} />
          <Toggle
            label="Physical material (clearcoat path)"
            checked={!!node.material.usePhysical || (node.material.clearcoat ?? 0) > 0}
            onChange={(v) => setField({ material: { ...node.material, usePhysical: v } })}
          />
          {(node.shape === "box" || node.shape === "roundedBox") && (
            <Toggle
              label="Desk planar reflector (High tier, maxCount 2)"
              checked={!!node.reflector}
              onChange={(v) => setField({ reflector: v })}
            />
          )}
          <TextureSlotEditor
            assetId={node.textureAssetId}
            assets={project?.assets ?? []}
            onChoose={(assetId) => {
              const updates: Partial<SetNode> = {
                textureAssetId: assetId,
                material: { ...node.material, color: "#ffffff", metalness: 0, roughness: 1 },
              };
              setField(updates);
            }}
            onClear={() => setField({ textureAssetId: undefined })}
          />
          <TextureSlotEditor label="Albedo map" assetId={node.material.mapAssetId} assets={project?.assets ?? []}
            onChoose={(mapAssetId) => setField({ material: { ...node.material, mapAssetId } })}
            onClear={() => setField({ material: { ...node.material, mapAssetId: undefined } })} />
          <TextureSlotEditor label="Normal map" assetId={node.material.normalMapAssetId} assets={project?.assets ?? []}
            onChoose={(normalMapAssetId) => setField({ material: { ...node.material, normalMapAssetId } })}
            onClear={() => setField({ material: { ...node.material, normalMapAssetId: undefined } })} />
          <TextureSlotEditor label="Packed ORM map" assetId={node.material.ormMapAssetId} assets={project?.assets ?? []}
            onChoose={(ormMapAssetId) => setField({ material: { ...node.material, ormMapAssetId } })}
            onClear={() => setField({ material: { ...node.material, ormMapAssetId: undefined } })} />
          <Vec3Fields
            label="Texture scale (X/Y)"
            value={{ x: node.material.textureScale?.x ?? 1, y: node.material.textureScale?.y ?? 1, z: 1 }}
            onChange={(v) => setField({ material: { ...node.material, textureScale: { x: v.x, y: v.y } } })}
          />
        </Section>
      )}

      {node.kind === "primitive" && node.shape === "plane" && (
        <Section title="Intelligent Surface">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[10px] text-text-muted">
              <span>Slot kind</span>
              <select value={node.slotKind ?? "branding"} onChange={(e) => setField({ slotKind: e.target.value as typeof node.slotKind })}
                className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-1 font-mono text-text-muted-alt">
                <option value="branding">Branding</option><option value="media">Media</option><option value="data">Data</option>
              </select>
            </label>
            <label className="space-y-1 text-[10px] text-text-muted">
              <span>Slot label</span>
              <Input value={node.slotLabel ?? node.name} onChange={(e) => setField({ slotLabel: e.target.value })}
                className="h-7 border-border-subtle bg-bg-surface text-text-muted-alt" />
            </label>
          </div>
          <SurfaceDisplayEditor value={node.display} onChange={(display) => setField({ display })} />
          {(() => {
            const asset = project?.assets.find((a) => a.id === node.textureAssetId);
            if (!asset?.imageWidth || !asset.imageHeight) return <p className="font-mono text-[9px] text-text-muted">Assign an image to see resolution diagnostics.</p>;
            const tier = layer?.props.kind === "set3d" ? (layer.props.render.qualityTier ?? "low") : "low";
            const diagnosis = analyseSurfaceResolution(asset.imageWidth, asset.imageHeight, 1920, 1080, tier);
            return <p className={`font-mono text-[9px] ${diagnosis.undersized ? "text-amber-400" : "text-text-muted"}`}>
              {asset.imageWidth}×{asset.imageHeight} · {tier} budget {diagnosis.budget}px
              {diagnosis.undersized ? " · source may soften on air" : diagnosis.oversized ? " · optimized variant used" : " · suitable"}
            </p>;
          })()}
        </Section>
      )}

      {node.kind === "light" && (
        <Section title="Light">
          <ColorField label="Color" value={node.color} onChange={(v) => setField({ color: v })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Intensity" value={node.intensity} step={1} onChange={(v) => setField({ intensity: v })} />
            {node.lightType === "spot" && (
              <>
                <NumberField label="Angle (°)" value={node.angle ?? 35} step={1} onChange={(v) => setField({ angle: v })} />
                <NumberField label="Penumbra" value={node.penumbra ?? 0.5} step={0.05} onChange={(v) => setField({ penumbra: v })} />
              </>
            )}
          </div>
          <Toggle
            label="Cast shadows (enable Shadows in set Render section)"
            checked={node.castShadow}
            onChange={(v) => setField({ castShadow: v })}
          />
        </Section>
      )}

      {node.kind === "camera" && (
        <Section title="Camera">
          <NumberField label="Field of view (°)" value={node.fov} step={1} onChange={(v) => setField({ fov: v })} />
          <button
            onClick={() => setActiveSetCamera(sceneId, layerId, activeCameraId === node.id ? null : node.id)}
            className={`w-full rounded border px-2 py-1.5 font-mono text-[10px] ${
              activeCameraId === node.id
                ? "border-live-red text-live-red"
                : "border-border-subtle text-text-muted-alt hover:border-accent-blue"
            }`}
          >
            {activeCameraId === node.id ? "● PROGRAM CAMERA (click to release)" : "Set as program camera"}
          </button>
        </Section>
      )}

      {node.kind === "videofeed" && (
        <>
          <Section title="Surface">
            <div className="space-y-1">
              <Label className="text-[10px] text-text-muted">Label</Label>
              <Input
                value={node.label}
                onChange={(e) => setField({ label: e.target.value })}
                className="h-7 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[10px] text-text-muted">
                <span>Slot kind</span>
                <select
                  value={node.slotKind ?? "media"}
                  onChange={(event) => setField({ slotKind: event.target.value as typeof node.slotKind })}
                  className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-1 font-mono text-text-muted-alt"
                >
                  <option value="branding">Branding</option>
                  <option value="media">Media</option>
                  <option value="data">Data</option>
                </select>
              </label>
              <label className="space-y-1 text-[10px] text-text-muted">
                <span>Inspector name</span>
                <Input
                  value={node.slotLabel ?? node.label}
                  onChange={(event) => setField({ slotLabel: event.target.value })}
                  className="h-7 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
                />
              </label>
            </div>
            <SurfaceDisplayEditor value={node.display} onChange={(display) => setField({ display })} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Width (m)" value={node.width} step={0.1} onChange={(v) => setField({ width: v })} />
              <NumberField label="Height (m)" value={node.height} step={0.1} onChange={(v) => setField({ height: v })} />
            </div>
          </Section>
          <Section title="Source">
            <VideoSourceEditor source={node.source} onChange={(source) => setField({ source })} />
          </Section>
          <Section title="Audio" defaultOpen={false}>
            <AudioControls
              volume={node.volume ?? 1}
              muted={node.muted ?? false}
              onChange={(updates) => setField(updates)}
            />
          </Section>
          <Section title="Green Screen (Chroma Key)" defaultOpen={!!node.chromaKey?.enabled}>
            {(() => {
              const ck = node.chromaKey ?? { enabled: false, color: "#00b140", similarity: 0.32, smoothness: 0.08, spill: 0.5 };
              const setCk = (updates: Partial<typeof ck>) => setField({ chromaKey: { ...ck, ...updates } });
              return (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 font-mono text-[10px] text-text-muted-alt">
                    <input
                      type="checkbox"
                      checked={ck.enabled}
                      onChange={(e) => setCk({ enabled: e.target.checked })}
                      className="accent-[#4a90d9]"
                    />
                    Key out background — feed becomes a cutout in the studio
                  </label>
                  <div className="flex gap-1">
                    {(
                      [
                        { id: "color", label: "COLOR KEY", tip: "Classic green/blue screen (needs a physical screen)" },
                        { id: "segment", label: "AI MATTE", tip: "Person segmentation — NO green screen needed (small on-device model, runs offline)" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={m.tip}
                        onClick={() => setCk({ mode: m.id })}
                        className={`flex-1 rounded border px-1.5 py-1 font-mono text-[9px] font-bold ${
                          (ck.mode ?? "color") === m.id
                            ? "border-accent-blue bg-accent-blue/15 text-accent-blue-bright"
                            : "border-border-subtle text-text-muted-alt hover:border-accent-blue"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {/* Screen color and spill only exist for a physical screen;
                      in AI MATTE the same sliders act as matte choke/feather
                      (see the shader's mask branch) and are labeled so. */}
                  {(ck.mode ?? "color") === "color" && (
                    <ColorField label="Screen color" value={ck.color} onChange={(color) => setCk({ color })} />
                  )}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-text-muted">
                      {(ck.mode ?? "color") === "segment"
                        ? `Matte choke (${ck.similarity.toFixed(2)}) — higher trims background halo, lower keeps hair`
                        : `Similarity (${ck.similarity.toFixed(2)})`}
                    </Label>
                    <input
                      type="range"
                      min={0.02}
                      max={0.8}
                      step={0.01}
                      value={ck.similarity}
                      onChange={(e) => setCk({ similarity: Number(e.target.value) })}
                      className="h-1 w-full accent-[#4a90d9]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-text-muted">
                      {(ck.mode ?? "color") === "segment"
                        ? `Edge feather (${ck.smoothness.toFixed(2)})`
                        : `Edge smoothness (${ck.smoothness.toFixed(2)})`}
                    </Label>
                    <input
                      type="range"
                      min={0.0}
                      max={0.4}
                      step={0.01}
                      value={ck.smoothness}
                      onChange={(e) => setCk({ smoothness: Number(e.target.value) })}
                      className="h-1 w-full accent-[#4a90d9]"
                    />
                  </div>
                  <div className={(ck.mode ?? "color") === "segment" ? "hidden" : "space-y-1"}>
                    <Label className="text-[10px] text-text-muted">
                      Spill suppression ({(ck.spill ?? 0.5).toFixed(2)}) — removes the green tint on edges
                    </Label>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={ck.spill ?? 0.5}
                      onChange={(e) => setCk({ spill: Number(e.target.value) })}
                      className="h-1 w-full accent-[#4a90d9]"
                    />
                  </div>
                </div>
              );
            })()}
          </Section>
        </>
      )}

      {node.kind === "text3d" && (
        <Section title="Text">
          <div className="space-y-1">
            <Label className="text-[10px] text-text-muted">Text</Label>
            <Input
              value={node.text}
              onChange={(e) => setField({ text: e.target.value })}
              className="h-7 border-border-subtle bg-bg-surface text-text-muted-alt"
            />
          </div>
          <NumberField label="Size (m)" value={node.fontSize} step={0.05} onChange={(v) => setField({ fontSize: v })} />
          <ColorField label="Color" value={node.color} onChange={(v) => setField({ color: v })} />
        </Section>
      )}

      {node.kind === "model" && (
        <Section title="Model">
          <div className="font-mono text-[10px] text-text-muted">
            Imported asset:{" "}
            <span className="text-text-muted-alt">
              {project?.assets.find((a) => a.id === node.assetId)?.name ?? "(missing asset)"}
            </span>
          </div>
        </Section>
      )}
    </div>
  );
}

/** Environment + render quality for the whole set — shown when the active
 * layer is a set3d layer with no node selected. */
export function SetSettingsInspector({ sceneId, layer }: { sceneId: ID; layer: Layer }) {
  const setSetEnvironment = useDocStore((s) => s.setSetEnvironment);
  const setSetRenderSettings = useDocStore((s) => s.setSetRenderSettings);
  const project = useDocStore((s) => s.project);

  if (layer.props.kind !== "set3d") return null;
  const { environment, render } = layer.props;
  const id = layer.id;
  const imageAssets = project?.assets.filter((a) => a.kind === "image") ?? [];

  return (
    <div className="h-full overflow-y-auto text-xs">
      <div className="border-b border-border-subtle p-2 font-mono text-text-muted-alt">
        {layer.name} <span className="text-text-muted">(3D set)</span>
      </div>

      <Section title="Branding & Media Surfaces">
        <SurfaceSlotsManager sceneId={sceneId} layerId={id} nodes={layer.props.nodes} />
      </Section>

      <Section title="Environment">
        <ColorField
          label="Background"
          value={environment.background === "transparent" ? "#000000" : environment.background}
          onChange={(v) => setSetEnvironment(sceneId, id, { background: v })}
        />
        <Toggle
          label="Transparent background (key over other layers)"
          checked={environment.background === "transparent"}
          onChange={(v) => setSetEnvironment(sceneId, id, { background: v ? "transparent" : "#050510" })}
        />
        <Toggle label="Grid" checked={environment.grid} onChange={(v) => setSetEnvironment(sceneId, id, { grid: v })} />
        <ColorField
          label="Ambient color"
          value={environment.ambient.color}
          onChange={(v) => setSetEnvironment(sceneId, id, { ambient: { ...environment.ambient, color: v } })}
        />
        <NumberField
          label="Ambient intensity"
          value={environment.ambient.intensity}
          step={0.05}
          onChange={(v) => setSetEnvironment(sceneId, id, { ambient: { ...environment.ambient, intensity: v } })}
        />
      </Section>

      <Section title="Floor">
        <Toggle
          label="Floor"
          checked={environment.floor.enabled}
          onChange={(v) => setSetEnvironment(sceneId, id, { floor: { ...environment.floor, enabled: v } })}
        />
        {environment.floor.enabled && (
          <>
            <ColorField
              label="Color"
              value={environment.floor.color}
              onChange={(v) => setSetEnvironment(sceneId, id, { floor: { ...environment.floor, color: v } })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Size (m)"
                value={environment.floor.size}
                onChange={(v) => setSetEnvironment(sceneId, id, { floor: { ...environment.floor, size: v } })}
              />
              <NumberField
                label="Roughness"
                value={environment.floor.roughness}
                step={0.05}
                onChange={(v) => setSetEnvironment(sceneId, id, { floor: { ...environment.floor, roughness: v } })}
              />
              <NumberField
                label="Metalness"
                value={environment.floor.metalness}
                step={0.05}
                onChange={(v) => setSetEnvironment(sceneId, id, { floor: { ...environment.floor, metalness: v } })}
              />
            </div>
            <Toggle
              label="Planar reflections (Med+; floor mirror)"
              checked={environment.floor.reflector?.enabled ?? !!render.planarReflection?.enabled}
              onChange={(v) =>
                setSetEnvironment(sceneId, id, {
                  floor: {
                    ...environment.floor,
                    reflector: {
                      enabled: v,
                      resolution: 512,
                      mixStrength: 0.55,
                      mirror: 0.35,
                      ...environment.floor.reflector,
                    },
                  },
                })
              }
            />
            {environment.floor.reflector?.enabled && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Reflect RT"
                  value={environment.floor.reflector.resolution ?? 512}
                  step={64}
                  onChange={(v) =>
                    setSetEnvironment(sceneId, id, {
                      floor: {
                        ...environment.floor,
                        reflector: { ...environment.floor.reflector!, resolution: Math.min(Math.max(v, 128), 2048) },
                      },
                    })
                  }
                />
                <NumberField
                  label="Mix strength"
                  value={environment.floor.reflector.mixStrength ?? 0.55}
                  step={0.05}
                  onChange={(v) =>
                    setSetEnvironment(sceneId, id, {
                      floor: { ...environment.floor, reflector: { ...environment.floor.reflector!, mixStrength: v } },
                    })
                  }
                />
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Render Quality">
        <div className="space-y-1">
          <Label className="text-[10px] text-text-muted">Quality tier</Label>
          {/* Machine auto-detection: one click sizes this set to the real
              GPU/cores of THIS machine (see detectMachineProfile). */}
          {(() => {
            const profile = detectMachineProfile();
            return (
              <button
                type="button"
                onClick={() => setSetRenderSettings(sceneId, id, settingsForQualityTier(profile.tier))}
                title={`Detected: ${profile.gpu} · ${profile.cores} cores${profile.memoryGb ? ` · ${profile.memoryGb}GB+` : ""}`}
                className={`w-full rounded border px-1 py-1 font-mono text-[10px] ${
                  render.qualityTier === profile.tier
                    ? "border-accent-blue bg-accent-blue/10 text-accent-blue-bright"
                    : "border-border-subtle text-text-muted-alt hover:border-accent-blue"
                }`}
              >
                AUTO — this machine: {profile.tier.toUpperCase()}
              </button>
            );
          })()}
          <div className="grid grid-cols-3 gap-1">
            {(["low", "medium", "high"] as QualityTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setSetRenderSettings(sceneId, id, settingsForQualityTier(tier))}
                className={`rounded border px-1 py-1 font-mono text-[10px] capitalize ${
                  (render.qualityTier ?? "medium") === tier
                    ? "border-accent-blue text-accent-blue-bright"
                    : "border-border-subtle text-text-muted-alt hover:border-accent-blue/50"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Exposure" value={render.exposure} step={0.1} onChange={(v) => setSetRenderSettings(sceneId, id, { exposure: v })} />
          <NumberField
            label="Resolution scale"
            value={render.dpr}
            step={0.25}
            onChange={(v) => setSetRenderSettings(sceneId, id, { dpr: Math.min(Math.max(v, 0.5), 2) })}
          />
        </div>
        <Toggle
          label="Shadows (costs GPU — off for small machines)"
          checked={render.shadows}
          onChange={(v) => setSetRenderSettings(sceneId, id, { shadows: v })}
        />
      </Section>

      <Section title="Realism">
        <Toggle
          label="Contact shadows (soft shadow blob under the set)"
          checked={render.contactShadows?.enabled ?? true}
          onChange={(v) =>
            setSetRenderSettings(sceneId, id, {
              contactShadows: { opacity: 0.4, blur: 2, ...render.contactShadows, enabled: v },
            })
          }
        />
        {render.contactShadows?.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Opacity"
              value={render.contactShadows.opacity}
              step={0.05}
              onChange={(v) => setSetRenderSettings(sceneId, id, { contactShadows: { ...render.contactShadows!, opacity: v } })}
            />
            <NumberField
              label="Blur"
              value={render.contactShadows.blur}
              step={0.25}
              onChange={(v) => setSetRenderSettings(sceneId, id, { contactShadows: { ...render.contactShadows!, blur: v } })}
            />
          </div>
        )}
        <Toggle
          label="Environment lighting (offline PBR reflections)"
          checked={render.envLight?.enabled ?? true}
          onChange={(v) =>
            setSetRenderSettings(sceneId, id, { envLight: { intensity: 0.35, ...render.envLight, enabled: v } })
          }
        />
        {render.envLight?.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Intensity"
              value={render.envLight.intensity}
              step={0.05}
              onChange={(v) => setSetRenderSettings(sceneId, id, { envLight: { ...render.envLight!, intensity: v } })}
            />
            <NumberField
              label="Env bake res"
              value={render.envResolution ?? 128}
              step={32}
              onChange={(v) => setSetRenderSettings(sceneId, id, { envResolution: Math.min(Math.max(v, 16), 512) })}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-[10px] text-text-muted">Local cubemap (image asset)</Label>
          <select
            value={render.envCubemapAssetId ?? ""}
            onChange={(e) =>
              setSetRenderSettings(sceneId, id, {
                envCubemapAssetId: e.target.value || undefined,
              })
            }
            className="h-7 w-full rounded border border-border-subtle bg-bg-surface px-2 font-mono text-[10px] text-text-muted-alt"
          >
            <option value="">— Lightformers only —</option>
            {imageAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Toggle
          label="Planar reflections gate (tier still applies)"
          checked={render.planarReflection?.enabled ?? true}
          onChange={(v) =>
            setSetRenderSettings(sceneId, id, {
              planarReflection: { maxCount: 1, ...render.planarReflection, enabled: v },
            })
          }
        />
        {render.qualityTier === "high" && (
          <Toggle
            label="Desk planar (maxCount 2 — floor + desk)"
            checked={render.planarReflection?.maxCount === 2}
            onChange={(v) =>
              setSetRenderSettings(sceneId, id, {
                planarReflection: { enabled: true, ...render.planarReflection, maxCount: v ? 2 : 1 },
              })
            }
          />
        )}
        <Toggle
          label="SSR (High tier — realism-effects)"
          checked={!!render.ssr?.enabled && render.qualityTier === "high"}
          onChange={(v) => {
            if (v && render.qualityTier !== "high") {
              setSetRenderSettings(sceneId, id, { ...settingsForQualityTier("high"), ssr: { enabled: true } });
            } else {
              setSetRenderSettings(sceneId, id, { ssr: { enabled: v } });
            }
          }}
        />
        <Toggle
          label="Ambient occlusion (costs a full-screen pass — off for small machines)"
          checked={render.ao?.enabled ?? false}
          onChange={(v) => setSetRenderSettings(sceneId, id, { ao: { intensity: 1, ...render.ao, enabled: v } })}
        />
        {render.ao?.enabled && (
          <NumberField
            label="Intensity"
            value={render.ao.intensity}
            step={0.1}
            onChange={(v) => setSetRenderSettings(sceneId, id, { ao: { ...render.ao!, intensity: v } })}
          />
        )}
      </Section>

      <Section title="Effects">
        <Toggle
          label="Bloom"
          checked={render.bloom.enabled}
          onChange={(v) => setSetRenderSettings(sceneId, id, { bloom: { ...render.bloom, enabled: v } })}
        />
        {render.bloom.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Intensity"
              value={render.bloom.intensity}
              step={0.1}
              onChange={(v) => setSetRenderSettings(sceneId, id, { bloom: { ...render.bloom, intensity: v } })}
            />
            <NumberField
              label="Threshold"
              value={render.bloom.threshold}
              step={0.05}
              onChange={(v) => setSetRenderSettings(sceneId, id, { bloom: { ...render.bloom, threshold: v } })}
            />
          </div>
        )}
        <Toggle
          label="Vignette"
          checked={render.vignette.enabled}
          onChange={(v) => setSetRenderSettings(sceneId, id, { vignette: { ...render.vignette, enabled: v } })}
        />
        {render.vignette.enabled && (
          <NumberField
            label="Darkness"
            value={render.vignette.darkness}
            step={0.05}
            onChange={(v) => setSetRenderSettings(sceneId, id, { vignette: { ...render.vignette, darkness: v } })}
          />
        )}
      </Section>

      <Section title="AR Backplate">
        <div className="font-mono text-[10px] text-text-muted-alt">
          {environment.backplate && environment.backplate.type !== "none"
            ? `Active: ${environment.backplate.type}`
            : "Off (studio background)"}
        </div>
      </Section>
    </div>
  );
}
