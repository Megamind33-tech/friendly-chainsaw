import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, OrbitControls, TransformControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useDocStore, findSetNode } from "@/document/store";
import type { ID, Layer, SetNode, Transform3D } from "@/document/types";
import { resolveDpr } from "@/document/qualityTiers";
import { SetEnvironmentView, SetNodesView } from "./SetNodes";
import { RenderSettingsApplier, SetPostEffects } from "./Set3dRenderer";

const RAD2DEG = 180 / Math.PI;

/** Live selection bounding box (Unreal/Unity-style highlight). BoxHelper
 * tracks the object's world AABB; updated per frame so it follows gizmo
 * drags in real time. */
function SelectionBox({ object }: { object: THREE.Object3D }) {
  const helper = useMemo(() => new THREE.BoxHelper(object, 0x4a90d9), [object]);
  useFrame(() => helper.update());
  useEffect(() => () => helper.dispose(), [helper]);
  return <primitive object={helper} />;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/**
 * Interactive consumer of the shared SetNodes mapping — the 3D counterpart
 * of GfxEditor. Orbit navigation, click-to-pick, and a real transform gizmo
 * (translate/rotate/scale) on the picked node: models, primitives, lights,
 * cameras, and video-feed surfaces are all manipulated the same way.
 *
 * DCC-standard keyboard tools (skipped while typing in a field):
 *   W/E/R — move/rotate/scale · F — frame selected · Del — delete · Esc — deselect
 *
 * Undo granularity: TransformControls mutates the three.js object directly
 * during the drag (never the store), and the store is written exactly once
 * on mouse-up — so one completed drag is naturally one undo entry.
 */
export function Set3dEditor({
  sceneId,
  layer,
  editableNodeIds,
  disableGizmo = false,
}: {
  sceneId: ID;
  layer: Layer;
  editableNodeIds?: ReadonlySet<ID>;
  /** View-only orbit + pick — no TransformControls (use AR Author panel for moves). */
  disableGizmo?: boolean;
}) {
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);
  const gizmoMode = useDocStore((s) => s.gizmoMode);
  /** Double-click detection for group-vs-leaf picking (see onPick). */
  const lastPickRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const selectSetNode = useDocStore((s) => s.selectSetNode);
  const toggleSetNodeSelection = useDocStore((s) => s.toggleSetNodeSelection);
  const setGizmoMode = useDocStore((s) => s.setGizmoMode);
  const commitNodeTransform = useDocStore((s) => s.commitNodeTransform);
  const removeSetNode = useDocStore((s) => s.removeSetNode);
  const project = useDocStore((s) => s.project);
  const programSceneId = useDocStore((s) => s.programSceneId);
  const previewSceneId = useDocStore((s) => s.previewSceneId);
  const assets = project?.assets ?? [];
  const isEditableNodeId = useCallback(
    (nodeId: ID | null | undefined) => (nodeId ? (editableNodeIds ? editableNodeIds.has(nodeId) : true) : false),
    [editableNodeIds],
  );

  // node id → live three.js object, maintained by ref callbacks from
  // SetNodeView. A plain ref (not state) — registration happens every
  // commit; only selection changes need a re-render, handled below.
  const objects = useRef(new Map<string, THREE.Object3D>());
  const [attached, setAttached] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const registerObject = useCallback(
    (nodeId: string, object: THREE.Object3D | null) => {
      if (object) objects.current.set(nodeId, object);
      else objects.current.delete(nodeId);
      // The selected node's object can (re)mount after selection happens —
      // e.g. picking a node that React then re-keys. Keep the gizmo attached.
      setAttached((current) => {
        const next = isEditableNodeId(selectedNodeId) ? (objects.current.get(selectedNodeId!) ?? null) : null;
        return next === current ? current : next;
      });
    },
    [selectedNodeId, isEditableNodeId],
  );

  useEffect(() => {
    setAttached(isEditableNodeId(selectedNodeId) ? (objects.current.get(selectedNodeId!) ?? null) : null);
  }, [selectedNodeId, isEditableNodeId]);

  const props = layer.props.kind === "set3d" ? layer.props : null;
  const selectedNode = props && isEditableNodeId(selectedNodeId) ? findSetNode(props.nodes, selectedNodeId!) : undefined;
  const selectedLocked = !!selectedNode?.locked || layer.locked;

  // DCC keyboard tools. Window-level so the viewport doesn't need focus,
  // but never while the operator is typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "w":
        case "W":
          if (!disableGizmo) setGizmoMode("translate");
          break;
        case "e":
        case "E":
          if (!disableGizmo) setGizmoMode("rotate");
          break;
        case "r":
        case "R":
          if (!disableGizmo) setGizmoMode("scale");
          break;
        case "Escape":
          selectSetNode(null);
          break;
        case "Delete":
        case "Backspace":
          if (isEditableNodeId(selectedNodeId) && !selectedLocked) removeSetNode(sceneId, layer.id, selectedNodeId!);
          break;
        case "f":
        case "F": {
          const controls = controlsRef.current;
          if (controls && attached) {
            attached.getWorldPosition(controls.target);
            controls.update();
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sceneId, layer.id, selectedNodeId, selectedLocked, attached, disableGizmo, setGizmoMode, selectSetNode, removeSetNode, isEditableNodeId]);

  if (!props) return null;
  const { nodes, environment, activeCameraId, render } = props;
  const gizmoActive = !disableGizmo && attached && selectedNode && !selectedLocked;

  const commitFromObject = () => {
    if (!attached || !isEditableNodeId(selectedNodeId)) return;
    const t: Transform3D = {
      position: { x: attached.position.x, y: attached.position.y, z: attached.position.z },
      rotation: {
        x: attached.rotation.x * RAD2DEG,
        y: attached.rotation.y * RAD2DEG,
        z: attached.rotation.z * RAD2DEG,
      },
      scale: { x: attached.scale.x, y: attached.scale.y, z: attached.scale.z },
    };
    commitNodeTransform(sceneId, layer.id, selectedNodeId!, t);
  };

  return (
    <Canvas
      shadows={render.shadows}
      dpr={resolveDpr(render)}
      camera={{ position: [6, 4, 8], fov: 50, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onPointerMissed={() => selectSetNode(null)}
      className="h-full w-full"
    >
      <RenderSettingsApplier exposure={render.exposure} shadows={render.shadows} />
      <SetEnvironmentView environment={environment} render={render} assets={assets} />
      <SetNodesView
        nodes={nodes}
        ctx={{
          interactive: true,
          assets,
          render,
          activeCameraId,
          onPick: (nodeId, additive) => {
            if (!isEditableNodeId(nodeId)) return;
            const pickedNode = findSetNode(nodes, nodeId);
            // Branding/media/data surfaces are operator controls, not merely
            // geometry. Pick them directly on one click even inside a wall
            // group so source assignment does not require double-click drill.
            if (pickedNode?.slotKind) {
              if (additive) toggleSetNodeSelection(nodeId);
              else selectSetNode(nodeId);
              lastPickRef.current = { id: null, at: 0 };
              return;
            }
            // Group-first picking (DCC convention): clicking any part of a
            // multi-node graphic selects its OUTERMOST group so the whole
            // graphic moves as one; clicking again while that group (or
            // anything inside it) is selected drills down to the leaf.
            const path: string[] = [];
            const walk = (list: SetNode[], trail: string[]): boolean => {
              for (const n of list) {
                if (n.id === nodeId) {
                  path.push(...trail, n.id);
                  return true;
                }
                if (n.kind === "group" && walk(n.children, [...trail, n.id])) return true;
              }
              return false;
            };
            walk(nodes, []);
            const outermostGroup = path.length > 1 ? path[0] : null;
            const pickTarget =
              outermostGroup && isEditableNodeId(outermostGroup) ? outermostGroup : nodeId;
            // Shift/Ctrl-click: toggle the whole graphic in/out of the
            // multi-selection (for GROUP) — never drills.
            if (additive) {
              toggleSetNodeSelection(pickTarget);
              lastPickRef.current = { id: null, at: 0 };
              return;
            }
            // Drill into the leaf ONLY on a quick double-click — a plain
            // re-click (e.g. grabbing the graphic to gizmo-drag it) must keep
            // the group selected, otherwise dragging keeps "losing" the group.
            const now = Date.now();
            const isDoubleClick = lastPickRef.current.id === nodeId && now - lastPickRef.current.at < 350;
            lastPickRef.current = { id: nodeId, at: now };
            selectSetNode(!isDoubleClick ? pickTarget : nodeId);
          },
          isPickable: (node) => isEditableNodeId(node.id),
          registerObject,
          project,
          programSceneId,
          previewSceneId,
          confidenceDepth: 0,
        }}
      />
      {attached && <SelectionBox object={attached} />}
      {gizmoActive && (
        <TransformControls object={attached} mode={gizmoMode} onMouseUp={commitFromObject} />
      )}
      {/* makeDefault lets TransformControls auto-disable orbiting mid-drag. */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!disableGizmo}
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 + 0.15}
        target={[0, 1, 0]}
      />
      {/* The DCC orientation gizmo — axis cube in the viewport corner. */}
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={["#c84b4b", "#4bc86a", "#4a90d9"]} labelColor="#e8e8f0" />
      </GizmoHelper>
      <SetPostEffects render={render} />
    </Canvas>
  );
}
