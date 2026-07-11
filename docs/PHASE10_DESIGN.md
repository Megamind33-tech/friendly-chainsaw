# Phase 10 — MOS teleprompter + Automation scripting

Companion to [PLAN.md](../PLAN.md). Two related-but-independent deliverables:

1. **MOS Protocol Stage 1** — accept rundowns from a Newsroom Computer
   System (NRCS): iNews, ENPS, Octopus. Opens BGE to newsroom operators.
2. **Automation scripting engine** — an in-app rules engine (`trigger →
   condition → action`) so an operator can automate "when this scene lands
   on air, take that graphics preset in 5 seconds". Delivered to every
   operator, no external system.

Both ship in one PR because they compose: automation rules can fire on
rundown transitions that come from MOS or from the operator's manual takes.

---

## 10a — MOS Protocol Stage 1

### Scope this pass

Support the **subset of MOS 2.8.5** that a real NRCS actually sends when
transferring a rundown:

| Message         | Direction     | Handled                                             |
|-----------------|--------------|-----------------------------------------------------|
| `heartbeat`     | NCS → BGE    | Ack with matching heartbeat (keeps the socket alive). |
| `mosID`         | NCS → BGE    | Verify their `mosID` matches configured; reply with our `mosID`. |
| `roCreate`      | NCS → BGE    | Parse full rundown, replace `usePlayoutStore` items. |
| `roStorySend`   | NCS → BGE    | Update one story's items (partial rundown update). |
| `roStoryDelete` | NCS → BGE    | Remove one story from the rundown.                  |
| `roStoryInsert` | NCS → BGE    | Insert story at position.                           |
| `roStoryMove`   | NCS → BGE    | Reorder stories.                                    |
| `roDelete`      | NCS → BGE    | Clear the rundown entirely.                         |

Explicitly **not this pass**: `mosObj*` messages (asset/media reference
sync), `roItemSend/Delete/Move` (item-level within a story — story-level
is enough for Phase 10 rundown import), `roReadyToAir`, `roStorySchedule`,
outbound status from BGE to NCS (Phase 10.1). Standard MOS uses two ports
(10540 for lower/command, 10541 for upper/queries) — Phase 10 binds only
one configurable port and treats every incoming message the same, matching
what small-station iNews/Octopus setups actually do.

### Transport

**Raw TCP, XML-per-message**, terminated by a line with a single `\x00`
(the MOS end-of-message byte). Not HTTP, not WebSocket — this is the
protocol NRCS operators run today, and it must be exactly what iNews
transmits on the wire.

Base parser is a hand-rolled XML reader (using the `quick-xml` crate,
already in cargo's index — 60KB, no `xml-rs`-style pull DOM). Small enough
to unit-test end-to-end. Real MOS XML is deep but shallow — the messages we
care about have ≤ 5 nesting levels and ≤ 8 field types, so a dedicated
parser is honest.

### Config surface

Operator sets:
- **Listen port** (default `10540`).
- **Our MOS ID** (a short string identifying this BGE instance, e.g.
  `bge.studio1`). Sent in every response.
- **Expected NCS MOS ID** (optional; if set, we reject connections whose
  `mosID` handshake doesn't match — prevents an accidental cross-connect
  to the wrong newsroom).

Persisted in `mos_settings.json` alongside the other feature-specific
settings files.

### Verification

- Parse a real iNews `roCreate` XML sample end-to-end into `ProgramItem[]`.
- Heartbeat round-trip test (send heartbeat with `messageID`; get one back
  with same `messageID`).
- Malformed XML → parser returns error, connection stays up (don't panic
  the server on one bad message).
- Rate limit: max 100 msg/sec per connection so a broken NCS can't wedge
  the CPU.

### What isn't verified

Real NCS interop. A signed MOS certification is a broadcast-industry
process; Phase 10 delivers the wire protocol correctly parsed against
public XML samples, not a certification claim.

---

## 10b — Automation scripting engine

### The design constraint

A rule engine that can drive live broadcast state has real correctness
stakes: a runaway rule that takes a scene every 100ms locks the operator
out of Program until they can physically kill the process. Every design
choice here bends toward **operator control, not scripting ambition**.

Concretely:
- **Not a Turing-complete language.** No loops, no user-defined
  functions. Rules are `trigger + optional condition + one action`.
- **Fixed trigger vocabulary.** New trigger types require a code change,
  not user input — no arbitrary event subscription.
- **Fixed action vocabulary.** Every action is one of the Phase 7
  control-protocol commands (`take`, `arm`, `playIn`, `playOut`,
  `takeItem`, `nextItem`, `previousItem`, `playSchedule`,
  `pauseSchedule`, `stopSchedule`, `startRecord`, `stopRecord`). No
  new capability introduced; automation is a shortcut, not a
  power-user backdoor.
- **Sandboxed evaluation.** Conditions are `key op value` where key is a
  whitelisted `ControlStateSnapshot` field name, op is `== | != | > | < |
  >= | <=`, value is a literal. No `eval`, no expression parser more
  general than that.
- **Kill switch.** A master enable/disable at the panel level. A rate
  limit: max **10 actions per second across all rules** (not per rule —
  10/sec total). Exceeding it stops firing and surfaces a red banner
  in the panel; the operator must acknowledge before rules resume.
- **Manual takes always win.** An operator hitting Take is dispatched
  ahead of any queued rule action.

### Rule shape

```ts
interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  condition?: AutomationCondition;
  action: AutomationAction;
}

type AutomationTrigger =
  | { kind: "on_take" }                              // whenever cut()/take() fires
  | { kind: "on_item_start" }                        // any rundown item goes to air
  | { kind: "on_item_end" }                          // any rundown item ends
  | { kind: "on_timer", seconds: number };           // fires every N seconds

interface AutomationCondition {
  field: string;    // whitelisted ControlStateSnapshot key
  op: "==" | "!=" | ">" | "<" | ">=" | "<=";
  value: string | number | boolean;
}

interface AutomationAction {
  type: ControlCommandType;                          // reuse Phase 7 vocabulary
  params?: Record<string, unknown>;
}
```

### Where the engine runs

Frontend, inside `controlBridge.ts`. Same window that already subscribes to
every relevant Zustand store, so triggers are cheap to detect (a store
callback fires the trigger check). Rules persist in localStorage under
`automation-rules-v1`; also mirrored to `<app_data_dir>/automation_rules.json`
via a Tauri command so a fresh Control Room in a new session picks them up.

### Kill switch

Two layers:

1. **Master switch** (operator-flippable, persisted): when off, no rule
   ever fires. This is the operator-facing "panic mode" every automation
   system needs.
2. **Rate limiter** (hardcoded in the engine): a rolling 1-second window;
   if `actionCount > 10` in the window, engine enters an error state and
   stops. Operator sees a banner and must click "Resume" to reset the
   counter.

### Verification

- **Rule shape round-trip** through JSON (persistence-drift guard).
- **Condition eval** — every op against every scalar type; `==` on
  strings, numeric comparisons on numbers, boolean equality.
- **Timer trigger** cadence — synthetic clock proves a rule with
  `on_timer 5` fires every 5s and no faster.
- **Rate limit** — 12 actions requested inside 1s, only 10 dispatch;
  engine transitions to error state.
- **Manual-take precedence** — a queued rule action does not preempt an
  operator-invoked take.
- **Unknown action rejected** — a rule whose `action.type` isn't in the
  Phase 7 wire vocabulary is refused at save time, not silently
  no-op'd at fire time.

---

## Files

**New:**
- `src-tauri/src/mos.rs` — TCP server, XML parser, settings persistence,
  Tauri commands.
- `src-tauri/src/automation.rs` — settings file persistence for the rules
  (JS engine mirror).
- `src/document/mos.ts` — invoke wrappers.
- `src/document/automation.ts` — rule store, engine (trigger detection,
  condition eval, rate limit).
- `src/components/panels/AutomationPanel.tsx` — rule editor + kill switch
  + rate meter.
- `scripts/verify-phase10.ts` — MOS parser tests + automation engine tests.

**Modified:**
- `src-tauri/src/lib.rs` — register commands, spawn MOS server on startup
  if configured.
- `src-tauri/Cargo.toml` — add `quick-xml`.
- `src/components/panels/PlayoutPanel.tsx` — MOS strip (like the Rundown
  Studio strip Phase 9 added).
- `src/document/controlBridge.ts` — wire the automation trigger callbacks.
- `.github/workflows/ci.yml` — verify-phase10.
- `PLAN.md`.

## Success criteria (DoD)

- [ ] MOS TCP server binds a configurable port, parses a real `roCreate`
      XML sample, produces `ProgramItem[]`.
- [ ] `roStoryDelete/Insert/Move` update the rundown correctly.
- [ ] MOS heartbeat round-trip.
- [ ] Automation rule can fire on-take → arm(sceneId), on-timer → next.
- [ ] Kill switch stops all rule firing.
- [ ] Rate limit enforces 10 actions/sec.
- [ ] `tsc --noEmit`, `cargo check --tests`, `cargo test --lib` clean.
- [ ] `verify-phase10.ts` passes.

## Explicit deferrals

- MOS outbound: BGE-to-NCS status reporting (`roReq`, `roStorySchedule`).
  Phase 10.1.
- MOS bidirectional asset sync (`mosObj*`). Phase 10.1.
- Scripting: multi-action rules (do 3 things when a trigger fires).
  Add if operators actually ask.
- Scripting: composable conditions (AND/OR chains). Adds complexity for
  little gain over multiple rules; add if asked.
- Scripting: MOS trigger source (`on_mos_message`). Composes naturally
  once both are landed; skipped this pass because I don't yet know which
  MOS event types operators want to key off.
