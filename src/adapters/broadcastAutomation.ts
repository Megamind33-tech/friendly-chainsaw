import type { BroadcastAutomation } from "./contracts";
import type { ObsWebSocketClient } from "@/broadcast/obsWebSocket";
import { ensureObsBrowserSource } from "@/broadcast/obsSetup";
import { ensureVmixBrowserInput, type VmixClientConfig } from "@/broadcast/vmixClient";

/** OBS remains an optional automation layer around the renderer URL. */
export function createObsBrowserAutomation(
  client: ObsWebSocketClient,
  inputName: string,
): BroadcastAutomation {
  return {
    async setupBrowserSource({ width, height, fps }) {
      return ensureObsBrowserSource(client, { inputName, width, height, fps });
    },
  };
}

/** vMix uses the same renderer contract, not a second rendering pipeline. */
export function createVmixBrowserAutomation(
  config: VmixClientConfig,
  inputName: string,
): BroadcastAutomation {
  return {
    async setupBrowserSource() {
      return ensureVmixBrowserInput(config, { inputName });
    },
  };
}
