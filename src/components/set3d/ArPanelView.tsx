import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { MaterialProps, PrimitiveNode } from "@/document/types";
import { useArMotionRef } from "./arMotionContext";
import { usePrismGeometry } from "./prismGeometry";

const BASE_BOOST = 1.2;

/** Readable broadcast panel color — unlit so studio lighting can't crush it. */
export function resolveArPanelColor(m: MaterialProps): THREE.Color {
  const useEmissive = (m.emissiveIntensity ?? 0) > 0.05 && m.emissive;
  const c = new THREE.Color(useEmissive ? m.emissive! : m.color);
  const boost = BASE_BOOST + (m.emissiveIntensity ?? 0.45) * 0.9;
  c.multiplyScalar(boost);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return c;
}

/** AR chrome panels — meshBasicMaterial at boosted brightness (not PBR-dark). */
export function ArPanelView({ node }: { node: PrimitiveNode }) {
  const m = node.material;
  const color = useMemo(() => resolveArPanelColor(m), [m.color, m.emissive, m.emissiveIntensity]);
  const baseOpacity = m.opacity ?? node.opacity ?? 1;
  const motionRef = useArMotionRef();
  const meshRef = useRef<THREE.Mesh>(null);
  const prismGeometry = usePrismGeometry(node);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const o = baseOpacity * motionRef.current.opacity;
    if (Math.abs(mat.opacity - o) > 0.001) {
      mat.opacity = o;
      mat.transparent = o < 0.999;
    }
  });
  const mat = (
    <meshBasicMaterial color={color} transparent toneMapped={false} opacity={baseOpacity} side={node.shape === "plane" ? THREE.DoubleSide : THREE.FrontSide} />
  );

  switch (node.shape) {
    case "box":
      return (
        <mesh ref={meshRef}>
          <boxGeometry args={[1, 1, 1]} />
          {mat}
        </mesh>
      );
    case "sphere":
      return (
        <mesh ref={meshRef}>
          <sphereGeometry args={[0.5, 24, 12]} />
          {mat}
        </mesh>
      );
    case "cylinder":
      return (
        <mesh ref={meshRef}>
          <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
          {mat}
        </mesh>
      );
    case "plane":
      return (
        <mesh ref={meshRef}>
          <planeGeometry args={[1, 1]} />
          {mat}
        </mesh>
      );
    case "prism":
      if (!prismGeometry) {
        return (
          <mesh ref={meshRef}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#ff00ff" wireframe />
          </mesh>
        );
      }
      return (
        <mesh ref={meshRef} geometry={prismGeometry}>
          {mat}
        </mesh>
      );
    default:
      return null;
  }
}
