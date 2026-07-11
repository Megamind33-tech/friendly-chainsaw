import { memo, useEffect, useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import {
  createImageElement,
  createModelNode,
  createVideoFeedNode,
  createPrimitiveNode,
  createLottieElement,
  vec3,
  cloneLayerWithNewIds,
} from "@/document/factory";
import { generateAiImageAsset, importImageFile, importStudioFile } from "@/components/set3d/assetImport";
import { AiKeySettings } from "./AiKeySettings";
import { useRegisterFonts } from "@/document/fonts";
import { useUserTemplates } from "@/document/userTemplates";
import { GraphicPreview } from "./GraphicPreview";
import { ASSET_DRAG_MIME, serializeAssetDrag, type AssetDragPayload } from "@/document/dragAsset";
import { BroadcastSectionTitle, BroadcastTab, BroadcastTabBar, ThumbSlot } from "@/components/ui/broadcast";
import type { Asset } from "@/document/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The studio resource library — six separate sections (Phase 5.9/5.10),
 * never a single mixed grid: 3D Assets, Images, Video, Motion, Fonts,
 * Graphics. Each kind has its own import affordance and its own "use it"
 * action, so the tab you're in tells you exactly what you're browsing.
 */

type AssetTab = "model" | "image" | "video" | "lottie" | "font" | "graphics";

const TABS: { id: AssetTab; label: string; accept: string }[] = [
  { id: "model", label: "3D", accept: ".glb,.gltf,.fbx,.obj" },
  { id: "image", label: "IMG", accept: ".png,.jpg,.jpeg,.webp,.svg" },
  { id: "video", label: "VID", accept: ".mp4,.webm,.mov,.m4v" },
  { id: "lottie", label: "MOT", accept: ".json,.lottie" },
  { id: "font", label: "FNT", accept: ".ttf,.otf,.woff,.woff2" },
  { id: "graphics", label: "GFX", accept: "" },
];

function AssetCard({
  asset,
  action,
  dragKind,
}: {
  asset: Asset;
  action: { label: string; onClick: () => void; disabled?: boolean; title?: string };
  /** When set, the card is a native HTML5 drag source for the GFX canvas
   * (see dragAsset.ts) — only asset kinds that map to a 2D element make
   * sense to drag (image/lottie); video/model cards omit this. */
  dragKind?: AssetDragPayload["kind"];
}) {
  const removeAsset = useDocStore((s) => s.removeAsset);
  return (
    <div
      className="rounded border border-border-subtle bg-bg-panel p-1.5 shadow-[inset_0_-2px_0_0_var(--stripe-accent)]"
      draggable={!!dragKind}
      onDragStart={
        dragKind ? (e) => e.dataTransfer.setData(ASSET_DRAG_MIME, serializeAssetDrag({ assetId: asset.id, kind: dragKind })) : undefined
      }
      title={dragKind ? "Drag onto the GFX canvas to place, or use Add below" : undefined}
    >
      <ThumbSlot>
        {asset.thumbnail ? (
          <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[8px] text-text-muted">—</div>
        )}
      </ThumbSlot>
      <div className="mt-1 truncate font-mono text-[10px] text-text-muted-alt" title={asset.name}>
        {asset.name}
      </div>
      <div className="mt-1 flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 flex-1 font-mono text-[9px] text-text-muted-alt"
          disabled={action.disabled}
          title={action.title}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
        <button onClick={() => removeAsset(asset.id)} className="px-1 font-mono text-[8px] text-text-muted hover:text-live-red" title="Delete asset">
          del
        </button>
      </div>
    </div>
  );
}

/** A font card renders its own preview in the actual registered typeface —
 * no icon, no generic label, the real face like every other asset preview.
 * Wrapped in memo: `asset` is a stable reference from project.assets, so an
 * unrelated AssetBrowserPanel re-render doesn't re-render every font card. */
const FontCard = memo(function FontCard({ asset }: { asset: Asset }) {
  const removeAsset = useDocStore((s) => s.removeAsset);
  return (
    <div className="rounded border border-border-subtle bg-bg-panel p-1.5 shadow-[inset_0_-2px_0_0_var(--stripe-accent)]">
      <ThumbSlot>
        <span style={{ fontFamily: asset.family }} className="flex h-full w-full items-center justify-center text-center text-sm leading-tight text-text-muted-alt">
          Aa
        </span>
      </ThumbSlot>
      <div className="mt-1 truncate font-mono text-[10px] text-text-muted-alt" title={asset.name}>
        {asset.family}
      </div>
      <div className="mt-1 flex justify-end">
        <button onClick={() => removeAsset(asset.id)} className="px-1 font-mono text-[8px] text-text-muted hover:text-live-red" title="Delete font">
          del
        </button>
      </div>
    </div>
  );
})

export function AssetBrowserPanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const activeLayerId = useDocStore((s) => s.activeLayerId);
  const addAsset = useDocStore((s) => s.addAsset);
  const addSetNode = useDocStore((s) => s.addSetNode);
  const addElement = useDocStore((s) => s.addElement);
  const addPrebuiltLayer = useDocStore((s) => s.addPrebuiltLayer);
  const removeAsset = useDocStore((s) => s.removeAsset);
  const fileInput = useRef<HTMLInputElement>(null);
  const referenceFileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<AssetTab>("model");
  const [importState, setImportState] = useState<"idle" | "importing" | string>("idle");
  const [generateState, setGenerateState] = useState<"idle" | "generating" | string>("idle");
  const [prompt, setPrompt] = useState("");
  const [referenceAssetId, setReferenceAssetId] = useState<string | null>(null);

  const userTemplates = useUserTemplates((s) => s.templates);
  const loadUserTemplates = useUserTemplates((s) => s.load);
  const removeUserTemplate = useUserTemplates((s) => s.remove);
  useEffect(() => {
    loadUserTemplates().catch((err) => console.error("failed to load user templates", err));
  }, [loadUserTemplates]);

  const fontAssets = project?.assets.filter((a) => a.kind === "font") ?? [];
  useRegisterFonts(fontAssets);

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  const activeLayer = scene?.layers.find((l) => l.id === activeLayerId);
  const setLayer = activeLayer?.props.kind === "set3d" ? activeLayer : scene?.layers.find((l) => l.props.kind === "set3d");
  const gfxLayer = activeLayer?.props.kind === "gfx2d" ? activeLayer : scene?.layers.find((l) => l.props.kind === "gfx2d");
  const selectedReferenceAsset = project?.assets.find((a) => a.id === referenceAssetId && a.kind === "image");

  const onImportFiles = async (files: FileList) => {
    setImportState("importing");
    try {
      for (const file of Array.from(files)) {
        addAsset(await importStudioFile(file));
      }
      setImportState("idle");
    } catch (err) {
      setImportState(err instanceof Error ? err.message : String(err));
    }
  };

  const onGenerateImage = async () => {
    setGenerateState("generating");
    try {
      const generated = await generateAiImageAsset(prompt, "1024x1024", selectedReferenceAsset?.src);
      addAsset(generated);
      setPrompt("");
      setTab("image");
      setGenerateState(`Added ${generated.name}`);
    } catch (err) {
      setGenerateState(err instanceof Error ? err.message : String(err));
    }
  };

  const onImportReference = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setImportState("importing");
    try {
      const asset = await importImageFile(file);
      addAsset(asset);
      setReferenceAssetId(asset.id);
      setTab("image");
      setImportState("idle");
    } catch (err) {
      setImportState(err instanceof Error ? err.message : String(err));
    }
  };

  if (!project) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs">
      <BroadcastTabBar className="shrink-0">
        {TABS.map(({ id, label }) => (
          <BroadcastTab key={id} active={tab === id} onClick={() => setTab(id)} title={label}>
            {label}
          </BroadcastTab>
        ))}
      </BroadcastTabBar>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {tab !== "graphics" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 justify-start border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
              disabled={importState === "importing"}
              onClick={() => fileInput.current?.click()}
            >
              {importState === "importing" ? "Importing…" : `Import ${activeTab.label}`}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={activeTab.accept}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void onImportFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {importState !== "idle" && importState !== "importing" && (
              <div className="shrink-0 rounded border border-live-red/40 bg-bg-surface p-1.5 font-mono text-[10px] text-live-red">
                {importState}
              </div>
            )}
          </>
        )}

        {tab === "image" && (
          <div className="shrink-0 space-y-1.5 rounded border border-border-subtle bg-bg-surface p-2">
            <AiKeySettings />
            <div className="space-y-1">
              <BroadcastSectionTitle>Pinned reference</BroadcastSectionTitle>
              <div className="flex items-center gap-2 rounded border border-border-subtle bg-bg-deepest p-1.5">
                <ThumbSlot>
                  {selectedReferenceAsset?.thumbnail ? (
                    <img src={selectedReferenceAsset.thumbnail} alt={selectedReferenceAsset.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-mono text-[8px] text-text-muted">—</div>
                  )}
                </ThumbSlot>
                <div className="min-w-0 flex-1 truncate font-mono text-[10px] text-text-muted-alt" title={selectedReferenceAsset?.name}>
                  {selectedReferenceAsset?.name ?? "No reference pinned"}
                </div>
                <button
                  onClick={() => setReferenceAssetId(null)}
                  disabled={!selectedReferenceAsset}
                  className="rounded px-1 font-mono text-[8px] text-text-muted hover:text-live-red disabled:opacity-30"
                  title="Clear reference"
                >
                  clr
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start border-border-subtle bg-bg-panel font-mono text-[10px] text-text-muted-alt"
                onClick={() => referenceFileInput.current?.click()}
              >
                Upload reference
              </Button>
              <input
                ref={referenceFileInput}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void onImportReference(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="AI image prompt"
              className="min-h-16 resize-none border-border-subtle bg-bg-deepest font-mono text-[10px] text-text-muted-alt"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={generateState === "generating" || !prompt.trim()}
              onClick={onGenerateImage}
              className="w-full border-border-subtle bg-bg-panel font-mono text-[10px] text-text-muted-alt"
            >
              {generateState === "generating" ? "Generating…" : "Generate image"}
            </Button>
            {generateState !== "idle" && generateState !== "generating" && (
              <div
                className={`rounded border bg-bg-deepest p-1.5 font-mono text-[10px] ${
                  generateState.startsWith("Added ")
                    ? "border-stripe-active text-text-bright"
                    : "border-live-red/40 text-live-red"
                }`}
              >
                {generateState}
              </div>
            )}
          </div>
        )}

        {tab === "model" && (
          <div className="grid grid-cols-3 gap-1.5">
            {project.assets
              .filter((a) => a.kind === "model")
              .map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  action={{
                    label: "Add to Set",
                    disabled: !setLayer,
                    title: setLayer ? "Add to the active 3D set" : "No 3D set layer in this scene",
                    onClick: () => scene && setLayer && addSetNode(scene.id, setLayer.id, createModelNode(asset.id, { name: asset.name })),
                  }}
                />
              ))}
          </div>
        )}

        {tab === "image" && (
          <div className="grid grid-cols-3 gap-1.5">
            {project.assets
              .filter((a) => a.kind === "image")
              .map((asset) => (
                <div
                  key={asset.id}
                  className="rounded border border-border-subtle bg-bg-panel p-1.5 shadow-[inset_0_-2px_0_0_var(--stripe-accent)]"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(ASSET_DRAG_MIME, serializeAssetDrag({ assetId: asset.id, kind: "image" }))}
                  title="Drag onto the GFX canvas to place, or use Add below"
                >
                  <ThumbSlot className={referenceAssetId === asset.id ? "outline outline-1 outline-stripe-active" : undefined}>
                    {asset.thumbnail ? (
                      <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-mono text-[8px] text-text-muted">—</div>
                    )}
                  </ThumbSlot>
                  <div className="mt-1 truncate font-mono text-[9px] text-text-muted-alt" title={asset.name}>
                    {asset.name}
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_1fr_auto_auto] gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 font-mono text-[9px] text-text-muted-alt"
                      disabled={!gfxLayer}
                      title={gfxLayer ? "Add as an image element on the active GFX layer" : "No GFX layer in this scene"}
                      onClick={() => scene && gfxLayer && addElement(scene.id, gfxLayer.id, createImageElement(asset.id, { name: asset.name }))}
                    >
                      add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 font-mono text-[9px] text-text-muted-alt"
                      disabled={!setLayer}
                      title={setLayer ? "Add as an aspect-safe branding surface" : "No 3D set layer in this scene"}
                      onClick={() => scene && setLayer && addSetNode(scene.id, setLayer.id, createPrimitiveNode("plane", {
                        name: asset.name,
                        textureAssetId: asset.id,
                        slotKind: "branding",
                        slotLabel: asset.name,
                        display: { fit: "contain", anchor: "center", overscan: 1 },
                        material: { color: "#ffffff", metalness: 0, roughness: 1 },
                        transform: { position: vec3(0, 1.8, -3), scale: vec3(3.2, 1.8, 1) },
                      }))}>
                      set
                    </Button>
                    <button
                      onClick={() => setReferenceAssetId(referenceAssetId === asset.id ? null : asset.id)}
                      className={`rounded px-1 font-mono text-[8px] ${
                        referenceAssetId === asset.id ? "text-text-bright" : "text-text-muted hover:text-text-bright"
                      }`}
                      title={referenceAssetId === asset.id ? "Unpin reference" : "Pin as reference"}
                    >
                      ref
                    </button>
                    <button onClick={() => removeAsset(asset.id)} className="px-1 font-mono text-[8px] text-text-muted hover:text-live-red" title="Delete asset">
                      del
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === "video" && (
          <div className="grid grid-cols-3 gap-1.5">
            {project.assets
              .filter((a) => a.kind === "video")
              .map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  action={{
                    label: "Add to Set",
                    disabled: !setLayer,
                    title: setLayer ? "Add a feed surface playing this clip" : "No 3D set layer in this scene",
                    onClick: () =>
                      scene &&
                      setLayer &&
                      addSetNode(
                        scene.id,
                        setLayer.id,
                        createVideoFeedNode({ label: asset.name, source: { type: "url", url: asset.src }, transform: { position: vec3(0, 1.8, -3) } }),
                      ),
                  }}
                />
              ))}
          </div>
        )}

        {tab === "lottie" && (
          <div className="grid grid-cols-3 gap-1.5">
            {project.assets
              .filter((a) => a.kind === "lottie")
              .map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  dragKind="lottie"
                  action={{
                    label: "Add to GFX",
                    disabled: !gfxLayer,
                    title: gfxLayer ? "Add as a motion-graphic element on the active GFX layer" : "No GFX layer in this scene",
                    onClick: () =>
                      scene && gfxLayer && addElement(scene.id, gfxLayer.id, createLottieElement(asset.id, { name: asset.name })),
                  }}
                />
              ))}
          </div>
        )}

        {tab === "font" && (
          <div className="grid grid-cols-3 gap-1.5">
            {fontAssets.map((asset) => (
              <FontCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}

        {tab === "graphics" && (
          <div className="grid grid-cols-3 gap-1.5">
            {userTemplates.map((t) => (
              <div key={t.id} className="group relative rounded border border-border-subtle bg-bg-panel p-1.5 shadow-[inset_0_-2px_0_0_var(--stripe-accent)]">
                <button
                  onClick={() => scene && addPrebuiltLayer(scene.id, cloneLayerWithNewIds(t.layer))}
                  title={`Insert "${t.name}"`}
                  className="w-full text-left"
                >
                  <GraphicPreview layer={t.layer} />
                  <div className="mt-1 truncate font-mono text-[9px] text-text-muted-alt">{t.name}</div>
                </button>
                <button
                  onClick={() => void removeUserTemplate(t.id)}
                  title="Delete graphic"
                  className="absolute right-0.5 top-0.5 rounded bg-bg-deepest/90 px-1 py-0.5 font-mono text-[8px] text-text-muted opacity-0 hover:text-live-red group-hover:opacity-100"
                >
                  del
                </button>
              </div>
            ))}
            {userTemplates.length === 0 && (
              <div className="col-span-2 p-2 text-center font-mono text-[10px] text-text-muted">
                None saved — use Save Template on any layer in the Layers panel.
              </div>
            )}
          </div>
        )}

        {tab !== "graphics" && project.assets.filter((a) => a.kind === tab).length === 0 && (
          <div className="p-2 text-center font-mono text-[10px] text-text-muted">None yet.</div>
        )}
      </div>
    </div>
  );
}
