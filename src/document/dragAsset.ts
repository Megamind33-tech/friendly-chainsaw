/**
 * Drag-and-drop protocol between the Asset Browser and the GFX canvas
 * (Phase 5.11) — a native HTML5 drag carrying just enough to place the
 * right kind of element at the drop point. Kept to a tiny shared module so
 * the drag source (AssetBrowserPanel) and drop target (GfxEditor) can't
 * drift on the payload shape.
 */
export const ASSET_DRAG_MIME = "application/x-broadcast-asset";

export interface AssetDragPayload {
  assetId: string;
  kind: "image" | "lottie";
}

export function serializeAssetDrag(payload: AssetDragPayload): string {
  return JSON.stringify(payload);
}

export function parseAssetDrag(raw: string): AssetDragPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.assetId === "string" && (parsed.kind === "image" || parsed.kind === "lottie")) {
      return parsed as AssetDragPayload;
    }
  } catch {
    /* not our payload */
  }
  return null;
}
