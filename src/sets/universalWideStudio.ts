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
 * `Universal Wide Screen-Wall Studio` (virtual_set_universal_wide_screen_wall_01)
 * — the approved empty white reference studio, built as a REAL editable node
 * tree (not a merged mesh, not a texture): wide open floor, central screen
 * wall on a low platform with side steps, two inward-angled side screen
 * walls in thick white frames, illuminated vertical columns, a rounded
 * ceiling frame with an emissive inner strip over a dark production void
 * with a truss rig, base light strips, eight named light anchors and seven
 * named camera bookmarks.
 *
 * Everything the spec demands as "customisation" rides the EXISTING engine:
 * every node is independently selectable/colorable/hideable in the
 * Inspector (base color, metalness, roughness, emissive, opacity, texture),
 * the three screen surfaces are real `videofeed` nodes wired to the actual
 * media pipeline (image/video/live camera/screen-share/URL/Programme/
 * Preview), gizmo + numeric transforms cover the geometry parameters, and
 * "Save Template" persists any customised variant. Screens ship HIDDEN so
 * the set opens as clean neutral walls (the spec's default "Neutral Wall"
 * mode) — showing a screen node and assigning a source IS screen mode.
 * Panel mode is honest too: each side wall carries one full-wall feed AND a
 * 2×2 group of independent panel feeds; the operator toggles visibility
 * between them, and sources persist on the hidden nodes.
 */

// Premium neutral palette: restrained contrast creates readable depth without
// baking a broadcaster's brand into the template.
const FRAME_WHITE = "#d9dde2";
const SURFACE_WHITE = "#242b33";
const DIVIDER_GREY = "#10151b";
const PLATFORM_WHITE = "#59616a";
const VOID_BLACK = "#05070a";
const TRUSS_DARK = "#12161b";
const STRIP_WHITE = "#dceeff";

const frameMat: MaterialProps = {
  color: FRAME_WHITE,
  metalness: 0.32,
  roughness: 0.28,
  usePhysical: true,
  clearcoat: 0.24,
  clearcoatRoughness: 0.32,
  envMapIntensity: 0.85,
};
const surfaceMat: MaterialProps = {
  color: SURFACE_WHITE,
  metalness: 0.08,
  roughness: 0.48,
  envMapIntensity: 0.55,
};
const stripMat: MaterialProps = {
  color: STRIP_WHITE,
  metalness: 0,
  roughness: 0.45,
  emissive: STRIP_WHITE,
  emissiveIntensity: 0.85,
};

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
    cornerRadius: 0.035,
  });
}

function strip(name: string, position: Vec3, scale: Vec3, rotation?: Vec3): SetNode {
  return box(name, position, scale, stripMat, rotation);
}

function anchor(name: string, position: Vec3): SetNode {
  return createGroupNode([], { name, transform: { position } });
}

// ---------------------------------------------------------------------------
// Central wall (frame + surface + panel dividers + platform + steps).
// ---------------------------------------------------------------------------

function centralWall(): SetNode[] {
  const z = -5.9;
  const frame = createGroupNode(
    [
      box("FRAME_TOP", vec3(0, 4.05, z), vec3(10.6, 0.35, 0.3), frameMat),
      box("FRAME_BOTTOM", vec3(0, 0.62, z), vec3(10.6, 0.3, 0.3), frameMat),
      box("FRAME_LEFT", vec3(-5.15, 2.35, z), vec3(0.35, 3.75, 0.3), frameMat),
      box("FRAME_RIGHT", vec3(5.15, 2.35, z), vec3(0.35, 3.75, 0.3), frameMat),
    ],
    { name: "WALL_CENTRAL_FRAME" },
  );
  const surface = box("WALL_CENTRAL_SURFACE", vec3(0, 2.35, z - 0.02), vec3(9.95, 3.15, 0.1), surfaceMat);
  // The reference's clean internal grid — architectural dividers, not baked.
  const dividers = createGroupNode(
    [-3, -1, 1, 3].map((x, i) =>
      box(`DIVIDER_V_${i + 1}`, vec3(x * 1.65, 2.35, z + 0.05), vec3(0.03, 3.1, 0.02), { color: DIVIDER_GREY, roughness: 0.6 }),
    ).concat([box("DIVIDER_H", vec3(0, 2.35, z + 0.05), vec3(9.9, 0.03, 0.02), { color: DIVIDER_GREY, roughness: 0.6 })]),
    { name: "PANEL_DIVIDERS_CENTRAL" },
  );
  const platform = createGroupNode(
    [
      box("PLATFORM_TOP", vec3(0, 0.17, -5.15), vec3(11.4, 0.06, 2.2), { color: PLATFORM_WHITE, roughness: 0.4, metalness: 0.2 }),
      box("PLATFORM_FRONT", vec3(0, 0.07, -4.06), vec3(11.4, 0.14, 0.06), { color: FRAME_WHITE, roughness: 0.45 }),
    ],
    { name: "FLOOR_REAR_PLATFORM" },
  );
  const stepL = box("STEP_LEFT", vec3(-6.15, 0.08, -4.6), vec3(1.2, 0.16, 1.2), { color: PLATFORM_WHITE, roughness: 0.45 });
  const stepR = box("STEP_RIGHT", vec3(6.15, 0.08, -4.6), vec3(1.2, 0.16, 1.2), { color: PLATFORM_WHITE, roughness: 0.45 });
  return [frame, surface, dividers, platform, stepL, stepR];
}

// ---------------------------------------------------------------------------
// Angled side walls — built once, mirrored by parameter (real mirrored
// geometry: positions and yaw negate; content orientation stays correct
// because each surface is its own node with its own facing).
// ---------------------------------------------------------------------------

function sideWall(side: "LEFT" | "RIGHT"): SetNode[] {
  const s = side === "LEFT" ? -1 : 1;
  // Wall plane centre and inward yaw (reference: big walls angled toward camera).
  const pos = vec3(s * -6.9, 2.5, -1.4);
  const yaw = s * -38; // left wall faces inward-right, right wall inward-left
  const rot = vec3(0, yaw, 0);

  const group = createGroupNode(
    [
      // Thick external architectural frame.
      createGroupNode(
        [
          box("FRAME_TOP", vec3(0, 2.05, 0), vec3(8.3, 0.35, 0.32), frameMat),
          box("FRAME_BOTTOM", vec3(0, -1.85, 0), vec3(8.3, 0.35, 0.32), frameMat),
          box("FRAME_NEAR", vec3(3.95, 0.1, 0), vec3(0.4, 4.25, 0.32), frameMat),
          box("FRAME_FAR", vec3(-3.95, 0.1, 0), vec3(0.4, 4.25, 0.32), frameMat),
          // Lower architectural base beneath the wall.
          box("BASE", vec3(0, -2.28, 0.1), vec3(8.3, 0.5, 0.5), { color: FRAME_WHITE, roughness: 0.5 }),
        ],
        { name: `WALL_${side}_FRAME` },
      ),
      // The wall surface itself (neutral panel look, horizontal divisions).
      box(`WALL_${side}_SURFACE`, vec3(0, 0.1, -0.05), vec3(7.5, 3.55, 0.1), surfaceMat),
      createGroupNode(
        [
          box("DIV_H1", vec3(0, 1.0, 0.04), vec3(7.45, 0.03, 0.02), { color: DIVIDER_GREY, roughness: 0.6 }),
          box("DIV_H2", vec3(0, -0.8, 0.04), vec3(7.45, 0.03, 0.02), { color: DIVIDER_GREY, roughness: 0.6 }),
          box("DIV_V", vec3(0, 0.1, 0.04), vec3(0.03, 3.5, 0.02), { color: DIVIDER_GREY, roughness: 0.6 }),
        ],
        { name: `PANEL_DIVIDERS_${side}` },
      ),
      // Vertical illuminated edges (reference: glowing verticals on frames).
      strip(`STRIP_${side}_VERTICAL_NEAR`, vec3(3.62, 0.1, 0.12), vec3(0.06, 4.15, 0.05)),
      strip(`STRIP_${side}_VERTICAL_FAR`, vec3(-3.62, 0.1, 0.12), vec3(0.06, 4.15, 0.05)),
      strip(`STRIP_${side}_BASE`, vec3(0, -2.02, 0.2), vec3(8.25, 0.05, 0.05)),
      createBrandingSurfaceNode({
        name: `BRANDING_${side}_HEADER`,
        slotLabel: `${side} wall branding`,
        transform: { position: vec3(0, 1.58, 0.18), scale: vec3(2.8, 0.42, 1) },
        material: { color: "#151a21", roughness: 0.55 },
      }),
      // FULL-WALL screen — hidden until the operator enters screen mode.
      (() => {
        const feed = createVideoFeedNode({
          label: `${side} WALL SCREEN`,
          width: 7.4,
          height: 3.45,
          transform: { position: vec3(0, 0.1, 0.09) },
          slotKind: "media",
          slotLabel: `${side} full wall`,
          display: { fit: "cover", anchor: "center", overscan: 1.01 },
        });
        feed.name = `SCREEN_${side}_FULL`;
        // Visible neutral display by default. With no source it is an honest
        // dark no-signal panel in editor/Programme, not fake content.
        feed.visible = true;
        return feed;
      })(),
      // INDEPENDENT PANEL MODE — 2×2 grid of separate screens, also hidden.
      createGroupNode(
        [
          [-1.85, 1.0],
          [1.85, 1.0],
          [-1.85, -0.8],
          [1.85, -0.8],
        ].map(([px, py], i) => {
          const feed = createVideoFeedNode({
            label: `${side} PANEL ${i + 1}`,
            width: 3.62,
            height: 1.68,
            transform: { position: vec3(px, py, 0.08) },
            slotKind: "media",
            slotLabel: `${side} panel ${i + 1}`,
            display: { fit: "cover", anchor: "center", overscan: 1.01 },
          });
          feed.name = `SCREEN_${side}_PANEL_${i + 1}`;
          feed.visible = false;
          return feed;
        }),
        { name: `SCREEN_${side}_PANEL_GROUP` },
      ),
    ],
    { name: `WALL_${side}`, transform: { position: pos, rotation: rot } },
  );
  return [group];
}

// ---------------------------------------------------------------------------
// Columns, ceiling, void, truss, anchors, cameras.
// ---------------------------------------------------------------------------

function columns(): SetNode[] {
  const col = (name: string, x: number) =>
    createGroupNode(
      [
        box("COLUMN_BODY", vec3(0, 2.3, 0), vec3(0.38, 4.6, 0.38), frameMat),
        strip("COLUMN_GLOW", vec3(0, 2.3, 0.21), vec3(0.1, 4.5, 0.04)),
      ],
      { name, transform: { position: vec3(x, 0, -5.4) } },
    );
  return [
    col("COLUMN_LEFT_INNER", -5.7),
    col("COLUMN_RIGHT_INNER", 5.7),
    col("COLUMN_LEFT_OUTER", -8.6),
    col("COLUMN_RIGHT_OUTER", 8.6),
  ];
}

function ceiling(): SetNode[] {
  const y = 5.1;
  const ring = (name: string, w: number, d: number, t: number, h: number, mat: typeof frameMat) =>
    createGroupNode(
      [
        box("RING_FRONT", vec3(0, 0, d / 2), vec3(w, h, t), mat),
        box("RING_BACK", vec3(0, 0, -d / 2), vec3(w, h, t), mat),
        box("RING_LEFT", vec3(-w / 2, 0, 0), vec3(t, h, d - t), mat, vec3(0, 0, 0)),
        box("RING_RIGHT", vec3(w / 2, 0, 0), vec3(t, h, d - t), mat),
        // Chamfered corners (reference: rounded rectangular frame).
        box("CORNER_FL", vec3(-w / 2 + 0.9, 0, d / 2 - 0.9), vec3(2.4, h, t), mat, vec3(0, 45, 0)),
        box("CORNER_FR", vec3(w / 2 - 0.9, 0, d / 2 - 0.9), vec3(2.4, h, t), mat, vec3(0, -45, 0)),
        box("CORNER_BL", vec3(-w / 2 + 0.9, 0, -d / 2 + 0.9), vec3(2.4, h, t), mat, vec3(0, -45, 0)),
        box("CORNER_BR", vec3(w / 2 - 0.9, 0, -d / 2 + 0.9), vec3(2.4, h, t), mat, vec3(0, 45, 0)),
      ],
      { name, transform: { position: vec3(0, y, -1) } },
    );

  const outer = ring("CEILING_FRAME_OUTER", 15.5, 10.5, 1.1, 0.7, frameMat);
  const innerStrip = createGroupNode(
    [
      strip("STRIP_FRONT", vec3(0, -0.2, 4.6), vec3(12.6, 0.08, 0.08)),
      strip("STRIP_BACK", vec3(0, -0.2, -4.6), vec3(12.6, 0.08, 0.08)),
      strip("STRIP_LEFT", vec3(-6.6, -0.2, 0), vec3(0.08, 0.08, 8.4)),
      strip("STRIP_RIGHT", vec3(6.6, -0.2, 0), vec3(0.08, 0.08, 8.4)),
    ],
    { name: "STRIP_CEILING_INNER", transform: { position: vec3(0, y, -1) } },
  );
  const voidPlate = box("CEILING_VOID", vec3(0, y + 0.9, -1), vec3(14, 0.1, 9.2), { color: VOID_BLACK, roughness: 0.95, metalness: 0 });
  const truss = createGroupNode(
    [
      box("TRUSS_BAR_1", vec3(0, 0, -3), vec3(13, 0.14, 0.14), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
      box("TRUSS_BAR_2", vec3(0, 0, 0), vec3(13, 0.14, 0.14), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
      box("TRUSS_BAR_3", vec3(0, 0, 3), vec3(13, 0.14, 0.14), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
      box("TRUSS_CROSS_L", vec3(-5, 0, 0), vec3(0.14, 0.14, 7.4), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
      box("TRUSS_CROSS_R", vec3(5, 0, 0), vec3(0.14, 0.14, 7.4), { color: TRUSS_DARK, metalness: 0.6, roughness: 0.4 }),
    ],
    { name: "CEILING_TRUSS", transform: { position: vec3(0, y + 0.55, -1) } },
  );
  return [outer, innerStrip, voidPlate, truss];
}

function lightAnchors(): SetNode {
  return createGroupNode(
    [
      anchor("KEY_LIGHT_ANCHOR", vec3(3, 4.6, 2.5)),
      anchor("FILL_LIGHT_ANCHOR", vec3(-3.5, 3.8, 2.5)),
      anchor("BACK_LIGHT_ANCHOR", vec3(0, 4.6, -4.5)),
      anchor("TOP_LIGHT_ANCHOR", vec3(0, 5.4, 0)),
      anchor("LEFT_WALL_WASH_ANCHOR", vec3(-5.5, 4.4, 0.5)),
      anchor("RIGHT_WALL_WASH_ANCHOR", vec3(5.5, 4.4, 0.5)),
      anchor("CENTRAL_WALL_WASH_ANCHOR", vec3(0, 4.6, -3.5)),
      anchor("FLOOR_WASH_ANCHOR", vec3(0, 5.0, 2.5)),
    ],
    { name: "LIGHT_ANCHORS" },
  );
}

function cameras(): { nodes: SetNode[]; activeId: string } {
  const cam = (name: string, position: Vec3, rotation: Vec3, fov: number) =>
    createCameraNode({ name, transform: { position, rotation }, fov });
  // CAM_WIDE_FRONT reproduces the reference's eye-level wide perspective.
  const wide = cam("CAM_WIDE_FRONT", vec3(0, 1.7, 7.6), vec3(-2, 0, 0), 58);
  const nodes = [
    wide,
    cam("CAM_MEDIUM_CENTRE", vec3(0, 1.6, 4.4), vec3(-2, 0, 0), 45),
    cam("CAM_LEFT_PERSPECTIVE", vec3(-4.8, 1.7, 4.8), vec3(-2, -24, 0), 50),
    cam("CAM_RIGHT_PERSPECTIVE", vec3(4.8, 1.7, 4.8), vec3(-2, 24, 0), 50),
    cam("CAM_CENTRAL_CLOSE", vec3(0, 1.9, 1.6), vec3(-4, 0, 0), 38),
    cam("CAM_HIGH_WIDE", vec3(0, 4.6, 8.2), vec3(-18, 0, 0), 55),
    cam("CAM_LOW_WIDE", vec3(0, 0.7, 8.2), vec3(4, 0, 0), 58),
  ];
  return { nodes, activeId: wide.id };
}

function studioLights(): SetNode[] {
  // Three broad motivated directions. Directional sources stay stable on
  // modest GPUs while giving the chamfers and PBR surfaces readable shape.
  return [
    createLightNode("directional", {
      name: "SOFT_KEY",
      color: "#fff3e2",
      transform: { position: vec3(3, 5.2, 4), rotation: vec3(-40, 30, 0) },
      intensity: 3.4,
      castShadow: false,
    }),
    createLightNode("directional", {
      name: "SOFT_FILL",
      color: "#c8ddff",
      transform: { position: vec3(-4, 4.2, 3), rotation: vec3(-35, -35, 0) },
      intensity: 1.35,
    }),
    createLightNode("directional", {
      name: "REAR_RIM",
      color: "#b9d7ff",
      transform: { position: vec3(0, 4.8, -4.5), rotation: vec3(35, 180, 0) },
      intensity: 1.8,
    }),
  ];
}

// ---------------------------------------------------------------------------

export const UNIVERSAL_WIDE_STUDIO_ID = "virtual_set_universal_wide_screen_wall_01";

export function createUniversalWideScreenWallStudio(): Layer {
  const { nodes: camNodes, activeId } = cameras();
  // Central screen — hidden neutral-wall default, in front of the surface.
  const centralScreen = createVideoFeedNode({
    label: "CENTRAL SCREEN",
    width: 9.85,
    height: 3.05,
    transform: { position: vec3(0, 2.35, -5.82) },
    slotKind: "media",
    slotLabel: "Central screen",
    display: { fit: "cover", anchor: "center", overscan: 1.01 },
  });
  centralScreen.name = "SCREEN_CENTRAL";
  centralScreen.visible = true;

  const structure = createGroupNode(
    [...centralWall(), ...sideWall("LEFT"), ...sideWall("RIGHT"), ...columns(), ...ceiling(),
      strip("STRIP_CENTRAL_TOP", vec3(0, 4.28, -5.85), vec3(10.5, 0.05, 0.05)),
      strip("STRIP_CENTRAL_BOTTOM", vec3(0, 0.45, -5.8), vec3(10.5, 0.05, 0.05)),
    ],
    { name: "STRUCTURE" },
  );

  const layer = createSet3dLayer(
    [
      structure,
      centralScreen,
      createBrandingSurfaceNode({
        name: "BRANDING_CENTRAL_HEADER",
        slotLabel: "Central wall branding",
        transform: { position: vec3(0, 3.65, -5.7), scale: vec3(3.5, 0.46, 1) },
        material: { color: "#151a21", roughness: 0.55 },
      }),
      lightAnchors(),
      ...studioLights(),
      ...camNodes,
    ],
    {
      name: "Universal Wide Screen-Wall Studio",
      activeCameraId: activeId,
      environment: {
        background: "#101016",
        floor: {
          enabled: true,
          color: "#343a42",
          metalness: 0.16,
          roughness: 0.48,
          size: 26,
          reflector: { enabled: true, resolution: 512, mixStrength: 0.22, mirror: 0.1 },
        },
        grid: false,
        ambient: { color: "#dbe6f2", intensity: 0.28 },
      },
      render: {
        exposure: 1.05,
        bloom: { enabled: true, intensity: 0.18, threshold: 1.1 },
        envLight: { enabled: true, intensity: 0.48 },
      },
    },
  );
  return layer;
}
