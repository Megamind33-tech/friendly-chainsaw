import { Repeat, ArrowRightToLine } from "lucide-react";

/** Loop + speed for a Lottie motion-graphic element (see
 * renderNodes.tsx's LottieElementView, which reads these same fields). */
export function MotionGraphicControls({
  loop,
  speed,
  onChange,
}: {
  loop: boolean;
  speed: number;
  onChange: (updates: { loop?: boolean; speed?: number }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange({ loop: !loop })}
        title={loop ? "Looping — click to hold on last frame" : "Holds on last frame — click to loop"}
        className={`flex h-7 items-center gap-1 rounded border px-2 font-mono text-[10px] ${
          loop
            ? "border-accent-blue text-accent-blue-bright"
            : "border-border-subtle text-text-muted-alt hover:border-accent-blue"
        }`}
      >
        {loop ? <Repeat className="h-3 w-3" /> : <ArrowRightToLine className="h-3 w-3" />}
        {loop ? "Loop" : "Once"}
      </button>
      <input
        type="range"
        min={0.1}
        max={3}
        step={0.1}
        value={speed}
        onChange={(e) => onChange({ speed: Number(e.target.value) })}
        className="h-1 flex-1 accent-[#4a90d9]"
      />
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-text-muted">{speed.toFixed(1)}x</span>
    </div>
  );
}
