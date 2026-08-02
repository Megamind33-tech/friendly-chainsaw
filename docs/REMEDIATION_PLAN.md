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
| **S1-8** | Take now runs real transitions — dissolve, dip to clear, 4 softened wipes, stinger; `cut()` unchanged | `sceneTransition.test.ts` + `programState.test.ts` — 43 tests; **live check required**, see R0 |
| **S2-14** | Deleted the dead Rust HTML renderer (`render_document_html` and friends) | `cargo check --tests` clean, no dead-code allows left |
| **R8** | Real data connectors — multi-connector, credentials, SSE/WebSocket push, honest per-connector status | `connectors.test.ts` — 35 tests |
| **S2-12** | Output-plane failure recorded as health state and shown as an OUTPUT DOWN banner; no panic in a detached task | `cargo check --tests`; **live check required**, see R0 |
| **S2-16** | CORS narrowed from `*` to the app's own origins | 5 Rust origin tests incl. substring-bypass cases |
| **S2-13** | Vendor chunks split so app updates do not re-download 2.8 MB; original diagnosis corrected | `bun run build`, measured chunk table in the audit |
| **R5 (part)** | Coverage for binding resolution + formatting, the timeline engine, and rundown timing/export — plus a real `{value:,}` bug it exposed | `format.test.ts`, `bindings.test.ts`, `timelineEngine.test.ts`, `playout.test.ts` — 94 tests |
| **S3-15** | README rewritten; stale audit marked superseded; `spout.rs` deferral note corrected | Reads true against the current tree |
| **R5 (part)** | Load-path integrity — a valid project must never be rejected into an empty default | `persistence.test.ts` — 16 tests |
| **R7** | FreeD camera tracking — protocol decode, UDP listener, `/tracking/stream` SSE, tracked render camera, per-set opt-in | 15 Rust + 15 TS tests; **hardware validation required** |
| **Preview windows** | Program/Preview windows load the lean renderer entry instead of the whole editor; WebGL context budget surfaced | Built HTML verified free of `control-*.js`; 9 context tests |
| **R5 (part)** | Connector transport — failure classification and credential scrubbing under real HTTP conditions | `connectorRuntime.test.ts` — 18 tests |
| **R4** | `/status` reports real NDI sent-frame rate alongside — never merged into — the page-level signal | `cargo check --tests`; **live check required** |
| **R5 (part)** | Connector transport extracted from its React effect and made injectable; SSE/WebSocket reconnect, backoff and teardown now covered | `connectorTransport.test.ts` — 20 tests |

**Baseline after changes:** `tsc --noEmit` clean · `bun run build` passes · 6/6 `verify-phaseN` suites pass · `cargo check --tests` passes · `cargo test --lib` 56/56 · `vitest run` 273/273.

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

## R2 — Transitions on Take · S1-8 · **DONE**

Implemented; see `AUDIT-2026-08.md` S1-8 for the design and the two
non-obvious interactions it had to solve (outgoing-scene playback pruning,
and the two-write envelope push).

Acceptance criteria, as written before implementation:

- [x] `take()` accepts a transition `{ type, durationMs }`, defaulting to the operator's configured default.
- [x] A dissolve renders both scenes at correct opacity through the transition, in Program, the multiviewer PGM tile, and the sidecar-served renderer OBS reads. *(Opacity math is unit-tested; the visual needs R0.)*
- [x] `cut()` remains a hard instant switch — the existing seam is preserved, not repurposed.
- [x] A take during an in-flight transition resolves deterministically (no stuck blend).
- [x] Transition state rides the envelope, so every renderer shows it identically.
- [x] Zero undo entries — it lives in `ProgramSlice`, outside history by construction.
- [x] Unit tests for the state machine and the mix timing.
- [ ] **Live OBS check for the visual — folded into R0.**

### R2b — Wipes and stingers · **DONE**

Followed in the same branch, on the extension points R2 left in place.

- **Four wipes** — `wipeRight/Left/Down/Up`, named for the direction the edge
  *travels*, with the arrow spelled out in the label ("Wipe →"). "Wipe left"
  is ambiguous in every control room: does the picture move left, or is it
  revealed from the left?
- **Softness** — an operator-set feather (0 = hard edge, capped at 50% of the
  axis). Both scenes stay fully opaque during a wipe and complementary CSS
  mask gradients decide which pixels each contributes. `wipeMaskGradient()`
  generates both sides from one function so they cannot drift apart and leave
  a seam or a double-exposed band at the edge.
- **Stinger** — a full-frame video asset played over the change, with the
  scene swap as a **hard cut** at an operator-set `cutAt` point. Fading under
  a stinger would defeat its whole purpose: the clip exists precisely so the
  cut is never seen. Clip time runs on real elapsed time, never the ease
  curve, so the video cannot drift against its own audio or against the frame
  the artist drew the cut for. A window joining mid-transition seeks to the
  right offset rather than restarting the clip.
- **Honest degrades** — a stinger with no clip selected becomes a hard cut
  (and the panel says so, in red, before the operator presses Take); a
  deleted or wrong-kind asset renders no overlay while the scene change
  underneath still lands on time. The worst case is a visible cut, never a
  blank or frozen Program.

**Known limitation, deliberate:** the stinger plays **muted**. Stinger audio
needs the output audio path that does not exist yet (S2-11), and unmuted
autoplay is subject to browser gesture policy in a window the operator never
clicked — so it would be an unreliable promise rather than a feature. Revisit
with S2-11.

19 further tests: edge travel, direction mapping, softness clamping, mask
complementarity, gradient stops staying inside 0–100 and non-decreasing at
both extremes, the hard swap at `cutAt`, ease-independent clip timing, and
the clipless-stinger degrade.

Follow-ups deliberately not taken, in rough value order:

1. **Persist `defaultTransition`.** It currently resets to Dissolve/500ms on relaunch. `sqliteSettingsRepository` (as used by `externalConnector.ts`) is the obvious home.
2. **Auto-transition rate on the control surface.** Companion currently sends `take` with no params, so it uses the operator default; exposing MIX/CUT as separate buttons is a module change only.
3. **Confidence-monitor videofeed sources** (`SetNodes.tsx`, `role: "program"`) still cut rather than mix — they render the program scene directly rather than through `TransitionCompositor`.

---

## R3 — Output-plane failure is visible, not a silent panic · S2-12 · **DONE**

Bind exhaustion and serve failure both record an `OutputServerHealth` state
instead of panicking in a detached task, and the Control Room renders an
OUTPUT DOWN banner that outranks the ON-AIR lamp. Health is read over Tauri
IPC, not HTTP — the point is to answer when the HTTP server cannot.

**Still needs a live check (R0):** hold port 4977 with another process, launch,
and confirm the banner appears with the port named in its tooltip.

---

## R4 — End-to-end liveness, not just page liveness · **DONE** — needs a live check

The rAF heartbeat (S0-1) proves the Program page is presenting. It cannot prove
a consumer received anything.

`/status` now also reports `ndiFramesPerSecond` and `ndiFrameState`, measured
with the same rolling-window code as the `/program` pull rate but counting
**frames actually handed to the NDI SDK**, incremented only on a successful
send — a frame that failed to encode or send never reached the network, and
counting it would report frames nobody received. Both the test-pattern path and
the Windows Program-capture path are counted.

**Deliberately two numbers, not one.** They are reported and displayed
separately rather than blended: `programState` says the page is painting,
`ndiFrameState` says frames left the engine, and *when they disagree that is
the most useful thing the status endpoint can say*. One averaged number would
destroy exactly the signal worth having. The Control Room shows an `NDI n` chip
beside the ON-AIR lamp, red when a sender is active but frames are not flowing.

**Acceptance:**
- [x] Real sent-frame counts, not fabricated.
- [x] Page-level signal labelled as page-level in the type and the tooltip.
- [x] The two signals shown separately, never merged.
- [ ] **Live check:** with NDI streaming, confirm `NDI n` tracks project fps;
      then break the capture path and confirm the chip goes red while the
      ON-AIR lamp stays green — that divergence is the whole point.

**Note:** the Program-capture counter is inside `#[cfg(windows)]` code that
cannot be compiled here. The `windows-latest` CI job (R1) is what proves it
builds.

---

## R5 — Grow test coverage from seed to net · S1-6 · effort: ongoing

65 tests against 45,371 lines is still a seed. Priority order — highest on-air consequence first:

1. ~~**Binding resolution + format/fallback**~~ — done; found and fixed a real `{value:,}` defect.
2. ~~**`programState` take/cut/arm**~~ — done (R2).
3. ~~**`timelineEngine`**~~ — done.
4. ~~**`playout.ts`** rundown timing and import/export~~ — done. The *store* (take/next/schedule ticking) is still uncovered.
5. **`automation.ts`** — already well covered by `verify-phase10_2.ts`; port to Vitest for watch/coverage.
6. ~~**`persistence.ts`** round-trip and schema handling~~ — done. The remaining
   gap there is the SQLite adapter itself, which needs a fake repository.
7. ~~**Connector transports**~~ — done. The lifecycle was extracted out of its React effect into `connectorTransport.ts` with injectable network primitives, which is what made the reconnect sequences reachable at all.

**Acceptance:** every S0/S1 fix stays pinned; `test:coverage` reports ≥60% on `src/document/` and `src/ar-system/`.

---

## R6 — Lazy-load the 3D stack out of the renderer · S2-13 · effort: 0.5 day + a real measurement

**The premise this started from was wrong.** The editor was never in the renderer's payload — `dist/renderer.html` loads `renderer-*.js` and the shared chunk and never references `control-*.js`. See the corrected S2-13 for the measured breakdown.

**Done already:** explicit `manualChunks`, so vendor libraries cache independently of app code. An app update now re-downloads 699 kB instead of 2.8 MB.

**The lever that remains, quantified:** `vendor-three` (952 kB) + `vendor-r3f` (625 kB) = **1.58 MB, 57% of the renderer payload**, needed only by scenes with a `set3d` layer. `DocumentRenderer` imports `Set3dRenderer` statically, so a pure-2D project pays for all of it.

**Why it was not shipped blind:** lazy-loading puts a `Suspense` boundary on the Program render path. A scene taken before that chunk finishes executing shows nothing for a frame or more — a real on-air risk, traded for a gain that cannot be measured without a browser, a GPU, and cold-start timing, none of which exist in the audit container.

**Acceptance:**
1. First measure, on a real machine: time from Browser Source load to first painted frame, for a 2D-only project and a 3D project. If the difference is not material, close this and keep the static import.
2. If it is material: `React.lazy` on `Set3dRenderer`, with an eager `import()` fired at module load so the chunk is fetched and executing in parallel rather than on first demand.
3. A scene containing a `set3d` layer, taken immediately after the Program window opens, must still render its first frame correctly — this is the acceptance criterion that decides the whole change.

---

## R7 — Resolve the AR positioning gap · **DONE (option a)** — needs hardware validation

Option (a) was taken: the claim was made true rather than withdrawn.

`freed.rs` decodes the FreeD D1 datagram, a UDP listener feeds poses onto the
sidecar's `/tracking/stream` (SSE, matching `/document/stream`, because the OBS
Browser Source has no Tauri IPC), and `TrackedCameraRig` locks the render camera
to the tracked pose. Enabled per virtual-set layer so a scene can hold a tracked
AR set and an untracked backplate at once. 15 Rust tests + 15 TS tests.

**Acceptance, as written before implementation:**

- [x] A FreeD stream drives the Program camera.
- [x] Unit-tested decode: round-trip, sign extension across the full angle
      range, mm→m conversion, checksum, and rejection of short/long/mistyped/
      corrupted datagrams.
- [x] Camera-id filtering that does not inflate the error counter.
- [x] Euler order pinned (YXZ) — a pan/tilt head's tilt axis rides on its pan
      axis, and this is the classic place a tracking integration goes subtly
      wrong and the graphic swims.
- [ ] **A static object stays locked to its world position as the camera moves.**
      This needs a real tracker and cannot be closed from a container.

**Blocking follow-ups before this is trusted on air:**

1. **Validate against real hardware.** The decoder is tested against its own
   builder, which proves internal consistency and cannot prove wire conformance.
   Point a real Mo-Sys/Stype/Ncam feed at it and watch the Settings panel: a
   rising *accepted* count means the format matches, a rising *rejected* count
   means it does not. Verify the axis convention visually — a graphic placed on
   the studio floor must stay on the floor through a full pan and tilt.
2. **Lens calibration.** Zoom/focus arrive as raw encoder counts; what ships is
   a linear encoder→FOV map, labelled as such. Real lenses need a calibration
   table or graphics drift in scale through a zoom.
3. **Lens distortion.** Graphics render to an ideal pinhole camera, so they will
   not match a wide lens's barrel distortion at frame edges.

---

## R8 — Feed authentication and push transport · **DONE**

`connectors.ts` replaces the single unauthenticated endpoint with multiple
named connectors carrying bearer / header / query / basic credentials, over
poll, SSE or WebSocket, with per-connector status where only `live` means a
payload actually arrived and parsed. Legacy settings migrate on first load.
35 tests. See the commit for the full rationale.

**Follow-ups not taken:**

1. **Credentials are stored in the local SQLite settings table in plaintext**,
   like every other local setting. There is no OS keychain integration. This is
   normal for a desktop tool and the file is user-scoped, but it should be
   stated in the README rather than left implicit.
2. **A field-mapping UI.** The model supports `fieldMap` per connector; the
   panel currently exposes only the target source, so remapping individual keys
   means editing the stored JSON.
3. **WebSocket send.** The socket is receive-only — enough for feeds that push
   on connect, not for ones that need a subscribe frame first.

---

## R9 — Documentation truth pass · S3-15 · **DONE**

README rewritten from the Tauri template into a real one (architecture, module
map, run/test/OBS instructions, credential-storage caveat, and an up-front
Known Limitations list). `docs/ar-system-audit.md` carries a SUPERSEDED banner
naming both directions it is wrong in. `spout.rs` no longer claims deferral to
a phase that shipped long ago. The dead Rust HTML renderer was deleted under
S2-14.

**Not done:** `PLAN.md` (147 KB) still mixes durable architecture decisions with
session-scoped environment notes. Splitting it is a judgement call about what
the team wants as history versus reference, so it was left rather than
reorganised unilaterally.

---

## What is left

Everything fixable from a Linux container without a real machine has been done.
What remains splits cleanly into three kinds of work.

### Blocked on real hardware — do these first

| | |
|---|---|
| **R0** | Live-verify every S0/S1/S2 fix on Windows with OBS attached. Nothing else should be trusted on air until this passes. |
| **R1** | Confirm the new `windows-latest` CI job runs green. If `cargo check --tests` fails there, that failure *is* the finding S1-7 predicted. |
| **R6** | Measure renderer cold start before deciding whether to lazy-load the 1.58 MB 3D stack. The measurement is the deliverable, not the optimisation. |

### Needs a product decision, not engineering

| | |
|---|---|
| **R7** | Validate the shipped FreeD ingest against a real tracker, then decide whether lens calibration is worth building. The protocol work is done; only hardware can close it. |

### Ordinary remaining engineering

| | |
|---|---|
| **R5** | Coverage: the playout store (take/next/schedule ticking) and porting `automation.ts` onto Vitest. |
| **S1-9 / S2-10** | The NDI PNG-per-frame ceiling, and the Spout stub that is its standard remedy. These are one piece of work, and both need Windows to develop against. |
| **S2-11** | Output audio path. Unblocks stinger audio, which currently plays muted. |
