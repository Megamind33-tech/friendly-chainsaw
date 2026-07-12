import { invoke } from "@tauri-apps/api/core";

/**
 * Phase 10a — MOS Protocol connector wrappers. Mirrors the Tauri commands
 * in src-tauri/src/mos.rs. Stage 1 config surface only — the wire-level
 * TCP listener is intentionally not yet spawned in Rust's startup path;
 * enabling it via UI is a follow-up (see docs/PHASE10_DESIGN.md's
 * deferrals).
 */

export interface MosStatus {
  enabled: boolean;
  listenPort: number;
  ourMosId: string;
  expectedNcsId: string | null;
}

export function getMosStatus(): Promise<MosStatus> {
  return invoke<MosStatus>("get_mos_status");
}

export function setMosConfig(config: {
  listenPort: number;
  ourMosId: string;
  expectedNcsId: string | null;
  enabled: boolean;
}): Promise<void> {
  return invoke<void>("set_mos_config", config);
}

/**
 * Phase 10.2 — send an outbound `roItemCue` frame to every active MOS
 * connection. Empty `roId` → Rust falls back to the most recently seen
 * inbound roID (operator mental model: "same rundown as the last one
 * that came in"). Returns `true` if at least one connection was
 * subscribed at publish time; `false` is not an error, just "nobody
 * listening" — mirrors the design in docs/PHASE10_2_DESIGN.md.
 */
export function sendMosItemCue(roId: string, storyId: string): Promise<boolean> {
  return invoke<boolean>("send_mos_item_cue", { roId, storyId });
}
