import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { SetNode } from "@/document/types";
import { buildPrismGeometry } from "@/components/set3d/prismGeometry";

/**
 * Real GLB export for the Sports AR Models — converts the SetNode tree into
 * genuine three.js geometry (the same prism/box/cylinder shapes the live
 * renderer draws) and runs it through three's own GLTFExporter. Content
 * zones export as NAMED EMPTY nodes: a template GLB carries structure and
 * anchor points, never baked words or images — matching the empty-by-default
 * contract of the library.
 */

function materialFor(node: Extract<SetNode, { kind: "primitive" }>): THREE.MeshStandardMaterial {
  const m = node.material;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(m.color),
    metalness: m.metalness,
    roughness: m.roughness,
  });
  if (m.emissive && (m.emissiveIntensity ?? 0) > 0) {
    mat.emissive = new THREE.Color(m.emissive);
    mat.emissiveIntensity = m.emissiveIntensity ?? 1;
  }
  const opacity = m.opacity ?? 1;
  if (opacity < 1) {
    mat.transparent = true;
    mat.opacity = opacity;
  }
  return mat;
}

function geometryFor(node: Extract<SetNode, { kind: "primitive" }>): THREE.BufferGeometry | null {
  switch (node.shape) {
    case "box":
    case "roundedBox":
      return new THREE.BoxGeometry(1, 1, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 16);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "prism":
      if (!node.outline || node.outline.length < 3) return null;
      return buildPrismGeometry(node.outline, node.holeOutline, node.bevel ?? 0, node.transform.scale.z);
    default:
      return null;
  }
}

const DEG = Math.PI / 180;

export function setNodeToObject3D(node: SetNode): THREE.Object3D | null {
  let obj: THREE.Object3D | null = null;
  if (node.kind === "group") {
    const g = new THREE.Group();
    for (const child of node.children) {
      const c = setNodeToObject3D(child);
      if (c) g.add(c);
    }
    obj = g;
  } else if (node.kind === "primitive") {
    // Unfilled branding slots (logo/photo zones) are ANCHORS, not visuals —
    // exported as named empties so the GLB carries no fake dark plates.
    if (node.slotKind === "branding" && !node.textureAssetId) {
      obj = new THREE.Group();
    } else {
      const geometry = geometryFor(node);
      obj = geometry ? new THREE.Mesh(geometry, materialFor(node)) : new THREE.Group();
    }
  } else if (node.kind === "text3d") {
    // Zones/anchors: a named empty — never baked text in a template GLB.
    obj = new THREE.Group();
  } else {
    // lights/cameras/feeds are app-runtime concerns, exported as empties so
    // hierarchy positions survive a round trip.
    obj = new THREE.Group();
  }
  obj.name = node.name;
  obj.visible = node.visible;
  obj.position.set(node.transform.position.x, node.transform.position.y, node.transform.position.z);
  obj.rotation.set(node.transform.rotation.x * DEG, node.transform.rotation.y * DEG, node.transform.rotation.z * DEG);
  obj.scale.set(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z);
  return obj;
}

/** Export a model root to GLB bytes. Works in the app AND under bun (no DOM
 * needed for untextured geometry). */
export async function exportSetNodeGlb(root: SetNode): Promise<ArrayBuffer> {
  const scene = new THREE.Scene();
  const obj = setNodeToObject3D(root);
  if (obj) scene.add(obj);
  const exporter = new GLTFExporter();
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("GLTFExporter returned JSON for a binary export"));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    );
  });
}

/** Browser helper: export + download as <id>.glb. */
export async function downloadSetNodeGlb(root: SetNode, filename: string): Promise<void> {
  const bytes = await exportSetNodeGlb(root);
  const blob = new Blob([bytes], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".glb") ? filename : `${filename}.glb`;
  a.click();
  URL.revokeObjectURL(url);
}
