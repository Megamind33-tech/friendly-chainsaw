# Remediation Plan

**Date:** 2026-08-01 · **Companion to:** `AUDIT-2026-08.md`, `GAP_ANALYSIS.md`

Project convention: **acceptance criteria written before implementation**, and "it compiles" is never "it works."

---

## Completed in this pass

Implemented, typechecked, built, and pinned with tests on `claude/software-audit-refinement-4lwrdi`.

| ID | Fix | Verified by |
|---|---|---|
| **S0-1** | ON-AIR heartbeat moved from `setInterval` to `requestAnimationFrame` + single-flight guard; `status.rs` doc corrected | `tsc`, build; **live check still required** — see R0 |
| **S0-2** | Election data honesty across all 5 fail-open paths; `DataPacketStatus` gains `simulated`/`sample`/`unknown`; hub registers `offline`; never-updated sources go stale | `dataHonesty.test.ts` — 9 tests |
| **S0-3** | `lock_recover()` replaces `.lock().unwrap()` at all 11 output-plane sites | `cargo check --tests`, `cargo test --lib` — 36 pass |
| **S1-4** | `mergeExternalValues` applies a whole multi-source payload in ONE store write | `externalConnector.test.ts` — asserts exactly 1 notification |
| **S1-5** | Two-column CSV header/row disambiguation | `externalConnector.test.ts` — 4 CSV tests |
| **S1-6** | Vitest 3.2.7 + happy-dom + config + scripts; 22 seed tests | `bunx vitest run` |
| **S1-7** | `verify-rust-windows` CI job (`windows-latest`) + `bun run test` wired into the frontend job | YAML parses; job graph verified — first CI run is its own proof |

**Baseline after changes:** `tsc --noEmit` clean · `bun run build` passes · 6/6 `verify-phaseN` suites pass · `cargo check --tests` passes · `cargo test --lib` 36/36 · `vitest run` 22/22.

---

## R0 — Verify the S0 fixes on Windows · BLOCKING · effort: 1h

The three S0 fixes are correct by construction and covered by tests, but two of them assert things about a running Windows app that **cannot be observed in a Linux container**. Do this before trusting any of it on air.

**Acceptance:**
1. `npm.cmd run dev:fresh`. Point OBS at `http://127.0.0.1:4977/program`. Output panel reads `live` at ~project fps.
2. Suspend the app's `msedgewebview2.exe` **renderer** process (Task Manager → Suspend). Lamp must fall to `stalled`/`no_consumer` within ~3 s (`status.rs:7`). *Before this fix it stayed `live` at 100% — that is the whole point of S0-1.*
3. Resume. Lamp returns to `live` without a restart.
4. Cold-launch with no data: Data Sources panel shows the election feed **`offline`**, not `live`.
5. Start the election simulator: status reads **`simulated`**, never `live`; the operator event log shows `source-not-live`.
6. Point the external connector at a JSON endpoint with ≥50 keys; confirm one output push per poll, not one per key (watch `/document/stream`).

---

## R1 — Confirm the new Windows CI job actually runs green · S1-7 · effort: 15 min

The `verify-rust-windows` job is added and its YAML parses, but GitHub Actions cannot be executed from this container.

**Acceptance:** on first push, `verify-rust-windows` completes green. If `cargo check --tests` fails there, that failure *is* the finding S1-7 predicted — Windows-only code that had never been compiled in CI. Fix what it surfaces before moving on.

---

## R2 — Transitions on Take · S1-8 · effort: 1–2 days · highest user-visible value

`take()` has aliased `cut()` since Phase 2 with a comment deferring transitions to Phase 3. It is Phase 10.2. Table stakes in every tier — OBS has this.

**Acceptance (write first):**
- `take()` accepts a transition `{ type: 'cut' | 'dissolve' | 'fade', durationMs }`, defaulting to the operator's configured default.
- A dissolve renders both scenes with correct opacity through the transition in Program, Preview and OBS.
- `cut()` remains a hard instant switch — the existing seam is preserved, not repurposed.
- A take during an in-flight transition resolves deterministically (no stuck blend).
- Transition state rides the envelope, so the sidecar-served renderer shows it identically.
- Zero undo entries — this is `ProgramSlice`, outside history by construction.
- Unit tests for state machine + timing; live OBS check for the visual.

---

## R3 — Output-plane failure is visible, not a silent panic · S2-12 · effort: 0.5 day

After 60 failed binds (30 s) `lib.rs:900` panics inside a spawned task, reproducing the exact silent-dead-sidecar failure its own comment describes. `axum::serve(...).expect(...)` (`:910`) has the same shape.

**Acceptance:** bind exhaustion and serve failure both set an explicit output-offline state the Control Room renders prominently; the app does not panic in a detached task; the message names the port and the likely cause (stale process holding 4977 — a documented recurring Windows situation).

---

## R4 — End-to-end liveness, not just page liveness · extends S0-1 · effort: 1 day

The rAF heartbeat proves the Program page is presenting. It does not prove a consumer received anything.

**Acceptance:** when NDI is streaming, `programState` also reflects real sent-frame counts from `ndi.rs` (`NDIlib_send_get_no_connections` is already read); when only OBS is attached, the current signal stands but is labelled as page-level in the UI. No fabricated composite number — if the two disagree, show both.

---

## R5 — Grow test coverage from seed to net · S1-6 · effort: ongoing

22 tests against 45,371 lines is a seed. Priority order — highest on-air consequence first:

1. **Binding resolution + format/fallback** — decides literal on-air text; S0-2(d) lived here.
2. **`programState` take/cut/arm** — including the `layerPlayback` cleanup in `cut()`.
3. **`timelineEngine`** — playback gating decides whether a layer is visible on air at all.
4. **`playout.ts`** (765 lines) — rundown timing, `next`/`previous`, schedule.
5. **`automation.ts`** — already well covered by `verify-phase10_2.ts`; port to Vitest for watch/coverage.
6. **`persistence.ts`** — document round-trip and schema up-migration; corruption here loses a show's work.

**Acceptance:** every S0/S1 fix stays pinned; `test:coverage` reports ≥60% on `src/document/` and `src/ar-system/`.

---

## R6 — Split the Program bundle from the editor bundle · S2-13 · effort: 0.5 day

2.81 MB (858 kB gzip) single chunk is what OBS loads for `/program` in packaged mode. Cold-start parse happens on the machine about to go to air.

**Acceptance:** `manualChunks` (or a separate renderer entry) keeps the program/renderer bundle to Konva + R3F/three + document model; dockview, editor chrome, recharts, cmdk and unused Radix primitives do not load on `/program`. Target < 1 MB gzip. Verify by loading `/program` and diffing network payload against the control room.

---

## R7 — Resolve the AR positioning gap · `GAP_ANALYSIS.md` · effort: 3 days *or* 1 hour

The product claims AR; broadcast AR means camera-tracked graphics, and there is no tracking ingest anywhere. **Pick one:**

**(a) Make the claim true — FreeD ingest.** UDP listener in `src-tauri/`, parse FreeD D1 packets (pan/tilt/roll/x/y/z/zoom/focus), drive the R3F camera each frame, apply a lens distortion model. FreeD is small and well documented; this is a genuine Tier-3-adjacent differentiator and the highest-leverage feature available to this product.
**Acceptance:** a recorded FreeD stream drives the Program camera frame-accurately; a static object stays locked to its world position as the camera moves.

**(b) Rename.** "3D virtual set graphics" everywhere AR is claimed as a tracked-camera capability. One hour.

Doing neither leaves the product inviting a comparison it cannot win.

---

## R8 — Feed authentication and push transport · `GAP_ANALYSIS.md` · effort: 1–2 days

`fetchExternalApi` is a bare `fetch(url)` — no headers, so most commercial feeds are unreachable; and polling floors latency at ≥2 s on a scorebug.

**Acceptance:** per-source auth headers (API key / bearer), stored via the existing settings repository, never logged; optional inbound WebSocket/SSE transport reusing `mergeSourceValues` so a push payload is still one store write; connector status distinguishes *auth failed* from *unreachable* from *malformed* — and none of them read as live.

---

## R9 — Documentation truth pass · S3-15 · effort: 0.5 day

- Header on `docs/ar-system-audit.md`: superseded by `AUDIT-2026-08.md`, with its two now-wrong claims corrected (dev redirect port; Data Hub / property registry / behaviour engine all exist).
- Real `README.md`: what the product is, architecture, how to run, how to test. It is currently still the Tauri template.
- Update `spout.rs`'s "deferred to Phase 8" note to reflect actual status.
- Delete `render_document_html` / `render_element_html` / `select_scene` (S2-14) — git history retains them, and their comments actively describe a superseded liveness mechanism.

---

## Suggested sequence

| Order | Items | Rationale |
|---|---|---|
| 1 | **R0** | Confirm the S0 fixes on real hardware before anything builds on them |
| 2 | **R1** | 1 hour; stops the largest class of untested regression permanently |
| 3 | **R2** | Most visible functional gap; unblocks a credible demo |
| 4 | **R3**, **R9** | Cheap, reduce operator-facing risk and reader confusion |
| 5 | **R8**, **R6** | Make data ingest genuinely usable; make Program start fast |
| 6 | **R7** | Positioning decision — needs a product call, not just engineering |
| 7 | **R4**, **R5** | Ongoing depth |
