import { useMemo, useRef } from "react";
import { useArAssetBuilder } from "@/ar-asset-builder/useArAssetBuilder";
import { AR_ASSET_CATEGORIES } from "@/ar-asset-builder/constants";
import { ALL_AR_ASSET_PRESETS } from "@/ar-asset-builder/presets";
import { ASSET_DRAG_MIME } from "@/document/dragAsset";
import { AR_ASSET_DRAG_MIME, serializeArAssetDrag } from "@/ar-engine/builderDrag";
import { Star, FolderOpen, Image, LayoutTemplate } from "lucide-react";

/**
 * AR Asset Builder — left library panel: categories, search, project assets,
 * imported images, saved templates, favorites.
 */
export function ArAssetLibraryPanel() {
  const builder = useArAssetBuilder();
  const { session, assets, project } = builder;
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = useMemo(() => {
    let list = [...assets];
    if (session.libraryCategory) list = list.filter((a) => a.category === session.libraryCategory);
    if (session.libraryFilter === "favorites") list = list.filter((a) => a.favorite);
    if (session.librarySearch.trim()) {
      const q = session.librarySearch.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.type.includes(q));
    }
    return list;
  }, [assets, session.libraryCategory, session.libraryFilter, session.librarySearch]);

  const imageAssets = useMemo(
    () => (project?.assets ?? []).filter((a) => a.kind === "image"),
    [project],
  );

  const presets = useMemo(() => {
    if (!session.libraryCategory) return ALL_AR_ASSET_PRESETS;
    return ALL_AR_ASSET_PRESETS.filter((p) => p.category === session.libraryCategory);
  }, [session.libraryCategory]);

  return (
    <div className="flex h-full flex-col bg-bg-deepest text-xs">
      <div className="shrink-0 border-b border-border-subtle p-2">
        <div className="mb-2 font-mono text-[10px] font-bold tracking-wide text-text-muted-alt">ASSET LIBRARY</div>
        <input
          type="search"
          placeholder="Search assets..."
          value={session.librarySearch}
          onChange={(e) => session.setLibrarySearch(e.target.value)}
          className="w-full rounded border border-border-subtle bg-bg-panel px-2 py-1.5 font-mono text-[10px] text-text-bright outline-none focus:border-accent-blue"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {(["all", "favorites", "imported", "templates"] as const).map((f) => (
            <button
              key={f}
              onClick={() => session.setLibraryFilter(f)}
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] capitalize ${
                session.libraryFilter === f
                  ? "border-accent-blue text-accent-blue-bright"
                  : "border-border-subtle text-text-muted hover:border-stripe-active"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1 border-b border-border-subtle p-2">
        <button
          onClick={() => session.setLibraryCategory(null)}
          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
            !session.libraryCategory ? "border-accent-blue text-accent-blue-bright" : "border-border-subtle text-text-muted"
          }`}
        >
          All
        </button>
        {AR_ASSET_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => session.setLibraryCategory(cat.id)}
            title={cat.label}
            className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
              session.libraryCategory === cat.id
                ? "border-accent-blue text-accent-blue-bright"
                : "border-border-subtle text-text-muted hover:border-stripe-active"
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="mb-3 flex gap-1">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex-1 rounded border border-accent-blue px-2 py-1.5 font-mono text-[10px] text-accent-blue-bright hover:bg-accent-blue/10"
          >
            Import Image
          </button>
          <button
            onClick={() => builder.pasteFromClipboard()}
            className="rounded border border-border-subtle px-2 py-1.5 font-mono text-[10px] text-text-muted-alt hover:border-stripe-active"
            title="Paste from clipboard"
          >
            Paste
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) builder.importImage(f);
            e.target.value = "";
          }}
        />

        {session.libraryFilter !== "templates" && (
          <section className="mb-4">
            <div className="mb-1.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
              <FolderOpen className="h-3 w-3" /> Project Assets ({filteredAssets.length})
            </div>
            {filteredAssets.length === 0 ? (
              <div className="rounded border border-dashed border-border-subtle p-3 text-center font-mono text-[9px] text-text-muted">
                No assets yet — import an image to begin
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {filteredAssets.map((asset) => {
                  const thumb = project?.assets.find((a) => a.id === asset.thumbnailAssetId)?.thumbnail;
                  return (
                    <button
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(AR_ASSET_DRAG_MIME, serializeArAssetDrag({ assetId: asset.id }));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        session.setActiveAssetId(asset.id);
                        session.setSelectedLayerIds(asset.layers[0] ? [asset.layers[0].id] : []);
                      }}
                      className={`group flex flex-col rounded border p-1.5 text-left ${
                        session.activeAssetId === asset.id
                          ? "border-accent-blue bg-accent-blue/5"
                          : "border-border-subtle bg-bg-panel hover:border-stripe-active"
                      }`}
                    >
                      <div className="mb-1 flex aspect-video items-center justify-center overflow-hidden rounded bg-bg-deepest">
                        {thumb ? (
                          <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <Image className="h-4 w-4 text-text-muted" />
                        )}
                      </div>
                      <span className="truncate font-mono text-[9px] text-text-muted-alt">{asset.name}</span>
                      <span className="font-mono text-[8px] text-text-muted">{asset.lifecycle}</span>
                      {asset.favorite && <Star className="mt-0.5 h-2.5 w-2.5 fill-live-amber text-live-amber" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="mb-4">
          <div className="mb-1.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
            <Image className="h-3 w-3" /> Imported Images ({imageAssets.length})
          </div>
          <div className="grid grid-cols-3 gap-1">
            {imageAssets.slice(0, 12).map((img) => (
              <button
                key={img.id}
                onClick={() => builder.importFromProjectAsset(img.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify({ assetId: img.id, kind: "image" }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title={`Add ${img.name} to builder`}
                className="aspect-square overflow-hidden rounded border border-border-subtle bg-bg-panel hover:border-accent-blue"
              >
                {img.thumbnail ? (
                  <img src={img.thumbnail} alt={img.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[8px] text-text-muted">IMG</div>
                )}
              </button>
            ))}
          </div>
        </section>

        {(session.libraryFilter === "all" || session.libraryFilter === "templates") && (
          <section>
            <div className="mb-1.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
              <LayoutTemplate className="h-3 w-3" /> Starter Templates ({presets.length})
            </div>
            <div className="flex flex-col gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => builder.createFromPreset(preset.id)}
                  className="rounded border border-border-subtle bg-bg-panel px-2 py-1.5 text-left hover:border-accent-blue"
                >
                  <div className="font-mono text-[10px] text-text-muted-alt">{preset.label}</div>
                  <div className="line-clamp-1 font-mono text-[8px] text-text-muted">{preset.description}</div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
