/**
 * Verification script for AR Asset Builder module.
 * Run: bun run scripts/verify-ar-asset-builder.ts
 */
import { projectSchema } from "../src/document/schema";
import { arBuilderAssetSchema, smartAssetDataSchema, smartAssetManifestSchema } from "../src/ar-asset-builder/schema";
import { createArBuilderAsset, createArAssetLayer } from "../src/ar-asset-builder/factory";
import { cloneArBuilderAsset } from "../src/ar-asset-builder/factory";
import { distributeLayersAcrossDepth } from "../src/ar-asset-builder/layers";
import { arAssetToSetNodes } from "../src/ar-asset-builder/placement";
import {
  buildSmartAssetDataSchema,
  buildSmartAssetManifest,
  exportAssetJson,
  exportSmartAsset,
  getAvailableExports,
} from "../src/ar-asset-builder/export";
import { ALL_AR_ASSET_PRESETS } from "../src/ar-asset-builder/presets";
import { createDefaultProject } from "../src/document/factory";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n=== AR Asset Builder Verification ===\n");

// Schema validation
console.log("Schema:");
const sample = createArBuilderAsset("Test", "sports", "player-profile", { width: 500, height: 900 }, {
  layers: [createArAssetLayer("Player")],
});
const parsed = arBuilderAssetSchema.safeParse(sample);
assert(parsed.success, "ArBuilderAsset schema validates sample asset");

const project = createDefaultProject("Test Project");
project.arBuilderAssets = [sample];
const projectParsed = projectSchema.safeParse(project);
assert(projectParsed.success, "Project schema accepts arBuilderAssets array");

// Factory
console.log("\nFactory:");
const clone = cloneArBuilderAsset(sample);
assert(clone.id !== sample.id, "Clone gets new ID");
assert(clone.layers[0].id !== sample.layers[0].id, "Clone layers get new IDs");

// Layers
console.log("\nLayers:");
const multi = {
  ...sample,
  layers: [
    createArAssetLayer("A"),
    createArAssetLayer("B"),
    createArAssetLayer("C"),
  ],
};
const distributed = distributeLayersAcrossDepth(multi);
assert(distributed.layers[2].transform.zDepth > 0, "Depth distribution assigns z-depth");

// Placement
console.log("\nPlacement:");
const nodes = arAssetToSetNodes(sample, []);
assert(nodes.length > 0, "Placement produces SetNodes");

// Export
console.log("\nExport:");
const exports = getAvailableExports(sample);
assert(exports[0] === "smart-asset", "Smart Asset export is the canonical first option");
assert(exports.includes("json"), "JSON export available");
const jsonExport = exportAssetJson(sample);
assert(jsonExport.blob.size > 0, "JSON export produces blob");

const boundAsset = createArBuilderAsset("Bound Candidate", "elections", "candidate-profile", { width: 600, height: 300 }, {
  layers: [createArAssetLayer("Portrait", { id: "portrait" })],
  states: { partyColor: "#3366cc" },
  bindings: [
    { targetPath: "states.name", source: "election.candidates.0.name", fallback: "-" },
    { targetPath: "states.partyColor", source: "election.candidates.0.partyColor", fallback: "#3366cc" },
    { targetPath: "layers.portrait.image", source: "election.candidates.0.photoUrl", fallback: "" },
    { targetPath: "layers.bar.percentage", source: "election.candidates.0.percentage", format: "{value}%", fallback: "0" },
  ],
});
const manifest = buildSmartAssetManifest(boundAsset, { portrait: "asset://portrait.png" });
const dataSchema = buildSmartAssetDataSchema(boundAsset);
const smartExport = exportSmartAsset(boundAsset);
const manifestParsed = smartAssetManifestSchema.safeParse(manifest);
const dataSchemaParsed = smartAssetDataSchema.safeParse(dataSchema);
assert(manifestParsed.success, "Smart Asset manifest schema validates asset.json");
assert(dataSchemaParsed.success, "Smart Asset data schema validates schema.json");
assert(manifest.schema.path === "schema.json", "Smart Asset manifest points at schema.json");
assert(manifest.bindingSlots.length === boundAsset.bindings.length, "Smart Asset manifest exposes one binding slot per builder binding");
assert(manifest.exposedNodes.some((node) => node.id === "portrait" && node.kind === "layer"), "Smart Asset manifest exposes real builder layers");
assert(manifest.exposedNodes.some((node) => node.id === "slot.bar" && node.kind === "slot"), "Smart Asset manifest exposes logical binding slots");
assert(smartExport.files.map((file) => file.filename).join(",") === "asset.json,schema.json", "Smart Asset export emits asset.json and schema.json");
assert(smartExport.files.every((file) => file.blob.size > 0), "Smart Asset export files are non-empty");

const electionSchema = dataSchema.properties.election as Record<string, any>;
const candidatesSchema = electionSchema.properties.candidates as Record<string, any>;
assert(candidatesSchema.type === "array", "Smart Asset schema converts numeric data paths into arrays");
assert(candidatesSchema.items.properties.percentage.type.includes("string"), "Smart Asset schema accepts formatted string values for numeric bindings");

// Presets
console.log("\nPresets:");
assert(ALL_AR_ASSET_PRESETS.length >= 30, `At least 30 presets defined (got ${ALL_AR_ASSET_PRESETS.length})`);
const electionPresets = ALL_AR_ASSET_PRESETS.filter((p) => p.category === "elections");
const sportsPresets = ALL_AR_ASSET_PRESETS.filter((p) => p.category === "sports");
const weatherPresets = ALL_AR_ASSET_PRESETS.filter((p) => p.category === "weather");
assert(electionPresets.length >= 10, `Election presets (got ${electionPresets.length})`);
assert(sportsPresets.length >= 8, `Sports presets (got ${sportsPresets.length})`);
assert(weatherPresets.length >= 8, `Weather presets (got ${weatherPresets.length})`);

for (const preset of ALL_AR_ASSET_PRESETS.slice(0, 5)) {
  const asset = preset.create();
  assert(arBuilderAssetSchema.safeParse(asset).success, `Preset ${preset.id} creates valid asset`);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
