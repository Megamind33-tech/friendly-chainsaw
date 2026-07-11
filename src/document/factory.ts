import { newId } from "./ids";
import { autoQualityTier, settingsForQualityTier } from "./qualityTiers";
import type {
  Project,
  Scene,
  Layer,
  LayerKind,
  LayerProps,
  Timeline,
  Transform,
  Element,
  RectElement,
  TextElement,
  ImageElement,
  VideoElement,
  LottieElement,
  GroupElement,
  Transform3D,
  Vec3,
  MaterialProps,
  SetEnvironment,
  SetRenderSettings,
  SetNodeRole,
  ModelNode,
  PrimitiveNode,
  Text3dNode,
  LightNode,
  CameraNode,
  VideoFeedNode,
  GroupNode,
  SetNode,
} from "./types";
import { CURRENT_SCHEMA_VERSION as SCHEMA_VERSION } from "./types";

export function defaultTransform(overrides: Partial<Transform> = {}): Transform {
  return { x: 100, y: 100, width: 400, height: 120, rotation: 0, ...overrides };
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function defaultTransform3D(overrides: Partial<Transform3D> = {}): Transform3D {
  return {
    position: overrides.position ?? vec3(),
    rotation: overrides.rotation ?? vec3(),
    scale: overrides.scale ?? vec3(1, 1, 1),
  };
}

export function defaultSetEnvironment(overrides: Partial<SetEnvironment> = {}): SetEnvironment {
  const floorIn = overrides.floor;
  return {
    background: overrides.background ?? "#050510",
    grid: overrides.grid ?? true,
    ambient: overrides.ambient ?? { color: "#ffffff", intensity: 0.35 },
    fog: overrides.fog,
    // Undefined, not {type:"none"} — an absent backplate means "no AR field
    // authored at all" (matches fog's optional-object convention) and
    // keeps old projects honest about "no AR authored".
    backplate: overrides.backplate,
    floor: {
      enabled: floorIn?.enabled ?? true,
      color: floorIn?.color ?? "#101020",
      metalness: floorIn?.metalness ?? 0.4,
      roughness: floorIn?.roughness ?? 0.5,
      size: floorIn?.size ?? 30,
      reflector: {
        enabled: true,
        resolution: 512,
        mixStrength: 0.4,
        mirror: 0.22,
        ...(floorIn?.reflector ?? {}),
      },
      // The "factory forgot the field" bug class — copied explicitly.
      textureAssetId: floorIn?.textureAssetId,
      textureTiles: floorIn?.textureTiles,
    },
  };
}

export function defaultSetRenderSettings(overrides: Partial<SetRenderSettings> = {}): SetRenderSettings {
  const tier = autoQualityTier();
  const tierDefaults = settingsForQualityTier(tier);
  return {
    exposure: 1.2,
    shadows: false,
    dpr: tierDefaults.dpr ?? 1,
    bloom: { enabled: false, intensity: 0.6, threshold: 0.9 },
    vignette: { enabled: false, darkness: 0.6 },
    // Cheap and on: a soft contact-shadow blob under the set costs one
    // small render-to-texture pass, not a real shadow map.
    contactShadows: { enabled: true, opacity: 0.4, blur: 2 },
    // Off by default: SSAO/N8AO is a real full-screen cost small machines
    // shouldn't pay unless the operator opts in.
    ao: { enabled: false, intensity: 1 },
    // On by default at a gentle intensity: offline Lightformer-based IBL
    // gives PBR materials real reflections at near-zero perf cost.
    envLight: { enabled: true, intensity: 0.35 },
    // Phase 5.13 — stay near Low/Med; High unlocks SSR/planar desk later.
    // New sets size themselves to the machine they're authored on (weak
    // laptop = low, discrete GPU = high). Always overridable per set in the
    // Inspector's Render Quality section; autoQualityTier() returns "low"
    // outside a browser (verify scripts) so tests stay deterministic-safe.
    qualityTier: tier,
    planarReflection: { enabled: true, maxCount: 1 },
    envResolution: 128,
    ssr: { enabled: false },
    // Apply the complete tier contract, not only DPR. This keeps the tier
    // label, reflection policy, IBL resolution and post effects consistent.
    ...tierDefaults,
    ...overrides,
  };
}

/** The only place Layer.kind and Layer.props.kind are set together. */
function layerPropsForKind(kind: LayerKind): LayerProps {
  switch (kind) {
    case "gfx2d":
      return { kind: "gfx2d", elements: [], safeArea: true };
    case "set3d":
      return {
        kind: "set3d",
        nodes: [],
        environment: defaultSetEnvironment(),
        activeCameraId: null,
        render: defaultSetRenderSettings(),
      };
    case "map":
      return { kind: "map" };
    case "chart":
      return { kind: "chart" };
  }
}

export function defaultTimeline(overrides: Partial<Timeline> = {}): Timeline {
  return {
    inDuration: 0.6,
    outDuration: 0.4,
    inEase: "power2.out",
    outEase: "power1.in",
    ...overrides,
  };
}

export function createLayer(kind: LayerKind, overrides: Partial<Omit<Layer, "kind" | "props">> = {}): Layer {
  return {
    id: newId(),
    name: overrides.name ?? (kind === "gfx2d" ? "New Layer" : kind),
    kind,
    zIndex: overrides.zIndex ?? 0,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    opacity: overrides.opacity ?? 1,
    blendMode: overrides.blendMode ?? "normal",
    transform: overrides.transform ?? defaultTransform({ x: 0, y: 0, width: 1920, height: 1080 }),
    bindings: overrides.bindings ?? [],
    props: layerPropsForKind(kind),
    timeline: overrides.timeline ?? (kind === "gfx2d" ? defaultTimeline() : undefined),
    scrollSpeed: overrides.scrollSpeed,
  };
}

export function createRectElement(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: newId(),
    name: overrides.name ?? "Rectangle",
    kind: "rect",
    transform: overrides.transform ?? defaultTransform(),
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    bindings: overrides.bindings ?? [],
    fill: overrides.fill ?? "#cc0000",
    stroke: overrides.stroke,
    strokeWidth: overrides.strokeWidth,
    cornerRadius: overrides.cornerRadius ?? 0,
    // Phase 4's scrollSpeed taught this lesson: TypeScript cannot catch a
    // field you forget to copy in an object literal.
    gradient: overrides.gradient,
    skewX: overrides.skewX,
    anim: overrides.anim,
    shadow: overrides.shadow,
  };
}

export function createTextElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: newId(),
    name: overrides.name ?? "Text",
    kind: "text",
    transform: overrides.transform ?? defaultTransform({ width: 360, height: 48 }),
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    bindings: overrides.bindings ?? [],
    text: overrides.text ?? "Text",
    fontFamily: overrides.fontFamily ?? "Geist Sans",
    fontSize: overrides.fontSize ?? 32,
    fill: overrides.fill ?? "#ffffff",
    align: overrides.align ?? "left",
    fontStyle: overrides.fontStyle,
    letterSpacing: overrides.letterSpacing,
    uppercase: overrides.uppercase,
    anim: overrides.anim,
    shadow: overrides.shadow,
  };
}

export function createImageElement(assetId: string, overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: newId(),
    name: overrides.name ?? "Image",
    kind: "image",
    transform: overrides.transform ?? defaultTransform({ width: 200, height: 200 }),
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    bindings: overrides.bindings ?? [],
    anim: overrides.anim,
    shadow: overrides.shadow,
    assetId,
  };
}

/** An unfilled image placeholder for templates (logo/photo/icon slots) — an
 * image element with no asset. It renders as a dashed "empty slot" box in the
 * editor and nothing on air (see renderNodes' ImageElementView), and the
 * operator fills it in two clicks via the Inspector's "Choose image". */
export function createImageSlot(name: string, transform: Partial<Transform>, overrides: Partial<ImageElement> = {}): ImageElement {
  return createImageElement("", {
    name,
    transform: defaultTransform(transform),
    ...overrides,
  });
}

export function createVideoElement(overrides: Partial<VideoElement> = {}): VideoElement {
  return {
    id: newId(),
    name: overrides.name ?? "Video",
    kind: "video",
    transform: overrides.transform ?? defaultTransform({ width: 640, height: 360 }),
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    bindings: overrides.bindings ?? [],
    anim: overrides.anim,
    shadow: overrides.shadow,
    source: overrides.source ?? { type: "none" },
    volume: overrides.volume,
    muted: overrides.muted,
  };
}

export function createLottieElement(assetId: string, overrides: Partial<LottieElement> = {}): LottieElement {
  return {
    id: newId(),
    name: overrides.name ?? "Motion Graphic",
    kind: "lottie",
    transform: overrides.transform ?? defaultTransform({ width: 480, height: 480 }),
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    bindings: overrides.bindings ?? [],
    anim: overrides.anim,
    shadow: overrides.shadow,
    assetId,
    loop: overrides.loop,
    speed: overrides.speed,
  };
}

export function createGroupElement(overrides: Partial<GroupElement> = {}): GroupElement {
  return {
    id: newId(),
    name: overrides.name ?? "Group",
    kind: "group",
    transform: overrides.transform ?? defaultTransform(),
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    bindings: overrides.bindings ?? [],
    anim: overrides.anim,
    shadow: overrides.shadow,
    children: overrides.children ?? [],
  };
}

// ---------------------------------------------------------------------------
// set3d node factories (Phase 5). Same discipline as elements: every node is
// built here so shapes can't drift from types.ts.
// ---------------------------------------------------------------------------

function baseSetNode(
  name: string,
  overrides: {
    transform?: Partial<Transform3D>;
    visible?: boolean;
    locked?: boolean;
    name?: string;
    role?: SetNodeRole;
    formationSlot?: number;
    slotKind?: import("./types").SurfaceSlotKind;
    slotLabel?: string;
    arModel?: import("./types").ArModelRef;
    visibilityRule?: import("./types").VisibilityRule;
    updateAnim?: import("./types").UpdateAnim;
    arPlacement?: import("./types").ArPlacement;
  },
) {
  return {
    id: newId(),
    name: overrides.name ?? name,
    transform: defaultTransform3D(overrides.transform),
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    role: overrides.role,
    formationSlot: overrides.formationSlot,
    slotKind: overrides.slotKind,
    slotLabel: overrides.slotLabel,
    arModel: overrides.arModel,
    visibilityRule: overrides.visibilityRule,
    updateAnim: overrides.updateAnim,
    arPlacement: overrides.arPlacement,
  };
}

type NodeOverrides = {
  transform?: Partial<Transform3D>;
  visible?: boolean;
  locked?: boolean;
  name?: string;
  role?: SetNodeRole;
  formationSlot?: number;
  slotKind?: import("./types").SurfaceSlotKind;
  slotLabel?: string;
  arModel?: import("./types").ArModelRef;
  visibilityRule?: import("./types").VisibilityRule;
  updateAnim?: import("./types").UpdateAnim;
  arPlacement?: import("./types").ArPlacement;
};

export function defaultMaterial(overrides: Partial<MaterialProps> = {}): MaterialProps {
  return { color: "#8899aa", metalness: 0.3, roughness: 0.5, ...overrides };
}

export function createModelNode(assetId: string, overrides: NodeOverrides = {}): ModelNode {
  return { ...baseSetNode("Model", overrides), kind: "model", assetId };
}

export function createPrimitiveNode(
  shape: PrimitiveNode["shape"],
  overrides: NodeOverrides & {
    material?: Partial<MaterialProps>;
    textureAssetId?: string;
    display?: PrimitiveNode["display"];
    cornerRadius?: number;
    reflector?: boolean;
    outline?: PrimitiveNode["outline"];
    holeOutline?: PrimitiveNode["holeOutline"];
    bevel?: number;
  } = {},
): PrimitiveNode {
  return {
    ...baseSetNode(shape.charAt(0).toUpperCase() + shape.slice(1), overrides),
    kind: "primitive",
    shape,
    material: defaultMaterial(overrides.material),
    textureAssetId: overrides.textureAssetId,
    display: overrides.display,
    cornerRadius: overrides.cornerRadius,
    reflector: overrides.reflector,
    outline: overrides.outline,
    holeOutline: overrides.holeOutline,
    bevel: overrides.bevel,
  };
}

export function createText3dNode(
  overrides: NodeOverrides & { text?: string; fontSize?: number; color?: string } = {},
): Text3dNode {
  return {
    ...baseSetNode("Text", overrides),
    kind: "text3d",
    text: overrides.text ?? "TEXT",
    fontSize: overrides.fontSize ?? 0.25,
    color: overrides.color ?? "#ffffff",
  };
}

export function createLightNode(
  lightType: LightNode["lightType"],
  overrides: NodeOverrides &
    Partial<Pick<LightNode, "color" | "intensity" | "angle" | "penumbra" | "distance" | "castShadow">> = {},
): LightNode {
  return {
    ...baseSetNode(`${lightType.charAt(0).toUpperCase() + lightType.slice(1)} Light`, overrides),
    kind: "light",
    lightType,
    color: overrides.color ?? "#ffffff",
    intensity: overrides.intensity ?? (lightType === "spot" ? 40 : 5),
    angle: overrides.angle ?? (lightType === "spot" ? 35 : undefined),
    penumbra: overrides.penumbra ?? (lightType === "spot" ? 0.5 : undefined),
    distance: overrides.distance,
    castShadow: overrides.castShadow ?? false,
  };
}

export function createCameraNode(overrides: NodeOverrides & { fov?: number } = {}): CameraNode {
  return {
    ...baseSetNode("Camera", overrides),
    kind: "camera",
    fov: overrides.fov ?? 50,
    // A camera at the origin staring at the inside of the floor is useless
    // on creation — default to a sensible studio framing.
    transform: defaultTransform3D(
      overrides.transform ?? { position: vec3(0, 1.7, 6), rotation: vec3(-5, 0, 0) },
    ),
  };
}

export function createVideoFeedNode(
  overrides: NodeOverrides &
    Partial<Pick<VideoFeedNode, "source" | "width" | "height" | "label" | "volume" | "muted" | "chromaKey" | "crop" | "display">> = {},
): VideoFeedNode {
  return {
    ...baseSetNode(overrides.label ?? "Video Feed", overrides),
    kind: "videofeed",
    source: overrides.source ?? { type: "none" },
    width: overrides.width ?? 2.4,
    height: overrides.height ?? 1.35,
    label: overrides.label ?? "FEED",
    volume: overrides.volume,
    muted: overrides.muted,
    // Explicitly copied — the recurring "factory forgot the new field" bug
    // class (scrollSpeed, gradient, volume/muted all hit it before).
    chromaKey: overrides.chromaKey,
    crop: overrides.crop,
    display: overrides.display,
  };
}

/** A neutral, aspect-safe image/logo panel that is immediately discoverable
 * in the set-level Branding & Media inspector. The empty state is a real
 * editable panel, never baked template artwork. */
export function createBrandingSurfaceNode(
  overrides: NodeOverrides & {
    textureAssetId?: string;
    display?: PrimitiveNode["display"];
    material?: Partial<MaterialProps>;
  } = {},
): PrimitiveNode {
  return createPrimitiveNode("plane", {
    name: overrides.name ?? "Branding Surface",
    transform: overrides.transform,
    visible: overrides.visible,
    locked: overrides.locked,
    role: overrides.role,
    slotKind: "branding",
    slotLabel: overrides.slotLabel ?? overrides.name ?? "Branding Surface",
    textureAssetId: overrides.textureAssetId,
    display: overrides.display ?? { fit: "contain", anchor: "center", overscan: 1, opacity: 1 },
    material: {
      color: "#1b2028",
      metalness: 0.05,
      roughness: 0.72,
      envMapIntensity: 0.45,
      ...overrides.material,
    },
  });
}

/** A real video/live/Programme/Preview display surface with sane broadcast
 * defaults and explicit media-slot metadata. */
export function createMediaSurfaceNode(
  overrides: NodeOverrides &
    Partial<Pick<VideoFeedNode, "source" | "width" | "height" | "label" | "volume" | "muted" | "chromaKey" | "crop" | "display">> = {},
): VideoFeedNode {
  return createVideoFeedNode({
    ...overrides,
    label: overrides.label ?? overrides.slotLabel ?? overrides.name ?? "MEDIA",
    slotKind: "media",
    slotLabel: overrides.slotLabel ?? overrides.label ?? overrides.name ?? "Media Surface",
    display: overrides.display ?? { fit: "cover", anchor: "center", overscan: 1.01, opacity: 1 },
  });
}

export function createGroupNode(children: SetNode[] = [], overrides: NodeOverrides = {}): GroupNode {
  return { ...baseSetNode("Group", overrides), kind: "group", children };
}

/** A set3d layer pre-filled with nodes — used by the src/sets builders the
 * way sports scorebugs use addPrebuiltLayer. */
export function createSet3dLayer(
  nodes: SetNode[],
  overrides: Partial<Omit<Layer, "kind" | "props">> & {
    environment?: Partial<SetEnvironment>;
    activeCameraId?: string | null;
    render?: Partial<SetRenderSettings>;
  } = {},
): Layer {
  const { environment, activeCameraId, render, ...layerOverrides } = overrides;
  const layer = createLayer("set3d", { name: "Virtual Set", ...layerOverrides });
  layer.props = {
    kind: "set3d",
    nodes,
    environment: defaultSetEnvironment(environment),
    activeCameraId: activeCameraId ?? null,
    render: defaultSetRenderSettings(render),
  };
  return layer;
}

export function regenerateElementIds(el: Element): Element {
  const copy = { ...el, id: newId() };
  if (copy.kind === "group") copy.children = copy.children.map(regenerateElementIds);
  return copy;
}

/** A fully independent copy of an element with every id regenerated and its
 * position nudged, for canvas "duplicate" (Ctrl+D). Deep-cloned first so no
 * nested object (transform/gradient/anim/shadow) is shared with the original. */
export function duplicateElementValue(el: Element, offset = 24): Element {
  const clone = regenerateElementIds(JSON.parse(JSON.stringify(el)) as Element);
  clone.name = `${el.name} copy`;
  clone.transform = { ...clone.transform, x: clone.transform.x + offset, y: clone.transform.y + offset };
  return clone;
}

function regenerateNodeIds(node: SetNode, idMap: Map<string, string>): SetNode {
  const nextId = newId();
  idMap.set(node.id, nextId);
  const copy = { ...node, id: nextId };
  if (copy.kind === "group") copy.children = copy.children.map((c) => regenerateNodeIds(c, idMap));
  return copy;
}

/** Deep-clones a layer with every id regenerated (layer, elements, 3D nodes)
 * so the copy is fully independent — including remapping a set3d layer's
 * activeCameraId onto the CLONED camera node. */
export function cloneLayerWithNewIds(layer: Layer): Layer {
  const copy: Layer = JSON.parse(JSON.stringify(layer));
  copy.id = newId();
  copy.name = `${layer.name} copy`;
  if (copy.props.kind === "gfx2d") {
    copy.props.elements = copy.props.elements.map(regenerateElementIds);
  } else if (copy.props.kind === "set3d") {
    const idMap = new Map<string, string>();
    copy.props.nodes = copy.props.nodes.map((n) => regenerateNodeIds(n, idMap));
    copy.props.activeCameraId = copy.props.activeCameraId
      ? (idMap.get(copy.props.activeCameraId) ?? null)
      : null;
  }
  return copy;
}

export function createScene(name = "Scene 1"): Scene {
  return { id: newId(), name, layers: [] };
}

export function createDefaultProject(name = "Untitled Project"): Project {
  return {
    id: newId(),
    name,
    resolution: { width: 1920, height: 1080 },
    fps: 50,
    colorSpace: "srgb",
    scenes: [createScene()],
    assets: [],
    arBuilderAssets: [],
    schemaVersion: SCHEMA_VERSION,
  };
}
