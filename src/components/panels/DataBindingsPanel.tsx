import { useMemo, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDocStore, locateElement, locateSetNode, findSetNode } from "@/document/store";
import { useDataStore, buildDataValues } from "@/document/dataSources";
import type { Binding } from "@/document/types";
import { dataHub } from "@/ar-system/dataHub/dataHub";
import { resolveBinding } from "@/ar-system/binding/bindingEngine";
import { getBindableTargetPaths, GFX2D_BINDABLE_PATHS } from "@/ar-system/propertyRegistry";
import { getElectionBehaviourEvents, subscribeElectionBehaviours } from "@/ar-system/behaviour/electionBehaviour";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Link2 } from "lucide-react";

function groupKeys(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const key of keys) {
    const dot = key.indexOf(".");
    const prefix = dot === -1 ? "other" : key.slice(0, dot);
    (groups[prefix] ??= []).push(key);
  }
  for (const g of Object.values(groups)) g.sort();
  return groups;
}

/**
 * Visual data-binding editor — lists live source fields, the selected node's
 * active bindings, resolved Programme values, and recent behaviour events.
 */
export function DataBindingsPanel() {
  const [filter, setFilter] = useState("");
  const [targetPath, setTargetPath] = useState("text");
  const [pendingSource, setPendingSource] = useState<string | null>(null);

  const project = useDocStore((s) => s.project);
  const selectedElementIds = useDocStore((s) => s.selectedElementIds);
  const selectedNodeId = useDocStore((s) => s.selectedNodeId);
  const setElementBinding = useDocStore((s) => s.setElementBinding);
  const updateElementBinding = useDocStore((s) => s.updateElementBinding);
  const removeElementBinding = useDocStore((s) => s.removeElementBinding);
  const setSetNodeBinding = useDocStore((s) => s.setSetNodeBinding);
  const updateSetNodeBinding = useDocStore((s) => s.updateSetNodeBinding);
  const removeSetNodeBinding = useDocStore((s) => s.removeSetNodeBinding);

  const dataValues = useDataStore(useShallow(buildDataValues));
  const electionConn = useSyncExternalStore(
    (cb) => dataHub.subscribe(cb),
    () => dataHub.getConnection("election"),
    () => dataHub.getConnection("election"),
  );
  const behaviourEvents = useSyncExternalStore(subscribeElectionBehaviours, getElectionBehaviourEvents, getElectionBehaviourEvents);

  const filteredKeys = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.keys(dataValues).filter((k) => !q || k.toLowerCase().includes(q));
  }, [dataValues, filter]);

  const grouped = useMemo(() => groupKeys(filteredKeys), [filteredKeys]);

  const selection = useMemo(() => {
    if (!project) return null;
    if (selectedNodeId) {
      const loc = locateSetNode(project, selectedNodeId);
      if (!loc) return null;
      const layer = project.scenes.find((s) => s.id === loc.sceneId)?.layers.find((l) => l.id === loc.layerId);
      const node = layer?.props.kind === "set3d" ? findSetNode(layer.props.nodes, selectedNodeId) : undefined;
      if (!node) return null;
      return { kind: "set3d" as const, sceneId: loc.sceneId, layerId: loc.layerId, id: node.id, name: node.name, bindings: node.bindings ?? [], bindablePaths: getBindableTargetPaths(node) };
    }
    const elementId = selectedElementIds[0];
    if (!elementId) return null;
    const loc = locateElement(project, elementId);
    if (!loc) return null;
    const layer = project.scenes.find((s) => s.id === loc.sceneId)?.layers.find((l) => l.id === loc.layerId);
    const element = layer?.props.kind === "gfx2d" ? layer.props.elements.find((e) => e.id === elementId) : undefined;
    if (!element) return null;
    return {
      kind: "gfx2d" as const,
      sceneId: loc.sceneId,
      layerId: loc.layerId,
      id: element.id,
      name: element.name ?? element.kind,
      bindings: element.bindings,
      bindablePaths: [...GFX2D_BINDABLE_PATHS],
    };
  }, [project, selectedNodeId, selectedElementIds]);

  const addBinding = (source: string) => {
    if (!selection) return;
    const binding: Binding = { targetPath, source, fallback: dataValues[source] ?? "" };
    if (selection.kind === "set3d") {
      setSetNodeBinding(selection.sceneId, selection.layerId, selection.id, binding);
    } else {
      setElementBinding(selection.sceneId, selection.layerId, selection.id, binding);
    }
    setPendingSource(null);
  };

  const updateBinding = (index: number, updates: Partial<Binding>) => {
    if (!selection) return;
    if (selection.kind === "set3d") {
      updateSetNodeBinding(selection.sceneId, selection.layerId, selection.id, index, updates);
    } else {
      updateElementBinding(selection.sceneId, selection.layerId, selection.id, index, updates);
    }
  };

  const removeBinding = (index: number) => {
    if (!selection) return;
    if (selection.kind === "set3d") {
      removeSetNodeBinding(selection.sceneId, selection.layerId, selection.id, index);
    } else {
      removeElementBinding(selection.sceneId, selection.layerId, selection.id, index);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">DATA BINDINGS</span>
        {electionConn && (
          <span className="font-mono text-[9px] text-text-muted">election: {electionConn.status}</span>
        )}
      </div>

      <Input
        placeholder="Filter source keys…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-7 border-border-subtle bg-bg-surface font-mono text-[10px]"
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <div className="flex min-h-0 flex-col overflow-hidden rounded border border-border-subtle bg-bg-panel">
          <div className="border-b border-border-subtle px-2 py-1 font-mono text-[9px] uppercase text-text-muted">Source fields</div>
          <div className="flex-1 overflow-y-auto p-1">
            {Object.entries(grouped).map(([prefix, keys]) => (
              <div key={prefix} className="mb-2">
                <div className="px-1 font-mono text-[9px] text-text-muted">{prefix}.*</div>
                {keys.map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      setPendingSource(key);
                      if (selection) addBinding(key);
                    }}
                    className={`mb-0.5 flex w-full items-center justify-between rounded px-1.5 py-1 text-left font-mono text-[10px] hover:bg-bg-surface ${
                      pendingSource === key ? "bg-accent-blue/15 text-accent-blue-bright" : "text-text-muted-alt"
                    }`}
                    title={selection ? `Bind to ${targetPath}` : "Select a scene object first"}
                  >
                    <span className="truncate">{key}</span>
                    <span className="ml-1 shrink-0 text-[9px] text-text-muted">{dataValues[key]?.slice(0, 12)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded border border-border-subtle bg-bg-panel">
          <div className="border-b border-border-subtle px-2 py-1 font-mono text-[9px] uppercase text-text-muted">Active bindings</div>
          <div className="flex-1 overflow-y-auto p-2">
            {!selection && (
              <div className="font-mono text-[10px] text-text-muted">Select a 2D element or 3D node in Design / Studio / AR.</div>
            )}
            {selection && (
              <>
                <div className="mb-2 font-mono text-[10px] text-text-muted-alt">
                  <Link2 className="mr-1 inline h-3 w-3" />
                  {selection.name}
                </div>
                <div className="mb-2 flex items-center gap-1">
                  <Label className="shrink-0 text-[9px] text-text-muted">Target</Label>
                  <select
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                    className="h-6 flex-1 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[10px]"
                  >
                    {selection.bindablePaths.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 border-border-subtle px-1.5 text-[9px]"
                    disabled={!pendingSource}
                    onClick={() => pendingSource && addBinding(pendingSource)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {selection.bindings.length === 0 && (
                  <div className="text-[10px] text-text-muted">No bindings — click a source field to bind.</div>
                )}
                {selection.bindings.map((binding, i) => {
                  const resolved = resolveBinding(binding, { values: dataValues });
                  return (
                    <div key={i} className="mb-2 space-y-1 rounded border border-border-subtle bg-bg-surface p-2">
                      <div className="flex items-center gap-1">
                        <span className="w-16 shrink-0 truncate font-mono text-[9px] text-text-muted">{binding.targetPath}</span>
                        <select
                          value={binding.source}
                          onChange={(e) => updateBinding(i, { source: e.target.value })}
                          className="h-6 flex-1 rounded border border-border-subtle bg-bg-panel px-1 font-mono text-[10px]"
                        >
                          {Object.keys(dataValues).map((key) => (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => removeBinding(i)} className="shrink-0 hover:text-live-red">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <Input
                          placeholder="format"
                          value={binding.format ?? ""}
                          onChange={(e) => updateBinding(i, { format: e.target.value || undefined })}
                          className="h-6 border-border-subtle bg-bg-panel text-[9px]"
                        />
                        <Input
                          placeholder="fallback"
                          value={typeof binding.fallback === "string" ? binding.fallback : ""}
                          onChange={(e) => updateBinding(i, { fallback: e.target.value || undefined })}
                          className="h-6 border-border-subtle bg-bg-panel text-[9px]"
                        />
                      </div>
                      <div className="font-mono text-[9px] text-accent-blue-bright">
                        Programme: {resolved.value || "—"}
                        {resolved.usedFallback && " (fallback)"}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {behaviourEvents.length > 0 && (
        <div className="max-h-24 shrink-0 overflow-y-auto rounded border border-border-subtle bg-bg-deepest p-2">
          <div className="mb-1 font-mono text-[9px] uppercase text-text-muted">Recent behaviours</div>
          {behaviourEvents.slice(0, 5).map((ev, i) => (
            <div key={i} className="font-mono text-[9px] text-text-muted-alt">
              {ev.type === "leader-change" && `Leader: ${ev.from} → ${ev.to}`}
              {ev.type === "rank-change" && `Rank ${ev.candidate}: #${ev.fromRank} → #${ev.toRank}`}
              {ev.type === "source-stale" && "Data source stale — holding LKG"}
              {ev.type === "source-invalid" && `Invalid: ${ev.errors.join(", ")}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
