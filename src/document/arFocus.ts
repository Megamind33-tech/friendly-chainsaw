import type { StateCreator } from "zustand";
import type { ID, SetNode } from "./types";
import type { Store } from "./store";

/**
 * AR focus/isolate — the presentation-time "zoom in on THIS" control. The
 * operator picks one or several nodes inside an AR graphic (one player of a
 * formation, one candidate row of an election board, one map pin) and every
 * OTHER AR node in that layer animates away; SHOW ALL restores. Fully
 * non-destructive: nothing is deleted or edited, visibility flags are never
 * touched — the hidden state lives here, transiently, exactly like
 * layerPlayback (not persisted; a focus is a live show command, and every
 * graphic comes back complete on relaunch).
 */

export interface ArFocus {
  /** The nodes being focused. Descendants stay visible with them; ancestor
   * groups stay mounted as transform containers; everything else hides. */
  nodeIds: ID[];
  startedAt: number;
}

export interface ArFocusSlice {
  /** Keyed by set3d layer id. No entry = everything shown (normal). */
  arFocus: Record<ID, ArFocus>;

  /** Replace the layer's focus with exactly these nodes. */
  focusArNodes: (layerId: ID, nodeIds: ID[]) => void;
  /** Add a node to an existing focus (build up "these 3 players"). */
  addToArFocus: (layerId: ID, nodeId: ID) => void;
  /** SHOW ALL — everything animates back. */
  clearArFocus: (layerId: ID) => void;
}

type Immer = ["zustand/immer", never];

export const createArFocusSlice: StateCreator<Store, [Immer], [], ArFocusSlice> = (set) => ({
  arFocus: {},

  focusArNodes: (layerId, nodeIds) =>
    set((state) => {
      if (nodeIds.length === 0) delete state.arFocus[layerId];
      else state.arFocus[layerId] = { nodeIds, startedAt: Date.now() };
    }),

  addToArFocus: (layerId, nodeId) =>
    set((state) => {
      const existing = state.arFocus[layerId];
      if (!existing) {
        state.arFocus[layerId] = { nodeIds: [nodeId], startedAt: Date.now() };
      } else if (!existing.nodeIds.includes(nodeId)) {
        existing.nodeIds.push(nodeId);
        existing.startedAt = Date.now();
      }
    }),

  clearArFocus: (layerId) =>
    set((state) => {
      delete state.arFocus[layerId];
    }),
});

/**
 * Which nodes hide under a focus. A node stays VISIBLE when it is focused,
 * a descendant of a focused node, or an ancestor of one (ancestor groups
 * are transform containers the focused branch needs). Everything else with
 * `role: "ar"` hides; studio-set nodes (role "set"/undefined) are never
 * touched — focus is an AR-graphic operation, not a set operation.
 * Pure and cheap: computed once per envelope change, not per frame.
 */
export function computeArHiddenSet(nodes: SetNode[], focus: ArFocus | null | undefined): Set<ID> {
  const hidden = new Set<ID>();
  if (!focus || focus.nodeIds.length === 0) return hidden;
  const focused = new Set(focus.nodeIds);

  /** @returns true if this subtree contains (or is) a focused node. */
  const walk = (node: SetNode, underFocused: boolean): boolean => {
    const isFocused = focused.has(node.id);
    let containsFocused = isFocused;
    if (node.kind === "group") {
      for (const child of node.children) {
        if (walk(child, underFocused || isFocused)) containsFocused = true;
      }
    }
    const keep = isFocused || underFocused || containsFocused;
    if (!keep && node.role === "ar") hidden.add(node.id);
    return containsFocused;
  };
  for (const node of nodes) walk(node, false);
  return hidden;
}
