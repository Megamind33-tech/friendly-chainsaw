import { useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import { importFontFile } from "@/components/set3d/assetImport";
import { useRegisterFonts } from "@/document/fonts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload } from "lucide-react";

/** The engine's built-in typefaces — always selectable, no import required. */
const SYSTEM_FONTS = ["Geist Sans", "Geist Mono", "sans-serif", "serif", "monospace"];

/** Card picker for text font family — system faces plus imported font
 * assets, each previewed in its own real typeface. Never a dropdown. */
export function FontPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (family: string) => void;
}) {
  const project = useDocStore((s) => s.project);
  const addAsset = useDocStore((s) => s.addAsset);
  const fonts = project?.assets.filter((a) => a.kind === "font") ?? [];
  useRegisterFonts(fonts);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onImport = async (files: FileList) => {
    setImporting(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        addAsset(await importFontFile(file));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const pick = (family: string) => {
    onPick(family);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border-subtle bg-bg-panel">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm text-text-muted-alt">Pick a font</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {SYSTEM_FONTS.map((family) => (
            <button
              key={family}
              onClick={() => pick(family)}
              style={{ fontFamily: family }}
              className="flex w-full items-center justify-between rounded border border-border-subtle bg-bg-surface px-2 py-1.5 text-left hover:border-accent-blue"
            >
              <span className="text-sm text-text-muted-alt">Aa Bb 123</span>
              <span className="font-mono text-[9px] text-text-muted">{family}</span>
            </button>
          ))}
          {fonts.map((asset) => (
            <button
              key={asset.id}
              onClick={() => pick(asset.family!)}
              style={{ fontFamily: asset.family }}
              title={asset.name}
              className="flex w-full items-center justify-between rounded border border-border-subtle bg-bg-surface px-2 py-1.5 text-left hover:border-accent-blue"
            >
              <span className="text-sm text-text-muted-alt">Aa Bb 123</span>
              <span className="font-mono text-[9px] text-text-muted">{asset.family}</span>
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={importing}
          onClick={() => fileInput.current?.click()}
          className="gap-1.5 border-border-subtle bg-bg-surface text-text-muted-alt"
        >
          <Upload className="h-3 w-3" /> {importing ? "Importing…" : "Import font"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".ttf,.otf,.woff,.woff2"
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
