/**
 * Phase 7 control-protocol types — shared vocabulary between:
 *   * Rust control server (src-tauri/src/control_server.rs)
 *   * Control Room bridge (controlBridge.ts)
 *   * Companion module (src/companion-module/index.js)
 *   * External tests (scripts/verify-phase7.ts)
 *
 * The message shapes here ARE the wire protocol. Renaming a field is a wire
 * break; adding a field is safe (SSE clients ignore unknown keys). See
 * docs/PHASE7_DESIGN.md for the design rationale.
 */

export type ControlCommandType =
  | "take"
  | "arm"
  | "playIn"
  | "playOut"
  | "takeItem"
  | "nextItem"
  | "previousItem"
  | "playSchedule"
  | "pauseSchedule"
  | "stopSchedule"
  | "startRecord"
  | "stopRecord"
  | "ping";

/** All accepted command types, in one const the Rust side mirrors. */
export const CONTROL_COMMAND_TYPES: readonly ControlCommandType[] = [
  "take",
  "arm",
  "playIn",
  "playOut",
  "takeItem",
  "nextItem",
  "previousItem",
  "playSchedule",
  "pauseSchedule",
  "stopSchedule",
  "startRecord",
  "stopRecord",
  "ping",
] as const;

export interface ControlCommand {
  seq?: number;
  type: ControlCommandType;
  params?: Record<string, unknown>;
}

export interface ControlCommandResponse {
  ok: boolean;
  seq?: number;
  error?: string;
  result?: unknown;
}

/**
 * Snapshot pushed on /control/state/stream. Sent verbatim by controlBridge.ts
 * on every mutation of a control-relevant slice. Small enough to send in full
 * on each update — no per-field deltas, no reconciliation logic.
 */
export interface ControlStateSnapshot {
  /** Scene id currently on air, null if nothing is programmed yet. */
  programSceneId: string | null;
  /** Scene id armed in preview, null if unarmed. */
  previewSceneId: string | null;
  /** True when the ON-AIR lamp is lit (a program scene is set AND the
   * output pipeline reports the program window is being pulled). */
  onAir: boolean;
  /** Rundown item currently on air, if any. */
  currentItemId: string | null;
  currentItemTitle: string | null;
  /** Progress into the current item, seconds. */
  currentItemProgress: number;
  currentItemDuration: number;
  nextItemTitle: string | null;
  isSchedulePlaying: boolean;
  recording: {
    active: boolean;
    path: string | null;
    startedAt: number | null;
  };
  ndi: {
    streaming: boolean;
    connections: number;
  };
  sceneCount: number;
  layerCount: number;
  /** Server-side monotonic snapshot counter (advances every push). */
  seq: number;
  /** `Date.now()` at the moment this snapshot was assembled. */
  timestamp: number;
}
