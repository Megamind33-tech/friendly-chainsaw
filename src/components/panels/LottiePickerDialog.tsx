import { useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import { importLottieFile } from "@/components/set3d/assetImport";
import type { ID } from "@/document/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Upload } from "lucide-react";

/** Card picker for Lottie/Bodymovin motion-graphic assets — same shape as
 * ImagePickerDialog, minus AI generation (there's no Lottie-generation API
 * to call). No thumbnails: a motion graphic has no single representative
 * frame worth pre-rendering, so cards are named, not pictured. */
export function LottiePickerDialog({
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
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clips = project?.assets.filter((a) => a.kind === "lottie") ?? [];

  const onImport = async (files: FileList) => {
    setImporting(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const asset = await importLottieFile(file);
        addAsset(asset);
      }
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
          <DialogTitle className="font-mono text-sm text-text-muted-alt">Pick a motion graphic</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {clips.map((asset) => (
            <button
              key={asset.id}
              onClick={() => {
                onPick(asset.id);
                onOpenChange(false);
              }}
              className="flex items-center gap-1.5 rounded border border-border-subtle bg-bg-surface p-2 text-left hover:border-accent-blue"
              title={asset.name}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-blue" />
              <span className="truncate font-mono text-[10px] text-text-muted-alt">{asset.name}</span>
            </button>
          ))}
        </div>
        {clips.length === 0 && (
          <div className="py-2 text-center font-mono text-[10px] text-text-muted">None yet.</div>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={importing}
          onClick={() => fileInput.current?.click()}
          className="gap-1.5 border-border-subtle bg-bg-surface text-text-muted-alt"
        >
          <Upload className="h-3 w-3" /> {importing ? "Importing…" : "Import Lottie JSON"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".json,.lottie"
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
