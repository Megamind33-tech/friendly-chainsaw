import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit/regression tests. Deliberately separate from `vite.config.ts`: that
 * config carries the Tauri dev-server, HMR and `realism-effects`/three shim
 * plumbing needed to *run* the app, none of which a headless test run needs.
 * Only the `@/` alias has to match, and it is asserted below.
 *
 * `scripts/verify-phase*.ts` remain the phase-level acceptance suites and are
 * still run by CI; this covers the units they never reached — the data-source,
 * data-hub and binding paths that decide what actually reaches Program.
 */
export default defineConfig({
  test: {
    // happy-dom, not node: the data store and connector modules touch `window`
    // (dataSources.ts installs a 1s wall-clock interval on import).
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    restoreMocks: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
