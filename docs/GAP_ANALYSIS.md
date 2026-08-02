# Competitive Gap Analysis — broadcast-graphics-engine

**Date:** 2026-08-01 · **Companion to:** `AUDIT-2026-08.md`

## What this product actually is

A **Tauri desktop app rendering broadcast graphics in a web engine** (React 19 + Konva for 2D, R3F/three for 3D/AR), delivering to air as an **OBS Browser Source** over a local axum sidecar, plus a **Windows NDI path** via WebView2 frame capture. Plus a control room, rundown/playout, MOS connector, automation rules, Companion module and an AR asset builder.

That architecture matters more than the feature list, because it decides which comparisons are fair. This is **not** a GPU compositing engine in the Viz Engine / Zero Density sense, and it is not trying to be. Its closest architectural peers are the browser-rendered graphics platforms — **Singular.live** and **Flowics** — which reach air the same way and accept the same ceilings for the same reasons: fast authoring, no proprietary hardware, cheap distribution.

Read the tables below with that in mind. A gap against Viz Engine's render core is a statement about a different product category. A gap against Singular.live is a statement about this one.

Legend: ✅ real · 🟡 partial · 🔴 absent · ⬛ not applicable to this architecture
Priority: **T** table-stakes for the class · **C** competitive differentiator · **N** nice-to-have

---

## Tier 1 — Browser/cloud graphics (the direct peers)

*Singular.live, Flowics, Chyron LIVE*

| Capability | This product | Peers | Gap | Pri |
|---|---|---|---|---|
| Browser-rendered output to air | ✅ OBS Browser Source via sidecar | ✅ | — | T |
| Node/scene-graph document model | ✅ `document/types.ts`, serializable, versioned | ✅ | — | T |
| Data-driven bindings | ✅ flat `source.key`, format + fallback | ✅ | — | T |
| Live REST/JSON ingest | ✅ `externalConnector.ts` polling | ✅ | — | T |
| CSV / spreadsheet ingest | ✅ (parser bug fixed, S1-5) | ✅ | — | T |
| **Push feeds (WebSocket/SSE inbound)** | 🔴 poll-only, ≥2 s | ✅ | **Latency floor: 2 s worst case on a scorebug** | **T** |
| **Data field mapping / transforms in UI** | 🟡 `BindingTransform` typed, no mapping UI | ✅ | Operator must match key names by hand | **C** |
| **Feed auth (API key / OAuth headers)** | 🔴 bare `fetch(url)`, no headers | ✅ | Cannot consume most commercial feeds | **T** |
| Template authoring UI | ✅ Konva editor + AR builder | ✅ | — | T |
| **Multi-user / cloud templates** | 🔴 single local SQLite | ✅ | Desktop-only by design | N |
| Alpha/transparent output | ✅ verified Phase 0 | ✅ | — | T |
| Timeline / keyframe animation | ✅ `timelineEngine.ts` + GSAP easing | ✅ | — | T |
| Rundown/playout control | ✅ `playout.ts` + MOS + Rundown Studio | 🟡 | **Ahead of peers here** | C |

**Read:** against its true peers this product is competitive to ahead — the MOS and rundown work in particular exceeds what Singular.live ships natively. Three gaps are load-bearing, and they cluster in the same place: **getting real data in.** No feed authentication, no push transport, no mapping UI. The rendering side is strong; the ingest side is the weak link, and it is also where S0-2's honesty failures lived.

---

## Tier 2 — Prosumer / open production

*CasparCG, vMix, OBS, NewTek TriCaster*

| Capability | This product | Tier | Gap | Pri |
|---|---|---|---|---|
| NDI output | 🟡 video-only, PNG round-trip (S1-9, S2-11) | ✅ full | **Frame-rate ceiling; no audio** | **T** |
| Spout / Syphon GPU share | 🔴 honest stub (S2-10) | ✅ | Standard local-compositor path missing | **T** |
| SDI fill+key out | ⬛ needs DeckLink/Bluefish | ✅ | Category boundary, not a defect | — |
| **Transitions on Take** | ✅ dissolve, dip to clear, 4 softened wipes, stinger (S1-8) | ✅ even in OBS | Stinger audio deferred with S2-11 | **T** |
| Recording | ✅ FFmpeg (`record.rs`) | ✅ | — | T |
| Control surface integration | ✅ Companion module + control server | 🟡 | **Ahead** | C |
| Multi-channel playout | 🔴 single Program | ✅ | One output only | C |
| Audio handling | 🔴 none in output path | ✅ | Graphics-only | N |

---

## Tier 3 — Broadcast render engines

*Vizrt Viz Engine/Artist/Trio, Ross XPression, Chyron PRIME, Brainstorm InfinitySet, Zero Density Reality, Pixotope, Aximmetry*

Different category. Listed to be explicit about the boundary rather than to imply these are bugs.

| Capability | This product | Tier 3 | Assessment |
|---|---|---|---|
| GPU-native compositing | ⬛ web engine | ✅ | Architectural choice, not a defect |
| Genlock / house sync | 🔴 | ✅ | **Cannot slot into a genlocked plant** — hard ceiling |
| LTC / VITC timecode | 🔴 | ✅ | Blocks frame-accurate playout |
| SMPTE 2110 / SDI | ⬛ | ✅ | Category boundary |
| Camera tracking (FreeD/Mo-Sys/Stype) | 🟡 FreeD D1 ingest ships; unproven vs hardware | ✅ | See below |
| Lens distortion / calibration | 🔴 | ✅ | Blocks real AR |
| Chroma keyer | ⬛ delegated to OBS/vMix | ✅ | Reasonable delegation |
| Virtual set / 3D scenes | ✅ R3F + `sets/` | ✅ | Real, at web-engine fidelity |
| AR graphics over live camera | 🟡 tracked camera ships; no lens calibration | ✅ | See below |
| Redundancy / engine failover | 🔴 | ✅ | Single point of failure |
| Multi-engine sync | 🔴 | ✅ | Single engine |

### The AR gap — mostly closed

**Previously:** *"The product describes itself as an AR engine … But 'AR' in broadcast means graphics locked to a physical camera's real-world position … None of that exists here."*

**FreeD camera tracking now ships.** `src-tauri/src/freed.rs` decodes the FreeD D1 datagram (the de-facto broadcast tracking format — Vinten's original, and what Mo-Sys StarTracker, Stype and Ncam emit), a UDP listener feeds poses onto the sidecar's `/tracking/stream`, and `TrackedCameraRig` locks the render camera to the tracked pose. Enabled per virtual-set layer, so a scene can hold a tracked AR set over a live camera *and* an untracked backplate — which is why the flag lives on the set, not globally.

Transport is SSE over the sidecar, matching `/document/stream`, deliberately: the OBS Browser Source is not a Tauri window and has no IPC, so one transport serves the Program window, the Preview window and OBS identically. A graphic cannot be locked to the camera in one surface and floating in another.

**What is still missing, and it matters:**

1. **Never validated against real hardware.** The decoder is tested against its own builder — round-trip, sign extension, unit conversion, checksum, malformed-packet rejection — which proves internal consistency and *cannot* prove wire conformance with a physical tracker. The Settings panel therefore shows accepted/rejected packet counters: a rising reject count is the signal that the wire format does not match. This is the single acceptance criterion before it is trusted on air.
2. **No lens calibration.** Zoom and focus arrive as raw encoder counts. Mapping them to a real focal length needs a per-lens calibration table; what ships is a linear encoder→FOV map an operator sets, labelled as such rather than pretending to be a lens file. Without real calibration, graphics will drift in scale through a zoom.
3. **No lens distortion model.** Graphics are rendered to an ideal pinhole camera, so they will not match a wide lens's barrel distortion at the frame edges.

So: the architecture is real and the protocol is implemented, but this is **tracked-camera AR without lens correction**, and it should be described that way. It is no longer accurate to say the product has no camera tracking; it is not yet accurate to claim parity with Tier-3 AR.

---

## Tier 4 — Rundown & newsroom automation

*Viz Mosart, Sofie (NRK), Cuez, CuePilot, Rundown Studio*

| Capability | This product | Tier | Gap | Pri |
|---|---|---|---|---|
| MOS protocol | ✅ `mos.rs`, streaming parser, roAck/roItemCue, 12 tests | ✅ | **Genuinely strong** | T |
| Rundown import/export | ✅ | ✅ | — | T |
| Rundown Studio connector | ✅ `rundowncloud.rs` | 🟡 | **Differentiator** | C |
| Automation rules | ✅ composable `all_of`/`any_of` conditions | ✅ | — | C |
| Teleprompter | ✅ Phase 10 | 🟡 | Ahead of most | C |
| **MOS against a real NRCS** | ⚠️ untested vs ENPS/iNEWS | ✅ | Conformance unproven | **T** |
| Frame-accurate cueing | 🔴 no timecode | ✅ | Follows from genlock gap | C |

The MOS work is the strongest thing in the repository relative to its class. Its one real risk is that it has never been proven against ENPS or iNEWS — protocol conformance is where MOS implementations actually fail, and unit tests over your own builders cannot find that.

---

## Where this product genuinely wins

Worth stating plainly, because the gap tables above are structurally pessimistic:

1. **Rundown + MOS + automation + Companion in a browser-rendered graphics tool.** Singular.live and Flowics do not ship this. It is a real, defensible differentiator.
2. **One document model across 2D, 3D, virtual set and AR authoring** — no separate tool per surface, no export step between authoring and air.
3. **Honest status reporting** — after the S0 fixes, this product is now *more* rigorous about not over-claiming liveness than several commercial tools, which happily show a green lamp for a dead feed.
4. **Zero hardware dependency.** Runs on a laptop, outputs to OBS. For the tier that cannot afford a Viz Engine, that is the whole proposition.

## Recommended positioning

Compete in **Tier 1**, sell the Tier 4 rundown/MOS strength as the differentiator, and be explicit that Tier 3 comparisons do not apply.

The changes that most improve competitive standing, in order:

1. ~~**Transitions on Take**~~ — done (S1-8). Dissolve, dip-to-clear, four softened wipes and stingers all ship; this row is now at parity with the tier.
2. **Feed authentication + push transport** — without headers the product cannot consume most commercial data feeds, which is the core promise of data-driven graphics. Now the single biggest functional gap.
3. ~~**FreeD camera-tracking ingest, or drop the AR claim**~~ — ingest ships. What remains is validating it against a real tracker and adding lens calibration; until then describe it as tracked-camera AR without lens correction.
