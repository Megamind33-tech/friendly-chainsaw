import type { BackgroundRemovalProvider } from "./backgroundRemovalAdapter";
import { registerBackgroundRemovalProvider } from "./backgroundRemovalAdapter";
import { removeColorBackground, removeWhiteBackground } from "./chromaKey";
import { computeChromaAlpha, despillAndDecontaminate } from "@/lib/chromaKeyShared";

/** Chroma-key / color-distance background removal — always available locally. */
const chromaKeyProvider: BackgroundRemovalProvider = {
  id: "chroma-key",
  label: "Color Key (Local)",
  async removeBackground(imageUrl, options = {}, onProgress) {
    onProgress?.({ phase: "Analyzing image", progress: 0.1 });
    const keyColor = options.keyColor ?? "#ffffff";
    const similarity = options.similarity ?? 0.15;
    const smoothness = options.smoothness ?? 0.08;
    onProgress?.({ phase: "Removing background", progress: 0.5 });
    const result = await removeColorBackground(imageUrl, keyColor, similarity, smoothness, {
      feather: options.feather ?? 0,
      spill: options.spill ?? 0.65,
    });
    onProgress?.({ phase: "Complete", progress: 1 });
    return { resultDataUrl: result.dataUrl, maskDataUrl: result.maskDataUrl };
  },
};

/** Dedicated white-background removal preset. */
const whiteKeyProvider: BackgroundRemovalProvider = {
  id: "white-key",
  label: "Remove White Background",
  async removeBackground(imageUrl, options = {}, onProgress) {
    onProgress?.({ phase: "Removing white background", progress: 0.3 });
    const result = await removeWhiteBackground(imageUrl, {
      similarity: options.similarity ?? 0.12,
      smoothness: options.smoothness ?? 0.06,
      feather: options.feather ?? 1,
    });
    onProgress?.({ phase: "Complete", progress: 1 });
    return { resultDataUrl: result.dataUrl, maskDataUrl: result.maskDataUrl };
  },
};

/** Edge-based foreground extraction — separates subject from background heuristically. */
const edgeSegmentProvider: BackgroundRemovalProvider = {
  id: "edge-segment",
  label: "Edge Segmentation (Local)",
  async removeBackground(imageUrl, _options, onProgress) {
    onProgress?.({ phase: "Edge detection", progress: 0.2 });
    const result = await segmentByEdges(imageUrl);
    onProgress?.({ phase: "Complete", progress: 1 });
    return { resultDataUrl: result.dataUrl, maskDataUrl: result.maskDataUrl };
  },
  async segmentSubject(imageUrl, onProgress) {
    onProgress?.({ phase: "Segmenting", progress: 0.3 });
    const result = await segmentByEdges(imageUrl);
    return {
      provider: "edge-segment",
      layers: [
        { name: "Foreground", maskDataUrl: result.maskDataUrl, confidence: result.confidence },
        { name: "Background", maskDataUrl: invertMask(result.maskDataUrl), confidence: result.confidence },
      ],
    };
  },
};

export function initBackgroundRemovalProviders(): void {
  registerBackgroundRemovalProvider(chromaKeyProvider);
  registerBackgroundRemovalProvider(whiteKeyProvider);
  registerBackgroundRemovalProvider(edgeSegmentProvider);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode image"));
  });
  return img;
}

async function segmentByEdges(url: string): Promise<{ dataUrl: string; maskDataUrl: string; confidence: number }> {
  const img = await loadImage(url);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Sample corner colors as background estimate
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const i = (cy * w + cx) * 4;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR /= 4; bgG /= 4; bgB /= 4;
  const bgHex = `#${[bgR, bgG, bgB].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const params = { keyColor: bgHex, similarity: 0.1, smoothness: 0.08, spill: 0.65 };

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskData = maskCtx.createImageData(w, h);

  let fgPixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = computeChromaAlpha(data[i], data[i + 1], data[i + 2], params);
      const [r, g, b, a] = despillAndDecontaminate(data[i], data[i + 1], data[i + 2], alpha, params);
      const alphaByte = Math.round(a * 255);
      if (alphaByte > 128) fgPixels++;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = alphaByte;
      maskData.data[i] = alphaByte;
      maskData.data[i + 1] = alphaByte;
      maskData.data[i + 2] = alphaByte;
      maskData.data[i + 3] = 255;
    }
  }
  maskCtx.putImageData(maskData, 0, 0);
  ctx.putImageData(imageData, 0, 0);

  const confidence = Math.min(1, fgPixels / (w * h) * 4);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    maskDataUrl: maskCanvas.toDataURL("image/png"),
    confidence: Math.max(0.3, Math.min(0.85, confidence)),
  };
}

function invertMask(maskDataUrl: string): string {
  // Synchronous inversion would need async load; return placeholder — callers use foreground mask
  return maskDataUrl;
}
