import type { AnimDirection, AnimPhaseSpec, Element, ElementAnim, ElementShadow } from "@/document/types";
import { NumberField, ColorField } from "./InspectorPanel";
import { Section } from "./SetInspector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Minus } from "lucide-react";

/**
 * Phase 5.6 element FX editing: entrance/exit choreography, drop shadow,
 * skew, gradient gloss, letter-spacing — every template property stays
 * operator-editable, nothing is baked into builders only.
 */

const DIRECTIONS: { id: AnimDirection; icon: typeof ArrowLeft; title: string }[] = [
  { id: "left", icon: ArrowLeft, title: "From/to left" },
  { id: "right", icon: ArrowRight, title: "From/to right" },
  { id: "top", icon: ArrowUp, title: "From/to top" },
  { id: "bottom", icon: ArrowDown, title: "From/to bottom" },
  { id: "none", icon: Minus, title: "In place (fade only)" },
];

const DEFAULT_IN: AnimPhaseSpec = { delay: 0, duration: 0.45, direction: "left", distance: 320, ease: "power3.out", fade: true };
const DEFAULT_OUT: AnimPhaseSpec = { delay: 0, duration: 0.35, direction: "left", distance: 240, ease: "power2.in", fade: true };

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 font-mono text-[10px] text-text-muted-alt">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function AnimPhaseEditor({
  label,
  spec,
  defaults,
  onChange,
}: {
  label: string;
  spec: AnimPhaseSpec | undefined;
  defaults: AnimPhaseSpec;
  onChange: (spec: AnimPhaseSpec | undefined) => void;
}) {
  return (
    <div className="space-y-1.5 rounded border border-border-subtle p-1.5">
      <Toggle
        label={`${label} animation`}
        checked={!!spec}
        onChange={(v) => onChange(v ? { ...defaults } : undefined)}
      />
      {spec && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField label="Delay (s)" value={spec.delay} step={0.05} onChange={(v) => onChange({ ...spec, delay: v })} />
            <NumberField label="Duration (s)" value={spec.duration} step={0.05} onChange={(v) => onChange({ ...spec, duration: v })} />
            <NumberField label="Distance (px)" value={spec.distance} step={10} onChange={(v) => onChange({ ...spec, distance: v })} />
            <div className="space-y-1">
              <Label className="text-[10px] text-text-muted">Direction</Label>
              <div className="flex overflow-hidden rounded border border-border-subtle">
                {DIRECTIONS.map(({ id, icon: Icon, title }) => (
                  <button
                    key={id}
                    title={title}
                    onClick={() => onChange({ ...spec, direction: id })}
                    className={`flex-1 py-1.5 ${spec.direction === id ? "bg-bg-surface text-accent-blue-bright" : "text-text-muted hover:text-text-muted-alt"}`}
                  >
                    <Icon className="mx-auto h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={spec.ease}
              onChange={(e) => onChange({ ...spec, ease: e.target.value })}
              placeholder="ease, e.g. power3.out / back.out(1.4)"
              className="h-6 flex-1 border-border-subtle bg-bg-surface text-[10px] text-text-muted-alt"
            />
            <Toggle label="Fade" checked={spec.fade} onChange={(v) => onChange({ ...spec, fade: v })} />
          </div>
        </>
      )}
    </div>
  );
}

export function ElementFxSections({
  element,
  setField,
}: {
  element: Element;
  setField: (updates: Partial<Element>) => void;
}) {
  const anim: ElementAnim = element.anim ?? {};
  const setAnim = (next: ElementAnim) =>
    setField({ anim: next.in || next.out ? next : undefined });

  const shadow = element.shadow;
  const setShadow = (next: ElementShadow | undefined) => setField({ shadow: next });

  return (
    <>
      <Section title="Animation" defaultOpen={false}>
        <AnimPhaseEditor label="IN" spec={anim.in} defaults={DEFAULT_IN} onChange={(spec) => setAnim({ ...anim, in: spec })} />
        <AnimPhaseEditor label="OUT" spec={anim.out} defaults={DEFAULT_OUT} onChange={(spec) => setAnim({ ...anim, out: spec })} />
      </Section>

      <Section title="Shadow" defaultOpen={false}>
        <Toggle
          label="Drop shadow"
          checked={!!shadow}
          onChange={(v) => setShadow(v ? { color: "#000000", blur: 14, offsetX: 0, offsetY: 6, opacity: 0.45 } : undefined)}
        />
        {shadow && (
          <>
            <ColorField label="Color" value={shadow.color} onChange={(v) => setShadow({ ...shadow, color: v })} />
            <div className="grid grid-cols-3 gap-1.5">
              <NumberField label="Blur" value={shadow.blur} onChange={(v) => setShadow({ ...shadow, blur: v })} />
              <NumberField label="Offset X" value={shadow.offsetX} onChange={(v) => setShadow({ ...shadow, offsetX: v })} />
              <NumberField label="Offset Y" value={shadow.offsetY} onChange={(v) => setShadow({ ...shadow, offsetY: v })} />
            </div>
            <NumberField label="Opacity" value={shadow.opacity ?? 0.5} step={0.05} onChange={(v) => setShadow({ ...shadow, opacity: v })} />
          </>
        )}
      </Section>

      {element.kind === "rect" && (
        <Section title="Shape FX" defaultOpen={false}>
          <NumberField label="Skew X (°)" value={element.skewX ?? 0} step={1} onChange={(v) => setField({ skewX: v || undefined })} />
          <Toggle
            label="Gloss gradient"
            checked={!!element.gradient}
            onChange={(v) =>
              setField({
                gradient: v
                  ? { from: "#0a1442", mid: "#2244cc", to: "#060b2a", direction: "diagonal" }
                  : undefined,
              })
            }
          />
          {element.gradient && (
            <>
              <ColorField label="From" value={element.gradient.from} onChange={(v) => setField({ gradient: { ...element.gradient!, from: v } })} />
              <ColorField label="Sheen (mid)" value={element.gradient.mid ?? element.gradient.from} onChange={(v) => setField({ gradient: { ...element.gradient!, mid: v } })} />
              <ColorField label="To" value={element.gradient.to} onChange={(v) => setField({ gradient: { ...element.gradient!, to: v } })} />
              <div className="flex gap-1">
                {(["horizontal", "vertical", "diagonal"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setField({ gradient: { ...element.gradient!, direction: d } })}
                    className={`flex-1 rounded border px-1 py-1 font-mono text-[9px] ${
                      element.gradient!.direction === d
                        ? "border-accent-blue bg-bg-surface text-accent-blue-bright"
                        : "border-border-subtle text-text-muted-alt"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {element.kind === "text" && (
        <Section title="Typography FX" defaultOpen={false}>
          <NumberField
            label="Letter spacing (px)"
            value={element.letterSpacing ?? 0}
            step={0.5}
            onChange={(v) => setField({ letterSpacing: v || undefined })}
          />
          <Toggle label="UPPERCASE" checked={!!element.uppercase} onChange={(v) => setField({ uppercase: v || undefined })} />
        </Section>
      )}
    </>
  );
}
