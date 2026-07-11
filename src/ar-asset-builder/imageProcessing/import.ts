import { uploadAssetFile, generateImageThumbnail } from "@/components/set3d/assetImport";
import { newId } from "@/document/ids";
import type { Asset } from "@/document/types";
import { MAX_IMAGE_BYTES, SUPPORTED_IMAGE_EXTENSIONS } from "../constants";
import { detectTransparency } from "./chromaKey";

export interface ImageImportResult {
  asset: Asset;
  hasTransparency: boolean;
  dimensions: { width: number; height: number };
}

export function validateImageFile(file: File): { ok: true } | { ok: false; error: string } {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `Unsupported format: ${ext}. Supported: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty" };
  }
  return { ok: true };
}

export async function decodeImageDimensions(url: string): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode image"));
  });
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new Error("Image has zero dimensions — file may be corrupt");
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export async function importImageForArAsset(file: File): Promise<ImageImportResult> {
  const validation = validateImageFile(file);
  if (!validation.ok) throw new Error(validation.error);

  const { url } = await uploadAssetFile(file);
  let dimensions: { width: number; height: number };
  try {
    dimensions = await decodeImageDimensions(url);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to decode image");
  }

  const hasTransparency = await detectTransparency(url);
  const thumbResult = await generateImageThumbnail(url);

  const asset: Asset = {
    id: newId(),
    kind: "image",
    name: file.name.replace(/\.[^.]+$/, ""),
    src: url,
    thumbnail: thumbResult.dataUrl,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
  };

  return { asset, hasTransparency, dimensions };
}

export async function importDataUrlAsAsset(
  dataUrl: string,
  name: string,
  role: "working" | "mask" | "original" = "working",
): Promise<Asset> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
  const file = new File([blob], `${name}-${role}.${ext}`, { type: blob.type });
  const { url } = await uploadAssetFile(file);
  const dimensions = await decodeImageDimensions(url);
  const thumbResult = await generateImageThumbnail(url);
  return {
    id: newId(),
    kind: "image",
    name: `${name} (${role})`,
    src: url,
    thumbnail: thumbResult.dataUrl,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
  };
}

export async function generateThumbnailFromAsset(asset: Asset): Promise<string> {
  if (asset.thumbnail) return asset.thumbnail;
  const result = await generateImageThumbnail(asset.src);
  return result.dataUrl;
}

export async function importFromClipboard(): Promise<File | null> {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          return new File([blob], `clipboard-${Date.now()}.png`, { type });
        }
      }
    }
  } catch {
    // Clipboard API may be unavailable
  }
  return null;
}
