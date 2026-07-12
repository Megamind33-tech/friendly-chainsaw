# Phase 10.2 — MOS outbound + composable conditions

Companion to [PHASE10_1_DESIGN.md](PHASE10_1_DESIGN.md). Two additions:

1. **MOS outbound**: BGE writes messages back to the NCS. Two message
   types this pass — `roAck` (spec-mandated after every non-heartbeat
   inbound) and `roItemCue` (as-run signal when the operator takes a
   MOS-imported story on air).
2. **Composable conditions**: automation rules gain `all_of` / `any_of`
   groupings so operators can express "when X and Y and Z", not just
   single-clause gates. Deliberately capped at depth-2 nesting — a rule
   with a 4-level tree is a code smell the UI would only encourage.

## 10.2a — MOS outbound

### `roAck` — auto-ack every inbound

The MOS 2.8.5 spec expects an ACK per inbound message (excluding
heartbeats, which have their own dedicated ACK). We've been silent since
Phase 10, which some NCS implementations tolerate and others don't. Every
parseable inbound message with a `roID` now triggers an outbound `roAck`
on the same connection.

Format (from the spec):

```xml
<mos>
  <mosID>bge.local</mosID>
  <ncsID>NCS1</ncsID>
  <messageID>42</messageID>
  <roAck>
    <roID>RO001</roID>
    <roStatus>OK</roStatus>
  </roAck>
</mos>\x00
```

`messageID` mirrors the incoming one — the NCS pairs request → ack by id.
On parse failure we don't send a `roAck` (we don't have a `messageID` to
mirror); an NCS that requires strict ACKs will time out that message and
retry, which is the honest behavior.

### `roItemCue` — as-run outbound on operator take

When the operator takes a rundown item whose `externalId` starts with
`mos:`, BGE emits a `roItemCue` message signaling "this cue is going to
air". Real NRCS integrations (iNews, Octopus) treat this as as-run
feedback; the story turns red in the producer's rundown view.

Format:

```xml
<mos>
  <mosID>bge.local</mosID>
  <ncsID>NCS1</ncsID>
  <messageID>7001</messageID>
  <roItemCue>
    <roID>RO001</roID>
    <storyID>STORY01</storyID>
  </roItemCue>
</mos>\x00
```

**Story vs item semantics disclaimer:** MOS distinguishes `story` and
`item` (a story contains items). Our simplified model has one item per
MOS story. Emitting `roItemCue` at story-take time is a reasonable
approximation for our simplified model; a producer using iNews will see
their story go red at the right time, which is the operator-visible
outcome we're after. A future phase that surfaces MOS `<item>` blocks
individually will need to re-scope this.

### Routing outbound to connections

Each active MOS connection subscribes to a per-server
`tokio::sync::broadcast::channel<Vec<u8>>` at accept time. On take, JS
calls a new Tauri command that:

1. Reads the last `roID` seen from an inbound `mos:message` (kept in a
   Rust-side mutex — the JS side already sees this via `roId` in the
   event payload; passing it back down is cleaner than mirroring state).
2. Builds `roItemCue` XML.
3. Publishes to the broadcast channel.

Every subscribed connection writer forwards the frame. Multiple NCS
connected → all get notified; zero connected → the send is a silent
no-op (broadcast tolerates no receivers).

**MessageID for outbound**: monotonic per-server counter, starts at 7000
(outside the range NCS typically uses). Kept small enough to not overlap
with our inbound heartbeat ACKs.

### `send_mos_item_cue` Tauri command

```
async send_mos_item_cue(ro_id: string, story_id: string) -> Result<bool, string>
```

Returns `true` if at least one connection received the frame, `false`
if no active connections exist. Never fails on absence — that's honest
"nobody listening" behavior, not an error.

## 10.2b — Composable conditions (all_of / any_of)

### Shape

```ts
export type AutomationCondition =
  | AutomationLeafCondition                                              // depth 0
  | { kind: "all_of"; conditions: AutomationLeafCondition[] }            // depth 1
  | { kind: "any_of"; conditions: AutomationLeafCondition[] };           // depth 1
```

Deliberately no nested groups: `all_of` and `any_of` may only contain
leaves. Rationale:

- Any real production automation rule fits in one AND-group or one
  OR-group. Two operators asked, one wanted "when program is X AND
  recording is off", the other "when title contains 'break' OR type is
  break". Both are depth-1 groups.
- Nested trees demand a nested UI. A tree of ANDs and ORs is where
  scripting rules become unreadable — see every "no-code automation"
  tool that ships this and then walks it back.
- If a rule genuinely needs depth 2, it can be split into two rules
  sharing a trigger. The rate limiter enforces per-action accounting, so
  splitting doesn't cost extra dispatches.

### Empty-group semantics

- `all_of: []` → **true** (vacuous truth, matches every widely-used rules
  engine — Rego, Kubernetes label selectors, etc.).
- `any_of: []` → **false** (no clauses can match).

Documented in the eval function so the UI can gate "Save" appropriately
if the operator constructs an empty group.

### Validation extension

`validateRule` recurses into groups:

- Group's `conditions` must be an array of leaves — no nested groups
  (compile-time-enforced in TypeScript; runtime-checked in the
  validator).
- Empty groups are permitted (they evaluate honestly per above) — banning
  them would prevent the operator from creating a group before adding
  clauses to it.
- Every leaf inside a group is validated the same way single-leaf
  conditions are (whitelisted field name, whitelisted operator).

### Migration

The condition shape is fully additive — every v1 condition is a valid
leaf under the new type. `migrateRule` needs no change; existing rules
load unchanged.

## Files

**New:**
- `docs/PHASE10_2_DESIGN.md`
- `scripts/verify-phase10_2.ts` — MOS builder round-trips (parse of
  built XML yields expected structure), condition eval for `all_of` /
  `any_of` (all-true, all-false, mixed, empty-group), validation
  rejects nested groups, take-of-MOS-item hooks fire.

**Modified:**
- `src-tauri/src/mos.rs` — `build_ro_ack`, `build_ro_item_cue`,
  per-server broadcast channel, subscribe-on-accept writer path,
  `send_mos_item_cue` command, `next_out_message_id()` counter.
- `src-tauri/src/lib.rs` — register the new command.
- `src/document/automation.ts` — union AutomationCondition variants,
  eval with short-circuit, validate recursion.
- `src/document/controlBridge.ts` — track last seen roId per MOS
  message; fire `send_mos_item_cue` on takes of items with
  `externalId` starting `mos:`.
- `src/components/panels/AutomationPanel.tsx` — condition tree editor.
- `PLAN.md`.

## Success criteria (DoD)

- [ ] Every parseable inbound MOS message with an `roID` triggers an
      outbound `roAck` on the same connection.
- [ ] Operator take of a MOS-imported rundown item fires a `roItemCue`
      to all active MOS connections.
- [ ] Automation rules can express `all_of` and `any_of` groups; eval
      is short-circuited (an `any_of` first-true stops; `all_of`
      first-false stops).
- [ ] Existing v2 (single-leaf) rules keep working with no migration.
- [ ] `bunx tsc --noEmit` clean, `cargo test --lib` still passes plus
      new MOS-builder tests.
- [ ] `verify-phase10_2.ts` passes.

## Explicit deferrals (10.3 or later)

- Bi-directional handshake beyond `mosID` — `mosReqAll` reply,
  `mosListSearchableSchema`.
- `mosObj*` — MOS Object messages (asset metadata sync).
- `roStorySchedule` outbound (as-run schedule reporting distinct from
  `roItemCue`).
- MOS "upper port" (a second listener on the paired command port).
- Deeper condition trees — banned by design this pass; may reconsider
  if operator experience actually needs it.
