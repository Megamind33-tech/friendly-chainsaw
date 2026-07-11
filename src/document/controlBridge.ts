import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { useDocStore } from "./store";
import {
  usePlayoutStore,
  mapMosStoryToItem,
  applyMosStoryDelete,
  applyMosStoryInsert,
  applyMosStoryMove,
  applyMosStorySend,
  type MosStoryLike,
} from "./playout";
import type { ControlCommand, ControlStateSnapshot } from "./controlProtocol";
import {
  useAutomationStore,
  evalCondition,
  shouldTimerFire,
  type AutomationRule,
} from "./automation";

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

/**
 * Same snapshot data as `buildSnapshot()` but shaped as a flat
 * `Record<string, unknown>` — matches `evalCondition`'s signature so the
 * automation engine can look up whitelisted fields by name without
 * casting the strongly-typed snapshot at every call site.
 *
 * Deliberately not a `Object.assign({}, snapshot)` — the snapshot has
 * nested `recording`/`ndi` objects that get flattened here so a condition
 * on `ndiStreaming` (a leaf name) is one lookup, not two.
 */
function buildSnapshotAsPlainObject(): Record<string, unknown> {
  const snap = buildSnapshot();
  return {
    programSceneId: snap.programSceneId,
    previewSceneId: snap.previewSceneId,
    onAir: snap.onAir,
    currentItemId: snap.currentItemId,
    currentItemTitle: snap.currentItemTitle,
    currentItemProgress: snap.currentItemProgress,
    currentItemDuration: snap.currentItemDuration,
    isSchedulePlaying: snap.isSchedulePlaying,
    recordingActive: snap.recording.active,
    ndiStreaming: snap.ndi.streaming,
    ndiConnections: snap.ndi.connections,
    sceneCount: snap.sceneCount,
    layerCount: snap.layerCount,
  };
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

    // Previous snapshot values used by the automation engine to detect
    // transitions (on_take, on_item_start, on_item_end). Deliberately not
    // stored in the automation store — those are pure engine internals
    // and shouldn't be persisted or exposed to the UI.
    let prevProgramSceneId: string | null = null;
    let prevCurrentItemId: string | null = null;

    const requestPush = () => {
      if (disposed || scheduled !== null) return;
      scheduled = scheduleId(() => {
        scheduled = null;
        void pushSnapshot();
        runAutomationOnTransition();
      });
    };

    /**
     * Called on every rAF-coalesced snapshot rebuild. Detects on_take and
     * on_item_start/end transitions by comparing to the previous snapshot,
     * fires matching rules, then updates the "previous" trackers.
     */
    const runAutomationOnTransition = () => {
      const snap = buildSnapshotAsPlainObject();
      const takeFired = prevProgramSceneId !== null && snap.programSceneId !== prevProgramSceneId;
      const itemStart = prevCurrentItemId !== snap.currentItemId && snap.currentItemId !== null;
      const itemEnd = prevCurrentItemId !== null && snap.currentItemId !== prevCurrentItemId;
      // Field types are pinned by AUTOMATION_CONDITION_FIELDS; the plain-
      // object flattener carries `string | null` for these two.
      prevProgramSceneId = snap.programSceneId as string | null;
      prevCurrentItemId = snap.currentItemId as string | null;

      const rules = useAutomationStore.getState().rules;
      for (const rule of rules) {
        if (!rule.enabled) continue;
        let fired = false;
        if (rule.trigger.kind === "on_take" && takeFired) fired = true;
        else if (rule.trigger.kind === "on_item_start" && itemStart) fired = true;
        else if (rule.trigger.kind === "on_item_end" && itemEnd) fired = true;
        if (!fired) continue;
        maybeFireRule(rule, snap);
      }
    };

    /**
     * Fires a rule's action list if the condition passes. Each action
     * counts separately against the rolling rate limiter, per the Phase
     * 10.1 accounting design — a 3-action rule firing at 3/sec is 9
     * actions/sec, which is exactly the thing the limiter exists to
     * catch. Actions inside a rule dispatch in order; a rate-limit trip
     * mid-rule silently drops the rest (surfaces as the standard
     * rateLimited banner).
     */
    const fireRuleActions = (
      rule: AutomationRule,
      snap: Record<string, unknown>,
      nowMs: number,
    ): void => {
      if (rule.condition && !evalCondition(rule.condition, snap)) return;
      for (const action of rule.actions) {
        const ok = useAutomationStore.getState().recordActionFired(nowMs);
        if (!ok) return;
        void dispatchCommand({ type: action.type, params: action.params });
      }
    };
    const maybeFireRule = (rule: AutomationRule, snap: Record<string, unknown>): void => {
      fireRuleActions(rule, snap, Date.now());
    };

    // Push an initial snapshot immediately so a Companion connecting right
    // as the Control Room opens gets a real first frame, not the "null" the
    // Rust buffer defaults to.
    requestPush();

    const unsubDoc = useDocStore.subscribe(requestPush);
    const unsubPo = usePlayoutStore.subscribe(requestPush);

    /**
     * on_timer trigger — fires periodically at each rule's configured
     * interval. Piggybacks on the existing 1-second status poll (see
     * `statusInterval` below) so we don't spin a second timer.
     */
    const runAutomationTimers = () => {
      const snap = buildSnapshotAsPlainObject();
      const nowMs = Date.now();
      const store = useAutomationStore.getState();
      for (const rule of store.rules) {
        if (!rule.enabled) continue;
        if (rule.trigger.kind !== "on_timer") continue;
        const lastFire = store.lastTimerFireMs[rule.id];
        if (!shouldTimerFire(rule.trigger.seconds, lastFire, nowMs)) continue;
        // Fire actions through the shared helper so multi-action rules
        // + rate-limit accounting work identically to on_take/on_item*.
        // markTimerFired unconditionally, so a rule with a false
        // condition still ticks its next-fire clock forward instead of
        // spamming the check every 1s poll — matches the "seconds since
        // last attempt" mental model an operator has.
        store.markTimerFired(rule.id, nowMs);
        fireRuleActions(rule, snap, nowMs);
      }
    };

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
      runAutomationTimers();
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

    // Phase 10.1 — MOS message events from the Rust listener. `role` is
    // the message-type discriminant; `data` is the full parsed message
    // payload matching the `MosMessage` enum's camelCase serde shape.
    let unlistenMos: UnlistenFn | null = null;
    listen<MosMessageEvent>("mos:message", (event) => {
      const payload = event.payload;
      if (!payload) return;
      applyMosMessage(payload);
      dispatchMosAutomation(payload);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlistenMos = fn;
      })
      .catch(() => {
        /* ok — not running in Tauri */
      });

    /**
     * Route a MOS message into `usePlayoutStore` mutations. Uses the
     * existing `replaceRundown` action so Phase 7's ghost-currentId
     * guard fires when a rundown-scale change lands.
     */
    const applyMosMessage = (event: MosMessageEvent) => {
      const po = usePlayoutStore.getState();
      switch (event.role) {
        case "roCreate": {
          const stories = (event.data?.stories as MosStoryLike[] | undefined) ?? [];
          if (stories.length > 0) {
            po.replaceRundown(stories.map(mapMosStoryToItem));
          }
          break;
        }
        case "roStorySend": {
          const story = (event.data?.story as MosStoryLike | undefined) ?? null;
          if (story) po.replaceRundown(applyMosStorySend(po.items, story));
          break;
        }
        case "roStoryDelete": {
          const ids = (event.data?.storyIds as string[] | undefined) ?? [];
          if (ids.length > 0) po.replaceRundown(applyMosStoryDelete(po.items, ids));
          break;
        }
        case "roStoryInsert": {
          const stories = (event.data?.stories as MosStoryLike[] | undefined) ?? [];
          const targetId = (event.data?.targetId as string | null | undefined) ?? null;
          if (stories.length > 0) {
            po.replaceRundown(applyMosStoryInsert(po.items, stories, targetId));
          }
          break;
        }
        case "roStoryMove": {
          const ids = (event.data?.storyIds as string[] | undefined) ?? [];
          const targetId = (event.data?.targetId as string | null | undefined) ?? null;
          if (ids.length > 0) po.replaceRundown(applyMosStoryMove(po.items, ids, targetId));
          break;
        }
        case "roDelete":
          po.replaceRundown([]);
          break;
        default:
          // heartbeat / mosID / unhandled — no rundown state change.
          break;
      }
    };

    /**
     * Fire any automation rule with an `on_mos_message` trigger that
     * matches this event. `roleFilter` is optional; empty/absent → any
     * MOS message. Adds two synthetic fields (`mosRole`, `mosRoId`) to
     * the snapshot so a condition can gate on which rundown changed.
     */
    const dispatchMosAutomation = (event: MosMessageEvent) => {
      const rules = useAutomationStore.getState().rules;
      const augmentedSnapshot = {
        ...buildSnapshotAsPlainObject(),
        mosRole: event.role,
        mosRoId: event.roId ?? "",
      };
      const nowMs = Date.now();
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.trigger.kind !== "on_mos_message") continue;
        const filter = rule.trigger.roleFilter?.trim();
        if (filter && filter !== event.role) continue;
        fireRuleActions(rule, augmentedSnapshot, nowMs);
      }
    };

    return () => {
      disposed = true;
      if (scheduled !== null) cancelScheduleId(scheduled);
      clearInterval(statusInterval);
      unsubDoc();
      unsubPo();
      if (unlisten) unlisten();
      if (unlistenMos) unlistenMos();
    };
  }, []);
}

/**
 * Payload shape emitted by src-tauri/src/mos.rs's `MosMessageEvent`. Kept
 * in this file (not exported from a separate module) because it's the
 * only consumer — the Rust side is the sole producer and the shape is
 * documented in docs/PHASE10_1_DESIGN.md.
 */
interface MosMessageEvent {
  role: string;
  messageId: string;
  roId?: string | null;
  /** Full parsed message; shape depends on role. */
  data?: Record<string, unknown>;
}
