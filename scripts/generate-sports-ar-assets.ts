/**
 * Generates the Sports AR 3D Models distribution assets from the registry
 * (src/ar-engine/sportsPanels) — the single source of truth, so manifests
 * can never drift from the code:
 *
 *   public/assets/ar/sports/manifests/sports-ar-models.manifest.json
 *   public/assets/ar/sports/manifests/ar_sports_panel_XX.manifest.json ×10
 *   public/assets/ar/sports/models/ar_sports_panel_XX.glb ×10
 *
 * Run: bun run scripts/generate-sports-ar-assets.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// three's GLTFExporter assembles the GLB container through FileReader —
// browser-only. Bun has Blob but no FileReader, so provide the minimal
// async shim it needs (readAsArrayBuffer / readAsDataURL + onloadend).
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onload: ((ev: { target: NodeFileReader }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then(
      (buf) => {
        this.result = buf;
        this.onload?.({ target: this });
        this.onloadend?.();
      },
      (err) => this.onerror?.(err),
    );
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then(
      (buf) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
        this.onload?.({ target: this });
        this.onloadend?.();
      },
      (err) => this.onerror?.(err),
    );
  }
}
(globalThis as unknown as { FileReader?: unknown }).FileReader ??= NodeFileReader;

import { SPORTS_AR_MODELS, buildLibraryManifest, buildModelManifest } from "../src/ar-engine/sportsPanels";
import { exportSetNodeGlb } from "../src/ar-engine/sportsPanels/glbExport";

const ROOT = join(import.meta.dir, "..", "public", "assets", "ar", "sports");

async function main() {
  const manifestsDir = join(ROOT, "manifests");
  const modelsDir = join(ROOT, "models");
  const thumbsDir = join(ROOT, "thumbnails");
  const variantsDir = join(ROOT, "variants");
  const presetsDir = join(ROOT, "presets");
  for (const dir of [manifestsDir, modelsDir, thumbsDir, variantsDir, presetsDir]) {
    await mkdir(dir, { recursive: true });
  }

  if (SPORTS_AR_MODELS.length !== 10) {
    throw new Error(`Expected 10 models in the registry, found ${SPORTS_AR_MODELS.length}`);
  }

  // Library manifest — must list all 10.
  const library = buildLibraryManifest();
  await writeFile(join(manifestsDir, "sports-ar-models.manifest.json"), JSON.stringify(library, null, 2));
  console.log("wrote sports-ar-models.manifest.json (10 models)");

  for (const model of SPORTS_AR_MODELS) {
    const manifest = buildModelManifest(model);
    await writeFile(join(manifestsDir, `${model.id}.manifest.json`), JSON.stringify(manifest, null, 2));

    const root = model.build();
    const glb = await exportSetNodeGlb(root);
    await writeFile(join(modelsDir, `${model.id}.glb`), new Uint8Array(glb));
    console.log(`wrote ${model.id}.manifest.json + ${model.id}.glb (${(glb.byteLength / 1024).toFixed(1)} KB)`);
  }

  console.log("DONE — 1 library manifest, 10 model manifests, 10 GLBs");
}

main().catch((err) => {
  console.error("generate-sports-ar-assets FAILED:", err);
  process.exit(1);
});
