/**
 * WebGL context budget and loss reporting.
 *
 * Every visible `set3d` layer mounts its own `<Canvas>`, and several surfaces
 * can be alive at the same time: the Program window, the Preview window, both
 * multiviewer tiles, the Studio editor, the AR viewport, any confidence
 * monitor, and — during a Take — the outgoing scene the transition compositor
 * paints on top. A scene with two set3d layers can therefore hold a dozen
 * contexts at once.
 *
 * Browsers cap concurrent WebGL contexts (Chromium's limit is ~16 and it
 * silently kills the OLDEST context to make room). A killed context does not
 * throw: the canvas simply stops painting, which reads as a preview that
 * "won't open" or a window that came up blank. Nothing in the app noticed,
 * because there was no `webglcontextlost` handler anywhere.
 *
 * This module does two things: counts live contexts so the cost is
 * observable, and makes a lost context loud instead of silent.
 */

/** Chromium's practical ceiling. Past this it starts dropping old contexts. */
export const WEBGL_CONTEXT_BUDGET = 16;
/** Warn before the ceiling, while there is still something to be done. */
const WARN_AT = 8;

let liveContexts = 0;
let peakContexts = 0;
const listeners = new Set<() => void>();

export interface WebglContextStats {
  live: number;
  peak: number;
  /** True once the count is high enough that the browser may start dropping. */
  nearBudget: boolean;
}

let snapshot: WebglContextStats = { live: 0, peak: 0, nearBudget: false };

function publish(): void {
  snapshot = { live: liveContexts, peak: peakContexts, nearBudget: liveContexts >= WARN_AT };
  listeners.forEach((l) => l());
}

/** Stable identity between changes — required by useSyncExternalStore. */
export function getWebglContextStats(): WebglContextStats {
  return snapshot;
}

export function subscribeWebglContextStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Register a renderer's canvas. Returns a disposer for unmount.
 *
 * `label` identifies the surface in logs — with a dozen canvases alive,
 * "context lost" on its own tells an operator nothing about which preview
 * went dark.
 */
export function registerWebglContext(canvas: HTMLCanvasElement, label: string): () => void {
  liveContexts += 1;
  peakContexts = Math.max(peakContexts, liveContexts);
  if (liveContexts === WARN_AT) {
    console.warn(
      `[webgl] ${liveContexts} live contexts (budget ${WEBGL_CONTEXT_BUDGET}). ` +
        `Close a 3D preview surface — past the budget the browser drops the oldest context and that canvas goes black.`,
    );
  }
  publish();

  const onLost = (event: Event) => {
    // Preventing the default is what makes restoration possible at all; without
    // it the context is gone permanently and the canvas never paints again.
    event.preventDefault();
    console.error(
      `[webgl] context LOST on "${label}" — this surface has stopped painting. ` +
        `${liveContexts} contexts were live; the usual cause is too many 3D previews open at once.`,
    );
  };
  const onRestored = () => {
    console.warn(`[webgl] context restored on "${label}"`);
  };

  canvas.addEventListener("webglcontextlost", onLost as EventListener, false);
  canvas.addEventListener("webglcontextrestored", onRestored as EventListener, false);

  return () => {
    canvas.removeEventListener("webglcontextlost", onLost as EventListener);
    canvas.removeEventListener("webglcontextrestored", onRestored as EventListener);
    liveContexts = Math.max(0, liveContexts - 1);
    publish();
  };
}

/** Test seam — resets the module-level counters. */
export function resetWebglContextStats(): void {
  liveContexts = 0;
  peakContexts = 0;
  publish();
}
