# MIGRATION MAP — Current Repo → Software-Defined Broadcast Graphics Engine

> Companion to the Production Overhaul Build Brief (§15 Migration Plan). This documents **what exists today**, **what it becomes**, and **what has no counterpart and must be built from zero**. Produced by full read-through of the codebase on 2026-07-04, before `PLAN.md`.

---

## 1. CURRENT-STATE INVENTORY

**Stack found:** Next.js 16 (App Router, standalone output, `ignoreBuildErrors: true`), React 19, TypeScript, Tailwind v4, shadcn/ui (~40 components), R3F 9 + drei 10 + three 0.185, Zustand 5 (flat, no undo), Prisma 6 + SQLite, bun. Single-page app: one route ([src/app/page.tsx](src/app/page.tsx)) with a fixed left 3D viewport + right 340px tab panel.

**Total studio code: ~2,220 lines** (2,033 in panels/scene + 185 store). Everything else is scaffold (shadcn kit, Prisma boilerplate, template scripts).

| File | Lines | What it actually is |
|---|---|---|
| [src/lib/studio-store.ts](src/lib/studio-store.ts) | 185 | Flat Zustand store of **preset enums** — 6 scene templates, 6 camera presets, 6 lighting presets, 6 AR types, stream config, depth config, `isOnAir: boolean`. The exact anti-pattern §15.3 targets. |
| [src/components/studio/VirtualStudioScene.tsx](src/components/studio/VirtualStudioScene.tsx) | 523 | The only substantive asset. R3F canvas: 6 hardcoded set-geometry components (NewsDesk, WeatherMap, TalkShowSetup, SportsArena, ElectionHQ, BreakingNewsSet), StudioFloor (chroma-color plane option), StudioWalls, StudioLights (3-point + color-temp→hex mapping), AROverlayObjects (switch on 6 types, hardcoded content like "HOST NAME"), ACES tone mapping, OrbitControls, `Environment preset="city"`. |
| [src/components/studio/ScenePanel.tsx](src/components/studio/ScenePanel.tsx) | 153 | Template picker grid + bg/floor color + grid toggle + chroma toggle. Dropdown-only surface. |
| [src/components/studio/CameraPanel.tsx](src/components/studio/CameraPanel.tsx) | 200 | 6 preset buttons (each = position + FOV) + XYZ/FOV/zoom sliders + fake "auto track" toggle (drives nothing real). |
| [src/components/studio/LightingPanel.tsx](src/components/studio/LightingPanel.tsx) | 190 | 6 preset buttons (key/fill/rim/ambient/temp bundles) + intensity sliders. Values DO drive the R3F lights — salvageable params. |
| [src/components/studio/ARPanel.tsx](src/components/studio/ARPanel.tsx) | 257 | Layer list with visibility/lock/delete, add-by-type (6 fixed types), position/opacity sliders. A proto-layers-panel, but elements are hardcoded switch-cases, not editable content. |
| [src/components/studio/StreamPanel.tsx](src/components/studio/StreamPanel.tsx) | 267 | **100% theatre.** `GO LIVE` flips `isOnAir` boolean; elapsed timer via `setInterval`; "Connected"/bitrate badges are `Math.random()`. Protocol/quality pickers set strings nothing consumes. The named failure mode (§0 rule 2, §18). |
| [src/components/studio/DepthPanel.tsx](src/components/studio/DepthPanel.tsx) | 209 | "2d / 2.5d / 3d mode" selector + DOF sliders — **no postprocessing pipeline exists**; the values render nothing. Fake. |
| [src/components/studio/DocsPanel.tsx](src/components/studio/DocsPanel.tsx) | 234 | 7 onboarding doc sections describing the *fake* system. Concept keepable, content must be rewritten. |
| [src/app/page.tsx](src/app/page.tsx) | 252 | Header (fake ON AIR badge + GO LIVE button), viewport with decorative safe-area guides/crosshair, tab switcher, StatusBar with **simulated FPS** (`58 + Math.random()*4`) and simulated bitrate. |
| [src/app/api/route.ts](src/app/api/route.ts), [src/lib/db.ts](src/lib/db.ts), [prisma/schema.prisma](prisma/schema.prisma) | ~50 | Dead weight: hello-world API, unused Prisma client, template User/Post models. Nothing studio-related is persisted anywhere. |
| `.zscripts/`, `Caddyfile`, `examples/websocket/`, `mini-services/`, `db/custom.db`, `.env` | — | Cloud-sandbox template plumbing (paths like `/home/z/my-project`). No value on Windows/Tauri. |
| `src/components/ui/*` (~40 files) | — | shadcn/ui kit. **Keep** per locked stack; restyle to broadcast-dark. |
| [worklog.md](worklog.md) | 32 | Prior agent's log; confirms the "6 presets everywhere + simulated stream" build approach. |

**Honest verdict:** genuinely real: the R3F scene rendering and lighting parameter plumbing. Partially real: AR layer CRUD (list mechanics, not content). Fake: streaming, on-air state, FPS/bitrate readouts, depth/DOF, auto-track. Absent: everything else in the brief.

---

## 2. MAPPING — CURRENT → TARGET (per brief §)

### A. PORT (concepts/values survive, code is rewritten into the new architecture)

| Current | → Target | How |
|---|---|---|
| `VirtualStudioScene.tsx` set geometry (6 sets) | **§7 Virtual Set engine** — 6 *editable starter scenes* | Re-express each hardcoded component as scene-graph document data (`set3d` layer with placed pieces + transforms). Gizmo-editable. Keep the geometry/material ideas. |
| `StudioLights` (key/fill/rim/ambient, colorTemp→hex) | §7 lighting rig | Becomes editable light objects in the document; keep the Kelvin mapping logic; upgrade to `RectAreaLight` + HDRI env. |
| `cameraPresets` (6 pos+FOV bundles) | §7 named virtual cameras | Presets → editable, unlimited, animatable camera objects in the document. |
| `lightPresets` (6 bundles) | §7 lighting presets | Same treatment: editable starting points stored as data. |
| `CameraState` / `LightingState` / `SceneConfig` param shapes | §5 document `props` | Field names/ranges inform the Layer props schema. |
| AR layer-list UX (visibility/lock/delete/select→properties) | §5/§6 Layers panel + Inspector | The interaction pattern survives; backing model becomes scene-graph Layers, content becomes real editable elements. |
| Chroma-key floor toggle (color swap only) | §7 real GPU keyer | Today it just paints the floor green. Becomes an actual luma/chroma shader keyer on a camera feed. |
| Safe-area guide overlay (decorative divs) | §6 editor safe-areas | Becomes real title/action-safe overlays in the Konva editor at project resolution. |
| Dark broadcast visual language (`#050510`/`#4a90d9`, mono, dense) | §14 theme | Direction is right; formalize as the Tailwind/shadcn broadcast-console theme with tabular numerals. |
| shadcn/ui components, TS/eslint config, bun, `.git` history | New shell | Carried over per locked stack / §15. |
| DocsPanel structure (7-section onboarding) | §17 operator guide | Keep the idea; rewrite every word for the real system (OBS setup, Companion, templates, running a show). |

### B. REPLACE (the thing exists in name only; real subsystem built per brief)

| Current fake | → Real subsystem |
|---|---|
| `isOnAir` boolean + GO LIVE button + timer + random bitrate/FPS | **§10 Output plane**: Program window → Browser-Source URL sidecar → NDI → Spout; ON-AIR driven by actual frame flow, real fps + dropped-frame counters. |
| `StreamProtocol`/`StreamQuality` string pickers | §10 consumers (each protocol = a real, individually wired output; unfinished ones visibly disabled, never fake-success). |
| `recording: boolean` toggle | §10 FFmpeg record sidecar. |
| DepthPanel "2d/2.5d/3d" + dead DOF sliders | §7 `@react-three/postprocessing` pipeline (real DepthOfField/Bloom/grade). |
| `autoTrack` toggle + `trackingSensitivity` | §8 FreeD/Live Link UDP ingest driving the matched virtual camera. |
| 6 hardcoded `ARObjectType` switch-cases (incl. `lower-third`, `ticker`, `data-visual` rendered as 3D boxes with fixed text) | Lower-third/ticker/data-visual → **§6 GFX engine** (Konva 2D layers, data-bound, GSAP-animated). Virtual-screen/particles/world-anchored → **§8 AR engine** (free 3D placement via gizmos). |
| Flat preset-enum Zustand store | **§5 Scene-Graph document** (Project→Scene→Layer→Element + bindings + timelines + rundown) + zundo undo/redo + immer. |
| Prisma/SQLite over Node (unused anyway) | §2 SQLite via `@tauri-apps/plugin-sql`, local-first autosave. |
| Next.js shell, single fixed layout, tab panel | §2/§14 Tauri v2 multi-window (Control Room/Program/Preview) + Vite SPA + Dockview. |

### C. DELETE (no successor)

`src/app/api/route.ts` · `src/lib/db.ts` · `prisma/` + `db/custom.db` + `.env` (Linux path) · `.zscripts/` · `Caddyfile` · `examples/websocket/` · `mini-services/` · `next.config.ts` / `next-auth` / `next-intl` / `next-themes` / `eslint-config-next` · StatusBar simulation code · `z-ai-web-dev-sdk` · unused deps (dnd-kit, mdxeditor, embla, input-otp, vaul, react-day-picker, syntax-highlighter — re-add only on demonstrated need). Recharts: demote to internal-dashboard-only (§9), never on-air.

### D. BUILD FROM ZERO (no current counterpart at all)

- **§5** Scene-graph document model, undo/redo, autosave, schema migrations, JSON import/export
- **§6** Entire Konva GFX editor (stage, transforms, inspector, element palette, masks), Pixi output compositing, templates-as-data
- **§6** GSAP timeline system (IN/IDLE/OUT keyframes, easing, scrub)
- **§8** AR compositor (camera backplate, matched camera, FreeD parser, node-based composite chain)
- **§9** MapLibre map layers; visx/d3 chart builder
- **§10** All four output paths + PGM/PVW take/cut/auto discipline + output health telemetry
- **§11** Rust control server (REST+WS, AMCP-style), Companion module, rundown runner
- **§12** Data source adapters, binding engine, sport state machines, frame-accurate clock engine
- **§13** Full sports package (8+ sport schemas, scorebugs, lower thirds, tickers, lineups, tables, brackets…) + Brand Kit theming
- **§14** Dockview control room, command palette, global transport, multi-monitor, saved layouts
- **§4** All Tauri sidecars: control server, static output server, CEF→NDI bridge, Spout, FFmpeg ingest/record
- **§16 P8** Packaging, signed Windows installer, hardening

**Proportion estimate: ~10–15% of the target system has any seed in this repo; ~85–90% is greenfield.** The repo's chief value is (a) the R3F set/lighting starting material, (b) the shadcn kit + visual direction, (c) a precise catalog of the fakes to eliminate.

---

## 3. MIGRATION SEQUENCE NOTES (refines brief §15 with found facts)

1. **New shell first** (§15.1): scaffold Tauri v2 + Vite + React 19 + Dockview *alongside* the Next.js app in this repo; nothing in the old app blocks it. Old app stays runnable as visual reference until parity.
2. **Port order for the R3F scene**: geometry components are self-contained pure-JSX → translate cleanly to document-driven `set3d` data. `useStudioStore` calls inside scene components are the only coupling to break. Note: `VirtualMonitor` mutates material via `children[1]` index — fragile pattern, do not carry it over.
3. **Store migration**: no persistence exists today, so there is **no user data to migrate** — the "migration" is purely conceptual (preset values become document seed data). This removes a whole class of risk.
4. **Dead code**: Prisma/api/db.ts referenced nowhere in studio code — delete in the same commit that removes Next.js, no staging needed.
5. `tsconfig`/eslint largely reusable; drop Next-specific plugin config. `next.config.ts` has `ignoreBuildErrors: true` — the new build must NOT carry this; TypeScript errors fail the build (§17 quality bar).
6. Repo currently has unstaged template-script modifications (`.zscripts/*`, `download/README.md`) — irrelevant files; commit or discard before Phase 0 for a clean baseline.

## 4. OPEN QUESTIONS FOR OPERATOR (per §0: ask, don't invent)

1. **Rust toolchain**: Tauri v2 needs Rust (MSVC) + WebView2 on this Windows machine — confirm install is acceptable.
2. **Repo layout**: new app at repo root (Next.js moved to `legacy/` until parity) or in an `app/` subdirectory? Recommend: move mockup to `legacy/`, new app at root.
3. **NDI SDK**: Phase-2 NDI bridge requires the NDI runtime/SDK license acceptance — confirm when we reach Phase 2.
4. **Package manager**: keep bun for the JS side (brief §15 says "where compatible") — bun works with Vite/Tauri; recommend keeping.
