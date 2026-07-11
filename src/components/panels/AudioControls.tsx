import { Volume2, VolumeX } from "lucide-react";

/**
 * Volume + mute for a video/live source (2D VideoElement, 3D VideoFeedNode).
 * Shared so the two Inspectors can't drift. Real audio only ever plays in
 * the Program window (see RenderOptions.audible / SetNodeContext.audible) —
 * these controls set the authored values that gate applies against there.
 */
export function AudioControls({
  volume,
  muted,
  onChange,
}: {
  volume: number;
  muted: boolean;
  onChange: (updates: { volume?: number; muted?: boolean }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange({ muted: !muted })}
        title={muted ? "Unmute" : "Mute"}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border ${
          muted ? "border-live-red/50 text-live-red" : "border-border-subtle text-text-muted-alt hover:border-accent-blue"
        }`}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        disabled={muted}
        onChange={(e) => onChange({ volume: Number(e.target.value) })}
        className="h-1 flex-1 accent-[#4a90d9] disabled:opacity-30"
      />
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-text-muted">{Math.round(volume * 100)}%</span>
    </div>
  );
}
