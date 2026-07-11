import { MathUtils, Object3D, PerspectiveCamera, Vector3 } from "three";
import type { Layer, SetNode, Vec3 } from "@/document/types";
import {
  createBrandingSurfaceNode,
  createCameraNode,
  createGroupNode,
  createLightNode,
  createPrimitiveNode as createRawPrimitiveNode,
  createSet3dLayer,
  createText3dNode,
  createVideoFeedNode as createRawVideoFeedNode,
  vec3,
} from "@/document/factory";

const createPrimitiveNode: typeof createRawPrimitiveNode = (shape, overrides = {}) =>
  createRawPrimitiveNode(shape === "box" ? "roundedBox" : shape, {
    ...overrides,
    cornerRadius: overrides.cornerRadius ?? (shape === "box" ? 0.035 : undefined),
  });

const createVideoFeedNode: typeof createRawVideoFeedNode = (overrides = {}) =>
  createRawVideoFeedNode({
    slotKind: "media",
    slotLabel: overrides.label ?? "Media surface",
    display: { fit: "cover", anchor: "center", overscan: 1.01 },
    ...overrides,
  });

/**
 * The six legacy studio sets (legacy/src/components/studio/
 * VirtualStudioScene.tsx), ported as builders that emit REAL editable node
 * trees — every desk leg, monitor, and light is a selectable, gizmo-movable,
 * deletable SetNode. Nothing here is a locked template: builders are just a
 * fast starting point, the same relationship sports scorebugs have to
 * hand-built gfx2d layers.
 *
 * Deliberate upgrade over the legacy port: the old fake glowing "CAM 1"
 * boxes are now real `videofeed` nodes — dark standby panels until an
 * operator assigns an actual capture device / screen share / URL.
 */

/** Euler (degrees) that points a node's +Z at `to` — matching SetNodes'
 * light-target convention (aim target sits on local +Z). */
function rotationTowards(from: Vec3, to: Vec3): Vec3 {
  const o = new Object3D();
  o.position.set(from.x, from.y, from.z);
  o.lookAt(new Vector3(to.x, to.y, to.z));
  return {
    x: MathUtils.radToDeg(o.rotation.x),
    y: MathUtils.radToDeg(o.rotation.y),
    z: MathUtils.radToDeg(o.rotation.z),
  };
}

/** Same, but with camera lookAt semantics (cameras shoot down -Z). */
function cameraRotationTowards(from: Vec3, to: Vec3): Vec3 {
  const cam = new PerspectiveCamera();
  cam.position.set(from.x, from.y, from.z);
  cam.lookAt(new Vector3(to.x, to.y, to.z));
  return {
    x: MathUtils.radToDeg(cam.rotation.x),
    y: MathUtils.radToDeg(cam.rotation.y),
    z: MathUtils.radToDeg(cam.rotation.z),
  };
}

/**
 * The legacy 3-point rig (key/fill/rim), as three real light nodes aimed at
 * `subject` (talent position). Intensities/angles match the legacy
 * SpotLight values (angle 0.6/0.8/0.5 rad ≈ 34/46/29°; intensity 50/30/40).
 */
export function createThreePointRig(subject: Vec3 = vec3(0, 1.2, 0)): SetNode[] {
  const keyPos = vec3(3, 6, 4);
  const fillPos = vec3(-3, 5, 3);
  const rimPos = vec3(0, 4, -5);
  return [
    createLightNode("spot", {
      name: "Key Light",
      transform: { position: keyPos, rotation: rotationTowards(keyPos, subject) },
      intensity: 50,
      angle: 34,
      penumbra: 0.5,
      castShadow: true,
    }),
    createLightNode("spot", {
      name: "Fill Light",
      transform: { position: fillPos, rotation: rotationTowards(fillPos, subject) },
      intensity: 30,
      angle: 46,
      penumbra: 0.7,
    }),
    createLightNode("spot", {
      name: "Rim Light",
      transform: { position: rimPos, rotation: rotationTowards(rimPos, subject) },
      color: "#8899cc",
      intensity: 40,
      angle: 29,
      penumbra: 0.3,
    }),
  ];
}

/** Back/side walls + ceiling (legacy StudioWalls) as one editable group. */
function createStudioShell(wallColor = "#101828"): SetNode {
  const wall = (name: string, position: Vec3, rotation: Vec3, w: number, h: number) =>
    createPrimitiveNode("plane", {
      name,
      transform: { position, rotation, scale: vec3(w, h, 1) },
      material: { color: wallColor, metalness: 0.2, roughness: 0.6 },
    });
  return createGroupNode(
    [
      wall("Back Wall", vec3(0, 4, -7), vec3(0, 0, 0), 20, 8),
      wall("Left Wall", vec3(-10, 4, 0), vec3(0, 90, 0), 14, 8),
      wall("Right Wall", vec3(10, 4, 0), vec3(0, -90, 0), 14, 8),
      wall("Ceiling", vec3(0, 8, 0), vec3(90, 0, 0), 20, 14),
    ],
    { name: "Studio Shell" },
  );
}

/** A studio monitor: a real video feed surface plus its stand. */
function createMonitor(label: string, position: Vec3, w = 2.2, h = 1.24): SetNode {
  return createGroupNode(
    [
      createVideoFeedNode({ label, width: w, height: h, transform: { position: vec3(0, 0, 0) } }),
      createPrimitiveNode("box", {
        name: "Stand",
        transform: { position: vec3(0, -h / 2 - 0.4, -0.2), scale: vec3(0.3, 0.8, 0.3) },
        material: { color: "#222233", metalness: 0.6, roughness: 0.3 },
      }),
    ],
    { name: `Monitor ${label}`, transform: { position } },
  );
}

/** Every set ships one program camera at the legacy default framing. */
function createProgramCamera(name = "CAM 1 (Program)"): SetNode {
  const position = vec3(0, 1.7, 6);
  return createCameraNode({
    name,
    fov: 50,
    transform: { position, rotation: cameraRotationTowards(position, vec3(0, 1.5, 0)) },
  });
}

/** Wraps nodes + rig + camera into a set3d layer with the camera active. */
function assembleSet(name: string, furniture: SetNode[], subject: Vec3 = vec3(0, 1.2, 0)): Layer {
  const camera = createProgramCamera();
  const nodes = [
    createStudioShell(),
    createBrandingSurfaceNode({
      name: `${name} Branding Header`,
      slotLabel: `${name} branding`,
      transform: { position: vec3(0, 5.8, -6.86), scale: vec3(4.2, 0.62, 1) },
      material: { color: "#141b24", roughness: 0.54 },
    }),
    ...furniture,
    ...createThreePointRig(subject),
    camera,
  ];
  return createSet3dLayer(nodes, {
    name,
    activeCameraId: camera.id,
    environment: {
      background: "#070a0f",
      floor: {
        enabled: true,
        color: "#252c34",
        metalness: 0.16,
        roughness: 0.48,
        size: 30,
        reflector: { enabled: true, resolution: 512, mixStrength: 0.18, mirror: 0.07 },
      },
      grid: false,
      ambient: { color: "#d8e4f2", intensity: 0.25 },
    },
    render: {
      exposure: 1.05,
      envLight: { enabled: true, intensity: 0.48 },
      bloom: { enabled: true, intensity: 0.16, threshold: 1.1 },
    },
  });
}

// ---------------------------------------------------------------------------
// The six sets.
// ---------------------------------------------------------------------------

function createDesk(name: string, topColor: string): SetNode {
  const leg = (x: number, z: number, i: number) =>
    createPrimitiveNode("cylinder", {
      name: `Leg ${i}`,
      transform: { position: vec3(x, 0.45, z), scale: vec3(0.12, 0.9, 0.12) },
      material: { color: "#333344", metalness: 0.8, roughness: 0.3 },
    });
  return createGroupNode(
    [
      createPrimitiveNode("box", {
        name: "Desk Top",
        transform: { position: vec3(0, 0.95, 0), scale: vec3(3.2, 0.12, 1.4) },
        material: { color: topColor, metalness: 0.7, roughness: 0.2 },
        reflector: true,
      }),
      leg(-1.4, -0.55, 1),
      leg(1.4, -0.55, 2),
      leg(-1.4, 0.55, 3),
      leg(1.4, 0.55, 4),
      createPrimitiveNode("box", {
        name: "Glass Panel",
        transform: { position: vec3(0, 1.02, 0.2), scale: vec3(2.8, 0.02, 0.6) },
        material: { color: "#4a90d9", metalness: 0.9, roughness: 0.05, opacity: 0.4 },
      }),
    ],
    { name },
  );
}

export function createNewsDeskSet(): Layer {
  return assembleSet("News Desk", [
    createDesk("News Desk", "#1a1a2e"),
    createMonitor("CAM 1", vec3(-4, 2, -5)),
    createMonitor("CAM 3", vec3(4, 2, -5)),
  ]);
}

export function createWeatherStudioSet(): Layer {
  return assembleSet("Weather Studio", [
    // The legacy fake emissive weather screen is now a real feed wall — an
    // AR/map/weather renderer plugs in as a screen share or URL source.
    createVideoFeedNode({
      label: "WEATHER MAP",
      width: 5.8,
      height: 3.3,
      transform: { position: vec3(0, 2.5, -5) },
    }),
  ]);
}

function createChair(name: string, x: number): SetNode {
  const leg = (lx: number, lz: number, i: number) =>
    createPrimitiveNode("cylinder", {
      name: `Leg ${i}`,
      transform: { position: vec3(lx, 0.25, lz), scale: vec3(0.06, 0.5, 0.06) },
      material: { color: "#444455", metalness: 0.7, roughness: 0.5 },
    });
  return createGroupNode(
    [
      createPrimitiveNode("box", {
        name: "Seat",
        transform: { position: vec3(0, 0.5, 0), scale: vec3(0.8, 0.08, 0.8) },
        material: { color: "#2d2d3d", metalness: 0.3, roughness: 0.6 },
      }),
      createPrimitiveNode("box", {
        name: "Backrest",
        transform: { position: vec3(0, 0.9, -0.36), scale: vec3(0.8, 0.8, 0.08) },
        material: { color: "#2d2d3d", metalness: 0.3, roughness: 0.6 },
      }),
      leg(-0.35, -0.35, 1),
      leg(0.35, -0.35, 2),
      leg(-0.35, 0.35, 3),
      leg(0.35, 0.35, 4),
    ],
    { name, transform: { position: vec3(x, 0, 0) } },
  );
}

export function createTalkShowSet(): Layer {
  return assembleSet("Talk Show", [
    createChair("Host Chair", -1.2),
    createChair("Guest Chair", 1.2),
    createPrimitiveNode("box", {
      name: "Coffee Table",
      transform: { position: vec3(0, 0.4, 0.2), scale: vec3(1.2, 0.05, 0.6) },
      material: { color: "#1a1a2e", metalness: 0.6, roughness: 0.2 },
    }),
    createMonitor("AUDIENCE CAM", vec3(0, 3, -5)),
  ]);
}

export function createSportsArenaSet(): Layer {
  return assembleSet("Sports Arena", [
    createVideoFeedNode({
      label: "SCOREBOARD FEED",
      width: 3.8,
      height: 1.8,
      transform: { position: vec3(0, 4, -5) },
    }),
    createPrimitiveNode("box", {
      name: "Podium",
      transform: { position: vec3(0, 0.5, 0), scale: vec3(2, 0.1, 1) },
      material: { color: "#1a2a1a", metalness: 0.5, roughness: 0.3 },
    }),
  ]);
}

export function createElectionHqSet(): Layer {
  return assembleSet("Election HQ", [
    createVideoFeedNode({ label: "DATA 1", width: 2.2, height: 1.6, transform: { position: vec3(-3, 2.5, -5) } }),
    createVideoFeedNode({ label: "DATA 2", width: 2.2, height: 1.6, transform: { position: vec3(0, 2.5, -5) } }),
    createVideoFeedNode({ label: "DATA 3", width: 2.2, height: 1.6, transform: { position: vec3(3, 2.5, -5) } }),
    createDesk("Anchor Desk", "#1a1a3e"),
  ]);
}

export function createBreakingNewsSet(): Layer {
  return assembleSet("Breaking News", [
    createVideoFeedNode({
      label: "LED WALL",
      width: 9.8,
      height: 4.8,
      transform: { position: vec3(0, 2.5, -5.9) },
    }),
    createPrimitiveNode("box", {
      name: "Breaking Strip",
      transform: { position: vec3(0, 5.2, -5.8), scale: vec3(10, 0.4, 0.05) },
      material: { color: "#cc0000", metalness: 0.1, roughness: 0.6, emissive: "#ff0000", emissiveIntensity: 0.8 },
    }),
    createText3dNode({
      name: "Breaking News Text",
      text: "BREAKING NEWS",
      fontSize: 0.25,
      color: "#ffffff",
      transform: { position: vec3(0, 5.2, -5.7) },
    }),
  ]);
}

import { createUniversalWideScreenWallStudio, UNIVERSAL_WIDE_STUDIO_ID } from "./universalWideStudio";
import { createCurvedPanoramicStudio, CURVED_PANORAMIC_STUDIO_ID } from "./curvedPanoramicStudio";
import { createModernStadiumGlassStudio, MODERN_STADIUM_GLASS_STUDIO_ID } from "./modernStadiumGlassStudio";

/** One entry per set builder — LayersPanel's dropdown grows by adding a
 * line here, same convention as SPORT_SCOREBUGS. */
export const SET_BUILDERS: { id: string; label: string; create: () => Layer }[] = [
  // Empty Customisable Sets — the approved white reference studio.
  {
    id: UNIVERSAL_WIDE_STUDIO_ID,
    label: "Universal Wide Screen-Wall Studio",
    create: createUniversalWideScreenWallStudio,
  },
  {
    id: CURVED_PANORAMIC_STUDIO_ID,
    label: "Curved Panoramic Studio",
    create: createCurvedPanoramicStudio,
  },
  {
    id: MODERN_STADIUM_GLASS_STUDIO_ID,
    label: "Modern Stadium Glass Studio",
    create: createModernStadiumGlassStudio,
  },
  { id: "news-desk", label: "News Desk", create: createNewsDeskSet },
  { id: "weather-studio", label: "Weather Studio", create: createWeatherStudioSet },
  { id: "talk-show", label: "Talk Show", create: createTalkShowSet },
  { id: "sports-arena", label: "Sports Arena", create: createSportsArenaSet },
  { id: "election-hq", label: "Election HQ", create: createElectionHqSet },
  { id: "breaking-news", label: "Breaking News", create: createBreakingNewsSet },
];
