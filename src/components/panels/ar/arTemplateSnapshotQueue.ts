import type { Asset, Layer } from "@/document/types";

export interface ArSnapshotJob {
  id: string;
  layer: Layer;
  assets: Asset[];
  resolve: (dataUrl: string) => void;
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const queue: ArSnapshotJob[] = [];
let active: ArSnapshotJob | null = null;
let listener: ((job: ArSnapshotJob | null) => void) | null = null;

function pump(): void {
  if (active || queue.length === 0) return;
  active = queue.shift() ?? null;
  if (active) listener?.(active);
}

export function subscribeArSnapshotStudio(cb: (job: ArSnapshotJob | null) => void): () => void {
  listener = cb;
  pump();
  return () => {
    if (listener === cb) listener = null;
  };
}

export function completeArSnapshot(id: string, dataUrl: string): void {
  cache.set(id, dataUrl);
  active?.resolve(dataUrl);
  pending.delete(id);
  active = null;
  listener?.(null);
  pump();
}

export function failArSnapshot(id: string): void {
  active?.resolve("");
  pending.delete(id);
  active = null;
  listener?.(null);
  pump();
}

/** One shared WebGL capture — never spawn a Canvas per template card. */
export function requestArTemplateSnapshot(id: string, layer: Layer, assets: Asset[]): Promise<string> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;

  const promise = new Promise<string>((resolve) => {
    queue.push({ id, layer, assets, resolve });
    pump();
  });
  pending.set(id, promise);
  return promise;
}

export function peekArTemplateSnapshot(id: string): string | undefined {
  return cache.get(id);
}
