import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useOutputStatus } from "@/output/useOutputStatus";
import { useDocStore } from "@/document/store";
import { useBroadcastStore } from "@/broadcast/broadcastStore";
import { CHASE_PROGRAM_URL } from "@/broadcast/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Info, Copy, Plug, Unplug, Wrench } from "lucide-react";

/**
 * Broadcast output panel — Chase sidecar health, OBS WebSocket automation,
 * and vMix Web API browser input setup. NDI remains in NdiPanel.
 */
export function OutputStreamingPanel() {
  const status = useOutputStatus();
  const project = useDocStore((s) => s.project);
  const [copied, setCopied] = useState(false);

  const loadSettings = useBroadcastStore((s) => s.loadSettings);
  const obs = useBroadcastStore((s) => s.obs);
  const vmix = useBroadcastStore((s) => s.vmix);
  const obsState = useBroadcastStore((s) => s.obsState);
  const obsVersion = useBroadcastStore((s) => s.obsVersion);
  const obsLastError = useBroadcastStore((s) => s.obsLastError);
  const obsLastSetup = useBroadcastStore((s) => s.obsLastSetup);
  const vmixConnected = useBroadcastStore((s) => s.vmixConnected);
  const vmixVersion = useBroadcastStore((s) => s.vmixVersion);
  const vmixLastError = useBroadcastStore((s) => s.vmixLastError);
  const vmixLastSetup = useBroadcastStore((s) => s.vmixLastSetup);
  const patchObs = useBroadcastStore((s) => s.patchObs);
  const patchVmix = useBroadcastStore((s) => s.patchVmix);
  const connectObs = useBroadcastStore((s) => s.connectObs);
  const disconnectObs = useBroadcastStore((s) => s.disconnectObs);
  const setupObsBrowserSource = useBroadcastStore((s) => s.setupObsBrowserSource);
  const connectVmix = useBroadcastStore((s) => s.connectVmix);
  const setupVmixBrowser = useBroadcastStore((s) => s.setupVmixBrowser);

  const [obsBusy, setObsBusy] = useState(false);
  const [vmixBusy, setVmixBusy] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const width = project?.resolution.width ?? 1920;
  const height = project?.resolution.height ?? 720;
  const fps = project?.fps ?? 30;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs">
      <Section title="Chase program output">
        <div className="font-mono text-[9px] text-text-muted">
          Local sidecar URL for Browser Source / vMix Browser / manual setup. Transparent background when keyed in 3D.
        </div>
        <div className="mt-1 flex gap-1">
          <div className="flex-1 select-all rounded border border-border-subtle bg-bg-surface px-2 py-1.5 font-mono text-[10px] text-text-muted-alt">
            {CHASE_PROGRAM_URL}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 border-border-subtle"
            onClick={() => {
              void navigator.clipboard.writeText(CHASE_PROGRAM_URL).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        {copied && <div className="mt-1 font-mono text-[9px] text-accent-blue-bright">Copied</div>}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="consumer" value={status?.programState ?? "—"} />
          <Stat label="health" value={status ? `${status.healthPct.toFixed(0)}%` : "—"} />
          <Stat label="pulls/sec" value={status ? status.requestsPerSecond.toFixed(1) : "—"} />
          <Stat
            label={
              <span className="flex items-center gap-1">
                missed pulls
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-2.5 w-2.5 text-text-muted" />
                  </TooltipTrigger>
                  <TooltipContent>HTTP pull-rate proxy — not dropped video frames.</TooltipContent>
                </Tooltip>
              </span>
            }
            value={status ? status.missedPullsProxy.toFixed(0) : "—"}
          />
        </div>
      </Section>

      <Section title="OBS Studio (WebSocket)">
        <div className="font-mono text-[9px] text-text-muted">
          Enable WebSocket in OBS → Tools → WebSocket Server Settings. Connect to auto-create/update a Browser Source.
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Field label="Host" value={obs.host} onChange={(v) => patchObs({ host: v })} disabled={obsState === "connected"} />
          <Field label="Port" value={String(obs.port)} onChange={(v) => patchObs({ port: Number(v) || 4455 })} disabled={obsState === "connected"} />
          <div className="col-span-2">
            <Field
              label="Password"
              value={obs.password}
              onChange={(v) => patchObs({ password: v })}
              disabled={obsState === "connected"}
              type="password"
            />
          </div>
          <div className="col-span-2">
            <Field label="Input name" value={obs.inputName} onChange={(v) => patchObs({ inputName: v })} />
          </div>
        </div>
        <label className="mt-2 flex items-center gap-2 font-mono text-[10px] text-text-muted-alt">
          <input
            type="checkbox"
            checked={obs.autoSetupOnConnect}
            onChange={(e) => patchObs({ autoSetupOnConnect: e.target.checked })}
          />
          Auto-setup Browser Source on connect
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {obsState !== "connected" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-border-subtle text-[10px]"
              disabled={obsBusy}
              onClick={() => {
                setObsBusy(true);
                void connectObs().finally(() => setObsBusy(false));
              }}
            >
              <Plug className="h-3 w-3" /> {obsBusy ? "Connecting…" : "Connect OBS"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 gap-1 border-border-subtle text-[10px]" onClick={() => disconnectObs()}>
              <Unplug className="h-3 w-3" /> Disconnect
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-border-subtle text-[10px]"
            disabled={obsBusy || obsState !== "connected"}
            onClick={() => {
              setObsBusy(true);
              void setupObsBrowserSource(width, height, fps).finally(() => setObsBusy(false));
            }}
          >
            <Wrench className="h-3 w-3" /> Setup Browser Source
          </Button>
        </div>
        <StatusLine
          state={obsState}
          version={obsVersion}
          error={obsLastError}
          success={obsLastSetup}
        />
      </Section>

      <Section title="vMix (Web API)">
        <div className="font-mono text-[9px] text-text-muted">
          Enable Web Controller in vMix Settings. Uses HTTP API to add or navigate a Browser input to Chase.
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Field label="Host" value={vmix.host} onChange={(v) => patchVmix({ host: v })} />
          <Field label="Port" value={String(vmix.port)} onChange={(v) => patchVmix({ port: Number(v) || 8088 })} />
          <div className="col-span-2">
            <Field label="Input title" value={vmix.inputName} onChange={(v) => patchVmix({ inputName: v })} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-border-subtle text-[10px]"
            disabled={vmixBusy}
            onClick={() => {
              setVmixBusy(true);
              void connectVmix().finally(() => setVmixBusy(false));
            }}
          >
            <Plug className="h-3 w-3" /> Test connection
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-border-subtle text-[10px]"
            disabled={vmixBusy}
            onClick={() => {
              setVmixBusy(true);
              void setupVmixBrowser().finally(() => setVmixBusy(false));
            }}
          >
            <Wrench className="h-3 w-3" /> Setup Browser input
          </Button>
        </div>
        <StatusLine
          state={vmixConnected ? "connected" : "disconnected"}
          version={vmixVersion}
          error={vmixLastError}
          success={vmixLastSetup}
        />
      </Section>

      <Section title="Other software">
        <ul className="list-inside list-disc space-y-1 font-mono text-[9px] text-text-muted-alt">
          <li>
            <strong className="text-text-muted">NDI</strong> — use the NDI panel to send Program to OBS, vMix, or Tractor (video only today).
          </li>
          <li>
            <strong className="text-text-muted">Manual</strong> — paste the Chase URL into any Browser Source / Browser input.
          </li>
          <li>
            <strong className="text-text-muted">Resolution</strong> — project {width}×{height} @ {fps} fps (sent to OBS on setup).
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-panel p-2">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-text-muted-alt">{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] text-text-muted">{label}</div>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-7 border-border-subtle bg-bg-surface font-mono text-[10px]"
      />
    </div>
  );
}

function StatusLine({
  state,
  version,
  error,
  success,
}: {
  state: string;
  version: string | null;
  error: string | null;
  success: string | null;
}) {
  return (
    <div className="mt-2 space-y-0.5 font-mono text-[9px]">
      <div className={state === "connected" ? "text-live-red" : state === "error" ? "text-live-amber" : "text-text-muted"}>
        {state === "connected" ? "● connected" : state === "connecting" ? "… connecting" : state === "error" ? "✗ error" : "○ disconnected"}
        {version ? ` — ${version}` : ""}
      </div>
      {error && <div className="text-live-red">{error}</div>}
      {success && <div className="text-accent-blue-bright">{success}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-surface px-2 py-1.5 font-mono">
      <div className="text-[9px] text-text-muted">{label}</div>
      <div className="text-text-muted-alt">{value}</div>
    </div>
  );
}
