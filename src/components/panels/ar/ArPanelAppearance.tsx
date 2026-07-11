import { ColorField } from "@/components/panels/InspectorPanel";
import { Slider } from "@/components/ui/slider";
import type { PrimitiveNode } from "@/document/types";
import { ArPanelBlock } from "./arShared";

export function ArPanelAppearance({
  node,
  onUpdate,
  onBrightenAll,
}: {
  node: PrimitiveNode;
  onUpdate: (updates: Partial<PrimitiveNode>) => void;
  onBrightenAll?: () => void;
}) {
  const m = node.material;
  const brightness = m.emissiveIntensity ?? 0.45;

  return (
    <ArPanelBlock title="Panel Appearance">
      <ColorField
        label="Panel color"
        value={m.color}
        onChange={(color) =>
          onUpdate({
            material: { ...m, color, emissive: m.emissive ?? color },
          })
        }
      />
      <label className="block space-y-1 font-mono text-[9px] text-text-muted">
        Brightness
        <Slider
          min={0}
          max={1.5}
          step={0.05}
          value={[brightness]}
          onValueChange={([v]) =>
            onUpdate({
              material: {
                ...m,
                emissive: m.emissive ?? m.color,
                emissiveIntensity: v,
                metalness: Math.min(m.metalness, 0.15),
              },
            })
          }
        />
        <div className="text-right text-[8px] text-text-muted-alt">{brightness.toFixed(2)}</div>
      </label>
      {onBrightenAll && (
        <button type="button" onClick={onBrightenAll} className="w-full rounded border border-border-subtle px-2 py-1 font-mono text-[9px] hover:border-stripe-active">
          Brighten all AR panels
        </button>
      )}
    </ArPanelBlock>
  );
}
