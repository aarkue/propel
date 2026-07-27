import type { Edge } from "@xyflow/react";
import { type ConstraintEdgeData, labelKey } from "./types";

type FlowEdge = Edge<ConstraintEdgeData>;

const keyOf = (arcType: string, source: string, target: string, lk: string) =>
  `${arcType}|${source}|${target}|${lk}`;

/** Render-layer collapse of complementary arc pairs (EF `A->B` + EP `B->A`, or DF/DP) with equal label
 *  into one both-ended `EFEP`/`DFDP` edge; keeps the forward edge's id, records both ids in `data.pair`. */
export function collapseFlowEdges(edges: FlowEdge[], enabled: boolean): FlowEdge[] {
  if (!enabled) return edges;

  const byKey = new Map<string, FlowEdge>();
  for (const e of edges) {
    const d = e.data;
    if (d) byKey.set(keyOf(d.arcType, e.source, e.target, labelKey(d.label)), e);
  }

  const consumed = new Set<string>();
  const out: FlowEdge[] = [];
  for (const e of edges) {
    if (consumed.has(e.id)) continue;
    const d = e.data;
    if (!d) {
      out.push(e);
      continue;
    }
    const lk = labelKey(d.label);

    if (d.arcType === "EF" || d.arcType === "DF") {
      const backType = d.arcType === "EF" ? "EP" : "DP";
      const back = byKey.get(keyOf(backType, e.target, e.source, lk));
      if (back && back.id !== e.id && !consumed.has(back.id)) {
        consumed.add(e.id);
        consumed.add(back.id);
        out.push({
          ...e,
          data: {
            ...d,
            arcType: d.arcType === "EF" ? "EFEP" : "DFDP",
            pair: { forward: e.id, backward: back.id },
            pairViolation: { forward: d.violation, backward: back.data?.violation },
          },
        });
        continue;
      }
    }

    // An EP/DP whose forward counterpart exists is emitted by that counterpart above; skip it here.
    if (d.arcType === "EP" || d.arcType === "DP") {
      const fwdType = d.arcType === "EP" ? "EF" : "DF";
      if (byKey.has(keyOf(fwdType, e.target, e.source, lk))) continue;
    }

    out.push(e);
  }
  return out;
}
