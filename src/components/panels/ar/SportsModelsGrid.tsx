import { useMemo } from "react";
import type { ARTemplate } from "@/ar-engine/types";
import { SPORTS_AR_LIBRARY, SPORTS_AR_MODELS, type SportsArModel } from "@/ar-engine/sportsPanels";
import { BroadcastCard } from "@/components/ui/broadcast";
import { ArTemplatePreview } from "./ArTemplatePreview";

/**
 * The `AR > 3D Models > Sports Graphics` library — ten independent,
 * insertable 3D panel models. Every card preview is a REAL offscreen WebGL
 * render of the actual model geometry (the shared snapshot queue), never an
 * icon; selecting a card inserts the genuine parametric model into the AR
 * scene.
 */

const BADGES = ["DATA", "ANIM", "COLOUR", "MATERIAL", "AR"] as const;

function modelAsTemplate(model: SportsArModel): ARTemplate {
  return {
    id: model.id,
    name: model.name,
    category: "sports",
    create: () => [model.build()],
  };
}

export function SportsModelsGrid({ onInsert }: { onInsert: (model: SportsArModel) => void }) {
  const templates = useMemo(() => new Map(SPORTS_AR_MODELS.map((m) => [m.id, modelAsTemplate(m)])), []);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-text-muted">
        <span className="text-text-muted-alt">{SPORTS_AR_LIBRARY.category}</span>
        <span>›</span>
        <span className="text-accent-blue-bright">{SPORTS_AR_LIBRARY.subcategory}</span>
        <span className="ml-auto">{SPORTS_AR_MODELS.length} models</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SPORTS_AR_MODELS.map((model) => (
          <BroadcastCard key={model.id} onClick={() => onInsert(model)} title={`Insert ${model.name}`} className="w-full">
            <ArTemplatePreview template={templates.get(model.id)!} />
            <div className="mt-1 truncate font-mono text-[10px] text-text-bright">{model.name}</div>
            <div className="line-clamp-2 min-h-[2lh] font-mono text-[8px] leading-tight text-text-muted">
              {model.description}
            </div>
            <div className="mt-1 flex flex-wrap gap-0.5">
              {BADGES.map((b) => (
                <span key={b} className="rounded border border-border-subtle px-1 py-px font-mono text-[7px] text-accent-blue-bright">
                  {b}
                </span>
              ))}
              <span className="rounded border border-border-subtle px-1 py-px font-mono text-[7px] text-text-muted">STANDARD</span>
              <span className="ml-auto font-mono text-[7px] text-text-muted">v{model.version}</span>
            </div>
          </BroadcastCard>
        ))}
      </div>
    </div>
  );
}
