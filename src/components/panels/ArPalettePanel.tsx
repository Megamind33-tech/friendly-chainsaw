import { BUILDER_ITEMS, applyDepthIllusion, type BuilderItem } from "@/ar-engine/builderKit";
import { AR_ITEM_DRAG_MIME, serializeArItemDrag } from "@/ar-engine/builderDrag";
import { useArLayer } from "./ar/useArLayer";

const CATEGORIES: { id: BuilderItem["category"]; label: string }[] = [
  { id: "cards", label: "CARDS" },
  { id: "text", label: "TEXT" },
  { id: "shapes", label: "SHAPES" },
  { id: "media", label: "MEDIA" },
];

/**
 * The AR Builder element library palette — a card grid of BUILDER_ITEMS
 * grouped by category. Click inserts straight into the active AR layer at
 * the item's default spawn point; drag hands off to ArStagePanel's drop
 * target (which places it at the drop point on the stage) via the shared
 * builderDrag protocol. Mirrors ShapesPanel's card-grid styling.
 */
export function ArPalettePanel() {
  const ar = useArLayer();

  if (!ar.project) return <div className="p-3 font-mono text-xs text-text-muted">Loading...</div>;

  if (!ar.scene || !ar.layer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg-deepest p-4 text-center">
        <div className="font-mono text-sm text-text-muted-alt">No AR layer — use AR Author to create one</div>
        <button
          onClick={ar.createArLayer}
          className="rounded border border-stripe-active px-3 py-2 font-mono text-xs text-text-bright"
        >
          Create AR Layer
        </button>
      </div>
    );
  }

  const insertItem = (item: BuilderItem) => {
    const node = item.build();
    ar.addNodes([node]);
    ar.selectSetNode(node.id);
  };

  const handleDragStart = (e: React.DragEvent, item: BuilderItem) => {
    e.dataTransfer.setData(AR_ITEM_DRAG_MIME, serializeArItemDrag({ itemId: item.id }));
    e.dataTransfer.effectAllowed = "copy";
  };

  // Depth Stack: clone each top-level AR node's transform (never mutate the
  // live store objects directly), stagger the clones' z via
  // applyDepthIllusion, then commit each one back through the store — one
  // commitNodeTransform per node, same pattern setNodeTransform already uses
  // elsewhere in the AR panels.
  const applyDepthStack = () => {
    const targets = ar.arRootNodes.map((n) => ({
      ...n,
      transform: { ...n.transform, position: { ...n.transform.position } },
    }));
    applyDepthIllusion(targets);
    targets.forEach((node) => ar.setNodeTransform(node, node.transform));
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto bg-bg-deepest p-2 text-xs">
      <button
        onClick={applyDepthStack}
        disabled={ar.arRootNodes.length < 2}
        title="2.5D Depth Stack — staggers the AR layer's top-level elements 0.06m apart in z (in their current order) so a flat, co-planar pile of cards reads as a layered dimensional board instead of a sticker stack."
        className="rounded border border-stripe-active px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-text-bright hover:bg-stripe-active/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Depth Stack
      </button>

      {CATEGORIES.map((cat) => (
        <div key={cat.id} className="flex flex-col gap-1.5">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{cat.label}</div>
          <div className="grid grid-cols-2 gap-2">
            {BUILDER_ITEMS.filter((item) => item.category === cat.id).map((item) => (
              <button
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onClick={() => insertItem(item)}
                title={`${item.label} — ${item.description}\nClick to insert into the AR layer, or drag onto the stage.`}
                className="group flex flex-col items-start gap-1 rounded border border-border-subtle bg-bg-panel p-1.5 text-left hover:border-accent-blue"
              >
                <span className="font-mono text-[10px] text-text-muted-alt group-hover:text-accent-blue-bright">
                  {item.label}
                </span>
                <span className="line-clamp-2 font-mono text-[8px] leading-tight text-text-muted">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
