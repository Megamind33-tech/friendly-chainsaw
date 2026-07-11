import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { useDocStore } from "./store";
import { usePlayoutStore } from "./playout";
import type { ControlCommand, ControlStateSnapshot } from "./controlProtocol";

/**
 * Phase 7 control bridge — the single point of contact between the
 * external control plane (Companion, curl, dashboards) and the Zustand
 * stores that actually hold state. Runs ONLY in the Control Room window
 * (mounted from `ControlRoomView.tsx`) so:
 *
 *  1. Program/Preview windows don't double-emit state pushes.
 *  2. There's exactly one dispatcher for incoming commands — no race
 *     between two listeners applying the same take twice.
 *
 * Two directions of flow:
 *
 *  * State push (this window → sidecar → SSE subscribers). A subscription
 *    on the relevant zustand stores rebuilds a compact `ControlStateSnapshot`
 *    on every change and calls the `set_control_state` Tauri command.
 *  * Command dispatch (sidecar → this window → store action). A
 *    `listen("control:command", ...)` receives the command envelope and
 *    routes it to the correct store action.
 *
 * Not the SSE consumer for `/control/state/stream` — that's for external
 * clients only. This window is the *producer* of that stream.
 */

let bridgeSeq = 0;

function scheduleId(fn: () => void): number {
  // Coalesces sub-frame rapid mutations (e.g. animation ticks) into one
  // push per animation frame. requestAnimationFrame gives us ~60Hz throttle
  // for free in the browser; falls back to setTimeout 16 in test envs.
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(fn) as unknown as number;
  return setTimeout(fn, 16) as unknown as number;
}
function cancelScheduleId(id: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
}

function buildSnapshot(): ControlStateSnapshot {
  const doc = useDocStore.getState();
  const po = usePlayoutStore.getState();
  const project = doc.project;

  const programSceneId = doc.programSceneId ?? null;
  const previewSceneId = doc.previewSceneId ?? null;

  const currentItem = po.currentId ? po.items.find((i) => i.id === po.currentId) ?? null : null;
  const currentIdx = currentItem ? po.items.findIndex((i) => i.id === currentItem.id) : -1;
  const nextItem = currentIdx >= 0 ? po.items[currentIdx + 1] : po.items[0];

  const scenes = project?.scenes ?? [];
  const layerCount = scenes.reduce((sum, s) => sum + s.layers.length, 0);

  return {
    programSceneId,
    previewSceneId,
    // ON-AIR here means "a program scene exists AND we recently pushed" —
    // the sidecar's /status endpoint is what tracks real frame flow, but
    // the control snapshot's onAir is authored intent, not measured live
    // pull-through, because a Companion button lighting on take is more
    // useful to the operator than one that lights only when OBS is
    // actively pulling.
    onAir: programSceneId !== null,
    currentItemId: currentItem?.id ?? null,
    currentItemTitle: currentItem?.title ?? null,
    currentItemProgress: po.progress,
    currentItemDuration: currentItem?.duration ?? 0,
    nextItemTitle: nextItem?.title ?? null,
    isSchedulePlaying: po.isPlaying,
    recording: {
      // Read from the last known status pushed by the record-status watcher
      // (see `useRecordStatusWatcher` below). Deliberately not calling
      // `invoke("get_record_status")` here — that'd be an async call inside
      // a synchronous snapshot builder.
      active: recordStatusMirror.active,
      path: recordStatusMirror.path,
      startedAt: recordStatusMirror.startedAt,
    },
    ndi: {
      streaming: ndiStatusMirror.streaming,
      connections: ndiStatusMirror.connections,
    },
    sceneCount: scenes.length,
    layerCount,
    seq: ++bridgeSeq,
    timestamp: Date.now(),
  };
}

// Small mirror stores populated by background watchers; kept out of the
// zustand stores so a status poll doesn't trigger a document re-render.
const recordStatusMirror: { active: boolean; path: string | null; startedAt: number | null } = {
  active: false,
  path: null,
  startedAt: null,
};
const ndiStatusMirror: { streaming: boolean; connections: number } = {
  streaming: false,
  connections: 0,
};

async function pushSnapshot(): Promise<void> {
  const snapshot = buildSnapshot();
  try {
    await invoke("set_control_state", { stateJson: JSON.stringify(snapshot) });
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("controlBridge: set_control_state failed", e);
    }
  }
}

async function dispatchCommand(cmd: ControlCommand): Promise<void> {
  const doc = useDocStore.getState();
  const po = usePlayoutStore.getState();

  switch (cmd.type) {
    case "take":
      doc.take();
      break;
    case "arm": {
      const sceneId = String(cmd.params?.sceneId ?? "");
      if (sceneId) doc.armPreview(sceneId);
      break;
    }
    case "playIn": {
      const layerId = String(cmd.params?.layerId ?? "");
      if (layerId) doc.playIn(layerId);
      break;
    }
    case "playOut": {
      const layerId = String(cmd.params?.layerId ?? "");
      if (layerId) doc.playOut(layerId);
      break;
    }
    case "takeItem": {
      const itemId = String(cmd.params?.itemId ?? "");
      if (itemId) po.takeItem(itemId);
      break;
    }
    case "nextItem":
      po.next();
      break;
    case "previousItem":
      po.previous();
      break;
    case "playSchedule":
      po.play();
      break;
    case "pauseSchedule":
      po.pause();
      break;
    case "stopSchedule":
      po.stop();
      break;
    case "ping":
    case "startRecord":
    case "stopRecord":
      // Rust-side commands — the control server dispatches these directly;
      // they never reach the bridge. Safe no-op guard for tests that fire
      // them through the event system anyway.
      break;
    default: {
      // Exhaustiveness check: adding a new ControlCommandType and forgetting
      // to handle it here should be a compile error.
      const _: never = cmd.type as never;
      if (typeof console !== "undefined") console.warn("controlBridge: unhandled command", cmd);
      void _;
    }
  }
}

/**
 * Mount in `ControlRoomView.tsx`. Idempotent — the effect's cleanup
 * unsubscribes, so React strict-mode double-mounts don't leak listeners.
 */
export function useControlBridge(): void {
  useEffect(() => {
    let scheduled: number | null = null;
    let disposed = false;

    const requestPush = () => {
      if (disposed || scheduled !== null) return;
      scheduled = scheduleId(() => {
        scheduled = null;
        void pushSnapshot();
      });
    };

    // Push an initial snapshot immediately so a Companion connecting right
    // as the Control Room opens gets a real first frame, not the "null" the
    // Rust buffer defaults to.
    requestPush();

    const unsubDoc = useDocStore.subscribe(requestPush);
    const unsubPo = usePlayoutStore.subscribe(requestPush);

    // Poll ndi/record status every second — these live in Rust, not the
    // Zustand stores, so a store subscription can't catch them.
    const statusInterval = setInterval(async () => {
      try {
        const rec = await invoke<{ active: boolean; path: string | null; startedAt: number | null }>(
          "get_record_status",
        );
        recordStatusMirror.active = rec.active;
        recordStatusMirror.path = rec.path;
        recordStatusMirror.startedAt = rec.startedAt;
      } catch {
        /* ok — record command may not be registered yet during startup */
      }
      try {
        const ndi = await invoke<{ available: boolean; connections?: number | null; reason?: string | null }>(
          "get_ndi_status",
        );
        // NDI streaming is inferred from having a nonneg connections count —
        // an unavailable stub returns available:false and we treat that as
        // not streaming.
        ndiStatusMirror.streaming = Boolean(ndi.available) && typeof ndi.connections === "number";
        ndiStatusMirror.connections = typeof ndi.connections === "number" ? ndi.connections : 0;
      } catch {
        /* ok — startup race */
      }
      requestPush();
    }, 1000);

    // Incoming commands from the sidecar's /control/command endpoint.
    let unlisten: UnlistenFn | null = null;
    listen<ControlCommand>("control:command", (event) => {
      const payload = event.payload;
      if (payload && typeof payload.type === "string") {
        void dispatchCommand(payload);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* mounting outside Tauri (e.g. a browser dev preview) — no-op */
      });

    return () => {
      disposed = true;
      if (scheduled !== null) cancelScheduleId(scheduled);
      clearInterval(statusInterval);
      unsubDoc();
      unsubPo();
      if (unlisten) unlisten();
    };
  }, []);
}
