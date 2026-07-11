import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const devPort = Number(process.env.VITE_DEV_PORT) || 1423;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Subpath imports must resolve to the real package (not the shim file).
      "three/examples": path.resolve(__dirname, "./node_modules/three/examples"),
      // realism-effects@1.1.2 imports WebGLMultipleRenderTargets (removed three r172+).
      three: path.resolve(__dirname, "./src/shims/three.ts"),
      "three-original": path.resolve(__dirname, "./node_modules/three/build/three.module.js"),
    },
  },

  // Pre-bundle every heavy dependency up front. Without this, Vite discovers
  // deep imports (drei, postprocessing, three examples) lazily and re-runs
  // the optimizer mid-session — the Tauri webview then races the reload and
  // gets "504 Outdated Optimize Dep" on its module URLs (hit live 2026-07-05:
  // the Control Room loaded before drei finished re-optimizing and never
  // mounted).
  optimizeDeps: {
    include: [
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/postprocessing",
      "three/examples/jsm/loaders/GLTFLoader.js",
      "three/examples/jsm/loaders/FBXLoader.js",
      "three/examples/jsm/loaders/OBJLoader.js",
      "konva",
      "react-konva",
      "zustand",
      "zustand/react/shallow",
      "zundo",
      "immer",
      "gsap",
      "dockview-react",
      "realism-effects",
      "postprocessing",
    ],
    esbuildOptions: {
      alias: {
        three: path.resolve(__dirname, "./src/shims/three.ts"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: devPort,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      // The renderer is a separate production entry: OBS/vMix never load
      // authoring panels, docking UI, or SQLite initialization.
      input: {
        control: path.resolve(__dirname, "index.html"),
        renderer: path.resolve(__dirname, "renderer.html"),
      },
    },
  },
}));
