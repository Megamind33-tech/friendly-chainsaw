import * as THREE from "three";
import { SPORTS_AR_MODELS } from "@/ar-engine/sportsPanels";
import { setNodeToObject3D } from "@/ar-engine/sportsPanels/glbExport";

/**
 * Dev-only thumbnail harness (thumbnails.html) — renders each Sports AR
 * model's REAL geometry (the same setNodeToObject3D the GLB export uses,
 * so the thumbnail can never show something the asset isn't) through a
 * broadcast-style three-point light rig at a 3/4 hero angle.
 * `window.renderSportsArThumbnails()` returns { modelId: pngDataUrl }.
 */

const SIZE = 512;

function renderModel(renderer: THREE.WebGLRenderer, modelIndex: number): string {
  const model = SPORTS_AR_MODELS[modelIndex];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10141c");

  const root = setNodeToObject3D(model.build());
  if (!root) throw new Error(`${model.id}: no object`);
  scene.add(root);

  // Broadcast three-point rig + soft ambient.
  const key = new THREE.DirectionalLight("#ffffff", 2.6);
  key.position.set(2.5, 3.2, 4);
  const fill = new THREE.DirectionalLight("#9fb4d8", 1.1);
  fill.position.set(-3, 1.6, 2.5);
  const rim = new THREE.DirectionalLight("#dfe8ff", 1.4);
  rim.position.set(0, 2.2, -4);
  scene.add(key, fill, rim, new THREE.AmbientLight("#3a4358", 1.2));

  // Frame the model: 3/4 hero angle fitted to its real bounds.
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.12;
  camera.position.set(
    center.x + dist * Math.sin(0.5) * Math.cos(0.32),
    center.y + dist * Math.sin(0.32),
    center.z + dist * Math.cos(0.5) * Math.cos(0.32),
  );
  camera.lookAt(center);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");

  // Dispose everything — ten renders share one WebGL context.
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
    }
  });
  return url;
}

declare global {
  interface Window {
    renderSportsArThumbnails: () => Record<string, string>;
  }
}

window.renderSportsArThumbnails = () => {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const out: Record<string, string> = {};
  for (let i = 0; i < SPORTS_AR_MODELS.length; i++) {
    out[SPORTS_AR_MODELS[i].id] = renderModel(renderer, i);
  }
  renderer.dispose();
  return out;
};
