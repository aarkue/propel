import type { OcelTypePairRelation, OcelTypeRelations, SlimLinkedOCELHandle } from "@r4pm/client";
import { OcelTypeGraphViewer, type OcelTypeGraphEdge, type OcelTypeGraphNode } from "@r4pm/components";
import { useMemo } from "react";
import { PiGraph } from "react-icons/pi";
import { backend } from "../backends";
import { defineVis } from "./define-vis";

const TYPE_RELATIONS = "app_bindings::ocel::get_ocel_type_relations" as const;
const MAX_QUALIFIERS_PER_PAIR = 8;

function relationEdges(relations: OcelTypePairRelation[], kind: "e2o" | "o2o"): OcelTypeGraphEdge[] {
  const edges: OcelTypeGraphEdge[] = [];
  for (const r of relations) {
    const pairId = `${kind}:${r.source_type}->${r.target_type}`;
    for (const q of r.qualifiers) {
      edges.push({
        id: `${pairId}:${q.qualifier}`,
        source: r.source_type,
        target: r.target_type,
        qualifier: q.qualifier,
        kind,
      });
    }
    if (r.other_qualifier_count > 0) {
      const omitted = r.distinct_qualifiers - r.qualifiers.length;
      edges.push({
        id: `${pairId}:other`,
        source: r.source_type,
        target: r.target_type,
        qualifier: `+${omitted} more`,
        kind,
      });
    }
  }
  return edges;
}

export const vis = defineVis({
  type: "ocelTypeGraph",
  name: "OCEL Type Graph",
  description: "Graphical representation of OCEL type relationships.",
  category: "ocel",
  icon: PiGraph,
  supports: ["SlimLinkedOCEL"],
  keywords: ["summary", "types", "graph", "type", "relationships"],
  order: 13,
  source: {
    binding: "process_mining::bindings::ocel_type_stats",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  // Panel-only relation overlay (E2O/O2O edges); the pipeline viewer renders bare type nodes.
  extraProps: async (ctx) => ({
    relations: (await backend.callBinding(TYPE_RELATIONS, {
      ocel: ctx.datasetId as SlimLinkedOCELHandle,
      max_qualifiers_per_pair: MAX_QUALIFIERS_PER_PAIR,
    })) as OcelTypeRelations,
  }),
  transform: (data): { nodes: OcelTypeGraphNode[] } => ({
    nodes: [
      ...Object.keys(data.event_type_counts).map((key) => ({
        id: key,
        count: data.event_type_counts[key],
        kind: "event" as const,
        label: key,
      })),
      ...Object.keys(data.object_type_counts).map((key) => ({
        id: key,
        count: data.object_type_counts[key],
        kind: "object" as const,
        label: key,
      })),
    ],
  }),
  component: ({
    data,
    relations,
  }: {
    data: { nodes: OcelTypeGraphNode[] };
    relations?: OcelTypeRelations;
  }) => {
    const edges = useMemo(
      () =>
        relations
          ? [
              ...relationEdges(relations.e2o_type_relations, "e2o"),
              ...relationEdges(relations.o2o_type_relations, "o2o"),
            ]
          : [],
      [relations],
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <OcelTypeGraphViewer nodes={data.nodes} edges={edges} />
      </div>
    );
  },
});
