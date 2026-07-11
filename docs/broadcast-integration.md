# Broadcast Integration

**Updated:** 2026-07-10

Chase delivers graphics to external broadcast software through three real paths:

| Path | Protocol | Status |
|------|----------|--------|
| **Browser Source URL** | HTTP `http://127.0.0.1:4977/program` | Production — sidecar serves React Program view |
| **OBS WebSocket** | `ws://127.0.0.1:4455` | Production — auto-create/update Browser Source |
| **vMix Web API** | HTTP `http://127.0.0.1:8088/api/` | Production — add/navigate Browser input |
| **NDI output** | NDI SDK (Windows) | Production — Program window capture (video only) |

## Architecture

```
Control Room (React)
    → persistence.ts pushProgramDocument
    → Tauri set_program_document
    → Axum sidecar :4977
        ├── /program          → OBS / vMix Browser Source
        ├── /document/stream  → SSE sync (Program/Preview windows)
        ├── /program/tick     → ON-AIR liveness
        └── /status           → health metrics

OBS WebSocket (optional automation)
    → CreateInput browser_source → points at /program

vMix Web API (optional automation)
    → AddInput Browser|Title|URL

NDI (parallel path)
    → WebView2 capture → NDI sender
```

## UI

**Show workspace → Broadcast Output panel** (`OutputStreamingPanel.tsx`)

- Chase sidecar health (consumer state, pull rate)
- OBS connect / disconnect / setup Browser Source
- vMix test connection / setup Browser input
- Settings persisted in SQLite `app_state.broadcast_settings`

**NDI panel** — separate; start/stop NDI program output.

## OBS setup (operator)

1. OBS → Tools → WebSocket Server Settings → enable, note password
2. Chase → Show → Broadcast Output → enter host/port/password
3. Click **Connect OBS** (auto-setup if enabled)
4. Or click **Setup Browser Source** after connecting
5. ON-AIR lamp turns red when OBS pulls `/program`

## vMix setup (operator)

1. vMix → Settings → Web Controller → enable (default port 8088)
2. Chase → Broadcast Output → **Test connection**
3. **Setup Browser input** — adds or navigates `Chase Program` browser input

## Not yet implemented

- Spout (low-latency GPU share to OBS)
- OBS scene switching / streaming start-stop from Chase
- vMix TCP/XML full API
- NDI receive into video sources
- NDI audio on program output
- FFmpeg RTMP/SRT direct stream
- Native libobs `chase-ar-source` module

## Module map

| File | Role |
|------|------|
| `src/broadcast/obsWebSocket.ts` | OBS WebSocket v5 client |
| `src/broadcast/obsSetup.ts` | Browser Source create/update |
| `src/broadcast/vmixClient.ts` | vMix HTTP API |
| `src/broadcast/broadcastStore.ts` | Connection state + persistence |
| `src-tauri/src/lib.rs` | Sidecar server :4977 |
| `src-tauri/src/ndi.rs` | NDI send |
| `src/output/useOutputStatus.ts` | Sidecar health poll |
