import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, MeshReflectorMaterial, PerspectiveCamera, RenderTexture, RoundedBox } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type {
  Asset,
  CameraNode,
  LightNode,
  MaterialProps,
  ModelNode,
  PrimitiveNode,
  Project,
  SetEnvironment,
  SetNode,
  SetRenderSettings,
  Text3dNode,
  VideoFeedNode,
  VideoSource,
} from "@/document/types";
import { resolveEnvResolution, shouldUseDeskReflector, shouldUseFloorReflector } from "@/document/qualityTiers";
import { ArImagePlaneView, ImageSlotPlaceholder } from "./ArImagePlaneView";
import { ArPanelView } from "./ArPanelView";
import { ArMotionContext, useArMotionRef } from "./arMotionContext";
import { applySurfaceDisplaySettings, probeImageAspect, resolveTextureEdgeBudget } from "./displayTextures";
import { useVideoFeed } from "./videoFeeds";
import { useSegmentationMask } from "./segmentation";
import { camNodeObjectName, setNodeObjectName } from "@/document/cameraMoves";
import { buildDataValuesCached, useDataStore } from "@/document/dataSources";
import { useDocStore } from "@/document/store";
import { computeArMotion } from "@/ar-engine/arMotionEngine";
import { evaluateVisibilityRule } from "@/ar-engine/visibility";
import { formatBindingValue } from "@/ar-system/binding/format";
import { usePrismGeometry } from "./prismGeometry";
import { formationSlotWorldPosition, resolveFormation } from "@/sports/squads";
import { renderSetNode, type SetNodeRendererRegistry } from "./setNodeRegistry";

/**
 * Pure SetNode → react-three-fiber mapping — the 3D counterpart of
 * renderNodes.tsx. No store access, no hooks into app state: everything
 * arrives through the node and this context. The interactive Set3dEditor
 * and the non-interactive Set3dRenderer both consume exactly this, which is
 * the two-consumer proof for the 3D plane.
 */
export interface SetNodeContext {
  /** Editor: picking enabled, helpers drawn, cameras never take over. */
  interactive: boolean;
  /** True only in the Program window — the sole place a videofeed node's
   * real audio plays. Confidence monitors and the AR backplate never read
   * this (they're always silent, see ConfidenceMonitorView / ArBackplateView
   * — avoids feedback and doesn't make sense for a background camera feed).
   * Defaults to false (silent) when omitted. */
  audible?: boolean;
  assets: Asset[];
  /** Which camera node drives the view — only honored when !interactive. */
  activeCameraId: string | null;
  /** `additive` = Shift/Ctrl held — multi-selection toggle. */
  onPick?: (nodeId: string, additive?: boolean) => void;
  isPickable?: (node: SetNode) => boolean;
  /** Lets the editor find the three.js object for a node id (gizmo attach). */
  registerObject?: (nodeId: string, object: THREE.Object3D | null) => void;
  /** Needed only by `program`/`preview` confidence-monitor videofeed sources
   * (see ConfidenceMonitorView) to look up and re-render the on-air scene. */
  project?: Project | null;
  programSceneId?: string | null;
  previewSceneId?: string | null;
  /** Set render settings — needed for desk planar gating in PrimitiveView. */
  render?: SetRenderSettings;
  /** How many confidence-monitor levels deep this render already is. A
   * monitor rendered inside the very scene it's confidence-monitoring would
   * otherwise recurse forever (a camera pointed at its own screen); capped
   * at depth 1 — the nested copy shows a standby instead of tunneling
   * further. Undefined is treated as 0 (top-level render). */
  confidenceDepth?: number;
  /** The owning set3d layer's Play IN/OUT state (same shared-timestamp
   * contract as 2D layerPlayback). Drives per-node ARAnimation entrance/
   * exit choreography on `role: "ar"` nodes — see ArNodeAnimator. The
   * editor never passes this (authoring shows AR at rest); a renderer with
   * no entry shows AR at rest too (playback never armed = legacy behavior). */
  playback?: { phase: "in" | "out"; startedAt: number } | null;
  /** Precomputed set of AR node ids hidden by the layer's live focus (see
   * arFocus.ts's computeArHiddenSet). Only renderers supply it — supplying
   * even an EMPTY set keeps the focus animator mounted so SHOW ALL animates
   * back instead of snapping. The editor omits it entirely. */
  arHidden?: Set<string>;
}

export const DEG2RAD = Math.PI / 180;

/** How far (in local +Z) a spot/directional light's aim target sits. Builders
 * compute node rotations with plain-Object3D lookAt semantics (+Z toward the
 * subject), so the target lives on local +Z. */
const LIGHT_AIM_DISTANCE = 5;

function eulerFromNode(node: SetNode): [number, number, number] {
  const r = node.transform.rotation;
  return [r.x * DEG2RAD, r.y * DEG2RAD, r.z * DEG2RAD];
}

// ---------------------------------------------------------------------------
// Text-as-canvas-texture: crisp label rendering with zero network font
// loading (troika/drei Text fetches its default font from a CDN — a real
// failure mode on this project's flaky network; see PLAN.md Phase 0 notes).
// ---------------------------------------------------------------------------

function makeTextTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontPx = 96;
  ctx.font = `600 ${fontPx}px "Geist Sans", sans-serif`;
  const metrics = ctx.measureText(text || " ");
  canvas.width = Math.ceil(Math.max(metrics.width, 1)) + 32;
  canvas.height = fontPx * 1.4;
  // Canvas resets state on resize — set the font again before drawing.
  const draw = canvas.getContext("2d")!;
  draw.font = `600 ${fontPx}px "Geist Sans", sans-serif`;
  draw.fillStyle = color;
  draw.textBaseline = "middle";
  draw.fillText(text, 16, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, aspect: canvas.width / canvas.height };
}

/**
 * Live value of ONE flat data key (with the verse-hold overlay), as a
 * primitive-returning selector. Hundreds of node components subscribe to
 * data — each must cost O(1) per store notify. The previous shape (every
 * node useShallow-comparing the whole ~850-key flat map) measured 12+
 * SECONDS of zustand shallow() per data update with three panel models in
 * the scene; a per-key string selector makes the same update milliseconds.
 */
function useDataKeyValue(key: string | undefined): string | undefined {
  const hold = useDocStore((s) => s.verseDataHold);
  return useDataStore((s) => {
    if (key === undefined) return undefined;
    if (hold) {
      if (key === "event.verseText") return hold.verseText;
      if (key === "event.verseRef") return hold.verseRef;
    }
    return buildDataValuesCached(s)[key];
  });
}

function useFormationSlotPosition(slot: number | undefined) {
  const formationKey = useDataStore((s) => s.squad.values.formation);
  return useMemo(() => {
    if (!slot) return null;
    const formation = resolveFormation(formationKey);
    return formationSlotWorldPosition(slot - 1, formation);
  }, [formationKey, slot]);
}

function textBindingOf(node: Text3dNode) {
  return node.bindings?.find((b) => b.targetPath === "text") ?? node.bindings?.[0];
}

/** Live resolved text for a text3d node — one per-key subscription. */
function useResolvedNodeText(node: Text3dNode): string {
  const binding = textBindingOf(node);
  const raw = useDataKeyValue(binding?.source);
  if (!binding) return node.text;
  // Shared formatter (named pipes + legacy {value}) — same function the
  // output bake uses, so editor and air can't format differently.
  const value = raw !== undefined && raw !== "" ? formatBindingValue(raw, binding.format) : binding.fallback;
  return value === undefined ? node.text : String(value);
}

/** How long a data-update reaction (score flash / stat pulse) runs. */
const UPDATE_ANIM_MS = 700;

function Text3dView({ node }: { node: Text3dNode }) {
  const motionRef = useArMotionRef();
  const resolvedText = useResolvedNodeText(node);
  const [displayText, setDisplayText] = useState(resolvedText);
  useFrame(() => {
    const next = motionRef.current.textDisplay ?? resolvedText;
    if (next !== displayText) setDisplayText(next);
  });
  useEffect(() => {
    setDisplayText(motionRef.current.textDisplay ?? resolvedText);
  }, [resolvedText, motionRef]);
  const { texture, aspect } = useMemo(() => makeTextTexture(displayText, node.color), [displayText, node.color]);
  useEffect(() => () => texture.dispose(), [texture]);
  const height = node.fontSize;
  const meshRef = useRef<THREE.Mesh>(null);
  const baseOpacity = node.opacity ?? 1;
  // Data-update reaction (score flash / stat pulse): fires ONLY when the
  // resolved display value actually changes — re-received identical data
  // never re-animates. Works identically in the editor (live bindings) and
  // Program/Preview (baked node.text changes), since both flow through
  // `resolvedText`.
  const updateAnim = node.updateAnim ?? "none";
  const pulseUntil = useRef(0);
  const prevValue = useRef(resolvedText);
  useEffect(() => {
    if (prevValue.current !== resolvedText) {
      prevValue.current = resolvedText;
      if (updateAnim !== "none") pulseUntil.current = performance.now() + UPDATE_ANIM_MS;
    }
  }, [resolvedText, updateAnim]);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    let pulseOpacity = 1;
    let pulseScale = 1;
    const remaining = pulseUntil.current - performance.now();
    if (remaining > 0) {
      const t = 1 - remaining / UPDATE_ANIM_MS; // 0 → 1 over the reaction
      const wave = Math.sin(Math.PI * t); // rise and settle
      if (updateAnim === "pulse") pulseScale = 1 + 0.16 * wave;
      else if (updateAnim === "flash") {
        pulseScale = 1 + 0.24 * wave;
        pulseOpacity = 0.65 + 0.35 * Math.abs(Math.cos(Math.PI * 2 * t)); // two quick blinks
      } else if (updateAnim === "fade") pulseOpacity = Math.abs(1 - 2 * t); // fade out, replace, fade in
    }
    if (Math.abs(mesh.scale.x - pulseScale) > 0.0005) mesh.scale.setScalar(pulseScale);
    const o = baseOpacity * motionRef.current.opacity * pulseOpacity;
    if (Math.abs(mat.opacity - o) > 0.001) {
      mat.opacity = o;
      mat.transparent = o < 0.999;
      mat.needsUpdate = true;
    }
  });
  return (
    <mesh ref={meshRef} key={displayText}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={baseOpacity}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------

function isImageSlotNode(node: PrimitiveNode): boolean {
  return (
    node.shape === "plane" &&
    (node.slotKind === "branding" ||
      node.slotKind === "data" ||
      !!node.textureAssetId ||
      !!node.bindings?.some((b) => b.targetPath === "textureUrl" || b.targetPath === "textureAssetId"))
  );
}

function backingColorForSlot(materialColor: string | undefined): string {
  if (!materialColor || materialColor === "#ffffff") return "#2a3548";
  return materialColor;
}

function textureUrlBindingOf(node: PrimitiveNode) {
  return node.bindings?.find((b) => b.targetPath === "textureUrl") ?? node.bindings?.find((b) => b.targetPath === "textureAssetId");
}

/** Live bound texture URL for a primitive — one per-key subscription. */
function useBoundTextureUrl(node: PrimitiveNode): string | null {
  const binding = textureUrlBindingOf(node);
  const raw = useDataKeyValue(binding?.source);
  if (!binding) return null;
  const value = raw !== undefined ? (binding.format ? binding.format.replace("{value}", raw) : raw) : binding.fallback;
  const url = value === undefined ? "" : String(value).trim();
  return url.length > 0 ? url : null;
}

function wantsPhysical(m: MaterialProps): boolean {
  return !!m.usePhysical || (m.clearcoat ?? 0) > 0 || (m.transmission ?? 0) > 0;
}

function SharedMaterialFields({
  m,
  side,
  map,
  normalMap,
  ormMap,
}: {
  m: MaterialProps;
  side: THREE.Side;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  ormMap?: THREE.Texture | null;
}) {
  const shared = {
    color: m.color,
    metalness: m.metalness,
    roughness: m.roughness,
    emissive: m.emissive ?? "#000000",
    emissiveIntensity: m.emissiveIntensity ?? 0,
    transparent: m.opacity !== undefined && m.opacity < 1,
    opacity: m.opacity ?? 1,
    envMapIntensity: m.envMapIntensity ?? 1,
    map: map ?? undefined,
    normalMap: normalMap ?? undefined,
    aoMap: ormMap ?? undefined,
    roughnessMap: ormMap ?? undefined,
    metalnessMap: ormMap ?? undefined,
    side,
  };
  if (wantsPhysical(m)) {
    return (
      <meshPhysicalMaterial
        {...shared}
        clearcoat={m.clearcoat ?? 0}
        clearcoatRoughness={m.clearcoatRoughness ?? 0.25}
        transmission={m.transmission ?? 0}
        thickness={m.thickness ?? 0}
        ior={m.ior ?? 1.5}
      />
    );
  }
  return <meshStandardMaterial {...shared} />;
}

/** Mapped materials need useLoader → must sit under Suspense. */
function MappedPrimitiveMaterial({ m, assets, side }: { m: MaterialProps; assets: Asset[]; side: THREE.Side }) {
  const mapAsset = m.mapAssetId ? assets.find((a) => a.id === m.mapAssetId && a.kind === "image") : undefined;
  const normalAsset = m.normalMapAssetId ? assets.find((a) => a.id === m.normalMapAssetId && a.kind === "image") : undefined;
  const ormAsset = m.ormMapAssetId ? assets.find((a) => a.id === m.ormMapAssetId && a.kind === "image") : undefined;
  const map = useLoader(THREE.TextureLoader, mapAsset?.src ?? EMPTY_TEXTURE_DATA_URL);
  const normalMap = useLoader(THREE.TextureLoader, normalAsset?.src ?? EMPTY_TEXTURE_DATA_URL);
  const ormMap = useLoader(THREE.TextureLoader, ormAsset?.src ?? EMPTY_TEXTURE_DATA_URL);
  useEffect(() => {
    if (mapAsset) map.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [map, normalMap, ormMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(m.textureScale?.x ?? 1, m.textureScale?.y ?? 1);
      texture.offset.set(m.textureOffset?.x ?? 0, m.textureOffset?.y ?? 0);
      texture.rotation = m.textureRotation ?? 0;
      texture.center.set(0.5, 0.5);
      texture.needsUpdate = true;
    }
  }, [map, normalMap, ormMap, mapAsset, m.textureScale, m.textureOffset, m.textureRotation]);
  return (
    <SharedMaterialFields
      m={m}
      side={side}
      map={mapAsset ? map : null}
      normalMap={normalAsset ? normalMap : null}
      ormMap={ormAsset ? ormMap : null}
    />
  );
}

const EMPTY_TEXTURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Thin planar reflector on the top face of a box primitive (desk hero). */
function DeskReflectorSurface({ node }: { node: PrimitiveNode }) {
  const m = node.material;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5 + 0.01, 0]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <MeshReflectorMaterial
        color={m.color}
        metalness={m.metalness}
        roughness={m.roughness}
        resolution={1024}
        mixStrength={0.4}
        mirror={0.25}
        reflectorOffset={0.01}
        blur={[0, 0]}
        mixBlur={0}
      />
    </mesh>
  );
}

function PrimitiveView({
  node,
  assets,
  render,
}: {
  node: PrimitiveNode;
  assets: Asset[];
  render?: SetRenderSettings;
}) {
  const boundTextureUrl = useBoundTextureUrl(node);
  const prismGeometry = usePrismGeometry(node);
  const m = node.material;
  const textureAsset = node.textureAssetId ? assets.find((asset) => asset.id === node.textureAssetId && asset.kind === "image") : undefined;
  const slotAspect = node.transform.scale.x / Math.max(node.transform.scale.y, 0.001);
  const canUseOptimized =
    !!textureAsset?.optimizedSrc &&
    !!textureAsset.optimizedMaxEdge &&
    textureAsset.optimizedMaxEdge >= resolveTextureEdgeBudget(render?.qualityTier ?? "low");
  const imageSrc = boundTextureUrl ?? (canUseOptimized ? textureAsset?.optimizedSrc : textureAsset?.src);
  const hintAspect =
    textureAsset?.imageWidth && textureAsset?.imageHeight
      ? textureAsset.imageWidth / textureAsset.imageHeight
      : undefined;
  const [urlAspect, setUrlAspect] = useState<number | undefined>();
  useEffect(() => {
    if (hintAspect || !boundTextureUrl) {
      setUrlAspect(undefined);
      return;
    }
    let cancelled = false;
    void probeImageAspect(boundTextureUrl).then((aspect) => {
      if (!cancelled && aspect) setUrlAspect(aspect);
    });
    return () => {
      cancelled = true;
    };
  }, [boundTextureUrl, hintAspect]);
  const resolvedAspect = hintAspect ?? urlAspect;
  const imageSlot = isImageSlotNode(node);
  const isImagePlane = imageSlot && !!imageSrc && !m.mapAssetId;
  const side = node.shape === "plane" ? THREE.DoubleSide : THREE.FrontSide;
  const hasMaps = !!(m.mapAssetId || m.normalMapAssetId || m.ormMapAssetId);
  const deskReflector =
    render &&
    shouldUseDeskReflector(render, node) &&
    (node.shape === "box" || node.shape === "roundedBox");
  const baseOpacity = m.opacity ?? node.opacity ?? 1;

  if (imageSlot && !imageSrc && !m.mapAssetId) {
    return <ImageSlotPlaceholder backingColor={backingColorForSlot(m.color)} />;
  }

  if (isImagePlane) {
    return (
      <ArImagePlaneView
        src={imageSrc}
        slotAspect={slotAspect}
        opacity={baseOpacity}
        backingColor={backingColorForSlot(m.color)}
        hintAspect={resolvedAspect}
        display={node.display}
      />
    );
  }

  const isArDisplayPanel =
    node.role === "ar" &&
    !hasMaps &&
    !deskReflector &&
    (node.shape === "box" || node.shape === "plane" || node.shape === "sphere" || node.shape === "cylinder" || node.shape === "prism") &&
    // Prisms with PBR intent (metal frames, clearcoat trims) keep the real
    // lit material path — the unlit AR panel shortcut is for flat cards.
    !(node.shape === "prism" && (m.metalness > 0.25 || wantsPhysical(m)));
  if (isArDisplayPanel) {
    return <ArPanelView node={node} />;
  }

  const material = hasMaps ? (
      <Suspense fallback={<SharedMaterialFields m={m} side={side} />}>
        <MappedPrimitiveMaterial m={m} assets={assets} side={side} />
      </Suspense>
    ) : (
      <SharedMaterialFields m={m} side={side} />
    );
  switch (node.shape) {
    case "box":
      return (
        <>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            {material}
          </mesh>
          {deskReflector && <DeskReflectorSurface node={node} />}
        </>
      );
    case "roundedBox":
      return (
        <>
          <RoundedBox
            args={[1, 1, 1]}
            radius={Math.min(Math.max(node.cornerRadius ?? 0.04, 0.005), 0.25)}
            smoothness={render?.qualityTier === "high" ? 5 : render?.qualityTier === "medium" ? 3 : 1}
            castShadow
            receiveShadow
          >
            {material}
          </RoundedBox>
          {deskReflector && <DeskReflectorSurface node={node} />}
        </>
      );
    case "sphere":
      return (
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.5, 32, 16]} />
          {material}
        </mesh>
      );
    case "cylinder":
      return (
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          {material}
        </mesh>
      );
    case "plane":
      return (
        <mesh receiveShadow>
          <planeGeometry args={[1, 1]} />
          {material}
        </mesh>
      );
    case "prism":
      // Real extruded silhouette (chamfered frame / arch / shield). A prism
      // without a usable outline renders the honest magenta failure box.
      if (!prismGeometry) {
        return (
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#ff00ff" wireframe />
          </mesh>
        );
      }
      return (
        <mesh castShadow receiveShadow geometry={prismGeometry}>
          {material}
        </mesh>
      );
  }
}

// ---------------------------------------------------------------------------

function LightView({ node, interactive }: { node: LightNode; interactive: boolean }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  const angleRad = (node.angle ?? 35) * DEG2RAD;

  return (
    <>
      {node.lightType === "spot" && (
        <>
          <spotLight
            color={node.color}
            intensity={node.intensity}
            angle={angleRad}
            penumbra={node.penumbra ?? 0.5}
            distance={node.distance ?? 0}
            castShadow={node.castShadow}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            target={target}
          />
          <primitive object={target} position={[0, 0, LIGHT_AIM_DISTANCE]} />
        </>
      )}
      {node.lightType === "point" && (
        <pointLight color={node.color} intensity={node.intensity} distance={node.distance ?? 0} castShadow={node.castShadow} />
      )}
      {node.lightType === "directional" && (
        <>
          <directionalLight color={node.color} intensity={node.intensity} castShadow={node.castShadow} target={target} />
          <primitive object={target} position={[0, 0, LIGHT_AIM_DISTANCE]} />
        </>
      )}
      {/* Editor-only fixture: the pickable body of an otherwise geometry-less
          node, plus an aim cone for directable lights. Not rendered on air. */}
      {interactive && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 0.2, 16]} />
            <meshStandardMaterial color="#222233" emissive={node.color} emissiveIntensity={0.6} />
          </mesh>
          {node.lightType !== "point" && (
            <mesh position={[0, 0, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.12, 0.5, 12, 1, true]} />
              <meshBasicMaterial color={node.color} wireframe transparent opacity={0.4} />
            </mesh>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function CameraNodeView({ node, ctx }: { node: CameraNode; ctx: SetNodeContext }) {
  const isProgramCamera = !ctx.interactive && ctx.activeCameraId === node.id;
  return (
    <>
      {/* Nested inside the transform group, so world placement is correct
          even for cameras inside groups. */}
      <PerspectiveCamera
        name={camNodeObjectName(node.id)}
        makeDefault={isProgramCamera}
        fov={node.fov}
        near={0.1}
        far={200}
      />
      {ctx.interactive && (
        <>
          <mesh>
            <boxGeometry args={[0.32, 0.24, 0.5]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Lens cone points down -Z: the direction this camera shoots. */}
          <mesh position={[0, 0, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.14, 0.3, 16, 1, true]} />
            <meshBasicMaterial color="#4a90d9" wireframe transparent opacity={0.7} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={ctx.activeCameraId === node.id ? "#cc2222" : "#333344"} />
          </mesh>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

/** Bezel behind the picture surface — reads as a monitor/LED wall. Shared by
 * every videofeed variant (live capture and confidence monitors alike). */
function MonitorBezel({ w, h }: { w: number; h: number }) {
  return (
    <mesh position={[0, 0, -0.03]} castShadow>
      <boxGeometry args={[w + 0.08, h + 0.08, 0.05]} />
      <meshStandardMaterial color="#111122" metalness={0.5} roughness={0.4} />
    </mesh>
  );
}

/** A monitor with no signal, as it looks ON AIR: a plain dark screen — like
 * a real powered-off display in a studio. No labels, no diagnostics; those
 * belong to the editor only (see StandbyPanel). */
function DarkScreen({ w, h }: { w: number; h: number }) {
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#060612" emissive="#0a1a2e" emissiveIntensity={0.35} />
    </mesh>
  );
}

/** EDITOR-ONLY standby: dark panel + label (+ the real error/reason if one
 * applies). Never rendered on Program/Preview — on-air output must stay
 * clean (an unassigned feed shows a dark screen, not a diagnostic overlay
 * blocking the set). Never fake program content either way. */
function StandbyPanel({ w, h, label, error }: { w: number; h: number; label: string; error: string | null }) {
  const standbyLabel = useMemo(() => {
    const text = error ? `${label} — ${error}` : label;
    return makeTextTexture(text, error ? "#cc4444" : "#4a90d9");
  }, [label, error]);
  useEffect(() => () => standbyLabel.texture.dispose(), [standbyLabel]);

  return (
    <>
      <DarkScreen w={w} h={h} />
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[Math.min(w * 0.8, h * 0.18 * standbyLabel.aspect), h * 0.18]} />
        <meshBasicMaterial map={standbyLabel.texture} transparent toneMapped={false} />
      </mesh>
    </>
  );
}

/** Standby in the editor (label + error), plain dark screen on air. */
function FeedFallback({ w, h, label, error, interactive }: { w: number; h: number; label: string; error: string | null; interactive: boolean }) {
  return interactive ? <StandbyPanel w={w} h={h} label={label} error={error} /> : <DarkScreen w={w} h={h} />;
}

/** Standard broadcast chroma keyer: distance in YCbCr chroma space between
 * each pixel and the key color; below `similarity` fully transparent, a
 * `smoothness`-wide soft edge above it. Runs on the GPU per fragment — the
 * same technique OBS's chroma key filter uses. */
const CHROMA_VERTEX = /* glsl */ `
  uniform mat3 uvTransform;
  varying vec2 vUv;
  void main() {
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CHROMA_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D maskMap;
  uniform float useMask;
  uniform vec3 keyColor;
  uniform float similarity;
  uniform float smoothness;
  uniform float spill;
  varying vec2 vUv;
  vec2 rgb2cc(vec3 c) {
    float y = dot(c, vec3(0.299, 0.587, 0.114));
    return vec2((c.b - y) * 0.565, (c.r - y) * 0.713);
  }
  float smoothstep01(float e0, float e1, float x) {
    float t = clamp((x - e0) / max(e1 - e0, 0.0001), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  void main() {
    vec4 c = texture2D(map, vUv);
    vec3 rgb = c.rgb;
    float d = distance(rgb2cc(rgb), rgb2cc(keyColor));
    float a;
    if (useMask > 0.5) {
      // AI person matte (MediaPipe) — the mask IS the alpha; no key color.
      // The color-key sliders double as matte controls here (labeled so in
      // the Inspector): similarity = CHOKE (threshold center — tighter cuts
      // background halo, looser keeps hair), smoothness = FEATHER (edge
      // width). Defaults (0.32/0.08) land at center 0.5, feather 0.12.
      float m = texture2D(maskMap, vUv).r;
      float center = clamp(similarity + 0.18, 0.12, 0.88);
      float feather = clamp(smoothness + 0.04, 0.03, 0.45);
      a = smoothstep01(center - feather, center + feather, m);
    } else {
      a = smoothstep01(similarity, similarity + smoothness, d);
    }
    if (a < 0.004) discard;

    float nearKey = useMask > 0.5 ? 0.0 : 1.0 - smoothstep01(similarity, similarity + smoothness + 0.25, d);
    float s = spill * nearKey * (1.0 - a * 0.2);
    if (s > 0.001) {
      if (keyColor.g >= keyColor.r && keyColor.g >= keyColor.b) {
        rgb.g = mix(rgb.g, min(rgb.g, (rgb.r + rgb.b) * 0.5), s);
      } else if (keyColor.b >= keyColor.r && keyColor.b >= keyColor.g) {
        rgb.b = mix(rgb.b, min(rgb.b, (rgb.r + rgb.g) * 0.5), s);
      } else {
        rgb.r = mix(rgb.r, min(rgb.r, (rgb.g + rgb.b) * 0.5), s);
      }
    }

    // Matte-edge decontamination — crushed blacks on soft edges cause dirty halos.
    float edgeWeight = smoothstep01(0.02, 0.35, a) * (1.0 - smoothstep01(0.65, 0.98, a));
    if (edgeWeight > 0.001) {
      float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
      if (luma < 0.16) {
        float scale = min(0.08 / max(luma, 0.001), 2.5);
        rgb *= scale;
        a *= smoothstep01(0.0, 0.16, luma);
      }
      float inv = 1.0 / max(a, 0.08);
      rgb = min(vec3(1.0), rgb * inv * 0.3 + rgb * 0.7);
    }

    gl_FragColor = vec4(rgb, a);
  }
`;

/** The keyed video plane — a ShaderMaterial wired to the same VideoTexture.
 * Uniform OBJECTS are created once per texture; parameter changes mutate
 * uniform values (no material rebuild per slider tick). */
/** 1×1 white placeholder bound to `maskMap` while the AI matte is off or
 * still loading — samplers must never be null on ANGLE. */
const WHITE_MASK = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE_MASK.needsUpdate = true;

function ChromaKeyedPlane({ texture, w, h, chromaKey }: { texture: THREE.VideoTexture; w: number; h: number; chromaKey: NonNullable<VideoFeedNode["chromaKey"]> }) {
  // AI matte (mode "segment"): the segmenter runs on the SAME underlying
  // <video> element the VideoTexture wraps; null in color mode = zero cost.
  const video = texture.image instanceof HTMLVideoElement ? texture.image : null;
  const maskTexture = useSegmentationMask(chromaKey.mode === "segment" ? video : null);
  const uniforms = useMemo(
    () => {
      const key = new THREE.Color(chromaKey.color);
      key.convertSRGBToLinear();
      return {
        map: { value: texture },
        maskMap: { value: WHITE_MASK as THREE.Texture },
        useMask: { value: 0 },
        keyColor: { value: key },
        similarity: { value: chromaKey.similarity },
        smoothness: { value: chromaKey.smoothness },
        spill: { value: chromaKey.spill ?? 0.65 },
        uvTransform: { value: texture.matrix },
      };
    },
    // Rebuild only when the texture itself changes; params update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  );
  useEffect(() => {
    uniforms.keyColor.value.set(chromaKey.color);
    uniforms.keyColor.value.convertSRGBToLinear();
    uniforms.similarity.value = chromaKey.similarity;
    uniforms.smoothness.value = chromaKey.smoothness;
    uniforms.spill.value = chromaKey.spill ?? 0.65;
  }, [uniforms, chromaKey.color, chromaKey.similarity, chromaKey.smoothness, chromaKey.spill]);
  useEffect(() => {
    uniforms.maskMap.value = maskTexture ?? WHITE_MASK;
    uniforms.useMask.value = chromaKey.mode === "segment" && maskTexture ? 1 : 0;
  }, [uniforms, maskTexture, chromaKey.mode]);
  useEffect(() => {
    uniforms.uvTransform.value.copy(texture.matrix);
  }, [uniforms, texture, texture.matrix]);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <shaderMaterial
        vertexShader={CHROMA_VERTEX}
        fragmentShader={CHROMA_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Live capture (webcam/capture card), screen share, or a URL/clip source —
 * a real MediaStream/HTMLVideoElement behind a THREE.VideoTexture. */
function LiveVideoFeedView({ node, interactive, audible }: { node: VideoFeedNode; interactive: boolean; audible: boolean }) {
  const { video, error } = useVideoFeed(node.source);

  const texture = useMemo(() => {
    if (!video) return null;
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);
  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => {
    if (!texture) return;
    const sourceAspect =
      video && video.videoWidth > 0 && video.videoHeight > 0
        ? video.videoWidth / video.videoHeight
        : node.width / Math.max(node.height, 0.001);
    const legacyCrop = node.crop
      ? { x: node.crop.x, y: 0, w: node.crop.w, h: 1 }
      : undefined;
    applySurfaceDisplaySettings(
      texture,
      sourceAspect,
      node.width / Math.max(node.height, 0.001),
      node.display ?? { fit: "stretch", crop: legacyCrop },
    );
  }, [texture, video, node.width, node.height, node.crop, node.display]);

  // Real audio, gated on the window-level `audible` flag AND the node's own
  // mute — never both at once being silent-by-default surprises. Applied
  // directly to the shared underlying element (see videoFeeds.ts); if two
  // consumers of the SAME source disagree, last effect to run wins — an
  // accepted v1 simplification for a single physical/logical signal.
  useEffect(() => {
    if (!video) return;
    video.muted = !audible || (node.muted ?? false);
    video.volume = node.volume ?? 1;
  }, [video, audible, node.muted, node.volume]);

  const w = node.width;
  const h = node.height;
  const keyed = !!node.chromaKey?.enabled;
  return (
    <>
      {/* A keyed feed is a floating cutout (presenter in the studio) — a
          monitor bezel around it would give the illusion away. */}
      {!keyed && <MonitorBezel w={w} h={h} />}
      {texture ? (
        keyed ? (
          <ChromaKeyedPlane texture={texture} w={w} h={h} chromaKey={node.chromaKey!} />
        ) : (
          // toneMapped=false: the feed must show broadcast-accurate color,
          // not be re-graded by the scene's ACES pass.
          <mesh>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        )
      ) : (
        <FeedFallback w={w} h={h} label={node.label} error={error} interactive={interactive} />
      )}
    </>
  );
}

/**
 * Confidence monitor: the node's plane shows a live render-texture re-render
 * of whichever scene is currently on Program or Preview — the same
 * technique real vMix/OBS multiviews use, not a MediaStream. Recursion is
 * capped at one level (see SetNodeContext.confidenceDepth): a monitor
 * rendered for the very scene it's already inside of shows a standby for
 * its own nested copy rather than tunneling forever — a real camera pointed
 * at its own screen makes an infinite hall-of-mirrors; we bound it instead
 * of fighting it.
 */
function ConfidenceMonitorView({ node, ctx }: { node: VideoFeedNode; ctx: SetNodeContext }) {
  const w = node.width;
  const h = node.height;
  const depth = ctx.confidenceDepth ?? 0;
  const targetSceneId = node.source.type === "program" ? ctx.programSceneId : ctx.previewSceneId;
  const label = node.source.type === "program" ? `${node.label} (PGM)` : `${node.label} (PVW)`;

  const targetScene = targetSceneId ? ctx.project?.scenes.find((s) => s.id === targetSceneId) : undefined;
  const targetLayer = targetScene?.layers.find((l) => l.visible && l.props.kind === "set3d");

  if (depth >= 1) {
    return (
      <>
        <MonitorBezel w={w} h={h} />
        <FeedFallback w={w} h={h} label={label} error="nested confidence view (depth limit)" interactive={ctx.interactive} />
      </>
    );
  }
  if (!targetSceneId || !targetLayer || targetLayer.props.kind !== "set3d") {
    return (
      <>
        <MonitorBezel w={w} h={h} />
        <FeedFallback w={w} h={h} label={label} error="no active virtual set on this feed" interactive={ctx.interactive} />
      </>
    );
  }

  const nestedCtx: SetNodeContext = {
    ...ctx,
    interactive: false,
    // Force-silent regardless of the outer ctx: this recursively mounts the
    // REAL target scene's nodes (not a flat image) — if that scene contains
    // its own live videofeed with a mic, inheriting `audible` would produce
    // a second, independent audio element playing alongside Program's own
    // real audio for the same source. A confidence monitor is a picture of
    // what's on air, never a second on-air audio path.
    audible: false,
    activeCameraId: targetLayer.props.activeCameraId,
    confidenceDepth: depth + 1,
  };
  const bg = targetLayer.props.environment.background;

  return (
    <>
      <MonitorBezel w={w} h={h} />
      <mesh>
        <planeGeometry args={[w, h]} />
        {/* toneMapped=false: a confidence monitor shows the on-air grade
            as-is, not re-graded a second time by this scene's own ACES pass. */}
        <meshBasicMaterial toneMapped={false}>
          <RenderTexture attach="map" width={512} height={288}>
            <color attach="background" args={[bg === "transparent" ? "#000000" : bg]} />
            <ambientLight
              color={targetLayer.props.environment.ambient.color}
              intensity={targetLayer.props.environment.ambient.intensity}
            />
            <SetNodesView nodes={targetLayer.props.nodes} ctx={nestedCtx} />
          </RenderTexture>
        </meshBasicMaterial>
      </mesh>
    </>
  );
}

function VideoFeedView({ node, ctx }: { node: VideoFeedNode; ctx: SetNodeContext }) {
  if (node.source.type === "program" || node.source.type === "preview") {
    return <ConfidenceMonitorView node={node} ctx={ctx} />;
  }
  return <LiveVideoFeedView node={node} interactive={ctx.interactive} audible={ctx.audible ?? false} />;
}

// ---------------------------------------------------------------------------

function GltfModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  // useLoader caches per URL — clone so multiple nodes of one asset get
  // independent transforms. Force cast/receive so key shadows hit imported desks.
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return cloned;
  }, [gltf]);
  return <primitive object={scene} />;
}

function FbxModel({ url }: { url: string }) {
  const object = useLoader(FBXLoader, url);
  const scene = useMemo(() => {
    const cloned = object.clone(true);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return cloned;
  }, [object]);
  return <primitive object={scene} />;
}

function ObjModel({ url }: { url: string }) {
  const object = useLoader(OBJLoader, url);
  const scene = useMemo(() => {
    const cloned = object.clone(true);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return cloned;
  }, [object]);
  return <primitive object={scene} />;
}

/** Magenta wireframe = the industry "missing/broken asset" signal — shown
 * when a model URL 404s or fails to parse, instead of silently nothing. */
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("model failed to load", error);
  }
  render() {
    if (this.state.failed) {
      return (
        <mesh>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshBasicMaterial color="#ff00ff" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
}

function ModelView({ node, assets }: { node: ModelNode; assets: Asset[] }) {
  const asset = assets.find((a) => a.id === node.assetId);
  if (!asset || asset.kind !== "model") {
    return (
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#ff00ff" wireframe />
      </mesh>
    );
  }
  return (
    <ModelErrorBoundary>
      <Suspense fallback={null}>
        {asset.format === "fbx" ? (
          <FbxModel url={asset.src} />
        ) : asset.format === "obj" ? (
          <ObjModel url={asset.src} />
        ) : (
          <GltfModel url={asset.src} />
        )}
      </Suspense>
    </ModelErrorBoundary>
  );
}

// ---------------------------------------------------------------------------

const SET_NODE_RENDERERS = {
  primitive: ({ node, ctx }) => <PrimitiveView node={node} assets={ctx.assets} render={ctx.render} />,
  text3d: ({ node }) => <Text3dView node={node} />,
  light: ({ node, ctx }) => <LightView node={node} interactive={ctx.interactive} />,
  camera: ({ node, ctx }) => <CameraNodeView node={node} ctx={ctx} />,
  videofeed: ({ node, ctx }) => <VideoFeedView node={node} ctx={ctx} />,
  model: ({ node, ctx }) => <ModelView node={node} assets={ctx.assets} />,
  group: ({ node, ctx }) => (
    <>
      {node.children.map((child) => (
        <SetNodeView key={child.id} node={child} ctx={ctx} />
      ))}
    </>
  ),
} satisfies SetNodeRendererRegistry<SetNodeContext>;

function NodeContent({ node, ctx }: { node: SetNode; ctx: SetNodeContext }) {
  return renderSetNode(SET_NODE_RENDERERS, node, ctx);
}

// ArNodeAnimator uses arMotionEngine for easing — no local parseEase needed here.

/**
 * AR animation runtime — drives per-node choreography from the shared
 * layerPlayback timestamp contract. Uses arMotionEngine for preset semantics
 * (real fades, wipes, count-up, ticker crawl, loop pulse).
 */
function ArNodeAnimator({ node, playback, arHidden, children }: { node: SetNode; playback: { phase: "in" | "out"; startedAt: number } | null | undefined; arHidden?: Set<string>; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const motionRef = useRef({ opacity: 1, textDisplay: undefined as string | undefined });
  const focusRef = useRef(1);
  const animBinding = node.kind === "text3d" ? textBindingOf(node) : undefined;
  const animRaw = useDataKeyValue(animBinding?.source);
  const resolvedText =
    node.kind === "text3d"
      ? !animBinding
        ? node.text
        : String(
            animRaw !== undefined && animRaw !== ""
              ? formatBindingValue(animRaw, animBinding.format)
              : (animBinding.fallback ?? node.text),
          )
      : undefined;
  const anim = node.animation;
  const animActive = !!anim && anim.preset !== "none" && node.role === "ar" && playback !== undefined;
  const focusActive = node.role === "ar" && arHidden !== undefined;
  const active = animActive || focusActive;

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g || !active) return;

    const focusTarget = focusActive && arHidden!.has(node.id) ? 0 : 1;
    focusRef.current += (focusTarget - focusRef.current) * Math.min(1, delta * 7);
    if (Math.abs(focusTarget - focusRef.current) < 0.005) focusRef.current = focusTarget;
    const focus = focusRef.current;

    if (!animActive || !playback || !anim) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.setScalar(Math.max(focus, 0.001));
      g.visible = focus > 0.02;
      motionRef.current.opacity = focus;
      motionRef.current.textDisplay = undefined;
      return;
    }

    const elapsed = (Date.now() - playback.startedAt) / 1000;
    const motion = computeArMotion(node, anim, playback.phase, elapsed, resolvedText);
    g.visible = motion.visible && focus > 0.02;
    g.position.set(motion.position.x, motion.position.y, motion.position.z);
    g.rotation.set(motion.rotation.x, motion.rotation.y, motion.rotation.z);
    g.scale.set(motion.scale.x * focus, motion.scale.y * focus, motion.scale.z * focus);
    motionRef.current.opacity = motion.opacity * focus;
    motionRef.current.textDisplay = motion.textDisplay;
  });

  if (!active) return <>{children}</>;
  return (
    <ArMotionContext.Provider value={motionRef}>
      <group ref={ref}>{children}</group>
    </ArMotionContext.Provider>
  );
}

/** Data-driven visibility, subscribed as a single boolean so a node with a
 * rule re-renders only when the rule's OUTCOME flips, not on every tick.
 * Nodes WITHOUT a rule (almost all of them) get a constant selector — zero
 * work per store notify across hundreds of node components. */
const ALWAYS_VISIBLE = () => true;
function useVisibilityRuleOk(node: SetNode): boolean {
  const rule = node.visibilityRule;
  return useDataStore(rule ? (s) => evaluateVisibilityRule(rule, buildDataValuesCached(s)) : ALWAYS_VISIBLE);
}

/** Live AR placement behaviours — real per-frame pose logic, not metadata:
 * cameraFacing billboards toward the render camera, presenter/player
 * anchoring follows another node's live world position, screenSpace rides
 * the camera at a fixed distance. World/floor/free modes are the plain
 * authored transform and cost nothing here. */
function useArPlacement(node: SetNode, groupRef: React.RefObject<THREE.Group | null>) {
  const placement = node.arPlacement;
  const active =
    !!placement &&
    (placement.mode === "cameraFacing" ||
      placement.mode === "screenSpace" ||
      ((placement.mode === "presenterAnchored" || placement.mode === "playerAnchored") && !!placement.anchorNodeId));
  const tmpTarget = useRef(new THREE.Vector3());
  useFrame(({ camera, scene }) => {
    const g = groupRef.current;
    if (!g || !active || !placement) return;
    if (placement.mode === "cameraFacing") {
      const strength = Math.min(Math.max(placement.cameraFacingStrength ?? 1, 0), 1);
      const target = tmpTarget.current.copy(camera.position);
      target.y = g.getWorldPosition(new THREE.Vector3()).y; // yaw only — panels stay upright
      const parentPos = g.getWorldPosition(new THREE.Vector3());
      const desired = Math.atan2(target.x - parentPos.x, target.z - parentPos.z);
      const authored = (node.transform.rotation.y * Math.PI) / 180;
      g.rotation.y = authored + (desired - authored) * strength;
      return;
    }
    if (placement.mode === "screenSpace") {
      const dist = placement.screenDistance ?? 2.5;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const pos = tmpTarget.current.copy(camera.position).addScaledVector(fwd, dist);
      const off = placement.anchorOffset;
      if (off) pos.add(new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(camera.quaternion));
      if (g.parent) g.position.copy(g.parent.worldToLocal(pos.clone()));
      g.quaternion.copy(camera.quaternion);
      return;
    }
    // presenter / player anchoring — follow the anchor node's LIVE pose.
    const anchor = scene.getObjectByName(setNodeObjectName(placement.anchorNodeId!));
    if (!anchor) return;
    const pos = anchor.getWorldPosition(tmpTarget.current);
    const off = placement.anchorOffset;
    if (off) pos.add(new THREE.Vector3(off.x, off.y, off.z));
    if (g.parent) g.position.copy(g.parent.worldToLocal(pos.clone()));
  });
  return active;
}

export function SetNodeView({ node, ctx }: { node: SetNode; ctx: SetNodeContext }) {
  const pickable = ctx.interactive && !node.locked && !!ctx.onPick && (ctx.isPickable?.(node) ?? true);
  const formationPos = useFormationSlotPosition(node.formationSlot);
  const ruleOk = useVisibilityRuleOk(node);
  const placementRef = useRef<THREE.Group>(null);
  useArPlacement(node, placementRef);
  const px = formationPos?.x ?? node.transform.position.x;
  const pz = formationPos?.z ?? node.transform.position.z;
  return (
    <group
      // Named so the camera move/orbit rigs (Set3dRenderer) can read this
      // node's LIVE world pose off the scene graph — exact even in groups.
      name={setNodeObjectName(node.id)}
      position={[px, node.transform.position.y, pz]}
      rotation={eulerFromNode(node)}
      scale={[node.transform.scale.x, node.transform.scale.y, node.transform.scale.z]}
      visible={node.visible && ruleOk}
      ref={(obj: THREE.Group | null) => {
        placementRef.current = obj;
        ctx.registerObject?.(node.id, obj);
      }}
      onClick={
        pickable
          ? (e) => {
              e.stopPropagation();
              ctx.onPick!(node.id, e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey);
            }
          : undefined
      }
    >
      <ArNodeAnimator node={node} playback={ctx.playback} arHidden={ctx.arHidden}>
        <NodeContent node={node} ctx={ctx} />
      </ArNodeAnimator>
    </group>
  );
}

/** Renders a whole node list — the single entry point both consumers use. */
export function SetNodesView({ nodes, ctx }: { nodes: SetNode[]; ctx: SetNodeContext }) {
  return (
    <>
      {nodes.map((node) => (
        <SetNodeView key={node.id} node={node} ctx={ctx} />
      ))}
    </>
  );
}

/**
 * AR backplate: paints a live video feed as `scene.background` so the 3D
 * graphics render over a real camera feed through the program camera,
 * instead of the studio backdrop color. Uses `scene.background` (not a
 * camera-facing plane) because it always fills the view regardless of the
 * active camera's position/FOV — the same reason real AR compositors key
 * behind rather than in front. Restores whatever background was there
 * before (or clears it) on cleanup/source change so switching back to
 * Studio mode behaves exactly like the plain `<color attach="background">`
 * path in SetEnvironmentView.
 */
function ArBackplateView({ source }: { source: VideoSource }) {
  const scene = useThree((s) => s.scene);
  const { video } = useVideoFeed(source);

  const texture = useMemo(() => {
    if (!video) return null;
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);
  useEffect(() => () => texture?.dispose(), [texture]);

  useEffect(() => {
    if (!texture) return;
    const previous = scene.background;
    scene.background = texture;
    return () => {
      scene.background = previous;
    };
  }, [scene, texture]);

  return null;
}

/** The layer-wide studio shell (background, floor, grid, ambient, fog,
 * contact shadows, offline env lighting, AR backplate) — pure like the
 * nodes, shared by editor and renderer. `background: "transparent"`
 * attaches no color so the set can key over other layers. `render` is
 * optional only so any stray caller with just an environment (none exist
 * in this codebase) keeps compiling — both real consumers always pass it. */
function isHdrEnvironmentFile(src: string): boolean {
  const clean = src.split("?")[0].toLowerCase();
  return clean.endsWith(".hdr") || clean.endsWith(".exr");
}

/** Equirect LDR (png/jpg/webp) environment. drei's `<Environment files>`
 * only recognizes .hdr/.exr — feeding it a PNG throws "Unrecognized file
 * extension" mid-render and, with no boundary above the Canvas, unmounted
 * the ENTIRE app to black (hit live 2026-07-08 when an AI-generated PNG was
 * assigned as the env cubemap and persisted into the project). LDR images
 * load through TextureLoader as an equirect reflection map instead. */
function LdrEnvironment({ src, resolution, intensity }: { src: string; resolution: number; intensity: number }) {
  const raw = useLoader(THREE.TextureLoader, src);
  const texture = useMemo(() => {
    raw.mapping = THREE.EquirectangularReflectionMapping;
    raw.colorSpace = THREE.SRGBColorSpace;
    return raw;
  }, [raw]);
  return <Environment map={texture} resolution={resolution} environmentIntensity={intensity} />;
}

/** A bad environment file (unsupported format, 404, corrupt) must degrade to
 * "no env lighting", never take the whole Canvas — and with it the app —
 * down. */
class EnvErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("environment map failed to load — rendering without env lighting", err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Floor texture loader — manual (never suspends the environment; a slow
 * image must not blank the whole set). Repeat-wrapped and tiled so a small
 * material photo (concrete/wood/vinyl) reads as a real studio floor. */
function useFloorTexture(src: string | null, tiles: number): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!src) {
      setTexture(null);
      return;
    }
    let disposed = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      src,
      (t) => {
        if (disposed) {
          t.dispose();
          return;
        }
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        setTexture(t);
      },
      undefined,
      () => {
        // Broken/missing image: fall back to plain color, log honestly.
        console.error("floor texture failed to load:", src);
        if (!disposed) setTexture(null);
      },
    );
    return () => {
      disposed = true;
      setTexture((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, [src]);
  useEffect(() => {
    if (texture) {
      texture.repeat.set(tiles, tiles);
      texture.needsUpdate = true;
    }
  }, [texture, tiles]);
  return texture;
}

export function SetEnvironmentView({
  environment,
  render,
  assets = [],
}: {
  environment: SetEnvironment;
  render?: SetRenderSettings;
  assets?: Asset[];
}) {
  const floorAsset = environment.floor.textureAssetId
    ? assets.find((a) => a.id === environment.floor.textureAssetId && a.kind === "image")
    : undefined;
  const floorTexture = useFloorTexture(floorAsset?.src ?? null, environment.floor.textureTiles ?? 6);
  const hasBackplate = environment.backplate && environment.backplate.type !== "none";
  const envLight = render?.envLight;
  const envResolution = render ? resolveEnvResolution(render) : 64;
  const useReflector = !!(render && shouldUseFloorReflector(render, environment.floor));
  const reflector = environment.floor.reflector;
  const reflectorRes = Math.min(Math.max(reflector?.resolution ?? (render?.qualityTier === "high" ? 1024 : 512), 256), 2048);
  const cubemapAsset = render?.envCubemapAssetId
    ? assets.find((a) => a.id === render.envCubemapAssetId && a.kind === "image")
    : undefined;
  const useCubemap = !!cubemapAsset;

  return (
    <>
      {hasBackplate && <ArBackplateView source={environment.backplate!} />}
      {/* The flat background color must NOT render while an AR backplate is
          active — scene.background is exactly one thing at a time. */}
      {!hasBackplate && environment.background !== "transparent" && (
        <color attach="background" args={[environment.background]} />
      )}
      {environment.fog && (
        <fog attach="fog" args={[environment.fog.color, environment.fog.near, environment.fog.far]} />
      )}
      <ambientLight color={environment.ambient.color} intensity={environment.ambient.intensity} />
      {environment.floor.enabled && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[environment.floor.size, environment.floor.size]} />
          {useReflector ? (
            <MeshReflectorMaterial
              color={environment.floor.color}
              map={floorTexture ?? undefined}
              metalness={environment.floor.metalness}
              roughness={environment.floor.roughness}
              resolution={reflectorRes}
              mixStrength={reflector?.mixStrength ?? 0.4}
              mirror={reflector?.mirror ?? 0.22}
              // Slight offset avoids z-fighting with ContactShadows / Grid.
              reflectorOffset={0.02}
              // NO blur: the blurred path samples a depth buffer that isn't
              // attached, which on Windows/ANGLE floods the console with
              // "GL_INVALID_OPERATION ... texture format and sampler type"
              // EVERY FRAME (observed live 2026-07-08). A sharp mirror at
              // reduced mirror strength reads correctly on a studio floor
              // and costs strictly less GPU.
              blur={[0, 0]}
              mixBlur={0}
            />
          ) : (
            <meshStandardMaterial
              color={environment.floor.color}
              map={floorTexture ?? undefined}
              metalness={environment.floor.metalness}
              roughness={environment.floor.roughness}
            />
          )}
        </mesh>
      )}
      {environment.grid && !useReflector && (
        <Grid
          position={[0, 0.01, 0]}
          args={[environment.floor.size, environment.floor.size]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#333355"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#444466"
          fadeDistance={20}
          fadeStrength={1}
          infiniteGrid
        />
      )}
      {/* Cheap fake contact shadow under the set — a render-to-texture blob,
          not a real shadow map (see SetRenderSettings.contactShadows). */}
      {render?.contactShadows?.enabled && (
        <ContactShadows
          position={[0, 0.015, 0]}
          scale={Math.max(environment.floor.size, 4)}
          far={8}
          opacity={render.contactShadows.opacity}
          blur={render.contactShadows.blur}
        />
      )}
      {/* Fully offline PBR environment lighting: operator cubemap when set,
          otherwise emissive Lightformer panels baked by <Environment> —
          never a preset/HDRI download (REALISM_PIPELINE.md). */}
      {useCubemap ? (
        <EnvErrorBoundary>
          <Suspense fallback={null}>
            {isHdrEnvironmentFile(cubemapAsset!.src) ? (
              <Environment
                files={cubemapAsset!.src}
                resolution={envResolution}
                environmentIntensity={envLight?.intensity ?? 0.35}
              />
            ) : (
              <LdrEnvironment
                src={cubemapAsset!.src}
                resolution={envResolution}
                intensity={envLight?.intensity ?? 0.35}
              />
            )}
          </Suspense>
        </EnvErrorBoundary>
      ) : (
        envLight?.enabled && (
          <Environment resolution={envResolution} environmentIntensity={envLight.intensity}>
            <Lightformer form="rect" color="#ffffff" intensity={2} position={[0, 5, 0]} scale={[8, 8, 1]} rotation={[Math.PI / 2, 0, 0]} />
            <Lightformer form="rect" color="#8fb8ff" intensity={1} position={[-5, 2, 0]} scale={[4, 6, 1]} rotation={[0, Math.PI / 2, 0]} />
            <Lightformer form="rect" color="#ffd9a0" intensity={1} position={[5, 2, 0]} scale={[4, 6, 1]} rotation={[0, -Math.PI / 2, 0]} />
          </Environment>
        )
      )}
    </>
  );
}
