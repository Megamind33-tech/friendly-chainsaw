import { useWorkspaceStore } from "@/document/workspace";
import { useControlBridge } from "@/document/controlBridge";
import { PersistentShell } from "@/components/shell/PersistentShell";
import { WorkspaceDockview } from "@/components/workspaces/WorkspaceDockview";
import { DOCKVIEW_WORKSPACES } from "@/components/workspaces/workspaces";

/**
 * The Control Room is now a thin frame (Phase A reorg): a persistent shell
 * strip on top (workspace switcher + always-on show controls) and exactly
 * one workspace page mounted below it. Each page owns its own dockview
 * instance with a small, curated panel set — the old single ~12-panel
 * dockview that made everything cramped is gone. Switching pages fully
 * unmounts the previous page (keyed remount), so panels never bleed across
 * pages or double-mount.
 */
export default function ControlRoomView() {
  const active = useWorkspaceStore((s) => s.active);
  const config = DOCKVIEW_WORKSPACES[active] ?? DOCKVIEW_WORKSPACES.design;

  // Phase 7: publish this window's control state to the sidecar (fanned
  // to /control/state/stream) and dispatch incoming /control/command
  // events onto the local Zustand stores. Runs only here, so Program /
  // Preview windows never double-emit.
  useControlBridge();

  return (
    <div className="flex h-screen w-screen flex-col bg-bg-deepest">
      <PersistentShell />
      <WorkspaceDockview
        key={config.id}
        storageKey={config.storageKey}
        components={config.components}
        buildLayout={config.buildLayout}
      />
    </div>
  );
}
