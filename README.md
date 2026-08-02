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

### Build it locally

This is the route that works today. From an elevated PowerShell in the project
directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-windows.ps1
```

That installs Rust, Visual Studio Build Tools with the C++ workload, WebView2
and Bun via winget, skipping anything already present — so a re-run after a
partial failure is safe. Then open a **new** terminal (PATH changes don't reach
the current one):

```powershell
bun install
bun run doctor        # confirms the prerequisites actually resolved
bun run tauri build   # 10-20 minutes cold
```

The installers land in `src-tauri\target\release\bundle` — an NSIS `.exe` and a
WiX `.msi`. Run the `.exe`. Or skip the bundle and use `bun run tauri dev` to
run straight from source.

### Cross-build from Linux or macOS

You do not need a Windows machine to produce a Windows build.

```bash
bun run build:windows-installer   # NSIS .exe installer
bun run build:windows-portable    # bare .exe, no installer
```

`build:windows-installer` writes
`src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/Broadcast Graphics Engine_<version>_x64-setup.exe`
— a real Nullsoft installer, ~14 MB, that installs per-machine with Start-menu
and uninstall entries.

`build:windows-portable` skips the bundler and leaves
`.../release/broadcast-engine.exe`: a statically linked PE32+ whose only
non-system import is `WebView2Loader.dll`, dropped beside it. Copy those two
files anywhere and run the exe. No mingw runtime DLLs, frontend assets embedded
in the binary.

One-time setup: `rustup target add x86_64-pc-windows-gnu`, plus `mingw-w64` and
— for the installer — `nsis`:

```bash
sudo apt-get install -y mingw-w64 nsis
```

> **This is the gnu toolchain, not MSVC.** Tauri's supported Windows target is
> MSVC; a mingw build links clean and is a valid executable, but the
> hand-rolled Windows FFI — NDI, WebView2 `CapturePreview` — has never been
> *executed* from a gnu build. Treat it as a way to get running quickly, and
> build with MSVC (above) for anything that has to be trusted on air.

### Prebuilt installer (blocked)

`.github/workflows/release-windows.yml` builds the `.msi` and `.exe` on a
GitHub `windows-latest` runner and uploads them as an artifact, so installing
would need no toolchain at all: Actions tab → **Windows installer** → newest
run → download **`broadcast-graphics-engine-windows`**.

**This does not work yet** — Actions cannot provision a runner for this account
(see the CI note under [Testing](#testing)). The workflow is correct and will
produce installers the moment that clears; until then, cross-build above or
build locally. Its remaining advantage over cross-building is that it is an
MSVC build on a real Windows host, which is the supported configuration.

> Builds are **unsigned** — no code-signing certificate is configured — so
> SmartScreen warns on first run. Choose *More info* → *Run anyway*. The
> installer is per-machine, so Windows asks for administrator rights.

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
setup: `rustup target add x86_64-pc-windows-gnu` plus `mingw-w64`.

Two layers, deliberately:

- **Vitest** (`src/**/*.test.ts`) covers units — data sources, connectors,
  binding resolution and formatting, the timeline engine, take transitions,
  rundown timing.
- **`scripts/verify-phase*.ts`** are phase-level acceptance suites. They are
  real behavioural tests, not source greps.

> ### CI is configured but has never run
>
> `.github/workflows/ci.yml` defines Linux and `windows-latest` jobs, and they
> are correct — but **every workflow run in this repository's history has
> failed within about five seconds**, back to the first push. Each job reports
> no runner, no steps and no logs, on Linux and Windows alike, so nothing is
> being gated. Fix it in **Settings → Actions → General** (allow all actions)
> and check the account's billing status; until a run goes green, treat these
> workflows as unproven and run the suites locally. See `docs/AUDIT-2026-08.md`,
> S0-20.

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
