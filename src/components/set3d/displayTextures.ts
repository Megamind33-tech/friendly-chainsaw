import * as THREE from "three";
import type { SurfaceDisplaySettings, Transform3D } from "@/document/types";
import type { QualityTier } from "@/document/qualityTiers";

/** Crisp unlit image/video textures — never use 96px thumbnails as the map. */
export function configureDisplayTexture(texture: THREE.Texture, maxAnisotropy = 16): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  // Small on-screen plates — mipmaps blur more than they help.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(maxAnisotropy, 16);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

export function getTextureImageSize(texture: THREE.Texture): { width: number; height: number } | null {
  const img = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  if (!img) return null;
  const width = img.naturalWidth ?? img.width ?? 0;
  const height = img.naturalHeight ?? img.height ?? 0;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Unit-plane geometry (w,h) that fits `imageAspect` inside `slotAspect` without stretching. */
export function fitContainPlaneSize(imageAspect: number, slotAspect: number): [number, number] {
  const safeSlot = Math.max(slotAspect, 0.001);
  const safeImage = Math.max(imageAspect, 0.001);
  if (safeImage >= safeSlot) {
    return [1, safeSlot / safeImage];
  }
  return [safeImage / safeSlot, 1];
}

/** Fill the slot (object-fit: cover) — best for portrait headshots in square frames. */
export function fitCoverPlaneSize(imageAspect: number, slotAspect: number): [number, number] {
  const safeSlot = Math.max(slotAspect, 0.001);
  const safeImage = Math.max(imageAspect, 0.001);
  if (safeImage >= safeSlot) {
    return [safeImage / safeSlot, 1];
  }
  return [1, safeSlot / safeImage];
}

export function fitImagePlaneSize(
  imageAspect: number,
  slotAspect: number,
  mode: "contain" | "cover" = "cover",
): [number, number] {
  return mode === "cover"
    ? fitCoverPlaneSize(imageAspect, slotAspect)
    : fitContainPlaneSize(imageAspect, slotAspect);
}

export const TEXTURE_EDGE_BUDGET: Record<QualityTier, number> = {
  low: 1024,
  medium: 2048,
  high: 4096,
};

export function resolveTextureEdgeBudget(tier: QualityTier, gpuMaxTextureSize = 4096): number {
  return Math.min(TEXTURE_EDGE_BUDGET[tier], Math.max(gpuMaxTextureSize, 256));
}

export function analyseSurfaceResolution(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  tier: QualityTier,
  gpuMaxTextureSize = 4096,
): { budget: number; recommendedEdge: number; undersized: boolean; oversized: boolean } {
  const budget = resolveTextureEdgeBudget(tier, gpuMaxTextureSize);
  const requestedEdge = Math.max(targetWidth, targetHeight, 1);
  const recommendedEdge = Math.min(Math.ceil(requestedEdge), budget);
  const sourceEdge = Math.max(sourceWidth, sourceHeight, 1);
  return {
    budget,
    recommendedEdge,
    undersized: sourceEdge < recommendedEdge * 0.75,
    oversized: sourceEdge > recommendedEdge * 1.75,
  };
}

/** Applies object-fit, normalized crop, alignment and overscan directly in UV space. */
export function applySurfaceDisplaySettings(
  texture: THREE.Texture,
  sourceAspect: number,
  slotAspect: number,
  display: SurfaceDisplaySettings = { fit: "cover" },
): void {
  const crop = display.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  let repeatX = Math.max(0.001, crop.w);
  let repeatY = Math.max(0.001, crop.h);
  const source = Math.max(sourceAspect, 0.001);
  const slot = Math.max(slotAspect, 0.001);
  if (display.fit === "cover") {
    if (source > slot) repeatX *= slot / source;
    else repeatY *= source / slot;
  }
  const overscan = Math.max(display.overscan ?? 1, 0.001);
  repeatX /= overscan;
  repeatY /= overscan;
  let alignX = 0.5;
  let alignY = 0.5;
  if (display.anchor === "left") alignX = 0;
  if (display.anchor === "right") alignX = 1;
  if (display.anchor === "bottom") alignY = 0;
  if (display.anchor === "top") alignY = 1;
  const offsetX = crop.x + (crop.w - repeatX) * alignX;
  const offsetY = crop.y + (crop.h - repeatY) * alignY;
  texture.matrixAutoUpdate = false;
  texture.matrix.setUvTransform(
    offsetX,
    offsetY,
    repeatX,
    repeatY,
    display.rotation ?? 0,
    0.5,
    0.5,
  );
  texture.needsUpdate = true;
}

export async function probeImageAspect(src: string): Promise<number | undefined> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("probe failed"));
    });
    if (img.naturalWidth > 0 && img.naturalHeight > 0) return img.naturalWidth / img.naturalHeight;
  } catch {
    // optional metadata — render path still corrects from texture once loaded
  }
  return undefined;
}

export function scalePrimitiveForImageAspect(transform: Transform3D, imageWidth: number, imageHeight: number): Transform3D {
  const aspect = imageWidth / Math.max(imageHeight, 1);
  const h = transform.scale.y;
  return {
    ...transform,
    scale: { ...transform.scale, x: h * aspect },
  };
}

export function textureLoaderWithCors(): THREE.TextureLoader {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  return loader;
}

/** Request the highest practical resolution from known placeholder CDNs. */
export function resolveDisplayImageUrl(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return trimmed;
  if (/i\.pravatar\.cc/i.test(trimmed)) {
    const imgMatch = trimmed.match(/[?&]img=(\d+)/i);
    const seed = imgMatch?.[1] ?? "1";
    return `https://api.dicebear.com/9.x/personas/png?seed=squad-player-${seed}&size=512&backgroundColor=243d63`;
  }
  if (/picsum\.photos/i.test(trimmed) && !/\/\d+\/\d+/.test(trimmed)) {
    return `${trimmed.replace(/\/$/, "")}/800/1000`;
  }
  if (/ui-avatars\.com/i.test(trimmed) && !/[?&]size=/i.test(trimmed)) {
    const join = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${join}size=1024`;
  }
  return trimmed;
}