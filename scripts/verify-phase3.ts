#!/usr/bin/env node
/**
 * Phase 3 Verification: Data + Bindings + Timelines
 *
 * Tests:
 * 1. Binding engine: resolveElement with mock data
 * 2. Timeline animations: applyPlayback with various easing curves
 * 3. Data sources: mock feed structure and defaults
 */

import { resolveElement, resolveElements } from "../src/document/bindings";
import { applyPlayback } from "../src/document/timelineEngine";
import { buildDataValues, useDataStore } from "../src/document/dataSources";
import type { Element, Layer, Timeline } from "../src/document/types";

const tests = {
  passed: 0,
  failed: 0,
  results: [] as string[],
};

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    tests.passed++;
    tests.results.push(`✓ ${name}`);
  } else {
    tests.failed++;
    tests.results.push(`✗ ${name}${details ? `: ${details}` : ""}`);
  }
}

function testBindingEngine() {
  console.log("\n=== Binding Engine Tests ===\n");

  // Test 1: Simple binding with format
  const textEl: Element = {
    kind: "text",
    id: "text1",
    text: "Default Text",
    bindings: [{ targetPath: "text", source: "mock.clock", format: "Time: {value}", fallback: "N/A" }],
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x: 0, y: 0, width: 100, height: 20, rotation: 0 },
    fontId: "default",
    fontSize: 16,
    color: "#ffffff",
  };

  const data = { "mock.clock": "14:30:00" };
  const resolved = resolveElement(textEl, data);

  assert(
    "Binding: Format substitution",
    resolved.kind === "text" && resolved.text === "Time: 14:30:00",
    `Got: "${resolved.kind === "text" ? resolved.text : "not text"}"`
  );

  // Test 2: Fallback when source is missing
  const resolved2 = resolveElement(textEl, {});
  assert(
    "Binding: Fallback on missing source",
    resolved2.kind === "text" && resolved2.text === "N/A",
    `Got: "${resolved2.kind === "text" ? resolved2.text : "not text"}"`
  );

  // Test 3: Pass-through when no bindings
  const plainEl: Element = { ...textEl, bindings: [] };
  const resolved3 = resolveElement(plainEl, { "mock.clock": "ignored" });
  assert(
    "Binding: Pass-through for unbound elements",
    resolved3.kind === "text" && resolved3.text === "Default Text",
    `Got: "${resolved3.kind === "text" ? resolved3.text : "not text"}"`
  );

  // Test 4: Non-mutation of source
  const original = { ...textEl };
  resolveElement(textEl, data);
  assert(
    "Binding: Pure (no mutation)",
    JSON.stringify(original) === JSON.stringify(textEl),
    "Source element was mutated"
  );

  // Test 5: Multiple elements
  const els = [textEl, plainEl];
  const resolved5 = resolveElements(els, data);
  assert(
    "Binding: Multiple elements",
    resolved5.length === 2 &&
    resolved5[0].kind === "text" &&
    resolved5[0].text === "Time: 14:30:00",
    `Got ${resolved5.length} elements`
  );
}

function testTimelines() {
  console.log("\n=== Timeline Animation Tests ===\n");

  const timeline: Timeline = {
    inDuration: 1.0,
    outDuration: 1.0,
    inEase: "back.out",
    outEase: "power2.in",
  };

  const el: Element = {
    kind: "text",
    id: "anim1",
    text: "Animating",
    bindings: [],
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x: 100, y: 100, width: 200, height: 40, rotation: 0 },
    fontId: "default",
    fontSize: 24,
    color: "#ffffff",
  };

  // Test 1: At start of IN animation (elapsed = 0)
  const at0 = applyPlayback(el, 0, timeline, "in");
  assert(
    "Timeline: Start of IN (opacity near 0)",
    (at0.opacity ?? 0) < 0.2,
    `Got opacity: ${at0.opacity}`
  );

  // Test 2: Mid-animation (elapsed = 0.5s)
  //
  // The timeline above uses "back.out", which OVERSHOOTS: by the midpoint an
  // overshoot ease has legitimately passed full opacity. The old assertion
  // demanded `< 1` and so could only ever pass while opacity was unclamped —
  // it was, in effect, asserting the overshoot bug (canvas globalAlpha ignores
  // out-of-range values, leaving a stale alpha in force). The real invariant
  // is that mid-IN is visible and in range.
  const at50 = applyPlayback(el, 0.5, timeline, "in");
  assert(
    "Timeline: Mid IN (visible and within range)",
    (at50.opacity ?? 0) > 0.2 && (at50.opacity ?? 0) <= 1,
    `Got opacity: ${at50.opacity}`
  );

  // A non-overshoot ease must still be strictly mid-way at the midpoint.
  const linear: Timeline = { ...timeline, inEase: "none" };
  const linearMid = applyPlayback(el, 0.5, linear, "in");
  assert(
    "Timeline: Mid IN with a linear ease is strictly partial",
    (linearMid.opacity ?? 0) > 0.2 && (linearMid.opacity ?? 0) < 1,
    `Got opacity: ${linearMid.opacity}`
  );

  // Test 3: End of IN animation (elapsed = 1.0s)
  const at100 = applyPlayback(el, 1.0, timeline, "in");
  assert(
    "Timeline: End of IN (opacity = 1)",
    Math.abs((at100.opacity ?? 0) - 1) < 0.01,
    `Got opacity: ${at100.opacity}`
  );

  // Test 4: OUT animation
  const outMid = applyPlayback(el, 0.5, timeline, "out");
  assert(
    "Timeline: Mid OUT (opacity decreasing)",
    (outMid.opacity ?? 0) > 0 && (outMid.opacity ?? 0) < 1,
    `Got opacity: ${outMid.opacity}`
  );

  // Test 5: OUT at end
  const outEnd = applyPlayback(el, 1.0, timeline, "out");
  assert(
    "Timeline: End of OUT (opacity near 0)",
    (outEnd.opacity ?? 0) < 0.2,
    `Got opacity: ${outEnd.opacity}`
  );
}

function testDataSources() {
  console.log("\n=== Data Sources Tests ===\n");

  try {
    // Real store state. This used to pass `{} as any`, which threw on
    // `state.mock.values` — so every assertion below was unreachable and the
    // suite reported a failure nobody was watching, because these scripts are
    // not in CI.
    const values = buildDataValues(useDataStore.getState());

    // buildDataValues returns a FLAT `source.key` map, not nested objects.
    // The old assertions checked `"mock" in values` and
    // `typeof values.mock === "string"`, which could never hold.
    assert(
      "Data Sources: Mock feed present",
      Object.keys(values).some((k) => k.startsWith("mock.")),
      `Available keys: ${Object.keys(values).slice(0, 10).join(", ")}`
    );

    assert(
      "Data Sources: Mock has expected fields",
      typeof values["mock.headline"] === "string" && values["mock.headline"].length > 0,
      `mock.headline: ${values["mock.headline"]}`
    );

    const hasAtLeastOneSport = ["soccer", "basketball", "football"].some((s) =>
      Object.keys(values).some((k) => k.startsWith(`${s}.`))
    );
    assert(
      "Data Sources: At least one sport feed present",
      hasAtLeastOneSport,
      `Available feeds: ${[...new Set(Object.keys(values).map((k) => k.split(".")[0]))].join(", ")}`
    );

    const hasGenres = ["weather", "politics"].some((g) =>
      Object.keys(values).some((k) => k.startsWith(`${g}.`))
    );
    assert(
      "Data Sources: Genre feeds present",
      hasGenres,
      `Available feeds: ${[...new Set(Object.keys(values).map((k) => k.split(".")[0]))].join(", ")}`
    );

    // The live wall-clock value is derived, never stored — it proves the flat
    // map carries computed values as well as feed values.
    assert(
      "Data Sources: derived clock value present",
      typeof values["clock.time"] === "string" && values["clock.time"].length > 0,
      `clock.time: ${values["clock.time"]}`
    );
  } catch (e) {
    assert("Data Sources: buildDataValues callable", false, String(e));
  }
}

function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║     Phase 3: Data + Bindings + Timelines       ║");
  console.log("║          Verification Tests (TypeScript)        ║");
  console.log("╚════════════════════════════════════════════════╝");

  testBindingEngine();
  testTimelines();
  testDataSources();

  console.log("\n=== Summary ===\n");
  tests.results.forEach((r) => console.log(r));

  console.log(`\n${tests.passed} passed, ${tests.failed} failed\n`);

  if (tests.failed > 0) {
    process.exit(1);
  }
}

main();
