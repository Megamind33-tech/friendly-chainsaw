import type { ArAssetCategory, ArAssetType, ArWorkflowStep } from "./types";

export const AR_ASSET_CATEGORIES: { id: ArAssetCategory; label: string; icon: string }[] = [
  { id: "elections", label: "Elections", icon: "🗳" },
  { id: "sports", label: "Sports", icon: "⚽" },
  { id: "weather", label: "Weather", icon: "🌤" },
  { id: "news", label: "News", icon: "📰" },
  { id: "maps", label: "Maps", icon: "🗺" },
  { id: "charts", label: "Charts", icon: "📊" },
  { id: "profiles", label: "Profiles", icon: "👤" },
  { id: "logos", label: "Logos & Icons", icon: "◆" },
  { id: "lower-thirds", label: "Lower Thirds", icon: "▬" },
  { id: "fullscreen", label: "Full Screen", icon: "▣" },
  { id: "custom", label: "Custom", icon: "✦" },
];

export const AR_ASSET_TYPES: { id: ArAssetType; label: string; category: ArAssetCategory }[] = [
  { id: "transparent-cutout", label: "Transparent Cutout", category: "profiles" },
  { id: "layered-25d", label: "Layered 2.5D Asset", category: "custom" },
  { id: "3d-card", label: "3D Card", category: "custom" },
  { id: "extruded-logo", label: "Extruded Logo", category: "logos" },
  { id: "map", label: "Map", category: "maps" },
  { id: "chart", label: "Chart", category: "charts" },
  { id: "stat-panel", label: "Stat Panel", category: "charts" },
  { id: "candidate-profile", label: "Candidate Profile", category: "elections" },
  { id: "player-profile", label: "Player Profile", category: "profiles" },
  { id: "weather-symbol", label: "Weather Symbol", category: "weather" },
  { id: "weather-map-marker", label: "Weather Map Marker", category: "weather" },
  { id: "election-result-bar", label: "Election Result Bar", category: "elections" },
  { id: "seat-projection", label: "Seat Projection", category: "elections" },
  { id: "scoreboard-element", label: "Scoreboard Element", category: "sports" },
  { id: "lower-third", label: "Lower Third", category: "lower-thirds" },
  { id: "fullscreen-graphic", label: "Full-Screen Graphic", category: "fullscreen" },
  { id: "virtual-floor", label: "Virtual Floor Graphic", category: "fullscreen" },
  { id: "floating-ar", label: "Floating AR Object", category: "custom" },
  { id: "screen-insert", label: "Screen Insert", category: "custom" },
  { id: "custom", label: "Custom", category: "custom" },
];

export const WORKFLOW_STEPS: { id: ArWorkflowStep; label: string; step: number }[] = [
  { id: "import", label: "Image Import", step: 1 },
  { id: "cleanup", label: "Cleanup", step: 2 },
  { id: "layering", label: "Layering", step: 3 },
  { id: "data-mapping", label: "Data Mapping", step: 4 },
  { id: "template-slot", label: "Template Slot", step: 5 },
  { id: "preview", label: "Preview", step: 6 },
  { id: "export", label: "Export", step: 7 },
];

export const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

export const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

export const DEFAULT_ANCHORS = {
  anchorType: "ground" as const,
  worldPosition: { x: 0, y: 0, z: 0 },
  worldRotation: { x: 0, y: 0, z: 0 },
  worldScale: { x: 1, y: 1, z: 1 },
  lockToHorizon: false,
  faceCamera: false,
  safeAreaConstraint: true,
  depthTest: true,
  occlusion: true,
  renderOrder: 0,
};

export const DEFAULT_SHADOW = {
  enabled: true,
  intensity: 0.6,
  type: "ground" as const,
  offsetY: 0,
  blur: 0.4,
};

export const DEFAULT_DEPTH = {
  mode: "flat" as const,
  spacing: 0.06,
  parallaxStrength: 1,
  distributeEvenly: false,
};

export const DEFAULT_EXTRUSION = {
  depth: 0.08,
  bevel: 0.01,
  bevelThickness: 0.005,
};

export const DEFAULT_CARD3D = {
  thickness: 0.02,
  cornerRadius: 0.01,
  borderWidth: 0,
  borderColor: "#ffffff",
  reflection: 0.3,
  shadowEnabled: true,
};

export const DEFAULT_DISPLACEMENT = {
  strength: 0.1,
  smoothing: 0.5,
  invert: false,
};

export const DEFAULT_ADJUSTMENTS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpen: 0,
  blur: 0,
  levels: { black: 0, white: 255, gamma: 1 },
};
