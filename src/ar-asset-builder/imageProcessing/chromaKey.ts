import { computeChromaAlpha, despillAndDecontaminate, type ChromaKeyParams } from "@/lib/chromaKeyShared";

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

export interface ChromaKeyResult {
  dataUrl: string;
  maskDataUrl: string;
}

export async function removeColorBackground(
  imageUrl: string,
  keyColor: string,
  similarity: number,
  smoothness: number,
  opts: { feather?: number; spill?: number } = {},
): Promise<ChromaKeyResult> {
  const img = await loadImage(imageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const params: ChromaKeyParams = {
    keyColor,
    similarity,
    smoothness,
    spill: opts.spill ?? 0.65,
  };

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskData = maskCtx.createImageData(w, h);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = computeChromaAlpha(data[i], data[i + 1], data[i + 2], params);
    const [r, g, b, a] = despillAndDecontaminate(data[i], data[i + 1], data[i + 2], alpha, params);
    const alphaByte = Math.round(a * 255);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = alphaByte;
    maskData.data[i] = alphaByte;
    maskData.data[i + 1] = alphaByte;
    maskData.data[i + 2] = alphaByte;
    maskData.data[i + 3] = 255;
  }

  if (opts.feather && opts.feather > 0) {
    featherAlpha(data, w, h, opts.feather);
  }

  maskCtx.putImageData(maskData, 0, 0);
  ctx.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), maskDataUrl: maskCanvas.toDataURL("image/png") };
}

export async function removeWhiteBackground(
  imageUrl: string,
  opts: { similarity?: number; smoothness?: number; feather?: number; spill?: number } = {},
): Promise<ChromaKeyResult> {
  return removeColorBackground(
    imageUrl,
    "#ffffff",
    opts.similarity ?? 0.12,
    opts.smoothness ?? 0.06,
    { feather: opts.feather ?? 1, spill: opts.spill ?? 0.5 },
  );
}

function featherAlpha(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const r = Math.ceil(radius);
  const copy = new Uint8ClampedArray(data.length);
  copy.set(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            sum += copy[(ny * w + nx) * 4 + 3];
            count++;
          }
        }
      }
      const a = Math.round(sum / count);
      const idx = (y * w + x) * 4;
      const oldA = data[idx + 3] / 255;
      const newA = a / 255;
      if (oldA > 0 && newA > 0) {
        const scale = newA / oldA;
        data[idx] = Math.min(255, Math.round(data[idx] * scale));
        data[idx + 1] = Math.min(255, Math.round(data[idx + 1] * scale));
        data[idx + 2] = Math.min(255, Math.round(data[idx + 2] * scale));
      }
      data[idx + 3] = a;
    }
  }
}

export async function applyImageAdjustments(
  imageUrl: string,
  adjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpen: number;
    blur: number;
    levels: { black: number; white: number; gamma: number };
  },
): Promise<string> {
  const img = await loadImage(imageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const { brightness, contrast, saturation, levels } = adjustments;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const gamma = levels.gamma || 1;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = ((r - levels.black) / (levels.white - levels.black)) * 255;
    g = ((g - levels.black) / (levels.white - levels.black)) * 255;
    b = ((b - levels.black) / (levels.white - levels.black)) * 255;

    r += brightness;
    g += brightness;
    b += brightness;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    if (saturation !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const s = 1 + saturation / 100;
      r = gray + s * (r - gray);
      g = gray + s * (g - gray);
      b = gray + s * (b - gray);
    }

    r = 255 * Math.pow(Math.max(0, Math.min(1, r / 255)), 1 / gamma);
    g = 255 * Math.pow(Math.max(0, Math.min(1, g / 255)), 1 / gamma);
    b = 255 * Math.pow(Math.max(0, Math.min(1, b / 255)), 1 / gamma);

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function cropImage(
  imageUrl: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas.toDataURL("image/png");
}

export async function rotateImage(imageUrl: string, degrees: number): Promise<string> {
  const img = await loadImage(imageUrl);
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const nw = Math.round(w * cos + h * sin);
  const nh = Math.round(w * sin + h * cos);
  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toDataURL("image/png");
}

export async function flipImage(imageUrl: string, horizontal: boolean): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  if (horizontal) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function detectTransparency(imageUrl: string): Promise<boolean> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(img.naturalWidth, 64);
  canvas.height = Math.min(img.naturalHeight, 64);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
