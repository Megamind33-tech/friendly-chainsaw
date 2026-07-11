import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { PrimitiveNode } from "@/document/types";

/**
 * Real extruded-polygon geometry for the `prism` primitive — chamfered
 * frames, arches, shields and stepped plinths as genuine meshes with real
 * bevels, never a flat plane faking depth with a texture.
 *
 * Convention: `outline` is authored in real local units (the silhouette IS
 * the outline, unlike the unit-cube primitives) and the extrusion runs along
 * local Z with a total depth of 1 so `transform.scale.z` sets the physical
 * thickness, matching every other primitive's scale semantics. `bevel` is a
 * WORLD-unit chamfer: its through-depth is divided by scale.z inside the
 * geometry so the finished bevel reads at the authored size regardless of
 * how thin the panel is.
 */
export function buildPrismGeometry(
  outline: { x: number; y: number }[],
  holeOutline: { x: number; y: number }[] | undefined,
  bevel: number,
  scaleZ: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  if (holeOutline && holeOutline.length >= 3) {
    shape.holes.push(new THREE.Path(holeOutline.map((p) => new THREE.Vector2(p.x, p.y))));
  }
  const sz = Math.abs(scaleZ) > 1e-6 ? Math.abs(scaleZ) : 1;
  const bevelEnabled = bevel > 0;
  // World bevel depth == `bevel`: compensate for the z-scale the node applies.
  const bevelThickness = bevelEnabled ? Math.min(bevel / sz, 0.45) : 0;
  const depth = Math.max(0.05, 1 - 2 * bevelThickness);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 16,
    bevelEnabled,
    bevelThickness,
    bevelSize: bevel,
    // Pull the bevel inward so the silhouette stays exactly the authored
    // outline (a mitered frame edge), instead of growing past it.
    bevelOffset: bevelEnabled ? -bevel : 0,
    bevelSegments: 1,
  });
  // Center on z so the mesh spans [-0.5, 0.5] pre-scale like a unit box.
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Stable memo key for a prism's geometry inputs. */
export function prismGeometryKey(node: PrimitiveNode): string {
  return JSON.stringify([node.outline, node.holeOutline, node.bevel ?? 0, node.transform.scale.z]);
}

/** Memoized, disposed-on-change prism geometry for render components.
 * Returns null for non-prism nodes or a missing/degenerate outline (callers
 * render the honest magenta-wireframe failure box, never silence). */
export function usePrismGeometry(node: PrimitiveNode): THREE.BufferGeometry | null {
  const key = node.shape === "prism" ? prismGeometryKey(node) : "";
  const geometry = useMemo(() => {
    if (node.shape !== "prism" || !node.outline || node.outline.length < 3) return null;
    return buildPrismGeometry(node.outline, node.holeOutline, node.bevel ?? 0, node.transform.scale.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures every geometry input
  }, [key]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}
