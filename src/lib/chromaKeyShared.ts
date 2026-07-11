/** Shared chroma-key math for CPU (canvas) and GPU (GLSL) paths — YCbCr chroma distance + despill. */

export interface ChromaKeyParams {
  keyColor: string;
  similarity: number;
  smoothness: number;
  spill?: number;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Chroma distance in YCbCr space (matches SetNodes CHROMA_FRAGMENT). */
export function chromaDistanceRgb01(r: number, g: number, b: number, kr: number, kg: number, kb: number): number {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const ky = 0.299 * kr + 0.587 * kg + 0.114 * kb;
  const cb = (b - y) * 0.565;
  const cr = (r - y) * 0.713;
  const kcb = (kb - ky) * 0.565;
  const kcr = (kr - ky) * 0.713;
  return Math.hypot(cb - kcb, cr - kcr);
}

export function computeChromaAlpha(r: number, g: number, b: number, params: ChromaKeyParams): number {
  const [kr, kg, kb] = hexToRgb01(params.keyColor);
  const dist = chromaDistanceRgb01(r / 255, g / 255, b / 255, kr, kg, kb);
  const sim = params.similarity;
  const smooth = params.smoothness;
  if (dist <= sim) return 0;
  if (dist >= sim + smooth) return 1;
  return (dist - sim) / smooth;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 1e-6)));
  return t * t * (3 - 2 * t);
}

/** Despill + black-edge cleanup on 0–255 RGB with alpha 0–1. */
export function despillAndDecontaminate(
  r: number,
  g: number,
  b: number,
  alpha: number,
  params: ChromaKeyParams,
): [number, number, number, number] {
  if (alpha <= 0.001) return [0, 0, 0, 0];

  const [kr, kg, kb] = hexToRgb01(params.keyColor);
  const spill = params.spill ?? 0.6;
  let rf = r / 255;
  let gf = g / 255;
  let bf = b / 255;

  const dist = chromaDistanceRgb01(rf, gf, bf, kr, kg, kb);
  const nearKey = 1 - smoothstep(params.similarity, params.similarity + params.smoothness + 0.25, dist);
  const s = spill * nearKey * (1 - alpha * 0.2);

  if (kg >= kr && kg >= kb) {
    gf = gf * (1 - s) + Math.min(gf, (rf + bf) * 0.5) * s;
  } else if (kb >= kr && kb >= kg) {
    bf = bf * (1 - s) + Math.min(bf, (rf + gf) * 0.5) * s;
  } else {
    rf = rf * (1 - s) + Math.min(rf, (gf + bf) * 0.5) * s;
  }

  // Matte-edge decontamination — crushed blacks on soft edges cause dirty halos.
  const edgeWeight = smoothstep(0.02, 0.35, alpha) * (1 - smoothstep(0.65, 0.98, alpha));
  if (edgeWeight > 0.001) {
    const luma = 0.299 * rf + 0.587 * gf + 0.114 * bf;
    if (luma < 0.16) {
      const scale = 0.08 / Math.max(luma, 0.001);
      rf = Math.min(1, rf * Math.min(scale, 2.5));
      gf = Math.min(1, gf * Math.min(scale, 2.5));
      bf = Math.min(1, bf * Math.min(scale, 2.5));
      alpha *= smoothstep(0, 0.16, luma);
    }
    const inv = 1 / Math.max(alpha, 0.08);
    rf = Math.min(1, rf * inv * 0.3 + rf * 0.7);
    gf = Math.min(1, gf * inv * 0.3 + gf * 0.7);
    bf = Math.min(1, bf * inv * 0.3 + bf * 0.7);
  }

  return [Math.round(rf * 255), Math.round(gf * 255), Math.round(bf * 255), alpha];
}
