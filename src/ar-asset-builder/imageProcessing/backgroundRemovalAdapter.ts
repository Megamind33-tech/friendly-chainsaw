import type { ArSegmentationResult } from "../types";

export interface BackgroundRemovalOptions {
  /** Target color for chroma-style removal (hex). */
  keyColor?: string;
  /** Color distance threshold 0–1. */
  similarity?: number;
  /** Edge softness 0–1. */
  smoothness?: number;
  /** Feather mask edges in pixels. */
  feather?: number;
  /** Green/blue spill suppression 0–1. */
  spill?: number;
  /** Contract (-) or expand (+) mask in pixels. */
  maskOffset?: number;
}

export interface BackgroundRemovalProgress {
  phase: string;
  progress: number;
}

export interface BackgroundRemovalProvider {
  readonly id: string;
  readonly label: string;
  removeBackground(
    imageUrl: string,
    options?: BackgroundRemovalOptions,
    onProgress?: (p: BackgroundRemovalProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ resultDataUrl: string; maskDataUrl?: string }>;
  segmentSubject?(
    imageUrl: string,
    onProgress?: (p: BackgroundRemovalProgress) => void,
    signal?: AbortSignal,
  ): Promise<ArSegmentationResult>;
}

const providers = new Map<string, BackgroundRemovalProvider>();

export function registerBackgroundRemovalProvider(provider: BackgroundRemovalProvider): void {
  providers.set(provider.id, provider);
}

export function getBackgroundRemovalProvider(id?: string): BackgroundRemovalProvider {
  const key = id ?? activeProviderId ?? "chroma-key";
  const p = providers.get(key);
  if (!p) throw new Error(`Background removal provider "${key}" not registered`);
  return p;
}

export function listBackgroundRemovalProviders(): BackgroundRemovalProvider[] {
  return Array.from(providers.values());
}

let activeProviderId: string | null = "chroma-key";

export function setActiveBackgroundRemovalProvider(id: string): void {
  if (!providers.has(id)) throw new Error(`Unknown provider: ${id}`);
  activeProviderId = id;
}

export function getActiveBackgroundRemovalProviderId(): string {
  return activeProviderId ?? "chroma-key";
}
