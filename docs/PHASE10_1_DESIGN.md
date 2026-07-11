# Phase 10.1 — MOS Stage 2 + automation composability

Companion to [PHASE10_DESIGN.md](PHASE10_DESIGN.md). Phase 10 shipped the
MOS 2.8.5 XML parser + config surface + heartbeat-ACK builder, and a fixed
`{trigger, condition?, action}` automation engine. Phase 10.1 closes both
loops:

1. **Spawn the MOS TCP listener** so a real NRCS can actually push a
   rundown into BGE.
2. **Give operators multi-action rules and a `on_mos_message` trigger** so
   the composability the two Phase 10 features imply is real.

## MOS Stage 2 — TCP listener

### Spawn model

The listener spawns exactly once at Tauri `.setup()` time, driven by the
persisted `mos_settings.json`:

- `enabled: true` → bind the configured port and accept connections.
- `enabled: false` → don't bind at all (silent — no port occupation).

Config changes made after startup **don't** hot-reconfigure the listener.
Instead, the operator saves settings and clicks a new **"Restart server"**
button in the MOS config dialog. That button calls a `restart_mos_server`
Tauri command which:

- Closes the existing listener (drops its task JoinHandle → tokio's
  cancellation-on-drop tears down the accept loop).
- Reads settings fresh.
- Spawns a new listener with the new config.

This is deliberate. A live-config swap that a small-station NRCS operator
didn't understand could rebind a port mid-broadcast; a hard "you asked
for this restart" button matches how vMix and OBS handle server-port
settings.

### Wire loop

Per connection:

```
loop:
  read null-terminated frame          (max frame 128 KB)
  parse via parse_mos_message
  match message:
    Heartbeat → write build_heartbeat_ack() to socket
    MosId (handshake) → optionally reject if expected_ncs_id set
                        and doesn't match; else write our ACK
    everything else → emit "mos:message" Tauri event
                      with { role, payload } to Control Room
  on parse error → log, continue (single bad frame doesn't kill the socket)
  on read error / EOF → drop the connection
```

Rate cap: max **100 messages/sec per connection** using the same
rolling-window primitive the automation engine uses. A broken NRCS that
floods can't wedge the CPU.

Max simultaneous connections: 4. Any more and we return TCP RST — a MOS
listener isn't a public service.

### JS-side apply

`controlBridge.ts` gains a `listen("mos:message", ...)` subscription that
translates message payloads into `usePlayoutStore` mutations:

- `roCreate` → `replaceRundown(stories.map(storyToItem))`.
- `roStorySend` → find the item with the same MOS `storyId`, update in
  place.
- `roStoryDelete` → remove items whose id matches.
- `roStoryInsert` → new items land at `target_id`'s position (or end).
- `roStoryMove` → reorder existing items to match the incoming id order.

Story ID correlation: MOS story ids live in a new
`ProgramItem.externalId?: string` field. Discriminated per-source so
Rundown Studio imports and MOS imports don't collide (`ext = "mos:STORY01"`).
Added to `types.ts`; unaffected by rundown export/import (the field is
just persisted as-is).

## Automation composability

### Multi-action rules

Breaking change: `AutomationRule.action` → `AutomationRule.actions:
AutomationAction[]`. Motivation: an operator wants "on rundown item start,
arm scene AND start recording AND play the lower-third layer's IN". Three
separate rules for one logical event is a maintenance smell.

Backward compat: on `loadPersisted()`, if a rule has the legacy `action`
key, promote to `actions: [action]`. localStorage key stays
`automation-rules-v1` — the shape migrates in-memory only; the next save
persists the new shape.

Rate limit accounting: **per action**, not per rule. A single fire of a
3-action rule counts 3 against the 10/sec cap. This is the honest choice:
a 5-action rule firing at 3/sec is 15 actions/sec, which is exactly the
thing the rate limit exists to catch.

### `on_mos_message` trigger

New trigger kind:

```ts
{ kind: "on_mos_message", roleFilter?: string }
```

Fires when the JS side receives a `mos:message` event. If `roleFilter` is
set (e.g. `"roCreate"`), only fires for that role. Empty/absent →
matches any MOS message.

Condition eval extension: the `snapshot` for `on_mos_message` includes
two extra synthetic fields — `mosRole` (string) and `mosRoId` (string) —
so a rule can gate on which rundown just changed:

```
trigger: on_mos_message with roleFilter="roCreate"
condition: mosRoId == "RO001"
actions: [ take, startRecord ]
```

Whitelist for condition fields extended by these two names. Whitelist
enforcement (validateRule) still applies — non-whitelist field names
still refused at save time.

## Files

**New:**
- `docs/PHASE10_1_DESIGN.md`
- `scripts/verify-phase10_1.ts` — rundown mutation ops, rule v1→v2
  migration, multi-action rate accounting, on_mos_message dispatch +
  roleFilter.

**Modified:**
- `src-tauri/src/mos.rs` — add `spawn_mos_server`, `restart_mos_server`
  command, connection loop with rate cap.
- `src-tauri/src/lib.rs` — startup spawn, register `restart_mos_server`.
- `src/document/automation.ts` — actions array, on_mos_message trigger,
  extend condition-field whitelist with mosRole/mosRoId, v1→v2 migration.
- `src/document/controlBridge.ts` — listen("mos:message", …), apply
  rundown mutations, dispatch on_mos_message rules.
- `src/document/types.ts` — `ProgramItem.externalId?: string`.
- `src/document/playout.ts` — reducer helpers for MOS mutation ops
  (insertItems, moveItems, deleteItems by id).
- `src/components/panels/AutomationPanel.tsx` — multi-action editor
  (list of actions with add/remove).
- `src/components/panels/PlayoutPanel.tsx` — Restart-server button in
  MOS dialog.
- `PLAN.md`.

## Success criteria (DoD)

- [ ] MOS TCP server spawns on startup when settings.enabled = true.
- [ ] A synthetic MOS client can push `roCreate` and see items in
      `usePlayoutStore`.
- [ ] Heartbeats round-trip.
- [ ] Automation rule with multi-action fires all actions, gated by the
      shared rate limiter.
- [ ] `on_mos_message` trigger fires on any MOS message; `roleFilter`
      restricts to that role.
- [ ] v1 persisted rules load correctly as v2 shape.
- [ ] Full verify chain green.

## Explicit deferrals

- **MOS outbound**: BGE-to-NCS `roReq`/`roStorySchedule`. Phase 10.2.
- **`mosObj*` asset sync**: still separate scope.
- **Composable conditions (AND/OR)**: still separate — multi-action
  gives operators the most-common ask, complex conditions can wait.
