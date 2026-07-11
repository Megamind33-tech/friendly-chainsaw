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
