# Phase 7 Handoff Brief for Opus

**Status:** Phases 2-6.2 COMPLETE and merged to main. Phase 7 ready for architectural design.

## Phase 7 Scope: Control + Automation

*DoD:* Broadcast control via REST/WS, Bitfocus Companion integration, rundown automation, streaming output (Spout/Syphon), record/FFmpeg.

### Current State

**Infrastructure:**
- Axum sidecar server at `127.0.0.1:4977`
- HTTP polling (Program/Preview at `/document` and `/program/tick`)
- Document envelope: `{project, programSceneId, previewSceneId, layerPlayback, cameraMoves}`
- Real-time push via Tokio broadcast channel in `lib.rs` (`DocBroadcast`)
- SQLite persistence via `tauri-plugin-sql`

**Key Existing Files:**
- `src-tauri/src/lib.rs` — Tauri app setup, sidecar init, command handlers
- `src-tauri/src/status.rs` — Real-time status tracking (requests/sec, frame health, NDI connections)
- `src/document/playout.ts` — Rundown/schedule state management (already has `type:"live"` semantics, auto-advance logic)
- `src/document/persistence.ts` — Document serialization, `resolveProjectForOutput()` (binding engine)
- `src/views/ProgramView.tsx`, `PreviewView.tsx` — Polling consumers (call `/document/stream` SSE)

**What Already Works:**
- Document mutations trigger store subscribers → serialize → SQLite write
- ProgramView/PreviewView subscribe via SSE to real-time updates (near-zero latency on loopback)
- NDI sender gets frames from WebView2 capture (Phase 2)
- Tauri commands for `take()`, `cut()`, `armPreview()`, `playIn()`, `playOut()`
- Per-scene layer visibility/playback state (Phase 3)

### Phase 7 Requirements

#### 1. Control Server Redesign (REST → WS Push)

**Current limitation:** HTTP polling (`/document/tick` at ~1s cadence, Program/Preview windows poll `/document`). This works but:
- Clients can't drive real-time playout (only react to it)
- No server push when state changes mid-interval
- Latency floor is the poll period
- No multi-client coordination (who's in control?)

**Required:** 
- **WebSocket server** on a new port (suggest `:4978` or thread into `:4977`'s axum router)
- **Message protocol** for:
  - Client subscription (scene/project changes)
  - Server push (immediate on state change, not poll-based)
  - Client commands (take/cut/playIn/playOut/arm/go-to-rundown-item)
  - Handshake (client identifies as "control", "monitor", "companion", etc.)
  - Heartbeat (detect stale connections)
- **Concurrency model:** Multiple clients (Companion on port A, external controller on port B, internal Program window). Who has "control" in a conflict?
- **State machine:** Distinguish "intended" state (operator clicked Take) vs. "live" state (frame actually reached output) vs. "error" state (NDI dropped)

**Suggested approach:**
- Use `tokio::sync::watch` for pushing state to all connected clients
- Tauri commands stay for backward compat (Program/Preview still use them internally)
- New WS handlers for external clients
- Sequence numbers or timestamps on every message to detect reordering

#### 2. Bitfocus Companion Integration

**What it is:** Open-source MIDI/Stream Deck controller software. Broadcasters use it to:
- Map buttons to actions (Take, Cut, Play In, etc.)
- Read back live state (ON-AIR lamp, running clock)
- Text display (current scene, next scene, countdown)

**Required:**
- **Companion module** (`src/companion-module/` or similar, JavaScript/TypeScript)
- Connect to the WS server above
- Action handlers (button press → WS message)
- Feedback handlers (state change → update button display)
- Preset store (saved button layouts)

**Companion SDK:** Already open-source on GitHub (`bitfocus/companion-module-example-*`). This is a well-established pattern.

#### 3. Rundown Automation

**Current state:** `src/document/playout.ts` has:
- `RundownItem` (type, duration, content reference, status)
- `takeItem()`, `nextItem()`, `previousItem()` 
- Schedule auto-advance (respects `type: "live"` HOLD semantics from Phase 6)
- Playout log with `completed`/`cut`/`skipped` status

**What's missing:**
- UI for editing rundowns (load/save, reorder, preview)
- Integration with actual teleprompter/rundown systems (rundown.cloud, ixo, Ross ControlWall APIs)
- Smart next-cue preview (show graphics/graphics content for the next item)
- Rundown import (CSV, XML from rundown.cloud)

**Scope for Phase 7:**
- Rundown editor panel (add/remove/reorder items, preview content)
- Manual item advance via WS command
- Export rundown to CSV/JSON for external systems
- Import from CSV (basic: scene name, duration, notes)

#### 4. Spout / Syphon (GPU Frame Sharing)

**What it is:** 
- **Spout** (Windows): GPU texture sharing via DirectX. OBS/vMix/Resolume read Program output without leaving GPU memory.
- **Syphon** (macOS): Same concept, Metal/OpenGL.

**Current architecture:** Program window is a Tauri WebView (WebGL canvas → WebView2 → OS framebuffer). Spout would need:
- Capture the rendered frame from WebGL *inside* the app
- Pass it to Spout as a GPU texture
- Spout broker handles the sharing

**Complexity:** Spout requires Windows API access from Rust + FFI to `Spout.dll` (similar to Phase 2's NDI pattern — dynamic load, fallback to honest "unavailable").

**Scope for Phase 7:**
- Research + proof of concept (detect if Spout runtime is installed, open a sharing channel)
- Get a single static frame flowing to Spout (not real-time yet; that's Phase 8 optimization)
- Disable gracefully on non-Windows

#### 5. FFmpeg Record

**What it is:** Capture Program window to MP4/ProRes using FFmpeg as a subprocess.

**Current gap:** No recording yet. Program window renders live, but nothing captures it to disk.

**Scope for Phase 7:**
- New Tauri command `start_record(filename, codec)` / `stop_record()`
- Spawn `ffmpeg` process piping from a live RTMP/MJPEG stream OR screen-capture on Windows
- UI button (Record / Stop) in Program controls
- Filename + codec options in settings

**Simpler approach (recommended for Phase 7):** Use FFmpeg's screen-capture (`gdigrab` on Windows, `AVFoundation` on macOS) targeting the Tauri window directly. Avoids needing a separate stream server.

### Key Decisions Needed

1. **WS Protocol Format** — JSON? Protobuf? MessagePack?
   - Recommendation: Simple JSON with `type: "command" | "state" | "ack"`, versioned
   
2. **Multi-Client Concurrency** — Lock model?
   - Option A: First client to connect gets "control"; others are "monitor" only
   - Option B: Last command wins (highest risk of operator confusion)
   - Option C: Explicit role negotiation (client declares intent on connect)
   - Recommendation: Option C with clear UI feedback
   
3. **Rundown Import Format** — CSV? JSON? Integration with rundown.cloud?
   - Recommendation: Start with CSV (simplest), add rundown.cloud connector in Phase 8

4. **Recording Storage** — Where? How much disk?
   - Recommendation: App data dir `/assets/recordings/`, auto-cleanup if >80% disk full

### Known Gotchas

1. **WebView2 process lifecycle** (Phase 2 lesson): `msedgewebview2.exe` orphans accumulate. Control server should not assume Program window is alive; implement heartbeat + auto-reconnect.

2. **Cold-boot state** (Phase 5 lesson): Fresh launch with no saved rundown crashes if UI tries to read playout state. Ensure empty rundown is a valid state.

3. **Schema drift** (recurring bug class): Add any new `project` fields → mirror in `schema.ts` + factory defaults. WS payloads must match the persisted schema exactly.

4. **Operator expectations from real broadcast tools:**
   - vMix: Control server on localhost; every button click is instantaneous
   - OBS: Multiple scenes, instant switching
   - Ross/Sony: Automation scripts, conditional logic
   - Suggestion: Start simple (direct actions only), add scripting in Phase 8

### Architecture Sketch (for Opus to refine)

```
┌─────────────────────────────────────────────────────────────┐
│                    Control Room (Tauri)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Zustand Store (project, playout, programSceneId)    │  │
│  │  ↓ (store mutation) ↓                                │  │
│  │  SQLite (persistence)                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│          ↑                           ↑                      │
│    (Tauri cmd)                  (store sub)                │
│          │                           │                      │
│  ┌───────┴────────────────────┬──────┴────────────────┐   │
│  │  UI Panels                 │  WS Server (axum)    │   │
│  │  (Control Room only)       │  (all clients)       │   │
│  │                            │                      │   │
│  │                            └──────────────────────┘   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Program Window (Tauri WebView)                       │  │
│  │ ↓ (document/camera/playback state)                   │  │
│  │ DocumentRenderer → Konva (2D) + R3F (3D) Canvas     │  │
│  │ → WebGL frame → (Spout share) + (FFmpeg capture)    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↑ WS / HTTP polling
         │
    ┌────┴───────────────────────────────────────┐
    │  External Clients                           │
    ├───────────────────────────────────────────┐│
    │ Bitfocus Companion   External HTTP API    ││
    │ (MIDI → WS command)  (Python/shell)       ││
    │                                            ││
    │ Telestrator / OBS   FFmpeg (record)       ││
    │ (monitor only)       (subprocess)         ││
    └───────────────────────────────────────────┘│
    └───────────────────────────────────────────────┘
```

### Testing Strategy

1. **Unit:** Playout state machine (already has rundown logic)
2. **Integration:** WS server + store sync (emit a change, verify all clients see it)
3. **E2E:** Companion module button → WS → state change → Program updates (requires Companion SDK installed locally)
4. **Load:** Multiple clients subscribing, rapid state changes

### Success Criteria (DoD)

- ✅ WS server running on axum, clients can connect and receive state
- ✅ Playout commands (take/cut/arm/next/prev) work via WS
- ✅ Companion module compiles, connects, reads/writes state
- ✅ Rundown editor UI functional (load/save/advance)
- ✅ Spout proof-of-concept (detect + share at least one static frame, or honest "unavailable" on non-Windows)
- ✅ FFmpeg record can start/stop (UI button wired, ffmpeg process launches, file lands on disk)
- ✅ Full `tsc --noEmit` + `cargo check` clean
- ✅ Operator can control playout from Companion device while monitoring in Control Room

### Files to Create/Modify

**New:**
- `src-tauri/src/control_server.rs` (WS server logic)
- `src-tauri/src/spout.rs` (Spout integration, Windows-only)
- `src/companion-module/manifest.js` (Companion module metadata)
- `src/companion-module/index.js` (Companion module implementation)
- `src/components/panels/RundownPanel.tsx` (editor UI)
- `scripts/verify-phase7.ts` (testing suite)

**Modify:**
- `src-tauri/src/lib.rs` (integrate WS server, FFmpeg record commands)
- `src-tauri/Cargo.toml` (add `tokio-tungstenite` or similar for WS)
- `src/document/playout.ts` (extend with rundown import/export)
- `src/components/panels/PlayoutPanel.tsx` (add Record button, rundown UI)

### Context Links

- PLAN.md: Full project roadmap
- MIGRATION_MAP.md: Legacy architecture audit (context for why we rebuilt)
- MODEL_STRATEGY.md: Which model handles which task (how this handoff was decided)
- Phase 2-6 commits: Reference implementations (NDI, capture, bindings, etc.)

---

**Ready for Opus:** This brief captures the architectural challenge and known constraints. Opus should design the WS protocol, concurrency model, and Companion integration pattern before implementation begins.
