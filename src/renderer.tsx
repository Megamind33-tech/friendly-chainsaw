import "@/shims/three";
import React from "react";
import ReactDOM from "react-dom/client";
import ProgramView from "@/views/ProgramView";
import PreviewView from "@/views/PreviewView";
import { startRendererBenchmark } from "@/output/rendererBenchmark";
import "./index.css";

/**
 * Deliberately small output-only entry point. It excludes Dockview, authoring
 * panels, persistence initialization, and editor interaction from the
 * renderer topology while retaining the exact shared DocumentRenderer.
 */
function RendererApp() {
  if (new URLSearchParams(window.location.search).has("benchmark") && !window.chaseRendererBenchmark) {
    // Project defaults are 1080p50; this is intentionally explicit until
    // the envelope is available so the probe begins before first frame.
    startRendererBenchmark(50);
  }
  return window.location.hash === "#/preview" ? <PreviewView /> : <ProgramView />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RendererApp />
  </React.StrictMode>,
);
