// @ts-check
/**
 * Bitfocus Companion module for the Broadcast Graphics Engine (Phase 7).
 *
 * Speaks the HTTP+SSE control protocol defined in
 * ../../docs/PHASE7_DESIGN.md. Actions POST to /control/command; feedbacks
 * subscribe to /control/state/stream and repaint buttons whenever the
 * snapshot changes.
 *
 * Standalone Node package — Companion loads it as a plugin. Distribute by
 * pointing Companion at the containing directory; it reads `manifest.json`
 * and this entrypoint.
 */

import {
  InstanceBase,
  InstanceStatus,
  Regex,
  runEntrypoint,
} from "@companion-module/base";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4977;

/**
 * @typedef {{
 *   programSceneId: string | null,
 *   previewSceneId: string | null,
 *   onAir: boolean,
 *   currentItemId: string | null,
 *   currentItemTitle: string | null,
 *   currentItemProgress: number,
 *   currentItemDuration: number,
 *   nextItemTitle: string | null,
 *   isSchedulePlaying: boolean,
 *   recording: { active: boolean, path: string | null, startedAt: number | null },
 *   ndi: { streaming: boolean, connections: number },
 *   sceneCount: number,
 *   layerCount: number,
 *   seq: number,
 *   timestamp: number,
 * }} ControlStateSnapshot
 */

class BroadcastGraphicsEngineInstance extends InstanceBase {
  constructor(internal) {
    super(internal);

    /** @type {ControlStateSnapshot | null} */
    this.snapshot = null;
    /** @type {AbortController | null} */
    this.streamAbort = null;
    this.seq = 0;
    this.config = { host: DEFAULT_HOST, port: DEFAULT_PORT };
  }

  async init(config) {
    this.config = config ?? { host: DEFAULT_HOST, port: DEFAULT_PORT };
    this.updateStatus(InstanceStatus.Connecting, "Connecting to Broadcast Graphics Engine");

    this.setActionDefinitions(this.#buildActions());
    this.setFeedbackDefinitions(this.#buildFeedbacks());
    this.setVariableDefinitions(this.#buildVariables());
    this.setPresetDefinitions(this.#buildPresets());

    // Kick off the state stream. Reconnect is handled inside #openStream on
    // network errors — Companion's InstanceBase doesn't retry for us.
    this.#openStream();
  }

  async configUpdated(config) {
    this.config = config;
    this.#closeStream();
    this.#openStream();
  }

  async destroy() {
    this.#closeStream();
  }

  getConfigFields() {
    return [
      {
        type: "textinput",
        id: "host",
        label: "Control Room host",
        default: DEFAULT_HOST,
        width: 8,
        regex: Regex.IP,
        tooltip: "IP or hostname of the machine running the Control Room.",
      },
      {
        type: "number",
        id: "port",
        label: "Sidecar port",
        default: DEFAULT_PORT,
        min: 1,
        max: 65535,
        width: 4,
        tooltip: "The axum sidecar port — defaults to 4977.",
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  #baseUrl() {
    return `http://${this.config.host || DEFAULT_HOST}:${this.config.port || DEFAULT_PORT}`;
  }

  async #sendCommand(type, params = {}) {
    const seq = ++this.seq;
    const body = JSON.stringify({ seq, type, params });
    try {
      const res = await fetch(`${this.#baseUrl()}/control/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        this.log("warn", `Command ${type} failed: ${json?.error ?? res.status}`);
      }
      return json;
    } catch (err) {
      this.log("error", `Command ${type} network error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async #openStream() {
    this.#closeStream();
    this.streamAbort = new AbortController();
    const url = `${this.#baseUrl()}/control/state/stream`;

    try {
      const res = await fetch(url, {
        signal: this.streamAbort.signal,
        headers: { accept: "text/event-stream" },
      });
      if (!res.ok || !res.body) {
        this.updateStatus(InstanceStatus.ConnectionFailure, `HTTP ${res.status}`);
        this.#scheduleReconnect();
        return;
      }
      this.updateStatus(InstanceStatus.Ok);

      // Minimal SSE parser: read decoded text, split on blank lines, keep
      // only `data:` lines. Sufficient for our compact snapshots.
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLines = chunk
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trimStart());
          if (dataLines.length === 0) continue;
          try {
            /** @type {ControlStateSnapshot} */
            const snap = JSON.parse(dataLines.join("\n"));
            this.snapshot = snap;
            this.#refreshFromSnapshot();
          } catch {
            /* keep-alive comment lines and heartbeats land here */
          }
        }
      }
    } catch (err) {
      if (this.streamAbort?.signal.aborted) return;
      this.updateStatus(
        InstanceStatus.ConnectionFailure,
        err instanceof Error ? err.message : String(err),
      );
    }

    this.#scheduleReconnect();
  }

  #closeStream() {
    if (this.streamAbort) {
      this.streamAbort.abort();
      this.streamAbort = null;
    }
  }

  #scheduleReconnect() {
    if (this.streamAbort) return; // already open
    setTimeout(() => this.#openStream(), 2000);
  }

  #refreshFromSnapshot() {
    const s = this.snapshot;
    if (!s) return;
    this.setVariableValues({
      program_scene_id: s.programSceneId ?? "",
      preview_scene_id: s.previewSceneId ?? "",
      on_air: s.onAir ? "ON" : "OFF",
      current_item_title: s.currentItemTitle ?? "",
      next_item_title: s.nextItemTitle ?? "",
      current_item_progress: Math.round(s.currentItemProgress),
      current_item_duration: s.currentItemDuration,
      is_schedule_playing: s.isSchedulePlaying ? "PLAY" : "PAUSE",
      recording_active: s.recording?.active ? "REC" : "off",
      ndi_streaming: s.ndi?.streaming ? "ON" : "OFF",
      ndi_connections: s.ndi?.connections ?? 0,
      scene_count: s.sceneCount,
      layer_count: s.layerCount,
    });
    this.checkFeedbacks(
      "on_air",
      "recording_active",
      "schedule_playing",
      "ndi_streaming",
    );
  }

  // -------------------------------------------------------------------------
  // Actions / Feedbacks / Variables / Presets
  // -------------------------------------------------------------------------

  #buildActions() {
    return {
      take: {
        name: "Take (cut preview to program)",
        options: [],
        callback: () => this.#sendCommand("take"),
      },
      arm: {
        name: "Arm scene to preview",
        options: [
          { type: "textinput", id: "sceneId", label: "Scene ID", default: "" },
        ],
        callback: (evt) => this.#sendCommand("arm", { sceneId: evt.options.sceneId }),
      },
      play_in: {
        name: "Play In (layer)",
        options: [
          { type: "textinput", id: "layerId", label: "Layer ID", default: "" },
        ],
        callback: (evt) => this.#sendCommand("playIn", { layerId: evt.options.layerId }),
      },
      play_out: {
        name: "Play Out (layer)",
        options: [
          { type: "textinput", id: "layerId", label: "Layer ID", default: "" },
        ],
        callback: (evt) => this.#sendCommand("playOut", { layerId: evt.options.layerId }),
      },
      take_item: {
        name: "Take rundown item",
        options: [
          { type: "textinput", id: "itemId", label: "Rundown item ID", default: "" },
        ],
        callback: (evt) => this.#sendCommand("takeItem", { itemId: evt.options.itemId }),
      },
      next_item: {
        name: "Next rundown item",
        options: [],
        callback: () => this.#sendCommand("nextItem"),
      },
      previous_item: {
        name: "Previous rundown item",
        options: [],
        callback: () => this.#sendCommand("previousItem"),
      },
      play_schedule: {
        name: "Play schedule",
        options: [],
        callback: () => this.#sendCommand("playSchedule"),
      },
      pause_schedule: {
        name: "Pause schedule",
        options: [],
        callback: () => this.#sendCommand("pauseSchedule"),
      },
      stop_schedule: {
        name: "Stop schedule",
        options: [],
        callback: () => this.#sendCommand("stopSchedule"),
      },
      start_record: {
        name: "Start recording",
        options: [
          { type: "textinput", id: "filename", label: "Filename (optional)", default: "" },
          {
            type: "dropdown",
            id: "codec",
            label: "Codec",
            default: "h264",
            choices: [
              { id: "h264", label: "H.264 (MP4)" },
              { id: "prores", label: "ProRes (MOV)" },
              { id: "dnxhd", label: "DNxHD (MXF)" },
            ],
          },
        ],
        callback: (evt) =>
          this.#sendCommand("startRecord", {
            filename: evt.options.filename || undefined,
            codec: evt.options.codec || undefined,
          }),
      },
      stop_record: {
        name: "Stop recording",
        options: [],
        callback: () => this.#sendCommand("stopRecord"),
      },
      ping: {
        name: "Ping (connectivity test)",
        options: [],
        callback: () => this.#sendCommand("ping"),
      },
    };
  }

  #buildFeedbacks() {
    return {
      on_air: {
        type: "boolean",
        name: "ON AIR (any scene programmed)",
        defaultStyle: { color: 0xffffff, bgcolor: 0xcc1520 },
        options: [],
        callback: () => Boolean(this.snapshot?.onAir),
      },
      recording_active: {
        type: "boolean",
        name: "Recording active",
        defaultStyle: { color: 0xffffff, bgcolor: 0x8b0000 },
        options: [],
        callback: () => Boolean(this.snapshot?.recording?.active),
      },
      schedule_playing: {
        type: "boolean",
        name: "Schedule is playing",
        defaultStyle: { color: 0x000000, bgcolor: 0x00c853 },
        options: [],
        callback: () => Boolean(this.snapshot?.isSchedulePlaying),
      },
      ndi_streaming: {
        type: "boolean",
        name: "NDI streaming",
        defaultStyle: { color: 0xffffff, bgcolor: 0x1e5eff },
        options: [],
        callback: () => Boolean(this.snapshot?.ndi?.streaming),
      },
    };
  }

  #buildVariables() {
    return [
      { variableId: "program_scene_id", name: "Program scene id" },
      { variableId: "preview_scene_id", name: "Preview scene id" },
      { variableId: "on_air", name: "On-air (ON/OFF)" },
      { variableId: "current_item_title", name: "Current rundown item title" },
      { variableId: "next_item_title", name: "Next rundown item title" },
      { variableId: "current_item_progress", name: "Current item progress (s)" },
      { variableId: "current_item_duration", name: "Current item duration (s)" },
      { variableId: "is_schedule_playing", name: "Schedule state" },
      { variableId: "recording_active", name: "Recording state" },
      { variableId: "ndi_streaming", name: "NDI streaming state" },
      { variableId: "ndi_connections", name: "NDI connected receivers" },
      { variableId: "scene_count", name: "Scene count" },
      { variableId: "layer_count", name: "Layer count" },
    ];
  }

  #buildPresets() {
    return {
      take: {
        type: "button",
        category: "Playout",
        name: "Take",
        style: { text: "TAKE", size: "24", color: 0xffffff, bgcolor: 0x000000 },
        steps: [{ down: [{ actionId: "take", options: {} }], up: [] }],
        feedbacks: [{ feedbackId: "on_air", options: {} }],
      },
      next: {
        type: "button",
        category: "Playout",
        name: "Next item",
        style: { text: "NEXT", size: "18", color: 0xffffff, bgcolor: 0x1e5eff },
        steps: [{ down: [{ actionId: "next_item", options: {} }], up: [] }],
        feedbacks: [{ feedbackId: "schedule_playing", options: {} }],
      },
      previous: {
        type: "button",
        category: "Playout",
        name: "Previous item",
        style: { text: "PREV", size: "18", color: 0xffffff, bgcolor: 0x1e5eff },
        steps: [{ down: [{ actionId: "previous_item", options: {} }], up: [] }],
        feedbacks: [],
      },
      play_schedule: {
        type: "button",
        category: "Playout",
        name: "Play schedule",
        style: { text: "PLAY", size: "18", color: 0xffffff, bgcolor: 0x00c853 },
        steps: [{ down: [{ actionId: "play_schedule", options: {} }], up: [] }],
        feedbacks: [{ feedbackId: "schedule_playing", options: {} }],
      },
      pause_schedule: {
        type: "button",
        category: "Playout",
        name: "Pause schedule",
        style: { text: "PAUSE", size: "18", color: 0xffffff, bgcolor: 0xffc107 },
        steps: [{ down: [{ actionId: "pause_schedule", options: {} }], up: [] }],
        feedbacks: [],
      },
      record: {
        type: "button",
        category: "Record",
        name: "Start / stop record",
        style: { text: "REC", size: "18", color: 0xffffff, bgcolor: 0x8b0000 },
        steps: [
          {
            down: [{ actionId: "start_record", options: { filename: "", codec: "h264" } }],
            up: [],
          },
          {
            down: [{ actionId: "stop_record", options: {} }],
            up: [],
          },
        ],
        feedbacks: [{ feedbackId: "recording_active", options: {} }],
      },
    };
  }
}

runEntrypoint(BroadcastGraphicsEngineInstance);
