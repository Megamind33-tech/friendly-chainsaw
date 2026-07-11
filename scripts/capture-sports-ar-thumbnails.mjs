/**
 * Captures the 10 Sports AR model thumbnails through the dev server's
 * thumbnail harness (thumbnails.html → src/thumbnailHarness.ts), which
 * renders the REAL model geometry — never a mockup image.
 *
 * Run: node scripts/capture-sports-ar-thumbnails.mjs
 * Requires the vite dev server on port 1423.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(fileURLToPath(new URL("..", import.meta.url)), "public", "assets", "ar", "sports", "thumbnails");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  page.on("pageerror", (err) => console.error("page error:", err.message));
  await page.goto("http://localhost:1423/thumbnails.html", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForFunction(() => typeof window.renderSportsArThumbnails === "function", { timeout: 30_000 });
  const shots = await page.evaluate(() => window.renderSportsArThumbnails());
  await mkdir(outDir, { recursive: true });
  let count = 0;
  for (const [id, dataUrl] of Object.entries(shots)) {
    const base64 = dataUrl.split(",")[1];
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 5_000) throw new Error(`${id}: suspiciously small PNG (${bytes.length}B) — likely a blank render`);
    await writeFile(join(outDir, `${id}.png`), bytes);
    console.log(`wrote ${id}.png (${(bytes.length / 1024).toFixed(0)} KB)`);
    count += 1;
  }
  if (count !== 10) throw new Error(`expected 10 thumbnails, wrote ${count}`);
  console.log("DONE — 10 real-geometry thumbnails");
} finally {
  await browser.close();
}
