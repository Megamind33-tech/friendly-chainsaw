# Chase AR System Audit

**Date:** 2026-07-09  
**Repository:** `final chase` (broadcast-graphics-engine)  
**Auditor scope:** AR, data-driven graphics, broadcast output, persistence

---

## Executive Summary

Chase is a **Tauri + React + R3F** broadcast graphics application with a **real PGM/PVW pipeline**, **SQLite persistence**, and **OBS output via Browser Source** — not a native libobs plugin application. The 3D AR renderer (`Set3dRenderer` / `ArNodeAnimator`) is **working** and reaches Program, Preview, and OBS through the same React bundle at `http://127.0.0.1:4977/program`. Data binding is **partially working** (flat key resolution, `{value}` format only). There is **no Data Hub**, **no property registry**, **no repeater engine**, **no behaviour engine**, and **no Smart Asset manifest system**. The recently added AR Asset Builder is **partially working** (image import, local BG removal) but its preset bindings use keys that do not match built-in data feeds.

**Critical honesty:** The product brief references OBS/libobs as the core engine. In this repository, **libobs is not integrated**. OBS consumes Chase output as a **Browser Source** rendering the same SPA as the Program window. NDI is a separate Windows capture path (WebView2 → PNG → BGRA). This is a valid professional delivery path but is not libobs-native compositing.

---

## 1. Existing Architecture

| Layer | Technology | Evidence |
|-------|------------|----------|
| Desktop runtime | Tauri 2.x | `src-tauri/`, `tauri.conf.json` |
| UI framework | React 19 | `package.json` |
| 3D renderer | R3F 9.x + Three.js 0.185 | `Set3dRenderer.tsx`, `SetNodes.tsx` |
| 2D renderer | Konva + react-konva | `GfxEditor.tsx`, `DocumentRenderer.tsx` |
| State | Zustand + zundo + immer | `document/store.ts` |
| Persistence | SQLite (`tauri-plugin-sql`) | `persistence.ts`, `lib.rs` migrations |
| Sidecar | Axum on `127.0.0.1:4977` | `src-tauri/src/lib.rs` |
| OBS output | Browser Source → `/program` | `OutputStreamingPanel.tsx`, `program_handler` |
| NDI | Windows dynamic NDI SDK | `ndi.rs`, `capture.rs` |
| Animation | GSAP (ease parsing) + AR motion engine | `timelineEngine.ts`, `arMotionEngine.ts` |
| Validation | Zod v4 | `document/schema.ts`, `ar-asset-builder/schema.ts` |
| Tests | Bun verification scripts only | `scripts/verify-phase5.ts`, `verify-ar-asset-builder.ts` |

**No Babylon.js** remnants found. **No vitest/jest/playwright** test framework.

---

## 2. Feature Classification

### Broadcast Pipeline

| Feature | Status | Evidence |
|---------|--------|----------|
| libobs integration | **MISSING** | Zero `libobs`/`obs_source` references |
| OBS Browser Source output | **WORKING** | `/program` serves React `ProgramView` (packaged) or redirects (dev) |
| OBS dev redirect port | **BROKEN** | `lib.rs` redirects to `localhost:1420`; Vite runs on `1423` |
| PGM/PVW separation | **WORKING** | `programSceneId` / `previewSceneId` outside undo stack |
| Take / Cut | **WORKING** (identical) | `take()` aliases `cut()` — no transition engine |
| ON-AIR lamp | **WORKING** | `/status` measures `/program` consumer hits |
| NDI video output | **PARTIALLY WORKING** | Program WebView capture; no audio |
| NDI test pattern | **WORKING** | `generate_test_pattern` |
| Spout GPU share | **MISSING** | Listed in PLAN.md only |
| Rust HTML snapshot renderer | **DEAD CODE** | `render_document_html` unused |

### R3F AR Renderer

| Feature | Status | Evidence |
|---------|--------|----------|
| Set3dRenderer (output) | **WORKING** | Program/Preview/OBS path |
| Set3dEditor (authoring) | **WORKING** | Gizmo, pick, orbit |
| ArNodeAnimator | **WORKING** | `computeArMotion` per playback phase |
| AR role tagging (`role: "ar"`) | **WORKING** | `nodeUtils.ts` |
| AR templates library | **WORKING** | `ar-engine/templates.ts` — bound to live feeds |
| AR motion presets | **WORKING** | fade, slide, wipe, count-up, bar-grow, loop-pulse |
| AR readiness validation | **WORKING** | `validation.ts` |
| AR focus/isolate | **WORKING** | `arFocus.ts` |
| AR backplate video | **WORKING** | `SetEnvironment.backplate` |
| set3d under gfx2d z-order | **ARCHITECTURALLY HARMFUL** | `DocumentRenderer.tsx` — documented v1 bound |
| Contact shadow | **VISUAL ONLY** | Comment: "cheap fake contact shadow" |

### Data & Binding

| Feature | Status | Evidence |
|---------|--------|----------|
| Mock/sport/genre feeds | **WORKING** (as editable defaults) | `dataSources.ts` — not live APIs |
| Binding resolution (2D) | **WORKING** | `bindings.ts` `resolveElement` |
| Binding resolution (3D text) | **WORKING** | `SetNodes.tsx` `applyTextBinding` |
| Output bake before push | **WORKING** | `resolveProjectForOutput` in `persistence.ts` |
| Binding transforms | **PARTIALLY WORKING** | Only `{value}` replace; `{value:,}` unimplemented |
| External HTTP poller | **WORKING** (when configured) | `useExternalDataPoller.ts` |
| External WebSocket data | **MISSING** | SSE exists for document sync only |
| CSV import | **WORKING** | `parseCsvToValues` in `externalConnector.ts` |
| Connector config persistence | **MISSING** | `useExternalConnector` ephemeral |
| Data Hub (central) | **MISSING** | Scattered across `useDataStore` + poller |
| Schema validation on data | **MISSING** | Project schema only |
| Last-known-good / stale handling | **MISSING** | No packet status model |
| Preview-first update mode | **MISSING** | All updates push immediately |

### AR Workspaces & UI

| Feature | Status | Evidence |
|---------|--------|----------|
| AR workspace (viewport + author) | **WORKING** | `workspaces.tsx` `arConfig` |
| AR Builder / Asset Builder workspace | **WORKING** (UI) | `builderConfig` with 4 new panels |
| AR Author panel | **WORKING** | Templates, bindings, take on air |
| AR Asset Builder image pipeline | **PARTIALLY WORKING** | Local chroma/edge only; no ML |
| AR Asset Builder preset bindings | **FAKE** (key mismatch) | `election.*` vs `politics.*` feeds |
| AR Panel legacy wrapper | **DUPLICATED** | `ARPanel.tsx` not in workspace |
| Scene hierarchy (LayersPanel) | **WORKING** | Recursive `SetNodeRow` |
| Inspector (SetInspector) | **WORKING** | Per-node properties |
| Visual binding editor | **PARTIALLY WORKING** | Inspector bindings tab; no drag-drop |
| Property registry | **MISSING** | Free-form `targetPath` strings |
| Repeaters | **MISSING** | Fixed 11-slot squad only |
| Behaviour engine | **MISSING** | Animation presets only |
| Diagnostics panel | **MISSING** | No FPS/draw-call overlay |
| Smart Asset manifests | **MISSING** | No `asset.json` / `schema.json` files |

### Persistence

| Feature | Status | Evidence |
|---------|--------|----------|
| Project scenes/layers/nodes | **WORKING** | SQLite `projects.doc` |
| Bindings on elements/nodes | **WORKING** | In project JSON |
| arBuilderAssets | **WORKING** | Added in recent session |
| PGM/PVW scene IDs | **WORKING** | `projects.program` column |
| Live data values | **MISSING** | `useDataStore` in-memory only |
| layerPlayback / camera state | **MISSING** from SQLite | Pushed live to sidecar only |
| External connector settings | **MISSING** | Not persisted |
| API secrets | **PARTIAL** | OpenAI key in Rust state, not project |

---

## 3. Dependency Audit

| Dependency | Usage | Risk | Action |
|------------|-------|------|--------|
| `three` + `@react-three/fiber` + `@react-three/drei` | 3D AR/set | **KEEP** — core renderer |
| `konva` + `react-konva` | 2D GFX | **KEEP** — separate pipeline |
| `gsap` | Easing + timeline | **KEEP** |
| `motion` | UI animations | **KEEP** — not duplicate of GSAP |
| `zustand` + `zundo` + `immer` | State + undo | **KEEP** |
| `zod` | Schema validation | **KEEP** — extend for data |
| `dockview-react` | Panel docking | **KEEP** |
| `recharts` | Charts (stub) | **LOW RISK** — chart layer kind unused |
| `realism-effects` | SSR/PBR | **KEEP** |
| `lottie-web` | Motion graphics | **KEEP** |
| 20+ `@radix-ui/*` | shadcn UI | **KEEP** |

**No duplicate renderers.** No Babylon.js. No competing scene stores (single `useDocStore` + separate `useDataStore`).

### Harmful Patterns (Not Dependencies)

| Pattern | Why harmful | Files |
|---------|-------------|-------|
| PGM/PVW in same mutable scene | Mitigated — scene IDs are separate | `programState.ts` |
| Output bake strips bindings | Correct for output windows | `persistence.ts` |
| MonitorsPanel reads store not envelope | Can diverge from Program/Preview | `MonitorsPanel.tsx` |
| AR builder aspirational binding keys | Bindings never resolve from built-in feeds | `ar-asset-builder/presets/` |
| `take()` === `cut()` | No preview-first gate on data updates | `programState.ts` |

---

## 4. Architecture Risks

1. **No libobs** — Cannot composite AR as native OBS source without Browser Source or future native module.
2. **No Data Hub** — Network access scattered; no unified packet validation.
3. **No repeater** — Election/sports arrays require hard-coded slot counts.
4. **Binding engine too simple** — No safe transforms, no stale/invalid rejection.
5. **Live data not persisted** — Operator edits lost on restart unless Data Pages used.
6. **OBS dev port mismatch** — Breaks Browser Source testing in development.
7. **GLB export advertised but not implemented** — `getAvailableExports()` lists GLB without exporter.
8. **Edge segmentation `invertMask`** — Returns same mask (honest stub).
9. **AI image gen** — Works with API key but not part of core AR data pipeline.

---

## 5. What Is Real vs Simulated

| Real | Simulated / Fake |
|------|------------------|
| SQLite project save/load | Live scoreboard APIs |
| PGM/PVW take to sidecar | Animated take transition |
| R3F render in Program window | libobs native source |
| OBS Browser Source (packaged) | OBS Browser Source (dev port) |
| NDI sender (Windows + SDK) | NDI audio |
| HTTP external poller | WebSocket election feed |
| Operator-editable mock feeds | AR builder `election.*` keys without adapter |
| SSE document stream | — |
| Chroma-key BG removal (local) | ML segmentation |

---

## 6. Recommended Priority

1. Fix OBS dev redirect port (immediate)
2. Build Data Hub + election schema validation
3. Build binding engine with safe transforms + LKG
4. Build election candidate tower repeater (vertical slice)
5. Align AR builder preset keys with real feed namespace
6. Persist external connector + election feed values
7. Add WebSocket election simulator
8. Property registry (incremental)
9. Native `chase-ar-source` libobs module (future — do not claim complete until tested)
