# Phase 7 — Control + Automation Design

Companion to [PLAN.md](../PLAN.md) and [PHASE7_HANDOFF.md](../PHASE7_HANDOFF.md).
Documents the transport, protocol, concurrency model, and integration surface
picked for Phase 7 — the decisions the handoff brief flagged as "for Opus to
refine before implementation."

## Transport choice — HTTP+SSE, not raw WebSockets

The handoff brief suggested a WebSocket server. **Rejected in favor of HTTP+SSE**
because:

1. **Build risk.** The Cargo.toml already documents (see the comment on
   `tokio-stream`) that `tokio-tungstenite` failed TLS revocation from crates.io
   on this project's build network. Choosing WS forces re-fighting that
   fetch every time cargo cache is cold. Choosing SSE reuses a dep already
   working end-to-end in Phase 2's `/document/stream`.
2. **Zero functional gain.** Every message in the Phase 7 protocol is either
   client→server (a command) or server→client (state push). No message is
   bidirectional-in-flight. Full duplex buys nothing.
3. **Companion supports HTTP fine.** Bitfocus Companion modules routinely
   integrate over HTTP — vMix, ATEM, Ross all ship HTTP modules alongside
   their WS ones. There is no operator-facing difference.
4. **Simpler debugging.** `curl -X POST` and `curl -N /stream` are the two
   diagnostic commands an operator can run to prove the control plane is
   alive. A WS troubleshoot needs `wscat` or equivalent.

Latency on loopback for POST+SSE is the same sub-millisecond floor as WS.

## Message protocol (v1)

### Client → Server: `POST /control/command`

```json
{ "seq": 42, "type": "take", "params": {} }
```

Response:

```json
{ "ok": true,  "seq": 42 }                          // dispatched
{ "ok": false, "seq": 42, "error": "unknown type" } // rejected before dispatch
```

The response confirms **dispatch**, not effect. The effect (a scene actually
changing) is observed on the state stream. This distinction matters when
composing commands: a Companion button that flashes ON-AIR should light off the
state stream, not off the POST response.

### Command types

Every command that mutates any store is expressible here:

| type              | params                       | effect                                      |
|-------------------|------------------------------|---------------------------------------------|
| `take`            | —                            | `cut()` — preview → program                 |
| `arm`             | `{ sceneId }`                | `armPreview(sceneId)`                       |
| `playIn`          | `{ layerId }`                | `playIn(layerId)`                           |
| `playOut`         | `{ layerId }`                | `playOut(layerId)`                          |
| `takeItem`        | `{ itemId }`                 | rundown: `takeItem(itemId)`                 |
| `nextItem`        | —                            | rundown: `next()`                           |
| `previousItem`    | —                            | rundown: `previous()`                       |
| `playSchedule`    | —                            | rundown: `play()`                           |
| `pauseSchedule`   | —                            | rundown: `pause()`                          |
| `stopSchedule`    | —                            | rundown: `stop()`                           |
| `startRecord`     | `{ filename?, codec? }`      | begin FFmpeg record                         |
| `stopRecord`      | —                            | end FFmpeg record                           |
| `ping`            | —                            | pong; used for connectivity check           |

Unknown types return `{ ok: false, seq, error: "unknown command type: X" }`.
Malformed JSON returns HTTP 400.

### Server → Client: `GET /control/state/stream` (SSE)

First frame is a full snapshot. Every mutation pushes an updated full snapshot
(not a delta) — the snapshot is small enough (< 1KB) that a full replace is
simpler than reconciling per-field deltas and eliminates a whole class of
"stale field" bugs.

```json
{
  "programSceneId": "sc_1234",
  "previewSceneId": "sc_5678",
  "onAir": true,
  "currentItemId": "po-abc",
  "currentItemTitle": "6PM News",
  "currentItemProgress": 42.3,
  "currentItemDuration": 300,
  "nextItemTitle": "Weather",
  "isSchedulePlaying": true,
  "recording": { "active": false, "path": null, "startedAt": null },
  "ndi": { "streaming": true, "connections": 0 },
  "sceneCount": 4,
  "layerCount": 12,
  "seq": 837,
  "timestamp": 1720638422123
}
```

`seq` is a server-side monotonic counter — SSE clients use it to detect gaps
(they shouldn't happen on loopback, but a real network Companion install might).

Existing `/document/stream` remains for full envelope push; `/control/state/stream`
is the compact control-focused view. Two separate streams because
Companion doesn't want the whole document blob every time a text element moves.

## Concurrency model — no lock, sequence-numbered

Rejected the handoff brief's "role negotiation" (control vs monitor). Rationale:

- The set of clients is small (Companion + occasional web dashboard).
- Every client already knows whether it sends commands — it either has a
  button or it doesn't.
- An explicit "you don't have control" reject creates a whole new failure mode
  (client thinks they're in control, next command silently drops).

Model instead:

- Every client can POST commands.
- Every command dispatches serially (single mutex on the Rust command
  dispatcher; commands take microseconds, never contended in practice).
- Every state push carries a `seq` a client can use to detect its own
  round-trip.
- The **operator in Control Room is the visible tie-breaker** — they see the
  current state on-screen and can override. This is how vMix, OBS, ATEM
  Software Control all handle it, and it matches operator expectations.

## Bitfocus Companion integration

The Companion module in `src/companion-module/` is a standalone Node.js
package (Companion loads it as a plugin). It:

- Speaks the same POST/SSE protocol above — no separate WS or MIDI.
- Connects to a configurable host/port (default `127.0.0.1:4977`).
- Ships **actions** (button press → command), **feedbacks** (state → button
  visual), and **presets** (starter button layouts).
- Uses the standard `@companion-module/base` runtime — anyone who has
  Companion installed can drop this module in.

Not pre-integrated with Companion at build time — the module is source only;
users install via Companion's "Import module" flow. That's how every other
Companion module distributes.

## FFmpeg record

Runs as a subprocess of the Tauri host. Screen-capture backend per OS
(recommended in the brief):

| OS      | FFmpeg input          |
|---------|-----------------------|
| Windows | `gdigrab` on the Program window title |
| macOS   | `avfoundation`        |
| Linux   | `x11grab`             |

Codec default: H.264 (`libx264`) at fps matching the project, CRF 18. Alternate
codec paths (ProRes, DNxHD) allowed via the `codec` param.

Output files land in the app data dir at `assets/recordings/<timestamp>.mp4`
(or `.mov` for ProRes). Auto-cleanup deferred to Phase 8 hardening — Phase 7
just captures.

Filename collision handled by embedding the ms timestamp — never overwrites.

**Failure mode:** ffmpeg not on PATH → `startRecord` returns an error, no
subprocess left dangling. The record button surfaces the error to the operator.

## Spout / Syphon

Explicitly **stubbed** in Phase 7. The real Windows FFI (dynamic-load
`Spout.dll`, share a DX11 texture) mirrors the NDI Stage-1 pattern from Phase 2
and needs the same live-DX-context runway. Phase 7 delivers:

- `src-tauri/src/spout.rs` with an honest `status()` returning
  `{ available: false, reason: "Spout output is Phase 8 work — capture via NDI or FFmpeg for now" }`.
- Tauri command surface (`get_spout_status`) matching the NDI pattern, so
  Phase 8 can swap the backend without touching the frontend.

## State bridge — how Rust talks to Zustand

The Rust sidecar does not mutate stores directly (Zustand lives in the
Control Room webview). The bridge:

1. **Commands flow: Rust → JS.** `POST /control/command` → axum handler emits
   a Tauri event `control:command` with `{seq, type, params}` → Control
   Room's `controlBridge.ts` listens, dispatches the store action, echoes an
   ack back via a Tauri command `ack_control_command(seq, ok, error?)`. axum
   waits for the ack (bounded 2s timeout) before responding to the POST.
2. **State flow: JS → Rust.** `controlBridge.ts` subscribes to `useDocStore`,
   `usePlayoutStore`, and NDI status. On every relevant change, it calls the
   Tauri command `set_control_state(json)` which:
   - Updates the mutex-guarded state buffer.
   - Broadcasts to `/control/state/stream` subscribers via a
     `tokio::sync::broadcast::Sender<String>`.
3. **Late-joining clients** get the current buffer as their first SSE frame,
   same pattern as `/document/stream`.

Only the Control Room window runs `controlBridge.ts` — Program/Preview never
do (they'd double-push). Enforced by mounting the bridge only inside
`ControlRoomView.tsx`.

## Files

New:
- `src-tauri/src/control_server.rs` — axum routes + command dispatch
- `src-tauri/src/record.rs` — FFmpeg subprocess management
- `src-tauri/src/spout.rs` — honest-unavailable stub
- `src/document/controlProtocol.ts` — TS types (shared with Companion module)
- `src/document/controlBridge.ts` — Control Room → sidecar sync
- `src/companion-module/manifest.json` — Companion metadata
- `src/companion-module/index.js` — Companion module implementation
- `src/companion-module/README.md` — install instructions
- `scripts/verify-phase7.ts` — end-to-end protocol test (unit + integration)

Modified:
- `src-tauri/src/lib.rs` — wire routes/commands, mount bridge state
- `src/views/ControlRoomView.tsx` — mount `useControlBridge()` hook
- `src/components/panels/PlayoutPanel.tsx` — CSV import/export + record button
- `src/document/playout.ts` — CSV import + JSON export helpers

## Success criteria

- [x] Design complete (this document)
- [ ] `POST /control/command` accepts all 12 command types
- [ ] `GET /control/state/stream` pushes state on every relevant mutation
- [ ] Companion module compiles (`npm install`-able)
- [ ] Rundown import from CSV round-trips (parse → items → export → parse)
- [ ] Rundown export to JSON works
- [ ] `startRecord` spawns ffmpeg subprocess; `stopRecord` terminates cleanly
- [ ] Spout stub returns honest `available: false`
- [ ] `tsc --noEmit` clean, `cargo check` clean
- [ ] Verification script (`scripts/verify-phase7.ts`) passes

Live verification (real Companion device + Control Room + real record) is out
of scope for this environment (Linux CI, no GUI). Recommend an operator pass
on Windows once Phase 7 lands: install Companion, load the module, hit a
button, watch on-air lamp light, hit Record, confirm file lands on disk.
