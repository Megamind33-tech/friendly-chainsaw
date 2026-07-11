import { useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import { generateAiImageAsset, importImageFile } from "@/components/set3d/assetImport";
import type { ID } from "@/document/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ThumbSlot } from "@/components/ui/broadcast";

/** Thumbnail-card picker for image assets — never a dropdown. Shared by the
 * Layers panel's "+ Image" and the Inspector's "Choose image" (slot fill). */
export function ImagePickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (assetId: ID) => void;
}) {
  const project = useDocStore((s) => s.project);
  const addAsset = useDocStore((s) => s.addAsset);
  const fileInput = useRef<HTMLInputElement>(null);
  const referenceFileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [referenceAssetId, setReferenceAssetId] = useState<ID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const images = project?.assets.filter((a) => a.kind === "image") ?? [];
  const selectedReferenceAsset = images.find((asset) => asset.id === referenceAssetId);

  const onImport = async (files: FileList) => {
    setImporting(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        addAsset(await importImageFile(file));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const onGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateAiImageAsset(prompt, "1024x1024", selectedReferenceAsset?.src);
      addAsset(generated);
      onPick(generated.id);
      onOpenChange(false);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const onImportReference = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const asset = await importImageFile(file);
      addAsset(asset);
      setReferenceAssetId(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border-subtle bg-bg-panel">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm text-text-muted-alt">Pick an image</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
          {images.map((asset) => (
            <div
              key={asset.id}
              className={`rounded border bg-bg-surface p-1 shadow-[inset_0_-2px_0_0_var(--stripe-accent)] ${
                referenceAssetId === asset.id ? "border-stripe-active" : "border-border-subtle"
              }`}
            >
              <button
                onClick={() => {
                  onPick(asset.id);
                  onOpenChange(false);
                }}
                className="w-full"
                title={asset.name}
              >
                <ThumbSlot>
                  {asset.thumbnail ? (
                    <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-mono text-[8px] text-text-muted">—</div>
                  )}
                </ThumbSlot>
              </button>
              <div className="mt-1 truncate font-mono text-[8px] text-text-muted-alt">{asset.name}</div>
              <button
                onClick={() => setReferenceAssetId(referenceAssetId === asset.id ? null : asset.id)}
                className={`mt-1 flex h-5 w-full items-center justify-center rounded font-mono text-[8px] ${
                  referenceAssetId === asset.id ? "text-text-bright" : "text-text-muted hover:text-text-bright"
                }`}
                title={referenceAssetId === asset.id ? "Unpin reference" : "Pin as reference"}
              >
                ref
              </button>
            </div>
          ))}
        </div>
        {images.length === 0 && (
          <div className="py-2 text-center font-mono text-[10px] text-text-muted">None yet.</div>
        )}
        <div className="space-y-1.5 rounded border border-border-subtle bg-bg-surface p-2">
          <div className="space-y-1">
            <div className="font-mono text-[9px] uppercase tracking-wide text-text-muted">Pinned reference</div>
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
            disabled={generating || !prompt.trim()}
            onClick={onGenerate}
            className="w-full border-border-subtle bg-bg-panel font-mono text-[10px] text-text-muted-alt"
          >
            {generating ? "Generating…" : "Generate image"}
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={importing}
          onClick={() => fileInput.current?.click()}
          className="border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
        >
          {importing ? "Importing…" : "Import images"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.svg"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void onImport(e.target.files);
            e.target.value = "";
          }}
        />
        {error && <div className="font-mono text-[10px] text-live-red">{error}</div>}
      </DialogContent>
    </Dialog>
  );
}
