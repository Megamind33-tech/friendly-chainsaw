import type { StateCreator } from "zustand";
import type { ID } from "./types";
import type { Store } from "./store";
import { useDataStore } from "./dataSources";

export type LayerPlaybackPhase = "in" | "out";

export interface LayerPlayback {
  phase: LayerPlaybackPhase;
  /** `Date.now()` when this phase started — every consumer (editor, Program,
   * Preview) computes its own `elapsed = Date.now() - startedAt` and seeks a
   * freshly-built GSAP timeline to that point, so a window that starts
   * polling mid-animation resumes at the right frame with no separate sync
   * protocol (same trick `lastTakeAt` uses in programState.ts). Once
   * `elapsed >= timeline.inDuration` (or `.outDuration`), the layer is just
   * showing (or hiding) — no ongoing tween, no timer needed. */
  startedAt: number;
}

export interface VerseDataHold {
  verseText: string;
  verseRef: string;
}

export interface PlaybackSlice {
  /** Keyed by layer id. No entry = never triggered = fully hidden. Every
   * transition (in -> out, out -> in) is an explicit operator command —
   * there is no internal timer auto-advancing a phase. Intentionally NOT
   * persisted to SQLite: resuming a half-played animation across an app
   * restart isn't meaningful: every layer starts hidden on load. */
  layerPlayback: Record<ID, LayerPlayback>;

  /** During verse OUT transitions, hold the previous verse text so bindings
   * don't flash the new verse before the animation completes. */
  verseDataHold: VerseDataHold | null;

  playIn: (layerId: ID) => void;
  playOut: (layerId: ID) => void;
  /** Removes a layer's playback entry entirely (back to "never triggered =
   * fully hidden"). Needed by the Timeline: scrubbing the playhead to before a
   * clip's in-point must un-play the layer, which neither `in` nor `out` can
   * express (both are "has been triggered"). */
  resetPlayback: (layerId: ID) => void;
  /** AE-style scrub: pin playback to exactly `elapsedSec` into a phase by
   * back-dating `startedAt`. Every consumer derives elapsed from
   * `Date.now() - startedAt`, so a scrub is just a synthetic start time —
   * renderers resume advancing from that point, which is what dragging a
   * playhead through a build should feel like. Used by the AR Builder's
   * animation timeline. */
  scrubPlayback: (layerId: ID, phase: LayerPlaybackPhase, elapsedSec: number) => void;
  holdVerseData: () => void;
  releaseVerseDataHold: () => void;
}

type Immer = ["zustand/immer", never];

export const createPlaybackSlice: StateCreator<Store, [Immer], [], PlaybackSlice> = (set) => ({
  layerPlayback: {},
  verseDataHold: null,

  playIn: (layerId) =>
    set((state) => {
      state.layerPlayback[layerId] = { phase: "in", startedAt: Date.now() };
    }),

  playOut: (layerId) =>
    set((state) => {
      state.layerPlayback[layerId] = { phase: "out", startedAt: Date.now() };
    }),

  resetPlayback: (layerId) =>
    set((state) => {
      delete state.layerPlayback[layerId];
    }),

  scrubPlayback: (layerId, phase, elapsedSec) =>
    set((state) => {
      state.layerPlayback[layerId] = { phase, startedAt: Date.now() - Math.max(0, elapsedSec) * 1000 };
    }),

  holdVerseData: () =>
    set((state) => {
      const { verseText, verseRef } = useDataStore.getState().event.values;
      state.verseDataHold = { verseText: String(verseText ?? ""), verseRef: String(verseRef ?? "") };
    }),

  releaseVerseDataHold: () =>
    set((state) => {
      state.verseDataHold = null;
    }),
});
