import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDocStore } from "@/document/store";
import { useArLayer } from "@/components/panels/ar/useArLayer";
import { createArAssetLayer, createArBuilderAsset, cloneArBuilderAsset } from "./factory";
import * as layerOps from "./layers";
import { importImageForArAsset, importDataUrlAsAsset, importFromClipboard } from "./imageProcessing/import";
import { getBackgroundRemovalProvider } from "./imageProcessing/backgroundRemovalAdapter";
import { initBackgroundRemovalProviders } from "./imageProcessing/providers";
import { applyImageAdjustments, cropImage, rotateImage, flipImage } from "./imageProcessing/chromaKey";
import { useArAssetBuilderSession } from "./sessionStore";
import { arAssetToSetNodes } from "./placement";
import {
  downloadExport,
  downloadSmartAssetExport,
  exportAssetBundle,
  exportAssetJson,
  exportSmartAsset,
  getAvailableExports,
  type ExportFormat,
} from "./export";
import type { ArAssetCategory, ArAssetLifecycle, ArAssetType, ArBuilderAsset } from "./types";
import { getPresetById } from "./presets";

let providersInitialized = false;

export function useArAssetBuilder() {
  const project = useDocStore((s) => s.project);
  const addAsset = useDocStore((s) => s.addAsset);
  const addArBuilderAsset = useDocStore((s) => s.addArBuilderAsset);
  const updateArBuilderAsset = useDocStore((s) => s.updateArBuilderAsset);
  const removeArBuilderAsset = useDocStore((s) => s.removeArBuilderAsset);
  const replaceArBuilderAsset = useDocStore((s) => s.replaceArBuilderAsset);
  const ar = useArLayer();
  const session = useArAssetBuilderSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!providersInitialized) {
      initBackgroundRemovalProviders();
      providersInitialized = true;
    }
  }, []);

  const assets = project?.arBuilderAssets ?? [];
  const activeAsset = useMemo(
    () => assets.find((a) => a.id === session.activeAssetId) ?? null,
    [assets, session.activeAssetId],
  );

  const selectedLayers = useMemo(
    () => activeAsset?.layers.filter((l) => session.selectedLayerIds.includes(l.id)) ?? [],
    [activeAsset, session.selectedLayerIds],
  );

  const patchAsset = useCallback(
    (patch: Partial<ArBuilderAsset>) => {
      if (!activeAsset) return;
      updateArBuilderAsset(activeAsset.id, patch);
    },
    [activeAsset, updateArBuilderAsset],
  );

  const replaceAsset = useCallback(
    (asset: ArBuilderAsset) => {
      replaceArBuilderAsset(asset);
    },
    [replaceArBuilderAsset],
  );

  const importImage = useCallback(
    async (file: File) => {
      session.setErrorMessage(null);
      try {
        const result = await importImageForArAsset(file);
        addAsset(result.asset);

        const layer = createArAssetLayer("Image", {
          imageAssetId: result.asset.id,
          transform: {
            x: 0,
            y: 0,
            width: result.dimensions.width,
            height: result.dimensions.height,
            rotation: 0,
            zDepth: 0,
            pivotX: 0.5,
            pivotY: 0.5,
            opacity: 1,
          },
        });

        const asset = createArBuilderAsset(
          result.asset.name,
          "custom",
          result.hasTransparency ? "transparent-cutout" : "layered-25d",
          result.dimensions,
          {
            sourceFiles: [
              { assetId: result.asset.id, role: "original" },
              { assetId: result.asset.id, role: "working" },
            ],
            layers: [layer],
            thumbnailAssetId: result.asset.id,
          },
        );

        addArBuilderAsset(asset);
        session.setActiveAssetId(asset.id);
        session.setSelectedLayerIds([layer.id]);
        session.setWorkflowStep("cleanup");
        session.setStatusMessage(`Imported ${file.name}`);
        return asset;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        session.setErrorMessage(msg);
        throw err;
      }
    },
    [addAsset, addArBuilderAsset, session],
  );

  const importFromProjectAsset = useCallback(
    (assetId: string) => {
      const imgAsset = project?.assets.find((a) => a.id === assetId && a.kind === "image");
      if (!imgAsset) {
        session.setErrorMessage("Image asset not found");
        return;
      }
      const w = imgAsset.imageWidth ?? 800;
      const h = imgAsset.imageHeight ?? 600;
      const layer = createArAssetLayer(imgAsset.name, { imageAssetId: assetId });
      const asset = createArBuilderAsset(imgAsset.name, "custom", "transparent-cutout", { width: w, height: h }, {
        sourceFiles: [{ assetId, role: "original" }, { assetId, role: "working" }],
        layers: [layer],
        thumbnailAssetId: assetId,
      });
      addArBuilderAsset(asset);
      session.setActiveAssetId(asset.id);
      session.setSelectedLayerIds([layer.id]);
      session.setWorkflowStep("cleanup");
    },
    [project, addArBuilderAsset, session],
  );

  const pasteFromClipboard = useCallback(async () => {
    const file = await importFromClipboard();
    if (!file) {
      session.setErrorMessage("No image in clipboard");
      return;
    }
    await importImage(file);
  }, [importImage, session]);

  const removeBackground = useCallback(
    async (providerId?: string) => {
      if (!activeAsset) return;
      const workingLayer = activeAsset.layers.find((l) => l.imageAssetId);
      if (!workingLayer?.imageAssetId) {
        session.setErrorMessage("No image layer to process");
        return;
      }
      const imgAsset = project?.assets.find((a) => a.id === workingLayer.imageAssetId);
      if (!imgAsset) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      session.setBgRemovalBusy(true);
      try {
        const provider = getBackgroundRemovalProvider(providerId);
        const result = await provider.removeBackground(
          imgAsset.src,
          { keyColor: "#ffffff", similarity: 0.12, smoothness: 0.06, feather: 1 },
          (p) => session.setBgRemovalProgress(p),
          abortRef.current.signal,
        );
        const processed = await importDataUrlAsAsset(result.resultDataUrl, activeAsset.name, "working");
        addAsset(processed);
        if (result.maskDataUrl) {
          const mask = await importDataUrlAsAsset(result.maskDataUrl, activeAsset.name, "mask");
          addAsset(mask);
          patchAsset({
            sourceFiles: [
              ...activeAsset.sourceFiles.filter((f) => f.role !== "working" && f.role !== "mask"),
              { assetId: processed.id, role: "working" },
              { assetId: mask.id, role: "mask" },
            ],
            layers: activeAsset.layers.map((l) =>
              l.id === workingLayer.id ? { ...l, imageAssetId: processed.id, maskAssetId: mask.id } : l,
            ),
          });
        } else {
          patchAsset({
            layers: activeAsset.layers.map((l) =>
              l.id === workingLayer.id ? { ...l, imageAssetId: processed.id } : l,
            ),
          });
        }
        session.setWorkflowStep("layering");
        session.setStatusMessage("Background removed");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          session.setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      } finally {
        session.setBgRemovalBusy(false);
        session.setBgRemovalProgress(null);
      }
    },
    [activeAsset, project, addAsset, patchAsset, session],
  );

  const applyAdjustments = useCallback(async () => {
    if (!activeAsset) return;
    const layer = activeAsset.layers.find((l) => l.imageAssetId);
    if (!layer?.imageAssetId) return;
    const imgAsset = project?.assets.find((a) => a.id === layer.imageAssetId);
    if (!imgAsset) return;
    try {
      const dataUrl = await applyImageAdjustments(imgAsset.src, session.adjustments);
      const processed = await importDataUrlAsAsset(dataUrl, activeAsset.name, "working");
      addAsset(processed);
      patchAsset({
        layers: activeAsset.layers.map((l) =>
          l.id === layer.id ? { ...l, imageAssetId: processed.id } : l,
        ),
      });
      session.setStatusMessage("Adjustments applied");
    } catch (err) {
      session.setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [activeAsset, project, addAsset, patchAsset, session]);

  const applyCrop = useCallback(async () => {
    if (!activeAsset || !session.cropRect) return;
    const layer = activeAsset.layers.find((l) => l.imageAssetId);
    if (!layer?.imageAssetId) return;
    const imgAsset = project?.assets.find((a) => a.id === layer.imageAssetId);
    if (!imgAsset) return;
    try {
      const dataUrl = await cropImage(imgAsset.src, session.cropRect);
      const processed = await importDataUrlAsAsset(dataUrl, activeAsset.name, "working");
      addAsset(processed);
      patchAsset({
        dimensions: { width: session.cropRect.width, height: session.cropRect.height },
        layers: activeAsset.layers.map((l) =>
          l.id === layer.id
            ? { ...l, imageAssetId: processed.id, transform: { ...l.transform, width: session.cropRect!.width, height: session.cropRect!.height } }
            : l,
        ),
      });
      session.setCropRect(null);
      session.setStatusMessage("Image cropped");
    } catch (err) {
      session.setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [activeAsset, project, addAsset, patchAsset, session]);

  const createFromPreset = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId);
      if (!preset) return;
      const asset = preset.create();
      addArBuilderAsset(asset);
      session.setActiveAssetId(asset.id);
      session.setWorkflowStep("data-mapping");
      session.setStatusMessage(`Created ${preset.label}`);
    },
    [addArBuilderAsset, session],
  );

  const createBlank = useCallback(
    (name: string, category: ArAssetCategory, type: ArAssetType) => {
      const asset = createArBuilderAsset(name, category, type, project?.resolution ?? { width: 1920, height: 1080 });
      addArBuilderAsset(asset);
      session.setActiveAssetId(asset.id);
      session.setStatusMessage(`Created ${name}`);
    },
    [addArBuilderAsset, project, session],
  );

  const duplicateAsset = useCallback(
    (assetId: string) => {
      const source = assets.find((a) => a.id === assetId);
      if (!source) return;
      const copy = cloneArBuilderAsset(source);
      addArBuilderAsset(copy);
      session.setActiveAssetId(copy.id);
    },
    [assets, addArBuilderAsset, session],
  );

  const deleteAsset = useCallback(
    (assetId: string) => {
      removeArBuilderAsset(assetId);
      if (session.activeAssetId === assetId) session.setActiveAssetId(null);
    },
    [removeArBuilderAsset, session],
  );

  const setLifecycle = useCallback(
    (lifecycle: ArAssetLifecycle) => {
      if (!activeAsset) return;
      const order: ArAssetLifecycle[] = ["edit", "preview", "ready", "live"];
      const current = order.indexOf(activeAsset.lifecycle);
      const next = order.indexOf(lifecycle);
      if (lifecycle === "live" && activeAsset.lifecycle !== "ready") {
        session.setErrorMessage("Asset must be marked Ready before going Live");
        return;
      }
      if (next > current + 1 && lifecycle !== "edit") {
        session.setErrorMessage(`Must progress through: ${order[current]} → ${order[current + 1]}`);
        return;
      }
      patchAsset({ lifecycle });
      session.setStatusMessage(`Asset state: ${lifecycle.toUpperCase()}`);
    },
    [activeAsset, patchAsset, session],
  );

  const placeInArScene = useCallback(() => {
    if (!activeAsset || !project) return;
    if (activeAsset.lifecycle === "edit") {
      session.setErrorMessage("Save and preview before placing in AR scene");
      return;
    }
    if (!ar.scene || !ar.layer) {
      ar.createArLayer();
    }
    const nodes = arAssetToSetNodes(activeAsset, project.assets);
    ar.addNodes(nodes);
    session.setStatusMessage(`Placed ${activeAsset.name} in AR scene`);
  }, [activeAsset, project, ar, session]);

  const loadToPreview = useCallback(() => {
    setLifecycle("preview");
    ar.loadToPreview();
  }, [setLifecycle, ar]);

  const takeLive = useCallback(() => {
    setLifecycle("live");
    ar.takeOnAir();
  }, [setLifecycle, ar]);

  const exportAsset = useCallback(
    (format: ExportFormat) => {
      if (!activeAsset) return;
      const refs: Record<string, string> = {};
      const referencedAssetIds = [
        ...activeAsset.sourceFiles.map((file) => file.assetId),
        activeAsset.thumbnailAssetId,
      ].filter((assetId): assetId is string => Boolean(assetId));
      for (const assetId of referencedAssetIds) {
        const a = project?.assets.find((x) => x.id === assetId);
        if (a) refs[assetId] = a.src;
      }
      if (format === "smart-asset") downloadSmartAssetExport(exportSmartAsset(activeAsset, refs));
      else if (format === "json") downloadExport(exportAssetJson(activeAsset));
      else if (format === "bundle") downloadExport(exportAssetBundle(activeAsset, refs));
      else if (format === "png") {
        const layer = activeAsset.layers.find((l) => l.imageAssetId);
        const img = project?.assets.find((a) => a.id === layer?.imageAssetId);
        if (img) {
          import("./export").then(({ exportLayerPng, downloadExport: dl }) => {
            exportLayerPng(activeAsset, img.src).then(dl);
          });
        }
      } else if (format === "webp") {
        const layer = activeAsset.layers.find((l) => l.imageAssetId);
        const img = project?.assets.find((a) => a.id === layer?.imageAssetId);
        if (img) {
          import("./export").then(({ exportLayerWebp, downloadExport: dl }) => {
            exportLayerWebp(activeAsset, img.src).then(dl);
          });
        }
      } else if (format === "glb") {
        session.setErrorMessage("GLB export is not implemented for builder assets yet");
      }
    },
    [activeAsset, project, session],
  );

  const updateLayer = useCallback(
    (layerId: string, patch: Parameters<typeof layerOps.updateLayer>[2]) => {
      if (!activeAsset) return;
      replaceAsset(layerOps.updateLayer(activeAsset, layerId, patch));
    },
    [activeAsset, replaceAsset],
  );

  const addLayer = useCallback(
    (name: string) => {
      if (!activeAsset) return;
      const layer = createArAssetLayer(name);
      replaceAsset(layerOps.addLayer(activeAsset, layer));
      session.setSelectedLayerIds([layer.id]);
    },
    [activeAsset, replaceAsset, session],
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      if (!activeAsset) return;
      replaceAsset(layerOps.removeLayer(activeAsset, layerId));
      session.setSelectedLayerIds([]);
    },
    [activeAsset, replaceAsset, session],
  );

  const distributeDepth = useCallback(() => {
    if (!activeAsset) return;
    replaceAsset(layerOps.distributeLayersAcrossDepth(activeAsset));
    session.setViewMode("25d");
  }, [activeAsset, replaceAsset, session]);

  const addBinding = useCallback(
    (targetPath: string, source: string, fallback?: string) => {
      if (!activeAsset) return;
      patchAsset({
        bindings: [...activeAsset.bindings, { targetPath, source, fallback }],
      });
    },
    [activeAsset, patchAsset],
  );

  const validationMessages = useMemo(() => {
    if (!activeAsset) return [];
    const msgs: string[] = [];
    if (activeAsset.layers.length === 0) msgs.push("No layers — import an image or add layers");
    if (activeAsset.bindings.length === 0 && ["election-result-bar", "stat-panel", "scoreboard-element"].includes(activeAsset.type)) {
      msgs.push("Data bindings recommended for this asset type");
    }
    const missingAssets = activeAsset.layers.filter((l) => l.imageAssetId && !project?.assets.find((a) => a.id === l.imageAssetId));
    if (missingAssets.length > 0) msgs.push(`${missingAssets.length} layer(s) reference missing source files`);
    return msgs;
  }, [activeAsset, project]);

  return {
    project,
    assets,
    activeAsset,
    selectedLayers,
    ar,
    session,
    fileInputRef,
    validationMessages,
    availableExports: activeAsset ? getAvailableExports(activeAsset) : [],
    importImage,
    importFromProjectAsset,
    pasteFromClipboard,
    removeBackground,
    applyAdjustments,
    applyCrop,
    createFromPreset,
    createBlank,
    duplicateAsset,
    deleteAsset,
    setLifecycle,
    placeInArScene,
    loadToPreview,
    takeLive,
    exportAsset,
    updateLayer,
    addLayer,
    removeLayer,
    distributeDepth,
    addBinding,
    patchAsset,
    replaceAsset,
    rotateImage: async (deg: number) => {
      if (!activeAsset) return;
      const layer = activeAsset.layers.find((l) => l.imageAssetId);
      const img = project?.assets.find((a) => a.id === layer?.imageAssetId);
      if (!img) return;
      const dataUrl = await rotateImage(img.src, deg);
      const processed = await importDataUrlAsAsset(dataUrl, activeAsset.name, "working");
      addAsset(processed);
      patchAsset({ layers: activeAsset.layers.map((l) => l.id === layer!.id ? { ...l, imageAssetId: processed.id } : l) });
    },
    flipImage: async (horizontal: boolean) => {
      if (!activeAsset) return;
      const layer = activeAsset.layers.find((l) => l.imageAssetId);
      const img = project?.assets.find((a) => a.id === layer?.imageAssetId);
      if (!img) return;
      const dataUrl = await flipImage(img.src, horizontal);
      const processed = await importDataUrlAsAsset(dataUrl, activeAsset.name, "working");
      addAsset(processed);
      patchAsset({ layers: activeAsset.layers.map((l) => l.id === layer!.id ? { ...l, imageAssetId: processed.id } : l) });
    },
  };
}
