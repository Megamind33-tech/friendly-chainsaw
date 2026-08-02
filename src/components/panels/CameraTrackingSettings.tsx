import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";

/**
 * FreeD camera tracking (see src-tauri/src/freed.rs).
 *
 * Deliberately explicit about what is and is not proven: the protocol decoder
 * is unit-tested against its own builder, which cannot demonstrate conformance
 * with a physical tracker. Until someone points a real Mo-Sys/Stype feed at
 * it, the packet counters below are the honest evidence — a rising accepted
 * count means the wire format matches, a rising rejected count means it does
 * not.
 */

interface FreedPose {
  cameraId: number;
  panDeg: number;
  tiltDeg: number;
  rollDeg: number;
  xM: number;
  yM: number;
  zM: number;
  zoomRaw: number;
  focusRaw: number;
}

interface FreedStatus {
  enabled: boolean;
  port: number;
  listening: boolean;
  /** True while the built-in synthetic tracker is emitting. */
  simulated: boolean;
  error: string | null;
  packetsReceived: number;
  packetsRejected: number;
  lastPose: FreedPose | null;
}

interface FreedConfig {
  enabled: boolean;
  port: number;
  cameraId: number | null;
}

const POLL_MS = 1000;

export function CameraTrackingSettings() {
  const [status, setStatus] = useState<FreedStatus | null>(null);
  const [port, setPort] = useState("6301");
  const [cameraId, setCameraId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await invoke<FreedStatus>("get_freed_status");
        if (cancelled) return;
        setStatus(next);
      } catch {
        // Outside Tauri there is no IPC; render nothing rather than claim a
        // failure that has not been observed.
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Seed the inputs once from what the backend actually has, then leave them
  // alone so polling cannot overwrite an operator mid-edit.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !status) return;
    setPort(String(status.port));
    setSeeded(true);
  }, [status, seeded]);

  const apply = async (enabled: boolean) => {
    setBusy(true);
    setSaveError(null);
    const parsedPort = Number(port);
    const parsedCamera = cameraId.trim() === "" ? null : Number(cameraId);
    const config: FreedConfig = {
      enabled,
      port: Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 6301,
      cameraId: parsedCamera !== null && Number.isFinite(parsedCamera) ? parsedCamera : null,
    };
    try {
      setStatus(await invoke<FreedStatus>("set_freed_config", { config }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const receiving = status?.listening && status.packetsReceived > 0;
  const simulated = status?.simulated === true;
  // Generated motion is never presented as a real camera — the same rule the
  // election feed had to be fixed to obey.
  const live = receiving && !simulated;

  const toggleSimulator = async (enabled: boolean) => {
    setBusy(true);
    try {
      setStatus(await invoke<FreedStatus>("set_freed_simulator", { enabled }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">CAMERA TRACKING (FreeD)</span>
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wide ${
            simulated
              ? "border-live-amber text-live-amber"
              : live
                ? "border-accent-blue text-accent-blue-bright"
                : status?.listening
                  ? "border-live-amber text-live-amber"
                  : "border-border-subtle text-text-muted"
          }`}
          title={
            simulated
              ? "Generated motion from the built-in simulator — NOT a real camera"
              : live
                ? "Receiving tracking packets from a real source"
                : status?.listening
                  ? "Socket open, but no valid packets yet"
                  : "Not listening"
          }
        >
          {simulated ? "SIMULATED" : live ? "Tracking" : status?.listening ? "Waiting" : "Off"}
        </span>
      </div>

      <div className="space-y-2 rounded border border-border-subtle bg-bg-panel p-2">
        <div className="font-mono text-[9px] leading-relaxed text-text-muted">
          Locks a virtual set's render camera to a physically tracked studio camera. Enable it per set in the Set
          Inspector — a scene can hold a tracked AR set and an untracked backplate at the same time.
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 font-mono text-[9px] text-text-muted">UDP port</span>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="h-6 w-20 border-border-subtle bg-bg-surface font-mono text-[10px]"
          />
          <span className="w-12 shrink-0 font-mono text-[9px] text-text-muted">Camera</span>
          <Input
            placeholder="any"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            className="h-6 w-16 border-border-subtle bg-bg-surface font-mono text-[10px]"
            title="Accept only this camera id; blank accepts every camera on the wire"
          />
        </div>

        <div className="flex gap-1.5">
          <button
            disabled={busy}
            onClick={() => void apply(true)}
            className="flex-1 rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active disabled:opacity-40"
          >
            {status?.enabled ? "Restart listener" : "Start listening"}
          </button>
          <button
            disabled={busy || !status?.enabled}
            onClick={() => void apply(false)}
            className="flex-1 rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-live-red disabled:opacity-40"
          >
            Stop
          </button>
        </div>

        {/* Lets the whole chain — encode, UDP, checksum, camera filter, SSE,
            render camera — be exercised without a physical tracker. It sends
            real datagrams to the real listener, so a green result means the
            path works; it cannot prove wire conformance, since it speaks this
            app's own encoder. */}
        <button
          disabled={busy || !status?.listening}
          onClick={() => void toggleSimulator(!simulated)}
          className={`w-full rounded border px-2 py-1 font-mono text-[9px] disabled:opacity-40 ${
            simulated
              ? "border-live-amber text-live-amber"
              : "border-border-subtle text-text-muted-alt hover:border-stripe-active"
          }`}
          title={
            status?.listening
              ? "Emit generated FreeD packets to the listener for bench testing"
              : "Start the listener first"
          }
        >
          {simulated ? "Stop simulated tracker" : "Simulate a tracker (no hardware)"}
        </button>
        {simulated && (
          <div className="font-mono text-[9px] text-live-amber">
            Generated motion — this is not a real camera. Stop it before going to air.
          </div>
        )}

        {(saveError || status?.error) && (
          <div className="break-all font-mono text-[9px] text-live-red">{saveError ?? status?.error}</div>
        )}

        {status && status.enabled && (
          <div className="space-y-0.5 font-mono text-[9px] text-text-muted">
            <div>
              Accepted {status.packetsReceived} · rejected{" "}
              {/* A non-zero reject count with a live feed means the wire format
                  does not match this decoder — the single most useful signal
                  for an integration that has never met real hardware. */}
              <span className={status.packetsRejected > 0 ? "text-live-red" : undefined}>
                {status.packetsRejected}
              </span>
            </div>
            {status.lastPose && (
              <div>
                cam {status.lastPose.cameraId} · pan {status.lastPose.panDeg.toFixed(2)}° tilt{" "}
                {status.lastPose.tiltDeg.toFixed(2)}° roll {status.lastPose.rollDeg.toFixed(2)}°
                <br />
                x {status.lastPose.xM.toFixed(3)}m y {status.lastPose.yM.toFixed(3)}m z{" "}
                {status.lastPose.zM.toFixed(3)}m · zoom {status.lastPose.zoomRaw}
              </div>
            )}
            {status.packetsRejected > 0 && (
              <div className="text-live-red">
                Packets are being rejected — check the tracker is sending FreeD D1 (29-byte) messages.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
