export type ID = string;

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "add";

/** Shape only in Phase 1 — the data-binding engine itself is Phase 3. */
export interface Binding {
  targetPath: string;
  source: string;
  format?: string;
  fallback?: unknown;
}

export type ARAnimationPreset =
  | "none"
  | "fade"
  | "slide"
  | "scale"
  | "pop"
  | "wipe"
  | "rotate"
  | "fly"
  | "count-up"
  | "bar-grow"
  | "ticker-crawl"
  | "loop-pulse";

export interface ARAnimation {
  preset: ARAnimationPreset;
  duration: number;
  delay: number;
  easing: string;
  direction: "left" | "right" | "top" | "bottom" | "front" | "back" | "none";
  /** Dissolve instead of wipe (true by default for `fade` preset). */
  fade?: boolean;
  /** Pop / scale entrance start (0..1). */
  scaleFrom?: number;
  /** Slide / fly travel distance in world units. */
  distance?: number;
  /** Separate OUT timing — mirrors gfx2d `anim.out`. */
  outDelay?: number;
  outDuration?: number;
  outEasing?: string;
  /** Interpolate numeric text3d during IN. */
  countUp?: boolean;
  /** loop-pulse breathing period (seconds). */
  loopPeriod?: number;
  /** loop-pulse scale amplitude (0.05 = ±5%). */
  loopScale?: number;
}

export interface Asset {
  id: ID;
  kind: "image" | "font" | "model" | "video" | "lottie";
  name: string;
  /** For models: the sidecar URL (`http://127.0.0.1:4977/assets/<file>`) —
   * binaries live on disk served by axum, never base64 inside this doc. */
  src: string;
  /** Model interchange format, recorded at import from the file extension.
   * glTF/GLB is the primary open standard (what Unreal/Unity/Blender export);
   * FBX/OBJ are accepted for legacy pipelines. */
  format?: "glb" | "gltf" | "fbx" | "obj";
  /** Real rendered preview (small PNG data URL from an offscreen WebGL
   * render of the actual geometry) — never a placeholder icon. */
  thumbnail?: string;
  /** Image pixel size — used for correct AR plane aspect without stretching. */
  imageWidth?: number;
  imageHeight?: number;
  /** Video pixel size retained from metadata for fit and quality diagnostics. */
  videoWidth?: number;
  videoHeight?: number;
  /** Optional non-destructive render-budget variant; `src` remains original. */
  optimizedSrc?: string;
  optimizedMaxEdge?: number;
  /** For `font` assets: the CSS font-family name registered via the
   * FontFace API (see src/document/fonts.ts) — what a TextElement's
   * `fontFamily` field actually references. */
  family?: string;
}

// ---------------------------------------------------------------------------
// Virtual Set (set3d) node graph — Phase 5.
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Full 3D transform. Rotation is in degrees (operator-friendly, matches the
 * 2D `Transform.rotation` convention) — converted to radians only at the
 * three.js render boundary. */
export interface Transform3D {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface MaterialProps {
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  /** Explicit MeshPhysicalMaterial opt-in; also implied when clearcoat > 0. */
  usePhysical?: boolean;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  /** Per-material IBL strength (three.js envMapIntensity). */
  envMapIntensity?: number;
  /** Local image assets via sidecar /assets — never remote URLs. */
  mapAssetId?: string;
  normalMapAssetId?: string;
  /** Packed ORM: R=AO, G=Roughness, B=Metalness (linear). */
  ormMapAssetId?: string;
  /** Shared UV transform for PBR maps. */
  textureScale?: { x: number; y: number };
  textureOffset?: { x: number; y: number };
  textureRotation?: number;
}

export type SurfaceFit = "contain" | "cover" | "stretch";
export type SurfaceAnchor = "center" | "top" | "bottom" | "left" | "right";
export type SurfaceSlotKind = "branding" | "media" | "data";

/** Persisted display policy shared by image and video surfaces. */
export interface SurfaceDisplaySettings {
  fit: SurfaceFit;
  /** Normalised UV crop rectangle. */
  crop?: { x: number; y: number; w: number; h: number };
  anchor?: SurfaceAnchor;
  /** Small scale multiplier used to eliminate edge gaps without stretching. */
  overscan?: number;
  rotation?: number;
  opacity?: number;
}

/** A live video source feeding a `videofeed` node. `none` renders a dark
 * standby panel with the feed's label — honest "no signal", not fake static.
 * `program`/`preview` are confidence monitors: the node renders a live
 * re-render of whichever scene is currently on Program/Preview, the same
 * technique real vMix/OBS multiviews use — see ConfidenceMonitorView in
 * SetNodes.tsx. Capped at one level of recursion (a confidence monitor
 * inside the very scene it's confidence-monitoring shows a static standby
 * for its own nested copy, not an infinite tunnel) — a stated v1 bound, not
 * a silent limitation. */
export type VideoSource =
  | { type: "none" }
  | { type: "device"; deviceId: string }
  | { type: "screen" }
  | { type: "url"; url: string }
  | { type: "program" }
  | { type: "preview" };

export type SetNodeRole = "set" | "ar";

interface BaseSetNode {
  id: ID;
  name: string;
  transform: Transform3D;
  visible: boolean;
  locked: boolean;
  /** Broadcast authoring role. AR nodes are editable in the AR workspace;
   * set nodes stay visible there only as locked studio context. */
  role?: SetNodeRole;
  opacity?: number;
  bindings?: Binding[];
  animation?: ARAnimation;
  onAir?: boolean;
  /** Squad formation board: when set (1–11), X/Z follows live squad.formation. */
  formationSlot?: number;
  /** Makes authored empty planes/feeds discoverable as real content slots. */
  slotKind?: SurfaceSlotKind;
  slotLabel?: string;
  /** Manifest-driven AR model instances (AR 3D Models library): which model
   * built this subtree and with what geometry parameters, so the editor can
   * rebuild it parametrically and "Reset Geometry to Reference". Only ever
   * set on a model's root group. */
  arModel?: ArModelRef;
  /** Data-driven visibility (AR model content zones): hide the node when the
   * rule fails against the live data values — "hide clock when finished". */
  visibilityRule?: VisibilityRule;
  /** How this node reacts when its displayed data VALUE changes on air
   * (score flash, stat pulse). Unchanged data never re-animates — change
   * detection compares the resolved display string. */
  updateAnim?: UpdateAnim;
  /** AR placement behaviour (AR 3D Models): world/floor lock is the plain
   * transform; cameraFacing billboards live toward the render camera;
   * presenterAnchored follows another node's world pose plus an offset;
   * screenSpace rides the camera at a fixed distance. */
  arPlacement?: ArPlacement;
}

export type ArPlacementMode =
  | "worldLocked"
  | "floorAnchored"
  | "cameraFacing"
  | "presenterAnchored"
  | "playerAnchored"
  | "screenSpace"
  | "free3D"
  | "surfaceSnap"
  | "groundSnap";

export interface ArPlacement {
  mode: ArPlacementMode;
  /** 0..1 — how strongly cameraFacing turns toward the camera. */
  cameraFacingStrength?: number;
  /** Node whose live world pose presenter/player anchoring follows. */
  anchorNodeId?: ID;
  anchorOffset?: Vec3;
  /** screenSpace: distance in front of the camera (metres). */
  screenDistance?: number;
}

/** Data-update reaction for bound content — runs on value change only. */
export type UpdateAnim = "none" | "pulse" | "flash" | "fade";

/** Reference back into the AR 3D Models library (sports panels etc.). */
export interface ArModelRef {
  modelId: string;
  version: string;
  /** Geometry parameter values the model was last built with. */
  params: Record<string, number>;
}

/** Safe declarative visibility rule — never evaluated code. */
export interface VisibilityRule {
  /** Flat data key (e.g. "sports.event.status"). */
  source: string;
  op: "empty" | "notEmpty" | "equals" | "notEquals";
  value?: string;
}

/** Imported 3D geometry (glTF/GLB/FBX/OBJ) referencing a `model` Asset. */
export interface ModelNode extends BaseSetNode {
  kind: "model";
  assetId: ID;
}

export interface PrimitiveNode extends BaseSetNode {
  kind: "primitive";
  shape: "box" | "roundedBox" | "sphere" | "cylinder" | "plane" | "prism";
  material: MaterialProps;
  textureAssetId?: ID;
  display?: SurfaceDisplaySettings;
  /** Rounded-box edge radius in local geometry units. */
  cornerRadius?: number;
  /** Prism only: extruded-polygon outline in local XY (CCW, real units —
   * unlike the unit-cube primitives, a prism's silhouette IS its outline;
   * `scale.z` sets the extrusion thickness). Chamfered frames, arches and
   * shield silhouettes are real geometry, never a texture trick. */
  outline?: { x: number; y: number }[];
  /** Prism only: inner cutout — turns the prism into a genuine frame ring. */
  holeOutline?: { x: number; y: number }[];
  /** Prism only: real bevel size on the extruded edges (world units). */
  bevel?: number;
  /** Hero desk planar reflector — High tier + planarReflection.maxCount 2. */
  reflector?: boolean;
}

export interface Text3dNode extends BaseSetNode {
  kind: "text3d";
  text: string;
  fontSize: number;
  color: string;
}

export interface LightNode extends BaseSetNode {
  kind: "light";
  lightType: "spot" | "point" | "directional";
  color: string;
  intensity: number;
  /** Spot-only cone angle, radians-free degrees like rotation. */
  angle?: number;
  penumbra?: number;
  distance?: number;
  castShadow: boolean;
}

/** A virtual studio camera. Position/aim come from `transform`; the editor
 * shows a frustum helper, Program renders through the set's active camera. */
export interface CameraNode extends BaseSetNode {
  kind: "camera";
  fov: number;
}

/** A plane in 3D space textured by a live video stream — LED wall, desk
 * monitor, AR backplate. Sized by `width`/`height` in meters (scale still
 * applies on top). */
export interface VideoFeedNode extends BaseSetNode {
  kind: "videofeed";
  source: VideoSource;
  width: number;
  height: number;
  /** Shown on the standby panel and in outliners — e.g. "CAM 1". */
  label: string;
  /** 0-1 gain applied to the underlying media element. Audio only ever
   * plays in the Program window (see DocumentRenderer's `audible` prop) —
   * the editor, Preview, and confidence monitors are always silent so
   * authoring never feeds back or doubles up audio across windows.
   * Defaults to 1 (full volume) when absent. */
  volume?: number;
  /** Defaults to false — a video/live source is audible by default once
   * it reaches the Program window, matching standard broadcast-tool
   * behavior (vMix/OBS sources are live unless explicitly muted). */
  muted?: boolean;
  /** Green-screen keyer (chroma key), applied in the video plane's shader —
   * keys the screen color transparent so a presenter (or keyed clip)
   * composites INTO the 3D studio. `similarity` = chroma distance below
   * which a pixel is fully keyed (0-1); `smoothness` widens the soft edge;
   * `spill` (0-1, default 0.5) suppresses the key color bleeding onto the
   * talent's edges — the tint that gives away a cheap key.
   * Absent/disabled = the feed renders opaque exactly as before. */
  chromaKey?: {
    enabled: boolean;
    color: string;
    similarity: number;
    smoothness: number;
    spill?: number;
    /** "color" (default) = classic green-screen chroma distance;
     * "segment" = AI person matte (MediaPipe Selfie Segmenter, vendored
     * offline) — keys the talent with NO physical green screen. */
    mode?: "color" | "segment";
  };
  /** Horizontal UV window (0-1): this surface shows only the [x, x+w] slice
   * of its source. What makes ONE image/video span a segmented curved wall
   * seamlessly — each panel gets the same source with its own window, so
   * content continues across panels instead of restarting on each (see the
   * Curved Panoramic studio's full-wall/panoramic modes). Absent = whole
   * source. Applies to the plain screen path (not the chroma-keyed path). */
  crop?: { x: number; w: number };
  display?: SurfaceDisplaySettings;
}

export interface GroupNode extends BaseSetNode {
  kind: "group";
  children: SetNode[];
}

export type SetNode = ModelNode | PrimitiveNode | Text3dNode | LightNode | CameraNode | VideoFeedNode | GroupNode;

/** Hero planar floor mirror — Med+ / explicit enable (see qualityTiers.ts). */
export interface FloorReflectorSettings {
  enabled: boolean;
  /** Reflector RT edge length in px. */
  resolution?: number;
  mixStrength?: number;
  mirror?: number;
}

export interface SetEnvironment {
  /** Hex color, or "transparent" for keying the set over other layers. */
  background: string;
  floor: {
    enabled: boolean;
    color: string;
    metalness: number;
    roughness: number;
    size: number;
    /** Hero planar reflections (MeshReflectorMaterial). Optional for back-compat. */
    reflector?: FloorReflectorSettings;
    /** Real floor texture (image asset) — concrete, wood, studio vinyl —
     * what makes a set floor read as a physical material instead of flat
     * paint. Tiled `textureTiles` times across the floor plane (default 6).
     * Absent = plain color, exactly the pre-existing behavior. */
    textureAssetId?: ID;
    textureTiles?: number;
  };
  grid: boolean;
  ambient: { color: string; intensity: number };
  fog?: { color: string; near: number; far: number };
  /** AR backplate — a live video feed (camera/screen/clip/PGM/PVW) painted
   * as `scene.background`, so the 3D graphics render over a real camera
   * feed instead of a studio backdrop. Absent/`{type:"none"}` = normal
   * studio background (see SetEnvironmentView's backplate handling). */
  backplate?: VideoSource;
}

/** Quality knobs — the "runs on small machines" contract. Defaults keep
 * shadows/bloom off and DPR at 1; a strong machine can turn everything up.
 * Realism pipeline fields (qualityTier / planar / envResolution / ssr) are
 * optional for back-compat — see docs/REALISM_PIPELINE.md. */
export interface SetRenderSettings {
  exposure: number;
  shadows: boolean;
  dpr: number;
  bloom: { enabled: boolean; intensity: number; threshold: number };
  vignette: { enabled: boolean; darkness: number };
  /** Soft contact shadow blob under the set, faked cheaply via drei's
   * ContactShadows (an offline render-to-texture technique) rather than a
   * real shadow map — cheap enough to default on. */
  contactShadows?: { enabled: boolean; opacity: number; blur: number };
  /** Screen-space ambient occlusion (N8AO from @react-three/postprocessing)
   * — off by default since it costs a full-screen pass on top of whatever
   * SetPostEffects already runs. */
  ao?: { enabled: boolean; intensity: number };
  /** Offline PBR environment lighting/reflections built from a handful of
   * emissive Lightformer panels inside drei's <Environment> — no HDRI
   * download, no network. On by default at a gentle intensity so metal/
   * glossy materials get real reflections instead of flat ambient. */
  envLight?: { enabled: boolean; intensity: number };
  /** Suggested Low/Med/High budgets — see qualityTiers.ts / REALISM_PIPELINE. */
  qualityTier?: "low" | "medium" | "high";
  /** Gate for hero planar floor/desk reflections. */
  planarReflection?: { enabled: boolean; maxCount?: 1 | 2 };
  /** Lightformer / Environment bake resolution (today was hardcoded 64). */
  envResolution?: number;
  /** Optional offline cubemap asset (local /assets only — never a network HDRI). */
  envCubemapAssetId?: string;
  /** Screen-space reflections — High tier + explicit enable only. */
  ssr?: { enabled: boolean };
}

/** Which side an element is on while hidden — IN animates FROM it, OUT
 * animates TO it. `none` means animate in place (fade only). */
export type AnimDirection = "left" | "right" | "top" | "bottom" | "none";

export interface AnimPhaseSpec {
  /** Seconds after the layer's Play command before this element starts. */
  delay: number;
  duration: number;
  direction: AnimDirection;
  /** Travel distance in px. */
  distance: number;
  /** GSAP ease name (e.g. "power3.out", "back.out(1.4)"). */
  ease: string;
  fade: boolean;
  /** Starting scale for IN / ending scale for OUT (Phase 5.11), e.g. 0.6 for
   * "pop in", 0 combined with a "back.out" ease for "scale bounce". Absent =
   * 1 (no scale animation) — the pre-5.11 behavior. Center-anchored: the
   * element's authored center point stays fixed as it scales, computed in
   * timelineEngine.ts the same way position offset already is (a transient
   * transform adjustment, not a persisted "scale" field on the element). */
  scaleFrom?: number;
  /** IN only: interpolates a resolved numeric TEXT value from 0 up to its
   * bound/authored target over the phase duration (Phase 5.11's "number
   * count-up"). No-op on non-numeric text or on OUT. */
  countUp?: boolean;
}

/** Continuous idle animation while a layer is on air, independent of IN/OUT
 * (Phase 5.11's "loop pulse") — e.g. a sponsor bug's subtle breathing glow.
 * `periodSec` is one full cycle; `scaleTo`/`opacityTo` are the peak values
 * the element oscillates toward and back from its authored resting state. */
export interface LoopPulseSpec {
  periodSec: number;
  scaleTo?: number;
  opacityTo?: number;
}

/**
 * Per-element entrance/exit choreography (Phase 5.6) — what makes a bar
 * wipe in, a kicker tab drop in late, and lineup rows cascade instead of
 * the whole layer sharing one flat fade. Resolved by the same pure
 * timelineEngine everywhere. Absent = the legacy layer-wide slide/fade.
 */
export interface ElementAnim {
  in?: AnimPhaseSpec;
  out?: AnimPhaseSpec;
  /** Runs continuously whenever the layer is on air and NOT mid IN/OUT
   * (Phase 5.11). Independent of `in`/`out` — an element can have both. */
  loop?: LoopPulseSpec;
}

/** Soft drop shadow (Phase 5.6) — broadcast bars float over video. */
export interface ElementShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity?: number;
}

interface BaseElement {
  id: ID;
  name: string;
  transform: Transform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  bindings: Binding[];
  anim?: ElementAnim;
  shadow?: ElementShadow;
}

export interface RectElement extends BaseElement {
  kind: "rect";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  /** Linear gradient fill (Phase 5.5, for full-screen template depth).
   * When set it wins over `fill` — brand-themed panels should keep using a
   * flat `fill` + fill binding instead (the scorebug convention). Optional
   * `mid` stop (Phase 5.6) makes the glossy sheen broadcast bars have. */
  gradient?: { from: string; mid?: string; to: string; direction: "vertical" | "horizontal" | "diagonal" };
  /** Horizontal skew in degrees (Phase 5.6) — the angled parallelogram bars
   * every modern broadcast package is built from. */
  skewX?: number;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  align: "left" | "center" | "right";
  fontStyle?: string;
  /** Extra px between glyphs (Phase 5.6) — kickers like "BREAKING NEWS". */
  letterSpacing?: number;
  /** Render-time uppercase transform (Phase 5.6). Applied at draw, so a
   * bound value like a player name still displays uppercased. */
  uppercase?: boolean;
}

export interface ImageElement extends BaseElement {
  kind: "image";
  assetId: ID;
}

export interface GroupElement extends BaseElement {
  kind: "group";
  children: Element[];
}

/** A live video feed as a 2D graphics element — the same `VideoSource`
 * shape the 3D `videofeed` node uses (device/screen/url), so a webcam or
 * clip can composite directly into the GFX canvas (e.g. a full-screen
 * background plate behind a lower-third), not just as a monitor prop inside
 * a virtual set. `program`/`preview` are accepted by the type for source-
 * picker consistency but render an honest "not supported in 2D graphics
 * yet" standby — a real 2D confidence monitor would need to recursively
 * re-render the whole Konva stage, deferred rather than faked. */
export interface VideoElement extends BaseElement {
  kind: "video";
  source: VideoSource;
  /** Same audio contract as `VideoFeedNode.volume` — real gain on the
   * underlying media element, audible only in the Program window. */
  volume?: number;
  /** Defaults to false (audible by default, matching broadcast-tool norms). */
  muted?: boolean;
}

/**
 * A real After-Effects-authored motion graphic (Lottie/Bodymovin JSON),
 * played back by `lottie-web` — the "real effects and animation" SDK for 2D
 * graphics, distinct from `anim`'s hand-coded slide/fade choreography.
 * Where `anim` moves a rect/text's transform+opacity along one of a handful
 * of built-in curves, a Lottie asset can be an arbitrarily complex shape/
 * mask/particle animation designed frame-by-frame in After Effects and
 * exported once — the same format broadcast motion designers already use
 * professionally, not a hand-rolled substitute for it.
 *
 * Playback is driven the same way every other timed element in this engine
 * is: `elapsedSec` scrubs directly to a frame number (`goToAndStop`, never
 * the library's own internal play() ticker) so a Program/Preview window
 * that joins mid-animation renders the correct frame on its very first
 * paint, with no separate sync protocol — see LottieElementView.
 */
export interface LottieElement extends BaseElement {
  kind: "lottie";
  assetId: ID;
  /** Holds on the last frame when false; restarts from frame 0 when true
   * (default true — most broadcast bugs/stingers are designed to loop). */
  loop?: boolean;
  /** Playback rate multiplier. Default 1. */
  speed?: number;
}

export type Element = RectElement | TextElement | ImageElement | VideoElement | LottieElement | GroupElement;

/**
 * Discriminated on `kind` (matching Layer.kind) so future layer kinds
 * (set3d/map/chart, Phases 5/6) add real fields with zero migration to
 * Layer itself. Only 'gfx2d' carries real content in Phase 1.
 */
export type LayerProps =
  | { kind: "gfx2d"; elements: Element[]; safeArea?: boolean }
  | {
      kind: "set3d";
      nodes: SetNode[];
      environment: SetEnvironment;
      /** Which camera node Program/Preview render through. `null` = the
       * default framing (no camera node authored yet). */
      activeCameraId: ID | null;
      render: SetRenderSettings;
    }
  | { kind: "map" }
  | { kind: "chart" };

export type LayerKind = LayerProps["kind"];

/**
 * A layer's IN/OUT playback config (Phase 3). There is no `idleDuration` —
 * a layer holds at its settled IN state indefinitely until the operator
 * explicitly triggers OUT; every transition is operator-commanded, never
 * an internal timer (see playbackState.ts).
 */
export interface Timeline {
  inDuration: number;
  outDuration: number;
  inEase: string;
  outEase: string;
}

export interface Layer {
  id: ID;
  name: string;
  kind: LayerKind;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: Transform;
  bindings: Binding[];
  props: LayerProps;
  /** Only meaningful for `gfx2d` layers; absent means "no animation, always fully shown/hidden by `visible`". */
  timeline?: Timeline;
  /** Phase 4 ticker: pixels/second the layer's elements scroll left,
   * looping every `transform.width` px. Absent means "not a ticker, no
   * scroll". Continuous motion is a genuinely different animation shape
   * than `timeline`'s bounded IN/OUT tween, so it's its own field rather
   * than overloading Timeline — see timelineEngine.ts's `applyScroll`. */
  scrollSpeed?: number;
}

export interface Scene {
  id: ID;
  name: string;
  layers: Layer[];
}

/** AR Asset Builder document — versioned, persisted in project.arBuilderAssets. */
export type { ArBuilderAsset } from "@/ar-asset-builder/types";

export interface Project {
  id: ID;
  name: string;
  resolution: { width: number; height: number };
  fps: number;
  colorSpace: "srgb" | "rec709";
  scenes: Scene[];
  assets: Asset[];
  /** AR Asset Builder library — reusable image-to-AR assets for this project. */
  arBuilderAssets?: import("@/ar-asset-builder/types").ArBuilderAsset[];
  schemaVersion: number;
  /** How this project's NDI sender advertises itself on the network. */
  ndiSourceName?: string;
}

export const CURRENT_SCHEMA_VERSION = 1;
