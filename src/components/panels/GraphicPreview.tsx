import { memo, useMemo } from "react";
import { Stage, Layer as KonvaLayer } from "react-konva";
import { useDataStore, buildDataValues } from "@/document/dataSources";
import { resolveElements } from "@/document/bindings";
import { renderElement } from "@/components/gfx/renderNodes";
import { PREVIEW_THUMB_PX } from "@/components/ui/broadcast";
import type { Element, Layer } from "@/document/types";

/**
 * Real, smart-cropped render of a gfx2d layer at **square** card scale —
 * shared by Templates + Assets Graphics tab. Never a wide 16:9 bar.
 */

const PREVIEW_SIZE = PREVIEW_THUMB_PX;

/** Bounding box of the layer's visible content — a lower third fills its
 * card instead of sitting as a sliver at the bottom of an empty frame. */
function contentBounds(elements: Element[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (!el.visible) continue;
    minX = Math.min(minX, el.transform.x);
    minY = Math.min(minY, el.transform.y);
    maxX = Math.max(maxX, el.transform.x + el.transform.width);
    maxY = Math.max(maxY, el.transform.y + el.transform.height);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 1920, h: 1080 };
  const pad = 40;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(1920, maxX + pad) - x, h: Math.min(1080, maxY + pad) - y };
}

export const GraphicPreview = memo(function GraphicPreview({ layer }: { layer: Layer }) {
  // PERFORMANCE-CRITICAL: previews take a one-time SNAPSHOT of data values.
  // Subscribing live (the old `useDataStore(useShallow(buildDataValues))`)
  // meant the ticking clock feed re-resolved and re-rendered EVERY preview
  // card's full Konva stage EVERY SECOND — dozens of hidden renders/sec that
  // dragged the whole app on small machines. A thumbnail doesn't need a
  // live clock; the on-air renderers keep their live subscriptions.
  const dataValues = useMemo(() => buildDataValues(useDataStore.getState()), []);
  const resolved = useMemo(
    () => (layer.props.kind === "gfx2d" ? resolveElements(layer.props.elements, dataValues) : []),
    [layer, dataValues],
  );
  if (layer.props.kind !== "gfx2d") return null;
  const bounds = contentBounds(layer.props.elements);
  const scale = Math.min(PREVIEW_SIZE / bounds.w, PREVIEW_SIZE / bounds.h);
  const offsetX = -bounds.x * scale + (PREVIEW_SIZE - bounds.w * scale) / 2;
  const offsetY = -bounds.y * scale + (PREVIEW_SIZE - bounds.h * scale) / 2;
  return (
    <div
      className="mx-auto overflow-hidden rounded bg-bg-deepest"
      style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, maxWidth: "100%" }}
    >
      <Stage width={PREVIEW_SIZE} height={PREVIEW_SIZE} scaleX={scale} scaleY={scale} x={offsetX} y={offsetY} listening={false}>
        <KonvaLayer listening={false}>
          {resolved.map((el) => renderElement(el, { interactive: false, assets: [] }))}
        </KonvaLayer>
      </Stage>
    </div>
  );
})
