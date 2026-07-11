import { create } from "zustand";

/**
 * Timeline sequence model (Phase B) — one clip per scene layer on a
 * seconds-based timeline. A clip means "this layer plays IN at `inTime` and
 * OUT at `outTime`"; the TimelinePanel's transport walks the playhead across
 * these edges and fires the real `playIn`/`playOut`/`resetPlayback` on the
 * doc store, so scrubbing/playing here actually drives Program & Preview.
 *
 * This is deliberately its own lightweight store (persisted to localStorage,
 * keyed per scene+layer) rather than baked into the document schema yet — it
 * layers on top of the existing layer/timeline model without a migration, and
 * a later phase can promote it into the project document if needed.
 */
export interface Clip {
  inTime: number;
  outTime: number;
}

export const DEFAULT_CLIP: Clip = { inTime: 0, outTime: 5 };

interface SequenceState {
  /** sceneId -> layerId -> clip */
  clips: Record<string, Record<string, Clip>>;
  /** Total timeline length in seconds (the ruler extent). */
  duration: number;
  getClip: (sceneId: string, layerId: string) => Clip;
  /** True only once the operator has explicitly dragged/resized a clip for
   * this layer — a real persisted entry — as opposed to `getClip`'s
   * DEFAULT_CLIP fallback, which is display-only (the ghost box a layer
   * shows before it's ever been sequenced). The transport must gate on
   * this, not on `getClip`'s fallback: firing playIn/playOut from a
   * phantom default clip would silently hijack every layer in the scene —
   * including ones the operator is managing by hand via Play In/Out in the
   * Layers panel — the moment they merely open the Timeline page. */
  hasClip: (sceneId: string, layerId: string) => boolean;
  setClip: (sceneId: string, layerId: string, clip: Clip) => void;
  setDuration: (seconds: number) => void;
}

const STORAGE_KEY = "timeline-sequence-v1";

function loadPersisted(): { clips: SequenceState["clips"]; duration: number } {
  if (typeof window === "undefined") return { clips: {}, duration: 20 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { clips: parsed.clips ?? {}, duration: parsed.duration ?? 20 };
    }
  } catch {
    /* ignore corrupt persisted state */
  }
  return { clips: {}, duration: 20 };
}

function persist(state: SequenceState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ clips: state.clips, duration: state.duration }));
}

export const useSequenceStore = create<SequenceState>((set, get) => ({
  ...loadPersisted(),

  getClip: (sceneId, layerId) => get().clips[sceneId]?.[layerId] ?? DEFAULT_CLIP,

  hasClip: (sceneId, layerId) => get().clips[sceneId]?.[layerId] !== undefined,

  setClip: (sceneId, layerId, clip) =>
    set((state) => {
      const scene = { ...(state.clips[sceneId] ?? {}) };
      scene[layerId] = clip;
      const next = { ...state, clips: { ...state.clips, [sceneId]: scene } };
      persist(next);
      return next;
    }),

  setDuration: (seconds) =>
    set((state) => {
      const next = { ...state, duration: Math.max(5, Math.round(seconds)) };
      persist(next);
      return next;
    }),
}));
