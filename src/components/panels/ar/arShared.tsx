import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDocStore, findActiveSet3dLayer } from "@/document/store";
import { DocumentRenderer } from "@/components/gfx/DocumentRenderer";
import type { Asset, ID, Project, SetNode } from "@/document/types";
import { BroadcastSectionTitle } from "@/components/ui/broadcast";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";

/** Thin re-export for AR call sites — the real resolver (shared with
 * Studio's VirtualSetPanel, so both surfaces can never disagree about
 * "which virtual set is current") lives in document/store.ts. */
export function findActiveArLayer(project: Project | null, activeSceneId: ID | null, activeLayerId: ID | null) {
  const found = findActiveSet3dLayer(project, activeSceneId, activeLayerId);
  return found ? { scene: found.scene, layer: found.layer } : null;
}

function useFitScale(projW: number, projH: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 180 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, scale: Math.min(size.width / projW, size.height / projH, 1) || 1 };
}

export function MonitorTile({ label, tone, sceneId }: { label: string; tone: "preview" | "program"; sceneId: ID | null }) {
  const project = useDocStore((s) => s.project);
  const layerPlayback = useDocStore((s) => s.layerPlayback);
  const programSceneId = useDocStore((s) => s.programSceneId);
  const previewSceneId = useDocStore((s) => s.previewSceneId);
  const arFocus = useDocStore((s) => s.arFocus);
  const { ref, scale } = useFitScale(project?.resolution.width ?? 1920, project?.resolution.height ?? 1080);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className={`font-mono text-[10px] font-bold ${tone === "program" ? "text-live-red" : "text-accent-blue-bright"}`}>{label}</div>
      <div ref={ref} className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded border bg-bg-deepest ${tone === "program" ? "border-live-red/50" : "border-accent-blue/50"}`}>
        {project && sceneId ? (
          <DocumentRenderer
            project={project}
            sceneId={sceneId}
            scale={scale}
            layerPlayback={layerPlayback}
            programSceneId={programSceneId}
            previewSceneId={previewSceneId}
            arFocus={arFocus}
            role={tone}
          />
        ) : (
          <span className="font-mono text-[10px] text-text-muted">not armed</span>
        )}
      </div>
    </div>
  );
}

export function ArPanelBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-panel shadow-[inset_0_-2px_0_0_var(--stripe-accent)]">
      <BroadcastSectionTitle>{title}</BroadcastSectionTitle>
      <div className="space-y-2 p-2">{children}</div>
    </div>
  );
}

export function SceneGraphRow({
  node,
  depth,
  selectedNodeId,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
  onMove,
}: {
  node: SetNode;
  depth: number;
  selectedNodeId: ID | null;
  onSelect: (id: ID) => void;
  onToggle: (node: SetNode, updates: Partial<SetNode>) => void;
  onDuplicate: (node: SetNode) => void;
  onDelete: (id: ID) => void;
  onMove: (id: ID, direction: -1 | 1) => void;
}) {
  const selected = selectedNodeId === node.id;
  return (
    <>
      <div
        className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-1 rounded px-1 py-1 font-mono text-[10px] ${selected ? "bg-accent-blue/15 text-accent-blue-bright" : "text-text-muted-alt hover:bg-bg-surface"}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button className="truncate text-left" onClick={() => onSelect(node.id)} title={node.name}>
          {node.name} <span className="uppercase text-text-muted">({node.kind})</span>
        </button>
        <button title="Move up" onClick={() => onMove(node.id, -1)}><ArrowUp className="h-3 w-3" /></button>
        <button title="Move down" onClick={() => onMove(node.id, 1)}><ArrowDown className="h-3 w-3" /></button>
        <button title={node.visible ? "Hide" : "Show"} onClick={() => onToggle(node, { visible: !node.visible } as Partial<SetNode>)}>{node.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button>
        <button title={node.locked ? "Unlock" : "Lock"} onClick={() => onToggle(node, { locked: !node.locked } as Partial<SetNode>)}>{node.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}</button>
        <div className="flex gap-1">
          <button title="Duplicate" onClick={() => onDuplicate(node)}><Copy className="h-3 w-3" /></button>
          <button title="Delete" onClick={() => onDelete(node.id)} className="hover:text-live-red"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {node.kind === "group" && node.children.map((child) => (
        <SceneGraphRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onToggle={onToggle}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMove={onMove}
        />
      ))}
    </>
  );
}

export function AssetAction({ asset, onUse }: { asset: Asset; onUse: (asset: Asset) => void }) {
  return (
    <button
      onClick={() => onUse(asset)}
      title={`Add ${asset.name} to AR scene`}
      className="flex min-w-0 items-center gap-2 rounded border border-border-subtle bg-bg-deepest p-1.5 text-left hover:border-stripe-active"
    >
      {asset.thumbnail ? (
        <img src={asset.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-bg-surface font-mono text-[8px] text-text-muted">{asset.kind}</div>
      )}
      <span className="truncate font-mono text-[10px] text-text-muted-alt">{asset.name}</span>
    </button>
  );
}

export function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const arToolbarButtonClass =
  "flex items-center justify-center gap-1 rounded border border-border-subtle px-2 py-1.5 font-mono text-[10px] text-text-muted-alt hover:border-stripe-active hover:text-text-bright";
