import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Locked thumbnail sizes — see docs/UI_VISUAL_SPEC.md §5. */
export const ASSET_THUMB_PX = 48;
export const PREVIEW_THUMB_PX = 56;

export function ThumbSlot({
  size = ASSET_THUMB_PX,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("mx-auto shrink-0 overflow-hidden rounded bg-bg-deepest", className)}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}

export function BroadcastSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="border-b-2 border-stripe-accent pb-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">
      {children}
    </div>
  );
}

export function BroadcastTabBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-0 border-b border-border-subtle", className)}>{children}</div>;
}

export function BroadcastTab({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "border-b-2 px-2.5 py-1.5 font-mono text-[10px] tracking-wide transition-colors",
        active
          ? "border-stripe-active text-text-bright"
          : "border-transparent text-text-muted-alt hover:border-stripe-accent hover:text-text-bright",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BroadcastCard({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded border border-border-subtle bg-bg-panel p-1.5 text-left shadow-[inset_0_-2px_0_0_var(--stripe-accent)] transition-colors",
        "hover:border-stripe-active hover:shadow-[inset_0_-2px_0_0_var(--stripe-active)]",
        active && "border-stripe-active shadow-[inset_0_-2px_0_0_var(--stripe-active)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BroadcastToolBtn({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "px-1.5 py-1 font-mono text-[9px] uppercase tracking-wide transition-colors",
        active
          ? "bg-bg-surface text-text-bright shadow-[inset_0_-2px_0_0_var(--stripe-active)]"
          : "text-text-muted hover:bg-bg-surface hover:text-text-bright",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Replaces Lucide icons in trees and lists — mono 2–3 letter kind code. */
export function KindBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title ?? label}
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm bg-bg-deepest px-0.5 font-mono text-[8px] leading-none tracking-tight text-text-muted-alt"
    >
      {label.slice(0, 3).toUpperCase()}
    </span>
  );
}

export const LAYER_KIND_LABEL: Record<string, string> = {
  gfx2d: "GFX",
  set3d: "SET",
  map: "MAP",
  chart: "CHT",
};

export const SET_NODE_KIND_LABEL: Record<string, string> = {
  model: "MDL",
  primitive: "PRM",
  text3d: "TXT",
  light: "LGT",
  camera: "CAM",
  videofeed: "VID",
  group: "GRP",
};

export const ELEMENT_KIND_LABEL: Record<string, string> = {
  rect: "RCT",
  text: "TXT",
  image: "IMG",
  video: "VID",
  lottie: "MOT",
  group: "GRP",
};
