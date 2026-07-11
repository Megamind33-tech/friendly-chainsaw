import type { ARTemplate } from "@/ar-engine/types";
import { BroadcastCard } from "@/components/ui/broadcast";
import { ArTemplatePreview } from "./ArTemplatePreview";
import { ArTemplateSnapshotStudio } from "./ArTemplateSnapshotStudio";

const FAITH_IDS = new Set(["scripture-board-ar", "speaker-strap-ar", "worship-strap-ar"]);

export function isFaithArTemplate(template: ARTemplate): boolean {
  return FAITH_IDS.has(template.id);
}

export function ArTemplateGrid({ templates, onPick }: { templates: ARTemplate[]; onPick: (template: ARTemplate) => void }) {
  return (
    <>
      <ArTemplateSnapshotStudio />
      <div className="grid grid-cols-3 gap-2">
      {templates.map((template) => (
        <BroadcastCard
          key={template.id}
          onClick={() => onPick(template)}
          title={`Add ${template.name}`}
          className="w-full"
        >
          <ArTemplatePreview template={template} />
          <div className="mt-1 line-clamp-2 min-h-[2lh] font-mono text-[9px] leading-tight text-text-muted-alt">
            {template.name}
          </div>
        </BroadcastCard>
      ))}
      </div>
    </>
  );
}
