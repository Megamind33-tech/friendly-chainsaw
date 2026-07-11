import { invoke } from "@tauri-apps/api/core";
import type { RenderEnvelopeTransport } from "./contracts";

/** Tauri IPC implementation. A later renderer process can replace only this adapter. */
export const tauriRenderEnvelopeTransport: RenderEnvelopeTransport = {
  async publish(envelope) {
    await invoke("set_program_document", { doc: JSON.stringify(envelope) });
  },
};
