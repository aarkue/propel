import { useEffect, useMemo, useState } from "react";
import { Button } from "@r4pm/components/ui";
import {
  OcelTypeGraph,
  type OcelTypeGraphEdge,
  type OcelTypeGraphNode,
  type OcelTypeGraphProps,
} from "./OcelTypeGraph";
import { TypeScopeSelector } from "./TypeScopeSelector";

export interface OcelTypeGraphViewerProps extends Omit<OcelTypeGraphProps, "visibleNodeIds"> {
  /** Above this many types, initial scope auto-limits to the top-N by count. Default 25. */
  autoScopeLimit?: number;
}

/** Merge parallel qualified edges between the same (source, target) pair, dropping the qualifier label. */
function collapseByPair(edges: OcelTypeGraphEdge[]): OcelTypeGraphEdge[] {
  const byPair = new Map<string, OcelTypeGraphEdge>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (!byPair.has(key)) byPair.set(key, { id: key, source: e.source, target: e.target, kind: e.kind });
  }
  return [...byPair.values()];
}

/** Initial scope: all types when small, else the top-N by count so a large graph doesn't explode. */
function computeAuto(nodes: OcelTypeGraphNode[], limit: number): Set<string> {
  if (nodes.length <= limit) return new Set(nodes.map((n) => n.id));
  return new Set(
    [...nodes]
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, limit)
      .map((n) => n.id),
  );
}

/** Batteries-included OCEL type-graph viewer: `OcelTypeGraph` + `TypeScopeSelector` with internal scope state and reset. */
export function OcelTypeGraphViewer({
  nodes,
  edges,
  autoScopeLimit = 25,
  colorOf,
  ...graphProps
}: OcelTypeGraphViewerProps) {
  const sig = useMemo(
    () =>
      nodes
        .map((n) => n.id)
        .sort()
        .join(","),
    [nodes],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute only when the node SET changes.
  const auto = useMemo(() => computeAuto(nodes, autoScopeLimit), [sig, autoScopeLimit]);
  const [scope, setScope] = useState<Set<string>>(auto);
  // Reset scope to auto when the underlying node set changes (e.g. a new OCEL loads).
  useEffect(() => setScope(auto), [auto]);

  const items = useMemo(
    () => nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, count: n.count })),
    [nodes],
  );

  const isAuto = scope.size === auto.size && [...scope].every((id) => auto.has(id));
  const large = nodes.length > autoScopeLimit;

  const [collapseQualifiers, setCollapseQualifiers] = useState(false);
  const displayEdges = useMemo(
    () => (collapseQualifiers ? collapseByPair(edges) : edges),
    [collapseQualifiers, edges],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <TypeScopeSelector
          items={items}
          value={scope}
          onChange={setScope}
          onResetAuto={() => setScope(auto)}
          isAuto={isAuto}
          colorOf={colorOf}
        />
        <Button
          size="1"
          variant={collapseQualifiers ? "solid" : "soft"}
          onClick={() => setCollapseQualifiers((v) => !v)}
          title="Merge parallel qualified edges between the same types into one arc"
        >
          Collapse qualifiers
        </Button>
        {large && isAuto && (
          <span style={{ fontSize: 11, color: "var(--gray-10)" }}>
            showing top {autoScopeLimit} of {nodes.length} — adjust scope
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <OcelTypeGraph
          nodes={nodes}
          edges={displayEdges}
          visibleNodeIds={scope}
          colorOf={colorOf}
          {...graphProps}
        />
      </div>
    </div>
  );
}
