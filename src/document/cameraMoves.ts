import * as THREE from "three";
import type { StateCreator } from "zustand";
import type { CameraNode, ID, Layer, SetNode, Vec3 } from "./types";
import type { Store } from "./store";

/**
 * Virtual camera motion — smooth takes between camera nodes, push-in/pull-
 * back/slide automation, orbit/follow around a subject, and a per-layer
 * camera *preview* (rehearse a shot in the Preview window before taking it
 * to Program).
 *
 * State model follows playbackState.ts exactly: transient (never persisted —
 * a half-flown camera move across an app restart is meaningless), keyed by
 * layer id, and carrying a `startedAt` wall-clock timestamp so every
 * consumer (Program window, Preview window, embedded monitors) independently
 * reconstructs the same mid-flight camera pose from
 * `Date.now() - startedAt` — no frame-sync protocol needed. The end state is
 * always already committed to the document (`activeCameraId` / the camera
 * node's transform), so a consumer that misses the animation entirely still
 * lands on the correct final frame.
 */

export interface CameraPose {
  position: Vec3;
  rotation: Vec3;
  fov: number;
}

/** Matches Set3dRenderer's default Canvas framing when no camera node is
 * active — a take from "no camera" flies from here. */
export const DEFAULT_CAMERA_POSE: CameraPose = {
  position: { x: 0, y: 1.7, z: 6 },
  rotation: { x: 0, y: 0, z: 0 },
  fov: 50,
};

export interface CameraMove {
  /** Pose the view starts from, captured at command time. */
  from: CameraPose;
  /** The camera node the move lands on — already committed as the layer's
   * `activeCameraId`, so the document's end state is correct even for a
   * consumer that never renders a single in-between frame. */
  toCameraId: ID;
  durationSec: number;
  /** GSAP ease name (same convention as Timeline / ElementAnim). */
  ease: string;
  startedAt: number;
}

export interface CameraOrbit {
  cameraId: ID;
  /** Node whose (live) position is the pivot — `degPerSec: 0` degenerates
   * into a follow shot: hold the original offset, keep looking at the
   * subject even as it moves. */
  targetNodeId: ID;
  degPerSec: number;
  startedAt: number;
  /** Camera pose when the orbit began — radius/height/phase derive from it. */
  from: CameraPose;
  /** Where the pivot was when the orbit began. The camera's offset is
   * `from.position - pivotStart`; a moving subject then carries that offset
   * along (follow) instead of the radius silently re-deriving against the
   * live pivot each frame. */
  pivotStart: Vec3;
}

export interface CameraMovesSlice {
  /** In-flight smooth takes, keyed by set3d layer id. */
  cameraMoves: Record<ID, CameraMove>;
  /** Running orbits/follows, keyed by set3d layer id. Ongoing until stopped. */
  cameraOrbits: Record<ID, CameraOrbit>;
  /** Camera rehearsal: layer id -> camera the PREVIEW window renders through
   * (Program is untouched). Cleared by previewing "null". */
  cameraPreview: Record<ID, ID>;

  /** Smooth-transition Program to a camera. `durationSec <= 0` is a hard cut. */
  takeCameraSmooth: (sceneId: ID, layerId: ID, toCameraId: ID, durationSec: number, ease: string) => void;
  setCameraPreview: (layerId: ID, cameraId: ID | null) => void;
  /** Automated moves on the current program camera: dolly along the lens
   * axis or truck sideways. Commits the destination to the camera node (one
   * undo entry) and animates the flight. */
  nudgeProgramCamera: (sceneId: ID, layerId: ID, move: CameraNudge, durationSec?: number) => void;
  /** Re-aim the program camera at a node (smooth). */
  focusProgramCamera: (sceneId: ID, layerId: ID, targetNodeId: ID, durationSec?: number) => void;
  startCameraOrbit: (sceneId: ID, layerId: ID, targetNodeId: ID, degPerSec: number) => void;
  /** Stops the orbit, committing the camera node at its current orbit pose
   * so the shot holds instead of snapping back. */
  stopCameraOrbit: (sceneId: ID, layerId: ID) => void;
}

export type CameraNudge = "push" | "pull" | "slideLeft" | "slideRight";

// ---------------------------------------------------------------------------
// Pure pose math (shared with the render-side rigs in Set3dRenderer).
// ---------------------------------------------------------------------------

export const DEG2RAD = Math.PI / 180;

/** Object names the R3F views register, so the move/orbit rigs can read the
 * LIVE world pose of their targets straight off the mounted scene graph
 * (exact even for cameras/subjects nested in transformed groups). */
export function camNodeObjectName(id: ID): string {
  return `camnode-${id}`;
}
export function setNodeObjectName(id: ID): string {
  return `setnode-${id}`;
}

export function quatFromPoseDeg(rotation: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD, "XYZ"),
  );
}

/** Local pose of a camera node. v1 treats local as world — every set
 * builder and the Cameras panel author cameras at the top level; a camera
 * nested inside a *transformed* group flies from a slightly-off start pose
 * (the render rigs still land it exactly, since they read the live world
 * pose of the destination). */
export function poseOfCamera(node: CameraNode): CameraPose {
  const t = node.transform;
  return {
    position: { ...t.position },
    rotation: { ...t.rotation },
    fov: node.fov,
  };
}

/** Camera-convention lookAt (-Z toward target), returned as Euler degrees. */
export function lookAtRotationDeg(eye: Vec3, target: Vec3): Vec3 {
  const m = new THREE.Matrix4().lookAt(
    new THREE.Vector3(eye.x, eye.y, eye.z),
    new THREE.Vector3(target.x, target.y, target.z),
    new THREE.Vector3(0, 1, 0),
  );
  const e = new THREE.Euler().setFromRotationMatrix(m, "XYZ");
  return { x: e.x / DEG2RAD, y: e.y / DEG2RAD, z: e.z / DEG2RAD };
}

/** Where an orbiting camera sits `elapsedSec` into its orbit: the offset it
 * had from the pivot AT ORBIT START (`pivotStart`), swung around the Y axis
 * and carried along by the live pivot. With `degPerSec: 0` the offset never
 * swings — a follow shot that holds its framing as the subject moves. */
export function orbitPosition(
  from: CameraPose,
  pivotStart: Vec3,
  pivot: Vec3,
  degPerSec: number,
  elapsedSec: number,
): Vec3 {
  const dx = from.position.x - pivotStart.x;
  const dz = from.position.z - pivotStart.z;
  const radius = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx) + degPerSec * elapsedSec * DEG2RAD;
  return {
    x: pivot.x + radius * Math.cos(angle),
    y: pivot.y + (from.position.y - pivotStart.y),
    z: pivot.z + radius * Math.sin(angle),
  };
}

// ---------------------------------------------------------------------------
// Document lookup helpers (local — store.ts's equivalents aren't exported).
// ---------------------------------------------------------------------------

type Set3dProps = Extract<Layer["props"], { kind: "set3d" }>;

function set3dPropsOf(layer: Layer | undefined): Set3dProps | null {
  return layer && layer.props.kind === "set3d" ? layer.props : null;
}

function findNode(nodes: SetNode[], nodeId: ID): SetNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.kind === "group") {
      const hit = findNode(node.children, nodeId);
      if (hit) return hit;
    }
  }
  return null;
}

function findCamera(nodes: SetNode[], cameraId: ID | null): CameraNode | null {
  if (!cameraId) return null;
  const node = findNode(nodes, cameraId);
  return node && node.kind === "camera" ? node : null;
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

type Immer = ["zustand/immer", never];

export const createCameraMovesSlice: StateCreator<Store, [Immer], [], CameraMovesSlice> = (set) => ({
  cameraMoves: {},
  cameraOrbits: {},
  cameraPreview: {},

  takeCameraSmooth: (sceneId, layerId, toCameraId, durationSec, ease) =>
    set((state) => {
      if (!state.project) return;
      const scene = state.project.scenes.find((s) => s.id === sceneId);
      const layer = scene?.layers.find((l) => l.id === layerId);
      const props = set3dPropsOf(layer);
      if (!props || !findCamera(props.nodes, toCameraId)) return;

      const fromCam = findCamera(props.nodes, props.activeCameraId);
      const from = fromCam ? poseOfCamera(fromCam) : DEFAULT_CAMERA_POSE;

      props.activeCameraId = toCameraId;
      state.dirty = true;
      // A take supersedes any running orbit; a cut also kills the in-flight move.
      delete state.cameraOrbits[layerId];
      if (durationSec <= 0) {
        delete state.cameraMoves[layerId];
      } else {
        state.cameraMoves[layerId] = { from, toCameraId, durationSec, ease, startedAt: Date.now() };
      }
    }),

  setCameraPreview: (layerId, cameraId) =>
    set((state) => {
      if (cameraId) state.cameraPreview[layerId] = cameraId;
      else delete state.cameraPreview[layerId];
    }),

  nudgeProgramCamera: (sceneId, layerId, move, durationSec = 0.9) =>
    set((state) => {
      if (!state.project) return;
      const scene = state.project.scenes.find((s) => s.id === sceneId);
      const props = set3dPropsOf(scene?.layers.find((l) => l.id === layerId));
      const cam = props && findCamera(props.nodes, props.activeCameraId);
      if (!cam) return;

      const from = poseOfCamera(cam);
      const q = quatFromPoseDeg(cam.transform.rotation);
      const dir =
        move === "push" || move === "pull"
          ? new THREE.Vector3(0, 0, -1).applyQuaternion(q) // lens axis
          : new THREE.Vector3(1, 0, 0).applyQuaternion(q); // truck axis
      const amount = move === "push" ? 1.5 : move === "pull" ? -1.5 : move === "slideRight" ? 1.2 : -1.2;

      cam.transform.position.x += dir.x * amount;
      cam.transform.position.y += dir.y * amount;
      cam.transform.position.z += dir.z * amount;
      state.dirty = true;
      delete state.cameraOrbits[layerId];
      state.cameraMoves[layerId] = { from, toCameraId: cam.id, durationSec, ease: "power2.inOut", startedAt: Date.now() };
    }),

  focusProgramCamera: (sceneId, layerId, targetNodeId, durationSec = 0.8) =>
    set((state) => {
      if (!state.project) return;
      const scene = state.project.scenes.find((s) => s.id === sceneId);
      const props = set3dPropsOf(scene?.layers.find((l) => l.id === layerId));
      const cam = props && findCamera(props.nodes, props.activeCameraId);
      const target = props && findNode(props.nodes, targetNodeId);
      if (!cam || !target || target.kind === "camera") return;

      const from = poseOfCamera(cam);
      cam.transform.rotation = lookAtRotationDeg(cam.transform.position, target.transform.position);
      state.dirty = true;
      delete state.cameraOrbits[layerId];
      state.cameraMoves[layerId] = { from, toCameraId: cam.id, durationSec, ease: "power2.inOut", startedAt: Date.now() };
    }),

  startCameraOrbit: (sceneId, layerId, targetNodeId, degPerSec) =>
    set((state) => {
      if (!state.project) return;
      const scene = state.project.scenes.find((s) => s.id === sceneId);
      const props = set3dPropsOf(scene?.layers.find((l) => l.id === layerId));
      const cam = props && findCamera(props.nodes, props.activeCameraId);
      const target = props && findNode(props.nodes, targetNodeId);
      if (!cam || !target || target.kind === "camera") return;

      delete state.cameraMoves[layerId];
      state.cameraOrbits[layerId] = {
        cameraId: cam.id,
        targetNodeId,
        degPerSec,
        startedAt: Date.now(),
        from: poseOfCamera(cam),
        pivotStart: { ...target.transform.position },
      };
    }),

  stopCameraOrbit: (sceneId, layerId) =>
    set((state) => {
      const orbit = state.cameraOrbits[layerId];
      delete state.cameraOrbits[layerId];
      if (!orbit || !state.project) return;
      // Commit the pose the orbit reached so the shot holds where the
      // operator stopped it (document-side pivot: the node's authored
      // position — matches the rig exactly for the common non-animated,
      // top-level subject; a moving subject holds at its authored spot).
      const scene = state.project.scenes.find((s) => s.id === sceneId);
      const props = set3dPropsOf(scene?.layers.find((l) => l.id === layerId));
      const cam = props && findCamera(props.nodes, orbit.cameraId);
      const target = props && findNode(props.nodes, orbit.targetNodeId);
      if (!cam || !target) return;
      const elapsedSec = (Date.now() - orbit.startedAt) / 1000;
      const pivot = target.transform.position;
      cam.transform.position = orbitPosition(orbit.from, orbit.pivotStart, pivot, orbit.degPerSec, elapsedSec);
      cam.transform.rotation = lookAtRotationDeg(cam.transform.position, pivot);
      state.dirty = true;
    }),
});
