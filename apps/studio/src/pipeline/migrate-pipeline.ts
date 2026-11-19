import type { FunctionMeta } from "@r4pm/client";
import type { Edge } from "@xyflow/react";
import { RENAMED_ARGS } from "../persistence/manifest";
import type { AppNode } from "./components/pipeline/editor/types";

/**
 * A pipeline with its function steps on the current bindings. Each step stores the metadata of its
 * binding from when it was added, which can lack newer details (e.g., that a result is an SVG), so
 * it takes the current one. Steps saved by v0.4.1 also move to the new ids, which lost their module
 * path, and the edges into them to the renamed arguments. Steps of bindings that no longer exist
 * stay as they are. Returns null when nothing needed a change.
 */
export function migratePipeline(
  nodes: AppNode[],
  edges: Edge[],
  metas: FunctionMeta[],
): { nodes: AppNode[]; edges: Edge[] } | null {
  const byId = new Map(metas.map((m) => [m.id, m]));
  const moved = new Set<string>();
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== "function") return n;
    const id = n.data.functionMeta.id;
    let meta = byId.get(id);
    if (!meta) {
      const parts = id.split("::");
      meta = byId.get(`${parts[0]}::${parts[parts.length - 1]}`);
      if (meta) moved.add(n.id);
    }
    // Compared by reference: once refreshed, a step holds the very object `metas` holds.
    if (!meta || meta === n.data.functionMeta) return n;
    changed = true;
    return { ...n, data: { ...n.data, functionMeta: meta } } as AppNode;
  });
  if (!changed) return null;
  return {
    nodes: next,
    edges: edges.map((e) =>
      moved.has(e.target) && e.targetHandle && RENAMED_ARGS[e.targetHandle]
        ? { ...e, targetHandle: RENAMED_ARGS[e.targetHandle] }
        : e,
    ),
  };
}
