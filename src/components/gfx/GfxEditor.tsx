import { useEffect, useRef, useState, useCallback } from "react";
import type Konva from "konva";
import { Stage, Layer as KonvaLayer, Transformer, Rect as KonvaRect, Group as KonvaGroup } from "react-konva";
import { useShallow } from "zustand/react/shallow";
import { useDocStore, locateElement } from "@/document/store";
import { useEditorSessionStore } from "@/document/editorSessionStore";
import { useLiveShowStore } from "@/document/liveShowStore";
import { useGestureHistory } from "@/document/gestureHistory";
import { useDataStore, buildDataValues } from "@/document/dataSources";
import { useRegisterFonts } from "@/document/fonts";
import { resolveElement } from "@/document/bindings";
import { applyPlayback, applyScroll, applyElementLoop, hasAnyLoopPulse, elapsedSeconds, isPlaybackActive, useAnimationTicker } from "@/document/timelineEngine";
import { createRectElement, createTextElement, createVideoElement, createImageSlot, createImageElement, createLottieElement } from "@/document/factory";
import { ASSET_DRAG_MIME, parseAssetDrag } from "@/document/dragAsset";
import type { Element, ID, Layer } from "@/document/types";
import { renderElement } from "./renderNodes";
import { SafeAreas } from "./SafeAreas";
import { Set3dRenderer } from "@/components/set3d/Set3dRenderer";
import {
  Clapperboard,
  Square,
  Type,
  Image as ImageIcon,
  Film,
  Copy,
  ChevronUp,
  ChevronDown,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
} from "lucide-react";

/** Interactive Stage: editor-only chrome (Transformer, safe areas) around the shared renderNodes builder. */
export function GfxEditor() {
  const project = useDocStore((s) => s.project);
  useRegisterFonts(project?.assets);
  const activeSceneId = useEditorSessionStore((s) => s.activeSceneId);
  const activeLayerId = useEditorSessionStore((s) => s.activeLayerId);
  const selectedElementIds = useEditorSessionStore((s) => s.selectedElementIds);
  const selectElements = useDocStore((s) => s.selectElements);
  const commitTransform = useDocStore((s) => s.commitTransform);
  const addElement = useDocStore((s) => s.addElement);
  const addLayer = useDocStore((s) => s.addLayer);
  const setActiveLayer = useDocStore((s) => s.setActiveLayer);
  const updateElement = useDocStore((s) => s.updateElement);
  const { beginGesture, endGesture } = useGestureHistory();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const transformerRef = useRef<Konva.Transformer>(null);
  const programSceneId = useLiveShowStore((s) => s.programSceneId);
  const previewSceneId = useLiveShowStore((s) => s.previewSceneId);
  // Design can preview against the live virtual set, but that costs a WebGL
  // renderer. Keep it opt-in so the 2D graphics editor stays responsive on
  // modest machines; the SET toggle below turns the backdrop on when needed.
  const [showSetBackdrop, setShowSetBackdrop] = useState(false);
  // Inline on-canvas text editing (double-click a text element).
  const [editingTextId, setEditingTextId] = useState<ID | null>(null);
  // Rubber-band (marquee) multi-select rectangle, in project coordinates.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeRef = useRef(false);

  // So authors see bound fields update live while editing, matching what
  // Program/Preview/OBS render — see persistence.ts's resolveProjectForOutput.
  // useShallow is load-bearing: buildDataValues returns a fresh object per
  // call, and zustand v5's useSyncExternalStore requires a cached snapshot —
  // without it, a cold mount infinite-loops ("getSnapshot should be cached").
  const dataValues = useDataStore(useShallow(buildDataValues));

  const layerPlayback = useLiveShowStore((s) => s.layerPlayback);
  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  // A single ticker for the whole stage — every layer re-renders together
  // regardless of which one is mid-tween, so one rAF loop covers all of them.
  // A ticker layer (scrollSpeed) always needs frames while shown for
  // authoring — unlike IN/OUT, scrolling has no "settled" end state.
  const anyPlaybackActive =
    Object.entries(layerPlayback).some(([layerId, pb]) => {
      const l = scene?.layers.find((ly) => ly.id === layerId);
      return !!l?.timeline && isPlaybackActive(elapsedSeconds(pb), l.timeline, pb.phase);
    }) ||
    !!scene?.layers.some((l) => l.scrollSpeed) ||
    (scene ? hasAnyLoopPulse(scene.layers) : false);
  useAnimationTicker(anyPlaybackActive);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!transformerRef.current) return;
    // Hide the transformer while inline-editing text so it doesn't overlap the
    // textarea and steal drags.
    const ids = editingTextId ? [] : selectedElementIds;
    const nodes = ids.map((id) => nodeRefs.current.get(id)).filter((n): n is Konva.Node => !!n);
    transformerRef.current.nodes(nodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedElementIds, editingTextId]);

  const registerNodeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  const handleDragEnd = useCallback(
    (elementId: string, x: number, y: number) => {
      if (!project) return;
      const location = locateElement(project, elementId);
      if (!location) return;
      const layer = scene?.layers.find((l) => l.id === location.layerId);
      const found = layer?.props.kind === "gfx2d" ? layer.props.elements.find((e) => e.id === elementId) : undefined;
      if (!found) return;
      endGesture(() => {
        commitTransform(location.sceneId, location.layerId, elementId, { ...found.transform, x, y });
      });
    },
    [project, scene, endGesture, commitTransform],
  );

  const handleTransformEnd = useCallback(
    (elementId: string, node: Konva.Node) => {
      if (!project) return;
      const location = locateElement(project, elementId);
      if (!location) return;
      // Bake Konva's scale into width/height and reset scale to 1 — the
      // document model has no separate scale field, so every edit must
      // leave the node at scale 1 or resizes would silently compound.
      const sx = node.scaleX();
      const sy = node.scaleY();
      const newWidth = Math.max(5, node.width() * sx);
      const newHeight = Math.max(5, node.height() * sy);
      node.scaleX(1);
      node.scaleY(1);
      const layer = scene?.layers.find((l) => l.id === location.layerId);
      const el = layer?.props.kind === "gfx2d" ? layer.props.elements.find((e) => e.id === elementId) : undefined;
      endGesture(() => {
        commitTransform(location.sceneId, location.layerId, elementId, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation: node.rotation(),
        });
        // Resizing a group must rescale its children (relative coords) or they
        // snap back to their original size when the doc re-renders at scale 1.
        if (el?.kind === "group" && (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001)) {
          const scaled = el.children.map((c) => ({
            ...c,
            transform: {
              ...c.transform,
              x: c.transform.x * sx,
              y: c.transform.y * sy,
              width: c.transform.width * sx,
              height: c.transform.height * sy,
            },
          }));
          useDocStore.getState().updateElement(location.sceneId, location.layerId, elementId, { children: scaled } as Partial<Element>);
        }
      });
    },
    [project, scene, endGesture, commitTransform],
  );

  // The gfx2d layer new elements land in: the active layer if it's gfx2d, else
  // the top-most gfx2d layer, else a freshly-created one. Returns its id.
  const resolveTargetLayerId = useCallback((): ID | null => {
    if (!scene) return null;
    const active = scene.layers.find((l) => l.id === activeLayerId);
    if (active?.props.kind === "gfx2d") return active.id;
    const topGfx = [...scene.layers].reverse().find((l) => l.props.kind === "gfx2d");
    if (topGfx) return topGfx.id;
    const newId = addLayer(scene.id, "gfx2d");
    return newId;
  }, [scene, activeLayerId, addLayer]);

  const insert = useCallback(
    (make: (cx: number, cy: number) => Element, at?: { x: number; y: number }) => {
      if (!scene || !project) return;
      const layerId = resolveTargetLayerId();
      if (!layerId) return;
      const { width: pw, height: ph } = project.resolution;
      const el = make(at?.x ?? pw / 2, at?.y ?? ph / 2);
      setActiveLayer(layerId);
      addElement(scene.id, layerId, el);
    },
    [scene, project, resolveTargetLayerId, setActiveLayer, addElement],
  );

  // Drop target for the Asset Browser's drag source (dragAsset.ts) — drops
  // the real asset (already-filled image/lottie element, not an empty slot)
  // centered on the cursor. Recomputes the fit-scale from `project`/
  // `containerSize` directly (rather than closing over the `fitScale` const
  // declared later in this component, after the early-return) so this hook
  // can be declared up here with the rest of the hooks.
  const handleAssetDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData(ASSET_DRAG_MIME);
      const payload = raw ? parseAssetDrag(raw) : null;
      if (!payload || !project) return;
      e.preventDefault();
      const { width: pw, height: ph } = project.resolution;
      const scale = Math.min(containerSize.width / pw, containerSize.height / ph, 1) || 1;
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = (e.clientX - rect.left) / scale;
      const dropY = (e.clientY - rect.top) / scale;
      if (payload.kind === "image") {
        insert(
          (cx, cy) => createImageElement(payload.assetId, { transform: { x: cx - 100, y: cy - 100, width: 200, height: 200, rotation: 0 } }),
          { x: dropX, y: dropY },
        );
      } else {
        insert(
          (cx, cy) => createLottieElement(payload.assetId, { transform: { x: cx - 240, y: cy - 240, width: 480, height: 480, rotation: 0 } }),
          { x: dropX, y: dropY },
        );
      }
    },
    [insert, project, containerSize],
  );

  // Keyboard authoring: arrow-nudge (Shift = 10px), Ctrl/Cmd+D duplicate,
  // Delete/Backspace remove. Reads fresh store state so no stale closures, and
  // yields to any focused input (Inspector fields, the inline text editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const st = useDocStore.getState();
      const ids = st.selectedElementIds;
      if (ids.length === 0 || !st.project) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        for (const id of ids) {
          const loc = locateElement(st.project, id);
          if (loc) st.duplicateElement(loc.sceneId, loc.layerId, id);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        if (e.shiftKey) {
          // Ungroup the single selected group.
          if (ids.length === 1) {
            const loc = locateElement(st.project, ids[0]);
            const layer = loc && st.project.scenes.find((s) => s.id === loc.sceneId)?.layers.find((l) => l.id === loc.layerId);
            const el = layer && layer.props.kind === "gfx2d" ? layer.props.elements.find((x) => x.id === ids[0]) : undefined;
            if (loc && el?.kind === "group") st.ungroupElement(loc.sceneId, loc.layerId, ids[0]);
          }
        } else if (ids.length >= 2) {
          const loc = locateElement(st.project, ids[0]);
          if (loc) {
            const same = ids.filter((id) => locateElement(st.project!, id)?.layerId === loc.layerId);
            if (same.length >= 2) st.groupElements(loc.sceneId, loc.layerId, same);
          }
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        for (const id of ids) {
          const loc = locateElement(st.project, id);
          if (loc) st.removeElement(loc.sceneId, loc.layerId, id);
        }
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) {
        e.preventDefault();
        for (const id of ids) {
          const loc = locateElement(st.project, id);
          if (!loc) continue;
          const layer = st.project.scenes.find((s) => s.id === loc.sceneId)?.layers.find((l) => l.id === loc.layerId);
          const el = layer?.props.kind === "gfx2d" ? layer.props.elements.find((x) => x.id === id) : undefined;
          if (!el) continue;
          st.commitTransform(loc.sceneId, loc.layerId, id, {
            ...el.transform,
            x: el.transform.x + delta[0],
            y: el.transform.y + delta[1],
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Align every selected element to the canvas (project resolution) — the
  // common single-selection case; multi-selection aligns each independently.
  const align = useCallback(
    (edge: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") => {
      if (!project) return;
      const { width: pw, height: ph } = project.resolution;
      for (const id of selectedElementIds) {
        const loc = locateElement(project, id);
        if (!loc) continue;
        const layer = scene?.layers.find((l) => l.id === loc.layerId);
        const el = layer?.props.kind === "gfx2d" ? layer.props.elements.find((x) => x.id === id) : undefined;
        if (!el) continue;
        const t = el.transform;
        const next = { ...t };
        if (edge === "left") next.x = 0;
        else if (edge === "hcenter") next.x = (pw - t.width) / 2;
        else if (edge === "right") next.x = pw - t.width;
        else if (edge === "top") next.y = 0;
        else if (edge === "vmiddle") next.y = (ph - t.height) / 2;
        else if (edge === "bottom") next.y = ph - t.height;
        commitTransform(loc.sceneId, loc.layerId, id, next);
      }
    },
    [project, scene, selectedElementIds, commitTransform],
  );

  const zorder = useCallback(
    (dir: 1 | -1) => {
      if (!project) return;
      const id = selectedElementIds[0];
      if (!id) return;
      const loc = locateElement(project, id);
      const layer = loc && scene?.layers.find((l) => l.id === loc.layerId);
      if (!loc || !layer || layer.props.kind !== "gfx2d") return;
      const from = layer.props.elements.findIndex((e) => e.id === id);
      const to = Math.max(0, Math.min(layer.props.elements.length - 1, from + dir));
      if (to !== from) useDocStore.getState().reorderElement(loc.sceneId, loc.layerId, id, to);
    },
    [project, scene, selectedElementIds],
  );

  if (!project || !scene) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center bg-bg-deepest">
        <span className="font-mono text-xs text-text-muted">Loading project…</span>
      </div>
    );
  }

  const { width: projW, height: projH } = project.resolution;
  const fitScale = Math.min(containerSize.width / projW, containerSize.height / projH, 1) || 1;
  const stageWidth = projW * fitScale;
  const stageHeight = projH * fitScale;
  const sortedLayers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  const setLayers = sortedLayers.filter((l) => l.visible && l.props.kind === "set3d");

  // Locate the element being inline-edited so the textarea can be positioned
  // and sized to match its on-canvas rect exactly.
  const editing = editingTextId ? findGfx2dElement(scene.layers, editingTextId) : null;
  const editingEl = editing && editing.el.kind === "text" ? editing.el : null;

  const commitText = (value: string) => {
    if (editing && editingEl) updateElement(scene.id, editing.layerId, editingEl.id, { text: value });
    setEditingTextId(null);
  };

  const hasGfxSelection = selectedElementIds.length > 0;

  // Pointer position in project (authoring) coordinates.
  const pointerProject = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const st = e.target.getStage();
    const pos = st?.getPointerPosition();
    return pos ? { x: pos.x / fitScale, y: pos.y / fitScale } : null;
  };

  // The single gfx2d layer multi-select/group operate within (active, else top).
  const gfxPickLayerId = (): ID | null => {
    const active = scene.layers.find((l) => l.id === activeLayerId);
    if (active?.props.kind === "gfx2d") return active.id;
    return [...scene.layers].reverse().find((l) => l.props.kind === "gfx2d")?.id ?? null;
  };

  // Shift/Ctrl-click toggles, but keeps a multi-selection within one layer so
  // the Transformer and grouping stay coherent; clicking into another layer
  // starts a fresh selection there.
  const selectAdditive = (id: string, additive: boolean) => {
    const cur = useDocStore.getState().selectedElementIds;
    if (!additive || cur.length === 0) {
      selectElements([id]);
      return;
    }
    const curLoc = locateElement(project, cur[0]);
    const newLoc = locateElement(project, id);
    if (curLoc && newLoc && curLoc.layerId === newLoc.layerId) {
      selectElements(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    } else {
      selectElements([id]);
    }
  };

  const marqueeSelect = (m: { x0: number; y0: number; x1: number; y1: number }) => {
    const layerId = gfxPickLayerId();
    const layer = layerId ? scene.layers.find((l) => l.id === layerId) : undefined;
    if (!layer || layer.props.kind !== "gfx2d") return;
    const x0 = Math.min(m.x0, m.x1);
    const x1 = Math.max(m.x0, m.x1);
    const y0 = Math.min(m.y0, m.y1);
    const y1 = Math.max(m.y0, m.y1);
    const hit = layer.props.elements
      .filter((el) => {
        const t = el.transform;
        return !(t.x > x1 || t.x + t.width < x0 || t.y > y1 || t.y + t.height < y0);
      })
      .map((el) => el.id);
    selectElements(hit);
  };

  const group = () => {
    const ids = useDocStore.getState().selectedElementIds;
    if (ids.length < 2) return;
    const loc = locateElement(project, ids[0]);
    if (!loc) return;
    const sameLayer = ids.filter((id) => locateElement(project, id)?.layerId === loc.layerId);
    if (sameLayer.length >= 2) useDocStore.getState().groupElements(loc.sceneId, loc.layerId, sameLayer);
  };

  const selectedIsGroup = (() => {
    if (selectedElementIds.length !== 1) return false;
    const loc = locateElement(project, selectedElementIds[0]);
    const layer = loc && scene.layers.find((l) => l.id === loc.layerId);
    const el = layer && layer.props.kind === "gfx2d" ? layer.props.elements.find((e) => e.id === selectedElementIds[0]) : undefined;
    return el?.kind === "group";
  })();

  const ungroup = () => {
    if (!selectedIsGroup) return;
    const loc = locateElement(project, selectedElementIds[0]);
    if (loc) useDocStore.getState().ungroupElement(loc.sceneId, loc.layerId, selectedElementIds[0]);
  };

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-bg-deepest">
      <ElementToolbar
        onInsertRect={() =>
          insert((cx, cy) =>
            createRectElement({ name: "Rectangle", transform: { x: cx - 200, y: cy - 70, width: 400, height: 140, rotation: 0 } }),
          )
        }
        onInsertText={() =>
          insert((cx, cy) =>
            createTextElement({ name: "Text", text: "New text", fontSize: 48, align: "center", transform: { x: cx - 250, y: cy - 30, width: 500, height: 60, rotation: 0 } }),
          )
        }
        onInsertImage={() => insert((cx, cy) => createImageSlot("Image", { x: cx - 150, y: cy - 150, width: 300, height: 300 }))}
        onInsertVideo={() =>
          insert((cx, cy) =>
            createVideoElement({ name: "Video", transform: { x: cx - 320, y: cy - 180, width: 640, height: 360, rotation: 0 } }),
          )
        }
        onDuplicate={() => {
          const st = useDocStore.getState();
          for (const id of st.selectedElementIds) {
            const loc = locateElement(st.project!, id);
            if (loc) st.duplicateElement(loc.sceneId, loc.layerId, id);
          }
        }}
        onForward={() => zorder(1)}
        onBackward={() => zorder(-1)}
        onAlign={align}
        onGroup={group}
        onUngroup={ungroup}
        canGroup={selectedElementIds.length >= 2}
        canUngroup={selectedIsGroup}
        hasSelection={hasGfxSelection}
      />

      <div
        style={{ width: stageWidth, height: stageHeight }}
        className="relative shadow-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAssetDrop}
      >
        {showSetBackdrop &&
          setLayers.map((layer) => (
            <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity, pointerEvents: "none" }}>
              {/* No `audible` prop — defaults to false. This is the
                  authoring backdrop; live/video sources must stay silent
                  while composing graphics. */}
              <Set3dRenderer
                layer={layer}
                assets={project.assets}
                project={project}
                programSceneId={programSceneId}
                previewSceneId={previewSceneId}
              />
            </div>
          ))}
        <Stage
          width={stageWidth}
          height={stageHeight}
          scaleX={fitScale}
          scaleY={fitScale}
          onMouseDown={(e) => {
            // Empty-canvas press starts a marquee; a click that doesn't drag
            // clears the selection (handled on mouse-up).
            if (e.target === e.target.getStage()) {
              const p = pointerProject(e);
              if (p) {
                marqueeRef.current = true;
                setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }
            }
          }}
          onMouseMove={(e) => {
            if (!marqueeRef.current) return;
            const p = pointerProject(e);
            if (p) setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
          }}
          onMouseUp={() => {
            if (!marqueeRef.current) return;
            marqueeRef.current = false;
            if (marquee) {
              const moved = Math.abs(marquee.x1 - marquee.x0) > 4 || Math.abs(marquee.y1 - marquee.y0) > 4;
              if (moved) marqueeSelect(marquee);
              else selectElements([]);
            }
            setMarquee(null);
          }}
        >
          <KonvaLayer>
            {sortedLayers.map((layer) => {
              if (layer.props.kind !== "gfx2d") return null;
              const interactive = layer.visible && !layer.locked;
              const playback = layerPlayback[layer.id];
              // Authoring always shows the layer at rest regardless of on-air
              // state — Play In/Out here is a rehearsal preview, not a gate
              // (unlike DocumentRenderer's Program/Preview, which only shows
              // a timelined layer once it's actually been triggered).
              const renderEl = (el: (typeof layer.props.elements)[number]) => {
                let resolved = resolveElement(el, dataValues);
                if (layer.timeline && playback) {
                  resolved = applyPlayback(resolved, elapsedSeconds(playback), layer.timeline, playback.phase);
                }
                // Unconditional (not gated by playback) — a ticker's resting
                // state for authoring purposes IS scrolling, same rationale
                // as GfxEditor always showing other layers at rest.
                if (layer.scrollSpeed) {
                  resolved = applyScroll(resolved, Date.now() / 1000, layer.scrollSpeed, layer.transform.width);
                }
                // Unconditional too — a loop pulse is always "on" while the
                // layer is shown, not gated by IN/OUT playback.
                resolved = applyElementLoop(resolved, Date.now() / 1000);
                return resolved;
              };
              return (
                <KonvaGroup key={layer.id} opacity={layer.opacity} visible={layer.visible}>
                  {layer.props.elements.map((el) =>
                    renderElement(renderEl(el), {
                      interactive,
                      assets: project?.assets,
                      onSelect: selectAdditive,
                      registerNodeRef,
                      onDragStart: beginGesture,
                      onDragEnd: handleDragEnd,
                      onTransformStart: beginGesture,
                      onTransformEnd: handleTransformEnd,
                      onRequestEdit: (id) => {
                        const hit = findGfx2dElement(scene.layers, id);
                        if (hit?.el.kind === "text") {
                          selectElements([id]);
                          setEditingTextId(id);
                        }
                      },
                    }),
                  )}
                </KonvaGroup>
              );
            })}
            <KonvaGroup listening={false}>
              <SafeAreas width={projW} height={projH} />
            </KonvaGroup>
            {marquee && (
              <KonvaRect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="rgba(74,144,217,0.12)"
                stroke="#4a90d9"
                strokeWidth={1 / fitScale}
                dash={[4 / fitScale, 4 / fitScale]}
              />
            )}
            <Transformer ref={transformerRef} rotateEnabled resizeEnabled />
          </KonvaLayer>
        </Stage>

        {/* Inline text editor overlaid exactly over the element's canvas rect. */}
        {editingEl && (
          <textarea
            autoFocus
            defaultValue={editingEl.text}
            onBlur={(e) => commitText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitText((e.target as HTMLTextAreaElement).value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingTextId(null);
              }
              e.stopPropagation();
            }}
            style={{
              position: "absolute",
              left: editingEl.transform.x * fitScale,
              top: editingEl.transform.y * fitScale,
              width: editingEl.transform.width * fitScale,
              height: editingEl.transform.height * fitScale,
              fontSize: editingEl.fontSize * fitScale,
              fontFamily: editingEl.fontFamily,
              color: editingEl.fill,
              textAlign: editingEl.align,
              lineHeight: 1,
              background: "rgba(6,10,24,0.85)",
              border: "1px solid #4a90d9",
              outline: "none",
              resize: "none",
              padding: 0,
              margin: 0,
              overflow: "hidden",
              zIndex: 20,
            }}
          />
        )}
      </div>
      <button
        onClick={() => setShowSetBackdrop((v) => !v)}
        title={showSetBackdrop ? "Hide virtual-set backdrop" : "Show virtual-set backdrop (design over the program picture)"}
        className={`absolute right-2 top-2 flex items-center gap-1 rounded border px-1.5 py-1 font-mono text-[10px] ${
          showSetBackdrop
            ? "border-accent-blue bg-bg-surface text-accent-blue-bright"
            : "border-border-subtle bg-bg-surface text-text-muted"
        }`}
      >
        <Clapperboard className="h-3 w-3" /> SET
      </button>
    </div>
  );
}

/** Finds a gfx2d element in a scene's layers (top level only — groups are
 * edited via the outliner), returning it with its owning layer id. */
function findGfx2dElement(layers: Layer[], elementId: ID): { layerId: ID; el: Element } | null {
  for (const layer of layers) {
    if (layer.props.kind !== "gfx2d") continue;
    const el = layer.props.elements.find((e) => e.id === elementId);
    if (el) return { layerId: layer.id, el };
  }
  return null;
}

function ToolBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-6 w-6 items-center justify-center rounded border border-border-subtle bg-bg-surface text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright disabled:opacity-30 disabled:hover:border-border-subtle"
    >
      {children}
    </button>
  );
}

function ElementToolbar({
  onInsertRect,
  onInsertText,
  onInsertImage,
  onInsertVideo,
  onDuplicate,
  onForward,
  onBackward,
  onAlign,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
  hasSelection,
}: {
  onInsertRect: () => void;
  onInsertText: () => void;
  onInsertImage: () => void;
  onInsertVideo: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBackward: () => void;
  onAlign: (edge: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") => void;
  onGroup: () => void;
  onUngroup: () => void;
  canGroup: boolean;
  canUngroup: boolean;
  hasSelection: boolean;
}) {
  return (
    <div className="absolute left-2 top-2 z-10 flex flex-col gap-1 rounded border border-border-subtle bg-bg-panel/90 p-1 backdrop-blur">
      <div className="flex gap-1">
        <ToolBtn title="Add rectangle" onClick={onInsertRect}><Square className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Add text (double-click on canvas to edit)" onClick={onInsertText}><Type className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Add image slot" onClick={onInsertImage}><ImageIcon className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Add video" onClick={onInsertVideo}><Film className="h-3.5 w-3.5" /></ToolBtn>
      </div>
      <div className="flex gap-1">
        <ToolBtn title="Duplicate (Ctrl+D)" onClick={onDuplicate} disabled={!hasSelection}><Copy className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Bring forward" onClick={onForward} disabled={!hasSelection}><ChevronUp className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Send backward" onClick={onBackward} disabled={!hasSelection}><ChevronDown className="h-3.5 w-3.5" /></ToolBtn>
      </div>
      <div className="flex gap-1">
        <ToolBtn title="Group selection (Ctrl+G) — move as one unit" onClick={onGroup} disabled={!canGroup}><GroupIcon className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Ungroup (Ctrl+Shift+G)" onClick={onUngroup} disabled={!canUngroup}><UngroupIcon className="h-3.5 w-3.5" /></ToolBtn>
      </div>
      <div className="flex gap-1">
        <ToolBtn title="Align left" onClick={() => onAlign("left")} disabled={!hasSelection}><AlignHorizontalJustifyStart className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Center horizontally" onClick={() => onAlign("hcenter")} disabled={!hasSelection}><AlignHorizontalJustifyCenter className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Align right" onClick={() => onAlign("right")} disabled={!hasSelection}><AlignHorizontalJustifyEnd className="h-3.5 w-3.5" /></ToolBtn>
      </div>
      <div className="flex gap-1">
        <ToolBtn title="Align top" onClick={() => onAlign("top")} disabled={!hasSelection}><AlignVerticalJustifyStart className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Center vertically" onClick={() => onAlign("vmiddle")} disabled={!hasSelection}><AlignVerticalJustifyCenter className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Align bottom" onClick={() => onAlign("bottom")} disabled={!hasSelection}><AlignVerticalJustifyEnd className="h-3.5 w-3.5" /></ToolBtn>
      </div>
    </div>
  );
}
