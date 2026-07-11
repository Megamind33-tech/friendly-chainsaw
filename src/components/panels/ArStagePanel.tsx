import { useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import { downloadStarterLibrary } from "@/ar-engine/starterLibrary";
import { Set3dEditor } from "@/components/set3d/Set3dEditor";
import { useArLayer } from "./ar/useArLayer";
import { AR_ITEM_DRAG_MIME, parseArItemDrag, AR_ASSET_DRAG_MIME, parseArAssetDrag } from "@/ar-engine/builderDrag";
import { BUILDER_ITEMS } from "@/ar-engine/builderKit";
import { AR_CENTER } from "@/ar-engine/nodeUtils";

/**
 * The AR Builder STAGE — the editable center of the Builder workspace
 * (palette left, timeline below, inspector right). Full gizmo editing via
 * the shared Set3dEditor, plus the drop target for palette drags: dropping
 * a palette card lands the element roughly where it was dropped (stage-
 * space mapping from the drop point — not a raycast; the gizmo refines).
 */
export function ArStagePanel() {
  const ar = useArLayer();
  const selectedNodeIds = useDocStore((s) => s.selectedNodeIds);
  const groupSetNodes = useDocStore((s) => s.groupSetNodes);
  const ungroupSetNode = useDocStore((s) => s.ungroupSetNode);
  const selectedIsGroup = ar.selectedNode?.kind === "group";
  const addAsset = useDocStore((s) => s.addAsset);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropHint, setDropHint] = useState(false);
  const [libMsg, setLibMsg] = useState<string | null>(null);
  const [libBusy, setLibBusy] = useState(false);

  const fetchLibrary = async () => {
    if (libBusy) return;
    setLibBusy(true);
    try {
      const errors = await downloadStarterLibrary(
        (asset) => addAsset(asset),
        (p) => setLibMsg(p.current ? `${p.done}/${p.total} ${p.current}` : `${p.done}/${p.total}`),
      );
      setLibMsg(errors.length ? `done — ${errors.length} failed (see console)` : "library imported ✓");
      if (errors.length) console.warn("starter library failures:", errors);
    } finally {
      setLibBusy(false);
    }
  };

  if (!ar.project) return <div className="p-3 font-mono text-xs text-text-muted">Loading...</div>;

  if (!ar.scene || !ar.layer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg-deepest p-4 text-center">
        <div className="font-mono text-sm text-text-muted-alt">No AR layer in this scene</div>
        <button
          onClick={ar.createArLayer}
          className="rounded border border-accent-blue px-3 py-2 font-mono text-xs text-accent-blue-bright"
        >
          Create AR Layer
        </button>
      </div>
    );
  }

  const { scene, layer } = ar;

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const rect = dropRef.current?.getBoundingClientRect();
    const assetPayload = parseArAssetDrag(e.dataTransfer.getData(AR_ASSET_DRAG_MIME) || "");
    if (assetPayload) {
      const asset = ar.project?.arBuilderAssets?.find((a) => a.id === assetPayload.assetId);
      if (asset && ar.project) {
        const { arAssetToSetNodes } = await import("@/ar-asset-builder/placement");
        const nodes = arAssetToSetNodes(asset, ar.project.assets);
        if (rect && rect.width > 0 && rect.height > 0) {
          const nx = (e.clientX - rect.left) / rect.width;
          const ny = (e.clientY - rect.top) / rect.height;
          for (const node of nodes) {
            node.transform.position = {
              x: (nx - 0.5) * 6,
              y: 0.4 + (1 - ny) * 2.5,
              z: AR_CENTER.z,
            };
          }
        }
        ar.addNodes(nodes);
        return;
      }
    }
    const payload = parseArItemDrag(e.dataTransfer.getData(AR_ITEM_DRAG_MIME) || "");
    if (!payload) return;
    const item = BUILDER_ITEMS.find((i) => i.id === payload.itemId);
    if (!item) return;
    const node = item.build();
    if (rect && rect.width > 0 && rect.height > 0) {
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      node.transform.position = {
        x: (nx - 0.5) * 6,
        y: 0.4 + (1 - ny) * 2.5,
        z: AR_CENTER.z,
      };
    }
    ar.addNodes([node]);
    ar.selectSetNode(node.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-deepest text-xs">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-base px-3">
        <span className="font-mono text-[11px] font-bold tracking-wide text-text-muted-alt">AR STAGE</span>
        {ar.isProgram && <span className="rounded border border-live-red/70 px-2 py-0.5 font-mono text-[9px] text-live-red">ON AIR</span>}
        {ar.isPreview && <span className="rounded border border-accent-blue/60 px-2 py-0.5 font-mono text-[9px] text-accent-blue-bright">PVW</span>}
        <span className="font-mono text-[9px] text-text-muted">
          drag from Palette · Shift-click multi-select · double-click drills in
        </span>
        {selectedNodeIds.length > 1 && (
          <button
            onClick={() => groupSetNodes(scene.id, layer.id, selectedNodeIds)}
            className="rounded border border-accent-blue/70 bg-accent-blue/10 px-2 py-1 font-mono text-[9px] font-bold text-accent-blue-bright"
            title="Wrap the selected objects into one group — they move, animate and focus as a unit"
          >
            GROUP ({selectedNodeIds.length})
          </button>
        )}
        {selectedIsGroup && (
          <button
            onClick={() => ar.selectedNodeId && ungroupSetNode(scene.id, layer.id, ar.selectedNodeId)}
            className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] font-bold text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
            title="Dissolve the selected group back into its parts"
          >
            UNGROUP
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={fetchLibrary}
            disabled={libBusy}
            className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright disabled:opacity-50"
            title="Download 50+ curated free (CC0/CC-BY) 3D models through the real import pipeline — each gets a real rendered thumbnail in Assets"
          >
            {libBusy ? (libMsg ?? "downloading…") : "GET 3D LIBRARY"}
          </button>
          {!libBusy && libMsg && <span className="font-mono text-[8px] text-text-muted">{libMsg}</span>}
          <button onClick={() => ar.playIn(layer.id)} className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] font-bold text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright" title="Play the build IN on Program/Preview">
            ▶ IN
          </button>
          <button onClick={() => ar.playOut(layer.id)} className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] font-bold text-text-muted-alt hover:border-live-amber hover:text-live-amber" title="Play OUT">
            ◀ OUT
          </button>
          <button onClick={ar.loadToPreview} className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-accent-blue">
            Load PVW
          </button>
          <button onClick={ar.takeOnAir} className="rounded border border-live-red/60 px-2 py-1 font-mono text-[9px] text-live-red hover:bg-live-red/10">
            Take Air
          </button>
        </div>
      </div>

      <div
        ref={dropRef}
        className="relative min-h-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(AR_ITEM_DRAG_MIME) || e.dataTransfer.types.includes(AR_ASSET_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropHint(true);
          }
        }}
        onDragLeave={() => setDropHint(false)}
        onDrop={handleDrop}
      >
        <Set3dEditor sceneId={scene.id} layer={layer} editableNodeIds={ar.arNodeIds} />
        {dropHint && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-accent-blue/70 bg-accent-blue/5">
            <span className="rounded bg-bg-base/90 px-3 py-1.5 font-mono text-[11px] text-accent-blue-bright">
              drop to place
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
