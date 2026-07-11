import type { ARAnimationPreset, ID, SetNode } from "@/document/types";

export type ARReadinessLevel = "error" | "warning" | "ok";

export interface ARReadinessCheck {
  id: string;
  label: string;
  level: ARReadinessLevel;
  detail: string;
}

export interface ARTemplate {
  id: string;
  name: string;
  category: "news" | "sports" | "election" | "data" | "utility";
  create: () => SetNode[];
}

export interface ARSceneSummary {
  sceneId: ID;
  layerId: ID;
  name: string;
  objectCount: number;
  ready: boolean;
}

export const AR_ANIMATION_PRESETS: { id: ARAnimationPreset; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "scale", label: "Scale" },
  { id: "pop", label: "Pop" },
  { id: "wipe", label: "Wipe" },
  { id: "rotate", label: "Rotate" },
  { id: "fly", label: "Fly" },
  { id: "count-up", label: "Count-up" },
  { id: "bar-grow", label: "Bar grow" },
  { id: "ticker-crawl", label: "Ticker crawl" },
  { id: "loop-pulse", label: "Loop pulse" },
];
