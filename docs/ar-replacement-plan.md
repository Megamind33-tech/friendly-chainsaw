# Chase AR Replacement Plan

**Date:** 2026-07-09

---

## Preserve (Working Foundation)

| System | Reason |
|--------|--------|
| Tauri + axum sidecar | Real asset storage, document push, NDI |
| Zustand + zundo document store | Undo works; PGM/PVW correctly excluded |
| R3F `Set3dRenderer` / `Set3dEditor` | Production 3D/AR renderer |
| Konva GFX pipeline | Separate 2D — no conflict |
| `ar-engine/templates.ts` pattern | Real data-bound AR templates |
| `useArLayer` hook | AR scene operations |
| `persistence.ts` output bake | Correct single-resolution push |
| PGM/PVW + SSE envelope | Real preview/programme separation |
| OBS Browser Source `/program` | Valid delivery path |
| `bindings.ts` + `dataSources.ts` | Extend, don't replace |
| GSAP + `arMotionEngine` | Animation runtime |

---

## Repair

| System | Issue | Fix |
|--------|-------|-----|
| OBS dev redirect | Port 1420 vs 1423 | Change `lib.rs` redirect |
| External connector | Not persisted | Save to `app_state` |
| AR builder preset keys | `election.*` vs `politics.*` | Align to `election.*` feed via Data Hub |
| Binding transforms | `{value:,}` broken | Implement in `bindingEngine` |
| `invertMask` stub | Returns same mask | Fix or remove claim |
| MonitorsPanel divergence | Store vs envelope | Read envelope in embedded monitors |

---

## Replace

| From | To | Risk |
|------|-----|------|
| Scattered data ingest | `src/ar-system/dataHub/` | Low — wraps existing stores |
| `resolveElement` only transforms | `bindingEngine` with safe transforms | Low — additive |
| Hard-coded 2-candidate politics | Election repeater + N candidates | Medium |
| AR builder aspirational presets | Manifest-aligned election tower | Medium |
| `ARPanel.tsx` legacy | Remove from exports (keep file) | Low |
| Dead Rust HTML renderer | Remove or gate behind flag | Low |

---

## Remove (After Migration)

| Item | Condition |
|------|-----------|
| Dead `render_document_html` | After confirming no route uses it |
| Duplicate `take`/`cut` alias confusion | After transition engine or rename |
| GLB export listing without implementation | Remove from `getAvailableExports` or implement |
| `ComingSoonPanel` | If never wired |

---

## Do Not Remove

- libobs references (none exist — do not add fake ones)
- NDI module (working on Windows)
- Sport/genre template factories (working — migrate to Smart Assets gradually)
- AR Asset Builder (repair bindings, don't delete)

---

## Migration Order

1. Documentation + audit (this pass)
2. Data Hub + election schema
3. Binding engine transforms + LKG
4. Election candidate tower + repeater
5. WebSocket simulator + CSV/JSON adapters via Hub
6. Persist connector + election feed
7. Visual binding panel improvements
8. Property registry (incremental)
9. Behaviour engine
10. Smart Asset manifests
11. Native libobs source (separate project phase)

---

## Risk Level

| Phase | Risk |
|-------|------|
| Data Hub wrapper | **Low** |
| Election vertical slice | **Medium** |
| Repeater generalisation | **Medium** |
| Preview-first data mode | **Medium** |
| Native libobs module | **High** |
| Removing sport templates | **High** — do not do until Smart Asset parity |
