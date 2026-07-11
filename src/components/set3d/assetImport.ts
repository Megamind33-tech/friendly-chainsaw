import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { newId } from "@/document/ids";
import { registerFontAsset } from "@/document/fonts";
import type { Asset } from "@/document/types";
import { autoQualityTier } from "@/document/qualityTiers";
import { resolveTextureEdgeBudget } from "./displayTextures";
import { sidecarAssetTransport } from "@/adapters/sidecarAssetTransport";

/**
 * Model asset import pipeline (Phase 5): upload the binary to the axum
 * sidecar (disk storage, served at /assets/{file} for every consumer),
 * then render a REAL thumbnail — an offscreen WebGL pass over the actual
 * imported geometry, not a category icon.
 *
 * glTF/GLB is the primary interchange format (the open standard Unreal,
 * Unity, Blender, and Maya all export); FBX and OBJ cover legacy pipelines.
 */

const SIDECAR = "http://127.0.0.1:4977";

export type ModelFormat = "glb" | "gltf" | "fbx" | "obj";

export function modelFormatFromFilename(name: string): ModelFormat | null {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "glb" || ext === "gltf" || ext === "fbx" || ext === "obj" ? ext : null;
}

export async function uploadAssetFile(file: File): Promise<{ url: string; file: string }> {
  const uploaded = await sidecarAssetTransport.upload(file);
  return { url: uploaded.url, file: uploaded.file };
}

export async function loadModelObject(url: string, format: ModelFormat): Promise<THREE.Object3D> {
  switch (format) {
    case "glb":
    case "gltf": {
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    }
    case "fbx":
      return new FBXLoader().loadAsync(url);
    case "obj":
      return new OBJLoader().loadAsync(url);
  }
}

/** Max edge for stored asset previews — cards are ~64–96px wide; larger
 * only bloats the project JSON with unused pixels. */
export const THUMBNAIL_SIZE = 96;
const THUMBNAIL_JPEG_QUALITY = 0.72;

/** Re-encode an existing data-URL thumbnail down to THUMBNAIL_SIZE JPEG.
 * No-ops (returns the input) when the source is already small enough or
 * when it isn't a loadable image URL. Used to scrub oversized thumbnails
 * already sitting in persisted project docs. */
export async function compactThumbnailDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("compact: bad thumbnail"));
    });
    const maxEdge = Math.max(img.naturalWidth, img.naturalHeight, 1);
    // Skip if already at/under budget and already JPEG — nothing to gain.
    if (maxEdge <= THUMBNAIL_SIZE && dataUrl.startsWith("data:image/jpeg")) return dataUrl;
    const scale = THUMBNAIL_SIZE / maxEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(Math.round(img.naturalWidth * Math.min(scale, 1)), 1);
    canvas.height = Math.max(Math.round(img.naturalHeight * Math.min(scale, 1)), 1);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0a0e1c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", THUMBNAIL_JPEG_QUALITY);
  } catch {
    return dataUrl;
  }
}

/** In-place scrub of every asset thumbnail on a loaded project. Returns
 * true if any thumbnail was rewritten (caller should mark dirty / save). */
export async function compactProjectThumbnails(
  assets: { thumbnail?: string }[],
): Promise<boolean> {
  let changed = false;
  for (const asset of assets) {
    if (!asset.thumbnail) continue;
    const next = await compactThumbnailDataUrl(asset.thumbnail);
    if (next !== asset.thumbnail) {
      asset.thumbnail = next;
      changed = true;
    }
  }
  return changed;
}

/**
 * Renders the model once from a 3/4 view into an offscreen canvas and
 * returns a small JPEG data URL — cheap enough to store inline on the Asset.
 */
export async function generateModelThumbnail(url: string, format: ModelFormat): Promise<string> {
  const object = await loadModelObject(url, format);

  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x0a0e1c, 1);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 5, 4);
  scene.add(key);
  scene.add(object);

  // Frame the actual geometry: camera on the bounding sphere's diagonal.
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.001);
  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100);
  camera.position
    .copy(sphere.center)
    .add(new THREE.Vector3(radius * 1.8, radius * 1.2, radius * 1.8));
  camera.lookAt(sphere.center);

  renderer.render(scene, camera);
  const dataUrl = canvas.toDataURL("image/jpeg", THUMBNAIL_JPEG_QUALITY);
  renderer.dispose();
  return dataUrl;
}

/**
 * Full import: upload → thumbnail → Asset record. A thumbnail failure
 * (e.g. exotic material extensions) doesn't fail the import — the asset
 * just carries no preview, honestly.
 */
export async function importModelFile(file: File): Promise<Asset> {
  const format = modelFormatFromFilename(file.name);
  if (!format) {
    throw new Error(`unsupported model format: ${file.name} (accepted: .glb .gltf .fbx .obj)`);
  }
  const uploaded = await uploadAssetFile(file);
  let thumbnail: string | undefined;
  try {
    thumbnail = await generateModelThumbnail(uploaded.url, format);
  } catch (err) {
    console.error("thumbnail render failed; importing without preview", err);
  }
  return {
    id: newId(),
    kind: "model",
    name: file.name,
    src: uploaded.url,
    format,
    thumbnail,
  };
}

// ---------------------------------------------------------------------------
// Video assets — clips imported into the studio and played on `videofeed`
// surfaces (LED walls, monitors, backplates) via a `url` source.
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"];

export function isVideoFilename(name: string): boolean {
  return VIDEO_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");
}

/** A real first-frame grab of the actual clip (seeked slightly in to skip
 * black leaders), drawn to a canvas — not a generic film icon. */
export async function generateVideoThumbnail(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const video = document.createElement("video");
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("video failed to load for thumbnail"));
  });
  video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });
  const canvas = document.createElement("canvas");
  const scale = THUMBNAIL_SIZE / Math.max(video.videoWidth, video.videoHeight, 1);
  canvas.width = Math.max(Math.round(video.videoWidth * scale), 1);
  canvas.height = Math.max(Math.round(video.videoHeight * scale), 1);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  const width = video.videoWidth;
  const height = video.videoHeight;
  video.removeAttribute("src");
  return { dataUrl: canvas.toDataURL("image/jpeg", THUMBNAIL_JPEG_QUALITY), width, height };
}

export async function importVideoFile(file: File): Promise<Asset> {
  if (!isVideoFilename(file.name)) {
    throw new Error(`unsupported video format: ${file.name} (accepted: .mp4 .webm .mov .m4v)`);
  }
  const uploaded = await uploadAssetFile(file);
  let thumbnail: string | undefined;
  let videoWidth: number | undefined;
  let videoHeight: number | undefined;
  try {
    const metadata = await generateVideoThumbnail(uploaded.url);
    thumbnail = metadata.dataUrl;
    videoWidth = metadata.width;
    videoHeight = metadata.height;
  } catch (err) {
    console.error("video thumbnail failed; importing without preview", err);
  }
  return {
    id: newId(),
    kind: "video",
    name: file.name,
    src: uploaded.url,
    thumbnail,
    videoWidth,
    videoHeight,
  };
}

// ---------------------------------------------------------------------------
// Image assets — bitmaps for 2D graphics elements (logos, sponsor art,
// full-screen backplates).
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg"];

export function isImageFilename(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");
}

/** Downscaled copy of the actual bitmap — the real picture, not an icon. */
export async function generateImageThumbnail(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image failed to load for thumbnail"));
  });
  const scale = THUMBNAIL_SIZE / Math.max(img.naturalWidth, img.naturalHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(Math.round(img.naturalWidth * Math.min(scale, 1)), 1);
  canvas.height = Math.max(Math.round(img.naturalHeight * Math.min(scale, 1)), 1);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0a0e1c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", THUMBNAIL_JPEG_QUALITY),
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}

/** Creates a sidecar-backed derivative while retaining the original asset URL. */
export async function createOptimizedImageVariant(
  src: string,
  originalName: string,
  maxEdge: number,
): Promise<string | undefined> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image failed to load for optimization"));
  });
  const edge = Math.max(img.naturalWidth, img.naturalHeight);
  if (edge <= maxEdge) return undefined;
  const scale = maxEdge / edge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("optimization encode failed"))), "image/webp", 0.9),
  );
  const stem = originalName.replace(/\.[^.]+$/, "");
  return (await uploadAssetFile(new File([blob], `${stem}.${maxEdge}.webp`, { type: "image/webp" }))).url;
}

export async function importImageFile(file: File): Promise<Asset> {
  if (!isImageFilename(file.name)) {
    throw new Error(`unsupported image format: ${file.name} (accepted: .png .jpg .jpeg .webp .svg)`);
  }
  const uploaded = await uploadAssetFile(file);
  let thumbnail: string | undefined;
  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  let optimizedSrc: string | undefined;
  let optimizedMaxEdge: number | undefined;
  try {
    const thumb = await generateImageThumbnail(uploaded.url);
    thumbnail = thumb.dataUrl;
    imageWidth = thumb.width;
    imageHeight = thumb.height;
    const budget = resolveTextureEdgeBudget(autoQualityTier());
    optimizedSrc = await createOptimizedImageVariant(uploaded.url, file.name, budget);
    optimizedMaxEdge = optimizedSrc ? budget : undefined;
  } catch (err) {
    console.error("image thumbnail failed; importing without preview", err);
  }
  return {
    id: newId(),
    kind: "image",
    name: file.name,
    src: uploaded.url,
    thumbnail,
    imageWidth,
    imageHeight,
    optimizedSrc,
    optimizedMaxEdge,
  };
}

// ---------------------------------------------------------------------------
// Lottie assets — real After-Effects-authored motion graphics (Bodymovin
// JSON), played back by lottie-web (see renderNodes.tsx's LottieElementView).
// ---------------------------------------------------------------------------

export function isLottieFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".json") || name.toLowerCase().endsWith(".lottie");
}

export async function importLottieFile(file: File): Promise<Asset> {
  if (!isLottieFilename(file.name)) {
    throw new Error(`unsupported motion graphic format: ${file.name} (accepted: .json .lottie)`);
  }
  const uploaded = await uploadAssetFile(file);
  // No thumbnail: a Lottie composition has no single representative frame
  // worth rendering ahead of time the way a video's first frame is — the
  // asset picker shows it by name, honestly, rather than faking a preview.
  return { id: newId(), kind: "lottie", name: file.name, src: uploaded.url };
}

// ---------------------------------------------------------------------------
// Font assets — custom typefaces for text elements, registered via the
// FontFace API so they render for real (canvas/Konva text needs the font
// actually loaded in `document.fonts`, not just referenced by name).
// ---------------------------------------------------------------------------

const FONT_EXTENSIONS = ["ttf", "otf", "woff", "woff2"];

export function isFontFilename(name: string): boolean {
  return FONT_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");
}

/** "Geist-Mono-Bold.ttf" -> "Geist Mono Bold" — a readable family name when
 * the font file has no embedded name we bother parsing. */
export function deriveFontFamily(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  return stem.replace(/[-_]+/g, " ").trim() || stem;
}

export async function importFontFile(file: File): Promise<Asset> {
  if (!isFontFilename(file.name)) {
    throw new Error(`unsupported font format: ${file.name} (accepted: .ttf .otf .woff .woff2)`);
  }
  const uploaded = await uploadAssetFile(file);
  const family = deriveFontFamily(file.name);
  const asset: Asset = { id: newId(), kind: "font", name: file.name, src: uploaded.url, family };
  // Registered immediately so the very first render (asset card preview)
  // shows the real typeface, not a placeholder — see registerFontAsset.
  await registerFontAsset(asset);
  return asset;
}

export async function generateAiImageAsset(prompt: string, size = "1024x1024", referenceUrl?: string): Promise<Asset> {
  const res = await fetch(`${SIDECAR}/assets/generate-image`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, size, reference_url: referenceUrl }),
  });
  if (!res.ok) {
    throw new Error(`AI image generation failed (${res.status}): ${await res.text()}`);
  }
  const generated = (await res.json()) as { url: string; file: string; bytes: number };
  let thumbnail: string | undefined;
  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  try {
    const thumb = await generateImageThumbnail(generated.url);
    thumbnail = thumb.dataUrl;
    imageWidth = thumb.width;
    imageHeight = thumb.height;
  } catch (err) {
    console.error("generated image thumbnail failed; importing without preview", err);
  }
  return {
    id: newId(),
    kind: "image",
    name: generated.file,
    src: generated.url,
    thumbnail,
    imageWidth,
    imageHeight,
  };
}

/** Routes any studio file (3D model, video clip, image, font, motion graphic) to the right importer. */
export async function importStudioFile(file: File): Promise<Asset> {
  if (isVideoFilename(file.name)) return importVideoFile(file);
  if (isImageFilename(file.name)) return importImageFile(file);
  if (isFontFilename(file.name)) return importFontFile(file);
  if (isLottieFilename(file.name)) return importLottieFile(file);
  return importModelFile(file);
}
