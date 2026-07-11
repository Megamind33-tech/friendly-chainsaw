import { useArAssetBuilder } from "@/ar-asset-builder/useArAssetBuilder";
import { AR_ASSET_TYPES } from "@/ar-asset-builder/constants";
import { buildDataValues, useDataStore } from "@/document/dataSources";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown } from "lucide-react";

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="border-b border-border-subtle">
      <summary className="flex cursor-pointer items-center gap-1 px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-text-muted-alt hover:text-text-bright">
        <ChevronDown className="h-3 w-3" />
        {title}
      </summary>
      <div className="space-y-2 px-2 pb-2">{children}</div>
    </details>
  );
}

function NumInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 font-mono text-[9px] text-text-muted">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-16 rounded border border-border-subtle bg-bg-panel px-1 py-0.5 text-right text-[9px] text-text-bright"
      />
    </label>
  );
}

/**
 * AR Asset Builder — right inspector: transform, appearance, materials, depth, bindings, export.
 */
export function ArAssetInspectorPanel() {
  const builder = useArAssetBuilder();
  const { activeAsset, selectedLayers, session } = builder;
  const dataValues = useDataStore(useShallow(buildDataValues));
  const layer = selectedLayers[0];
  const dataKeys = Object.keys(dataValues).sort();

  if (!activeAsset) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-deepest p-4 font-mono text-xs text-text-muted">
        Select an asset to inspect
      </div>
    );
  }

  const showExtrusion = ["extruded-logo", "3d-card"].includes(activeAsset.type) || activeAsset.depthSettings?.mode === "extruded";
  const showCard3d = activeAsset.type === "3d-card" || activeAsset.depthSettings?.mode === "card3d";
  const showBindings = activeAsset.bindings.length > 0 || ["election-result-bar", "stat-panel", "scoreboard-element", "weather-symbol"].includes(activeAsset.type);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-deepest text-xs">
      <div className="shrink-0 border-b border-border-subtle p-2">
        <input
          value={activeAsset.name}
          onChange={(e) => builder.patchAsset({ name: e.target.value })}
          className="w-full rounded border border-border-subtle bg-bg-panel px-2 py-1 font-mono text-[11px] text-text-bright"
        />
        <div className="mt-1 flex gap-1">
          <select
            value={activeAsset.type}
            onChange={(e) => builder.patchAsset({ type: e.target.value as typeof activeAsset.type })}
            className="flex-1 rounded border border-border-subtle bg-bg-panel px-1 py-0.5 font-mono text-[9px] text-text-muted-alt"
          >
            {AR_ASSET_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <span className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase ${
            activeAsset.lifecycle === "live" ? "border-live-red text-live-red" :
            activeAsset.lifecycle === "ready" ? "border-accent-blue text-accent-blue-bright" :
            "border-border-subtle text-text-muted"
          }`}>
            {activeAsset.lifecycle}
          </span>
        </div>
      </div>

      {layer && (
        <Section title="Transform">
          <NumInput label="X" value={layer.transform.x} onChange={(x) => builder.updateLayer(layer.id, { transform: { ...layer.transform, x } })} />
          <NumInput label="Y" value={layer.transform.y} onChange={(y) => builder.updateLayer(layer.id, { transform: { ...layer.transform, y } })} />
          <NumInput label="Width" value={layer.transform.width} onChange={(width) => builder.updateLayer(layer.id, { transform: { ...layer.transform, width } })} />
          <NumInput label="Height" value={layer.transform.height} onChange={(height) => builder.updateLayer(layer.id, { transform: { ...layer.transform, height } })} />
          <NumInput label="Rotation" value={layer.transform.rotation} onChange={(rotation) => builder.updateLayer(layer.id, { transform: { ...layer.transform, rotation } })} step={1} />
          <NumInput label="Z Depth" value={layer.transform.zDepth} onChange={(zDepth) => builder.updateLayer(layer.id, { transform: { ...layer.transform, zDepth } })} step={0.01} />
          <NumInput label="Opacity" value={layer.transform.opacity} onChange={(opacity) => builder.updateLayer(layer.id, { transform: { ...layer.transform, opacity } })} step={0.05} />
        </Section>
      )}

      <Section title="Image Adjustments">
        <NumInput label="Brightness" value={session.adjustments.brightness} onChange={(brightness) => session.setAdjustments({ brightness })} />
        <NumInput label="Contrast" value={session.adjustments.contrast} onChange={(contrast) => session.setAdjustments({ contrast })} />
        <NumInput label="Saturation" value={session.adjustments.saturation} onChange={(saturation) => session.setAdjustments({ saturation })} />
      </Section>

      {showExtrusion && (
        <Section title="Extrusion">
          <NumInput label="Depth" value={activeAsset.extrusionSettings?.depth ?? 0.08} onChange={(depth) => builder.patchAsset({ extrusionSettings: { ...activeAsset.extrusionSettings!, depth } })} step={0.01} />
          <NumInput label="Bevel" value={activeAsset.extrusionSettings?.bevel ?? 0.01} onChange={(bevel) => builder.patchAsset({ extrusionSettings: { ...activeAsset.extrusionSettings!, bevel } })} step={0.005} />
        </Section>
      )}

      {showCard3d && (
        <Section title="3D Card">
          <NumInput label="Thickness" value={activeAsset.card3dSettings?.thickness ?? 0.02} onChange={(thickness) => builder.patchAsset({ card3dSettings: { ...activeAsset.card3dSettings!, thickness } })} step={0.005} />
          <NumInput label="Corner Radius" value={activeAsset.card3dSettings?.cornerRadius ?? 0.01} onChange={(cornerRadius) => builder.patchAsset({ card3dSettings: { ...activeAsset.card3dSettings!, cornerRadius } })} step={0.005} />
          <NumInput label="Reflection" value={activeAsset.card3dSettings?.reflection ?? 0.3} onChange={(reflection) => builder.patchAsset({ card3dSettings: { ...activeAsset.card3dSettings!, reflection } })} step={0.05} />
        </Section>
      )}

      <Section title="Shadows">
        <label className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
          <input type="checkbox" checked={activeAsset.shadowSettings?.enabled ?? true} onChange={(e) => builder.patchAsset({ shadowSettings: { ...activeAsset.shadowSettings!, enabled: e.target.checked } })} />
          Enable shadow
        </label>
        <NumInput label="Intensity" value={activeAsset.shadowSettings?.intensity ?? 0.6} onChange={(intensity) => builder.patchAsset({ shadowSettings: { ...activeAsset.shadowSettings!, intensity } })} step={0.05} />
      </Section>

      <Section title="Depth">
        <select
          value={activeAsset.depthSettings?.mode ?? "flat"}
          onChange={(e) => builder.patchAsset({ depthSettings: { ...activeAsset.depthSettings!, mode: e.target.value as "flat" | "layered25d" | "card3d" | "extruded" | "displacement" } })}
          className="w-full rounded border border-border-subtle bg-bg-panel px-1 py-1 font-mono text-[9px]"
        >
          <option value="flat">Flat</option>
          <option value="layered25d">Layered 2.5D</option>
          <option value="card3d">3D Card</option>
          <option value="extruded">Extruded</option>
          <option value="displacement">Displacement</option>
        </select>
        <NumInput label="Depth Spacing" value={activeAsset.depthSettings?.spacing ?? 0.06} onChange={(spacing) => builder.patchAsset({ depthSettings: { ...activeAsset.depthSettings!, spacing } })} step={0.01} />
      </Section>

      {showBindings && (
        <Section title="Data Binding">
          {activeAsset.bindings.map((b, i) => (
            <div key={i} className="rounded border border-border-subtle bg-bg-panel p-1.5 font-mono text-[8px]">
              <div className="text-accent-blue-bright">{b.targetPath}</div>
              <div className="text-text-muted">← {b.source}</div>
              {b.fallback !== undefined && <div className="text-text-muted">fallback: {String(b.fallback)}</div>}
            </div>
          ))}
          <div className="flex gap-1">
            <select id="bind-source" className="flex-1 rounded border border-border-subtle bg-bg-panel px-1 py-0.5 font-mono text-[8px]">
              {dataKeys.slice(0, 30).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById("bind-source") as HTMLSelectElement;
                const layerId = layer?.id ?? "states";
                builder.addBinding(`layers.${layerId}.text`, sel.value, "—");
              }}
              className="rounded border border-accent-blue px-1.5 py-0.5 font-mono text-[8px] text-accent-blue-bright"
            >
              Bind
            </button>
          </div>
        </Section>
      )}

      <Section title="AR Anchoring">
        <select
          value={activeAsset.anchors.anchorType}
          onChange={(e) => builder.patchAsset({ anchors: { ...activeAsset.anchors, anchorType: e.target.value as typeof activeAsset.anchors.anchorType } })}
          className="w-full rounded border border-border-subtle bg-bg-panel px-1 py-1 font-mono text-[9px]"
        >
          <option value="ground">Ground Anchor</option>
          <option value="screen">Screen Anchor</option>
          <option value="camera">Camera Relative</option>
          <option value="virtual-set">Virtual Set</option>
          <option value="manual">Manual</option>
        </select>
        <label className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
          <input type="checkbox" checked={activeAsset.anchors.faceCamera} onChange={(e) => builder.patchAsset({ anchors: { ...activeAsset.anchors, faceCamera: e.target.checked } })} />
          Face camera
        </label>
        <label className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
          <input type="checkbox" checked={activeAsset.anchors.safeAreaConstraint} onChange={(e) => builder.patchAsset({ anchors: { ...activeAsset.anchors, safeAreaConstraint: e.target.checked } })} />
          Safe area constraint
        </label>
      </Section>

      <Section title="Export" defaultOpen={false}>
        {builder.availableExports.map((fmt) => (
          <button
            key={fmt}
            onClick={() => builder.exportAsset(fmt)}
            className="w-full rounded border border-border-subtle py-1 font-mono text-[9px] text-text-muted-alt hover:border-accent-blue"
          >
            Export {fmt === "smart-asset" ? "Smart Asset" : fmt.toUpperCase()}
          </button>
        ))}
      </Section>

      <div className="mt-auto shrink-0 space-y-1 border-t border-border-subtle p-2">
        <button onClick={() => builder.setLifecycle("preview")} className="w-full rounded border border-border-subtle py-1.5 font-mono text-[10px] text-text-muted-alt hover:border-accent-blue">
          Preview
        </button>
        <button onClick={() => builder.setLifecycle("ready")} className="w-full rounded border border-accent-blue py-1.5 font-mono text-[10px] text-accent-blue-bright hover:bg-accent-blue/10">
          Mark Ready
        </button>
        <button onClick={() => builder.placeInArScene()} className="w-full rounded border border-stripe-active py-1.5 font-mono text-[10px] text-text-bright hover:bg-stripe-active/10">
          Place in AR Scene
        </button>
        <button onClick={() => builder.takeLive()} className="w-full rounded border border-live-red/60 py-1.5 font-mono text-[10px] text-live-red hover:bg-live-red/10">
          Take Live
        </button>
      </div>
    </div>
  );
}
