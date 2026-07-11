import type { ARAnimation, Project, SetNode } from "@/document/types";
import { defaultAnimationForPreset } from "./arMotionEngine";
import { flattenArSetNodes } from "./nodeUtils";

const DEFAULT_IN: ARAnimation = { preset: "pop", duration: 0.55, delay: 0.08, easing: "back.out(1.6)", direction: "bottom" };
const DEFAULT_PLATE: ARAnimation = { preset: "slide", duration: 0.85, delay: 0, easing: "power4.out", direction: "bottom" };
const DEFAULT_IMAGE: ARAnimation = { preset: "scale", duration: 0.5, delay: 0.1, easing: "power3.out", direction: "bottom" };

function defaultAnimationFor(node: SetNode): ARAnimation {
  if (node.kind === "text3d") {
    const isVerse = node.bindings?.some((b) => b.source === "event.verseText" || b.source === "event.verseRef");
    if (isVerse) {
      return { preset: "fade", duration: 0.7, delay: 0.25, easing: "power2.out", direction: "bottom", fade: true };
    }
    return { ...DEFAULT_IN };
  }
  if (node.kind === "primitive") {
    if (node.bindings?.some((b) => b.targetPath === "textureUrl")) return { ...DEFAULT_IMAGE };
    return node.shape === "plane" ? { ...DEFAULT_PLATE } : { ...DEFAULT_PLATE, duration: 0.7 };
  }
  if (node.kind === "videofeed") return { ...DEFAULT_PLATE };
  return { preset: "fade", duration: 0.5, delay: 0, easing: "power2.out", direction: "bottom" };
}

function shouldAnimate(node: SetNode): boolean {
  if (node.kind === "camera" || node.kind === "light") return false;
  if (!node.visible) return false;
  return node.role === "ar";
}

/** Merge preset-specific knobs (fade, scaleFrom, countUp, …) into an existing
 * animation without overwriting authored timing or direction. Idempotent. */
export function upgradeArAnimation(anim: ARAnimation): ARAnimation {
  if (anim.preset === "none") return anim;
  const defaults = defaultAnimationForPreset(anim.preset);
  return {
    ...defaults,
    ...anim,
    fade: anim.fade ?? defaults.fade,
    scaleFrom: anim.scaleFrom ?? defaults.scaleFrom,
    distance: anim.distance ?? defaults.distance,
    outDelay: anim.outDelay ?? defaults.outDelay,
    outDuration: anim.outDuration ?? defaults.outDuration,
    outEasing: anim.outEasing ?? defaults.outEasing,
    countUp: anim.countUp ?? defaults.countUp,
    loopPeriod: anim.loopPeriod ?? defaults.loopPeriod,
    loopScale: anim.loopScale ?? defaults.loopScale,
  };
}

function upgradeNode(node: SetNode): SetNode {
  if (node.kind === "group") {
    return { ...node, children: node.children.map(upgradeNode) };
  }
  if (!shouldAnimate(node)) return node;
  const animation =
    node.animation && node.animation.preset !== "none"
      ? upgradeArAnimation(node.animation)
      : defaultAnimationFor(node);
  return { ...node, animation };
}

/** Silent migration for saved scenes — upgrades every AR node's animation spec. */
export function upgradeProjectArAnimations(project: Project): Project {
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.props.kind !== "set3d") return layer;
        return { ...layer, props: { ...layer.props, nodes: layer.props.nodes.map(upgradeNode) } };
      }),
    })),
  };
}

function prepareNode(node: SetNode): SetNode {
  if (node.kind === "group") {
    return { ...node, children: node.children.map(prepareNode) };
  }
  if (!shouldAnimate(node)) return node;
  const animation =
    node.animation && node.animation.preset !== "none"
      ? upgradeArAnimation(node.animation)
      : defaultAnimationFor(node);
  return { ...node, animation, onAir: true };
}

/** Assign entrance animations to every visible AR node missing one — game-ready prep. */
export function prepareArNodesForAir(nodes: SetNode[]): SetNode[] {
  return nodes.map(prepareNode);
}

export function hasVerseBindings(nodes: SetNode[]): boolean {
  return flattenArSetNodes(nodes).some((node) =>
    node.bindings?.some((b) => b.source === "event.verseText" || b.source === "event.verseRef"),
  );
}

/** Longest authored transition window (ms) for OUT or IN rehearsal / verse swaps. */
export function maxTransitionDurationMs(nodes: SetNode[], phase: "in" | "out" = "out"): number {
  let max = 600;
  for (const node of flattenArSetNodes(nodes)) {
    if (!shouldAnimate(node) || !node.animation) continue;
    const dur = Math.max((phase === "out" ? node.animation.outDuration ?? node.animation.duration : node.animation.duration), 0.2) * 1000;
    const delay =
      phase === "in"
        ? node.animation.delay * 1000
        : (node.animation.outDelay ?? 0) * 1000;
    max = Math.max(max, dur + delay + 80);
  }
  return max;
}
