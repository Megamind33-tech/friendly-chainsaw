import { useEffect, useMemo, useRef, useState } from "react";
import { useDocStore, findSetNode } from "@/document/store";
import {
  createModelNode,
  createPrimitiveNode,
  createVideoFeedNode,
  vec3,
} from "@/document/factory";
import { buildDataValues, useDataStore } from "@/document/dataSources";
import { useUserTemplates } from "@/document/userTemplates";
import { generateAiImageAsset, importStudioFile } from "@/components/set3d/assetImport";
import {
  cloneSetNode,
  flattenArSetNodes,
  flattenSetNodes,
  AR_CENTER,
  isArSetNode,
  markSetNodeAsAr,
  markSetNodesAsAr,
  moveSetNode,
} from "@/ar-engine/nodeUtils";
import { isReadyForAir, validateARLayer } from "@/ar-engine/validation";
import { hasVerseBindings, maxTransitionDurationMs, prepareArNodesForAir } from "@/ar-engine/arPrep";
import { defaultAnimationForPreset } from "@/ar-engine/arMotionEngine";
import type { ARAnimationPreset, Asset, ID, MaterialProps, SetNode } from "@/document/types";
import { findActiveArLayer } from "./arShared";
import { useVerseTransition } from "./useVerseTransition";

export function useArLayer() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const activeLayerId = useDocStore((s) => s.activeLayerId);
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);
  const addLayer = useDocStore((s) => s.addLayer);
  const addSetNode = useDocStore((s) => s.addSetNode);
  const replaceSetNodes = useDocStore((s) => s.replaceSetNodes);
  const updateSetNode = useDocStore((s) => s.updateSetNode);
  const commitNodeTransform = useDocStore((s) => s.commitNodeTransform);
  const removeSetNode = useDocStore((s) => s.removeSetNode);
  const selectSetNode = useDocStore((s) => s.selectSetNode);
  const setSetEnvironment = useDocStore((s) => s.setSetEnvironment);
  const armPreview = useDocStore((s) => s.armPreview);
  const take = useDocStore((s) => s.take);
  const playIn = useDocStore((s) => s.playIn);
  const playOut = useDocStore((s) => s.playOut);
  const holdVerseData = useDocStore((s) => s.holdVerseData);
  const releaseVerseDataHold = useDocStore((s) => s.releaseVerseDataHold);
  const focusArNodes = useDocStore((s) => s.focusArNodes);
  const addToArFocus = useDocStore((s) => s.addToArFocus);
  const clearArFocus = useDocStore((s) => s.clearArFocus);
  const arFocusAll = useDocStore((s) => s.arFocus);
  const previewSceneId = useDocStore((s) => s.previewSceneId);
  const programSceneId = useDocStore((s) => s.programSceneId);
  const addAsset = useDocStore((s) => s.addAsset);
  const mock = useDataStore((s) => s.mock);
  const setMockValue = useDataStore((s) => s.setMockValue);
  const saveTemplate = useUserTemplates((s) => s.save);
  const loadTemplates = useUserTemplates((s) => s.load);
  const fileInput = useRef<HTMLInputElement>(null);
  const [bindFilter, setBindFilter] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [verseTransitions, setVerseTransitions] = useState(true);

  useEffect(() => {
    loadTemplates().catch((err) => console.error("failed to load templates", err));
  }, [loadTemplates]);

  const target = findActiveArLayer(project, activeSceneId, activeLayerId);
  const scene = target?.scene;
  const layer = target?.layer;
  const setProps = layer?.props.kind === "set3d" ? layer.props : null;
  const selectedAnyNode = setProps && selectedNodeId ? findSetNode(setProps.nodes, selectedNodeId) : undefined;
  const nodes = setProps?.nodes ?? [];
  const allNodes = flattenSetNodes(nodes);
  const arNodes = flattenArSetNodes(nodes);
  const arNodeIds = useMemo(() => new Set(arNodes.map((node) => node.id)), [arNodes]);
  const selectedNode = selectedAnyNode && isArSetNode(selectedAnyNode) ? selectedAnyNode : undefined;
  const arRootNodes = nodes.filter(isArSetNode);
  const visibleArObjects = arNodes.filter((node) => node.visible && node.kind !== "camera" && node.kind !== "light");
  const studioBackdropCount = Math.max(0, allNodes.length - arNodes.length);
  const checks = layer ? validateARLayer(layer, project?.assets ?? []) : [];
  const ready = checks.length > 0 && isReadyForAir(checks);
  const verseScene = hasVerseBindings(nodes);
  const restDataSnapshot = useMemo(() => useDataStore.getState(), []);
  const dataValues = useMemo(() => buildDataValues({ ...restDataSnapshot, mock }), [restDataSnapshot, mock]);
  const assets = (project?.assets ?? []).filter((a) => a.kind === "image" || a.kind === "model" || a.kind === "video");
  const isPreview = !!scene && previewSceneId === scene.id;
  const isProgram = !!scene && programSceneId === scene.id;

  useVerseTransition(layer?.id, nodes, verseTransitions);

  const createArLayer = () => {
    if (!project) return;
    const sceneId = activeSceneId ?? project.scenes[0]?.id;
    if (!sceneId) return;
    addLayer(sceneId, "set3d");
    setStatus("Created AR layer");
  };

  const addNodes = (newNodes: SetNode[]) => {
    if (!scene || !layer) return;
    for (const node of markSetNodesAsAr(newNodes)) addSetNode(scene.id, layer.id, node);
  };

  const addAssetToScene = (asset: Asset) => {
    if (!scene || !layer) return;
    if (asset.kind === "model") addNodes([createModelNode(asset.id, { name: asset.name, transform: { position: vec3(AR_CENTER.x, AR_CENTER.y, AR_CENTER.z) } })]);
    if (asset.kind === "image") {
      const aspect =
        asset.imageWidth && asset.imageHeight && asset.imageHeight > 0
          ? asset.imageWidth / asset.imageHeight
          : 1;
      const h = 0.9;
      const w = h * aspect;
      addNodes([
        createPrimitiveNode("plane", {
          name: asset.name,
          textureAssetId: asset.id,
          transform: { position: vec3(AR_CENTER.x, AR_CENTER.y, AR_CENTER.z), scale: vec3(w, h, 1) },
          material: { color: "#ffffff", metalness: 0, roughness: 1, opacity: 1 },
        }),
      ]);
    }
    if (asset.kind === "video") {
      addNodes([createVideoFeedNode({ label: asset.name, source: { type: "url", url: asset.src }, transform: { position: vec3(AR_CENTER.x, AR_CENTER.y, AR_CENTER.z) } })]);
    }
  };

  const importAsset = async (file: File) => {
    setStatus("Importing asset...");
    try {
      const asset = await importStudioFile(file);
      addAsset(asset);
      addAssetToScene(asset);
      setStatus(`Added ${asset.name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const generateImageForAr = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiBusy(true);
    setStatus("Generating AR image...");
    try {
      const asset = await generateAiImageAsset(prompt, "1024x1024");
      addAsset(asset);
      addAssetToScene(asset);
      setAiPrompt("");
      setStatus(`Generated ${asset.name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  };

  const updateNode = (node: SetNode, updates: Partial<SetNode>) => {
    if (!scene || !layer) return;
    updateSetNode(scene.id, layer.id, node.id, updates);
  };

  const setNodeTransform = (node: SetNode, updates: Partial<SetNode["transform"]>) => {
    if (!scene || !layer) return;
    commitNodeTransform(scene.id, layer.id, node.id, { ...node.transform, ...updates });
  };

  const duplicateNode = (node: SetNode) => {
    if (!scene || !layer) return;
    addSetNode(scene.id, layer.id, markSetNodeAsAr(cloneSetNode(node)));
  };

  const moveNode = (nodeId: ID, direction: -1 | 1) => {
    if (!scene || !layer || !setProps) return;
    replaceSetNodes(scene.id, layer.id, moveSetNode(setProps.nodes, nodeId, direction));
  };

  const applyAnimation = (preset: ARAnimationPreset) => {
    if (!selectedNode) return;
    updateNode(selectedNode, { animation: defaultAnimationForPreset(preset) } as Partial<SetNode>);
  };

  const updateAnimation = (updates: Partial<NonNullable<SetNode["animation"]>>) => {
    if (!selectedNode?.animation) return;
    updateNode(selectedNode, { animation: { ...selectedNode.animation, ...updates } } as Partial<SetNode>);
  };

  const clearAnimation = () => {
    if (!selectedNode) return;
    updateNode(selectedNode, { animation: undefined } as Partial<SetNode>);
  };

  const bindSelectedText = (source: string) => {
    if (!selectedNode || selectedNode.kind !== "text3d") return;
    updateNode(selectedNode, { bindings: [{ targetPath: "text", source, fallback: selectedNode.text }] } as Partial<SetNode>);
  };

  const bindSelectedImageUrl = (source: string) => {
    if (!selectedNode || selectedNode.kind !== "primitive") return;
    updateNode(selectedNode, {
      bindings: [{ targetPath: "textureUrl", source, fallback: "" }],
      material: { ...selectedNode.material, color: "#ffffff", metalness: 0, roughness: 1 },
    } as Partial<SetNode>);
  };

  const loadToPreview = () => {
    if (scene) armPreview(scene.id);
  };

  const takeOnAir = () => {
    if (!scene) return;
    if (!ready && !window.confirm("This AR scene is not fully ready. Take it on air anyway?")) return;
    armPreview(scene.id);
    take();
  };

  const duplicateAllObjects = () => {
    if (!scene || !layer) return;
    addNodes(arRootNodes.map((node) => cloneSetNode(node)));
  };

  const prepForAir = () => {
    if (!scene || !layer || !setProps) return;
    const prepared = prepareArNodesForAir(setProps.nodes);
    replaceSetNodes(scene.id, layer.id, prepared);
    setStatus("AR scene prepped — on-air flags set");
  };

  const rehearseInOut = () => {
    if (!layer) return;
    playIn(layer.id);
    const inMs = maxTransitionDurationMs(nodes, "in");
    window.setTimeout(() => playOut(layer.id), inMs + 400);
    setStatus("Rehearsing IN → OUT on Program/Preview");
  };

  const cueVerseTransition = () => {
    if (!layer || !verseScene) return;
    holdVerseData();
    playOut(layer.id);
    const outMs = maxTransitionDurationMs(nodes, "out");
    window.setTimeout(() => {
      releaseVerseDataHold();
      playIn(layer.id);
    }, outMs);
    setStatus("Verse transition cued (OUT → IN)");
  };

  const brightenPanelMaterial = (m: MaterialProps): MaterialProps => ({
    ...m,
    emissive: m.emissive ?? m.color,
    emissiveIntensity: Math.max(m.emissiveIntensity ?? 0, 0.55),
    metalness: Math.min(m.metalness, 0.1),
    roughness: Math.max(m.roughness, 0.5),
  });

  const brightenAllPanels = () => {
    if (!scene || !layer) return;
    let count = 0;
    for (const node of arNodes) {
      if (node.kind === "primitive" && (node.shape === "box" || node.shape === "plane")) {
        updateSetNode(scene.id, layer.id, node.id, { material: brightenPanelMaterial(node.material) } as Partial<SetNode>);
        count += 1;
      }
    }
    setStatus(count > 0 ? `Brightened ${count} AR panel(s)` : "No panels to brighten");
  };

  return {
    project,
    scene,
    layer,
    setProps,
    selectedNodeId,
    selectedNode,
    arNodeIds,
    arNodes,
    arRootNodes,
    visibleArObjects,
    studioBackdropCount,
    checks,
    ready,
    verseScene,
    verseTransitions,
    setVerseTransitions,
    dataValues,
    assets,
    isPreview,
    isProgram,
    previewSceneId,
    programSceneId,
    arFocusAll,
    bindFilter,
    setBindFilter,
    status,
    setStatus,
    aiPrompt,
    setAiPrompt,
    aiBusy,
    fileInput,
    createArLayer,
    addNodes,
    addAssetToScene,
    importAsset,
    generateImageForAr,
    updateNode,
    setNodeTransform,
    duplicateNode,
    moveNode,
    applyAnimation,
    updateAnimation,
    clearAnimation,
    bindSelectedText,
    bindSelectedImageUrl,
    loadToPreview,
    takeOnAir,
    duplicateAllObjects,
    prepForAir,
    rehearseInOut,
    cueVerseTransition,
    brightenAllPanels,
    selectSetNode,
    removeSetNode,
    setSetEnvironment,
    playIn,
    playOut,
    focusArNodes,
    addToArFocus,
    clearArFocus,
    setMockValue,
    saveTemplate,
  };
}
