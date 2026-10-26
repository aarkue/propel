import { type GraphRequest, layoutGraph, type Point, type VizTransport } from "../viz";
import type { DerivedEdge, EditorMapping, EditorNode } from "./model";
import { NODE_SIZE } from "./nodes/types";

/** Node boxes grow with their content (a Source node's column list, a mapping's summary lines), so
 *  these are estimates. The layout only needs them in the right ballpark to avoid overlap. */
function sizeOf(n: EditorNode) {
  return NODE_SIZE[n.op.type] ?? NODE_SIZE.filter;
}

/** The blueprint as a graphlay request. `ids[i]` is the row node or mapping behind graph node `i`.
 *  Mappings are nodes on the same canvas, so they are laid out in the same graph. */
export function blueprintLayoutRequest(
  nodes: EditorNode[],
  edges: DerivedEdge[],
  mappings: EditorMapping[] = [],
): { request: GraphRequest; ids: string[] } {
  const ids = [...nodes.map((n) => n.id), ...mappings.map((m) => m.id)];
  const sizes = [...nodes.map(sizeOf), ...mappings.map(() => NODE_SIZE.mapping)];
  const index = new Map(ids.map((id, i) => [id, i]));
  const graphEdges: GraphRequest["graph"]["edges"] = [];
  for (const e of edges) {
    const source = index.get(e.source);
    const target = index.get(e.target);
    if (source === undefined || target === undefined) continue;
    graphEdges.push({ source, target });
  }
  return {
    request: {
      graph: {
        nodes: sizes.map(({ width, height }) => ({ size: { width, height } })),
        edges: graphEdges,
      },
      // Edges are drawn as curves between the live handles, not along graphlay's routes, so the
      // layer gap leaves them room to bend.
      preset: "layered",
      options: { spacing: { layer_gap: 80, node_gap: 40 } },
    },
    ids,
  };
}

/** Top-left positions (React Flow's anchor) from graphlay's node centres. */
export async function layoutBlueprint(
  viz: VizTransport,
  nodes: EditorNode[],
  edges: DerivedEdge[],
  mappings: EditorMapping[] = [],
): Promise<Map<string, Point>> {
  const { request, ids } = blueprintLayoutRequest(nodes, edges, mappings);
  const layout = await layoutGraph(viz, request);
  return new Map(
    layout.nodes.map(({ center, size }, i) => [
      ids[i],
      { x: center.x - size.width / 2, y: center.y - size.height / 2 },
    ]),
  );
}

const COLUMN_STEP = 280;
const ROW_GAP = 40;

/** Without `viz`: one column per step from the sources. Sources stack in model order,
 *  every later column by the mean row of its inputs, so most edges run straight or fan out. */
export function gridBlueprintPositions(
  nodes: EditorNode[],
  edges: DerivedEdge[],
  mappings: EditorMapping[] = [],
): Map<string, Point> {
  const inputs = new Map<string, string[]>();
  for (const e of edges) inputs.set(e.target, [...(inputs.get(e.target) ?? []), e.source]);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    // A cycle (only possible in a hand-edited document) is cut where it closes.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...(inputs.get(id) ?? []).map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  const boxes = [
    ...nodes.map((n) => ({ id: n.id, height: sizeOf(n).height })),
    ...mappings.map((m) => ({ id: m.id, height: NODE_SIZE.mapping.height })),
  ];
  const columns: (typeof boxes)[] = [];
  for (const box of boxes) {
    const c = depthOf(box.id);
    columns[c] = [...(columns[c] ?? []), box];
  }
  const centerY = new Map<string, number>();
  const inputsY = (id: string) => {
    const ys = (inputs.get(id) ?? []).flatMap((s) => centerY.get(s) ?? []);
    return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : undefined;
  };
  const positions = new Map<string, Point>();
  columns.forEach((column, c) => {
    const wanted = new Map(column.map((b) => [b.id, inputsY(b.id)]));
    const sorted = [...column].sort(
      (a, b) => (wanted.get(a.id) ?? Number.MAX_VALUE) - (wanted.get(b.id) ?? Number.MAX_VALUE),
    );
    let free = 0;
    for (const { id, height } of sorted) {
      const want = wanted.get(id);
      const y = Math.max(free, want === undefined ? free : want - height / 2);
      positions.set(id, { x: c * COLUMN_STEP, y });
      centerY.set(id, y + height / 2);
      free = y + height + ROW_GAP;
    }
  });
  return positions;
}
