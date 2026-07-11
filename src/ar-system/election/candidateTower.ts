import {
  createGroupNode,
  createPrimitiveNode,
  createText3dNode,
  vec3,
} from "@/document/factory";
import type { ARAnimation, SetNode, Vec3 } from "@/document/types";
import { defaultAnimationForPreset } from "@/ar-engine/arMotionEngine";

export interface CandidateTowerOptions {
  index: number;
  name: string;
  party: string;
  partyColor: string;
  votes: string;
  percentage: string;
  pct: string;
  leading: boolean;
  rank: number;
  position?: Vec3;
}

function structuralAnim(delay: number): ARAnimation {
  return { preset: "wipe", duration: 0.6, delay, easing: "expo.out", direction: "bottom" };
}

function popAnim(delay: number): ARAnimation {
  return { preset: "pop", duration: 0.55, delay, easing: "back.out(1.6)", direction: "bottom", scaleFrom: 0.72 };
}

function countUpAnim(delay: number): ARAnimation {
  return { preset: "count-up", duration: 0.8, delay, easing: "power3.out", direction: "none", countUp: true };
}

function heroPulseAnim(delay: number): ARAnimation {
  return { preset: "loop-pulse", duration: 0.6, delay, easing: "back.out(1.6)", direction: "none", loopPeriod: 1.6, loopScale: 0.05 };
}

function barGrowAnim(delay: number): ARAnimation {
  return { preset: "bar-grow", duration: 1.0, delay, easing: "power2.out", direction: "top" };
}

/**
 * Single 3D candidate result tower — data-bound to election.candidates.N.*
 */
export function createCandidateTower(opts: CandidateTowerOptions): SetNode {
  const i = opts.index;
  const pos = opts.position ?? vec3(0, 0, 0);
  const barHeight = Math.max(0.1, (parseFloat(opts.percentage) || 0) / 100 * 1.2);
  const delay = 0.1 + i * 0.12;

  const base = createPrimitiveNode("box", {
    name: `Tower ${i + 1} Base`,
    transform: { position: vec3(pos.x, pos.y + 0.05, pos.z - 0.1), scale: vec3(1.1, 0.08, 0.8) },
    material: { color: "#1a1a2e", metalness: 0.3, roughness: 0.7, opacity: 0.95 },
  });
  base.animation = structuralAnim(delay);

  const bar = createPrimitiveNode("box", {
    name: `Tower ${i + 1} Bar`,
    transform: {
      position: vec3(pos.x - 0.35, pos.y + barHeight / 2, pos.z),
      scale: vec3(0.15, barHeight, 0.15),
    },
    material: { color: opts.partyColor, metalness: 0.4, roughness: 0.5, opacity: 1 },
  });
  bar.animation = barGrowAnim(delay + 0.2);
  bar.bindings = [{ targetPath: "material.color", source: `election.candidates.${i}.partyColor`, fallback: "#3366cc" }];

  const header = createPrimitiveNode("box", {
    name: `Tower ${i + 1} Header`,
    transform: { position: vec3(pos.x, pos.y + 1.35, pos.z), scale: vec3(1.0, 0.12, 0.05) },
    material: { color: opts.partyColor, metalness: 0.2, roughness: 0.6, opacity: 1 },
  });
  header.animation = structuralAnim(delay + 0.05);

  const nameNode = createText3dNode({
    name: `Tower ${i + 1} Name`,
    text: opts.name,
    fontSize: 0.14,
    color: "#ffffff",
    transform: { position: vec3(pos.x - 0.4, pos.y + 1.1, pos.z + 0.02) },
  });
  nameNode.animation = popAnim(delay + 0.3);
  nameNode.bindings = [{ targetPath: "text", source: `election.candidates.${i}.name`, fallback: "—" }];

  const partyNode = createText3dNode({
    name: `Tower ${i + 1} Party`,
    text: opts.party,
    fontSize: 0.09,
    color: "#cdd8f4",
    transform: { position: vec3(pos.x - 0.4, pos.y + 0.95, pos.z + 0.02) },
  });
  partyNode.animation = popAnim(delay + 0.38);
  partyNode.bindings = [{ targetPath: "text", source: `election.candidates.${i}.party`, fallback: "—" }];

  const votesNode = createText3dNode({
    name: `Tower ${i + 1} Votes`,
    text: opts.votes,
    fontSize: 0.11,
    color: "#9ed8ff",
    transform: { position: vec3(pos.x + 0.25, pos.y + 0.95, pos.z + 0.02) },
  });
  votesNode.animation = countUpAnim(delay + 0.45);
  votesNode.bindings = [{ targetPath: "text", source: `election.candidates.${i}.votes`, fallback: "0", format: "{value:,}" }];

  const pctNode = createText3dNode({
    name: `Tower ${i + 1} Pct`,
    text: opts.pct,
    fontSize: opts.leading ? 0.22 : 0.16,
    color: opts.leading ? "#ffffff" : "#b8c8e8",
    transform: { position: vec3(pos.x + 0.25, pos.y + 1.15, pos.z + 0.02) },
  });
  pctNode.animation = opts.leading ? heroPulseAnim(delay + 0.5) : popAnim(delay + 0.5);
  pctNode.bindings = [{ targetPath: "text", source: `election.candidates.${i}.pct`, fallback: "0%" }];

  const rankNode = createText3dNode({
    name: `Tower ${i + 1} Rank`,
    text: `#${opts.rank}`,
    fontSize: 0.08,
    color: "#8898b8",
    transform: { position: vec3(pos.x - 0.45, pos.y + 1.28, pos.z + 0.02) },
  });
  rankNode.animation = popAnim(delay + 0.25);
  rankNode.bindings = [{ targetPath: "text", source: `election.candidates.${i}.rank`, fallback: String(i + 1) }];

  const nodes: SetNode[] = [base, bar, header, nameNode, partyNode, votesNode, pctNode, rankNode];

  if (opts.leading) {
    const glow = createPrimitiveNode("plane", {
      name: `Tower ${i + 1} Leader Glow`,
      transform: { position: vec3(pos.x, pos.y + 0.5, pos.z - 0.15), scale: vec3(1.2, 1.5, 1) },
      material: { color: opts.partyColor, metalness: 0, roughness: 1, opacity: 0.15, emissive: opts.partyColor, emissiveIntensity: 0.3 },
    });
    glow.animation = defaultAnimationForPreset("fade");
    nodes.push(glow);
  }

  return createGroupNode(nodes, { name: `Candidate: ${opts.name}` });
}
