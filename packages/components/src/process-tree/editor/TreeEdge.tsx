import { type Edge, type EdgeProps, useReactFlow } from "@xyflow/react";
import type { TreeFlowNode } from "./Editor";
import { type TreeEdgeData, treeEdgePoints } from "./helpers/tree-layout";

/** A parent->child tree edge, from the nodes' current positions (centres) so it follows a drag. */
export default function TreeEdge({ source, target, data }: EdgeProps<Edge<TreeEdgeData>>) {
  const { getNode } = useReactFlow<TreeFlowNode>();
  const from = getNode(source);
  const to = getNode(target);
  if (!from || !to || !data) return null;
  const points = treeEdgePoints(
    { center: from.position, size: from.data.size },
    { center: to.position, size: to.data.size },
    data,
  );
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return <path className="pt-edge" d={d} fill="none" />;
}
