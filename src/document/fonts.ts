import { useEffect } from "react";
import type { Asset } from "./types";

/**
 * Custom-font registration (Phase 5.9). Konva/canvas text only renders a
 * font once it's actually loaded into `document.fonts` — referencing a
 * family name alone does nothing. This registers every `font` asset exactly
 * once (by url) via the FontFace API, in every window that touches the
 * project (editor, Program, Preview all call `useRegisterFonts`
 * independently since each is a separate top-level document).
 */

const registered = new Set<string>();

/** Idempotent: safe to call for the same asset from multiple components. */
export async function registerFontAsset(asset: Asset): Promise<void> {
  if (asset.kind !== "font" || !asset.family || registered.has(asset.src)) return;
  registered.add(asset.src);
  try {
    const face = new FontFace(asset.family, `url(${asset.src})`);
    await face.load();
    document.fonts.add(face);
  } catch (err) {
    // A failed font load must not crash rendering — text falls back to
    // whatever fontFamily string was authored, same as a missing web font.
    registered.delete(asset.src);
    console.error(`font failed to load: ${asset.name}`, err);
  }
}

/** Registers every font asset in the project once on mount/change. */
export function useRegisterFonts(assets: Asset[] | undefined): void {
  useEffect(() => {
    for (const asset of assets ?? []) {
      if (asset.kind === "font") void registerFontAsset(asset);
    }
  }, [assets]);
}
