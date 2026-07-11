import { ARAuthorPanel } from "./ARAuthorPanel";
import { ARViewportPanel } from "./ARViewportPanel";

/** Legacy single-panel layout — composes split AR Preview + AR Author. */
export function ARPanel() {
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <ARViewportPanel />
      </div>
      <div className="w-[400px] shrink-0 border-l border-border-subtle">
        <ARAuthorPanel />
      </div>
    </div>
  );
}
