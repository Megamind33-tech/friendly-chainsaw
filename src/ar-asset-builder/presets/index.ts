import type { ArAssetPreset } from "./election";
import { ELECTION_PRESETS } from "./election";
import { SPORTS_PRESETS } from "./sports";
import { WEATHER_PRESETS } from "./weather";

export type { ArAssetPreset } from "./election";

export const ALL_AR_ASSET_PRESETS: ArAssetPreset[] = [
  ...ELECTION_PRESETS,
  ...SPORTS_PRESETS,
  ...WEATHER_PRESETS,
];

export function getPresetsByCategory(category: string): ArAssetPreset[] {
  return ALL_AR_ASSET_PRESETS.filter((p) => p.category === category);
}

export function getPresetById(id: string): ArAssetPreset | undefined {
  return ALL_AR_ASSET_PRESETS.find((p) => p.id === id);
}
