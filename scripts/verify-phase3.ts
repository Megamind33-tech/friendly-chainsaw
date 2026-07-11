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
import { buildDataValues } from "../src/document/dataSources";
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
  const at50 = applyPlayback(el, 0.5, timeline, "in");
  assert(
    "Timeline: Mid IN (opacity < 1)",
    (at50.opacity ?? 0) > 0.2 && (at50.opacity ?? 0) < 1,
    `Got opacity: ${at50.opacity}`
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
    const values = buildDataValues({} as any);

    assert(
      "Data Sources: Mock feed present",
      "mock" in values,
      `Available keys: ${Object.keys(values).join(", ")}`
    );

    assert(
      "Data Sources: Mock has expected fields",
      typeof values.mock === "string" && values.mock.length > 0,
      `Mock value: ${values.mock}`
    );

    // Check for a few common sport feeds
    const hasAtLeastOneSport = ["soccer", "basketball", "football"].some((s) => s in values);
    assert(
      "Data Sources: At least one sport feed present",
      hasAtLeastOneSport,
      `Available feeds: ${Object.keys(values).join(", ")}`
    );

    // Check for genre feeds
    const hasGenres = ["weather", "politics"].some((g) => g in values);
    assert(
      "Data Sources: Genre feeds present",
      hasGenres,
      `Available feeds: ${Object.keys(values).join(", ")}`
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
