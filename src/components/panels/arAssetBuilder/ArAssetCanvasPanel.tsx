import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Rect, Transformer, Line } from "react-konva";
import type Konva from "konva";
import { useArAssetBuilder } from "@/ar-asset-builder/useArAssetBuilder";
import { useBitmap } from "@/components/gfx/imageCache";
import { SafeAreas } from "@/components/gfx/SafeAreas";
import { Set3dEditor } from "@/components/set3d/Set3dEditor";
import { useGestureHistory } from "@/document/gestureHistory";
import {
  MousePointer2, Move, Crop,
  Grid3x3, ZoomIn, ZoomOut, Layers, Box,
} from "lucide-react";

const TOOLS = [
  { id: "select" as const, icon: MousePointer2, label: "Select" },
  { id: "move" as const, icon: Move, label: "Move" },
  { id: "crop" as const, icon: Crop, label: "Crop" },
];

function LayerImage({ url, layer, selected, onSelect, onTransformEnd }: {
  url: string;
  layer: { id: string; transform: { x: number; y: number; width: number; height: number; rotation: number; opacity: number }; locked: boolean };
  selected: boolean;
  onSelect: () => void;
  onTransformEnd: (t: { x: number; y: number; width: number; height: number; rotation: number }) => void;
}) {
  const bitmap = useBitmap(url);
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, bitmap.image]);

  return (
  <>
    <KonvaImage
      ref={shapeRef}
      image={bitmap.image ?? undefined}
      x={layer.transform.x}
      y={layer.transform.y}
      width={layer.transform.width}
      height={layer.transform.height}
      rotation={layer.transform.rotation}
      opacity={layer.transform.opacity}
      draggable={!layer.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        onTransformEnd({
          x: e.target.x(),
          y: e.target.y(),
          width: layer.transform.width,
          height: layer.transform.height,
          rotation: layer.transform.rotation,
        });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onTransformEnd({
          x: node.x(),
          y: node.y(),
          width: Math.max(10, node.width() * scaleX),
          height: Math.max(10, node.height() * scaleY),
          rotation: node.rotation(),
        });
      }}
    />
    {selected && <Transformer ref={trRef} />}
  </>
  );
}

/**
 * AR Asset Builder — center canvas: 2D editing, 2.5D depth view, 3D preview.
 */
export function ArAssetCanvasPanel() {
  const builder = useArAssetBuilder();
  const { activeAsset, session, project, ar } = builder;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 450 });
  const { beginGesture, endGesture } = useGestureHistory();

  const resolution = project?.resolution ?? { width: 1920, height: 1080 };
  const scale = Math.min(size.width / resolution.width, size.height / resolution.height) * session.zoom;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!activeAsset) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        for (const id of session.selectedLayerIds) builder.removeLayer(id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        for (const id of session.selectedLayerIds) {
          const layer = activeAsset.layers.find((l) => l.id === id);
          if (layer) builder.addLayer(`${layer.name} Copy`);
        }
      }
    },
    [activeAsset, session.selectedLayerIds, builder],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!project) return <div className="p-3 font-mono text-xs text-text-muted">Loading...</div>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-deepest">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-base px-2">
        <span className="mr-2 font-mono text-[10px] font-bold tracking-wide text-text-muted-alt">ASSET BUILDER</span>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => session.setActiveTool(t.id)}
            title={t.label}
            className={`rounded p-1 ${session.activeTool === t.id ? "bg-accent-blue/20 text-accent-blue-bright" : "text-text-muted hover:text-text-bright"}`}
          >
            <t.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border-subtle" />
        <button onClick={() => builder.removeBackground()} disabled={session.bgRemovalBusy || !activeAsset} title="Remove background" className="rounded border border-border-subtle px-2 py-0.5 font-mono text-[9px] text-text-muted-alt hover:border-accent-blue disabled:opacity-40">
          {session.bgRemovalBusy ? "Processing..." : "Remove BG"}
        </button>
        <button onClick={() => builder.applyAdjustments()} disabled={!activeAsset} className="rounded border border-border-subtle px-2 py-0.5 font-mono text-[9px] text-text-muted-alt hover:border-accent-blue disabled:opacity-40">
          Apply Adjust
        </button>
        <button onClick={() => builder.distributeDepth()} disabled={!activeAsset || (activeAsset?.layers.length ?? 0) < 2} className="rounded border border-border-subtle px-2 py-0.5 font-mono text-[9px] text-text-muted-alt hover:border-accent-blue disabled:opacity-40">
          Depth Stack
        </button>
        <div className="ml-auto flex items-center gap-1">
          {(["2d", "25d", "3d"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => session.setViewMode(mode)}
              className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase ${
                session.viewMode === mode ? "border-accent-blue text-accent-blue-bright" : "border-border-subtle text-text-muted"
              }`}
            >
              {mode}
            </button>
          ))}
          <button onClick={() => session.setShowGrid(!session.showGrid)} className={`p-1 ${session.showGrid ? "text-accent-blue-bright" : "text-text-muted"}`} title="Toggle grid">
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => session.setZoom(session.zoom * 1.2)} className="p-1 text-text-muted"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => session.setZoom(session.zoom / 1.2)} className="p-1 text-text-muted"><ZoomOut className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {session.bgRemovalProgress && (
        <div className="shrink-0 border-b border-border-subtle bg-bg-panel px-3 py-1">
          <div className="font-mono text-[9px] text-text-muted">{session.bgRemovalProgress.phase}</div>
          <div className="mt-0.5 h-1 rounded bg-bg-deepest">
            <div className="h-full rounded bg-accent-blue transition-all" style={{ width: `${session.bgRemovalProgress.progress * 100}%` }} />
          </div>
        </div>
      )}

      <div ref={containerRef} className="relative min-h-0 flex-1">
        {!activeAsset ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Layers className="h-8 w-8 text-text-muted" />
            <div className="font-mono text-sm text-text-muted-alt">Select or import an asset to edit</div>
            <button onClick={() => document.querySelector<HTMLInputElement>('[type="file"]')?.click()} className="rounded border border-accent-blue px-3 py-1.5 font-mono text-xs text-accent-blue-bright">
              Import Image
            </button>
          </div>
        ) : session.viewMode === "3d" && ar.scene && ar.layer ? (
          <div className="h-full">
            <Set3dEditor sceneId={ar.scene.id} layer={ar.layer} editableNodeIds={ar.arNodeIds} />
          </div>
        ) : (
          <div className="flex h-full">
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <Stage
                width={size.width}
                height={size.height}
                scaleX={scale}
                scaleY={scale}
                x={session.panX + (size.width - resolution.width * scale) / 2}
                y={session.panY + (size.height - resolution.height * scale) / 2}
                onMouseDown={() => beginGesture()}
                onMouseUp={() => endGesture(() => {})}
              >
                <KonvaLayer>
                  {/* Checkerboard transparency preview */}
                  <Rect x={0} y={0} width={resolution.width} height={resolution.height} fill="#1a1a2e" listening={false} />
                  {session.showGrid && (
                    <>
                      {Array.from({ length: Math.ceil(resolution.width / 40) }).map((_, i) => (
                        <Line key={`v${i}`} points={[i * 40, 0, i * 40, resolution.height]} stroke="#2a2a4a" strokeWidth={0.5} listening={false} />
                      ))}
                      {Array.from({ length: Math.ceil(resolution.height / 40) }).map((_, i) => (
                        <Line key={`h${i}`} points={[0, i * 40, resolution.width, i * 40]} stroke="#2a2a4a" strokeWidth={0.5} listening={false} />
                      ))}
                    </>
                  )}
                  {session.showSafeAreas && <SafeAreas width={resolution.width} height={resolution.height} />}
                  {activeAsset.layers.filter((l) => l.visible).map((layer) => {
                    const imgAsset = layer.imageAssetId ? project.assets.find((a) => a.id === layer.imageAssetId) : null;
                    if (!imgAsset) return null;
                    const zOffset = session.viewMode === "25d" ? layer.transform.zDepth * 200 : 0;
                    return (
                      <LayerImage
                        key={layer.id}
                        url={imgAsset.src}
                        layer={{ ...layer, transform: { ...layer.transform, x: layer.transform.x + zOffset * 0.5, y: layer.transform.y - zOffset * 0.3 } }}
                        selected={session.selectedLayerIds.includes(layer.id)}
                        onSelect={() => session.selectLayer(layer.id)}
                        onTransformEnd={(t) => builder.updateLayer(layer.id, { transform: { ...layer.transform, ...t } })}
                      />
                    );
                  })}
                  {session.activeTool === "crop" && session.cropRect && (
                    <Rect
                      x={session.cropRect.x}
                      y={session.cropRect.y}
                      width={session.cropRect.width}
                      height={session.cropRect.height}
                      stroke="#4a90d9"
                      strokeWidth={2}
                      dash={[4, 4]}
                      listening={false}
                    />
                  )}
                </KonvaLayer>
              </Stage>
            </div>

            {/* Layer list sidebar */}
            <div className="w-44 shrink-0 overflow-y-auto border-l border-border-subtle bg-bg-base p-2">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-wide text-text-muted">Layered Parts</div>
              {activeAsset.layers.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => session.selectLayer(layer.id)}
                  className={`mb-1 flex w-full items-center gap-1 rounded border px-1.5 py-1 text-left font-mono text-[9px] ${
                    session.selectedLayerIds.includes(layer.id)
                      ? "border-accent-blue bg-accent-blue/10 text-accent-blue-bright"
                      : "border-border-subtle text-text-muted-alt"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${layer.visible ? "bg-accent-blue" : "bg-text-muted"}`} />
                  <span className="truncate">{layer.name}</span>
                  {layer.segmentationConfidence !== undefined && (
                    <span className="ml-auto text-[8px] text-text-muted">{Math.round(layer.segmentationConfidence * 100)}%</span>
                  )}
                </button>
              ))}
              <button onClick={() => builder.addLayer("New Layer")} className="mt-2 w-full rounded border border-dashed border-border-subtle py-1 font-mono text-[9px] text-text-muted hover:border-accent-blue">
                + Add Layer
              </button>
            </div>

            {/* 3D preview inset */}
            {session.viewMode !== "3d" && ar.scene && ar.layer && (
              <div className="absolute bottom-3 right-48 h-28 w-40 overflow-hidden rounded border border-border-subtle bg-bg-deepest shadow-lg">
                <div className="flex h-5 items-center gap-1 border-b border-border-subtle bg-bg-base px-1.5">
                  <Box className="h-2.5 w-2.5 text-text-muted" />
                  <span className="font-mono text-[8px] text-text-muted">3D Preview</span>
                </div>
                <div className="h-[calc(100%-20px)]">
                  <Set3dEditor sceneId={ar.scene.id} layer={ar.layer} editableNodeIds={new Set()} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {(session.statusMessage || session.errorMessage) && (
        <div className={`shrink-0 border-t px-3 py-1 font-mono text-[9px] ${session.errorMessage ? "border-live-red/50 text-live-red" : "border-border-subtle text-text-muted"}`}>
          {session.errorMessage ?? session.statusMessage}
        </div>
      )}
    </div>
  );
}
