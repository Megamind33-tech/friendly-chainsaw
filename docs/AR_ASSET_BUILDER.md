# AR Asset Builder — Implementation Report

## Repository Audit Summary

### Reused Systems
| System | Location | Integration |
|--------|----------|-------------|
| Workspace navigation | `workspace.ts`, `workspaces.tsx`, `PersistentShell.tsx` | Extended `builder` workspace |
| Dockable panels | `WorkspaceDockview.tsx` | 4 new panels + existing AR panels |
| Project persistence | `persistence.ts`, SQLite | `project.arBuilderAssets[]` |
| Undo/redo | zundo on `project` | Asset edits auto-tracked |
| Image import | `assetImport.ts` | Reused upload + thumbnails |
| 2D canvas | Konva (`GfxEditor` patterns) | `ArAssetCanvasPanel` |
| 3D preview | `Set3dEditor`, R3F | Canvas inset + 3D view mode |
| AR placement | `useArLayer`, `placement.ts` | Converts assets → `SetNode[]` |
| Data binding | `bindings.ts`, `dataSources.ts` | Per-asset `bindings[]` |
| Animation | `arMotionEngine.ts`, `ArTimelinePanel` | Reused in bottom panel |
| Safe areas | `SafeAreas.tsx` | Overlay on 2D canvas |
| Drag-drop | `builderDrag.ts` | `AR_ASSET_DRAG_MIME` → AR Stage |

### Gaps Addressed
- No dedicated image-to-AR workflow → full import/edit/layer/depth pipeline
- Builder workspace lacked asset library → `ArAssetLibraryPanel`
- No background removal → adapter pattern with local providers
- No election/sports/weather AR presets → 34 starter structures
- Asset → stage drag not wired → drag from library to AR Stage

## Architecture Decisions

1. **Assets stored in project JSON** (`arBuilderAssets[]`), binary files via existing sidecar (`/assets`)
2. **Session UI state** separate from undoable project (`sessionStore.ts`)
3. **Background removal** via replaceable `BackgroundRemovalProvider` interface
4. **No new canvas engine** — Konva reused from GFX editor
5. **No new global state library** — Zustand + existing `useDocStore`
6. **Lifecycle safety** — `edit → preview → ready → live` enforced in hook

## Files Created

```
src/ar-asset-builder/
  types.ts, schema.ts, constants.ts, factory.ts, layers.ts
  placement.ts, export.ts, sessionStore.ts, useArAssetBuilder.ts
  imageProcessing/backgroundRemovalAdapter.ts, chromaKey.ts, import.ts, providers.ts
  presets/election.ts, sports.ts, weather.ts, index.ts

src/components/panels/arAssetBuilder/
  ArAssetLibraryPanel.tsx, ArAssetCanvasPanel.tsx
  ArAssetInspectorPanel.tsx, ArAssetBottomPanel.tsx

scripts/verify-ar-asset-builder.ts
docs/AR_ASSET_BUILDER.md
```

## Files Modified

- `src/document/types.ts` — `arBuilderAssets` on Project
- `src/document/schema.ts` — Zod mirror
- `src/document/store.ts` — CRUD actions
- `src/document/factory.ts` — default empty array
- `src/document/persistence.ts` — migrate missing array
- `src/components/workspaces/workspaces.tsx` — builder layout v2
- `src/components/shell/PersistentShell.tsx` — tab label
- `src/ar-engine/builderDrag.ts` — asset drag MIME
- `src/components/panels/ArStagePanel.tsx` — asset drop target

## Dependencies Added

**None.** All functionality built on existing stack: Konva, Three.js/R3F, Zustand, Zod, GSAP (via AR motion).

## Data Schema

See `src/ar-asset-builder/types.ts` — `ArBuilderAsset` with:
- `schemaVersion`, `id`, `name`, `category`, `type`, `lifecycle`
- `dimensions`, `sourceFiles[]`, `layers[]`, `materials[]`
- `animations`, `bindings`, `anchors`, `states`
- `depthSettings`, `extrusionSettings`, `card3dSettings`, `shadowSettings`

## How to Open and Test

1. Run `bun run tauri dev` (or existing dev script)
2. Click **AR Asset Builder** in the top workspace tabs
3. Default layout: Asset Library (left), Canvas (center), Inspector (right), Layers & Workflow (bottom)
4. **Import**: Click "Import Image" or drag PNG/JPG/WebP/SVG
5. **Background removal**: Select asset → "Remove BG" in canvas toolbar
6. **Layers**: Use bottom panel or canvas sidebar
7. **2.5D depth**: "Depth Stack" button or inspector Depth settings
8. **3D preview**: Switch to 3D view mode or see inset preview
9. **Data binding**: Create election/sports preset → Inspector → Data Binding
10. **AR placement**: Mark Ready → "Place in AR Scene" or drag asset to AR Stage tab
11. **Persistence**: Assets save with project automatically (SQLite autosave)
12. **Verify**: `bun run scripts/verify-ar-asset-builder.ts`

## Known Limitations

- GLB export not yet implemented (listed when 3D modes active but requires Three.js exporter wiring)
- Mask brush / pen tools declared but not fully implemented in canvas
- Edge segmentation confidence is heuristic, not ML-based
- No Web Worker offload for image processing yet (runs on main thread via canvas)
- SVG import supported but rasterized at render time only

## Performance Considerations

- Thumbnails capped at 96px via existing `assetImport.ts`
- Background removal shows progress bar; abort via navigation away
- 3D preview inset uses read-only `Set3dEditor` (no gizmo overhead)
- Layer list uses asset references, not embedded binary in JSON
