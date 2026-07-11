# MODEL STRATEGY — Which Claude Model Handles What

Companion to [PLAN.md](PLAN.md). This project has a wide spread of task difficulty — some work is genuinely hard to get right (schema design, real-time state machines, protocol/concurrency correctness, 3D/camera math) and some is mechanical repetition once a pattern is set (generating the 7th sport schema after the 1st, boilerplate panels, docs). Using one model for all of it either wastes the strongest model's time on rote work or under-powers the hard parts.

This is deliberately honest about what can be grounded confidently — no invented model capabilities.

## The models

- **Opus 4.8** (`claude-opus-4-8`) — most capable. Reserved for foundational architecture, correctness-critical or high-blast-radius design, and final review passes before a phase is marked done.
- **Sonnet 5** (`claude-sonnet-5`) — the generalist workhorse. The bulk of hands-on implementation once architecture is fixed: most UI/component/integration work. This is what handled Phase 0 entirely.
- **Haiku 4.5** (`claude-haiku-4-5-20251001`) — fastest/cheapest. Reserved for high-volume, low-ambiguity repetition once a template exists — mainly Phase 4's sport-schema proliferation, later docs/boilerplate passes.
- **Fable 5** (`claude-fable-5`) — no established role in this pipeline yet. Not enough grounded signal to place it confidently against this specific workload. Treat as experimental if you want to try it for a specific slice, not a default assignment.

## Per-phase assignment

| Phase | Opus (design/review) | Sonnet (bulk build) | Haiku (bulk repetition) |
|---|---|---|---|
| 0 — Foundations | — (done; Sonnet handled the judgment calls fine) | ✅ scaffolding, network-issue troubleshooting | — |
| 1 — Document + GFX | ✅ document-model/undo-redo/persistence architecture + final review before DoD sign-off | ✅ Konva components, panels, wiring | — |
| 2 — Output plane | ✅ ON-AIR state machine + NDI bridge protocol (frame-accuracy stakes) | ✅ UI wiring, PGM/PVW controls | — |
| 3 — Data + bindings | Opus consult only if fallback/error semantics get subtle | ✅ binding engine, GSAP integration (pattern-following once Phase 1's `Binding` shape exists) | — |
| 4 — Sports package | ✅ designs the **first** sport schema (soccer) as the canonical template + a consistency review pass across all outputs | reviews/integrates Haiku output | ✅ remaining 7+ sport schemas + scorebug variants generated from the template, in parallel |
| 5 — Virtual Set | ✅ shader/lighting/camera math | ✅ porting existing R3F geometry (mechanical, already scoped) | — |
| 6 — AR + Maps + Charts | ✅ FreeD parsing + camera-matching math (wrong = graphics don't track) | ✅ MapLibre/visx integration once patterns set | — |
| 7 — Control + automation | ✅ control-server protocol/concurrency core | ✅ Companion module glue, rundown UI | — |
| 8 — Hardening | ✅ performance bottleneck analysis | ✅ packaging/installer steps | possible: docs polish |

## How this is applied

Two mechanisms, no new tooling needed:

1. **Main conversation thread.** Switch models via `/model claude-opus-4-8` / `/model claude-sonnet-5` — Opus when personally driving a design-heavy stretch (a phase's architecture pass), Sonnet for the bulk build.
2. **Delegated subagent work.** When the agent spawns Agent/Plan/Explore tool calls for a sub-task, it sets the `model` parameter directly per the table above — e.g. Phase 1's document-model design was delegated to an Opus-model Plan agent without any `/model` switch. This should be flagged in-conversation whenever it happens, never a silent decision.

## Revisiting this document

Update the table if a phase's actual difficulty diverges from what's predicted here (e.g., Phase 3's binding engine turns out to need Opus-level judgment on error semantics — bump it), or once there's real evidence for where Fable fits.
