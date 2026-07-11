import type { Asset } from "@/document/types";
import { importModelFile } from "@/components/set3d/assetImport";

/**
 * Curated free 3D starter library for AR set dressing and props.
 *
 * Sources (researched 2026-07-09; both chosen because they serve DIRECT,
 * CORS-friendly GLB URLs — Quaternius/Kenney/Sketchfab distribute via
 * Google Drive/zips/auth and cannot be fetched by an in-app downloader):
 *  1. Khronos glTF-Sample-Assets (github raw) — stable per-model URLs,
 *     permissive per-model licenses (CC0 / CC-BY, see each model's README
 *     in the repo; `license` below records the attribution string).
 *  2. ToxSam/open-source-3D-assets — a CC0 registry of 991+ GLB models
 *     with a JSON index; fetched AT RUNTIME to top the library up past 50
 *     without hard-coding a second manifest here.
 *
 * Downloads run in the WEBVIEW (this network blocks shell TLS but the
 * app's own fetch works — same path the AI image feature uses) and every
 * file goes through the REAL import pipeline (`importModelFile`): sidecar
 * upload → offscreen WebGL render → genuine thumbnail. Failures are
 * reported per item and skipped — never faked.
 */

export interface StarterAsset {
  name: string;
  category: "props" | "furniture" | "tech" | "nature" | "vehicles" | "decor" | "characters";
  url: string;
  license: string;
}

const KHRONOS = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";
const k = (model: string, name: string, category: StarterAsset["category"]): StarterAsset => ({
  name,
  category,
  url: `${KHRONOS}/${model}/glTF-Binary/${model}.glb`,
  license: `Khronos glTF-Sample-Assets — ${model} (see model README; CC0/CC-BY family)`,
});

export const STARTER_ASSETS: StarterAsset[] = [
  k("Duck", "Rubber Duck", "props"),
  k("Avocado", "Avocado", "props"),
  k("BoomBox", "Boom Box", "tech"),
  k("DamagedHelmet", "Battle Helmet", "props"),
  k("Lantern", "Lantern", "decor"),
  k("WaterBottle", "Water Bottle", "props"),
  k("Corset", "Corset", "props"),
  k("Fox", "Fox", "characters"),
  k("CesiumMan", "Test Presenter", "characters"),
  k("CesiumMilkTruck", "Milk Truck", "vehicles"),
  k("BrainStem", "Robot Character", "characters"),
  k("AntiqueCamera", "Antique Camera", "tech"),
  k("SciFiHelmet", "Sci-Fi Helmet", "props"),
  k("ToyCar", "Toy Car", "vehicles"),
  k("MaterialsVariantsShoe", "Sneaker", "props"),
  k("IridescenceLamp", "Iridescent Lamp", "decor"),
  k("SheenChair", "Fabric Chair", "furniture"),
  k("GlamVelvetSofa", "Velvet Sofa", "furniture"),
  k("ABeautifulGame", "Chess Set", "decor"),
  k("DragonAttenuation", "Glass Dragon", "decor"),
  k("MosquitoInAmber", "Amber Fossil", "decor"),
  k("StainedGlassLamp", "Stained-Glass Lamp", "decor"),
  k("PotOfCoals", "Pot of Coals", "decor"),
  k("ChronographWatch", "Chronograph Watch", "props"),
  k("GlassHurricaneCandleHolder", "Glass Candle Holder", "decor"),
  k("GlassVaseFlowers", "Vase of Flowers", "nature"),
  k("CommercialRefrigerator", "Display Fridge", "furniture"),
  k("AnisotropyBarnLamp", "Barn Lamp", "decor"),
  k("IridescentDishWithOlives", "Dish with Olives", "props"),
  k("SunglassesKhronos", "Sunglasses", "props"),
  k("LightsPunctualLamp", "Desk Lamp", "decor"),
  k("DiffuseTransmissionPlant", "Potted Plant", "nature"),
  k("ChairDamaskPurplegold", "Damask Chair", "furniture"),
  k("GlassBrokenWindow", "Broken Window", "decor"),
  k("CarbonFibre", "Carbon-Fibre Sample", "props"),
];

/** ToxSam CC0 registry index (991+ GLB entries). Fetched at runtime to
 * extend the library past 50 items without hard-coding hashes. */
const TOXSAM_INDEX =
  "https://raw.githubusercontent.com/ToxSam/open-source-3D-assets/main/assets.json";

interface ToxSamEntry {
  name?: string;
  title?: string;
  url?: string;
  glb?: string;
  file?: string;
}

async function fetchToxSamAssets(count: number): Promise<StarterAsset[]> {
  const res = await fetch(TOXSAM_INDEX);
  if (!res.ok) throw new Error(`registry index HTTP ${res.status}`);
  const raw = (await res.json()) as unknown;
  const list: ToxSamEntry[] = Array.isArray(raw)
    ? (raw as ToxSamEntry[])
    : ((raw as { assets?: ToxSamEntry[] }).assets ?? []);
  return list
    .map((e) => ({ name: e.name ?? e.title ?? "CC0 model", url: e.url ?? e.glb ?? e.file ?? "" }))
    .filter((e) => e.url.toLowerCase().endsWith(".glb"))
    .slice(0, count)
    .map((e) => ({ name: e.name, category: "props" as const, url: e.url, license: "CC0 (ToxSam open-source-3D-assets registry)" }));
}

export interface StarterProgress {
  done: number;
  total: number;
  current: string;
  errors: string[];
}

/**
 * Downloads the library through the real import pipeline. Calls `onAsset`
 * for each successfully imported Asset (caller adds it to the project) and
 * `onProgress` after every attempt. Returns the error list — honest
 * reporting, no silent skips.
 */
export async function downloadStarterLibrary(
  onAsset: (asset: Asset) => void,
  onProgress: (p: StarterProgress) => void,
  target = 50,
): Promise<string[]> {
  let entries: StarterAsset[] = [...STARTER_ASSETS];
  if (entries.length < target) {
    try {
      entries = entries.concat(await fetchToxSamAssets(target - entries.length + 5));
    } catch (err) {
      // Registry unreachable — proceed with the curated core, report it.
      onProgress({ done: 0, total: entries.length, current: "", errors: [`CC0 registry index unavailable: ${err instanceof Error ? err.message : String(err)}`] });
    }
  }
  const errors: string[] = [];
  let done = 0;
  for (const entry of entries) {
    onProgress({ done, total: entries.length, current: entry.name, errors });
    try {
      const res = await fetch(entry.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${entry.name.replace(/[^a-z0-9]+/gi, "_")}.glb`, { type: "model/gltf-binary" });
      // The REAL pipeline: sidecar upload + offscreen-WebGL thumbnail.
      const asset = await importModelFile(file);
      asset.name = entry.name;
      onAsset(asset);
    } catch (err) {
      errors.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done += 1;
  }
  onProgress({ done, total: entries.length, current: "", errors });
  return errors;
}
