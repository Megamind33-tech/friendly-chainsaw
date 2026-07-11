import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  configureDisplayTexture,
  applySurfaceDisplaySettings,
  fitImagePlaneSize,
  getTextureImageSize,
  resolveDisplayImageUrl,
  textureLoaderWithCors,
} from "./displayTextures";
import type { SurfaceDisplaySettings } from "@/document/types";
import { useArMotionRef } from "./arMotionContext";

const MOUNT_COLOR = "#2a3548";
const BRIGHTNESS = 1.35;

/** Dark mount when no image is assigned or the URL failed to load. */
export function ImageSlotPlaceholder({ backingColor = MOUNT_COLOR }: { backingColor?: string }) {
  const color = useMemo(() => new THREE.Color(backingColor), [backingColor]);
  return (
    <mesh>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function useRobustDisplayTexture(src: string) {
  const gl = useThree((s) => s.gl);
  const displaySrc = useMemo(() => resolveDisplayImageUrl(src), [src]);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!displaySrc) {
      setTexture(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const loader = textureLoaderWithCors();
    setFailed(false);
    setTexture(null);
    loader.load(
      displaySrc,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        configureDisplayTexture(loaded, gl.capabilities.getMaxAnisotropy());
        setTexture(loaded);
        setFailed(false);
      },
      undefined,
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [displaySrc, gl]);

  return { texture, failed, loading: !!displaySrc && !texture && !failed };
}

/**
 * AR image slot — reads real pixel dimensions, scales geometry to fill the
 * slot (cover) or fit inside (contain), and displays at full unlit brightness.
 */
export function ArImagePlaneView({
  src,
  slotAspect,
  opacity = 1,
  backingColor = MOUNT_COLOR,
  hintAspect,
  fit = "cover",
  fill = 1.06,
  display,
}: {
  src: string;
  slotAspect: number;
  opacity?: number;
  backingColor?: string;
  hintAspect?: number;
  fit?: "contain" | "cover" | "stretch";
  /** Slight overscan so cover-fill reads edge-to-edge (1 = exact). */
  fill?: number;
  display?: SurfaceDisplaySettings;
}) {
  const { texture, failed, loading } = useRobustDisplayTexture(src);
  const fitPlane = (aspect: number): [number, number] => {
    if ((display?.fit ?? fit) !== "contain") return [1, 1];
    const [w, h] = fitImagePlaneSize(aspect, slotAspect, "contain");
    return [w * fill, h * fill];
  };
  const [geom, setGeom] = useState<[number, number]>(() => {
    if (hintAspect && hintAspect > 0) return fitPlane(hintAspect);
    return [1, 1];
  });

  useEffect(() => {
    const size = texture ? getTextureImageSize(texture) : null;
    if (size) {
      setGeom(fitPlane(size.width / size.height));
    } else if (hintAspect && hintAspect > 0) {
      setGeom(fitPlane(hintAspect));
    }
  }, [texture, slotAspect, hintAspect, fit, fill, display?.fit]);

  useEffect(() => {
    const size = texture ? getTextureImageSize(texture) : null;
    const aspect = size ? size.width / size.height : hintAspect;
    if (!texture || !aspect) return;
    applySurfaceDisplaySettings(texture, aspect, slotAspect, display ?? { fit, overscan: fill });
  }, [texture, hintAspect, slotAspect, fit, fill, display]);

  const backing = useMemo(() => new THREE.Color(backingColor), [backingColor]);
  const displayColor = useMemo(() => new THREE.Color(BRIGHTNESS, BRIGHTNESS, BRIGHTNESS), []);
  const motionRef = useArMotionRef();
  const imageMeshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const mesh = imageMeshRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const o = opacity * (display?.opacity ?? 1) * motionRef.current.opacity;
    if (Math.abs(mat.opacity - o) > 0.001) {
      mat.opacity = o;
      mat.transparent = o < 0.999;
    }
  });

  if (failed) return <ImageSlotPlaceholder backingColor={backingColor} />;

  return (
    <>
      <mesh position={[0, 0, -0.003]} renderOrder={0}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={backing} toneMapped={false} />
      </mesh>
      {texture ? (
        <mesh ref={imageMeshRef} position={[0, 0, 0.004]} renderOrder={2}>
          <planeGeometry args={geom} />
          <meshBasicMaterial
            map={texture}
            color={displayColor}
            transparent={opacity < 1}
            opacity={opacity}
            toneMapped={false}
            side={THREE.DoubleSide}
            depthWrite
            depthTest
          />
        </mesh>
      ) : loading ? (
        <mesh position={[0, 0, 0.002]} renderOrder={1}>
          <planeGeometry args={[0.94, 0.94]} />
          <meshBasicMaterial color="#3a4a62" toneMapped={false} />
        </mesh>
      ) : null}
    </>
  );
}
