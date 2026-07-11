import { invoke } from "@tauri-apps/api/core";

/**
 * AI image-gen key management (Tauri IPC, not HTTP — this is small JSON, not
 * a binary upload). The raw key is write-only from the frontend's
 * perspective: `setOpenAiApiKey` sends it once to be stored in a Rust-only
 * settings file, and every other call only ever gets back a `configured`
 * boolean — the key itself never round-trips into the web layer. Generation
 * itself (`generateAiImageAsset` in assetImport.ts) hits the axum sidecar,
 * which reads the same stored key server-side.
 */
export interface AiSettingsStatus {
  configured: boolean;
  model: string | null;
}

export function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  return invoke<AiSettingsStatus>("get_ai_settings_status");
}

export function setOpenAiApiKey(key: string, model?: string): Promise<void> {
  return invoke("set_openai_api_key", { key, model: model || undefined });
}

export function clearOpenAiApiKey(): Promise<void> {
  return invoke("clear_openai_api_key");
}
