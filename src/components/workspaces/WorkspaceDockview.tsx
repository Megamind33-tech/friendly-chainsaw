import type { FunctionComponent } from "react";
import "dockview-react/dist/styles/dockview.css";
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from "dockview-react";

interface WorkspaceDockviewProps {
  storageKey: string;
  components: Record<string, FunctionComponent<any>>;
  buildLayout: (event: DockviewReadyEvent) => void;
}

/**
 * One dockview instance per workspace page (Phase A reorg) — each page owns
 * its own saved layout and a curated, small panel set, instead of one
 * ~12-panel dockview fighting over a single window. The caller mounts this
 * keyed by workspace id (see ControlRoomView.tsx), so switching pages fully
 * unmounts the previous page's panels rather than hiding them — cheaper, and
 * avoids cross-page state bleed (e.g. two GfxEditor instances both mounted
 * and listening at once).
 */
export function WorkspaceDockview({ storageKey, components, buildLayout }: WorkspaceDockviewProps) {
  function onReady(event: DockviewReadyEvent) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        event.api.fromJSON(JSON.parse(saved));
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    if (event.api.panels.length === 0) {
      buildLayout(event);
    }
    event.api.onDidLayoutChange(() => {
      localStorage.setItem(storageKey, JSON.stringify(event.api.toJSON()));
    });
  }

  return (
    <div className="min-h-0 flex-1 p-1">
      <DockviewReact
        className="dockview-theme-dark h-full w-full"
        components={components as Record<string, FunctionComponent<IDockviewPanelProps>>}
        onReady={onReady}
      />
    </div>
  );
}
