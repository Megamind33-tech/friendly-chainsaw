import { create } from "zustand";
import { sqliteSettingsRepository } from "@/adapters/sqliteStudioRepository";
import {
  OBS_DEFAULT_HOST,
  OBS_DEFAULT_PORT,
  OBS_DEFAULT_INPUT_NAME,
  VMIX_DEFAULT_HOST,
  VMIX_DEFAULT_PORT,
  VMIX_DEFAULT_INPUT_NAME,
} from "./constants";
import { ObsWebSocketClient } from "./obsWebSocket";
import { getObsVersion } from "./obsSetup";
import { getVmixVersion, pingVmix } from "./vmixClient";
import type { ObsConnectionState } from "./obsWebSocket";
import { createObsBrowserAutomation, createVmixBrowserAutomation } from "@/adapters/broadcastAutomation";

const BROADCAST_SETTINGS_KEY = "broadcast_settings";

let obsClient: ObsWebSocketClient | null = null;

function getObsClient(): ObsWebSocketClient {
  if (!obsClient) obsClient = new ObsWebSocketClient();
  return obsClient;
}

export interface BroadcastSettings {
  obs: {
    host: string;
    port: number;
    password: string;
    inputName: string;
    autoSetupOnConnect: boolean;
  };
  vmix: {
    host: string;
    port: number;
    inputName: string;
  };
}

const DEFAULT_SETTINGS: BroadcastSettings = {
  obs: {
    host: OBS_DEFAULT_HOST,
    port: OBS_DEFAULT_PORT,
    password: "",
    inputName: OBS_DEFAULT_INPUT_NAME,
    autoSetupOnConnect: true,
  },
  vmix: {
    host: VMIX_DEFAULT_HOST,
    port: VMIX_DEFAULT_PORT,
    inputName: VMIX_DEFAULT_INPUT_NAME,
  },
};

interface BroadcastState extends BroadcastSettings {
  obsState: ObsConnectionState;
  obsVersion: string | null;
  obsLastError: string | null;
  obsLastSetup: string | null;
  vmixConnected: boolean;
  vmixVersion: string | null;
  vmixLastError: string | null;
  vmixLastSetup: string | null;

  patchObs: (patch: Partial<BroadcastSettings["obs"]>) => void;
  patchVmix: (patch: Partial<BroadcastSettings["vmix"]>) => void;
  connectObs: () => Promise<void>;
  disconnectObs: () => void;
  setupObsBrowserSource: (width?: number, height?: number, fps?: number) => Promise<void>;
  connectVmix: () => Promise<void>;
  setupVmixBrowser: () => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  obsState: "disconnected",
  obsVersion: null,
  obsLastError: null,
  obsLastSetup: null,
  vmixConnected: false,
  vmixVersion: null,
  vmixLastError: null,
  vmixLastSetup: null,

  patchObs: (patch) => set((s) => ({ obs: { ...s.obs, ...patch } })),
  patchVmix: (patch) => set((s) => ({ vmix: { ...s.vmix, ...patch } })),

  connectObs: async () => {
    const { obs, obsState } = get();
    if (obsState === "connecting") return;
    set({ obsState: "connecting", obsLastError: null });
    try {
      const client = getObsClient();
      await client.connect({ host: obs.host, port: obs.port, password: obs.password || undefined });
      const version = await getObsVersion(client);
      set({ obsState: "connected", obsVersion: version, obsLastError: null });
      if (obs.autoSetupOnConnect) {
        await get().setupObsBrowserSource();
      }
    } catch (err) {
      getObsClient().disconnect();
      set({
        obsState: "error",
        obsVersion: null,
        obsLastError: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  disconnectObs: () => {
    getObsClient().disconnect();
    set({ obsState: "disconnected", obsVersion: null });
  },

  setupObsBrowserSource: async (width, height, fps) => {
    const client = getObsClient();
    if (!client.isConnected) throw new Error("Connect to OBS first");
    const { obs } = get();
    const result = await createObsBrowserAutomation(client, obs.inputName).setupBrowserSource({ width, height, fps });
    set({
      obsLastSetup: result.created
        ? `Created "${result.inputName}" in scene "${result.sceneName}"`
        : `Updated "${result.inputName}" in scene "${result.sceneName}"`,
      obsLastError: null,
    });
  },

  connectVmix: async () => {
    const { vmix } = get();
    set({ vmixLastError: null });
    const ok = await pingVmix({ host: vmix.host, port: vmix.port });
    if (!ok) {
      const msg = "vMix API not reachable — enable Web Controller in vMix Settings";
      set({ vmixConnected: false, vmixVersion: null, vmixLastError: msg });
      throw new Error(msg);
    }
    const version = await getVmixVersion({ host: vmix.host, port: vmix.port });
    set({ vmixConnected: true, vmixVersion: version, vmixLastError: null });
  },

  setupVmixBrowser: async () => {
    const { vmix, vmixConnected } = get();
    if (!vmixConnected) await get().connectVmix();
    const result = await createVmixBrowserAutomation(
      { host: vmix.host, port: vmix.port },
      vmix.inputName,
    ).setupBrowserSource({});
    set({
      vmixLastSetup:
        result.method === "add"
          ? `Added browser input "${result.inputName}"`
          : `Navigated "${result.inputName}" to Chase`,
      vmixLastError: null,
    });
  },

  loadSettings: async () => {
    try {
      const raw = await sqliteSettingsRepository.get(BROADCAST_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<BroadcastSettings>;
      set({
        obs: { ...DEFAULT_SETTINGS.obs, ...parsed.obs },
        vmix: { ...DEFAULT_SETTINGS.vmix, ...parsed.vmix },
      });
    } catch (err) {
      console.warn("failed to load broadcast settings", err);
    }
  },
}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function saveBroadcastSettings(): Promise<void> {
  const { obs, vmix } = useBroadcastStore.getState();
  const payload: BroadcastSettings = { obs, vmix };
  await sqliteSettingsRepository.set(BROADCAST_SETTINGS_KEY, JSON.stringify(payload));
}

function scheduleBroadcastSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveBroadcastSettings().catch((err) => console.error("broadcast settings save failed", err));
  }, 500);
}

useBroadcastStore.subscribe((state, prev) => {
  if (state.obs !== prev.obs || state.vmix !== prev.vmix) scheduleBroadcastSave();
});
