import "@/shims/three";
import React from "react";
import ReactDOM from "react-dom/client";
import ProgramView from "@/views/ProgramView";
import PreviewView from "@/views/PreviewView";
import { startRendererBenchmark } from "@/output/rendererBenchmark";
import { RootErrorBoundary } from "@/components/shell/RootErrorBoundary";
import "./index.css";

/**
 * Deliberately small output-only entry point. It excludes Dockview, authoring
 * panels, persistence initialization, and editor interaction from the
 * renderer topology while retaining the exact shared DocumentRenderer.
 *
 * This backs three surfaces: the Program window, the Preview window (both
 * pointed here by `tauri.conf.json`), and the sidecar's `/program` route that
 * OBS loads. Before, the two Tauri windows loaded `index.html` -> `App.tsx`,
 * which statically imports ControlRoomView — so every output window parsed and
 * evaluated the entire editor bundle it can never show, three heavy WebViews
 * racing at startup.
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
    {/* Same boundary the Control Room uses. This entry now backs the Program
        and Preview WINDOWS as well as the OBS-facing sidecar route, so a
        render crash here would otherwise black out Program with no message —
        precisely the failure the boundary was added for. */}
    <RootErrorBoundary>
      <RendererApp />
    </RootErrorBoundary>
  </React.StrictMode>,
);
