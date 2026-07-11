import type { Layer, MaterialProps, SetNode, Vec3 } from "@/document/types";
import {
  createBrandingSurfaceNode,
  createCameraNode,
  createGroupNode,
  createLightNode,
  createPrimitiveNode,
  createSet3dLayer,
  createVideoFeedNode,
  vec3,
} from "@/document/factory";

/**
 * `Curved Panoramic Studio` (virtual_set_curved_panoramic_02) — REFERENCE 02
 * built as a real editable node tree. The panoramic curve is GENUINE
 * geometry: each side wall is four panel segments positioned on a 9.5m arc,
 * each facing the arc centre — exactly how physical curved LED walls are
 * built, and the reference's visible panel divisions ARE those segment
 * boundaries. The circular ceiling ring is 12 real tangent segments with an
 * emissive under-strip; the stage is real cylinders; ribs are real boxes.
 *
 * Screens: every display surface is a hidden `videofeed` node wired to the
 * real media pipeline (image/video/live/screen-share/URL/Programme/Preview).
 * Three honest surface modes per side wall:
 *  - NEUTRAL WALL (default): all screens hidden, white panels show.
 *  - INDEPENDENT PANELS: unhide SCREEN_x_PANEL_n — each takes its own source.
 *  - FULL WALL: unhide SCREEN_x_FULL_SEG_1..4 and give ALL FOUR the same
 *    source — each segment carries a `crop` UV window (engine feature built
 *    for this set) so one image/video CONTINUES across the curve instead of
 *    restarting per panel. Panoramic combined mode = the same trick across
 *    left + central + right (windows pre-computed 0→1 across all nine
 *    regions, names PANO_*).
 * Sources persist on hidden nodes, so switching modes never loses them.
 */

// Restrained broadcast-neutral PBR palette. Contrast and roughness variation
// produce depth under real-time lighting without permanent branding.
const FRAME_WHITE = "#cbd1d8";
const SURFACE_WHITE = "#202832";
const BASE_WHITE = "#4b545e";
const VOID_BLACK = "#05070a";
const TRUSS_DARK = "#12161c";
const STRIP_WHITE = "#d5ebff";

const frameMat: MaterialProps = {
  color: FRAME_WHITE,
  metalness: 0.35,
  roughness: 0.27,
  usePhysical: true,
  clearcoat: 0.22,
  clearcoatRoughness: 0.3,
  envMapIntensity: 0.9,
};
const surfaceMat: MaterialProps = { color: SURFACE_WHITE, metalness: 0.08, roughness: 0.5, envMapIntensity: 0.55 };
const stripMat: MaterialProps = {
  color: STRIP_WHITE,
  metalness: 0,
  roughness: 0.4,
  emissive: STRIP_WHITE,
  emissiveIntensity: 0.9,
};

// Panoramic arc: centre forward of origin, walls wrap the rear.
const ARC_C = { x: 0, z: 1.5 };
const R = 9.5;
const DEG = Math.PI / 180;

/** Position on the arc at azimuth φ (0° = straight back), facing the centre. */
function arcPos(phiDeg: number, y: number): { position: Vec3; rotation: Vec3 } {
  const p = phiDeg * DEG;
  return {
    position: vec3(ARC_C.x + R * Math.sin(p), y, ARC_C.z - R * Math.cos(p)),
    rotation: vec3(0, -phiDeg, 0),
  };
}

function box(
  name: string,
  position: Vec3,
  scale: Vec3,
  material: Partial<MaterialProps> & Pick<MaterialProps, "color">,
  rotation?: Vec3,
): SetNode {
  return createPrimitiveNode("roundedBox", {
    name,
    transform: { position, scale, rotation: rotation ?? vec3() },
    material: { metalness: 0.1, roughness: 0.5, ...material },
    cornerRadius: 0.03,
  });
}

function cyl(name: string, position: Vec3, scale: Vec3, material: { color: string; metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number }): SetNode {
  return createPrimitiveNode("cylinder", {
    name,
    transform: { position, scale },
    material: { metalness: 0.1, roughness: 0.5, ...material },
  });
}

function mediaFeed(
  name: string,
  label: string,
  w: number,
  h: number,
  local: Vec3,
  crop?: { x: number; w: number },
  visible = false,
): SetNode {
  const feed = createVideoFeedNode({
    label,
    width: w,
    height: h,
    crop,
    transform: { position: local },
    slotKind: "media",
    slotLabel: label,
    display: { fit: "cover", crop: crop ? { x: crop.x, y: 0, w: crop.w, h: 1 } : undefined, overscan: 1.01 },
  });
  feed.name = name;
  feed.visible = visible;
  return feed;
}

// ---------------------------------------------------------------------------
// Curved side walls — 4 arc segments each, with panel + full-wall screens.
// ---------------------------------------------------------------------------

const SIDE_PHIS = [26, 40, 54, 68];
const PANEL_W = 2.32;
const PANEL_H = 3.7;
const WALL_Y = 2.35;

function curvedWall(side: "LEFT" | "RIGHT"): SetNode[] {
  const s = side === "LEFT" ? -1 : 1;
  const panels: SetNode[] = [];
  const panelScreens: SetNode[] = [];
  const fullSegs: SetNode[] = [];
  SIDE_PHIS.forEach((phi, i) => {
    const at = arcPos(s * phi, WALL_Y);
    // Full-wall UV windows flow with content left→right in WORLD space:
    // LEFT wall reads outer→inner (seg near φ68 shows x:0), RIGHT inner→outer.
    const windowIndex = side === "LEFT" ? SIDE_PHIS.length - 1 - i : i;
    panels.push(
      createGroupNode(
        [
          box("PANEL_SURFACE", vec3(0, 0, 0), vec3(PANEL_W, PANEL_H, 0.1), surfaceMat),
          box("PANEL_SEAM", vec3(PANEL_W / 2, 0, 0.04), vec3(0.02, PANEL_H, 0.02), { color: "#dfe2e6", roughness: 0.6 }),
          mediaFeed(
            `SCREEN_${side}_PANEL_${i + 1}`,
            `${side} PANEL ${i + 1}`,
            PANEL_W - 0.06,
            PANEL_H - 0.1,
            vec3(0, 0, 0.08),
            undefined,
            true,
          ),
          mediaFeed(
            `SCREEN_${side}_FULL_SEG_${i + 1}`,
            `${side} FULL SEG ${i + 1}`,
            PANEL_W - 0.02,
            PANEL_H - 0.1,
            vec3(0, 0, 0.07),
            { x: windowIndex / SIDE_PHIS.length, w: 1 / SIDE_PHIS.length },
          ),
          // Panoramic combined: this wall occupies the outer 4/9ths of a
          // nine-region sweep (L1..L4, C, R1..R4 left→right).
          mediaFeed(
            `PANO_${side}_SEG_${i + 1}`,
            `PANO ${side} ${i + 1}`,
            PANEL_W - 0.02,
            PANEL_H - 0.1,
            vec3(0, 0, 0.06),
            side === "LEFT" ? { x: (SIDE_PHIS.length - 1 - i) / 9, w: 1 / 9 } : { x: (5 + i) / 9, w: 1 / 9 },
          ),
        ],
        { name: `WALL_${side}_PANEL_${i + 1}`, transform: at },
      ),
    );
  });
  // Frame band above + below the curve (chord pieces per segment kept as
  // one arc-following band via the same segment placement).
  const bands = SIDE_PHIS.map((phi, i) => {
    const top = arcPos(s * phi, 4.42);
    return createGroupNode(
      [
        box("BAND_TOP", vec3(0, 0, 0), vec3(PANEL_W + 0.06, 0.32, 0.3), frameMat),
        box("STRIP_TOP", vec3(0, -0.19, 0.08), vec3(PANEL_W, 0.05, 0.05), stripMat),
      ],
      { name: `WALL_${side}_BAND_TOP_${i + 1}`, transform: top },
    );
  }).concat(
    SIDE_PHIS.map((phi, i) => {
      const bottom = arcPos(s * phi, 0.28);
      return createGroupNode(
        [
          box("BAND_BASE", vec3(0, 0, 0), vec3(PANEL_W + 0.06, 0.56, 0.45), { color: BASE_WHITE, roughness: 0.5 }),
          box("STRIP_BASE", vec3(0, 0.31, 0.15), vec3(PANEL_W, 0.05, 0.05), stripMat),
        ],
        { name: `LOWER_BASE_${side}_${i + 1}`, transform: bottom },
      );
    }),
  );
  return [
    createGroupNode(panels, { name: `WALL_${side}_SURFACE` }),
    createGroupNode(bands, { name: `WALL_${side}_FRAME` }),
    createGroupNode(
      [
        createBrandingSurfaceNode({
          name: `BRANDING_${side}_HEADER`,
          slotLabel: `${side} curved wall branding`,
          transform: { scale: vec3(2.7, 0.42, 1) },
          material: { color: "#131920", roughness: 0.56 },
        }),
      ],
      { name: `BRANDING_${side}`, transform: arcPos(s * 47, 4.18) },
    ),
    ...panelScreens,
    ...fullSegs,
  ];
}

// ---------------------------------------------------------------------------
// Central wall, ribs, end frames, ring, stage, platform, ceiling.
// ---------------------------------------------------------------------------

function centralWall(): SetNode[] {
  const z = ARC_C.z - R + 0.15; // flat chord at the back of the arc
  const frame = createGroupNode(
    [
      box("FRAME_TOP", vec3(0, 4.15, z), vec3(7.4, 0.4, 0.32), frameMat),
      box("FRAME_BOTTOM", vec3(0, 0.72, z), vec3(7.4, 0.32, 0.32), frameMat),
      box("FRAME_LEFT", vec3(-3.6, 2.45, z), vec3(0.38, 3.8, 0.32), frameMat),
      box("FRAME_RIGHT", vec3(3.6, 2.45, z), vec3(0.38, 3.8, 0.32), frameMat),
      box("STRIP_CENTRAL_TOP", vec3(0, 3.92, z + 0.1), vec3(6.9, 0.05, 0.05), stripMat),
      box("STRIP_CENTRAL_BOTTOM", vec3(0, 0.92, z + 0.1), vec3(6.9, 0.05, 0.05), stripMat),
    ],
    { name: "WALL_CENTRAL_FRAME" },
  );
  const surface = box("WALL_CENTRAL_SURFACE", vec3(0, 2.45, z - 0.03), vec3(6.85, 3.0, 0.1), surfaceMat);
  const screen = mediaFeed("SCREEN_CENTRAL", "CENTRAL SCREEN", 6.75, 2.9, vec3(0, 2.45, z + 0.06), undefined, true);
  const pano = mediaFeed("PANO_CENTRAL", "PANO CENTRAL", 6.75, 2.9, vec3(0, 2.45, z + 0.05), { x: 4 / 9, w: 1 / 9 });
  const platform = createGroupNode(
    [
      box("PLATFORM_TOP", vec3(0, 0.3, z + 0.85), vec3(8.2, 0.08, 1.5), { color: BASE_WHITE, metalness: 0.2, roughness: 0.4 }),
      box("PLATFORM_FRONT", vec3(0, 0.15, z + 1.62), vec3(8.2, 0.3, 0.06), frameMat),
      box("STEP_LEFT", vec3(-4.6, 0.1, z + 1.3), vec3(0.9, 0.2, 0.9), { color: BASE_WHITE, roughness: 0.45 }),
      box("STEP_RIGHT", vec3(4.6, 0.1, z + 1.3), vec3(0.9, 0.2, 0.9), { color: BASE_WHITE, roughness: 0.45 }),
      box("STRIP_REAR_PLATFORM", vec3(0, 0.34, z + 1.61), vec3(8.1, 0.04, 0.04), stripMat),
    ],
    { name: "FLOOR_REAR_PLATFORM" },
  );
  return [
    frame,
    surface,
    screen,
    pano,
    createBrandingSurfaceNode({
      name: "BRANDING_CENTRAL_HEADER",
      slotLabel: "Central curved wall branding",
      transform: { position: vec3(0, 3.68, z + 0.14), scale: vec3(3.2, 0.44, 1) },
      material: { color: "#131920", roughness: 0.56 },
    }),
    platform,
  ];
}

function ribGroup(name: string, phiCenter: number): SetNode {
  const at = arcPos(phiCenter, 2.35);
  return createGroupNode(
    [-0.45, -0.15, 0.15, 0.45].map((x, i) =>
      box(`RIB_${i + 1}`, vec3(x, 0, 0.12), vec3(0.09, 4.2, 0.22), frameMat),
    ),
    { name, transform: at },
  );
}

function endFrame(side: "LEFT" | "RIGHT"): SetNode {
  const s = side === "LEFT" ? -1 : 1;
  const at = arcPos(s * 77, 0);
  return createGroupNode(
    [
      cyl("END_COLUMN", vec3(0, 2.3, 0), vec3(0.5, 4.6, 0.5), frameMat),
      box("END_STRIP", vec3(s === -1 ? 0.28 : -0.28, 2.3, 0.28), vec3(0.07, 4.4, 0.05), stripMat),
      cyl("END_BASE", vec3(0, 0.15, 0), vec3(0.68, 0.3, 0.68), { color: BASE_WHITE, roughness: 0.5 }),
    ],
    { name: `END_FRAME_${side}`, transform: { position: at.position, rotation: at.rotation } },
  );
}

function ceilingRing(): SetNode[] {
  const center = vec3(0, 4.95, 1.2);
  const ringR = 3.4;
  const segs = 12;
  const segLen = (2 * Math.PI * ringR) / segs + 0.06;
  const body: SetNode[] = [];
  const strips: SetNode[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * 360;
    const rad = a * DEG;
    const pos = vec3(center.x + ringR * Math.sin(rad), 0, ringR * Math.cos(rad));
    body.push(box(`RING_SEG_${i + 1}`, pos, vec3(segLen, 0.42, 0.55), frameMat, vec3(0, a + 90, 0)));
    strips.push(box(`RING_STRIP_${i + 1}`, vec3(pos.x, -0.26, pos.z), vec3(segLen - 0.1, 0.06, 0.4), stripMat, vec3(0, a + 90, 0)));
  }
  return [
    createGroupNode(body, { name: "CEILING_RING_OUTER", transform: { position: center } }),
    createGroupNode(strips, { name: "STRIP_CEILING_RING", transform: { position: center } }),
    box("CEILING_VOID", vec3(0, 6.15, 0), vec3(21, 0.1, 12), { color: VOID_BLACK, roughness: 0.95, metalness: 0 }),
    createGroupNode(
      [
        box("TRUSS_BAR_1", vec3(0, 0, -3), vec3(16, 0.14, 0.14), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
        box("TRUSS_BAR_2", vec3(0, 0, 0.5), vec3(16, 0.14, 0.14), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
        box("TRUSS_BAR_3", vec3(0, 0, 4), vec3(16, 0.14, 0.14), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
        box("TRUSS_CROSS_L", vec3(-6, 0, 0.5), vec3(0.14, 0.14, 8.5), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
        box("TRUSS_CROSS_R", vec3(6, 0, 0.5), vec3(0.14, 0.14, 8.5), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
      ],
      { name: "CEILING_TRUSS", transform: { position: vec3(0, 5.6, 0) } },
    ),
  ];
}

function stage(): SetNode[] {
  const c = vec3(0, 0, 1.2);
  return [
    cyl("STAGE_CIRCULAR_BASE", vec3(c.x, 0.11, c.z), vec3(3.0, 0.22, 3.0), { color: BASE_WHITE, metalness: 0.2, roughness: 0.4 }),
    cyl("STAGE_CIRCULAR_TOP", vec3(c.x, 0.3, c.z), vec3(2.2, 0.16, 2.2), { color: FRAME_WHITE, metalness: 0.25, roughness: 0.35 }),
    cyl("STAGE_TRIM_RING_01", vec3(c.x, 0.025, c.z), vec3(3.08, 0.05, 3.08), stripMat),
    cyl("STAGE_TRIM_RING_02", vec3(c.x, 0.385, c.z), vec3(2.24, 0.03, 2.24), { ...stripMat, emissiveIntensity: 0.9 }),
  ];
}

function guides(): SetNode {
  // Editor-only guides ship hidden — never on air unless deliberately shown.
  const g = createGroupNode(
    [
      cyl("STAGE_SAFE_ZONE", vec3(0, 0.45, 1.2), vec3(2.0, 0.02, 2.0), { color: "#4a90d9", emissive: "#4a90d9", emissiveIntensity: 0.8, roughness: 0.5 }),
      box("WIDE_SHOT_BOUNDARY", vec3(0, 0.02, 3.2), vec3(12, 0.02, 0.05), { color: "#4a90d9", emissive: "#4a90d9", emissiveIntensity: 0.8 }),
    ],
    { name: "PRESENTER_GUIDES" },
  );
  g.visible = false;
  return g;
}

function anchors(): SetNode {
  const a = (name: string, p: Vec3) => createGroupNode([], { name, transform: { position: p } });
  return createGroupNode(
    [
      a("KEY_LIGHT_ANCHOR", vec3(3.2, 4.8, 4.5)),
      a("FILL_LIGHT_ANCHOR", vec3(-3.6, 4.0, 4.5)),
      a("BACK_LIGHT_ANCHOR", vec3(0, 4.8, -5.5)),
      a("TOP_LIGHT_ANCHOR", vec3(0, 5.5, 1.2)),
      a("LEFT_WALL_WASH_ANCHOR", vec3(-6.5, 4.6, 1.5)),
      a("RIGHT_WALL_WASH_ANCHOR", vec3(6.5, 4.6, 1.5)),
      a("CENTRAL_WALL_WASH_ANCHOR", vec3(0, 4.8, -4.5)),
      a("STAGE_LIGHT_ANCHOR", vec3(0, 5.2, 1.2)),
      a("FLOOR_WASH_ANCHOR", vec3(0, 5.2, 4.5)),
      a("CEILING_RING_LIGHT_ANCHOR", vec3(0, 4.6, 1.2)),
    ],
    { name: "LIGHT_ANCHORS" },
  );
}

function cameras(): { nodes: SetNode[]; activeId: string } {
  const cam = (name: string, p: Vec3, r: Vec3, fov: number) =>
    createCameraNode({ name, transform: { position: p, rotation: r }, fov });
  const wide = cam("CAM_WIDE_FRONT", vec3(0, 1.8, 9.6), vec3(-3, 0, 0), 62);
  return {
    nodes: [
      wide,
      cam("CAM_MEDIUM_CENTER", vec3(0, 1.65, 5.6), vec3(-3, 0, 0), 46),
      cam("CAM_CLOSE_CENTER", vec3(0, 1.8, 3.6), vec3(-6, 0, 0), 40),
      cam("CAM_LEFT_PERSPECTIVE", vec3(-5.8, 1.7, 6.8), vec3(-2, -26, 0), 52),
      cam("CAM_RIGHT_PERSPECTIVE", vec3(5.8, 1.7, 6.8), vec3(-2, 26, 0), 52),
      cam("CAM_HIGH_WIDE", vec3(0, 5.2, 10), vec3(-20, 0, 0), 58),
      cam("CAM_LOW_WIDE", vec3(0, 0.7, 10), vec3(4, 0, 0), 62),
      cam("CAM_STAGE_ORBIT", vec3(4.2, 2.3, 5.0), vec3(-9, 34, 0), 45),
      cam("CAM_PANORAMIC_SWEEP", vec3(-7.4, 2.6, 7.4), vec3(-4, -40, 0), 66),
    ],
    activeId: wide.id,
  };
}

// ---------------------------------------------------------------------------

export const CURVED_PANORAMIC_STUDIO_ID = "virtual_set_curved_panoramic_02";

export function createCurvedPanoramicStudio(): Layer {
  const { nodes: camNodes, activeId } = cameras();
  const structure = createGroupNode(
    [
      ...centralWall(),
      ...curvedWall("LEFT"),
      ...curvedWall("RIGHT"),
      ribGroup("RIB_GROUP_CENTRAL_LEFT", -21.5),
      ribGroup("RIB_GROUP_CENTRAL_RIGHT", 21.5),
      ribGroup("RIB_GROUP_OUTER_LEFT", -72.5),
      ribGroup("RIB_GROUP_OUTER_RIGHT", 72.5),
      endFrame("LEFT"),
      endFrame("RIGHT"),
      ...ceilingRing(),
      ...stage(),
    ],
    { name: "STRUCTURE" },
  );
  return createSet3dLayer(
    [
      structure,
      anchors(),
      guides(),
      createLightNode("directional", {
        name: "SOFT_KEY",
        color: "#fff0dc",
        transform: { position: vec3(3.2, 4.8, 4.5), rotation: vec3(-42, 30, 0) },
        intensity: 3.2,
        castShadow: false,
      }),
      createLightNode("directional", {
        name: "SOFT_FILL",
        color: "#bfd8ff",
        transform: { position: vec3(-3.6, 3.8, 4.5), rotation: vec3(-35, -32, 0) },
        intensity: 1.3,
      }),
      createLightNode("directional", {
        name: "REAR_RIM",
        color: "#b9d9ff",
        transform: { position: vec3(0, 4.4, -4.5), rotation: vec3(32, 180, 0) },
        intensity: 1.7,
      }),
      ...camNodes,
    ],
    {
      name: "Curved Panoramic Studio",
      activeCameraId: activeId,
      environment: {
        background: "#0f0f14",
        floor: {
          enabled: true,
          color: "#303740",
          metalness: 0.17,
          roughness: 0.46,
          size: 28,
          reflector: { enabled: true, resolution: 512, mixStrength: 0.2, mirror: 0.09 },
        },
        grid: false,
        ambient: { color: "#d9e6f4", intensity: 0.26 },
      },
      render: {
        exposure: 1.05,
        bloom: { enabled: true, intensity: 0.18, threshold: 1.1 },
        envLight: { enabled: true, intensity: 0.5 },
      },
    },
  );
}
