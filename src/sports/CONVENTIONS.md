# Sports Package — Schema Conventions

`soccer.ts` is the canonical template. Every other sport (basketball, football,
hockey, baseball, tennis, volleyball, rugby, …) copies its structure verbatim.
Follow this checklist exactly — a Sonnet integration pass reviews each new sport
against it, and drift here is what makes the package inconsistent.

## 1. File layout

- One file per sport: `src/sports/<sport>.ts` (lowercase, singular).
- Exports, in order:
  - `<SPORT>_KEYS` — a `const` object mapping field name → `"<sport>.<field>"` string.
  - `<SPORT>_DEFAULTS: Record<string, string>` — live default values, one per key.
  - `create<Sport>Scorebug(): Layer` — builds the fully-bound `gfx2d` layer.

## 2. Binding-key naming (mandatory pattern)

- Every key is `<sport>.<field>`, lowerCamelCase field, no abbreviations that
  aren't broadcast-standard. Match soccer's field names where the concept is the
  same so bindings transfer across sports.
- Mandatory fields for a scorebug — every sport MUST have these:
  - `homeTeam`, `awayTeam` — team names/abbreviations.
  - `homeScore`, `awayScore` — current score.
  - `clock` — game clock (`"00:00"` format).
  - `period` — current period/half/quarter/inning label (`"1ST"`, `"Q2"`, `"BOT 5"`, …).
- Sport-specific extras go AFTER the mandatory ones and stay `<sport>.<field>`
  (e.g. `football.down`, `basketball.fouls`, `baseball.count`). Never invent a
  key outside its sport namespace.

## 3. Data source (`src/document/dataSources.ts`)

- Each sport is a source object keyed by its sport id, seeded from
  `<SPORT>_DEFAULTS` (spread a copy — never share the mutable object).
- Add a `set<Sport>Value(key, value)` action mirroring `setSoccerValue`.
- Extend `buildDataValues` to flatten the source as `<id>.<key>` (reuse the
  soccer loop pattern — `values[\`${state.soccer.id}.${k}\`] = v`).
- Extend `InspectorPanel`'s `availableSourceKeys` so the keys are pickable.
- Keys are FIXED (schema-defined) — the DataSourcesPanel section renders values
  as editable but keys as static labels; do NOT add rename/remove for sport keys
  (only the Mock Feed has free-form keys).

## 4. Elements & bindings (data-driven, never literal)

- Every dynamic text element carries a `Binding { targetPath: "text", source:
  "<sport>.<field>", fallback: <default> }`. The element's authored `text` is the
  fallback value, NOT a hardcoded score/name — the binding engine overrides it at
  push time. No literal score/team/clock strings anywhere (this is the exact
  legacy anti-pattern being killed).
- Static chrome (background bands, accent bars, dividers) are plain
  `createRectElement` calls with no bindings.
- Use the factory functions (`createLayer`, `createRectElement`,
  `createTextElement`) — never hand-construct nodes; that's the only place
  `Layer.kind`/`props.kind` stay in sync.
- Colors are literal hex (Konva renders `fill`/`fontSize` verbatim), matching
  factory defaults — NOT the CSS palette tokens, which are panel-UI only.

## 5. Layer naming & timeline

- Layer `name`: `"<Sport> Scorebug"` (title case), e.g. `"Basketball Scorebug"`.
- Element `name`s are human-readable roles (`"Home Team"`, `"Away Score"`,
  `"Clock"`) — these show in the Layers tree.
- Timeline: reuse `defaultTimeline()` unless the sport warrants different timing.
  Soccer snaps on slightly faster (`inDuration: 0.45`, `inEase: "power3.out"`);
  keep a scorebug's IN snappier than the generic default. Always give the layer a
  timeline so Program/Preview gate on-air visibility via Play In/Out.

## 6. UI wiring

- Add an `Add <Sport> Scorebug` button in `LayersPanel.tsx` calling
  `addPrebuiltLayer(scene.id, create<Sport>Scorebug())`. A factory nobody can add
  from the UI is a half-finished implementation — not acceptable.

## 7. Document model

- Sport content fits entirely within the existing `gfx2d` / `Element` / `Binding`
  / `Timeline` primitives. Do NOT add fields to `Layer`/`Element`/the document
  model for a sport. If you ever genuinely must, add the field to
  `src/document/schema.ts` as optional too — Zod strips unknown keys on reload,
  so an unmirrored field silently vanishes (a previously-hit bug class).

## 8. Verify

- `bunx tsc --noEmit` from the repo root must be clean before a sport is done.
