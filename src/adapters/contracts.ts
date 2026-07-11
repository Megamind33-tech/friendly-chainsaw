import type { RenderEnvelope } from "@/document/renderEnvelope";
import type { ID, Project } from "@/document/types";

/** Narrow persistence boundary; UI state must not depend on SQL details. */
export interface ProjectRepository {
  load(projectId: ID): Promise<{ project: Project; schemaVersion: number; program: string | null } | null>;
  insert(project: Project): Promise<void>;
  save(project: Project): Promise<void>;
  saveProgramState(projectId: ID, state: { programSceneId: ID | null; previewSceneId: ID | null }): Promise<void>;
}

/** Small key/value boundary for application and connector settings. */
export interface SettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** The sole contract a renderer needs from the Control Room process. */
export interface RenderEnvelopeTransport {
  publish(envelope: RenderEnvelope): Promise<void>;
}

/** Future asset implementations may use the local sidecar, Spout, or a CDN. */
export interface AssetTransport {
  upload(file: File): Promise<{ file: string; url: string; bytes: number }>;
}

/** OBS/vMix integration is optional automation around the same renderer URL. */
export interface BroadcastAutomation {
  setupBrowserSource(input: { width?: number; height?: number; fps?: number }): Promise<{
    inputName: string;
    sceneName?: string;
    created?: boolean;
    method?: "add" | "navigate";
  }>;
}

/** External data adapters always normalize to the binding key/value contract. */
export interface DataConnector {
  fetch(): Promise<Record<string, string>>;
}
