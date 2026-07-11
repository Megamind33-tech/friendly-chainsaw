import {
  CHASE_PROGRAM_URL,
  OBS_BROWSER_SOURCE_KIND,
  OBS_DEFAULT_INPUT_NAME,
} from "./constants";
import type { ObsWebSocketClient } from "./obsWebSocket";

export interface ObsBrowserSourceOptions {
  inputName?: string;
  sceneName?: string;
  url?: string;
  width?: number;
  height?: number;
  fps?: number;
  shutdown?: boolean;
}

export interface ObsSetupResult {
  inputName: string;
  sceneName: string;
  created: boolean;
  url: string;
}

/** Ensure a Browser Source pointing at Chase `/program` exists in OBS. */
export async function ensureObsBrowserSource(
  client: ObsWebSocketClient,
  opts: ObsBrowserSourceOptions = {},
): Promise<ObsSetupResult> {
  const inputName = opts.inputName ?? OBS_DEFAULT_INPUT_NAME;
  const url = opts.url ?? CHASE_PROGRAM_URL;
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const fps = opts.fps ?? 30;

  const sceneList = await client.request<{ scenes: { sceneName: string }[] }>("GetSceneList");
  const sceneName =
    opts.sceneName ??
    (await client.request<{ currentProgramSceneName: string }>("GetCurrentProgramScene")).currentProgramSceneName ??
    sceneList.scenes[0]?.sceneName;

  if (!sceneName) throw new Error("OBS has no scenes");

  const inputs = await client.request<{ inputs: { inputName: string; inputKind: string }[] }>("GetInputList");
  const existing = inputs.inputs.find((i) => i.inputName === inputName);

  const settings = {
    url,
    width,
    height,
    fps,
    shutdown: opts.shutdown ?? false,
    reroute_audio: false,
  };

  let created = false;
  if (existing) {
    await client.request("SetInputSettings", {
      inputName,
      inputSettings: settings,
      overlay: true,
    });
  } else {
    await client.request("CreateInput", {
      sceneName,
      inputName,
      inputKind: OBS_BROWSER_SOURCE_KIND,
      inputSettings: settings,
      sceneItemEnabled: true,
    });
    created = true;
  }

  return { inputName, sceneName, created, url };
}

export async function getObsVersion(client: ObsWebSocketClient): Promise<string> {
  const v = await client.request<{ obsVersion: string; obsWebSocketVersion: string }>("GetVersion");
  return `${v.obsVersion} (WS ${v.obsWebSocketVersion})`;
}
