import { useMemo } from "react";
import { OptionMenu, Toolbar } from "../kit";
import { useViewSetting } from "../viewer/view-state";
import {
  OcelTypeGraph,
  type OcelTypeGraphEdge,
  type OcelTypeGraphNode,
  type OcelTypeGraphProps,
} from "./OcelTypeGraph";
import { TypeScopeSelector } from "./TypeScopeSelector";

export interface OcelTypeGraphViewerProps extends Omit<OcelTypeGraphProps, "visibleNodeIds"> {
  /** Initially shown object types, the ones with the most objects. Default 3. */
  autoObjectTypes?: number;
}

/** Merge parallel qualified edges between the same (source, target) pair, dropping the qualifier label. */
function collapseByPair(edges: OcelTypeGraphEdge[]): OcelTypeGraphEdge[] {
  const byPair = new Map<string, OcelTypeGraphEdge>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (!byPair.has(key)) byPair.set(key, { id: key, source: e.source, target: e.target });
  }
  return [...byPair.values()];
}

/** The `limit` object types with the most objects and the event types related to them. */
function computeAuto(nodes: OcelTypeGraphNode[], edges: OcelTypeGraphEdge[], limit: number): Set<string> {
  const objects = nodes.filter((n) => n.kind === "object");
  if (objects.length <= limit || edges.length === 0) return new Set(nodes.map((n) => n.id));
  const shown = new Set(
    [...objects]
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, limit)
      .map((n) => n.id),
  );
  const events = new Set(nodes.filter((n) => n.kind === "event").map((n) => n.id));
  for (const e of edges) if (events.has(e.source) && shown.has(e.target)) shown.add(e.source);
  return shown;
}

/** Batteries-included OCEL type-graph viewer: `OcelTypeGraph` + `TypeScopeSelector` with persisted scope and reset. */
export function OcelTypeGraphViewer({
  nodes,
  edges,
  autoObjectTypes = 3,
  colorOf,
  ...graphProps
}: OcelTypeGraphViewerProps) {
  const auto = useMemo(() => computeAuto(nodes, edges, autoObjectTypes), [nodes, edges, autoObjectTypes]);
  const [picked, setPicked] = useViewSetting<string[] | null>("types", null);
  // A selection saved for another OCEL matches no node here.
  const valid =
    picked && (picked.length === 0 || picked.some((id) => nodes.some((n) => n.id === id))) ? picked : null;
  const scope = useMemo(() => (valid ? new Set(valid) : auto), [valid, auto]);

  const items = useMemo(
    () => nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, count: n.count })),
    [nodes],
  );

  const isAuto = valid === null;
  const objectCount = nodes.filter((n) => n.kind === "object").length;
  const limited = isAuto && objectCount > autoObjectTypes;

  const [relations, setRelations] = useViewSetting<"qualified" | "merged">("relations", "qualified");
  const collapseQualifiers = relations === "merged";
  const displayEdges = useMemo(
    () => (collapseQualifiers ? collapseByPair(edges) : edges),
    [collapseQualifiers, edges],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <Toolbar
        end={
          limited && (
            <span style={{ fontSize: 12, color: "var(--gray-10)" }}>
              The {autoObjectTypes} of {objectCount} object types with the most objects, and their event types
            </span>
          )
        }
      >
        <TypeScopeSelector
          items={items}
          value={scope}
          onChange={(next) => setPicked([...next])}
          onResetAuto={() => setPicked(null)}
          isAuto={isAuto}
          colorOf={colorOf}
        />
        <OptionMenu
          label="Relations"
          value={relations}
          options={[
            { value: "qualified", label: "By qualifier", description: "One arc per qualifier, labelled" },
            { value: "merged", label: "Merged", description: "One arc per pair of types" },
          ]}
          onChange={setRelations}
        />
      </Toolbar>
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
