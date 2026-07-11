# Phase 8 — Hardening

Companion to [PLAN.md](../PLAN.md). Phase 8 turns "it works on my machine" into
"it works when someone else installs it", and lays the guard rails that keep
Phases 0-7 from regressing.

## Scope this pass — the honest cut

The Phase 7 handoff called Phase 8 "1080p60 zero-drop performance, packaging,
signed Windows installer." Three deliverables inside that scope are
implementable and end-to-end verifiable *from this Linux environment*:

1. **Automated CI** — GitHub Actions workflow running the full verification
   suite on every PR. Catches TypeScript regressions, Rust compile errors,
   test failures, and design-doc drift before merge.
2. **Tauri bundle configuration** — every platform target (Windows NSIS,
   macOS DMG, Linux AppImage + `.deb`), publisher metadata, upgrade code
   for Windows in-place upgrades, cert-path plumbing driven by env vars so
   a real signing certificate can be attached at build time without ever
   checking secrets into the repo.
3. **Verification harness expansion** — `scripts/verify-phase8.ts` +
   Rust unit tests covering surfaces Phase 7 shipped but only sanity-tested:
   control-protocol wire contract, playout ticker HOLD semantics for live
   items, projected schedule math, sport-schema binding integrity across
   all 8 sports.

Three deliverables in the handoff brief's scope are **explicitly deferred**
because they need a Windows machine (or a real broadcast rig) to build
honestly:

- **Real Spout / Syphon** — the Phase 7 stub stays. The dynamic-load pattern
  is proven (NDI Stage 1); repeating it for Spout without a Windows machine
  to bind against `SpoutLibrary.dll` risks inventing FFI signatures that
  crash on first call. Deferred to a Windows session; the trait / factory
  pattern is already in place so only `spout.rs` changes.
- **Signed installers** — the config is here, but signing needs an actual
  code-signing certificate the user holds. `tauri build --bundles nsis` will
  produce an unsigned installer today; adding `-c signCommand=...` at
  invocation time is one flag away once the cert exists.
- **Live 1080p60 profiling** — the frame-decode hot path (Cargo.toml's
  `[profile.dev.package.image]` optimize-in-dev shim) was tuned in Phase 2
  live on Windows; further tuning needs the same live environment. What
  Phase 8 *can* do here is add a CI-side benchmark harness against the
  Rust unit tests to detect regressions.

## Deliverable 1 — CI workflow

`.github/workflows/ci.yml`. Runs on every push to a branch with an open PR
against `main`.

Jobs:

```yaml
verify-frontend:
  runs-on: ubuntu-latest
  steps:
    - checkout
    - setup bun
    - bun install
    - bunx tsc --noEmit
    - bun run build
    - bun run scripts/verify-phase7.ts
    - bun run scripts/verify-phase8.ts

verify-rust:
  runs-on: ubuntu-latest
  steps:
    - checkout
    - install libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libsoup-3.0-dev
    - setup rust toolchain (stable)
    - cargo check --tests --manifest-path src-tauri/Cargo.toml
    - cargo test  --lib   --manifest-path src-tauri/Cargo.toml
```

Two jobs, run in parallel — the Rust job takes ~2 minutes on cold cache;
splitting keeps a TS-only regression from waiting on it.

Deliberate omissions:
- No Windows/macOS build in CI. Cross-platform bundle verification is a
  separate concern; a broken bundle config would fail
  `tauri build` locally before ever being pushed.
- No lint step. This project doesn't have an ESLint config, and adding one
  as a hardening pass would be a project-shape decision, not hardening.
- No coverage. Coverage numbers on a project this shape (a lot of pure
  data transforms, a lot of Konva rendering that unit tests can't
  meaningfully cover) invite gaming.

## Deliverable 2 — Tauri bundle configuration

Extend `src-tauri/tauri.conf.json`'s `bundle` block with:

- `publisher` — `"Broadcast Graphics Engine"`.
- `shortDescription`, `longDescription`, `homepage` for the installer's
  metadata + the OS's "Programs and Features"/"Applications" listing.
- `category` — `"Video"`.
- `copyright`.
- `windows`:
  - `wix.upgradeCode` — a fixed UUID so future installers replace the
    current one rather than side-installing.
  - `nsis.installMode` — `"perMachine"` (broadcast rigs are shared).
  - `certificateThumbprint` env-driven at build time.
  - `digestAlgorithm` and `timestampUrl` populated by convention.
- `macOS`:
  - `frameworks: []` (no bundled frameworks — WebView2 is delivered by
    the system, this project has no macOS-specific runtime dependencies
    that need bundling).
  - `minimumSystemVersion` — `"11.0"` (Big Sur — the oldest macOS with
    Metal-first WebView).
  - `signingIdentity` env-driven.
- `linux`:
  - `deb.depends`: pin the `libgtk-3-0t64` / `libwebkit2gtk-4.1-0` /
    `libayatana-appindicator3-1` package names known to actually satisfy
    Tauri on Ubuntu 24.04 (the env we validated `cargo check` against).
  - AppImage doesn't need dependency pinning — it bundles.

## Deliverable 3 — Verification harness expansion

New file: `scripts/verify-phase8.ts`. New tests:

1. **Control protocol JSON round-trip.** A `ControlCommand` and a
   `ControlStateSnapshot` serialize + parse without field loss. Catches
   the schema-drift regression pattern this project's prior audits have
   flagged.
2. **Playout HOLD semantics for `type: "live"`.** Verifies that
   `endStatusFor` returns `"completed"` for a live item taken at any
   progress (even `progress < duration`) — the operator-visible property
   that a live-broadcast take is never a "cut". Direct test against
   the exported `usePlayoutStore` and `PROGRAM_TYPE_LABEL`.
3. **`projectedStartSecs` math.** Given an anchor and durations, projected
   time-of-day is correct with wraparound past 86400s.
4. **Sport-schema binding integrity.** For every one of the 8 sports, its
   scorebug builder produces exactly the number of bound text elements
   `CONVENTIONS.md` requires (mandatory floor: title, teams, scores,
   clock, period).
5. **Rundown CSV/JSON round-trip idempotence.** Import → export → import
   again produces the same items (already covered by verify-phase7 for the
   parser; extend with a 3-hop test).

Also add Rust unit tests in `src-tauri/src/control_server.rs`:

- Known-command list matches the `ControlCommandType` union verbatim.
- Unknown-command payload → HTTP 400 (via a mocked axum handler).

## Non-goals this pass

- **Feature work.** Phase 8 is not the time to add e.g. a rundown.cloud
  connector or teleprompter integration. Those are Phase 9+ (or a
  follow-up).
- **Performance changes based on speculation.** Every Phase 2 optimization
  was justified by a live measurement (`ndi test pattern: send_frame
  failed` counts, `netstat` port bindings). Without a live env to measure
  in, further "optimization" is guesswork.

## Success criteria (DoD)

- [ ] `.github/workflows/ci.yml` runs on push, exits green
- [ ] Extended bundle config lands in `tauri.conf.json`, `bun run build`
  still passes
- [ ] `bun run scripts/verify-phase8.ts` passes
- [ ] All previous verify scripts still pass
- [ ] `cargo test --lib` still passes
- [ ] PR merges cleanly

Live verification remaining for a Windows session:
- `tauri build --bundles nsis` produces a real installer
- Signing with a real cert produces a real signed installer
- Real Spout `SpoutLibrary.dll` dynamic-load succeeds
