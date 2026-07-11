import { MathUtils, Object3D, Vector3 } from "three";
import { getDb } from "@/lib/db";
import { createLightNode } from "@/document/factory";
import type { LightNode, Vec3 } from "@/document/types";

/**
 * Lighting-preset library for virtual sets (Phase 5) — built-in rig
 * templates plus operator-saved custom rigs, following the same
 * "cards, never dropdowns, fresh ids on apply" discipline as
 * src/sports templates and src/document/userTemplates.ts.
 */

// ---------------------------------------------------------------------------
// Color temperature.
// ---------------------------------------------------------------------------

/**
 * Standard Tanner Helland black-body approximation
 * (http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/),
 * clamped to a practical broadcast lighting range (~1000K tungsten-under to
 * ~12000K deep blue sky) since the polynomial fit degrades outside it.
 */
export function kelvinToHex(kelvin: number): string {
  const k = Math.min(12000, Math.max(1000, kelvin)) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (k <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
  }

  if (k <= 66) {
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  }

  if (k >= 66) {
    b = 255;
  } else if (k <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  }

  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  const toHex = (x: number) => clamp(x).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ---------------------------------------------------------------------------
// Aiming helper — same lookAt→Euler-degrees convention as studioSets.ts's
// rotationTowards, duplicated locally rather than exported from there.
// ---------------------------------------------------------------------------

function rotationTowards(from: Vec3, to: Vec3): Vec3 {
  const o = new Object3D();
  o.position.set(from.x, from.y, from.z);
  o.lookAt(new Vector3(to.x, to.y, to.z));
  return {
    x: MathUtils.radToDeg(o.rotation.x),
    y: MathUtils.radToDeg(o.rotation.y),
    z: MathUtils.radToDeg(o.rotation.z),
  };
}

/** Presenter reference point every preset aims at — standing at the origin,
 * ~1.5m tall. */
const SUBJECT: Vec3 = { x: 0, y: 1.5, z: 0 };

function aimedLight(
  lightType: LightNode["lightType"],
  name: string,
  position: Vec3,
  overrides: Partial<Pick<LightNode, "color" | "intensity" | "angle" | "penumbra" | "distance" | "castShadow">> = {},
): LightNode {
  return createLightNode(lightType, {
    name,
    transform: { position, rotation: rotationTowards(position, SUBJECT) },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Built-in preset rigs.
// ---------------------------------------------------------------------------

export interface LightingPreset {
  id: string;
  label: string;
  description: string;
  build: () => LightNode[];
}

function buildStudioStandard(): LightNode[] {
  return [
    aimedLight("spot", "Studio Key", { x: 3, y: 5, z: 4 }, {
      color: kelvinToHex(5600),
      intensity: 45,
      angle: 34,
      penumbra: 0.5,
      castShadow: true,
    }),
    // Fill is a point light (omnidirectional soft wrap) — no aim needed.
    createLightNode("point", {
      name: "Studio Fill",
      transform: { position: { x: -3, y: 3, z: 3 } },
      color: kelvinToHex(4800),
      intensity: 10,
      castShadow: false,
    }),
    aimedLight("spot", "Studio Rim", { x: 0, y: 4, z: -5 }, {
      color: kelvinToHex(6500),
      intensity: 30,
      angle: 28,
      penumbra: 0.4,
      castShadow: false,
    }),
  ];
}

function buildNewsDesk(): LightNode[] {
  return [
    aimedLight("spot", "News Key", { x: 2.5, y: 5, z: 4 }, {
      color: kelvinToHex(5600),
      intensity: 55,
      angle: 36,
      penumbra: 0.4,
      castShadow: true,
    }),
    aimedLight("spot", "News Fill", { x: -2.5, y: 4.5, z: 3.5 }, {
      color: kelvinToHex(5000),
      intensity: 38,
      angle: 42,
      penumbra: 0.6,
      castShadow: false,
    }),
    aimedLight("spot", "News Rim", { x: 0, y: 4.5, z: -5 }, {
      color: kelvinToHex(7000),
      intensity: 32,
      angle: 26,
      penumbra: 0.3,
      castShadow: false,
    }),
  ];
}

function buildSportsArena(): LightNode[] {
  return [
    aimedLight("directional", "Sports Key L", { x: 5, y: 8, z: 4 }, {
      color: kelvinToHex(6500),
      intensity: 4,
      castShadow: true,
    }),
    aimedLight("directional", "Sports Key R", { x: -5, y: 8, z: 4 }, {
      color: kelvinToHex(7000),
      intensity: 3.5,
      castShadow: true,
    }),
    createLightNode("point", {
      name: "Sports Fill L",
      transform: { position: { x: 4, y: 3, z: -2 } },
      color: kelvinToHex(6800),
      intensity: 6,
      castShadow: false,
    }),
    createLightNode("point", {
      name: "Sports Fill R",
      transform: { position: { x: -4, y: 3, z: -2 } },
      color: kelvinToHex(6800),
      intensity: 6,
      castShadow: false,
    }),
  ];
}

function buildDramatic(): LightNode[] {
  return [
    aimedLight("spot", "Dramatic Key", { x: 4, y: 4, z: 3 }, {
      color: kelvinToHex(3800),
      intensity: 55,
      angle: 22,
      penumbra: 0.15,
      castShadow: true,
    }),
    createLightNode("point", {
      name: "Dramatic Fill",
      transform: { position: { x: -3, y: 2, z: 2 } },
      color: kelvinToHex(3800),
      intensity: 2,
      castShadow: false,
    }),
    aimedLight("spot", "Dramatic Rim", { x: 0, y: 4, z: -5 }, {
      // Strong colored rim — deep blue, not a color-temperature hex.
      color: "#1a2a8c",
      intensity: 40,
      angle: 25,
      penumbra: 0.3,
      castShadow: false,
    }),
  ];
}

function buildSoftboxInterview(): LightNode[] {
  return [
    aimedLight("spot", "Softbox Left", { x: 3, y: 3.5, z: 3 }, {
      color: kelvinToHex(4300),
      intensity: 32,
      angle: 55,
      penumbra: 0.9,
      castShadow: false,
    }),
    aimedLight("spot", "Softbox Right", { x: -3, y: 3.5, z: 3 }, {
      color: kelvinToHex(4300),
      intensity: 32,
      angle: 55,
      penumbra: 0.9,
      castShadow: false,
    }),
    aimedLight("spot", "Softbox Rim", { x: 0, y: 4, z: -4 }, {
      color: kelvinToHex(5000),
      intensity: 18,
      angle: 35,
      penumbra: 0.6,
      castShadow: false,
    }),
  ];
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: "studio",
    label: "Studio Standard",
    description: "Neutral 3-point rig — 5600K key with shadow, 4800K soft fill, 6500K rim.",
    build: buildStudioStandard,
  },
  {
    id: "news",
    label: "News Desk",
    description: "Bright, even key + fill with a cool rim — crisp anchor-desk lighting.",
    build: buildNewsDesk,
  },
  {
    id: "sports",
    label: "Sports Arena",
    description: "Cool 6500-7000K directional pair with punchy ambient-style fill points.",
    build: buildSportsArena,
  },
  {
    id: "dramatic",
    label: "Dramatic",
    description: "Single hard warm 3800K key, very low fill, strong deep-blue colored rim.",
    build: buildDramatic,
  },
  {
    id: "softbox",
    label: "Softbox Interview",
    description: "Two large soft 4300K fills at 45°, gentle rim — no harsh shadows.",
    build: buildSoftboxInterview,
  },
];

// ---------------------------------------------------------------------------
// Operator-saved presets — persisted as one JSON array in the existing
// app_state k/v table, the same way persistence.ts stores open_project.
// ---------------------------------------------------------------------------

export interface SavedLightingPreset {
  id: string;
  name: string;
  lights: LightNode[];
}

const USER_LIGHTING_PRESETS_KEY = "user_lighting_presets";

interface AppStateRow {
  v: string;
}

export async function loadUserLightingPresets(): Promise<SavedLightingPreset[]> {
  try {
    const db = await getDb();
    const rows = await db.select<AppStateRow[]>("SELECT v FROM app_state WHERE k = $1", [
      USER_LIGHTING_PRESETS_KEY,
    ]);
    const raw = rows[0]?.v;
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedLightingPreset[];
  } catch (err) {
    console.warn("failed to load user lighting presets, returning empty list", err);
    return [];
  }
}

export async function saveUserLightingPresets(presets: SavedLightingPreset[]): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO app_state (k, v) VALUES ($1, $2) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    [USER_LIGHTING_PRESETS_KEY, JSON.stringify(presets)],
  );
}
