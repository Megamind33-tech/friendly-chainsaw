import type { AssetTransport } from "./contracts";

const SIDECAR_URL = "http://127.0.0.1:4977";

/** Sidecar-backed asset transport with an explicit local-preview fallback. */
export const sidecarAssetTransport: AssetTransport = {
  async upload(file) {
    try {
      const response = await fetch(`${SIDECAR_URL}/assets?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: file,
      });
      if (response.ok) return response.json() as Promise<{ file: string; url: string; bytes: number }>;
      console.warn(`asset sidecar upload failed (${response.status}); using local blob URL`);
    } catch (error) {
      console.warn("asset sidecar unreachable; using local blob URL", error);
    }
    return { file: file.name, url: URL.createObjectURL(file), bytes: file.size };
  },
};
