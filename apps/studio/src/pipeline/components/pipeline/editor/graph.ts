import type { Edge } from "@xyflow/react";
import type { AppNode } from "./types";

/**
 * Compute one node's output value from its incoming edges' upstream results. Pure (no React / no
 * status side-effects) so the data-flow wiring is unit-testable; the hook layers status + toasts
 * on top. `runFunction` executes a backend binding (injected so tests can stub it).
 *
 * Semantics mirror the executor: tuple slots with no edge are `null`, array slots `undefined`,
 * object/function inputs keyed by the edge's `targetHandle`.
 */
export async function computeNodeOutput(
  node: AppNode,
  edges: Edge[],
  results: ReadonlyMap<string, unknown>,
  runFunction: (
    id: string,
    args: Record<string, unknown>,
    opts?: { outputName?: string },
  ) => Promise<unknown>,
  outputNameFor?: (nodeId: string) => string,
): Promise<unknown> {
  const incomingByHandle = (handle: string): Edge | undefined =>
    edges.find((e) => e.target === node.id && e.targetHandle === handle);
  const gatherInputs = (): Record<string, unknown> => {
    const inputs: Record<string, unknown> = {};
    for (const e of edges.filter((x) => x.target === node.id)) {
      if (e.targetHandle) inputs[e.targetHandle] = results.get(e.source);
    }
    return inputs;
  };

  switch (node.type) {
    case "primitive":
      return node.data.value;
    case "object":
      return node.data.selectedObject;
    case "struct": {
      const schema = node.data.schema;
      if (schema.oneOf) return node.data.value; // enum
      if (schema.prefixItems) {
        return schema.prefixItems.map((_, i) => {
          const e = incomingByHandle(`item-${i}`);
          return e ? results.get(e.source) : null;
        });
      }
      return gatherInputs(); // object
    }
    case "array": {
      const itemCount = node.data.itemCount || 0;
      return Array.from({ length: itemCount }, (_, i) => {
        const e = incomingByHandle(`item-${i}`);
        return e ? results.get(e.source) : undefined;
      });
    }
    case "function":
      return runFunction(
        node.data.functionMeta.id,
        gatherInputs(),
        outputNameFor ? { outputName: outputNameFor(node.id) } : undefined,
      );
    case "jsonView": {
      const e = edges.find((x) => x.target === node.id);
      return e ? results.get(e.source) : undefined;
    }
    case "artifact":
      return node.data.value;
    case "fileImport":
      return node.data.value;
    default:
      return undefined;
  }
}

/**
 * Topological order of pipeline nodes (Kahn's algorithm). Edges point source -> target, so the
 * returned order guarantees every node appears after all its inputs. Throws if the graph has a
 * cycle (i.e. not every node could be ordered). Edges referencing unknown nodes are ignored.
 */
export function topologicalOrder(nodeIds: string[], edges: Edge[]): string[] {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift() as string;
    order.push(u);
    for (const v of adjacency.get(u) ?? []) {
      const next = (inDegree.get(v) ?? 0) - 1;
      inDegree.set(v, next);
      if (next === 0) queue.push(v);
    }
  }

  if (order.length !== nodeIds.length) {
    throw new Error("Cycle detected in pipeline");
  }
  return order;
}
