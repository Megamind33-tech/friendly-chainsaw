/**
 * vMix Web API client — HTTP on port 8088 by default.
 * Used to add/navigate a Browser input to Chase `/program`.
 */

import { CHASE_PROGRAM_URL, VMIX_DEFAULT_INPUT_NAME } from "./constants";

export interface VmixClientConfig {
  host: string;
  port: number;
}

export interface VmixSetupResult {
  inputName: string;
  url: string;
  method: "navigate" | "add";
}

function apiUrl(config: VmixClientConfig, params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  return `http://${config.host}:${config.port}/api/?${q.toString()}`;
}

export async function pingVmix(config: VmixClientConfig): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(config, { Function: "GetVersion" }), { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getVmixVersion(config: VmixClientConfig): Promise<string | null> {
  try {
    const res = await fetch(apiUrl(config, { Function: "GetVersion" }), { method: "GET" });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || "connected";
  } catch {
    return null;
  }
}

/**
 * Point a vMix Browser input at Chase program output.
 * Tries BrowserNavigate on existing input first, then AddInput.
 */
export async function ensureVmixBrowserInput(
  config: VmixClientConfig,
  opts: { inputName?: string; url?: string } = {},
): Promise<VmixSetupResult> {
  const inputName = opts.inputName ?? VMIX_DEFAULT_INPUT_NAME;
  const url = opts.url ?? CHASE_PROGRAM_URL;

  // Try navigate existing browser input
  const navRes = await fetch(
    apiUrl(config, {
      Function: "BrowserNavigate",
      Input: inputName,
      Value: url,
    }),
  );
  if (navRes.ok) {
    return { inputName, url, method: "navigate" };
  }

  // Add new browser input — vMix format: Browser|Title|URL
  const addValue = `Browser|${inputName}|${url}`;
  const addRes = await fetch(
    apiUrl(config, {
      Function: "AddInput",
      Value: addValue,
    }),
  );
  if (!addRes.ok) {
    const body = await addRes.text().catch(() => "");
    throw new Error(`vMix AddInput failed (${addRes.status})${body ? `: ${body}` : ""}`);
  }

  return { inputName, url, method: "add" };
}
