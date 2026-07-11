import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom, N8AO, Vignette } from "@react-three/postprocessing";
import type { Asset, ID, Layer, Project, SetRenderSettings } from "@/document/types";
import { ssrAllowed, resolveDpr } from "@/document/qualityTiers";
import {
  camNodeObjectName,
  orbitPosition,
  quatFromPoseDeg,
  setNodeObjectName,
  DEG2RAD,
  type CameraMove,
  type CameraOrbit,
} from "@/document/cameraMoves";
import { computeArHiddenSet, type ArFocus } from "@/document/arFocus";
import { SetEnvironmentView, SetNodesView } from "./SetNodes";
import { SsrRealismEffect } from "./ssrEffect";

/**
 * Non-interactive consumer of the shared SetNodes mapping — the 3D
 * counterpart of DocumentRenderer's role for gfx2d. No picking, no gizmos,
 * no helpers; it renders strictly through the set's active virtual camera
 * (falling back to a default studio framing when none is authored) and
 * paints exactly what the document says. Used by Program/Preview through
 * DocumentRenderer.
 *
 * Camera motion (Phase 6): while a CameraMove/CameraOrbit entry exists for
 * this layer, a transient rig camera (mounted AFTER the node graph, so its
 * `makeDefault` wins and unmounting restores the node camera) flies the shot.
 * Both rigs reconstruct pose purely from the envelope's shared `startedAt`
 * timestamp plus the LIVE world pose of their target objects — the same
 * no-sync-protocol contract layerPlayback uses, so Program, Preview, and the
 * embedded monitors all show the identical flight.
 */

/** Canvas `gl` props aren't reactive after context creation — exposure and
 * tone mapping are applied through the R3F state instead. */
export function RenderSettingsApplier({ exposure, shadows }: { exposure: number; shadows: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl, exposure, shadows]);
  // drei MeshReflectorMaterial resets to deprecated PCFSoft each frame — keep PCF.
  useFrame(() => {
    if (gl.shadowMap.type !== THREE.PCFShadowMap) gl.shadowMap.type = THREE.PCFShadowMap;
  });
  return null;
}

/** Bloom/Vignette/AO/SSR only mount when actually enabled — the
 * EffectComposer itself costs a full-screen pass, which small machines
 * shouldn't pay for effects that are off. SSR uses realism-effects
 * (High+explicit only — REALISM_PIPELINE §3.4). */
export function SetPostEffects({ render }: { render: SetRenderSettings }) {
  const aoEnabled = !!render.ao?.enabled;
  const wantSsr = ssrAllowed(render);
  if (!render.bloom.enabled && !render.vignette.enabled && !aoEnabled && !wantSsr) {
    return null;
  }
  const effects = [];
  if (wantSsr) {
    effects.push(<SsrRealismEffect key="ssr" />);
  }
  if (aoEnabled) {
    // N8AO — the AO effect @react-three/postprocessing actually exports
    // (no SSAO+normalPass wiring needed). Screen-space, offline, one pass.
    effects.push(<N8AO key="ao" intensity={render.ao!.intensity} aoRadius={1} distanceFalloff={1} />);
  }
  if (render.bloom.enabled) {
    effects.push(
      <Bloom
        key="bloom"
        intensity={render.bloom.intensity}
        luminanceThreshold={render.bloom.threshold}
        mipmapBlur
      />,
    );
  }
  if (render.vignette.enabled) {
    effects.push(<Vignette key="vignette" darkness={render.vignette.darkness} />);
  }
  return <EffectComposer>{effects}</EffectComposer>;
}

function linearEase(t: number): number {
  return t;
}

function parseEaseSafe(name: string): (t: number) => number {
  try {
    return (gsap.parseEase(name) as (t: number) => number) ?? linearEase;
  } catch {
    return linearEase;
  }
}

/** Flies the view from `move.from` to the LIVE world pose of the destination
 * camera node over `durationSec`, then unmounts (drei restores the node
 * camera, which is already the committed `activeCameraId`). Reading the
 * destination live off the scene graph makes the landing exact even for
 * cameras nested inside transformed groups. */
function CameraMoveRig({ move }: { move: CameraMove }) {
  const scene = useThree((s) => s.scene);
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [done, setDone] = useState(false);
  const fromPos = useMemo(
    () => new THREE.Vector3(move.from.position.x, move.from.position.y, move.from.position.z),
    [move],
  );
  const fromQuat = useMemo(() => quatFromPoseDeg(move.from.rotation), [move]);
  const easeFn = useMemo(() => parseEaseSafe(move.ease), [move.ease]);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() }), []);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const elapsed = (Date.now() - move.startedAt) / 1000;
    const raw = move.durationSec <= 0 ? 1 : Math.min(1, elapsed / move.durationSec);
    const e = easeFn(raw);
    const target = scene.getObjectByName(camNodeObjectName(move.toCameraId)) as THREE.PerspectiveCamera | undefined;
    if (target) {
      target.getWorldPosition(tmp.p);
      target.getWorldQuaternion(tmp.q);
      cam.position.lerpVectors(fromPos, tmp.p, e);
      cam.quaternion.slerpQuaternions(fromQuat, tmp.q, e);
      cam.fov = move.from.fov + (target.fov - move.from.fov) * e;
    } else {
      // Destination vanished mid-flight (camera deleted) — hold the start
      // pose until the rig expires; the document fallback framing takes over.
      cam.position.copy(fromPos);
      cam.quaternion.copy(fromQuat);
      cam.fov = move.from.fov;
    }
    cam.updateProjectionMatrix();
    if (raw >= 1) setDone(true);
  });

  if (done) return null;
  return (
    <PerspectiveCamera
      ref={camRef}
      makeDefault
      near={0.1}
      far={200}
      fov={move.from.fov}
      position={[move.from.position.x, move.from.position.y, move.from.position.z]}
      rotation={[move.from.rotation.x * DEG2RAD, move.from.rotation.y * DEG2RAD, move.from.rotation.z * DEG2RAD]}
    />
  );
}

/** Circles (or, at `degPerSec: 0`, follows) the live world position of the
 * target node, holding the offset captured at orbit start. Runs until the
 * orbit entry disappears from the envelope. */
function CameraOrbitRig({ orbit }: { orbit: CameraOrbit }) {
  const scene = useThree((s) => s.scene);
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const target = scene.getObjectByName(setNodeObjectName(orbit.targetNodeId));
    const pivot = target
      ? target.getWorldPosition(tmp)
      : tmp.set(orbit.from.position.x, orbit.from.position.y, orbit.from.position.z);
    const elapsed = (Date.now() - orbit.startedAt) / 1000;
    const pos = orbitPosition(
      orbit.from,
      orbit.pivotStart,
      { x: pivot.x, y: pivot.y, z: pivot.z },
      orbit.degPerSec,
      elapsed,
    );
    cam.position.set(pos.x, pos.y, pos.z);
    cam.lookAt(pivot);
    cam.fov = orbit.from.fov;
    cam.updateProjectionMatrix();
  });

  return (
    <PerspectiveCamera
      ref={camRef}
      makeDefault
      near={0.1}
      far={200}
      fov={orbit.from.fov}
      position={[orbit.from.position.x, orbit.from.position.y, orbit.from.position.z]}
    />
  );
}

export function Set3dRenderer({
  layer,
  assets,
  project,
  programSceneId,
  previewSceneId,
  audible = false,
  cameraMove = null,
  cameraOrbit = null,
  activeCameraOverride = null,
  playback = null,
  arFocus = null,
}: {
  layer: Layer;
  assets: Asset[];
  /** Full project + on-air scene ids, needed only for `program`/`preview`
   * confidence-monitor videofeed sources — see ConfidenceMonitorView. */
  project: Project | null;
  programSceneId: string | null;
  previewSceneId: string | null;
  /** True only when this render IS the Program window — see DocumentRenderer. */
  audible?: boolean;
  /** In-flight smooth take for this layer (from the envelope). */
  cameraMove?: CameraMove | null;
  /** Running orbit/follow for this layer (from the envelope). */
  cameraOrbit?: CameraOrbit | null;
  /** Camera rehearsal: render statically through this camera instead of the
   * committed program camera (the Preview window's PVW-camera feature).
   * While set, motion rigs are suppressed — rehearsal is a held shot. */
  activeCameraOverride?: ID | null;
  /** This layer's Play IN/OUT entry from the envelope — drives AR node
   * entrance/exit choreography (see ArNodeAnimator in SetNodes). */
  playback?: { phase: "in" | "out"; startedAt: number } | null;
  /** This layer's live focus/isolate command (see arFocus.ts). */
  arFocus?: ArFocus | null;
}) {
  if (layer.props.kind !== "set3d") return null;
  const { nodes, environment, activeCameraId, render } = layer.props;

  const rehearsal = activeCameraOverride != null;
  const effectiveCameraId = rehearsal ? activeCameraOverride : activeCameraId;
  // A stale move (window opened after the flight ended) must never mount —
  // its first frame would flash the start pose before self-unmounting.
  const moveLive =
    !rehearsal && cameraMove && Date.now() - cameraMove.startedAt < (cameraMove.durationSec + 0.25) * 1000;
  const orbitLive = !rehearsal && cameraOrbit;

  return (
    <Canvas
      shadows={render.shadows}
      dpr={resolveDpr(render)}
      // Default framing when no camera node is active; a camera node with
      // makeDefault (see CameraNodeView) takes over automatically.
      camera={{ position: [0, 1.7, 6], fov: 50, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <RenderSettingsApplier exposure={render.exposure} shadows={render.shadows} />
      <SetEnvironmentView environment={environment} render={render} assets={assets} />
      <SetNodesView
        nodes={nodes}
        ctx={{
          interactive: false,
          audible,
          assets,
          render,
          activeCameraId: effectiveCameraId,
          project,
          programSceneId,
          previewSceneId,
          confidenceDepth: 0,
          playback,
          // Always a Set (even empty) in renderers, so clearing a focus
          // animates nodes back instead of unmounting the animator.
          arHidden: computeArHiddenSet(nodes, arFocus),
        }}
      />
      {/* Rigs mount AFTER the node graph so their makeDefault wins while
          active and unmounting restores the committed program camera. */}
      {orbitLive ? (
        <CameraOrbitRig key={`orbit-${cameraOrbit!.startedAt}`} orbit={cameraOrbit!} />
      ) : moveLive ? (
        <CameraMoveRig key={`move-${cameraMove!.startedAt}`} move={cameraMove!} />
      ) : null}
      <SetPostEffects render={render} />
    </Canvas>
  );
}
