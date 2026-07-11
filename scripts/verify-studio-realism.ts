import * as THREE from "three";
import { projectSchema } from "../src/document/schema";
import { createDefaultProject } from "../src/document/factory";
import type { SetNode } from "../src/document/types";
import { createModernStadiumGlassStudio } from "../src/sets/modernStadiumGlassStudio";
import { SET_BUILDERS } from "../src/sets/studioSets";
import {
  analyseSurfaceResolution,
  applySurfaceDisplaySettings,
  resolveTextureEdgeBudget,
} from "../src/components/set3d/displayTextures";

let failures = 0;
function check(name: string, ok: boolean): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

function flatten(nodes: SetNode[]): SetNode[] {
  return nodes.flatMap((node) => [node, ...(node.kind === "group" ? flatten(node.children) : [])]);
}

const layer = createModernStadiumGlassStudio();
if (layer.props.kind !== "set3d") throw new Error("stadium builder did not emit set3d");
const nodes = flatten(layer.props.nodes);
check("unique stadium node IDs", new Set(nodes.map((node) => node.id)).size === nodes.length);
check("three-light base rig", nodes.filter((node) => node.kind === "light").length === 3);
check("camera bookmarks resolve", !!layer.props.activeCameraId && nodes.some((node) => node.kind === "camera" && node.id === layer.props.activeCameraId));
check("media slots are explicit", nodes.some((node) => node.slotKind === "media" && !!node.slotLabel));
check("custom backdrop slot exists", nodes.some((node) => node.name === "CUSTOM_BACKDROP_SLOT" && node.slotKind === "media"));
check("day/evening/night environments exist", ["DAY", "EVENING", "NIGHT"].every((mode) => nodes.some((node) => node.name === `STADIUM_ENV_${mode}`)));
check("glass uses physical transmission", nodes.some((node) => node.kind === "primitive" && node.name.startsWith("GLASS_PANEL_") && (node.material.transmission ?? 0) > 0.5));
check("rounded architecture exists", nodes.some((node) => node.kind === "primitive" && node.shape === "roundedBox"));

for (const builder of SET_BUILDERS) {
  const candidate = builder.create();
  if (candidate.props.kind !== "set3d") {
    check(`${builder.id}: set3d layer`, false);
    continue;
  }
  const candidateNodes = flatten(candidate.props.nodes);
  check(
    `${builder.id}: branding surface`,
    candidateNodes.some((node) => node.slotKind === "branding" && !!node.slotLabel),
  );
  check(
    `${builder.id}: media surface`,
    candidateNodes.some((node) => node.slotKind === "media" && !!node.slotLabel),
  );
  check(
    `${builder.id}: restrained floor mirror`,
    (candidate.props.environment.floor.reflector?.mirror ?? 0) <= 0.12,
  );
}

const project = createDefaultProject("studio-realism-verify");
project.scenes[0].layers.push(layer);
project.assets.push({
  id: "media-4k",
  kind: "video",
  name: "wall.mp4",
  src: "/assets/wall.mp4",
  videoWidth: 3840,
  videoHeight: 2160,
  optimizedSrc: "/assets/wall.2048.webm",
  optimizedMaxEdge: 2048,
});
const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project)));
const parsedAsset = parsed.assets.find((asset) => asset.id === "media-4k");
check("asset dimensions round-trip", parsedAsset?.videoWidth === 3840 && parsedAsset.videoHeight === 2160);
check("optimized references round-trip", parsedAsset?.optimizedMaxEdge === 2048);
const parsedNodes = parsed.scenes.flatMap((scene) => scene.layers.flatMap((candidate) => candidate.props.kind === "set3d" ? flatten(candidate.props.nodes) : []));
check("surface metadata round-trips", parsedNodes.some((node) => node.slotKind === "media" && node.display?.fit === "cover"));
check("physical glass controls round-trip", parsedNodes.some((node) => node.kind === "primitive" && (node.material.transmission ?? 0) > 0));

check("tier budgets are 1024/2048/4096", resolveTextureEdgeBudget("low") === 1024 && resolveTextureEdgeBudget("medium") === 2048 && resolveTextureEdgeBudget("high") === 4096);
const diagnosis = analyseSurfaceResolution(800, 450, 1920, 1080, "medium");
check("undersized source warning", diagnosis.undersized);

const texture = new THREE.Texture();
applySurfaceDisplaySettings(texture, 16 / 9, 1, {
  fit: "cover",
  crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
  anchor: "right",
  overscan: 1.02,
});
check("fit/crop creates finite UV matrix", texture.matrix.elements.every(Number.isFinite));
check("fit/crop modifies UV matrix", !texture.matrix.equals(new THREE.Matrix3()));

if (failures) {
  console.error(`\n${failures} studio realism verification(s) failed.`);
  process.exit(1);
}
console.log("\nStudio realism and intelligent media verification passed.");
