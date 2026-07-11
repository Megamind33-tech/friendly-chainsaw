import { useState } from "react";
import { useDocStore } from "@/document/store";
import { createCameraNode } from "@/document/factory";
import type { CameraNode, ID, Layer, SetNode, Transform3D } from "@/document/types";
import { Input } from "@/components/ui/input";
import { Video, Plus, Trash2 } from "lucide-react";

/**
 * The vMix-style virtual camera surface: every camera node in the scene's
 * 3D sets, with live angle control (pan/tilt/roll, position, height, FOV),
 * PVW rehearsal (see the shot in the Preview window before committing),
 * smooth TAKE / hard CUT to program, and camera automation on the live
 * camera — push-in/pull-back, truck left/right, orbit/follow/focus around
 * the selected 3D node. Backed by the exact same camera nodes the viewport
 * gizmo edits — the two surfaces can never disagree.
 */

interface CameraRef {
  layer: Layer;
  camera: CameraNode;
}

function collectCameras(nodes: SetNode[], layer: Layer, out: CameraRef[]) {
  for (const node of nodes) {
    if (node.kind === "camera") out.push({ layer, camera: node });
    if (node.kind === "group") collectCameras(node.children, layer, out);
  }
}

/** Transition settings shared by every TAKE in the panel. Local UI state —
 * a control-surface knob, not document content. */
interface TransitionPrefs {
  durationSec: number;
  ease: string;
}

const EASE_CHOICES: { id: string; label: string }[] = [
  { id: "power2.inOut", label: "SMOOTH" },
  { id: "power3.inOut", label: "CINE" },
  { id: "none", label: "LINEAR" },
];

/** Slider + number input pair — scrub with the slider, type for precision. */
function AxisControl({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-11 shrink-0 font-mono text-[9px] uppercase text-text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 accent-[#4a90d9]"
      />
      <Input
        type="number"
        step={step}
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-16 shrink-0 border-border-subtle bg-bg-surface px-1 text-[10px] text-text-muted-alt"
      />
    </div>
  );
}

function MoveButton({
  label,
  title,
  disabled,
  active,
  onClick,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded border px-1.5 py-1 font-mono text-[9px] font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-accent-blue bg-accent-blue/15 text-accent-blue-bright"
          : "border-border-subtle text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
      }`}
    >
      {label}
    </button>
  );
}

function CameraRow({
  sceneId,
  layer,
  camera,
  prefs,
}: {
  sceneId: ID;
  layer: Layer;
  camera: CameraNode;
  prefs: TransitionPrefs;
}) {
  const commitNodeTransform = useDocStore((s) => s.commitNodeTransform);
  const updateSetNode = useDocStore((s) => s.updateSetNode);
  const removeSetNode = useDocStore((s) => s.removeSetNode);
  const setActiveSetCamera = useDocStore((s) => s.setActiveSetCamera);
  const takeCameraSmooth = useDocStore((s) => s.takeCameraSmooth);
  const setCameraPreview = useDocStore((s) => s.setCameraPreview);
  const previewedCameraId = useDocStore((s) => s.cameraPreview[layer.id] ?? null);
  const selectSetNode = useDocStore((s) => s.selectSetNode);

  const isProgram = layer.props.kind === "set3d" && layer.props.activeCameraId === camera.id;
  const isPreviewed = previewedCameraId === camera.id;
  const t = camera.transform;

  const setTransform = (updates: Partial<Transform3D>) =>
    commitNodeTransform(sceneId, layer.id, camera.id, { ...t, ...updates });

  return (
    <div
      className={`rounded border bg-bg-panel ${isProgram ? "border-live-red" : isPreviewed ? "border-accent-blue" : "border-border-subtle"}`}
      onClick={() => selectSetNode(camera.id)}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isProgram ? "bg-live-red shadow-[0_0_6px_#cc2222]" : isPreviewed ? "bg-accent-blue shadow-[0_0_6px_#2a6fb0]" : "bg-bg-surface"}`}
          title={isProgram ? "ON PROGRAM" : isPreviewed ? "rehearsing in Preview" : "idle"}
        />
        <Input
          value={camera.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateSetNode(sceneId, layer.id, camera.id, { name: e.target.value })}
          className="h-6 min-w-0 flex-1 border-transparent bg-transparent px-1 font-mono text-[11px] text-text-muted-alt focus:border-border-subtle focus:bg-bg-surface"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCameraPreview(layer.id, isPreviewed ? null : camera.id);
          }}
          className={`rounded border px-1.5 py-1 font-mono text-[10px] font-bold ${
            isPreviewed
              ? "border-accent-blue bg-accent-blue/15 text-accent-blue-bright"
              : "border-border-subtle text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
          }`}
          title={
            isPreviewed
              ? "Rehearsing in the Preview window — click to release"
              : "Rehearse this shot in the Preview window without touching Program"
          }
        >
          PVW
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isProgram) takeCameraSmooth(sceneId, layer.id, camera.id, prefs.durationSec, prefs.ease);
          }}
          disabled={isProgram}
          className="rounded border border-border-subtle px-1.5 py-1 font-mono text-[10px] font-bold text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright disabled:cursor-not-allowed disabled:opacity-35"
          title={`Fly Program to this camera over ${prefs.durationSec.toFixed(1)}s`}
        >
          TAKE
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isProgram) setActiveSetCamera(sceneId, layer.id, null);
            else takeCameraSmooth(sceneId, layer.id, camera.id, 0, prefs.ease);
          }}
          className={`rounded border px-2 py-1 font-mono text-[10px] font-bold ${
            isProgram
              ? "border-live-red bg-live-red/15 text-live-red"
              : "border-border-subtle text-text-muted-alt hover:border-live-red hover:text-live-red"
          }`}
          title={isProgram ? "On program — click to release" : "Hard-cut this camera to program"}
        >
          {isProgram ? "● LIVE" : "CUT"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeSetNode(sceneId, layer.id, camera.id);
          }}
          title="Delete camera"
          className="rounded p-1 text-text-muted hover:bg-live-red/20 hover:text-live-red"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1 border-t border-border-subtle px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <AxisControl label="Pan" value={t.rotation.y} min={-180} max={180} step={1} onChange={(v) => setTransform({ rotation: { ...t.rotation, y: v } })} />
        <AxisControl label="Tilt" value={t.rotation.x} min={-89} max={89} step={1} onChange={(v) => setTransform({ rotation: { ...t.rotation, x: v } })} />
        <AxisControl label="Roll" value={t.rotation.z} min={-180} max={180} step={1} onChange={(v) => setTransform({ rotation: { ...t.rotation, z: v } })} />
        <AxisControl label="X" value={t.position.x} min={-20} max={20} onChange={(v) => setTransform({ position: { ...t.position, x: v } })} />
        <AxisControl label="Height" value={t.position.y} min={0} max={12} onChange={(v) => setTransform({ position: { ...t.position, y: v } })} />
        <AxisControl label="Z" value={t.position.z} min={-20} max={20} onChange={(v) => setTransform({ position: { ...t.position, z: v } })} />
        <AxisControl label="FOV" value={camera.fov} min={15} max={120} step={1} onChange={(v) => updateSetNode(sceneId, layer.id, camera.id, { fov: v })} />
      </div>
    </div>
  );
}

/** Automation on the LIVE program camera of one set layer: dolly, truck,
 * orbit/follow/focus around the currently-selected 3D node. */
function CameraMovesBar({ sceneId, layer }: { sceneId: ID; layer: Layer }) {
  const nudgeProgramCamera = useDocStore((s) => s.nudgeProgramCamera);
  const focusProgramCamera = useDocStore((s) => s.focusProgramCamera);
  const startCameraOrbit = useDocStore((s) => s.startCameraOrbit);
  const stopCameraOrbit = useDocStore((s) => s.stopCameraOrbit);
  const orbit = useDocStore((s) => s.cameraOrbits[layer.id] ?? null);
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);

  const props = layer.props.kind === "set3d" ? layer.props : null;
  const hasLiveCamera = !!props?.activeCameraId;
  // Orbit/follow/focus pivot on the selected node; a camera can't be its own subject.
  const selectedNode = selectedNodeId && props ? findNodeIn(props.nodes, selectedNodeId) : null;
  const subjectId = selectedNode && selectedNode.kind !== "camera" ? selectedNode.id : null;

  const needCam = "Cut a camera to program first";
  const needSubject = "Select a non-camera node (viewport or outliner) as the subject first";

  return (
    <div className="space-y-1 rounded border border-border-subtle bg-bg-panel px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
        Camera moves — live camera
      </div>
      <div className="flex flex-wrap gap-1">
        <MoveButton
          label="PUSH IN"
          title={hasLiveCamera ? "Dolly the live camera toward the subject" : needCam}
          disabled={!hasLiveCamera}
          onClick={() => nudgeProgramCamera(sceneId, layer.id, "push")}
        />
        <MoveButton
          label="PULL BACK"
          title={hasLiveCamera ? "Dolly the live camera away" : needCam}
          disabled={!hasLiveCamera}
          onClick={() => nudgeProgramCamera(sceneId, layer.id, "pull")}
        />
        <MoveButton
          label="◀ SLIDE"
          title={hasLiveCamera ? "Truck the live camera left" : needCam}
          disabled={!hasLiveCamera}
          onClick={() => nudgeProgramCamera(sceneId, layer.id, "slideLeft")}
        />
        <MoveButton
          label="SLIDE ▶"
          title={hasLiveCamera ? "Truck the live camera right" : needCam}
          disabled={!hasLiveCamera}
          onClick={() => nudgeProgramCamera(sceneId, layer.id, "slideRight")}
        />
        {orbit ? (
          <MoveButton
            label="■ STOP"
            title="Stop the orbit/follow, holding the current shot"
            active
            onClick={() => stopCameraOrbit(sceneId, layer.id)}
          />
        ) : (
          <>
            <MoveButton
              label="ORBIT"
              title={!hasLiveCamera ? needCam : !subjectId ? needSubject : "Circle the live camera around the selected node"}
              disabled={!hasLiveCamera || !subjectId}
              onClick={() => subjectId && startCameraOrbit(sceneId, layer.id, subjectId, 20)}
            />
            <MoveButton
              label="FOLLOW"
              title={!hasLiveCamera ? needCam : !subjectId ? needSubject : "Hold the offset and keep the selected node framed as it moves"}
              disabled={!hasLiveCamera || !subjectId}
              onClick={() => subjectId && startCameraOrbit(sceneId, layer.id, subjectId, 0)}
            />
            <MoveButton
              label="FOCUS"
              title={!hasLiveCamera ? needCam : !subjectId ? needSubject : "Re-aim the live camera at the selected node"}
              disabled={!hasLiveCamera || !subjectId}
              onClick={() => subjectId && focusProgramCamera(sceneId, layer.id, subjectId)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function findNodeIn(nodes: SetNode[], nodeId: ID): SetNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.kind === "group") {
      const hit = findNodeIn(node.children, nodeId);
      if (hit) return hit;
    }
  }
  return null;
}

export function CamerasPanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const addSetNode = useDocStore((s) => s.addSetNode);
  const [prefs, setPrefs] = useState<TransitionPrefs>({ durationSec: 1.2, ease: "power2.inOut" });

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  if (!project || !scene) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  const setLayers = scene.layers.filter((l) => l.props.kind === "set3d");
  if (setLayers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center font-mono text-[10px] text-text-muted">
        No 3D set in this scene.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-xs">
      {/* Transition prefs apply to every TAKE below — CUT stays instant. */}
      <div className="space-y-1 rounded border border-border-subtle bg-bg-panel px-2 py-1.5">
        <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Take transition</div>
        <AxisControl
          label="Secs"
          value={prefs.durationSec}
          min={0.2}
          max={4}
          step={0.1}
          onChange={(v) => setPrefs((p) => ({ ...p, durationSec: v }))}
        />
        <div className="flex gap-1">
          {EASE_CHOICES.map((choice) => (
            <button
              key={choice.id}
              onClick={() => setPrefs((p) => ({ ...p, ease: choice.id }))}
              className={`flex-1 rounded border px-1.5 py-1 font-mono text-[9px] font-semibold ${
                prefs.ease === choice.id
                  ? "border-accent-blue bg-accent-blue/15 text-accent-blue-bright"
                  : "border-border-subtle text-text-muted-alt hover:border-accent-blue"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      {setLayers.map((layer) => {
        const cameras: CameraRef[] = [];
        if (layer.props.kind === "set3d") collectCameras(layer.props.nodes, layer, cameras);
        return (
          <div key={layer.id} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Video className="h-3 w-3 text-text-muted" />
              <span className="flex-1 truncate font-mono text-[9px] uppercase tracking-wider text-text-muted">
                {layer.name}
              </span>
              <button
                onClick={() => {
                  const cam = createCameraNode({ name: `CAM ${cameras.length + 1}` });
                  addSetNode(scene.id, layer.id, cam);
                }}
                className="flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright"
                title="Add a virtual camera to this set"
              >
                <Plus className="h-3 w-3" /> Camera
              </button>
            </div>
            {cameras.length === 0 && (
              <div className="rounded border border-dashed border-border-subtle p-2 font-mono text-[10px] text-text-muted">
                No cameras in this set yet.
              </div>
            )}
            {cameras.map(({ camera }) => (
              <CameraRow key={camera.id} sceneId={scene.id} layer={layer} camera={camera} prefs={prefs} />
            ))}
            <CameraMovesBar sceneId={scene.id} layer={layer} />
          </div>
        );
      })}
    </div>
  );
}
