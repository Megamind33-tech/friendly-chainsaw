# Chase AR Implementation Progress

**Started:** 2026-07-09

---

## Task Log

### 2026-07-09 — Repository audit + documentation

| Item | Detail |
|------|--------|
| **Existed** | R3F renderer, PGM/PVW, SQLite persistence, mock feeds, AR templates, AR Asset Builder |
| **Changed** | Audit + architecture docs |
| **Tests** | `verify-ar-asset-builder.ts` (17 pass) |

### 2026-07-09 — Core `ar-system` + election slice

| Item | Detail |
|------|--------|
| **Changed** | Data Hub, election schema, binding engine, candidate towers, Data Sources hub UI |
| **Tests** | `verify-ar-election-slice.ts` |

### 2026-07-09 — Property registry, binding panel, behaviours, persistence

| Item | Detail |
|------|--------|
| **Added** | `propertyRegistry.ts`, `electionBehaviour.ts`, `DataBindingsPanel.tsx` |
| **Changed** | Store set-node binding CRUD, external connector SQLite persistence, election preset keys aligned to `election.*` feed |
| **Remains** | Native libobs GPU source, rank-reorder layout animation |
| **Tests** | Extended `verify-ar-election-slice.ts` (property + behaviour) |

---

## Completion Checklist (Vertical Slice)

- [x] Election schema validates JSON/CSV input
- [x] Invalid values rejected with LKG
- [x] Candidate repeater generates N towers
- [x] Template registered (`election-candidate-towers`)
- [x] Visual binding editor panel (Data workspace)
- [x] Property registry for SetNode / gfx2d paths
- [x] Behaviour events (leader change, rank change)
- [x] External connector settings persist
- [x] AR builder presets use `election.candidates.N.*` keys
- [x] Live simulator feeds interval updates
- [x] AR builder Smart Asset export emits `asset.json` + `schema.json`
- [x] Automated unit tests pass
- [ ] Manual PGM/PVW/OBS smoke test

---

### 2026-07-09 — Cross-stream verification pass (second work stream)

| Item | Detail |
|------|--------|
| **Verified** | `verify-ar-election-slice.ts`: 18/18 pass (schema validation, LKG rejection, repeater generation, property registry, leader/rank behaviours) against the SHIPPED modules |
| **Verified** | Vite dev on corrected port 1423 (200); `lib.rs` `/program` dev redirect fixed to 1423 confirmed in source |
| **Verified** | Full `tsc --noEmit` exit 0 across both streams' work (Builder page strip + election slice coexist cleanly) |
| **Changed** | Builder workspace stripped to doc'd 4-panel layout (Palette/Stage/Inspector/Timeline) — operator rejected the merged asset-wizard layout as drift; wizard panels remain in repo, unwired (`workspaces.tsx` builderConfig v3) |
| **Context** | This app is NOT libobs-embedded (audit §0/§critical-honesty is correct); OBS integrates via Browser Source (sidecar) + NDI — the directive's own "acceptable initial implementation" |
| **Remains** | Eyes-on PGM/PVW/OBS smoke test in the running GUI (operator); rank-reorder layout animation; native libobs source (future) |

### 2026-07-10 — Smart Asset manifest export path

| Item | Detail |
|------|--------|
| **Changed** | AR builder canonical export path now emits Smart Asset `asset.json` and `schema.json` files. Manifest exposes builder layers, logical binding slots, binding sources, placement/render settings, and embeds the builder document for reconstruction. |
| **Changed** | Builder export UI lists Smart Asset first; legacy `.ar-asset.json` and bundle exports remain available for compatibility. |
| **Tests** | `verify-ar-asset-builder.ts`: 28/28 pass; `tsc --noEmit`: pass |

## Next Steps

1. Manual broadcast smoke test
2. Rank-reorder layout animation on live data
3. Native libobs `chase-ar-source` module (future)
