import { useSyncExternalStore } from "react";
import {
  getWebglContextStats,
  subscribeWebglContextStats,
  type WebglContextStats,
} from "./webglContext";

export { WEBGL_CONTEXT_BUDGET } from "./webglContext";
export type { WebglContextStats };

/**
 * Live WebGL context count.
 *
 * `getWebglContextStats` returns a cached object that only changes identity
 * when the count does — a fresh object per call sends React 19 into an
 * infinite re-render, the same getSnapshot rule the data hub and the election
 * behaviour log both had to be fixed for.
 */
export function useWebglContextStats(): WebglContextStats {
  return useSyncExternalStore(subscribeWebglContextStats, getWebglContextStats, getWebglContextStats);
}
