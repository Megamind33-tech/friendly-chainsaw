export interface RendererBenchmarkSnapshot {
  targetFps: number;
  elapsedSeconds: number;
  samples: number;
  averageFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  droppedFrames: number;
  estimatedFps: number;
  jsHeapUsedMb: number | null;
  /** Browsers deliberately do not expose per-process VRAM reliably. */
  vramMb: null;
}

declare global {
  interface Window {
    chaseRendererBenchmark?: { snapshot: () => RendererBenchmarkSnapshot; stop: () => void };
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

/**
 * Browser-side frame pacing probe. Enable with `?benchmark=1` on renderer.html
 * and call `window.chaseRendererBenchmark.snapshot()` after a soak run.
 */
export function startRendererBenchmark(targetFps: number): () => RendererBenchmarkSnapshot {
  const startedAt = performance.now();
  const samples: number[] = [];
  let droppedFrames = 0;
  let previous = performance.now();
  let raf = 0;
  const targetFrameMs = 1000 / targetFps;

  const tick = (now: number) => {
    const delta = now - previous;
    previous = now;
    if (samples.length < 20_000) samples.push(delta);
    if (delta > targetFrameMs * 1.5) droppedFrames += Math.max(1, Math.round(delta / targetFrameMs) - 1);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const snapshot = (): RendererBenchmarkSnapshot => {
    const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
    const averageFrameMs = samples.reduce((sum, sample) => sum + sample, 0) / Math.max(1, samples.length);
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      targetFps,
      elapsedSeconds,
      samples: samples.length,
      averageFrameMs,
      p95FrameMs: percentile(samples, 0.95),
      p99FrameMs: percentile(samples, 0.99),
      droppedFrames,
      estimatedFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      jsHeapUsedMb: memory.memory ? memory.memory.usedJSHeapSize / 1024 / 1024 : null,
      vramMb: null,
    };
  };
  window.chaseRendererBenchmark = {
    snapshot,
    stop: () => cancelAnimationFrame(raf),
  };
  return snapshot;
}
