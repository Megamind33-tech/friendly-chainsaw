import { invoke } from "@tauri-apps/api/core";
import type { ProgramItem, ProgramType } from "./playout";

/**
 * Rundown Studio connector — TS-side wrapper. Mirrors the Tauri commands in
 * src-tauri/src/rundowncloud.rs and adds the pure `mapCueToItem` transform
 * so the same code the UI runs is what verify-phase9.ts exercises.
 */

export interface RundownCloudStatus {
  configured: boolean;
  rundownId: string | null;
  baseUrl: string;
}

export interface PingResult {
  ok: boolean;
  httpStatus: number;
}

export interface RundownMetadata {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RundownCue {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  /** Duration in milliseconds — Rundown Studio's unit. */
  duration: number;
  backgroundColor?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CuesResponse {
  cues: RundownCue[];
}

export function getRundownCloudStatus(): Promise<RundownCloudStatus> {
  return invoke<RundownCloudStatus>("get_rundowncloud_status");
}

export function setRundownCloudConfig(apiToken: string, rundownId: string): Promise<void> {
  return invoke<void>("set_rundowncloud_config", { apiToken, rundownId });
}

export function clearRundownCloudConfig(): Promise<void> {
  return invoke<void>("clear_rundowncloud_config");
}

export function pingRundownCloud(): Promise<PingResult> {
  return invoke<PingResult>("ping_rundowncloud");
}

export function fetchRundownCloudRundown(): Promise<RundownMetadata> {
  return invoke<RundownMetadata>("fetch_rundowncloud_rundown");
}

export function fetchRundownCloudCues(): Promise<CuesResponse> {
  return invoke<CuesResponse>("fetch_rundowncloud_cues");
}

let idCounter = 0;
function newLocalId(): string {
  return `po-rs-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

/**
 * Pure map from a Rundown Studio Cue to our ProgramItem. Deliberately
 * exported and side-effect-free so scripts/verify-phase9.ts can pin the
 * mapping without spinning up a store or the Tauri IPC layer.
 *
 * Design decisions documented in docs/PHASE9_DESIGN.md:
 *   * ms → s conversion, clamped to a minimum of 1s (the playout ticker
 *     divide-by-zero-guard).
 *   * `type` inferred: RS uses freeform strings; if the title contains
 *     "live" (case-insensitive), we surface it as a "live" ProgramItem
 *     so it inherits Phase 7's HOLD-past-planned semantics. Otherwise
 *     "program". Operator can edit type after import.
 *   * `sceneId` is always null — no scene correlation is knowable at
 *     import time; the operator assigns.
 *   * `id` is regenerated locally — a Rundown Studio Cue id would collide
 *     with our own po-<timestamp> convention if reused, and we don't
 *     round-trip Cue ids back to Rundown Studio here (that's the deferred
 *     two-way sync scope).
 */
export function mapCueToItem(cue: RundownCue): ProgramItem {
  const seconds = Math.max(1, Math.round((cue.duration ?? 0) / 1000));
  const title = (cue.title ?? "").trim() || "Untitled cue";
  const looksLive = /\blive\b/i.test(title);
  const type: ProgramType = looksLive ? "live" : "program";
  return {
    id: newLocalId(),
    title,
    type,
    sceneId: null,
    duration: seconds,
  };
}

export function mapCuesToItems(cues: RundownCue[]): ProgramItem[] {
  return cues.map(mapCueToItem);
}
