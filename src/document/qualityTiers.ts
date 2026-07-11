import type { SetRenderSettings } from "./types";

/** Broadcast quality tiers for set3d — see docs/REALISM_PIPELINE.md §6. */
export type QualityTier = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// Machine auto-detection — the app sizes itself to the machine it's on.
// ---------------------------------------------------------------------------

export interface MachineProfile {
  tier: QualityTier;
  gpu: string;
  cores: number;
  /** navigator.deviceMemory (GiB, capped at 8 by Chromium) — null if the
   * API is unavailable. */
  memoryGb: number | null;
}

let cachedProfile: MachineProfile | null = null;

/** Reads the real GPU renderer string, core count and device memory ONCE
 * per window and derives a quality tier: discrete GPU + plenty of cores =
 * high, capable integrated/mid machines = medium, everything else = low.
 * Heuristic by design (an honest floor, not a benchmark) — the operator can
 * always override per set in the Inspector's Render Quality section. */
export function detectMachineProfile(): MachineProfile {
  if (cachedProfile) return cachedProfile;
  let gpu = "unknown";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // Detection must never break rendering — fall through to "unknown".
  }
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4;
  const memoryGb =
    typeof navigator !== "undefined" && "deviceMemory" in navigator
      ? ((navigator as { deviceMemory?: number }).deviceMemory ?? null)
      : null;

  // Discrete before integrated: strings like "Intel(R) UHD Graphics" vs
  // "NVIDIA GeForce RTX 3060" / "AMD Radeon RX 6600". SwiftShader/basic
  // renderers mean software GL — always low.
  const g = gpu.toLowerCase();
  const software = /swiftshader|software|llvmpipe|basic render/.test(g);
  const discrete = !software && /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d/.test(g);

  let tier: QualityTier;
  if (software) tier = "low";
  else if (discrete && cores >= 8) tier = "high";
  else if (discrete || (cores >= 8 && (memoryGb ?? 8) >= 8)) tier = "medium";
  else tier = "low";

  cachedProfile = { tier, gpu, cores, memoryGb };
  return cachedProfile;
}

/** The tier new sets should default to on THIS machine. */
export function autoQualityTier(): QualityTier {
  // SSR guards against non-browser contexts (verify scripts run in node).
  if (typeof document === "undefined") return "low";
  return detectMachineProfile().tier;
}

/** Suggested render knobs for a tier. Does not delete advanced overrides;
 * applying a tier merges these recommendations into the live settings. */
export function settingsForQualityTier(tier: QualityTier): Partial<SetRenderSettings> {
  switch (tier) {
    case "low":
      return {
        qualityTier: "low",
        dpr: 1,
        shadows: false,
        contactShadows: { enabled: true, opacity: 0.4, blur: 2 },
        envLight: { enabled: true, intensity: 0.35 },
        envResolution: 64,
        planarReflection: { enabled: false, maxCount: 1 },
        ao: { enabled: false, intensity: 1 },
        bloom: { enabled: false, intensity: 0.6, threshold: 0.9 },
        vignette: { enabled: false, darkness: 0.6 },
        ssr: { enabled: false },
      };
    case "medium":
      return {
        qualityTier: "medium",
        dpr: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1,
        shadows: false,
        contactShadows: { enabled: true, opacity: 0.4, blur: 2 },
        envLight: { enabled: true, intensity: 0.35 },
        envResolution: 128,
        planarReflection: { enabled: true, maxCount: 1 },
        ao: { enabled: false, intensity: 1 },
        ssr: { enabled: false },
      };
    case "high":
      return {
        qualityTier: "high",
        dpr: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1,
        // Real shadow maps stay an EXPLICIT Inspector toggle, never a tier
        // side-effect: enabling them via auto-HIGH produced per-frame
        // "GL_INVALID_OPERATION: texture format / sampler type" spam on
        // Windows/ANGLE (observed live 2026-07-08). Contact shadows carry
        // the grounding look at every tier.
        shadows: false,
        contactShadows: { enabled: true, opacity: 0.35, blur: 2 },
        envLight: { enabled: true, intensity: 0.4 },
        envResolution: 256,
        planarReflection: { enabled: true, maxCount: 2 },
        ao: { enabled: false, intensity: 1 },
        // High unlocks the SSR knob — does not force it on (pipeline §3.4).
        ssr: { enabled: false },
      };
  }
}

/** Effective canvas DPR — authored value boosted to device ratio within tier cap. */
export function resolveDpr(render: SetRenderSettings): number {
  const tierMax = render.qualityTier === "high" ? 2 : render.qualityTier === "medium" ? 1.5 : 1;
  const device = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const target = Math.max(render.dpr, Math.min(device, tierMax));
  return Math.min(target, tierMax);
}

/** Env bake resolution, with tier fallback when `envResolution` is unset. */
export function resolveEnvResolution(render: SetRenderSettings): number {
  if (typeof render.envResolution === "number" && render.envResolution > 0) {
    return Math.min(Math.max(Math.round(render.envResolution), 16), 512);
  }
  switch (render.qualityTier) {
    case "high":
      return 256;
    case "medium":
      return 128;
    default:
      return 64;
  }
}

/** Whether hero planar reflections may mount (Med+/explicit enable). */
export function planarReflectionsAllowed(render: SetRenderSettings): boolean {
  if (render.qualityTier === "low") return false;
  if (render.planarReflection?.enabled === false) return false;
  if (render.planarReflection?.enabled === true) return true;
  // Default: allow when Med+ even if planarReflection field absent (docs Med = floor).
  return render.qualityTier === "medium" || render.qualityTier === "high";
}

export function planarMaxCount(render: SetRenderSettings): 1 | 2 {
  if (render.qualityTier === "high") {
    return render.planarReflection?.maxCount === 2 ? 2 : 1;
  }
  return 1;
}

/** SSR mounts only on High *and* when explicitly enabled. */
export function ssrAllowed(render: SetRenderSettings): boolean {
  return render.qualityTier === "high" && !!render.ssr?.enabled;
}

/** Whether the studio floor should mount MeshReflectorMaterial. */
export function shouldUseFloorReflector(
  render: SetRenderSettings,
  floor: { reflector?: { enabled: boolean } },
): boolean {
  if (!planarReflectionsAllowed(render)) return false;
  // Explicit floor.reflector.enabled wins; absent reflector on old docs =
  // follow planarReflection.enabled only (don't surprise with a cost).
  if (floor.reflector) return floor.reflector.enabled;
  return !!render.planarReflection?.enabled;
}

/** Hero desk planar — High tier with maxCount 2 and primitive tagged. */
export function shouldUseDeskReflector(
  render: SetRenderSettings,
  node: { reflector?: boolean },
): boolean {
  if (!node.reflector) return false;
  if (!planarReflectionsAllowed(render)) return false;
  if (render.qualityTier !== "high") return false;
  return planarMaxCount(render) >= 2;
}
