# Phase 9 — Rundown Studio connector

Companion to [PLAN.md](../PLAN.md). Phase 9 delivers the first external
rundown-system integration: **Rundown Studio** (`rundownstudio.app`) — the
real product the Phase 7 handoff brief called out as "rundown.cloud".
Rundown Studio has a documented public REST API and already ships a Bitfocus
Companion module, so its user base overlaps directly with ours.

## Product decision — Rundown Studio, not "rundown.cloud"

The handoff brief said "rundown.cloud". A quick search: **there is no product
by that name.** The real thing the brief meant is Rundown Studio at
`rundownstudio.app`, which has:

- Documented OpenAPI 3.0 spec at `/api-v0/docs/spec.json` (40KB, ~35 endpoints).
- Bearer-token auth (`Authorization: Bearer <token>`) OR `?token=...` query
  fallback.
- Rate limiting (60 req/min per team, standard `RateLimit-*` response headers).
- A WebSocket push channel for live state.
- A Bitfocus Companion module already published — we're integrating against
  the exact same operator base whose Companion setup Phase 7 already targets.

Renamed everywhere in this codebase from "rundown.cloud" to
"Rundown Studio" — a fake product name in a design doc is worse than the
extra rename cost.

## Scope this pass

**In:**
1. **Config surface** — operator pastes an API token + a rundown ID into a
   settings UI. Persisted in `rundowncloud_settings.json`, alongside the
   existing `ai_settings.json` (Phase 6.4 AI image gen precedent). Token
   never leaves Rust in plaintext; status endpoint returns `configured: bool`
   only.
2. **Ping / status** — validate the token by hitting `GET /ping` with the
   bearer set, before the first real import. A wrong token here means the
   operator saw an obvious error at configuration time, not later when
   they hit Import at 5 minutes to airtime.
3. **Rundown metadata** — `GET /rundown/{id}` (Rundown Studio's `Rundown`
   schema): id, name, startTime, endTime, status. Displayed in the panel
   so the operator confirms they're importing the *right* rundown, not
   yesterday's leftover.
4. **Cue import** — `GET /rundown/{id}/cues` returns `{cues: Cue[]}`. Each
   Cue: `{id, type, title, subtitle, duration (ms), backgroundColor,
   createdAt, updatedAt}`. Map to `ProgramItem[]`, run through the existing
   `replaceRundown` Zustand action (Phase 7 cleanly stops ghost `currentId`
   if it changes).

**Explicitly out of scope this pass (deferred to Phase 9.1 or later):**
- **Live socket.io state sync.** Rundown Studio pushes live cue/timing
  updates over Socket.io. Consuming those would let operators see current
  cue changes reflected in our AS-RUN log without polling. Real value, but
  wants its own design pass: what happens when both systems think they're
  "in control"? Do we mirror-only, or two-way sync? Defer until we have a
  live-user answer.
- **Two-way control** — sending start/pause/next commands from our Playout
  panel back to Rundown Studio. Same "who's in control" question; defer.
- **Text variables / mentions / columns.** Rundown Studio's rich cue
  metadata (per-column cell data, `{mentions}` substitutions) is genuinely
  useful for lower-thirds, but bridging it into our binding engine is a
  separate integration path.

## Wire protocol notes (from the OpenAPI spec)

- Base URL: `https://app.rundownstudio.app/api-v0`
- Auth: `Authorization: Bearer <token>` (preferred) or `?token=<token>`.
  We use Bearer — the token then never appears in URLs, request logs, or
  the Rust process's own `strings` output.
- Rundown ID format: `^[a-zA-Z0-9]{20}$` — regex-validated client-side
  before sending, so a mistyped ID gets a helpful "not a valid rundown id"
  message instead of a server 400.
- Rate limit: 60/min per team. A single operator hitting Import a few times
  is nowhere near this budget; we surface the `RateLimit-Remaining` header
  in the status response so a script hammering the connector sees it
  coming.
- `Cue.duration` is **milliseconds**; our `ProgramItem.duration` is
  **seconds** (integer). Conversion: `Math.max(1, Math.round(cue.duration / 1000))`
  — the `max(1)` clamp because Rundown Studio permits 0ms cues (their UI
  labels them as "sticky" style) but our playout ticker will divide-by-zero
  if a duration lands at 0. Documented in the mapping code.
- Cue types are freeform strings server-side (not an enum). We accept
  `"cue"` (Rundown Studio's default) → `"program"` (our default), and
  otherwise: if the cue title contains "live" (case-insensitive), map to
  `"live"` (HOLD semantics for the on-air lamp); else `"program"`.
  Conservative; operators can edit types after import.

## Mapping table

| Rundown Studio Cue field | Our ProgramItem field | Note |
|---|---|---|
| `id` (string, RS-generated) | *(discarded, new po-id generated)* | Ids are per-store; not persisted round-trip. |
| `title` | `title` | Verbatim; trimmed. |
| `duration` (ms) | `duration` (s) | `Math.max(1, Math.round(ms / 1000))`. |
| `type` (string) | `type` | See mapping above. |
| — | `sceneId` | Always `null` — no scene correlation is knowable. Operator assigns after import. |
| `subtitle`, `backgroundColor` | *(discarded)* | Not surfaced in our PlayoutPanel row shape. Could feed a bindings pass in a later phase. |

## Files

**New:**
- `src-tauri/src/rundowncloud.rs` — reqwest client, token file persistence,
  Tauri commands: `get_rundowncloud_status`, `set_rundowncloud_config`,
  `clear_rundowncloud_config`, `ping_rundowncloud`,
  `fetch_rundowncloud_rundown`, `fetch_rundowncloud_cues`.
- `src/document/rundowncloud.ts` — invoke wrappers + the `mapCueToItem`
  pure function (unit-tested).
- `scripts/verify-phase9.ts` — mapping tests, milliseconds→seconds,
  clamp-at-1, type inference from title, verbatim title round-trip.

**Modified:**
- `src-tauri/src/lib.rs` — register the 6 new Tauri commands.
- `src/components/panels/PlayoutPanel.tsx` — add a "Rundown Studio"
  section with Configure button, rundown-info display, and Import button
  (uses the existing `replaceRundown` action, so ghost-currentId
  invariants from Phase 7 still hold).

## Success criteria (DoD)

- [ ] Operator can paste an API token + rundown ID in a settings dialog;
      status endpoint reports `configured: true` afterward.
- [ ] `ping_rundowncloud` validates the token before any import.
- [ ] `fetch_rundowncloud_rundown` returns the rundown metadata and
      renders in the panel.
- [ ] `fetch_rundowncloud_cues` returns the cues and Import replaces the
      current rundown items.
- [ ] `bunx tsc --noEmit` clean, `cargo check --tests` clean,
      `cargo test --lib` still 17/17 (plus any new tests).
- [ ] `bun run scripts/verify-phase9.ts` passes.

Live verification (real token + real rundown → cues appearing in
PlayoutPanel) is an operator pass — no way to script this without a valid
Rundown Studio subscription.
