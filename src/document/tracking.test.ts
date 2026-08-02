import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { isPoseFresh, parseTrackedPose, TRACKING_STALE_MS, type TrackedPose } from "./tracking";
import { poseToCameraTransform, trackedFov } from "@/components/set3d/TrackedCameraRig";

function pose(over: Partial<TrackedPose> = {}): TrackedPose {
  return {
    cameraId: 1,
    panDeg: 0,
    tiltDeg: 0,
    rollDeg: 0,
    xM: 0,
    yM: 0,
    zM: 0,
    zoomRaw: 0,
    focusRaw: 0,
    receivedAtMs: 1000,
    ...over,
  };
}

describe("parseTrackedPose", () => {
  it("decodes a well-formed payload", () => {
    const parsed = parseTrackedPose(JSON.stringify(pose({ panDeg: 45, xM: 1.5 })));
    expect(parsed).not.toBeNull();
    expect(parsed!.panDeg).toBe(45);
    expect(parsed!.xM).toBe(1.5);
  });

  it("rejects anything that is not a complete pose", () => {
    // A partially decoded pose would move the render camera to a position
    // derived from garbage. On air, a graphic frozen at its last good pose is
    // far better than one that jumps across the studio.
    expect(parseTrackedPose("not json")).toBeNull();
    expect(parseTrackedPose("null")).toBeNull();
    expect(parseTrackedPose("[]")).toBeNull();
    expect(parseTrackedPose(JSON.stringify({ panDeg: 1 }))).toBeNull();
  });

  it("rejects non-finite numbers", () => {
    // JSON has no NaN/Infinity literal, but a producer can emit a string or
    // null in their place; either would poison the camera matrix.
    expect(parseTrackedPose(JSON.stringify({ ...pose(), panDeg: "45" }))).toBeNull();
    expect(parseTrackedPose(JSON.stringify({ ...pose(), xM: null }))).toBeNull();
  });

  it("defaults only the non-geometric fields", () => {
    const raw = JSON.stringify({ panDeg: 0, tiltDeg: 0, rollDeg: 0, xM: 0, yM: 0, zM: 0 });
    const parsed = parseTrackedPose(raw)!;
    expect(parsed.zoomRaw).toBe(0);
    expect(parsed.cameraId).toBe(0);
  });
});

describe("isPoseFresh", () => {
  it("goes stale once the tracker stops", () => {
    // A stopped tracker must stop being treated as live, exactly like a data
    // feed that went quiet.
    const p = pose({ receivedAtMs: 1000 });
    expect(isPoseFresh(p, 1000)).toBe(true);
    expect(isPoseFresh(p, 1000 + TRACKING_STALE_MS)).toBe(true);
    expect(isPoseFresh(p, 1000 + TRACKING_STALE_MS + 1)).toBe(false);
  });

  it("is never fresh with no pose at all", () => {
    expect(isPoseFresh(null, 0)).toBe(false);
  });
});

describe("poseToCameraTransform", () => {
  it("maps an identity pose to the origin looking down -Z", () => {
    const { position, quaternion } = poseToCameraTransform(pose());
    // Component-wise: the Y-up axis flip yields -0 for a zero input, which is
    // numerically identical to 0 but not `toEqual`-identical.
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(0);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    expect(forward.z).toBeCloseTo(-1);
  });

  it("converts FreeD's Z-up studio frame to three's Y-up", () => {
    // A height reported by the tracker must become height in the scene. Getting
    // this wrong lays the whole studio on its side.
    const { position } = poseToCameraTransform(pose({ xM: 1, yM: 2, zM: 3 }));
    expect(position.x).toBeCloseTo(1);
    expect(position.y).toBeCloseTo(3);
    expect(position.z).toBeCloseTo(-2);
  });

  it("pans about the world up axis", () => {
    const { quaternion } = poseToCameraTransform(pose({ panDeg: 90 }));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    expect(forward.y).toBeCloseTo(0);
    expect(Math.abs(forward.x)).toBeCloseTo(1);
  });

  it("tilts about the camera's local right axis", () => {
    const { quaternion } = poseToCameraTransform(pose({ tiltDeg: 90 }));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    expect(Math.abs(forward.y)).toBeCloseTo(1);
  });

  it("composes tilt on top of pan, not the reverse", () => {
    // Euler order is the classic place a tracking integration goes subtly
    // wrong: a pan/tilt head's tilt axis rides on its pan axis, so YXZ is the
    // only order that matches the physical rig. ZYX would make the graphic
    // swim whenever both axes move together.
    const { quaternion } = poseToCameraTransform(pose({ panDeg: 90, tiltDeg: 45 }));
    const expected = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(45), THREE.MathUtils.degToRad(90), 0, "YXZ"),
    );
    expect(quaternion.angleTo(expected)).toBeCloseTo(0);
  });

  it("handles negative angles", () => {
    const { quaternion } = poseToCameraTransform(pose({ panDeg: -90 }));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    expect(Math.abs(forward.x)).toBeCloseTo(1);
  });
});

describe("trackedFov", () => {
  it("maps the encoder range onto the configured field of view", () => {
    const opts = { fovAtZoomMin: 50, fovAtZoomMax: 10, zoomMinRaw: 0, zoomMaxRaw: 1000 };
    expect(trackedFov(0, opts)).toBeCloseTo(50);
    expect(trackedFov(1000, opts)).toBeCloseTo(10);
    expect(trackedFov(500, opts)).toBeCloseTo(30);
  });

  it("clamps outside the calibrated range instead of extrapolating", () => {
    // Extrapolating past the calibration would produce a negative or absurd
    // FOV and an unusable frustum.
    const opts = { fovAtZoomMin: 50, fovAtZoomMax: 10, zoomMinRaw: 0, zoomMaxRaw: 1000 };
    expect(trackedFov(-500, opts)).toBeCloseTo(50);
    expect(trackedFov(99_999, opts)).toBeCloseTo(10);
  });

  it("degenerates safely when min and max encoder values are equal", () => {
    expect(trackedFov(123, { fovAtZoomMin: 42, zoomMinRaw: 5, zoomMaxRaw: 5 })).toBe(42);
  });
});
