import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createLayer, defaultSetEnvironment, defaultSetRenderSettings } from "@/document/factory";
import { buildDataValues, useDataStore } from "@/document/dataSources";
import { settingsForQualityTier } from "@/document/qualityTiers";
import type { ARTemplate } from "@/ar-engine/types";
import type { Layer, SetNode } from "@/document/types";
import { PREVIEW_THUMB_PX } from "@/components/ui/broadcast";
import { useDocStore } from "@/document/store";
import { peekArTemplateSnapshot, requestArTemplateSnapshot } from "./arTemplateSnapshotQueue";

const previewLayerCache = new Map<string, Layer>();

function bakeArPreviewNodes(nodes: SetNode[], values: Record<string, string>): SetNode[] {
  return nodes.map((node) => {
    if (node.kind === "group") return { ...node, children: bakeArPreviewNodes(node.children, values) };
    if (node.kind === "text3d" && node.bindings?.length) {
      const binding = node.bindings.find((b) => b.targetPath === "text") ?? node.bindings[0];
      const raw = values[binding.source];
      const resolved =
        raw !== undefined
          ? binding.format
            ? binding.format.replace("{value}", raw)
            : raw
          : (binding.fallback ?? node.text);
      return { ...node, text: String(resolved), bindings: undefined };
    }
    if (node.kind === "primitive" && node.bindings?.length) {
      const binding = node.bindings.find((b) => b.targetPath === "textureUrl");
      if (binding) {
        const raw = values[binding.source];
        const resolved = raw !== undefined ? String(raw).trim() : String(binding.fallback ?? "");
        return {
          ...node,
          bindings: [{ targetPath: "textureUrl", source: "__preview__", fallback: resolved }],
        };
      }
    }
    return node;
  });
}

function buildPreviewLayer(template: ARTemplate): Layer {
  const cached = previewLayerCache.get(template.id);
  if (cached) return cached;

  const values = buildDataValues(useDataStore.getState());
  const nodes = bakeArPreviewNodes(template.create(), values);
  const env = defaultSetEnvironment();
  const layer = createLayer("set3d", { name: template.name, visible: true });
  const preview: Layer = {
    ...layer,
    props: {
      kind: "set3d",
      nodes,
      activeCameraId: null,
      environment: {
        ...env,
        grid: false,
        ambient: { ...env.ambient, intensity: 0.55 },
        floor: { ...env.floor, enabled: false, reflector: { ...env.floor.reflector, enabled: false } },
      },
      render: {
        ...defaultSetRenderSettings(),
        ...settingsForQualityTier("low"),
        exposure: 1.15,
        contactShadows: { enabled: false, opacity: 0, blur: 0 },
        planarReflection: { enabled: false, maxCount: 1 },
        envLight: { enabled: true, intensity: 0.3 },
      },
    },
  };
  previewLayerCache.set(template.id, preview);
  return preview;
}

/**
 * Authentic AR template preview as a cached PNG — rendered through ONE shared
 * WebGL context so the Build tab cannot exhaust the browser's context limit.
 */
export const ArTemplatePreview = memo(function ArTemplatePreview({ template }: { template: ARTemplate }) {
  const assets = useDocStore((s) => s.project?.assets ?? []);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState(() => peekArTemplateSnapshot(template.id) ?? "");
  const layer = useMemo(() => buildPreviewLayer(template), [template.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: "40px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void requestArTemplateSnapshot(template.id, layer, assets).then((dataUrl) => {
      if (!cancelled && dataUrl) setSrc(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, template.id, layer, assets]);

  return (
    <div
      ref={ref}
      className="relative mx-auto overflow-hidden rounded bg-bg-deepest"
      style={{ width: PREVIEW_THUMB_PX, height: PREVIEW_THUMB_PX, maxWidth: "100%" }}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-mono text-[8px] text-text-muted">…</div>
      )}
    </div>
  );
});
