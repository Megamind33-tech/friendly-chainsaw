import { memo, useMemo } from "react";
import { Stage, Layer as KonvaLayer } from "react-konva";
import { useDocStore } from "@/document/store";
import { renderElement } from "@/components/gfx/renderNodes";
import { SHAPE_PRESETS, type ShapePreset } from "@/graphics/shapes";
import type { Element, ID } from "@/document/types";

const CARD_W = 104;
const CARD_H = 60;

/** Fits a single preset element into a card, smart-cropped to its box.
 * Wrapped in memo: `preset` is a stable reference from the module-level
 * SHAPE_PRESETS array, so any ShapesPanel re-render (e.g. from unrelated
 * docStore changes) skips re-rendering every card's Konva stage. */
const ShapeCardPreview = memo(function ShapeCardPreview({ preset }: { preset: ShapePreset }) {
  const el = useMemo(() => preset.build(600, 300), [preset]);
  const b = el.transform;
  const pad = 12;
  const scale = Math.min(CARD_W / (b.width + pad * 2), CARD_H / (b.height + pad * 2));
  const offsetX = -(b.x - pad) * scale;
  const offsetY = -(b.y - pad) * scale;
  return (
    <div className="overflow-hidden rounded" style={{ width: CARD_W, height: CARD_H, background: "linear-gradient(135deg,#141a2e,#0a0e1c)" }}>
      <Stage width={CARD_W} height={CARD_H} scaleX={scale} scaleY={scale} x={offsetX} y={offsetY} listening={false}>
        <KonvaLayer listening={false}>{renderElement(el, { interactive: false, assets: [] })}</KonvaLayer>
      </Stage>
    </div>
  );
})

const CATEGORIES = ["Basic", "Broadcast", "Accents"] as const;

/**
 * Shapes & presets library — a growing arsenal of customizable 2D building
 * blocks (native rect/text/group elements, no external assets). Clicking a
 * card drops the preset into the active gfx2d layer at canvas centre, fully
 * editable and (for multi-part presets) pre-grouped for uniform moving.
 */
export function ShapesPanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const activeLayerId = useDocStore((s) => s.activeLayerId);
  const addLayer = useDocStore((s) => s.addLayer);
  const addElement = useDocStore((s) => s.addElement);
  const setActiveLayer = useDocStore((s) => s.setActiveLayer);

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];

  if (!project || !scene) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  const insert = (preset: ShapePreset) => {
    const active = scene.layers.find((l) => l.id === activeLayerId);
    let layerId: ID | null = active?.props.kind === "gfx2d" ? active.id : null;
    if (!layerId) layerId = [...scene.layers].reverse().find((l) => l.props.kind === "gfx2d")?.id ?? null;
    if (!layerId) layerId = addLayer(scene.id, "gfx2d");
    const el: Element = preset.build(project.resolution.width / 2, project.resolution.height / 2);
    setActiveLayer(layerId);
    addElement(scene.id, layerId, el);
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto bg-bg-deepest p-2 text-xs">
      {CATEGORIES.map((cat) => (
        <div key={cat} className="flex flex-col gap-1.5">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{cat}</div>
          <div className="grid grid-cols-2 gap-2">
            {SHAPE_PRESETS.filter((p) => p.category === cat).map((preset) => (
              <button
                key={preset.id}
                onClick={() => insert(preset)}
                title={`Insert ${preset.label} — fully editable, drops into the active layer`}
                className="group flex flex-col items-center gap-1 rounded border border-border-subtle bg-bg-panel p-1.5 hover:border-accent-blue"
              >
                <ShapeCardPreview preset={preset} />
                <span className="font-mono text-[10px] text-text-muted-alt group-hover:text-accent-blue-bright">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
