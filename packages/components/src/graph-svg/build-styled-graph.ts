import type { LegendGroup, StyledEdge, StyledGraph, StyledNode } from "./styled-graph";

/** Shared skeleton for per-domain `StyledGraph` builders: indexes nodes, maps to `StyledNode`/`StyledEdge`, drops edges with missing endpoints. */
export function buildStyledGraph<N, E>(
  nodes: N[],
  edges: E[],
  opts: {
    id: (n: N) => string;
    source: (e: E) => string;
    target: (e: E) => string;
    nodeToStyled: (n: N) => StyledNode;
    /** Build the styled edge from its endpoints; return null to drop it. */
    edgeToStyled: (e: E, src: N, tgt: N) => StyledEdge | null;
    padding: number;
    background?: string;
    legend?: LegendGroup[];
  },
): StyledGraph {
  const byId = new Map(nodes.map((n) => [opts.id(n), n]));
  const styledEdges: StyledEdge[] = [];
  for (const e of edges) {
    const src = byId.get(opts.source(e));
    const tgt = byId.get(opts.target(e));
    if (!src || !tgt) continue;
    const styled = opts.edgeToStyled(e, src, tgt);
    if (styled) styledEdges.push(styled);
  }
  return {
    padding: opts.padding,
    background: opts.background,
    nodes: nodes.map(opts.nodeToStyled),
    edges: styledEdges,
    legend: opts.legend ?? [],
  };
}
