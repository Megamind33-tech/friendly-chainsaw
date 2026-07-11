import type { LucideIcon } from "lucide-react";

/**
 * A workspace whose engine isn't built yet gets its own clean, honest
 * full-page surface — never the small 12px-icon "not wired yet" box used
 * for individual missing panels. This is a page-level placeholder, so it
 * carries real information: what the page will do, and which build phase
 * lands it (see PLAN.md).
 */
export function ComingSoonPanel({
  icon: Icon,
  title,
  phase,
  description,
  bullets,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg-deepest p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle bg-bg-panel">
        <Icon className="h-6 w-6 text-text-muted-alt" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="font-mono text-sm tracking-wide text-text-muted-alt">{title}</span>
        <span className="rounded border border-border-subtle bg-bg-panel px-2 py-0.5 font-mono text-[10px] text-text-muted">
          {phase}
        </span>
      </div>
      <p className="max-w-sm text-center font-mono text-[11px] leading-relaxed text-text-muted">{description}</p>
      <ul className="flex max-w-sm flex-col gap-1 font-mono text-[10px] text-text-muted">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-border-subtle" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
