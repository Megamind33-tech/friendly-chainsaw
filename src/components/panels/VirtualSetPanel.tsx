import { useRef, useState } from "react";
import { useDocStore, findSetNode, findActiveSet3dLayer } from "@/document/store";
import type { ID, Layer, SetNode } from "@/document/types";
import {
  createCameraNode,
  createLightNode,
  createPrimitiveNode,
  createText3dNode,
  createVideoFeedNode,
  createModelNode,
  vec3,
} from "@/document/factory";
import { importStudioFile } from "@/components/set3d/assetImport";
import { Set3dEditor } from "@/components/set3d/Set3dEditor";
import { SET_BUILDERS } from "@/sets/studioSets";
import { BroadcastToolBtn } from "@/components/ui/broadcast";

/** Place-actors palette — mono text chips, no icon grid. */
const NODE_PALETTE: { id: string; label: string; create: () => SetNode }[] = [
  { id: "box", label: "BOX", create: () => createPrimitiveNode("box", { transform: { position: vec3(0, 0.5, 0) } }) },
  { id: "sphere", label: "SPH", create: () => createPrimitiveNode("sphere", { transform: { position: vec3(0, 0.5, 0) } }) },
  { id: "cylinder", label: "CYL", create: () => createPrimitiveNode("cylinder", { transform: { position: vec3(0, 0.5, 0) } }) },
  { id: "plane", label: "PLN", create: () => createPrimitiveNode("plane", { transform: { position: vec3(0, 1, -2) } }) },
  { id: "text", label: "TXT", create: () => createText3dNode({ transform: { position: vec3(0, 2, -3) } }) },
  { id: "videofeed", label: "FEED", create: () => createVideoFeedNode({ transform: { position: vec3(0, 1.8, -3) } }) },
  { id: "spot", label: "SPT", create: () => createLightNode("spot", { transform: { position: vec3(2, 4, 2), rotation: vec3(-45, 45, 0) } }) },
  { id: "point", label: "PNT", create: () => createLightNode("point", { transform: { position: vec3(0, 3, 0) } }) },
  { id: "directional", label: "DIR", create: () => createLightNode("directional", { transform: { position: vec3(4, 6, 4), rotation: vec3(-40, 40, 0) } }) },
  { id: "camera", label: "CAM", create: () => createCameraNode() },
];

const SET_BUILDER_SHORT: Record<string, string> = {
  virtual_set_universal_wide_screen_wall_01: "WIDE",
  virtual_set_curved_panoramic_02: "CURVE",
  virtual_set_modern_stadium_glass_03: "STADIUM",
  "news-desk": "NEWS",
  "weather-studio": "WX",
  "talk-show": "TALK",
  "sports-arena": "SPORT",
  "election-hq": "ELEX",
  "breaking-news": "BRK",
};

function collectCameras(nodes: SetNode[]): { id: ID; name: string }[] {
  const cameras: { id: ID; name: string }[] = [];
  for (const node of nodes) {
    if (node.kind === "camera") cameras.push({ id: node.id, name: node.name });
    if (node.kind === "group") cameras.push(...collectCameras(node.children));
  }
  return cameras;
}

function useActiveSetLayer(): { sceneId: ID; layer: Layer } | null {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const activeLayerId = useDocStore((s) => s.activeLayerId);
  return findActiveSet3dLayer(project, activeSceneId, activeLayerId);
}

export function VirtualSetPanel() {
  const target = useActiveSetLayer();
  const gizmoMode = useDocStore((s) => s.gizmoMode);
  const setGizmoMode = useDocStore((s) => s.setGizmoMode);
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);
  const addSetNode = useDocStore((s) => s.addSetNode);
  const addPrebuiltLayer = useDocStore((s) => s.addPrebuiltLayer);
  const addSet3dLayer = useDocStore((s) => s.addSet3dLayer);
  const addLayer = useDocStore((s) => s.addLayer);
  const setActiveSetCamera = useDocStore((s) => s.setActiveSetCamera);
  const addAsset = useDocStore((s) => s.addAsset);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const project = useDocStore((s) => s.project);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<"idle" | "importing" | string>("idle");
  const [templateId, setTemplateId] = useState(
    () => SET_BUILDERS.find((builder) => builder.label === target?.layer.name)?.id ?? SET_BUILDERS[0].id,
  );

  const sceneId = activeSceneId ?? project?.scenes[0]?.id ?? null;

  const onImportFile = async (file: File) => {
    if (!target) return;
    setImportState("importing");
    try {
      const asset = await importStudioFile(file);
      addAsset(asset);
      if (asset.kind === "video") {
        addSetNode(
          target.sceneId,
          target.layer.id,
          createVideoFeedNode({
            label: asset.name,
            source: { type: "url", url: asset.src },
            transform: { position: vec3(0, 1.8, -3) },
          }),
        );
      } else if (asset.kind === "image") {
        addSetNode(target.sceneId, target.layer.id, createPrimitiveNode("plane", {
          name: asset.name,
          textureAssetId: asset.id,
          slotKind: "branding",
          slotLabel: asset.name,
          display: { fit: "contain", anchor: "center", overscan: 1 },
          material: { color: "#ffffff", metalness: 0, roughness: 1 },
          transform: { position: vec3(0, 1.8, -3), scale: vec3(3.2, 1.8, 1) },
        }));
      } else if (asset.kind === "model") {
        addSetNode(target.sceneId, target.layer.id, createModelNode(asset.id, { name: asset.name }));
      }
      setImportState("idle");
    } catch (err) {
      setImportState(err instanceof Error ? err.message : String(err));
    }
  };

  if (!target) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg-panel p-4">
        <div className="text-center">
          <div className="font-mono text-xs text-text-muted-alt">No 3D set in this scene</div>
          <div className="mt-1 font-mono text-[10px] text-text-muted">
            Start from a studio template — every piece stays fully editable — or build from scratch.
          </div>
        </div>
        <div className="grid w-full max-w-md grid-cols-3 gap-2">
          {SET_BUILDERS.map((builder) => (
            <button
              key={builder.id}
              disabled={!sceneId}
              onClick={() => sceneId && addPrebuiltLayer(sceneId, builder.create())}
              className="flex flex-col items-center gap-1 rounded border border-border-subtle bg-bg-surface p-2 font-mono text-[10px] text-text-muted-alt shadow-[inset_0_-2px_0_0_var(--stripe-accent)] hover:border-stripe-active hover:text-text-bright"
            >
              <span className="text-[11px] font-medium tracking-wide text-text-bright">
                {SET_BUILDER_SHORT[builder.id] ?? "SET"}
              </span>
              <span className="truncate text-[8px] text-text-muted">{builder.label}</span>
            </button>
          ))}
          <button
            disabled={!sceneId}
            onClick={() => sceneId && addLayer(sceneId, "set3d")}
            className="flex flex-col items-center justify-center gap-1 rounded border border-dashed border-border-subtle bg-bg-surface p-2 font-mono text-[10px] text-text-muted hover:border-stripe-active hover:text-text-bright"
          >
            <span className="text-[11px] tracking-wide">NEW</span>
            <span className="text-[8px]">Empty Set</span>
          </button>
        </div>
      </div>
    );
  }

  const props = target.layer.props;
  const cameras = props.kind === "set3d" ? collectCameras(props.nodes) : [];
  const activeCameraId = props.kind === "set3d" ? props.activeCameraId : null;
  const selectedNode =
    props.kind === "set3d" && selectedNodeId ? findSetNode(props.nodes, selectedNodeId) : undefined;

  return (
    <div className="flex h-full w-full flex-col bg-bg-panel">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b-2 border-stripe-accent px-2 py-1">
        <div className="flex overflow-hidden rounded border border-border-subtle" title="W / E / R">
          {(
            [
              { mode: "translate" as const, label: "W", title: "Move (W)" },
              { mode: "rotate" as const, label: "E", title: "Rotate (E)" },
              { mode: "scale" as const, label: "R", title: "Scale (R)" },
            ] as const
          ).map(({ mode, label, title }) => (
            <BroadcastToolBtn key={mode} title={title} active={gizmoMode === mode} onClick={() => setGizmoMode(mode)}>
              {label}
            </BroadcastToolBtn>
          ))}
        </div>

        <div className="h-5 w-px bg-border-subtle" />

        <div className="flex flex-wrap gap-0.5">
          {NODE_PALETTE.map(({ id, label, create }) => (
            <BroadcastToolBtn
              key={id}
              title={`Add ${label}`}
              onClick={() => addSetNode(target.sceneId, target.layer.id, create())}
            >
              {label}
            </BroadcastToolBtn>
          ))}
        </div>

        <div className="h-5 w-px bg-border-subtle" />

        <button
          title="Import a 3D model (.glb .gltf .fbx .obj) or video clip (.mp4 .webm .mov)"
          disabled={importState === "importing"}
          onClick={() => fileInput.current?.click()}
          className="rounded border border-border-subtle px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-text-muted-alt hover:border-stripe-active hover:text-text-bright disabled:opacity-50"
        >
          {importState === "importing" ? "Importing…" : "Import"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".glb,.gltf,.fbx,.obj,.mp4,.webm,.mov,.m4v"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
            e.target.value = "";
          }}
        />
        {importState !== "idle" && importState !== "importing" && (
          <span className="font-mono text-[9px] text-live-red">{importState}</span>
        )}

        <div className="h-5 w-px bg-border-subtle" />
        <select
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          title="Choose a current built-in studio template"
          className="max-w-[110px] truncate rounded border border-border-subtle bg-bg-surface px-1.5 py-1 font-mono text-[9px] text-text-muted-alt"
        >
          {SET_BUILDERS.map((builder) => (
            <option key={builder.id} value={builder.id}>
              {SET_BUILDER_SHORT[builder.id] ?? builder.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="Load the latest template as a new active set. Your current set is preserved as a hidden layer."
          onClick={() => {
            const builder = SET_BUILDERS.find((candidate) => candidate.id === templateId);
            if (builder) addSet3dLayer(target.sceneId, builder.create());
          }}
          className="rounded border border-accent-blue/60 bg-accent-blue/10 px-2 py-1 font-mono text-[9px] font-semibold text-accent-blue-bright hover:border-accent-blue"
        >
          LOAD LATEST
        </button>

        {cameras.length > 0 && (
          <>
            <div className="h-5 w-px bg-border-subtle" />
            <select
              value={activeCameraId ?? ""}
              onChange={(e) => setActiveSetCamera(target.sceneId, target.layer.id, e.target.value || null)}
              className="max-w-[120px] truncate rounded border border-border-subtle bg-bg-surface px-1.5 py-1 font-mono text-[9px] text-text-muted-alt"
            >
              <option value="">No program camera</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}

        {selectedNode && (
          <span className="ml-auto truncate font-mono text-[9px] text-text-muted">
            sel: <span className="text-text-muted-alt">{selectedNode.name}</span>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <Set3dEditor sceneId={target.sceneId} layer={target.layer} />
      </div>
    </div>
  );
}
