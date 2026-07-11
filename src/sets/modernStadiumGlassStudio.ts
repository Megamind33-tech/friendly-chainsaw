import type { Layer, SetNode, Vec3 } from "@/document/types";
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
 * Modern Stadium Glass Studio (`virtual_set_modern_stadium_glass_03`)
 *
 * Empty customisable set matching the approved modern stadium reference:
 * curved panoramic glass curtain wall looking onto a real exterior stadium
 * environment, circular presentation platform with underglow, circular
 * ceiling ring + production void, premium side architecture with vertical
 * LED strips, and one optional side screen (hidden by default).
 *
 * No presenter, desk, chairs, logos, or permanent graphics.
 * Stadium beyond the glass is architectural exterior, not a pasted graphic.
 */

export const MODERN_STADIUM_GLASS_STUDIO_ID = "virtual_set_modern_stadium_glass_03";

const FLOOR_GREY = "#3a3d44";
const PLATFORM_TOP = "#4a4e56";
const PLATFORM_SIDE = "#2c2f36";
const PANEL_DARK = "#2a2d34";
const PANEL_MID = "#353940";
const COLUMN_METAL = "#1e2128";
const MULLION = "#1a1c22";
const FRAME_DARK = "#22252c";
const VOID_BLACK = "#0a0b0e";
const TRUSS = "#14161a";
const STRIP_WARM = "#fff4e0";
const GLASS_TINT = "#a8c0d8";
const PITCH_GREEN = "#2d6b3a";
const SEAT_BLUE = "#1a3a6e";
const STADIUM_STRUCTURE = "#1c1e24";
const FLOOD_LIGHT = "#fff8e8";

const DEG = Math.PI / 180;
const ARC_C = { x: 0, z: -1.2 };
const GLASS_R = 11.5;
const GLASS_PHIS = [-48, -32, -16, 0, 16, 32, 48];
const GLASS_PANEL_W = 2.55;
const GLASS_H = 5.4;
const GLASS_Y = 2.85;

const glassMat = {
  color: GLASS_TINT,
  metalness: 0,
  roughness: 0.12,
  opacity: 0.38,
  envMapIntensity: 1.25,
  usePhysical: true,
  transmission: 0.86,
  thickness: 0.035,
  ior: 1.5,
};
const mullionMat = { color: MULLION, metalness: 0.7, roughness: 0.35 };
const stripMat = {
  color: STRIP_WARM,
  metalness: 0,
  roughness: 0.35,
  emissive: STRIP_WARM,
  emissiveIntensity: 1.6,
};
const panelMat = { color: PANEL_DARK, metalness: 0.25, roughness: 0.55 };

type Mat = {
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  envMapIntensity?: number;
  usePhysical?: boolean;
  transmission?: number;
  thickness?: number;
  ior?: number;
};

function arcPos(phiDeg: number, y: number): { position: Vec3; rotation: Vec3 } {
  const p = phiDeg * DEG;
  return {
    position: vec3(ARC_C.x + GLASS_R * Math.sin(p), y, ARC_C.z - GLASS_R * Math.cos(p)),
    rotation: vec3(0, -phiDeg, 0),
  };
}

function box(name: string, position: Vec3, scale: Vec3, material: Mat, rotation?: Vec3): SetNode {
  return createPrimitiveNode("roundedBox", {
    name,
    transform: { position, scale, rotation: rotation ?? vec3() },
    material: { metalness: 0.15, roughness: 0.5, ...material },
    cornerRadius: 0.025,
  });
}

function cyl(name: string, position: Vec3, scale: Vec3, material: Mat): SetNode {
  return createPrimitiveNode("cylinder", {
    name,
    transform: { position, scale },
    material: { metalness: 0.15, roughness: 0.5, ...material },
  });
}

function plane(name: string, position: Vec3, scale: Vec3, material: Mat, rotation?: Vec3): SetNode {
  return createPrimitiveNode("plane", {
    name,
    transform: { position, scale, rotation: rotation ?? vec3() },
    material: { metalness: 0.1, roughness: 0.6, ...material },
  });
}

function hiddenFeed(name: string, label: string, w: number, h: number, local: Vec3): SetNode {
  const feed = createVideoFeedNode({
    label,
    width: w,
    height: h,
    transform: { position: local },
    slotKind: "media",
    slotLabel: label,
    display: { fit: "cover", anchor: "center", overscan: 1.01 },
  });
  feed.name = name;
  feed.visible = false;
  return feed;
}

function anchor(name: string, p: Vec3): SetNode {
  return createGroupNode([], { name, transform: { position: p } });
}

function floorAndPlatform(): SetNode[] {
  const platformR = 4.0;
  const platformH = 0.22;
  return [
    box("FLOOR_SEAM_L", vec3(-5, 0.005, 1.5), vec3(0.02, 0.01, 12), { color: "#2e3138", roughness: 0.7 }),
    box("FLOOR_SEAM_R", vec3(5, 0.005, 1.5), vec3(0.02, 0.01, 12), { color: "#2e3138", roughness: 0.7 }),
    createGroupNode(
      [
        cyl("PLATFORM_MAIN", vec3(0, platformH / 2, 0), vec3(platformR * 2, platformH, platformR * 2), {
          color: PLATFORM_SIDE,
          metalness: 0.3,
          roughness: 0.4,
        }),
        cyl("PLATFORM_TOP", vec3(0, platformH + 0.02, 0), vec3(platformR * 2 - 0.08, 0.04, platformR * 2 - 0.08), {
          color: PLATFORM_TOP,
          metalness: 0.4,
          roughness: 0.25,
        }),
        cyl("PLATFORM_TRIM", vec3(0, platformH + 0.01, 0), vec3(platformR * 2 + 0.06, 0.03, platformR * 2 + 0.06), {
          color: FRAME_DARK,
          metalness: 0.55,
          roughness: 0.35,
        }),
        cyl("PLATFORM_LIGHT_STRIP", vec3(0, 0.02, 0), vec3(platformR * 2 + 0.12, 0.04, platformR * 2 + 0.12), {
          ...stripMat,
          emissiveIntensity: 1.8,
        }),
      ],
      { name: "PLATFORM_GROUP", transform: { position: vec3(0, 0, 1.8) } },
    ),
    box("STRIP_PERIMETER_FRONT", vec3(0, 0.03, 7.2), vec3(16, 0.04, 0.06), stripMat),
    box("STRIP_PERIMETER_L", vec3(-9.2, 0.03, 1.5), vec3(0.06, 0.04, 10), stripMat),
    box("STRIP_PERIMETER_R", vec3(9.2, 0.03, 1.5), vec3(0.06, 0.04, 10), stripMat),
  ];
}

function ceilingFeature(): SetNode[] {
  const center = vec3(0, 5.35, 1.8);
  const ringR = 3.6;
  const segs = 16;
  const segLen = (2 * Math.PI * ringR) / segs + 0.08;
  const outer: SetNode[] = [];
  const inner: SetNode[] = [];
  const strips: SetNode[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * 360;
    const rad = a * DEG;
    const pos = vec3(ringR * Math.sin(rad), 0, ringR * Math.cos(rad));
    const rot = vec3(0, a + 90, 0);
    outer.push(
      box(`CEILING_RING_OUTER_${i + 1}`, pos, vec3(segLen, 0.38, 0.55), { color: COLUMN_METAL, metalness: 0.45, roughness: 0.4 }, rot),
    );
    const innerPos = vec3((ringR - 0.45) * Math.sin(rad), -0.05, (ringR - 0.45) * Math.cos(rad));
    inner.push(
      box(`CEILING_RING_INNER_${i + 1}`, innerPos, vec3(segLen * 0.85, 0.28, 0.35), { color: VOID_BLACK, metalness: 0.2, roughness: 0.7 }, rot),
    );
    strips.push(box(`STRIP_CEILING_RING_${i + 1}`, vec3(pos.x, -0.24, pos.z), vec3(segLen - 0.12, 0.05, 0.32), stripMat, rot));
  }

  const spots: SetNode[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spots.push(
      cyl(`SPOT_CAN_${i + 1}`, vec3(Math.sin(a) * 1.4, -0.35, Math.cos(a) * 1.4), vec3(0.22, 0.35, 0.22), {
        color: TRUSS,
        metalness: 0.7,
        roughness: 0.35,
      }),
    );
  }

  return [
    createGroupNode(outer, { name: "CEILING_RING_OUTER", transform: { position: center } }),
    createGroupNode(inner, { name: "CEILING_RING_INNER", transform: { position: center } }),
    createGroupNode(strips, { name: "STRIP_CEILING_RING", transform: { position: center } }),
    box("CEILING_VOID", vec3(0, 6.35, 1.0), vec3(22, 0.12, 14), { color: VOID_BLACK, roughness: 0.95, metalness: 0 }),
    box("CEILING_RECESS_RING", vec3(0, 6.2, 1.8), vec3(8.2, 0.08, 8.2), { color: "#12141a", roughness: 0.85 }),
    createGroupNode(
      [
        box("TRUSS_BAR_1", vec3(0, 0, -2.2), vec3(14, 0.12, 0.12), { color: TRUSS, metalness: 0.65, roughness: 0.35 }),
        box("TRUSS_BAR_2", vec3(0, 0, 0), vec3(14, 0.12, 0.12), { color: TRUSS, metalness: 0.65, roughness: 0.35 }),
        box("TRUSS_BAR_3", vec3(0, 0, 2.2), vec3(14, 0.12, 0.12), { color: TRUSS, metalness: 0.65, roughness: 0.35 }),
        box("TRUSS_CROSS_L", vec3(-4.5, 0, 0), vec3(0.12, 0.12, 6), { color: TRUSS, metalness: 0.65, roughness: 0.35 }),
        box("TRUSS_CROSS_R", vec3(4.5, 0, 0), vec3(0.12, 0.12, 6), { color: TRUSS, metalness: 0.65, roughness: 0.35 }),
        ...spots,
      ],
      { name: "CEILING_RIG", transform: { position: vec3(0, 5.85, 1.8) } },
    ),
    box("STRIP_CEILING_GLASS_CURVE", vec3(0, 5.95, ARC_C.z - GLASS_R + 0.8), vec3(14, 0.05, 0.06), stripMat),
  ];
}

function glassWall(): SetNode {
  const panels: SetNode[] = [];
  const mullions: SetNode[] = [];

  GLASS_PHIS.forEach((phi, i) => {
    const at = arcPos(phi, GLASS_Y);
    panels.push(
      createGroupNode(
        [box(`GLASS_PANEL_${String(i + 1).padStart(2, "0")}`, vec3(0, 0, 0), vec3(GLASS_PANEL_W - 0.08, GLASS_H, 0.04), glassMat)],
        { name: `GLASS_PANEL_GROUP_${i + 1}`, transform: at },
      ),
    );
  });

  [-56, -40, -24, -8, 8, 24, 40, 56].forEach((phi, i) => {
    const at = arcPos(phi, GLASS_Y);
    mullions.push(
      createGroupNode(
        [box(`MULLION_${String(i + 1).padStart(2, "0")}`, vec3(0, 0, 0.02), vec3(0.1, GLASS_H + 0.2, 0.18), mullionMat)],
        { name: `MULLION_GROUP_${i + 1}`, transform: at },
      ),
    );
  });

  const frameSegs = GLASS_PHIS.flatMap((phi, i) => {
    const top = arcPos(phi, GLASS_Y + GLASS_H / 2 + 0.18);
    const bottom = arcPos(phi, GLASS_Y - GLASS_H / 2 - 0.2);
    return [
      createGroupNode(
        [box(`FRAME_TOP_${i + 1}`, vec3(0, 0, 0), vec3(GLASS_PANEL_W + 0.1, 0.28, 0.28), { color: FRAME_DARK, metalness: 0.5, roughness: 0.4 })],
        { name: `FRAME_TOP_SEG_${i + 1}`, transform: top },
      ),
      createGroupNode(
        [box(`FRAME_BOTTOM_${i + 1}`, vec3(0, 0, 0), vec3(GLASS_PANEL_W + 0.1, 0.4, 0.35), { color: FRAME_DARK, metalness: 0.45, roughness: 0.45 })],
        { name: `FRAME_BOTTOM_SEG_${i + 1}`, transform: bottom },
      ),
    ];
  });

  const leftCol = arcPos(-58, 0);
  const rightCol = arcPos(58, 0);

  return createGroupNode(
    [
      createGroupNode(panels, { name: "GLASS_PANELS" }),
      createGroupNode(mullions, { name: "MULLIONS" }),
      createGroupNode(frameSegs, { name: "GLASS_FRAMES" }),
      createGroupNode(
        [
          cyl("COLUMN_LEFT", vec3(0, 3.1, 0), vec3(0.85, 6.2, 0.85), { color: COLUMN_METAL, metalness: 0.55, roughness: 0.4 }),
          cyl("COLUMN_LEFT_BASE", vec3(0, 0.2, 0), vec3(1.05, 0.4, 1.05), { color: PANEL_MID, metalness: 0.35, roughness: 0.5 }),
        ],
        { name: "COLUMN_LEFT", transform: { position: leftCol.position, rotation: leftCol.rotation } },
      ),
      createGroupNode(
        [
          cyl("COLUMN_RIGHT", vec3(0, 3.1, 0), vec3(0.85, 6.2, 0.85), { color: COLUMN_METAL, metalness: 0.55, roughness: 0.4 }),
          cyl("COLUMN_RIGHT_BASE", vec3(0, 0.2, 0), vec3(1.05, 0.4, 1.05), { color: PANEL_MID, metalness: 0.35, roughness: 0.5 }),
        ],
        { name: "COLUMN_RIGHT", transform: { position: rightCol.position, rotation: rightCol.rotation } },
      ),
    ],
    { name: "GLASS_WALL_GROUP" },
  );
}

function stadiumShell(mode: "DAY" | "EVENING" | "NIGHT", visible: boolean): SetNode {
  const pitchBright = mode === "DAY" ? "#3a8a4a" : mode === "EVENING" ? PITCH_GREEN : "#1a4a28";
  const seatBright = mode === "DAY" ? "#2a5a9e" : mode === "EVENING" ? SEAT_BLUE : "#0e2248";
  const sky =
    mode === "DAY"
      ? { color: "#6a8ab0", emissive: "#4a6a90", emissiveIntensity: 0.35 }
      : mode === "EVENING"
        ? { color: "#2a3550", emissive: "#1a2540", emissiveIntensity: 0.45 }
        : { color: "#0a1020", emissive: "#060a14", emissiveIntensity: 0.25 };
  const floodI = mode === "DAY" ? 0.4 : mode === "EVENING" ? 1.8 : 2.2;
  const ambientGlow = mode === "DAY" ? 0.15 : mode === "EVENING" ? 0.55 : 0.7;

  const seating: SetNode[] = [];
  for (let tier = 0; tier < 5; tier++) {
    const y = 1.2 + tier * 1.35;
    const depth = 18 + tier * 2.2;
    seating.push(
      box(`SEATING_TIER_${tier + 1}`, vec3(0, y, -depth * 0.15), vec3(28 + tier * 1.5, 1.1, 3.2), {
        color: seatBright,
        metalness: 0.15,
        roughness: 0.65,
        emissive: seatBright,
        emissiveIntensity: ambientGlow * 0.15,
      }),
    );
  }

  const floods = [-10, -4, 4, 10].map((x, i) =>
    createGroupNode(
      [
        box(`FLOOD_POLE_${i + 1}`, vec3(0, 4, 0), vec3(0.25, 8, 0.25), { color: STADIUM_STRUCTURE, metalness: 0.6, roughness: 0.4 }),
        box(`FLOOD_HEAD_${i + 1}`, vec3(0, 8.2, 0.4), vec3(1.8, 0.5, 0.8), {
          color: FLOOD_LIGHT,
          metalness: 0.3,
          roughness: 0.4,
          emissive: FLOOD_LIGHT,
          emissiveIntensity: floodI,
        }),
      ],
      { name: `FLOODLIGHT_${i + 1}`, transform: { position: vec3(x, 0, -14) } },
    ),
  );

  const group = createGroupNode(
    [
      plane("STADIUM_SKY", vec3(0, 10, -22), vec3(50, 22, 1), sky),
      box("PITCH", vec3(0, 0.05, -10), vec3(22, 0.08, 16), { color: pitchBright, metalness: 0.05, roughness: 0.7 }),
      box("PITCH_LINE_CENTER", vec3(0, 0.1, -10), vec3(0.08, 0.02, 14), { color: "#e8eee8", roughness: 0.8 }),
      box("STADIUM_BOWL_L", vec3(-14, 4, -12), vec3(4, 10, 20), { color: STADIUM_STRUCTURE, metalness: 0.3, roughness: 0.6 }),
      box("STADIUM_BOWL_R", vec3(14, 4, -12), vec3(4, 10, 20), { color: STADIUM_STRUCTURE, metalness: 0.3, roughness: 0.6 }),
      box("STADIUM_BOWL_BACK", vec3(0, 5, -20), vec3(32, 12, 3), { color: STADIUM_STRUCTURE, metalness: 0.25, roughness: 0.65 }),
      box("STADIUM_ROOF_LIP", vec3(0, 11, -16), vec3(30, 0.4, 8), { color: "#12141a", metalness: 0.4, roughness: 0.5 }),
      ...seating,
      ...floods,
      plane("STADIUM_GLOW", vec3(0, 3, -8), vec3(24, 8, 1), {
        color: mode === "DAY" ? "#ffffff" : FLOOD_LIGHT,
        emissive: mode === "DAY" ? "#ffffff" : FLOOD_LIGHT,
        emissiveIntensity: ambientGlow * 0.2,
        opacity: mode === "DAY" ? 0.05 : 0.12,
        metalness: 0,
        roughness: 1,
      }),
    ],
    { name: `STADIUM_ENV_${mode}`, transform: { position: vec3(0, 0, ARC_C.z - GLASS_R + 2) } },
  );
  group.visible = visible;
  return group;
}

function exteriorEnvironment(): SetNode {
  return createGroupNode(
    [
      stadiumShell("DAY", false),
      stadiumShell("EVENING", true),
      stadiumShell("NIGHT", false),
      (() => {
        const backdrop = createPrimitiveNode("plane", {
          name: "CUSTOM_BACKDROP_SLOT",
          slotKind: "media",
          slotLabel: "Stadium backdrop",
          display: { fit: "cover", anchor: "center", overscan: 1.01 },
          transform: { position: vec3(0, 7, -23), scale: vec3(34, 15, 1) },
          material: { color: "#202838", metalness: 0, roughness: 1 },
        });
        backdrop.visible = false;
        return backdrop;
      })(),
    ],
    { name: "EXTERIOR_ENVIRONMENT" },
  );
}

function sideWall(side: "LEFT" | "RIGHT"): SetNode {
  const s = side === "LEFT" ? -1 : 1;
  const x = s * 9.0;
  const children: SetNode[] = [
    box(`SIDE_WALL_${side}`, vec3(0, 3.1, 1.5), vec3(0.35, 6.2, 11), panelMat),
    box(`SIDE_PANEL_UPPER_${side}`, vec3(s * 0.2, 4.2, 1.5), vec3(0.12, 2.8, 9), { color: PANEL_MID, metalness: 0.3, roughness: 0.5 }),
    box(`STRIP_SIDE_VERTICAL_01_${side}`, vec3(s * 0.28, 3.0, -1.5), vec3(0.06, 5.2, 0.08), stripMat),
    box(`STRIP_SIDE_VERTICAL_02_${side}`, vec3(s * 0.28, 3.0, 1.0), vec3(0.06, 5.2, 0.08), stripMat),
    box(`STRIP_SIDE_VERTICAL_03_${side}`, vec3(s * 0.28, 3.0, 3.5), vec3(0.06, 5.2, 0.08), { ...stripMat, emissiveIntensity: 1.2 }),
  ];

  if (side === "RIGHT") {
    children.push(
      box("SIDE_NICHE", vec3(-0.15, 2.4, 2.2), vec3(0.5, 3.2, 3.6), { color: "#1a1c22", metalness: 0.2, roughness: 0.65 }),
      box("SIDE_NICHE_SHELF", vec3(-0.05, 1.0, 2.2), vec3(0.4, 0.08, 3.4), { color: PANEL_MID, metalness: 0.35, roughness: 0.45 }),
      box("SIDE_SCREEN_FRAME", vec3(-0.22, 2.6, 2.2), vec3(0.08, 2.6, 3.0), { color: FRAME_DARK, metalness: 0.5, roughness: 0.4 }),
      box("SIDE_SCREEN_OPTIONAL_WALL", vec3(-0.28, 2.6, 2.2), vec3(0.04, 2.4, 2.8), { color: PANEL_DARK, metalness: 0.2, roughness: 0.6 }),
      hiddenFeed("SIDE_SCREEN_OPTIONAL", "SIDE SCREEN", 2.7, 2.3, vec3(-0.35, 2.6, 2.2)),
      hiddenFeed("AUX_SCREEN_PANEL", "AUX SCREEN", 1.6, 1.2, vec3(-0.35, 1.4, 4.2)),
    );
  } else {
    for (let i = 0; i < 8; i++) {
      children.push(
        box(`SLAT_${i + 1}`, vec3(0.22, 3.0, -2 + i * 0.55), vec3(0.08, 4.8, 0.12), {
          color: "#3d3428",
          metalness: 0.15,
          roughness: 0.55,
        }),
      );
    }
    children.push(box("STRIP_SLAT_EDGE", vec3(0.3, 3.0, 0.5), vec3(0.05, 5.0, 0.05), stripMat));
  }

  return createGroupNode(children, {
    name: `SIDE_WALL_${side}`,
    transform: { position: vec3(x, 0, 0) },
  });
}

function guides(): SetNode {
  const g = createGroupNode(
    [
      cyl("PLATFORM_SAFE_ZONE", vec3(0, 0.35, 1.8), vec3(6.5, 0.02, 6.5), {
        color: "#4a90d9",
        emissive: "#4a90d9",
        emissiveIntensity: 0.7,
        roughness: 0.5,
      }),
      box("PRESENTER_SAFE_ZONE", vec3(0, 0.32, 3.5), vec3(3.5, 0.02, 2.5), {
        color: "#4a90d9",
        emissive: "#4a90d9",
        emissiveIntensity: 0.6,
      }),
      box("WIDE_SHOT_BOUNDARY", vec3(0, 0.02, 7.5), vec3(16, 0.02, 0.05), {
        color: "#4a90d9",
        emissive: "#4a90d9",
        emissiveIntensity: 0.8,
      }),
    ],
    { name: "EDITOR_GUIDES" },
  );
  g.visible = false;
  return g;
}

function brandingSurfaces(): SetNode {
  return createGroupNode(
    [
      createBrandingSurfaceNode({
        name: "BRANDING_STADIUM_HEADER",
        slotLabel: "Stadium glass header branding",
        transform: { position: vec3(0, 5.35, -9.8), scale: vec3(4.2, 0.56, 1) },
        material: { color: "#171d25", roughness: 0.52 },
      }),
      createBrandingSurfaceNode({
        name: "BRANDING_LEFT_FASCIA",
        slotLabel: "Left fascia branding",
        transform: { position: vec3(-6.2, 4.35, -7.2), rotation: vec3(0, -18, 0), scale: vec3(2.7, 0.48, 1) },
        material: { color: "#171d25", roughness: 0.52 },
      }),
      createBrandingSurfaceNode({
        name: "BRANDING_RIGHT_FASCIA",
        slotLabel: "Right fascia branding",
        transform: { position: vec3(6.2, 4.35, -7.2), rotation: vec3(0, 18, 0), scale: vec3(2.7, 0.48, 1) },
        material: { color: "#171d25", roughness: 0.52 },
      }),
    ],
    { name: "BRANDING_SURFACES" },
  );
}

function lightAnchors(): SetNode {
  return createGroupNode(
    [
      anchor("KEY_LIGHT_ANCHOR", vec3(3.5, 5.0, 5.5)),
      anchor("FILL_LIGHT_ANCHOR", vec3(-3.8, 4.2, 5.5)),
      anchor("BACK_LIGHT_ANCHOR", vec3(0, 5.0, -4.0)),
      anchor("TOP_LIGHT_ANCHOR", vec3(0, 5.6, 1.8)),
      anchor("PLATFORM_LIGHT_ANCHOR", vec3(0, 5.4, 1.8)),
      anchor("LEFT_WALL_WASH_ANCHOR", vec3(-7.5, 4.5, 2.0)),
      anchor("RIGHT_WALL_WASH_ANCHOR", vec3(7.5, 4.5, 2.0)),
      anchor("GLASS_WALL_WASH_ANCHOR", vec3(0, 4.8, -5.5)),
    ],
    { name: "LIGHT_ANCHORS" },
  );
}

function cameras(): { nodes: SetNode[]; activeId: string } {
  const cam = (name: string, p: Vec3, r: Vec3, fov: number) =>
    createCameraNode({ name, transform: { position: p, rotation: r }, fov });
  const wide = cam("CAM_WIDE_FRONT", vec3(0, 1.85, 10.2), vec3(-4, 0, 0), 58);
  return {
    nodes: [
      wide,
      cam("CAM_CENTRE_PLATFORM", vec3(0, 1.7, 6.2), vec3(-5, 0, 0), 46),
      cam("CAM_LEFT_ANGLE", vec3(-6.2, 1.75, 7.0), vec3(-3, -28, 0), 50),
      cam("CAM_RIGHT_ANGLE", vec3(6.2, 1.75, 7.0), vec3(-3, 28, 0), 50),
      cam("CAM_PLATFORM_CLOSE", vec3(0, 1.55, 4.0), vec3(-8, 0, 0), 40),
      cam("CAM_HIGH_WIDE", vec3(0, 5.4, 10.5), vec3(-22, 0, 0), 55),
      cam("CAM_STADIUM_GLASS_WIDE", vec3(0, 2.4, 8.5), vec3(-2, 0, 0), 62),
    ],
    activeId: wide.id,
  };
}

function softLights(): SetNode[] {
  return [
    createLightNode("directional", {
      name: "SOFT_KEY",
      color: "#fff5e8",
      transform: { position: vec3(3.5, 5.0, 5.5), rotation: vec3(-40, 28, 0) },
      intensity: 2.0,
      castShadow: false,
    }),
    createLightNode("point", {
      name: "SOFT_FILL",
      color: "#e8f0ff",
      transform: { position: vec3(-3.8, 4.0, 5.0) },
      intensity: 1.3,
    }),
    createLightNode("point", {
      name: "GLASS_WASH",
      color: "#d0e4ff",
      transform: { position: vec3(0, 4.5, -3.5) },
      intensity: 1.1,
    }),
  ];
}

export function createModernStadiumGlassStudio(): Layer {
  const { nodes: camNodes, activeId } = cameras();

  const structure = createGroupNode(
    [...floorAndPlatform(), ...ceilingFeature(), glassWall(), sideWall("LEFT"), sideWall("RIGHT")],
    { name: "STRUCTURE" },
  );

  return createSet3dLayer(
    [
      createGroupNode(
        [structure, exteriorEnvironment(), brandingSurfaces(), lightAnchors(), guides()],
        { name: "VIRTUAL_SET_MODERN_STADIUM_GLASS_03" },
      ),
      ...softLights(),
      ...camNodes,
    ],
    {
      name: "Modern Stadium Glass Studio",
      activeCameraId: activeId,
      environment: {
        background: "#0c0e14",
        floor: {
          enabled: true,
          color: FLOOR_GREY,
          metalness: 0.24,
          roughness: 0.42,
          size: 24,
          reflector: { enabled: true, resolution: 512, mixStrength: 0.2, mirror: 0.08 },
        },
        grid: false,
        ambient: { color: "#c8d6e6", intensity: 0.28 },
      },
      render: {
        exposure: 1.05,
        bloom: { enabled: true, intensity: 0.2, threshold: 1.1 },
        envLight: { enabled: true, intensity: 0.5 },
      },
    },
  );
}
