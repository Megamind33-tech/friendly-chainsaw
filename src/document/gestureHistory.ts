import { useCallback } from "react";
import { useDocStore } from "./store";

/**
 * A Konva drag/resize/rotate gesture fires many intermediate events but
 * should collapse to exactly one undo entry. zundo snapshots on every
 * `set()` call, so we pause tracking for the duration of the gesture and
 * resume immediately before the single commit at gesture-end — that
 * commit is diffed against the pre-gesture snapshot, producing one entry
 * that reverts the whole gesture atomically.
 */
export function useGestureHistory() {
  const beginGesture = useCallback(() => {
    useDocStore.temporal.getState().pause();
  }, []);

  const endGesture = useCallback((commit: () => void) => {
    useDocStore.temporal.getState().resume();
    commit();
  }, []);

  return { beginGesture, endGesture };
}
