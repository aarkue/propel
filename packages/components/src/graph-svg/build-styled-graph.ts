import type { LegendGroup, StyledEdge, StyledGraph, StyledNode } from "./styled-graph";

/**
 * Shared skeleton for the per-domain `StyledGraph` builders (DFG, OC-DFG, OC-Declare, Petri): index
 * nodes by id, map each to a `StyledNode`, and walk edges into `StyledEdge`s (dropping any whose
 * endpoints are missing, or whose `edgeToStyled` returns null). Each domain supplies only its
 * `nodeToStyled` / `edgeToStyled` mappers and the frame metadata; all the shared plumbing lives here.
 */
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
