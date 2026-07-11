import { invoke } from "@tauri-apps/api/core";

/**
 * NDI Tools Stage 1 — real network source discovery (NDIlib_find_*, see
 * src-tauri/src/ndi.rs's `find_sources`). No mock data: an empty result
 * genuinely means no NDI sources are visible on the network right now.
 */
export interface NdiSourceInfo {
  name: string;
  urlAddress: string | null;
}

export function listNdiSources(timeoutMs = 1500): Promise<NdiSourceInfo[]> {
  return invoke<NdiSourceInfo[]>("list_ndi_sources", { timeoutMs });
}
