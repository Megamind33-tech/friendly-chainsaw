# Chase AR Target Architecture

**Date:** 2026-07-09  
**Status:** Target — partial implementation in `src/ar-system/`

---

## Data Flow

```
DATA SOURCE (manual / JSON / CSV / REST / WebSocket / internal)
    ↓
DATA ADAPTER (per-source connector — no direct API in scene components)
    ↓
SCHEMA VALIDATION (Zod — reject invalid, keep last-known-good)
    ↓
NORMALISATION (flat key namespace: election.candidates.0.name)
    ↓
CHASE DATA HUB (ChaseDataPacket per source, connection status)
    ↓
BINDING ENGINE (safe transforms, fallback, update mode)
    ↓
SMART ASSET / SCENE PROPERTY SYSTEM (registered properties on SetNodes)
    ↓
BEHAVIOUR ENGINE (deterministic rules — future phase)
    ↓
ANIMATION RUNTIME (GSAP + arMotionEngine — render loop, not React state per frame)
    ↓
PREVIEW STATE (previewSceneId + preview data channel)
    ↓
OPERATOR APPROVAL / TAKE (cut preview → program)
    ↓
PROGRAMME STATE (programSceneId + baked envelope)
    ↓
CHASE AR RENDER SOURCE (Set3dRenderer via DocumentRenderer)
    ↓
OUTPUT BRIDGE (Tauri sidecar /program → OBS Browser Source; NDI capture)
    ↓
RECORDING / STREAMING / NDI
```

---

## State Ownership (Separated)

| Concern | Owner | Persisted |
|---------|-------|-----------|
| Scene document (layers, nodes, bindings defs) | `useDocStore.project` | SQLite `projects.doc` |
| Live data values | `useDataStore` + Data Hub | `app_state` (target) |
| Data source configs | Data Hub registry | `app_state` |
| PGM/PVW scene selection | `programSceneId` / `previewSceneId` | SQLite `projects.program` |
| Playback / camera / AR focus | Store slices | Sidecar push only (live) |
| Editor UI (selection, pan, session) | UI slices / session stores | Workspace layout in localStorage |
| Output envelope | Rust `ProgramDocState` | In-memory + SSE |

**Rule:** Programme must not read mutable editor state directly. Today: `resolveProjectForOutput` bakes data at push time — correct pattern, extend with validation.

---

## Module Map (Target)

```
src/ar-system/
├── dataHub/
│   ├── types.ts          ChaseDataPacket, SourceStatus
│   ├── dataHub.ts        Central ingest, LKG, stale detection
│   └── wsSimulator.ts    Dev WebSocket election feed
├── validation/
│   └── electionSchema.ts Zod election model
├── binding/
│   ├── transforms.ts     Safe format functions (no eval)
│   └── bindingEngine.ts  Resolve + validate + fallback
├── election/
│   ├── electionFeed.ts   Normalised candidate keys
│   ├── candidateTower.ts AR SetNode factory
│   └── repeater.ts       Array → scene nodes
├── propertyRegistry.ts   SetNode property definitions (incremental)
└── index.ts
```

---

## Output Bridge (Current vs Target)

### Current (Working)

- **In-app Program window:** Tauri WebView → `ProgramView` → `DocumentRenderer` → `Set3dRenderer`
- **OBS:** Browser Source → `http://127.0.0.1:4977/program` → same React bundle (packaged)
- **NDI:** WebView2 capture of Program window → BGRA frames → NDI sender

### Target (Future — Not Claimed Complete)

- Native `chase-ar-source` libobs module
- D3D11 shared texture path (Windows)
- Zero-copy GPU handoff

---

## Smart Asset Model (Target)

```
asset-folder/
├── model.glb
├── asset.json      # manifest: exposed nodes, properties, bindings slots
├── schema.json     # data schema this asset expects
├── thumbnail.webp
└── presets/
```

Current: TypeScript factories in `ar-engine/templates.ts` and `ar-asset-builder/presets/` — migrate to manifest-driven over time.

---

## Preview / Programme Modes

| Mode | Behaviour |
|------|-----------|
| `AUTO` | Valid updates reach Programme on next push (current default) |
| `PREVIEW_FIRST` | Data updates apply to preview channel; TAKE promotes |
| `MANUAL` | Operator applies each change explicitly |

Binding-level `updateMode` field (target) on `Binding` interface extension.

---

## AI Boundaries

Claude / AI assistants operate through structured commands only:

- `inspect_scene`, `create_binding`, `set_property`, `validate_scene`, etc.
- Never: `take`, `stream`, `delete_project`, arbitrary shell, Programme direct write

AI changes = grouped undo command batch.
