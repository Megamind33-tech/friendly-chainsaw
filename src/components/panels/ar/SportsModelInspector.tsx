import { useEffect, useMemo, useState } from "react";
import { useDocStore } from "@/document/store";
import { settingsForQualityTier } from "@/document/qualityTiers";
import type { Binding, GroupNode, ID, SetNode, UpdateAnim, VisibilityRule } from "@/document/types";
import {
  COLOUR_GROUPS,
  NEUTRAL_MATERIAL_PRESETS,
  OPTIONAL_SPORT_PROPS,
  PARAM_RANGES,
  colourPatchFor,
  findChildGroup,
  getSportsArModel,
  nodesInColourGroup,
  rebuildSportsArModel,
  resetSportsArModelGeometry,
  withSportProp,
  type ColourGroup,
  type SportsPanelParams,
} from "@/ar-engine/sportsPanels";
import { downloadSetNodeGlb } from "@/ar-engine/sportsPanels/glbExport";
import { NAMED_FORMATTERS } from "@/ar-system/binding/format";
import {
  loadSportsTestData,
  startSportsRestPolling,
  startSportsWebSocket,
  stopSportsRestPolling,
  stopSportsWebSocket,
  useSportsConnector,
} from "@/sports/sportsConnector";
import { Input } from "@/components/ui/input";
import { ArPanelBlock, arToolbarButtonClass } from "./arShared";

/**
 * Editor surface for a placed Sports AR Model (AR 3D Models > Sports
 * Graphics): parametric geometry with Reset-to-Reference, colour groups,
 * neutral material presets, AR placement modes, the Data Mapping table
 * (source → zone with formatter / fallback / visibility rule / update
 * animation), live data sources, performance tier and GLB export.
 */

const PLACEMENT_MODES = [
  ["worldLocked", "World locked"],
  ["floorAnchored", "Floor anchored"],
  ["cameraFacing", "Camera facing"],
  ["presenterAnchored", "Presenter anchored"],
  ["playerAnchored", "Player anchored"],
  ["screenSpace", "Screen-space AR"],
  ["free3D", "Free 3D"],
] as const;

const UPDATE_ANIMS: [UpdateAnim, string][] = [
  ["none", "No animation"],
  ["pulse", "Stat pulse"],
  ["flash", "Score flash"],
  ["fade", "Fade replace"],
];

const VIS_OPS: [VisibilityRule["op"] | "always", string][] = [
  ["always", "Always visible"],
  ["notEmpty", "Show when value present"],
  ["empty", "Show when value empty"],
  ["equals", "Show when equals…"],
  ["notEquals", "Hide when equals…"],
];

function ParamField({
  paramKey,
  value,
  onCommit,
}: {
  paramKey: keyof SportsPanelParams;
  value: number;
  onCommit: (key: keyof SportsPanelParams, value: number) => void;
}) {
  const range = PARAM_RANGES[paramKey];
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const num = parseFloat(draft);
    if (Number.isFinite(num) && num !== value) onCommit(paramKey, num);
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center justify-between gap-2 font-mono text-[9px] text-text-muted">
      <span className="truncate">{range.label}</span>
      <span className="flex items-center gap-1">
        <Input
          type="number"
          step={range.step}
          min={range.min}
          max={range.max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-6 w-20 border-border-subtle bg-bg-surface text-right font-mono text-[10px]"
        />
        <span className="w-3 text-text-muted">{range.unit}</span>
      </span>
    </label>
  );
}

export function SportsModelInspector({
  sceneId,
  layerId,
  root,
  dataKeys,
  onSaveVariant,
}: {
  sceneId: ID;
  layerId: ID;
  root: GroupNode;
  dataKeys: string[];
  onSaveVariant: () => void;
}) {
  const updateSetNode = useDocStore((s) => s.updateSetNode);
  const setSetRenderSettings = useDocStore((s) => s.setSetRenderSettings);
  const connector = useSportsConnector();
  const [status, setStatus] = useState<string | null>(null);
  const [recentColours, setRecentColours] = useState<string[]>([]);
  const [groupColour, setGroupColour] = useState<Record<string, string>>({});
  const [presetByGroup, setPresetByGroup] = useState<Record<string, string>>({});
  const [propId, setPropId] = useState(OPTIONAL_SPORT_PROPS[0]?.id ?? "");
  const [wsUrl, setWsUrl] = useState(connector.wsUrl);
  const [restUrl, setRestUrl] = useState(connector.restUrl);

  const model = root.arModel ? getSportsArModel(root.arModel.modelId) : undefined;
  const params = useMemo(
    () => ({ ...(model?.spec.defaults ?? {}), ...(root.arModel?.params ?? {}) }) as SportsPanelParams,
    [model, root.arModel],
  );
  const zones = findChildGroup(root, "CONTENT_ZONES")?.children ?? [];
  const sportsKeys = useMemo(() => {
    const keys = dataKeys.filter((k) => k.startsWith("sports.")).sort();
    return keys.length ? keys : dataKeys.slice().sort();
  }, [dataKeys]);

  if (!model || !root.arModel) {
    return <div className="p-3 font-mono text-[10px] text-text-muted">Select a Sports AR model (or one of its parts) to edit it.</div>;
  }

  const patchRoot = (fresh: GroupNode) => {
    updateSetNode(sceneId, layerId, root.id, { children: fresh.children, arModel: fresh.arModel } as Partial<SetNode>);
  };

  const commitParam = (key: keyof SportsPanelParams, value: number) => {
    const fresh = rebuildSportsArModel(root, { [key]: value } as Partial<SportsPanelParams>);
    if (fresh) {
      patchRoot(fresh);
      setStatus(`Rebuilt with ${String(key)} = ${value}`);
    }
  };

  const resetGeometry = () => {
    const fresh = resetSportsArModelGeometry(root);
    if (fresh) {
      patchRoot(fresh);
      setStatus("Geometry reset to reference");
    }
  };

  const applyColour = (group: ColourGroup, colour: string) => {
    const targets = nodesInColourGroup(root, group);
    for (const n of targets) {
      if (n.kind !== "primitive") continue;
      updateSetNode(sceneId, layerId, n.id, { material: { ...n.material, ...colourPatchFor(group, colour, n.material) } } as Partial<SetNode>);
    }
    setRecentColours((prev) => [colour, ...prev.filter((c) => c !== colour)].slice(0, 8));
    setStatus(`Applied ${colour} to ${targets.length} ${group} part(s)`);
  };

  const applyPreset = (group: ColourGroup, presetId: string) => {
    const preset = NEUTRAL_MATERIAL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const targets = nodesInColourGroup(root, group);
    for (const n of targets) {
      if (n.kind !== "primitive") continue;
      updateSetNode(sceneId, layerId, n.id, { material: { ...preset.material } } as Partial<SetNode>);
    }
    setStatus(`Applied ${preset.label} to ${targets.length} ${group} part(s)`);
  };

  const setZone = (zone: SetNode, updates: Partial<SetNode>) => updateSetNode(sceneId, layerId, zone.id, updates);

  const bindingOf = (zone: SetNode): Binding | undefined =>
    zone.bindings?.find((b) => b.targetPath === "text" || b.targetPath === "textureUrl");

  const setZoneBinding = (zone: SetNode, patch: Partial<Binding> & { clear?: boolean }) => {
    const targetPath = zone.kind === "primitive" ? "textureUrl" : "text";
    if (patch.clear) {
      setZone(zone, { bindings: undefined } as Partial<SetNode>);
      return;
    }
    const current = bindingOf(zone) ?? { targetPath, source: "", fallback: "" };
    const next: Binding = { ...current, targetPath, ...patch };
    setZone(zone, { bindings: next.source ? [next] : undefined } as Partial<SetNode>);
  };

  const placement = root.arPlacement ?? { mode: "worldLocked" as const };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold text-text-bright">{model.name}</span>
        <span className="rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[8px] text-text-muted">{model.id}</span>
        <span className="ml-auto font-mono text-[8px] text-text-muted">v{model.version}</span>
      </div>

      <ArPanelBlock title="Geometry">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {(Object.keys(PARAM_RANGES) as (keyof SportsPanelParams)[]).map((key) => (
            <ParamField key={key} paramKey={key} value={params[key]} onCommit={commitParam} />
          ))}
        </div>
        <button onClick={resetGeometry} className={`${arToolbarButtonClass} w-full`}>
          Reset Geometry to Reference
        </button>
      </ArPanelBlock>

      <ArPanelBlock title="Colours">
        {COLOUR_GROUPS.map((group) => (
          <div key={group} className="flex items-center gap-1.5 font-mono text-[9px] text-text-muted">
            <span className="w-24 truncate capitalize">{group}</span>
            <input
              type="color"
              value={groupColour[group] ?? "#ffffff"}
              onChange={(e) => setGroupColour((prev) => ({ ...prev, [group]: e.target.value }))}
              className="h-6 w-8 cursor-pointer rounded border border-border-subtle bg-bg-surface"
            />
            <Input
              value={groupColour[group] ?? "#ffffff"}
              onChange={(e) => setGroupColour((prev) => ({ ...prev, [group]: e.target.value }))}
              className="h-6 w-20 border-border-subtle bg-bg-surface font-mono text-[9px]"
            />
            <button onClick={() => applyColour(group, groupColour[group] ?? "#ffffff")} className={arToolbarButtonClass}>
              Apply
            </button>
          </div>
        ))}
        {recentColours.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[8px] text-text-muted">Recent:</span>
            {recentColours.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => setGroupColour((prev) => Object.fromEntries(COLOUR_GROUPS.map((g) => [g, prev[g] ?? c])) as Record<string, string>)}
                className="h-4 w-4 rounded border border-border-subtle"
                style={{ background: c }}
              />
            ))}
          </div>
        )}
        <button
          onClick={() => {
            const fresh = rebuildSportsArModel(root, {});
            if (fresh) {
              patchRoot(fresh);
              setStatus("Colours & materials reset to neutral default");
            }
          }}
          className={`${arToolbarButtonClass} w-full`}
        >
          Reset to neutral default
        </button>
      </ArPanelBlock>

      <ArPanelBlock title="Materials">
        {COLOUR_GROUPS.map((group) => (
          <div key={group} className="flex items-center gap-1.5 font-mono text-[9px] text-text-muted">
            <span className="w-24 truncate capitalize">{group}</span>
            <select
              value={presetByGroup[group] ?? ""}
              onChange={(e) => setPresetByGroup((prev) => ({ ...prev, [group]: e.target.value }))}
              className="h-6 min-w-0 flex-1 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px]"
            >
              <option value="">preset…</option>
              {NEUTRAL_MATERIAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => presetByGroup[group] && applyPreset(group, presetByGroup[group])}
              className={arToolbarButtonClass}
            >
              Apply
            </button>
          </div>
        ))}
      </ArPanelBlock>

      <ArPanelBlock title="AR Placement">
        <div className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
          <span className="w-16">Mode</span>
          <select
            value={placement.mode}
            onChange={(e) =>
              updateSetNode(sceneId, layerId, root.id, {
                arPlacement: { ...placement, mode: e.target.value as typeof placement.mode },
              } as Partial<SetNode>)
            }
            className="h-6 flex-1 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px]"
          >
            {PLACEMENT_MODES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {placement.mode === "cameraFacing" && (
          <label className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
            <span className="w-16">Strength</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={placement.cameraFacingStrength ?? 1}
              onChange={(e) =>
                updateSetNode(sceneId, layerId, root.id, {
                  arPlacement: { ...placement, cameraFacingStrength: Number(e.target.value) },
                } as Partial<SetNode>)
              }
              className="flex-1"
            />
          </label>
        )}
        {placement.mode === "screenSpace" && (
          <label className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
            <span className="w-16">Distance</span>
            <Input
              type="number"
              step={0.1}
              value={placement.screenDistance ?? 2.5}
              onChange={(e) =>
                updateSetNode(sceneId, layerId, root.id, {
                  arPlacement: { ...placement, screenDistance: Number(e.target.value) },
                } as Partial<SetNode>)
              }
              className="h-6 w-20 border-border-subtle bg-bg-surface font-mono text-[10px]"
            />
          </label>
        )}
        <div className="flex gap-1">
          <button
            onClick={() =>
              updateSetNode(sceneId, layerId, root.id, {
                transform: { ...root.transform, position: { ...root.transform.position, y: 0 } },
              } as Partial<SetNode>)
            }
            className={arToolbarButtonClass}
          >
            Ground snap
          </button>
          <button
            onClick={() =>
              updateSetNode(sceneId, layerId, root.id, {
                transform: { ...root.transform, rotation: { x: 0, y: 0, z: 0 } },
              } as Partial<SetNode>)
            }
            className={arToolbarButtonClass}
          >
            Level rotation
          </button>
        </div>
      </ArPanelBlock>

      <ArPanelBlock title="Data Mapping">
        <div className="space-y-1.5">
          {zones.map((zone) => {
            const binding = bindingOf(zone);
            const rule = zone.visibilityRule;
            return (
              <div key={zone.id} className="rounded border border-border-subtle bg-bg-deepest p-1.5">
                <div className="mb-1 flex items-center gap-1 font-mono text-[9px]">
                  <span className="font-bold text-text-muted-alt">{zone.slotLabel ?? zone.name}</span>
                  <span className="uppercase text-text-muted">({zone.kind === "primitive" ? "image" : "text"})</span>
                  {binding?.source && <span className="ml-auto truncate text-accent-blue-bright">{binding.source}</span>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <select
                    value={binding?.source ?? ""}
                    onChange={(e) => setZoneBinding(zone, e.target.value ? { source: e.target.value } : { clear: true })}
                    className="h-6 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px]"
                  >
                    <option value="">manual (unbound)</option>
                    {binding?.source && !sportsKeys.includes(binding.source) && <option value={binding.source}>{binding.source}</option>}
                    {sportsKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <select
                    value={binding?.format ?? ""}
                    onChange={(e) => setZoneBinding(zone, { format: e.target.value || undefined })}
                    disabled={!binding?.source}
                    className="h-6 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px] disabled:opacity-40"
                  >
                    <option value="">no formatter</option>
                    {NAMED_FORMATTERS.map((f) => (
                      <option key={f.id} value={f.arg ? `${f.id}:` : f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="fallback"
                    value={String(binding?.fallback ?? "")}
                    onChange={(e) => setZoneBinding(zone, { fallback: e.target.value })}
                    disabled={!binding?.source}
                    className="h-6 border-border-subtle bg-bg-surface font-mono text-[9px] disabled:opacity-40"
                  />
                  <select
                    value={(zone.updateAnim ?? "none") as string}
                    onChange={(e) => setZone(zone, { updateAnim: e.target.value as UpdateAnim } as Partial<SetNode>)}
                    className="h-6 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px]"
                  >
                    {UPDATE_ANIMS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule?.op ?? "always"}
                    onChange={(e) => {
                      const op = e.target.value as VisibilityRule["op"] | "always";
                      if (op === "always") setZone(zone, { visibilityRule: undefined } as Partial<SetNode>);
                      else
                        setZone(zone, {
                          visibilityRule: { source: rule?.source ?? binding?.source ?? "", op, value: rule?.value },
                        } as Partial<SetNode>);
                    }}
                    className="h-6 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px]"
                  >
                    {VIS_OPS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {(rule?.op === "equals" || rule?.op === "notEquals") && (
                    <Input
                      placeholder="compare value"
                      value={rule?.value ?? ""}
                      onChange={(e) => setZone(zone, { visibilityRule: { ...rule, value: e.target.value } } as Partial<SetNode>)}
                      className="h-6 border-border-subtle bg-bg-surface font-mono text-[9px]"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ArPanelBlock>

      <ArPanelBlock title="Data Sources">
        <button onClick={() => setStatus(`Test data: ${loadSportsTestData().applied} fields applied`)} className={`${arToolbarButtonClass} w-full`}>
          Load test data (simulator)
        </button>
        <div className="flex items-center gap-1">
          <Input
            placeholder="wss://… live feed"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            className="h-6 flex-1 border-border-subtle bg-bg-surface font-mono text-[9px]"
          />
          {connector.wsStatus === "live" || connector.wsStatus === "connecting" ? (
            <button onClick={() => stopSportsWebSocket()} className={`${arToolbarButtonClass} text-live-red`}>
              Stop
            </button>
          ) : (
            <button onClick={() => startSportsWebSocket(wsUrl)} className={arToolbarButtonClass}>
              WS
            </button>
          )}
          <span className={`font-mono text-[8px] ${connector.wsStatus === "live" ? "text-accent-blue-bright" : connector.wsStatus === "error" ? "text-live-red" : "text-text-muted"}`}>
            {connector.wsStatus}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Input
            placeholder="https://… REST endpoint"
            value={restUrl}
            onChange={(e) => setRestUrl(e.target.value)}
            className="h-6 flex-1 border-border-subtle bg-bg-surface font-mono text-[9px]"
          />
          {connector.restStatus === "polling" ? (
            <button onClick={() => stopSportsRestPolling()} className={`${arToolbarButtonClass} text-live-red`}>
              Stop
            </button>
          ) : (
            <button onClick={() => startSportsRestPolling(restUrl)} className={arToolbarButtonClass}>
              Poll
            </button>
          )}
          <span className={`font-mono text-[8px] ${connector.restStatus === "polling" ? "text-accent-blue-bright" : connector.restStatus === "error" ? "text-live-red" : "text-text-muted"}`}>
            {connector.restStatus}
          </span>
        </div>
        {connector.lastError && <div className="font-mono text-[8px] text-live-red">{connector.lastError}</div>}
        {connector.lastWarnings.length > 0 && (
          <div className="font-mono text-[8px] text-live-amber">dropped: {connector.lastWarnings.join(", ")}</div>
        )}
      </ArPanelBlock>

      <ArPanelBlock title="Performance & Modules">
        <div className="flex items-center gap-2 font-mono text-[9px] text-text-muted">
          <span className="w-16">Tier</span>
          {(["low", "standard", "high"] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => {
                const mapped = tier === "standard" ? "medium" : tier;
                setSetRenderSettings(sceneId, layerId, { ...settingsForQualityTier(mapped), qualityTier: mapped });
                setStatus(`Layer render tier: ${tier}`);
              }}
              className={arToolbarButtonClass}
            >
              {tier}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <select
            value={propId}
            onChange={(e) => setPropId(e.target.value)}
            className="h-6 flex-1 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[9px]"
          >
            {OPTIONAL_SPORT_PROPS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const next = withSportProp(root, propId);
              updateSetNode(sceneId, layerId, root.id, { children: next.children } as Partial<SetNode>);
              setStatus("Optional prop added (remove it from OPTIONAL_SPORT_PROPS in the stack)");
            }}
            className={arToolbarButtonClass}
          >
            Add prop
          </button>
        </div>
      </ArPanelBlock>

      <ArPanelBlock title="Save / Export">
        <div className="flex gap-1">
          <button onClick={onSaveVariant} className={`${arToolbarButtonClass} flex-1`}>
            Save variant
          </button>
          <button
            onClick={() => {
              void downloadSetNodeGlb(root, root.arModel!.modelId).then(
                () => setStatus("GLB exported"),
                (err) => setStatus(`GLB export failed: ${err instanceof Error ? err.message : String(err)}`),
              );
            }}
            className={`${arToolbarButtonClass} flex-1`}
          >
            Export GLB
          </button>
        </div>
      </ArPanelBlock>

      {status && <div className="truncate font-mono text-[9px] text-accent-blue-bright">{status}</div>}
    </div>
  );
}
