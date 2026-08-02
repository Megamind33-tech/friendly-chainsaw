# Broadcast Graphics Engine

A software-defined broadcast graphics engine: 2D graphics, virtual sets, 3D/AR
scenes, a sports package, a rundown with MOS integration, and a control room —
delivering to air as an OBS Browser Source or over NDI.

Tauri 2 desktop app. React 19 + Konva for 2D, React Three Fiber / three.js for
3D, Rust for the output plane.

---

## What it is, precisely

This renders broadcast graphics **in a web engine** and delivers them through a
local HTTP sidecar. Its architectural peers are the browser-rendered graphics
platforms (Singular.live, Flowics), not GPU compositing engines like Vizrt Viz
Engine or Zero Density. See [`docs/GAP_ANALYSIS.md`](docs/GAP_ANALYSIS.md) for a
feature-by-feature comparison and an honest statement of the ceilings that
choice implies — no genlock, no timecode, no SDI, no camera tracking.

**On the word "AR":** what ships is high-quality 3D graphics rendered to a
*virtual* camera with authored moves. Broadcast AR normally means graphics
locked to a tracked *physical* camera (FreeD, Mo-Sys, Stype), and there is no
tracking ingest here. Read `ar-` prefixed modules as "3D scene graphics".

## Architecture

```
Control Room (Tauri window)          Program / Preview (Tauri windows)
  editor, panels, rundown              DocumentRenderer + Set3dRenderer
  SQLite persistence                             ▲
         │ set_program_document                  │ /document/stream (SSE)
         ▼                                       │
  ┌──────────────────────────────────────────────┴────────┐
  │  axum sidecar — 127.0.0.1:4977  (src-tauri/src/lib.rs) │
  │  /program  /document  /status  /assets  /control/*     │
  └────────────────────────────────┬───────────────────────┘
                                   │ same React bundle
                                   ▼
                        OBS Browser Source  →  air
```

One serializable document is the source of truth. Editors mutate it; every
renderer reads it. The Control Room pushes a **render envelope** (project +
program/preview scene ids + transient show state) to the sidecar, which
broadcasts it over SSE and serves the same React bundle to OBS. The editor and
Program therefore cannot drift — they run the identical `renderElement` builder.

| Concern | Where |
|---|---|
| Document model | `src/document/types.ts`, `schema.ts` |
| Store (Zustand + zundo undo) | `src/document/store.ts` |
| Output envelope | `src/document/renderEnvelope.ts` |
| 2D render | `src/components/gfx/` |
| 3D / virtual set / AR | `src/components/set3d/`, `src/ar-system/`, `src/ar-engine/` |
| Take transitions | `src/document/sceneTransition.ts` |
| Live data connectors | `src/document/connectors.ts` |
| Rundown / playout | `src/document/playout.ts` |
| Sidecar, NDI, record, MOS | `src-tauri/src/` |

## Installing on Windows

**If you only want to run the app, do not build it.** Download a prebuilt
installer:

1. Repo → **Actions** tab → **Windows installer** workflow
2. Open the newest green run — one is built for every push to `main`
3. Download the **`broadcast-graphics-engine-windows`** artifact
4. Unzip, run the `.exe` — the `.msi` is there too for managed deployment

This needs no Rust, no Visual Studio Build Tools, no Node. WebView2 ships with
Windows 11 and current Windows 10.

> The builds are **unsigned** — no code-signing certificate is configured — so
> SmartScreen warns on first run. Choose *More info* → *Run anyway*. Installs
> per-machine, so Windows asks for administrator rights.

To build from source on Windows instead, install the prerequisites in one go:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-windows.ps1
```

It installs Rust, VS Build Tools with the C++ workload, WebView2 and Bun via
winget, skipping whatever is already there. Then open a **new** terminal (PATH
changes don't reach the current one) and follow "Running it" below.

## Running it

```bash
bun install
bun run doctor         # preflight — checks toolchain, ports, prerequisites
bun run tauri dev      # full desktop app
bun run dev            # Vite only (no Tauri shell)
bun run tauri build    # produce installers into src-tauri/target/release/bundle
```

**Run `bun run doctor` first.** `tauri dev` compiles the entire Rust dependency
tree before it can tell you a linker is missing, so a five-second prerequisite
mistake otherwise costs ten minutes to discover. The doctor checks the Rust
toolchain, your platform's build prerequisites, and whether ports 1423 / 4977 /
9222 are already held by a stale process — then names the exact fix for
anything that is wrong.

First `tauri dev` takes 5–15 minutes to compile Rust; after that it is
incremental.

### Prerequisites

| Platform | Needs |
|---|---|
| all | [Rust via rustup](https://rustup.rs) |
| Windows | Visual Studio Build Tools, "Desktop development with C++" workload; WebView2 (ships with Win 11) |
| macOS | `xcode-select --install` |
| Linux | `libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev` |

> `bun run preview` serves the built frontend in a browser with **no Tauri
> backend** — no sidecar, no SQLite, no NDI, no IPC. The Control Room will show
> `dbStatus: error`. It is only useful for eyeballing the renderer; anything
> involving output needs `tauri dev`.

### Windows

Use `npm.cmd run dev:fresh` for verification runs that must start from a
genuinely fresh Tauri/WebView2 process. It runs `scripts/kill-dev.ps1` first,
then launches `bun.exe run tauri dev`. From PowerShell, prefer `bun.exe` — the
explicit `.exe` avoids execution-policy failures from the npm-installed
`bun.ps1` shim.

The cleanup script stops `broadcast-engine.exe`, Vite/Tauri listeners on the
project dev ports, and app-scoped `msedgewebview2.exe` orphans. This matters
because WebView2 renderer processes can outlive the Tauri host and keep stale
page state alive. `npm.cmd run dev:clean` does the cleanup without relaunching.

**CDP gotcha:** the WebView2 debug port is fixed at `9222` in
`src-tauri/tauri.conf.json`. A stale renderer holding that port makes a relaunch
*look* fresh while CDP attaches to the old page. Inspect
`http://127.0.0.1:9222/json` — use `127.0.0.1`, not `localhost`, because the
debug server binds IPv4.

### Output to OBS

Add a Browser Source pointed at `http://127.0.0.1:4977/program`, sized to the
project resolution. The page renders with a transparent background, so it
composites straight over your video bed.

If the Control Room shows an **OUTPUT DOWN** banner, the sidecar could not claim
port 4977 — almost always a previous `broadcast-engine.exe` that outlived its
window. Hover the banner for the specific reason.

## Testing tracking without a tracker

**Settings → Camera Tracking → Start listening → "Simulate a tracker"** emits
generated FreeD packets to the listener over loopback. It sends *real*
datagrams to the *real* socket, so it exercises the whole chain — encode, UDP,
checksum, camera-id filter, SSE fan-out, render camera — rather than injecting
poses into the renderer.

The status badge reads **SIMULATED**, never "Tracking", and it says so in amber
under the button. Generated motion must never be mistakable for a real camera.

What it proves: the plumbing works end to end. What it cannot prove: wire
conformance with a physical tracker, since it speaks this app's own encoder.
That still needs real hardware.

## Testing

```bash
bun run test           # Vitest unit suite
bun run test:watch
bun run test:coverage
bunx tsc --noEmit      # typecheck
bun run build          # production build

bun run scripts/verify-phase7.ts   # …and the other verify-*.ts suites
cd src-tauri && cargo test --lib

bun run check:windows  # type-check the Windows-only FFI from any platform
```

`check:windows` cross-compiles the `#[cfg(windows)]` code — `capture.rs`,
`ndi.rs`, `spout.rs` and the `webview2-com`/`windows` FFI — against the
`x86_64-pc-windows-gnu` target, so a Linux or macOS machine can catch a broken
Windows build in seconds instead of discovering it on a Windows box. One-time
setup: `rustup target add x86_64-pc-windows-gnu` plus `mingw-w64`. CI runs it
on every push, alongside a real MSVC build on `windows-latest`.

Two layers, deliberately:

- **Vitest** (`src/**/*.test.ts`) covers units — data sources, connectors,
  binding resolution and formatting, the timeline engine, take transitions,
  rundown timing.
- **`scripts/verify-phase*.ts`** are phase-level acceptance suites. They are
  real behavioural tests, not source greps, and CI runs both.

CI additionally runs a `windows-latest` job, because the NDI FFI, WebView2
capture and Spout code are all `#[cfg(windows)]` and cannot be compiled on the
Linux jobs.

The project's standing rule: **"it compiles" is never "it works."** Anything
touching the output plane needs a check against a running app before it counts
as done.

## Data connectors

Configure live feeds in **Data Sources → Live Data Connectors**. Each connector
has its own transport (poll / SSE / WebSocket), credentials (bearer, custom
header, query parameter, or basic), and target data source.

Status is deliberately precise: only **Live** means a payload actually arrived
and parsed. *Auth failed*, *Unreachable* and *Bad payload* are distinct states,
because they call for completely different fixes.

> **Credentials are stored unencrypted** in the local SQLite settings table,
> alongside the project, like every other local setting. There is no OS keychain
> integration. The file is user-scoped; treat it as you would any local config
> holding an API key.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/AUDIT-2026-08.md`](docs/AUDIT-2026-08.md) | Full system audit — findings, severities, what is fixed and what is not |
| [`docs/GAP_ANALYSIS.md`](docs/GAP_ANALYSIS.md) | Competitive comparison by product tier |
| [`docs/REMEDIATION_PLAN.md`](docs/REMEDIATION_PLAN.md) | Sequenced remaining work with acceptance criteria |
| `PLAN.md` | Phase-by-phase build history and architectural decisions |
| `docs/PHASE*_DESIGN.md` | Per-phase design rationale |

`docs/ar-system-audit.md` is **superseded** by `docs/AUDIT-2026-08.md` and is
retained only as a historical snapshot.

## Known limitations

Stated up front rather than discovered later. Full detail and severities in the
audit.

- **NDI output is video-only** and goes through a PNG encode/decode per frame,
  which caps throughput below 1080p50.
- **Spout / Syphon is a stub.** It reports unavailable honestly; it does not
  share a GPU texture.
- **No genlock, timecode, SDI or SMPTE 2110.** This cannot slot into a genlocked
  plant.
- **No camera tracking**, so no true broadcast AR — see above.
- **Single Program output.** No multi-channel playout, no engine failover.
- **MOS has not been proven against a real NRCS** (ENPS, iNEWS). The parser is
  well tested against its own builders, which is not the same thing.
- **Stinger transitions play muted** — there is no output audio path yet.

## IDE setup

[VS Code](https://code.visualstudio.com/) +
[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) +
[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
