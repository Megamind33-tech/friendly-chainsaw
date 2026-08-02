import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import {
  acquireTrackingStream,
  fovForZoom,
  getLatestPose,
  isPoseFresh,
  type LensCalibrationPoint,
  type TrackedPose,
} from "@/document/tracking";

/**
 * Locks the render camera to a physically tracked studio camera.
 *
 * This is the difference between a virtual set and AR: without it the engine
 * renders 3D graphics to a virtual camera following authored moves, and the
 * graphics slide against the real picture the moment the operator moves the
 * head. With it, a graphic placed at a world position stays planted there.
 *
 * Mounted after the scene's own camera nodes so `makeDefault` wins while
 * tracking is live, exactly like `CameraMoveRig`. Unmounting restores the
 * document's committed camera, so losing tracking falls back to the authored
 * framing rather than to nothing.
 */

/**
 * FreeD's convention → three.js.
 *
 * FreeD reports a right-handed studio frame with Z up and angles in degrees;
 * three.js is Y up. Pan is a rotation about the world up axis, tilt about the
 * camera's local right, roll about its local forward. Applying them in
 * YXZ order matches how a pan/tilt head physically composes: the tilt axis
 * rides on the pan axis, not the other way round — Euler order is the usual
 * place a tracking integration goes subtly wrong and the graphic swims.
 */
export function poseToCameraTransform(pose: TrackedPose): {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
} {
  const position = new THREE.Vector3(pose.xM, pose.zM, -pose.yM);
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(pose.tiltDeg),
    THREE.MathUtils.degToRad(pose.panDeg),
    THREE.MathUtils.degToRad(pose.rollDeg),
    "YXZ",
  );
  return { position, quaternion: new THREE.Quaternion().setFromEuler(euler) };
}

export interface TrackedCameraRigProps {
  /**
   * Measured zoom-encoder → FOV points for this lens. Two or more points give
   * a real piecewise-linear curve; anything less falls back to the linear map
   * below, which is only ever an approximation because a real lens's zoom
   * curve is markedly non-linear.
   */
  lensCalibration?: LensCalibrationPoint[];
  /** Linear fallback, used until a lens has at least two measured points. */
  fovAtZoomMin?: number;
  fovAtZoomMax?: number;
  /** Encoder value that corresponds to `fovAtZoomMin` / `fovAtZoomMax`. */
  zoomMinRaw?: number;
  zoomMaxRaw?: number;
}

export function trackedFov(zoomRaw: number, props: TrackedCameraRigProps): number {
  const {
    lensCalibration,
    fovAtZoomMin = 50,
    fovAtZoomMax = 10,
    zoomMinRaw = 0,
    zoomMaxRaw = 0xffffff,
  } = props;

  const linear = (() => {
    if (zoomMaxRaw === zoomMinRaw) return fovAtZoomMin;
    const t = THREE.MathUtils.clamp((zoomRaw - zoomMinRaw) / (zoomMaxRaw - zoomMinRaw), 0, 1);
    return fovAtZoomMin + (fovAtZoomMax - fovAtZoomMin) * t;
  })();

  // A measured curve always wins over the linear approximation.
  return fovForZoom(lensCalibration, zoomRaw, linear);
}

export function TrackedCameraRig(props: TrackedCameraRigProps) {
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);
  const scratch = useMemo(
    () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    [],
  );

  // Reference-counted, so Program, Preview and the multiviewer share one
  // EventSource rather than opening one each.
  useEffect(() => acquireTrackingStream(), []);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const pose = getLatestPose();
    // A stopped tracker holds the last good pose rather than snapping to the
    // origin — a frozen graphic is recoverable on air, a graphic that jumps to
    // the middle of the studio is not.
    if (!isPoseFresh(pose, Date.now())) return;

    const { position, quaternion } = poseToCameraTransform(pose!);
    scratch.position.copy(position);
    scratch.quaternion.copy(quaternion);
    cam.position.copy(scratch.position);
    cam.quaternion.copy(scratch.quaternion);
    const fov = trackedFov(pose!.zoomRaw, props);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });

  return <PerspectiveCamera ref={camRef} makeDefault near={0.1} far={200} />;
}
