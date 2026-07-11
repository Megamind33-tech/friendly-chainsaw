/**
 * Drag-and-drop protocol between the AR Builder palette and the AR stage —
 * same tiny-shared-module discipline as document/dragAsset.ts: the drag
 * source (ArPalettePanel) and the drop target (ArStagePanel) share one
 * payload shape and can't drift.
 */
export const AR_ITEM_DRAG_MIME = "application/x-ar-builder-item";

export interface ArItemDragPayload {
  /** Id of a BUILDER_ITEMS entry (see ar-engine/builderKit.ts). */
  itemId: string;
}

export function serializeArItemDrag(payload: ArItemDragPayload): string {
  return JSON.stringify(payload);
}

export function parseArItemDrag(raw: string): ArItemDragPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.itemId === "string") return parsed as ArItemDragPayload;
  } catch {
    /* not our payload */
  }
  return null;
}

/** Drag protocol for AR Asset Builder assets → AR Stage. */
export const AR_ASSET_DRAG_MIME = "application/x-ar-builder-asset";

export interface ArAssetDragPayload {
  assetId: string;
}

export function serializeArAssetDrag(payload: ArAssetDragPayload): string {
  return JSON.stringify(payload);
}

export function parseArAssetDrag(raw: string): ArAssetDragPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.assetId === "string") return parsed as ArAssetDragPayload;
  } catch {
    /* not our payload */
  }
  return null;
}
