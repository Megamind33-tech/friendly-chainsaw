import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NdiToolsSettings } from "@/components/panels/NdiToolsSettings";
import { CameraTrackingSettings } from "@/components/panels/CameraTrackingSettings";

/**
 * App-wide Settings — new surface (none existed before). NDI Tools is the
 * first real section; a natural home for future app-level config (e.g. the
 * AI image key, currently still inline in AssetBrowserPanel) without
 * needing a dedicated workspace page for each one.
 */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border-subtle bg-bg-panel">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm text-text-muted-alt">Settings</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <NdiToolsSettings />
          <CameraTrackingSettings />
        </div>
      </DialogContent>
    </Dialog>
  );
}
