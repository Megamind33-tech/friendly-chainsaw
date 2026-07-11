import { newId } from "@/document/ids";
import type { SetNode, Vec3 } from "@/document/types";

/** Default spawn point — centered in the viewport, not buried at z=-3. */
export const AR_CENTER: Vec3 = { x: 0, y: 1.6, z: 0 };

function normalizeArDepth(z: number): number {
  if (z < -4) return z + 6.4;
  if (z < -1) return z + 3.2;
  return z;
}

function centerArNode(node: SetNode): SetNode {
  const positioned: SetNode = {
    ...node,
    transform: {
      ...node.transform,
      position: {
        ...node.transform.position,
        z: normalizeArDepth(node.transform.position.z),
      },
    },
  };
  if (positioned.kind === "group") {
    return { ...positioned, children: positioned.children.map(centerArNode) };
  }
  return positioned;
}

/** Pull legacy back-wall placements onto the centered AR plane. */
export function centerArNodes(nodes: SetNode[]): SetNode[] {
  return nodes.map(centerArNode);
}

export function isArSetNode(node: SetNode): boolean {
  return node.role === "ar";
}

export function flattenSetNodes(nodes: SetNode[]): SetNode[] {
  return nodes.flatMap((node) => (node.kind === "group" ? [node, ...flattenSetNodes(node.children)] : [node]));
}

export function flattenArSetNodes(nodes: SetNode[]): SetNode[] {
  return flattenSetNodes(nodes).filter(isArSetNode);
}

export function markSetNodeAsAr(node: SetNode): SetNode {
  node.role = "ar";
  if (node.kind === "group") node.children = node.children.map(markSetNodeAsAr);
  return node;
}

export function markSetNodesAsAr(nodes: SetNode[]): SetNode[] {
  return centerArNodes(nodes.map(markSetNodeAsAr));
}

export function cloneSetNode(node: SetNode): SetNode {
  const copy = JSON.parse(JSON.stringify(node)) as SetNode;
  const rewrite = (n: SetNode): SetNode => {
    n.id = newId();
    n.name = `${n.name} copy`;
    n.transform.position.x += 0.25;
    n.transform.position.y += 0.1;
    if (n.kind === "group") n.children = n.children.map(rewrite);
    return n;
  };
  return rewrite(copy);
}

export function removeSetNode(nodes: SetNode[], nodeId: string): SetNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => (node.kind === "group" ? { ...node, children: removeSetNode(node.children, nodeId) } : node));
}

export function moveSetNode(nodes: SetNode[], nodeId: string, direction: -1 | 1): SetNode[] {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index !== -1) {
    const next = [...nodes];
    const target = Math.max(0, Math.min(next.length - 1, index + direction));
    const [node] = next.splice(index, 1);
    next.splice(target, 0, node);
    return next;
  }
  return nodes.map((node) => (node.kind === "group" ? { ...node, children: moveSetNode(node.children, nodeId, direction) } : node));
}
