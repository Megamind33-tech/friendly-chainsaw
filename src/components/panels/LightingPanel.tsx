import { useEffect, useState } from "react";
import { useDocStore } from "@/document/store";
import { createLightNode } from "@/document/factory";
import { newId } from "@/document/ids";
import {
  kelvinToHex,
  LIGHTING_PRESETS,
  loadUserLightingPresets,
  saveUserLightingPresets,
} from "@/sets/lightingPresets";
import type { LightingPreset, SavedLightingPreset } from "@/sets/lightingPresets";
import type { ID, Layer, LightNode, SetNode, Transform3D } from "@/document/types";
import { Input } from "@/components/ui/input";
import { Lightbulb, Trash2, Save } from "lucide-react";

/**
 * Lighting console for the active scene's virtual set(s) — live control over
 * every light node already in the set, one-click built-in rigs, and
 * operator-saved custom rigs. Same "cards, never dropdowns" + fresh-ids-on-
 * apply discipline as TemplatesPanel/userTemplates.ts, and the same
 * commitNodeTransform/updateSetNode wiring CamerasPanel and SetInspector use
 * so this panel can never disagree with the viewport gizmo.
 */

interface LightRef {
  layer: Layer;
  light: LightNode;
}

function collectLights(nodes: SetNode[], layer: Layer, out: LightRef[]) {
  for (const node of nodes) {
    if (node.kind === "light") out.push({ layer, light: node });
    if (node.kind === "group") collectLights(node.children, layer, out);
  }
}

/** Slider + number input pair — same scrub-or-type convention as
 * CamerasPanel's AxisControl, duplicated locally since it isn't exported. */
function AxisControl({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 font-mono text-[9px] uppercase text-text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 accent-[#4a90d9]"
      />
      <Input
        type="number"
        step={step}
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-16 shrink-0 border-border-subtle bg-bg-surface px-1 text-[10px] text-text-muted-alt"
      />
    </div>
  );
}

/** Rebuilds a light node through the factory with a fresh id, copying every
 * authored field — used when applying a saved preset so applied lights never
 * collide with an id already in the document. */
function rebuildLight(saved: LightNode): LightNode {
  return createLightNode(saved.lightType, {
    name: saved.name,
    transform: saved.transform,
    visible: saved.visible,
    locked: saved.locked,
    role: saved.role,
    color: saved.color,
    intensity: saved.intensity,
    angle: saved.angle,
    penumbra: saved.penumbra,
    distance: saved.distance,
    castShadow: saved.castShadow,
  });
}

function LightRow({ sceneId, layer, light }: { sceneId: ID; layer: Layer; light: LightNode }) {
  const updateSetNode = useDocStore((s) => s.updateSetNode);
  const commitNodeTransform = useDocStore((s) => s.commitNodeTransform);
  const removeSetNode = useDocStore((s) => s.removeSetNode);
  const selectSetNode = useDocStore((s) => s.selectSetNode);
  // The document only stores the resolved hex color, not the kelvin value
  // that produced it — this slider is a write-only control, seeded from a
  // sensible daylight default rather than reverse-mapped from the color.
  const [kelvin, setKelvin] = useState(5600);

  const t = light.transform;
  const setTransform = (updates: Partial<Transform3D>) =>
    commitNodeTransform(sceneId, layer.id, light.id, { ...t, ...updates });
  // LightNode-specific fields (color/intensity/angle/penumbra/distance/
  // castShadow) aren't part of the common SetNode union intersection that
  // Partial<SetNode> exposes — cast at the call site, same as ARPanel.tsx's
  // updateNode(...) does for CameraNode-specific fields like `fov`.
  const setLightField = (updates: Partial<Pick<LightNode, "color" | "intensity" | "angle" | "penumbra" | "distance" | "castShadow">>) =>
    updateSetNode(sceneId, layer.id, light.id, updates as Partial<SetNode>);

  return (
    <div className="rounded border border-border-subtle bg-bg-panel" onClick={() => selectSetNode(light.id)}>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Input
          value={light.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateSetNode(sceneId, layer.id, light.id, { name: e.target.value })}
          className="h-6 min-w-0 flex-1 border-transparent bg-transparent px-1 font-mono text-[11px] text-text-muted-alt focus:border-border-subtle focus:bg-bg-surface"
        />
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[9px] uppercase text-text-muted">
          {light.lightType}
        </span>
        <input
          type="color"
          value={light.color}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setLightField({ color: e.target.value })}
          className="h-6 w-8 shrink-0 rounded border border-border-subtle bg-transparent"
          title="Light color"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeSetNode(sceneId, layer.id, light.id);
          }}
          title="Delete light"
          className="rounded p-1 text-text-muted hover:bg-live-red/20 hover:text-live-red"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1 border-t border-border-subtle px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <AxisControl
          label="Intensity"
          value={light.intensity}
          min={0}
          max={100}
          step={0.5}
          onChange={(v) => setLightField({ intensity: v })}
        />
        <AxisControl
          label="Temp (K)"
          value={kelvin}
          min={2700}
          max={8000}
          step={50}
          onChange={(v) => {
            setKelvin(v);
            setLightField({ color: kelvinToHex(v) });
          }}
        />
        <AxisControl label="X" value={t.position.x} min={-20} max={20} onChange={(v) => setTransform({ position: { ...t.position, x: v } })} />
        <AxisControl label="Y" value={t.position.y} min={0} max={15} onChange={(v) => setTransform({ position: { ...t.position, y: v } })} />
        <AxisControl label="Z" value={t.position.z} min={-20} max={20} onChange={(v) => setTransform({ position: { ...t.position, z: v } })} />
        <label className="flex items-center gap-2 font-mono text-[10px] text-text-muted-alt">
          <input
            type="checkbox"
            checked={light.castShadow}
            onChange={(e) => setLightField({ castShadow: e.target.checked })}
            className="accent-[#4a90d9]"
          />
          Cast shadows
        </label>
      </div>
    </div>
  );
}

function PresetCard({ preset, onApply }: { preset: LightingPreset; onApply: () => void }) {
  return (
    <button
      onClick={onApply}
      title={`Replaces this set's lights with the ${preset.label} rig`}
      className="group rounded border border-border-subtle bg-bg-panel p-1.5 text-left hover:border-accent-blue"
    >
      <div className="flex items-center gap-1">
        <Lightbulb className="h-3 w-3 text-text-muted group-hover:text-accent-blue-bright" />
        <span className="flex-1 truncate font-mono text-[11px] text-text-muted-alt group-hover:text-accent-blue-bright">
          {preset.label}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-[9px] leading-tight text-text-muted">{preset.description}</div>
    </button>
  );
}

function LightingLayerSection({
  sceneId,
  layer,
  savedPresets,
  setSavedPresets,
}: {
  sceneId: ID;
  layer: Layer;
  savedPresets: SavedLightingPreset[];
  setSavedPresets: (presets: SavedLightingPreset[]) => void;
}) {
  const addSetNode = useDocStore((s) => s.addSetNode);
  const removeSetNode = useDocStore((s) => s.removeSetNode);
  const [savingName, setSavingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const lights: LightRef[] = [];
  if (layer.props.kind === "set3d") collectLights(layer.props.nodes, layer, lights);

  const replaceLights = (newLights: LightNode[]) => {
    for (const { light } of lights) removeSetNode(sceneId, layer.id, light.id);
    for (const light of newLights) addSetNode(sceneId, layer.id, light);
  };

  const persistPresets = (next: SavedLightingPreset[]) => {
    setSavedPresets(next);
    saveUserLightingPresets(next).catch((err) => console.error("failed to save lighting presets", err));
  };

  const commitSave = () => {
    const name = nameDraft.trim();
    if (!name) return;
    const entry: SavedLightingPreset = { id: newId(), name, lights: lights.map((r) => r.light) };
    persistPresets([...savedPresets, entry]);
    setSavingName(false);
    setNameDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Lightbulb className="h-3 w-3 text-text-muted" />
        <span className="flex-1 truncate font-mono text-[9px] uppercase tracking-wider text-text-muted">
          {layer.name}
        </span>
      </div>

      {/* Current lights. */}
      <div className="space-y-1.5">
        <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Current Lights</div>
        {lights.length === 0 && (
          <div className="rounded border border-dashed border-border-subtle p-2 font-mono text-[10px] text-text-muted">
            No lights in this set yet.
          </div>
        )}
        {lights.map(({ light }) => (
          <LightRow key={light.id} sceneId={sceneId} layer={layer} light={light} />
        ))}
      </div>

      {/* Built-in preset rigs. */}
      <div className="space-y-1.5">
        <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Preset Rigs</div>
        <div className="grid grid-cols-2 gap-2">
          {LIGHTING_PRESETS.map((preset) => (
            <PresetCard key={preset.id} preset={preset} onApply={() => replaceLights(preset.build())} />
          ))}
        </div>
      </div>

      {/* Operator-saved rigs. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">Saved Presets</span>
          {!savingName && (
            <button
              onClick={() => setSavingName(true)}
              disabled={lights.length === 0}
              title="Save this set's current lights as a reusable preset"
              className="flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright disabled:opacity-40"
            >
              <Save className="h-3 w-3" /> Save current lights
            </button>
          )}
        </div>

        {savingName && (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={nameDraft}
              placeholder="Preset name"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSave();
                if (e.key === "Escape") {
                  setSavingName(false);
                  setNameDraft("");
                }
              }}
              className="h-6 flex-1 border-border-subtle bg-bg-surface px-1 font-mono text-[10px] text-text-muted-alt"
            />
            <button
              onClick={commitSave}
              className="rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
            >
              Save
            </button>
          </div>
        )}

        {savedPresets.length === 0 && !savingName && (
          <div className="rounded border border-dashed border-border-subtle p-2 font-mono text-[10px] text-text-muted">
            No saved presets yet.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {savedPresets.map((preset) => (
            <div key={preset.id} className="group relative rounded border border-border-subtle bg-bg-panel p-1.5">
              <button
                onClick={() => replaceLights(preset.lights.map(rebuildLight))}
                title={`Replaces this set's lights with the saved "${preset.name}" rig`}
                className="w-full text-left"
              >
                <div className="flex items-center gap-1">
                  <Lightbulb className="h-3 w-3 text-text-muted group-hover:text-accent-blue-bright" />
                  <span className="flex-1 truncate font-mono text-[11px] text-text-muted-alt group-hover:text-accent-blue-bright">
                    {preset.name}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-text-muted">
                  {preset.lights.length} light{preset.lights.length === 1 ? "" : "s"}
                </div>
              </button>
              <button
                onClick={() => persistPresets(savedPresets.filter((p) => p.id !== preset.id))}
                title="Delete saved preset"
                className="absolute right-1 top-1 rounded bg-bg-deepest/80 p-1 text-text-muted opacity-0 hover:bg-live-red/30 hover:text-live-red group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LightingPanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const [savedPresets, setSavedPresets] = useState<SavedLightingPreset[]>([]);

  useEffect(() => {
    loadUserLightingPresets()
      .then(setSavedPresets)
      .catch((err) => console.error("failed to load lighting presets", err));
  }, []);

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  if (!project || !scene) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  const setLayers = scene.layers.filter((l) => l.props.kind === "set3d");
  if (setLayers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center font-mono text-[10px] text-text-muted">
        No 3D set in this scene.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-2 text-xs">
      {setLayers.map((layer) => (
        <LightingLayerSection
          key={layer.id}
          sceneId={scene.id}
          layer={layer}
          savedPresets={savedPresets}
          setSavedPresets={setSavedPresets}
        />
      ))}
    </div>
  );
}
