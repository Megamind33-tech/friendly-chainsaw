import {
  createGroupNode,
  createPrimitiveNode,
  createText3dNode,
  createVideoFeedNode,
  vec3,
} from "@/document/factory";
import type { ARAnimation, SetNode, Text3dNode, Transform3D, Vec3 } from "@/document/types";
import { FORMATIONS, formationSlotWorldPosition, resolveFormation, type Formation } from "@/sports/squads";
import type { ARTemplate } from "./types";
import { markSetNodesAsAr } from "./nodeUtils";
import { buildElectionCandidateTowers } from "@/ar-system/election/repeater";
import { getElectionDefaults } from "@/ar-system/election/electionFeed";

/**
 * The AR visual library — every template is REAL data-bound AR: its text
 * nodes carry Bindings into the same live feeds the 2D graphics use
 * (soccer.*, squad.*, map.*, politics.*, mock.*, edited in the Data
 * workspace), resolved live in the editor (SetNodes' applyTextBinding) and
 * baked into the output push (persistence.ts) so Program/Preview/OBS show
 * the live values. One dataset, two render targets — 2D straps and AR
 * boards can't drift apart. Never an unbound literal for a data field;
 * literals are only chrome.
 */

// ---------------------------------------------------------------------------
// Choreography — a network broadcast build cascades in layers, never a flat
// fade: the backdrop rises out of the set first, structural bars/frames
// wipe or fly in from alternating sides right behind it, text pops in late,
// and hero live numbers (scores, leading percentages) land last with a
// loop-pulse that keeps breathing gently while the graphic stays on air.
// Every template below layers its delays ~0.08–0.15s apart and lands its
// last element within ~1.6–2.2s of IN (small single-element templates are
// intentionally snappier — see per-template notes).
// ---------------------------------------------------------------------------

/** Backdrop plates rise out of the set. */
function backdropAnim(delay = 0, duration = 1.0): ARAnimation {
  return { preset: "slide", duration, delay, easing: "power4.out", direction: "bottom" };
}

/** Structural bars/dividers/cards wipe or fly in from alternating sides. */
function structuralAnim(
  delay: number,
  direction: ARAnimation["direction"] = "left",
  opts: { duration?: number; preset?: ARAnimation["preset"] } = {},
): ARAnimation {
  return { preset: opts.preset ?? "wipe", duration: opts.duration ?? 0.6, delay, easing: "expo.out", direction };
}

/** Quick non-directional scale-in for small square elements (image slots,
 * backing frames) where a wipe direction wouldn't read cleanly. */
function settleAnim(delay: number, duration = 0.5): ARAnimation {
  return { preset: "scale", duration, delay, easing: "power3.out", direction: "bottom" };
}

/** Text lands late with a broadcast-standard overshoot pop. */
function popAnim(delay: number, duration = 0.55): ARAnimation {
  return { preset: "pop", duration, delay, easing: "back.out(1.6)", direction: "bottom", scaleFrom: 0.72 };
}

/** Numeric totals (votes, live stat values) — the last beat before hero
 * numbers, no continued loop after settling. */
function countUpAnim(delay: number, duration = 0.6): ARAnimation {
  return { preset: "count-up", duration, delay, easing: "power3.out", direction: "bottom", countUp: true, scaleFrom: 0.85 };
}

/** Hero live numbers ONLY (score, leading percentage) — pops in then
 * breathes continuously while on air. Reserve for 1-2 nodes per template;
 * overusing this makes the whole board feel restless instead of alive. */
function heroPulseAnim(delay: number, duration = 0.6): ARAnimation {
  return { preset: "loop-pulse", duration, delay, easing: "back.out(1.6)", direction: "bottom", loopPeriod: 1.6, loopScale: 0.05 };
}

/** Gentle fade for scripture prose — reads on verse transitions. */
function verseFadeAnim(delay: number, duration = 0.75): ARAnimation {
  return { preset: "fade", duration, delay, easing: "power2.out", direction: "bottom", fade: true };
}

const FAITH_PLUM = "#1a0f28";
const FAITH_GOLD = "#f0d493";
const FAITH_CREAM = "#f5ecd8";
const FAITH_ACCENT = "#d9a441";

function createScriptureArNodes(): SetNode[] {
  return markSetNodesAsAr([
    createGroupNode(
      [
        panel("Scripture plate", vec3(0, 1.65, -3.2), vec3(3.8, 2.2, 0.06), FAITH_PLUM, backdropAnim(0, 0.95)),
        edgeAccent("Top gold rule", vec3(0, 2.72, -3.14), vec3(3.5, 0.025, 0.02), structuralAnim(0.12, "right", { duration: 0.55 }), FAITH_ACCENT),
        edgeAccent("Bottom gold rule", vec3(0, 0.58, -3.14), vec3(3.5, 0.025, 0.02), structuralAnim(0.12, "left", { duration: 0.55 }), FAITH_ACCENT),
        boundText3d(
          {
            name: "Verse",
            text: "For God so loved the world, that he gave his only begotten Son",
            fontSize: 0.2,
            color: FAITH_CREAM,
            transform: { position: vec3(-1.55, 1.85, -3.05) },
          },
          "event.verseText",
          verseFadeAnim(0.28, 0.85),
        ),
        boundText3d(
          { name: "Reference", text: "JOHN 3:16", fontSize: 0.14, color: FAITH_GOLD, transform: { position: vec3(-1.55, 0.95, -3.02) } },
          "event.verseRef",
          popAnim(0.55, 0.5),
        ),
      ],
      { name: "AR Scripture Board" },
    ),
  ]);
}

function createSpeakerStrapArNodes(): SetNode[] {
  return markSetNodesAsAr([
    createGroupNode(
      [
        panel("Speaker bar", vec3(0, 1.05, -3), vec3(2.8, 0.55, 0.05), FAITH_PLUM, structuralAnim(0, "left", { duration: 0.55, preset: "fly" })),
        edgeAccent("Speaker tab", vec3(-1.22, 1.05, -2.94), vec3(0.08, 0.55, 0.02), structuralAnim(0.14, "left", { duration: 0.4 }), FAITH_ACCENT),
        boundText3d(
          { name: "Speaker", text: "SPEAKER NAME", fontSize: 0.18, color: FAITH_CREAM, transform: { position: vec3(-1.05, 1.18, -2.9) } },
          "event.speaker",
          popAnim(0.26, 0.5),
        ),
        boundText3d(
          { name: "Role", text: "SENIOR PASTOR", fontSize: 0.1, color: FAITH_GOLD, transform: { position: vec3(-1.05, 0.94, -2.9) } },
          "event.speakerRole",
          popAnim(0.38, 0.45),
        ),
      ],
      { name: "AR Speaker Strap", transform: { position: vec3(-0.8, 0, 0) } },
    ),
  ]);
}

function createWorshipStrapArNodes(): SetNode[] {
  return markSetNodesAsAr([
    createGroupNode(
      [
        panel("Worship bar", vec3(0, 1.05, -3), vec3(3.2, 0.62, 0.05), FAITH_PLUM, structuralAnim(0, "right", { duration: 0.55, preset: "fly" })),
        panel("Now playing tab", vec3(-1.35, 1.05, -2.94), vec3(0.55, 0.62, 0.04), FAITH_ACCENT, popAnim(0.12, 0.45)),
        boundText3d(
          { name: "Song", text: "AMAZING GRACE", fontSize: 0.17, color: FAITH_CREAM, transform: { position: vec3(-0.95, 1.16, -2.9) } },
          "event.songTitle",
          popAnim(0.28, 0.5),
        ),
        boundText3d(
          { name: "Writer", text: "JOHN NEWTON", fontSize: 0.1, color: FAITH_GOLD, transform: { position: vec3(-0.95, 0.94, -2.9) } },
          "event.songWriter",
          popAnim(0.4, 0.45),
        ),
      ],
      { name: "AR Worship Strap", transform: { position: vec3(0.6, 0, 0) } },
    ),
  ]);
}

const FAITH_AR_TEMPLATES: ARTemplate[] = [
  {
    id: "scripture-board-ar",
    name: "AR Scripture Board",
    category: "data",
    create: () => createScriptureArNodes(),
  },
  {
    id: "speaker-strap-ar",
    name: "AR Speaker Strap",
    category: "data",
    create: () => createSpeakerStrapArNodes(),
  },
  {
    id: "worship-strap-ar",
    name: "AR Worship Strap",
    category: "data",
    create: () => createWorshipStrapArNodes(),
  },
];

/** A brand accent color reused for every edge-accent bar/divider so the
 * template library reads as one system rather than per-board one-offs. */
const ACCENT_COLOR = "#4a90d9";

/** A text node bound to a live data key — the authored text is the fallback. */
function boundText3d(
  overrides: { name: string; text: string; fontSize: number; color: string; transform: Partial<Transform3D> },
  source: string,
  animation: ARAnimation,
): Text3dNode {
  const node = createText3dNode(overrides);
  node.bindings = [{ targetPath: "text", source, fallback: overrides.text }];
  node.animation = animation;
  return node;
}

/** A structural backdrop/card panel — boosted emissive + unlit render path. */
function panel(name: string, position: Vec3, scale: Vec3, color = "#1e3d66", animation: ARAnimation = backdropAnim()): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: { position, scale },
    material: { color, metalness: 0.06, roughness: 0.65, opacity: 0.94, emissive: color, emissiveIntensity: 0.55 },
  });
  node.animation = animation;
  return node;
}

/** A color-accent bar — a party/team color chip, glowing rather than flat,
 * so it reads as a live indicator instead of a painted stripe. Its default
 * color independently binds to the real party/team color, separate from the
 * board's background panel. */
function colorBar(name: string, position: Vec3, scale: Vec3, color: string, animation: ARAnimation): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: { position, scale },
    material: { color, metalness: 0.3, roughness: 0.3, opacity: 1, emissive: color, emissiveIntensity: 1.2 },
  });
  node.animation = animation;
  return node;
}

/** A thin emissive accent bar along a panel's top or bottom edge — the
 * material-level detail that keeps a big flat backdrop from reading as a
 * slab. Purely chrome, never bound to data. */
function edgeAccent(name: string, position: Vec3, scale: Vec3, animation: ARAnimation, color = ACCENT_COLOR): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: { position, scale },
    material: { color, metalness: 0.5, roughness: 0.3, opacity: 1, emissive: color, emissiveIntensity: 1.1 },
  });
  node.animation = animation;
  return node;
}

/** An image-slot plane — a flat primitive with a dark placeholder material
 * and deliberately NO textureAssetId. The operator assigns a real image
 * (party symbol, team crest, headshot) via the Inspector's texture picker;
 * this node only reserves the spot and its entrance choreography. Never
 * carries a binding — it isn't a data field, it's chrome the operator fills
 * in per broadcast. */
function imageSlot(name: string, position: Vec3, scale: Vec3, animation: ARAnimation = settleAnim(0)): SetNode {
  const node = createPrimitiveNode("plane", {
    name,
    transform: { position, scale },
    material: { color: "#2a3548", metalness: 0, roughness: 1, opacity: 1 },
  });
  node.animation = animation;
  return node;
}

function boundImageSlot(name: string, position: Vec3, scale: Vec3, sourceKey: string, animation: ARAnimation = settleAnim(0)): SetNode {
  const node = imageSlot(name, position, scale, animation);
  node.bindings = [{ targetPath: "textureUrl", source: sourceKey, fallback: "" }];
  return node;
}

/** A thin backing frame sat a hair behind an image slot, slightly larger on
 * every side — the physical-card mount so an assigned image reads as a
 * mounted print rather than a floating sticker. Dark, semi-metallic; never
 * bound (chrome, like the slot it backs). */
function imageFrame(name: string, slotPosition: Vec3, slotScale: Vec3, animation: ARAnimation, grow = 1.18): SetNode {
  const node = createPrimitiveNode("box", {
    name,
    transform: {
      position: vec3(slotPosition.x, slotPosition.y, slotPosition.z - 0.02),
      scale: vec3(slotScale.x * grow, slotScale.y * grow, 0.02),
    },
    material: { color: "#1a2838", metalness: 0.15, roughness: 0.5, opacity: 0.97, emissive: "#1a2838", emissiveIntensity: 0.4 },
  });
  node.animation = animation;
  return node;
}

function createSquadFormationArNodes(formation: Formation): SetNode[] {
  const cards: SetNode[] = formation.positions.map((_pos, i) => {
    const n = i + 1;
    const { x, z } = formationSlotWorldPosition(i, formation);
    const panelDelay = 0.1 + i * 0.08;
    const flyDir: ARAnimation["direction"] = i % 2 === 0 ? "left" : "right";
    return createGroupNode(
      [
        panel(`P${n} card`, vec3(0, 1.05, 0), vec3(0.92, 0.58, 0.05), "#243d63", structuralAnim(panelDelay, flyDir, { duration: 0.55, preset: "fly" })),
        boundImageSlot(`P${n} photo`, vec3(0.18, 1.05, 0.08), vec3(0.52, 0.52, 1), `squad.p${n}photo`, settleAnim(panelDelay + 0.12)),
        boundText3d(
          { name: `P${n} number`, text: String(n), fontSize: 0.22, color: "#ffd37a", transform: { position: vec3(-0.28, 1.2, 0.09) } },
          `squad.p${n}num`,
          popAnim(panelDelay + 0.22, 0.5),
        ),
        boundText3d(
          { name: `P${n} name`, text: `PLAYER ${n}`, fontSize: 0.1, color: "#ffffff", transform: { position: vec3(-0.28, 0.96, 0.09) } },
          `squad.p${n}name`,
          popAnim(panelDelay + 0.32, 0.5),
        ),
      ],
      { name: `Player ${n}`, transform: { position: vec3(x, 0, z) }, formationSlot: n },
    );
  });
  return markSetNodesAsAr([
    createGroupNode(
      [
        ...cards,
        boundText3d(
          { name: "Team name", text: "FC UNITED", fontSize: 0.3, color: "#ffffff", transform: { position: vec3(-2.2, 3.1, -6.4) } },
          "squad.teamName",
          backdropAnim(0, 0.9),
        ),
        boundText3d(
          { name: "Formation", text: formation.label, fontSize: 0.18, color: "#9ed8ff", transform: { position: vec3(-2.2, 2.75, -6.4) } },
          "squad.formation",
          popAnim(0.2, 0.55),
        ),
      ],
      { name: `AR Squad ${formation.label}` },
    ),
  ]);
}

const SQUAD_AR_TEMPLATES: ARTemplate[] = [
  {
    id: "squad-formation-ar",
    name: "AR Squad Formation (live)",
    category: "sports",
    create: () => createSquadFormationArNodes(resolveFormation("4-3-3")),
  },
  ...FORMATIONS.map(
    (formation): ARTemplate => ({
      id: `squad-formation-ar-${formation.id}`,
      name: `AR Squad ${formation.label}`,
      category: "sports",
      create: () => createSquadFormationArNodes(formation),
    }),
  ),
];

export const AR_TEMPLATES: ARTemplate[] = [
  {
    // Build (~1.3s — a lower third is the one graphic real broadcast pace
    // keeps snappy, not stretched to the full 1.6-2.2s a full board gets):
    // plate rises 0-1.05s -> accent bar wipes in 0.15-0.75s -> guest name
    // pops 0.55-1.15s -> title pops 0.7-1.3s.
    id: "lower-third-3d",
    name: "3D Lower Third",
    category: "news",
    create: () =>
      markSetNodesAsAr([
        createGroupNode(
          [
            panel("Lower third plate", vec3(0, 1.1, -3), vec3(3.8, 0.42, 0.06), undefined, backdropAnim(0, 1.05)),
            edgeAccent(
              "Lower third accent bar",
              vec3(0, 0.885, -2.97),
              vec3(3.6, 0.03, 0.02),
              structuralAnim(0.15, "left", { duration: 0.6 }),
            ),
            boundText3d(
              { name: "Guest name", text: "GUEST NAME", fontSize: 0.24, color: "#ffffff", transform: { position: vec3(-1.55, 1.18, -2.92) } },
              "mock.guest_name",
              popAnim(0.55),
            ),
            boundText3d(
              { name: "Title", text: "TITLE / LOCATION", fontSize: 0.14, color: "#9ed8ff", transform: { position: vec3(-1.55, 0.98, -2.88) } },
              "mock.title",
              popAnim(0.7),
            ),
          ],
          { name: "3D Lower Third" },
        ),
      ]),
  },
  {
    // Build (~1.7s): panel rises 0-1.0s -> bottom edge accent wipes in
    // 0.15-0.75s -> crest frames settle 0.2/0.28-0.7/0.78s -> color bars wipe
    // in from alternating sides 0.32/0.4-0.92/1.0s -> crests settle
    // 0.46/0.54-0.96/1.04s -> team names pop 0.64/0.74-1.19/1.29s -> clock
    // pops 0.86-1.41s -> home/away score are the hero numbers: loop-pulse in
    // 1.0/1.1-1.6/1.7s and keep breathing on air.
    id: "sports-score-board",
    name: "Sports Score Board",
    category: "sports",
    create: () =>
      markSetNodesAsAr([
        createGroupNode(
          [
            panel("Score board panel", vec3(0, 2.1, -3.4), vec3(3.4, 1.15, 0.08), undefined, backdropAnim(0, 1.0)),
            edgeAccent(
              "Score board accent bar",
              vec3(0, 1.52, -3.36),
              vec3(3.2, 0.035, 0.02),
              structuralAnim(0.15, "left", { duration: 0.6 }),
            ),
            imageFrame("Home crest frame", vec3(-1.5, 2.5, -3.32), vec3(0.28, 0.28, 1), settleAnim(0.2)),
            imageFrame("Away crest frame", vec3(1.2, 2.5, -3.32), vec3(0.28, 0.28, 1), settleAnim(0.28)),
            imageSlot("Home crest", vec3(-1.5, 2.5, -3.32), vec3(0.28, 0.28, 1), settleAnim(0.46)),
            imageSlot("Away crest", vec3(1.2, 2.5, -3.32), vec3(0.28, 0.28, 1), settleAnim(0.54)),
            colorBar("Home color bar", vec3(-1.05, 2.4, -3.33), vec3(0.55, 0.035, 0.02), "#2a6fd4", structuralAnim(0.32, "left", { duration: 0.6 })),
            colorBar("Away color bar", vec3(0.55, 2.4, -3.33), vec3(0.55, 0.035, 0.02), "#d43a3a", structuralAnim(0.4, "right", { duration: 0.6 })),
            boundText3d(
              { name: "Home team", text: "HOME", fontSize: 0.16, color: "#9ed8ff", transform: { position: vec3(-1.05, 2.5, -3.32) } },
              "soccer.homeTeam",
              popAnim(0.64),
            ),
            boundText3d(
              { name: "Away team", text: "AWAY", fontSize: 0.16, color: "#9ed8ff", transform: { position: vec3(0.55, 2.5, -3.32) } },
              "soccer.awayTeam",
              popAnim(0.74),
            ),
            boundText3d(
              { name: "Home score", text: "0", fontSize: 0.42, color: "#ffffff", transform: { position: vec3(-0.9, 2.05, -3.32) } },
              "soccer.homeScore",
              heroPulseAnim(1.0),
            ),
            boundText3d(
              { name: "Away score", text: "0", fontSize: 0.42, color: "#ffffff", transform: { position: vec3(0.7, 2.05, -3.32) } },
              "soccer.awayScore",
              heroPulseAnim(1.1),
            ),
            boundText3d(
              { name: "Clock", text: "00:00", fontSize: 0.16, color: "#ffd37a", transform: { position: vec3(-0.2, 1.7, -3.32) } },
              "soccer.clock",
              popAnim(0.86),
            ),
          ],
          { name: "AR Score Board" },
        ),
      ]),
  },
  {
    // A two-candidate race board — each row is a full result line: party
    // symbol image slot (operator-assigned), party color bar, candidate +
    // party name, vote count and percent, all bound to the real politics.*
    // feed the 2D election straps use.
    // Build (~1.7s): panel rises 0-1.0s -> header divider wipes 0.15-0.75s ->
    // race title/reporting pop 0.28/0.38-0.83/0.93s -> row 1 cascades
    // (frame/bar/symbol 0.22-0.32-0.42, names 0.52/0.62, votes count-up
    // 0.78-1.38, PCT hero loop-pulse 0.95-1.55) -> row 2 follows ~0.14s
    // behind row 1 at every beat, its PCT hero pulse landing 1.1-1.7s.
    id: "election-result-board",
    name: "Election Result Board",
    category: "election",
    create: () =>
      markSetNodesAsAr([
        createGroupNode(
          [
            panel("Election results wall", vec3(0, 2, -3.6), vec3(3.9, 2.6, 0.08), undefined, backdropAnim(0, 1.0)),
            edgeAccent(
              "Election divider bar",
              vec3(0, 2.68, -3.53),
              vec3(3.6, 0.025, 0.02),
              structuralAnim(0.15, "right", { duration: 0.6 }),
            ),
            boundText3d(
              { name: "Race title", text: "ELECTION RESULTS", fontSize: 0.2, color: "#ffffff", transform: { position: vec3(-1.75, 3.05, -3.5) } },
              "politics.raceTitle",
              popAnim(0.28),
            ),
            boundText3d(
              { name: "Reporting", text: "0% REPORTING", fontSize: 0.11, color: "#ffd37a", transform: { position: vec3(-1.75, 2.82, -3.5) } },
              "politics.reporting",
              popAnim(0.38),
            ),

            // --- Row 1: Candidate A -------------------------------------
            imageFrame("Party 1 symbol frame", vec3(-1.65, 2.35, -3.52), vec3(0.35, 0.35, 1), settleAnim(0.22)),
            imageSlot("Party symbol 1", vec3(-1.65, 2.35, -3.52), vec3(0.35, 0.35, 1), settleAnim(0.42)),
            colorBar("Party 1 color bar", vec3(-1.25, 2.35, -3.52), vec3(0.07, 0.35, 0.03), "#2a6fd4", structuralAnim(0.32, "left", { duration: 0.6 })),
            boundText3d(
              { name: "Candidate 1", text: "CANDIDATE A", fontSize: 0.15, color: "#9ed8ff", transform: { position: vec3(-1.05, 2.44, -3.5) } },
              "politics.candidate1",
              popAnim(0.52),
            ),
            boundText3d(
              { name: "Party 1", text: "PARTY A", fontSize: 0.095, color: "#7fa8c9", transform: { position: vec3(-1.05, 2.24, -3.5) } },
              "politics.party1",
              popAnim(0.62),
            ),
            boundText3d(
              { name: "Votes 1", text: "0", fontSize: 0.13, color: "#ffffff", transform: { position: vec3(0.75, 2.35, -3.5) } },
              "politics.votes1",
              countUpAnim(0.78),
            ),
            boundText3d(
              { name: "Pct 1", text: "0%", fontSize: 0.24, color: "#ffffff", transform: { position: vec3(1.35, 2.35, -3.5) } },
              "politics.pct1",
              heroPulseAnim(0.95),
            ),

            // --- Row 2: Candidate B -------------------------------------
            imageFrame("Party 2 symbol frame", vec3(-1.65, 1.55, -3.52), vec3(0.35, 0.35, 1), settleAnim(0.36)),
            imageSlot("Party symbol 2", vec3(-1.65, 1.55, -3.52), vec3(0.35, 0.35, 1), settleAnim(0.56)),
            colorBar("Party 2 color bar", vec3(-1.25, 1.55, -3.52), vec3(0.07, 0.35, 0.03), "#d43a3a", structuralAnim(0.46, "right", { duration: 0.6 })),
            boundText3d(
              { name: "Candidate 2", text: "CANDIDATE B", fontSize: 0.15, color: "#ffb0b0", transform: { position: vec3(-1.05, 1.64, -3.5) } },
              "politics.candidate2",
              popAnim(0.66),
            ),
            boundText3d(
              { name: "Party 2", text: "PARTY B", fontSize: 0.095, color: "#c98787", transform: { position: vec3(-1.05, 1.44, -3.5) } },
              "politics.party2",
              popAnim(0.76),
            ),
            boundText3d(
              { name: "Votes 2", text: "0", fontSize: 0.13, color: "#ffffff", transform: { position: vec3(0.75, 1.55, -3.5) } },
              "politics.votes2",
              countUpAnim(0.92),
            ),
            boundText3d(
              { name: "Pct 2", text: "0%", fontSize: 0.24, color: "#ffffff", transform: { position: vec3(1.35, 1.55, -3.5) } },
              "politics.pct2",
              heroPulseAnim(1.1),
            ),
          ],
          { name: "AR Election Board" },
        ),
      ]),
  },
  {
    // Data-driven candidate result towers — repeater-generated from election.*
    // feed (N candidates, not hard-coded to 2). Bindings resolve live via
    // SetNodes applyTextBinding; bar height reflects percentage; leader gets
    // hero pulse animation.
    id: "election-candidate-towers",
    name: "Election Candidate Towers",
    category: "election",
    create: () => {
      const defaults = getElectionDefaults();
      const count = Number(defaults["candidateCount"] ?? 3);
      const getValue = (key: string) => {
        // bindings use election.candidates.N.* — map from feed storage
        const suffix = key.startsWith("election.") ? key.slice("election.".length) : key;
        return defaults[suffix] ?? "";
      };
      return buildElectionCandidateTowers(count, (key) => {
        const suffix = key.startsWith("election.") ? key.slice("election.".length) : key;
        return defaults[suffix] ?? getValue(key);
      });
    },
  },
  ...SQUAD_AR_TEMPLATES,
  ...FAITH_AR_TEMPLATES,
  {
    // Map plane + pulsing pins bound to map.* — assign your map artwork to
    // the plane via Inspector > Surface > texture (same image assets the 2D
    // map board uses).
    // Build (~2.0s): board rises 0-1.0s -> backing frame settles 0.15-0.65s
    // -> header divider wipes 0.28-0.88s -> title pops 0.42-0.97s -> the 4
    // pins cascade: dots pulse in 0.3-2.0s (staggered 0.12s apart, then
    // breathe forever on air), labels pop in behind them, values (the live
    // map.locNvalue figures) land last on count-up, up to 1.98s for pin 4.
    id: "map-board-ar",
    name: "AR Map Board",
    category: "data",
    create: () => {
      const pinPulseAnim = (n: number): ARAnimation => ({
        preset: "loop-pulse",
        duration: 1.3,
        delay: 0.3 + (n - 1) * 0.12,
        easing: "power1.inOut",
        direction: "none",
      });
      const pinAt = (n: 1 | 2 | 3 | 4, x: number, y: number): SetNode =>
        createGroupNode(
          [
            (() => {
              const dot = createPrimitiveNode("sphere", {
                name: `Pin ${n} dot`,
                transform: { position: vec3(0, 0, 0.06), scale: vec3(0.07, 0.07, 0.07) },
                material: { color: "#ff5544", metalness: 0.1, roughness: 0.3, emissive: "#ff5544", emissiveIntensity: 1.2 },
              });
              dot.animation = pinPulseAnim(n);
              return dot;
            })(),
            boundText3d(
              { name: `Pin ${n} label`, text: `LOCATION ${n}`, fontSize: 0.09, color: "#ffffff", transform: { position: vec3(0.1, 0.08, 0.08) } },
              `map.loc${n}label`,
              popAnim(0.9 + (n - 1) * 0.12, 0.55),
            ),
            boundText3d(
              { name: `Pin ${n} value`, text: "—", fontSize: 0.11, color: "#ffd37a", transform: { position: vec3(0.1, -0.08, 0.08) } },
              `map.loc${n}value`,
              countUpAnim(1.02 + (n - 1) * 0.12, 0.6),
            ),
          ],
          { name: `Map pin ${n}`, transform: { position: vec3(x, y, 0) } },
        );
      const board = createPrimitiveNode("plane", {
        name: "Map surface (assign texture)",
        transform: { position: vec3(0, 0, 0), scale: vec3(3.6, 2.0, 1) },
        material: { color: "#2d5a8a", metalness: 0.05, roughness: 0.55, emissive: "#2d5a8a", emissiveIntensity: 0.5 },
      });
      board.animation = backdropAnim(0, 1.0);
      const boardFrame = imageFrame("Map surface frame", vec3(0, 0, 0), vec3(3.6, 2.0, 1), settleAnim(0.15), 1.05);
      const headerDivider = edgeAccent(
        "Map header divider",
        vec3(0, 1.02, 0.045),
        vec3(3.3, 0.025, 0.02),
        structuralAnim(0.28, "right", { duration: 0.6 }),
      );
      return markSetNodesAsAr([
        createGroupNode(
          [
            boardFrame,
            board,
            headerDivider,
            boundText3d(
              { name: "Map title", text: "REGIONAL OVERVIEW", fontSize: 0.16, color: "#ffffff", transform: { position: vec3(-1.7, 1.18, 0.05) } },
              "map.title",
              popAnim(0.42),
            ),
            pinAt(1, -1.1, 0.45),
            pinAt(2, 0.6, 0.55),
            pinAt(3, -0.3, -0.25),
            pinAt(4, 1.1, -0.5),
          ],
          { name: "AR Map Board", transform: { position: vec3(0, 2, -3.4) } },
        ),
      ]);
    },
  },
  {
    // Three floating stat cards — the AR counterpart of the 2D Stat Board,
    // bound to the shared per-sport stat keys.
    // Build (~1.66s): each card flies in from an alternating side (i*0.22
    // stagger), its bottom-edge accent bar wipes in ~0.15s behind it, the
    // label pops ~0.30s behind the card, and the live stat value (a
    // "total") lands last on count-up ~0.52s behind the card — last card's
    // value settles at 1.66s.
    id: "floating-stat-cards",
    name: "Floating Stat Cards",
    category: "data",
    create: () =>
      markSetNodesAsAr(
        [0, 1, 2].map((i) => {
          const cardDelay = i * 0.22;
          const flyDir: ARAnimation["direction"] = i % 2 === 0 ? "left" : "right";
          return createGroupNode(
            [
              panel(`Stat ${i + 1} card`, vec3(0, 0, 0), vec3(1.15, 0.62, 0.05), "#243d63", structuralAnim(cardDelay, flyDir, { duration: 0.6, preset: "fly" })),
              edgeAccent(
                `Stat ${i + 1} accent bar`,
                vec3(0, -0.3, 0.02),
                vec3(1.0, 0.03, 0.02),
                structuralAnim(cardDelay + 0.15, flyDir, { duration: 0.5 }),
              ),
              boundText3d(
                { name: `Stat ${i + 1} value`, text: "0", fontSize: 0.22, color: "#ffffff", transform: { position: vec3(-0.42, 0.08, 0.04) } },
                `soccer.stat${i + 1}Home`,
                countUpAnim(cardDelay + 0.52, 0.7),
              ),
              boundText3d(
                { name: `Stat ${i + 1} label`, text: `STAT ${i + 1}`, fontSize: 0.1, color: "#9ed8ff", transform: { position: vec3(-0.42, -0.14, 0.04) } },
                `soccer.stat${i + 1}Label`,
                popAnim(cardDelay + 0.3, 0.5),
              ),
            ],
            { name: `Floating stat ${i + 1}`, transform: { position: vec3(-1.6 + i * 1.6, 1.9 + (i % 2) * 0.25, -3.2), rotation: vec3(0, (1 - i) * 8, 0) } },
          );
        }),
      ),
  },
  {
    // Build (~1.0s): the single screen rises out of the set like a backdrop
    // plate rather than the flat scale-pop it used to do.
    id: "virtual-screen",
    name: "Virtual Screen",
    category: "utility",
    create: () => {
      const screen = createVideoFeedNode({
        label: "AR SCREEN",
        transform: { position: vec3(0, 1.8, -3.2), scale: vec3(1.4, 1.4, 1.4) },
      });
      screen.animation = backdropAnim(0, 1.0);
      return markSetNodesAsAr([screen]);
    },
  },
];
