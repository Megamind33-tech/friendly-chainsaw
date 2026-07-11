# Sports AR 3D Models — Library Guide

**Location in app:** AR workspace → AR Author → **Build** tab → `AR 3D Models › Sports Graphics`
**Code:** [`src/ar-engine/sportsPanels/`](../src/ar-engine/sportsPanels)
**Distribution assets:** [`public/assets/ar/sports/`](../public/assets/ar/sports) (models / manifests / schemas / thumbnails / variants / presets)

Ten independent, parametric, data-ready AR panel models (`ar_sports_panel_01` … `_10`), each built from one reference image. Every model opens **empty and sport-neutral** — no team, score, logo, words, or colour identity — and binds to the provider-neutral `sports.*` live feed.

## Architecture

| Piece | File | Role |
|---|---|---|
| Construction kit | `panelKit.ts` | Params + ranges, neutral material presets, outline math (chamfer/facet/arch/shield/circle + convex inset), light strips, content zones, base families |
| Assembler | `panelBuilder.ts` | Builds the COMMON SCENE HIERARCHY (`STRUCTURE`/`LIGHT_STRIPS`/`CONTENT_ZONES`/`OPTIONAL_SPORT_PROPS`/`ANIMATION_RIG`/`COLLISION_BOUNDS`/`EDITOR_GUIDES`) from a spec; `rebuildSportsPanelNodes` re-parametrises while preserving operator content |
| Specs | `specs.ts` | The 10 per-reference silhouette/base/strip definitions |
| Registry | `index.ts` | `SPORTS_AR_MODELS`, colour groups, optional prop modules, manifest generation |
| GLB export | `glbExport.ts` | SetNode → real three.js geometry → binary glTF (app button + generator script) |
| Live feed | `src/sports/liveData.ts` | `sports.*` flat keys (all-empty defaults) + sport extension keys |
| Connectors | `src/sports/sportsConnector.ts` | JSON payload ingest with validation, WebSocket, REST polling, test simulator — all batched (one store update per payload) |
| Editor UI | `src/components/panels/ar/SportsModelsGrid.tsx`, `SportsModelInspector.tsx` | Library cards; geometry/colours/materials/placement/data-mapping/export panel (AR Author → **Model** tab) |

The engine itself gained (all schema-mirrored + factory-copied):
- **`prism` primitive** — extruded polygon with optional hole and real bevels (`prismGeometry.ts`); the basis for every frame ring and silhouette.
- **`arModel`** on group nodes — which library model built the subtree + its geometry params (drives rebuild / Reset to Reference).
- **`visibilityRule`** — declarative data-driven show/hide, baked into `visible` on output push.
- **`updateAnim`** — per-node data-change reaction (pulse/flash/fade); fires only when the resolved value actually changes.
- **`arPlacement`** — worldLocked/floorAnchored/cameraFacing/presenterAnchored/screenSpace/free3D with real per-frame behaviours in `SetNodes.tsx`.
- **Named binding formatters** (`src/ar-system/binding/format.ts`) — `uppercase`, `clock`, `truncate:12`, `suffix: PTS`, pipes — shared by the editor render path and the output bake.

## Registering a future model

1. **Spec** — add a `SportsPanelSpec` in `specs.ts`: id (`ar_sports_panel_NN`), display name, reference `defaults` (the silhouette at reset), `outline(p)` (reuse `chamferRectOutline`/`facetRectOutline`/`archRectOutline`/`shieldOutline` or hand-author convex CCW points), a base family (`ovalPlinthBase`/`steppedPlinthBase`/`drumPedestalBase`/`shelfBase`), strip sides, and optional `supports` flourishes. Append it to `SPORTS_PANEL_SPECS`.
2. **Generate** — `bun run scripts/generate-sports-ar-assets.ts` writes its manifest, the updated library manifest, and its GLB.
3. **Thumbnail** — with the vite dev server running: `node scripts/capture-sports-ar-thumbnails.mjs` (renders the real geometry via `thumbnails.html`).
4. **Verify** — `bun run scripts/verify-sports-ar-models.ts` (update the expected count) — checks hierarchy, empty defaults, neutrality, prism geometry, rebuild/reset, manifest↔registry consistency, GLB validity.

The card appears in Build automatically — the grid renders straight from the registry.

## Data flow

Manual values: Data workspace → Sports Live feed, or the Model tab's mapping rows.
Programmatic: `applySportsPayload(schemaShapedObject)` / `startSportsWebSocket(url)` / `startSportsRestPolling(url, ms)` / `loadSportsTestData()`. Invalid fields (bad scores, non-hex colours, malformed clocks, non-URL images) are **dropped with editor warnings**, never crash the scene. Payload shape: [`sports-live-data.schema.json`](../public/assets/ar/sports/schemas/sports-live-data.schema.json); sport-specific extras go under `extensions` so base manifests never change per sport.

Bindings resolve live in the editor and are **baked at push time** (`persistence.ts`) so Program/Preview/OBS render the control room's values. `updateAnim` reactions compare resolved display strings — re-received identical data never re-animates.

## Variants

"Save variant" stores the configured AR layer (geometry params, materials, colours, zone mappings, formatters, visibility rules, placement, transform) through the existing user-template store — JSON configuration only, the GLB is never duplicated.
