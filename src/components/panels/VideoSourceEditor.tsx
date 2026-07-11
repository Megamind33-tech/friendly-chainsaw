import { useEffect, useState } from "react";
import { useDocStore } from "@/document/store";
import type { Asset, VideoSource } from "@/document/types";
import { listVideoInputDevices } from "@/components/set3d/videoFeeds";
import { importVideoFile } from "@/components/set3d/assetImport";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Upload, Webcam, MonitorUp, Film, Link2, Power, Tv, MonitorPlay } from "lucide-react";

/**
 * Video source picker — every way a real signal enters the studio: live
 * capture devices, screen/window share, imported video clips, URL, and
 * PGM/PVW confidence monitors. Selectable rows, not dropdowns. Shared by
 * the 3D `videofeed` node inspector (SetInspector.tsx) and the 2D `video`
 * element inspector (InspectorPanel.tsx) — both consume the same
 * `VideoSource` shape, so this is the one place the UI for it lives.
 */

type SourceTab = "device" | "screen" | "clip" | "url" | "program" | "preview" | "none";

function sourceTab(source: VideoSource, assets: Asset[]): SourceTab {
  if (source.type === "url") {
    return assets.some((a) => a.kind === "video" && a.src === source.url) ? "clip" : "url";
  }
  return source.type;
}

const SOURCE_TABS: { id: SourceTab; label: string; icon: typeof Webcam }[] = [
  { id: "device", label: "Live", icon: Webcam },
  { id: "screen", label: "Screen", icon: MonitorUp },
  { id: "clip", label: "Clip", icon: Film },
  { id: "url", label: "URL", icon: Link2 },
  // Confidence monitors — a render-texture re-render of the on-air scene,
  // not a real capture device. See ConfidenceMonitorView in SetNodes.tsx.
  // (2D graphics elements accept these for picker consistency but currently
  // render an honest "not supported yet" standby — see renderNodes.tsx.)
  { id: "program", label: "PGM", icon: Tv },
  { id: "preview", label: "PVW", icon: MonitorPlay },
  { id: "none", label: "Off", icon: Power },
];

export function VideoSourceEditor({
  source,
  onChange,
}: {
  source: VideoSource;
  onChange: (source: VideoSource) => void;
}) {
  const project = useDocStore((s) => s.project);
  const addAsset = useDocStore((s) => s.addAsset);
  const assets = project?.assets ?? [];
  const clips = assets.filter((a) => a.kind === "video");
  const [tab, setTab] = useState<SourceTab>(() => sourceTab(source, assets));
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = () => {
    listVideoInputDevices()
      .then(setDevices)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };
  useEffect(refreshDevices, []);

  const importClip = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const asset = await importVideoFile(file);
      addAsset(asset);
      // Imported for THIS surface — assign it immediately.
      onChange({ type: "url", url: asset.src });
      setTab("clip");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-left font-mono text-[10px] ${
      active
        ? "border-accent-blue bg-bg-surface text-accent-blue-bright"
        : "border-border-subtle text-text-muted-alt hover:border-accent-blue/50 hover:bg-bg-surface"
    }`;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 overflow-hidden rounded border border-border-subtle">
        {SOURCE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              if (id === "screen") onChange({ type: "screen" });
              if (id === "none") onChange({ type: "none" });
              if (id === "program") onChange({ type: "program" });
              if (id === "preview") onChange({ type: "preview" });
            }}
            className={`flex flex-col items-center gap-0.5 py-1.5 font-mono text-[9px] ${
              tab === id ? "bg-bg-surface text-accent-blue-bright" : "text-text-muted hover:text-text-muted-alt"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "device" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-text-muted">Capture devices (cameras, capture cards)</Label>
            <button onClick={refreshDevices} title="Rescan devices" className="text-text-muted hover:text-accent-blue">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          {devices.length === 0 && (
            <div className="rounded border border-border-subtle p-2 font-mono text-[10px] text-text-muted">
              No capture devices found.
            </div>
          )}
          {devices.map((d) => (
            <button
              key={d.deviceId}
              className={rowClass(source.type === "device" && source.deviceId === d.deviceId)}
              onClick={() => onChange({ type: "device", deviceId: d.deviceId })}
            >
              <Webcam className="h-3 w-3 shrink-0" />
              <span className="truncate">{d.label}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "screen" && (
        <div className="rounded border border-border-subtle p-2 font-mono text-[10px] text-text-muted">
          Screen/window share is live{source.type === "screen" ? "" : " once selected"} — the OS picker appears when
          the surface first renders.
        </div>
      )}

      {tab === "clip" && (
        <div className="space-y-1">
          {clips.map((clip) => (
            <button
              key={clip.id}
              className={rowClass(source.type === "url" && source.url === clip.src)}
              onClick={() => onChange({ type: "url", url: clip.src })}
            >
              {clip.thumbnail ? (
                <img src={clip.thumbnail} alt="" className="h-6 w-10 shrink-0 rounded-sm object-cover" />
              ) : (
                <Film className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{clip.name}</span>
            </button>
          ))}
          {clips.length === 0 && (
            <div className="rounded border border-border-subtle p-2 font-mono text-[10px] text-text-muted">
              No video clips in the studio yet.
            </div>
          )}
          <label className={`${rowClass(false)} cursor-pointer justify-center`}>
            <Upload className="h-3 w-3" /> {importing ? "Importing…" : "Import video (.mp4 .webm .mov)"}
            <input
              type="file"
              accept=".mp4,.webm,.mov,.m4v"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importClip(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {tab === "url" && (
        <Input
          placeholder="https://server/stream.mp4"
          value={source.type === "url" ? source.url : ""}
          onChange={(e) => onChange({ type: "url", url: e.target.value })}
          className="h-7 border-border-subtle bg-bg-panel text-[10px] text-text-muted-alt"
        />
      )}

      {error && <div className="font-mono text-[10px] text-live-red">{error}</div>}
    </div>
  );
}
