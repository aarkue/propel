import { useCallback, useMemo, useState } from "react";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { shadeHex } from "./util/colors";
import { type DfgArc, type DfgMetric, DFG_END_ID, DFG_START_ID } from "./util/dfg-model";
import type { DfArcDuration, DfPerformance, OcelDfPerformance } from "./util/performance-types";
import { DfgGraph, type DfgLayoutFn } from "./DfgGraph";
import { FrequencyPicker } from "../inputs/FrequencyPicker";
import type { StyledGraphRenderer } from "../graph-svg/styled-graph";

export type { DfgLayoutFn } from "./DfgGraph";

/** Local view-model. Kept explicit so the viewer has no `@r4pm/client` dependency. */
export interface DirectlyFollowsGraph {
  activities: Record<string, number>;
  directly_follows_relations: Array<[[string, string], number]>;
  start_activities: Record<string, number>;
  end_activities: Record<string, number>;
}

/** Object-centric DFG: one `DirectlyFollowsGraph` per object type. Mirrors the
 *  generated `@r4pm/client` `OCDirectlyFollowsGraph` shape. */
export interface OCDirectlyFollowsGraph {
  object_type_to_dfg: Record<string, DirectlyFollowsGraph>;
  /** Object-instance count per type */
  object_counts: Record<string, number>;
}

function buildCaseDfg(
  dfg: DirectlyFollowsGraph,
  performance?: DfPerformance,
): { activityCounts: Record<string, number>; arcs: DfgArc[] } {
  const activityCounts: Record<string, number> = { ...dfg.activities };
  const arcs: DfgArc[] = [];
  const color = "#9ca3af";

  const perfLookup = new Map<string, DfArcDuration>();
  if (performance) {
    for (const arc of performance.arcs) {
      perfLookup.set(`${arc.source}\u0000${arc.target}`, arc);
    }
  }

  for (const [pair, count] of dfg.directly_follows_relations) {
    const [from, to] = pair;
    const perf = perfLookup.get(`${from}\u0000${to}`);
    arcs.push({
      key: `${from}\u0000${to}`,
      from,
      to,
      count,
      color,
      title: `${from} → ${to} (${count.toLocaleString("en")})`,
      duration: perf
        ? {
            mean_ms: perf.mean_ms,
            median_ms: perf.median_ms,
            p90_ms: perf.p90_ms,
            min_ms: perf.min_ms,
            max_ms: perf.max_ms,
          }
        : undefined,
    });
  }

  let startTotal = 0;
  for (const [act, count] of Object.entries(dfg.start_activities)) {
    startTotal += count;
    arcs.push({
      key: `${DFG_START_ID}\u0000${act}`,
      from: DFG_START_ID,
      to: act,
      count,
      color,
      title: `start → ${act} (${count.toLocaleString("en")})`,
    });
  }
  let endTotal = 0;
  for (const [act, count] of Object.entries(dfg.end_activities)) {
    endTotal += count;
    arcs.push({
      key: `${act}\u0000${DFG_END_ID}`,
      from: act,
      to: DFG_END_ID,
      count,
      color,
      title: `${act} → end (${count.toLocaleString("en")})`,
    });
  }
  if (startTotal > 0) activityCounts[DFG_START_ID] = startTotal;
  if (endTotal > 0) activityCounts[DFG_END_ID] = endTotal;
  return { activityCounts, arcs };
}

/** Extra props for the case-centric DFG viewer. `performance` enables the frequency/performance toggle and duration heatmap; omit to show frequency only. */
export interface DFGViewerProps extends ViewerProps<DirectlyFollowsGraph> {
  performance?: DfPerformance;
  /** Draw the exact on-screen graph through a host-supplied renderer (typically the
   *  `export_graph_svg` Rust binding) instead of the built-in JS drawer. */
  renderSvg?: StyledGraphRenderer;
  /** Replace the default Rust layout (e.g. with a host-supplied one). */
  layoutOverride?: DfgLayoutFn;
}

export function DFGViewer(props: DFGViewerProps) {
  const { data, performance, renderSvg, layoutOverride } = props;
  const cfg = useViewerConfig(props);
  const [metric, setMetric] = useState<DfgMetric>("count");

  // colorOf is always defined (useViewerConfig falls back to the shared deterministic resolver);
  // node fill and text derive from it. Edges stay neutral gray in frequency mode and only take
  // color from the duration heatmap in performance mode.
  const actHex = useCallback((act: string) => cfg.colorOf?.("activity", act) ?? "#888888", [cfg.colorOf]);
  const actForeground = useCallback((act: string) => shadeHex(actHex(act), "foreground"), [actHex]);
  const { activityCounts, arcs } = useMemo(() => buildCaseDfg(data, performance), [data, performance]);

  return (
    <DfgGraph
      activityCounts={activityCounts}
      arcs={arcs}
      metric={metric}
      setMetric={setMetric}
      hasPerformanceData={performance != null}
      heatmap
      activityColor={actHex}
      activityForeground={actForeground}
      formatDuration={cfg.format?.duration}
      onSelect={cfg.onSelect}
      actions={cfg.actions}
      onElementContextMenu={cfg.onElementContextMenu}
      renderSvg={renderSvg ?? cfg.layout?.renderSvg}
      layoutOverride={layoutOverride ?? cfg.layout?.dfg}
    />
  );
}

/** Extra props for the OC-DFG viewer. `performance` enables the frequency/performance toggle; omit to show frequency only. */
export interface OCDFGViewerProps extends ViewerProps<OCDirectlyFollowsGraph> {
  performance?: OcelDfPerformance;
  /** Draw the exact on-screen graph through a host-supplied renderer (typically the
   *  `export_graph_svg` Rust binding) instead of the built-in JS drawer. */
  renderSvg?: StyledGraphRenderer;
  /** Replace the default Rust layout (e.g. with a host-supplied one). */
  layoutOverride?: DfgLayoutFn;
}

export function OCDFGViewer(props: OCDFGViewerProps) {
  const { data, performance, renderSvg, layoutOverride } = props;
  const cfg = useViewerConfig(props);
  const [metric, setMetric] = useState<DfgMetric>("count");
  const actHex = useCallback((act: string) => cfg.colorOf?.("activity", act) ?? "#888888", [cfg.colorOf]);
  const actForeground = useCallback((act: string) => shadeHex(actHex(act), "foreground"), [actHex]);
  const otColor = useCallback((ot: string) => cfg.colorOf?.("objectType", ot) ?? "#888888", [cfg.colorOf]);

  const objectTypes = useMemo(() => Object.keys(data.object_type_to_dfg).sort(), [data]);

  // Object instance counts
  const objectCounts = data.object_counts;

  // Default: pre-select the 3 most frequent object types.
  const [userSelectedTypes, setUserSelectedTypes] = useState<Set<string> | null>(null);
  const selectedTypes = useMemo<Set<string>>(() => {
    if (userSelectedTypes !== null) return userSelectedTypes;
    if (objectTypes.length === 0) return new Set();
    const ranked = [...objectTypes].sort((a, b) => (objectCounts[b] ?? 0) - (objectCounts[a] ?? 0));
    return new Set(ranked.slice(0, 3));
  }, [userSelectedTypes, objectTypes, objectCounts]);

  const updateSelectedTypes = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setUserSelectedTypes((prev) => {
      const current = prev ?? selectedTypes;
      return typeof updater === "function" ? updater(current) : updater;
    });
  };

  const { activityCounts, arcs, objectCountTotal } = useMemo(() => {
    const perfLookup = new Map<string, DfArcDuration>();
    if (performance) {
      for (const [ot, otArcs] of Object.entries(performance.arcs_per_object_type)) {
        for (const arc of otArcs ?? []) {
          perfLookup.set(`${ot}\u0000${arc.source}\u0000${arc.target}`, arc);
        }
      }
    }
    const activityCounts: Record<string, number> = {};
    const arcs: DfgArc[] = [];
    let objectCountTotal = 0;
    let startTotal = 0;
    let endTotal = 0;
    for (const ot of selectedTypes) {
      const dfg = data.object_type_to_dfg[ot];
      if (!dfg) continue;
      objectCountTotal += objectCounts[ot] ?? 0;
      for (const [act, c] of Object.entries(dfg.activities)) {
        activityCounts[act] = (activityCounts[act] ?? 0) + (c ?? 0);
      }
      const color = otColor(ot);
      for (const [pair, count] of dfg.directly_follows_relations) {
        const [from, to] = pair;
        const perf = perfLookup.get(`${ot}\u0000${from}\u0000${to}`);
        arcs.push({
          key: `${ot}\u0000${from}\u0000${to}`,
          from,
          to,
          count,
          color,
          group: ot,
          title: `${ot}: ${from} → ${to} (${count.toLocaleString("en")})`,
          duration: perf
            ? {
                mean_ms: perf.mean_ms,
                median_ms: perf.median_ms,
                p90_ms: perf.p90_ms,
                min_ms: perf.min_ms,
                max_ms: perf.max_ms,
              }
            : undefined,
        });
      }
      for (const [act, count] of Object.entries(dfg.start_activities)) {
        startTotal += count;
        arcs.push({
          key: `${ot}\u0000${DFG_START_ID}\u0000${act}`,
          from: DFG_START_ID,
          to: act,
          count,
          color,
          group: ot,
          title: `${ot}: start → ${act} (${count.toLocaleString("en")})`,
        });
      }
      for (const [act, count] of Object.entries(dfg.end_activities)) {
        endTotal += count;
        arcs.push({
          key: `${ot}\u0000${act}\u0000${DFG_END_ID}`,
          from: act,
          to: DFG_END_ID,
          count,
          color,
          group: ot,
          title: `${ot}: ${act} → end (${count.toLocaleString("en")})`,
        });
      }
    }
    if (startTotal > 0) activityCounts[DFG_START_ID] = startTotal;
    if (endTotal > 0) activityCounts[DFG_END_ID] = endTotal;
    return { activityCounts, arcs, objectCountTotal };
  }, [data, performance, selectedTypes, objectCounts, otColor]);

  const legend = useMemo(
    () =>
      [...selectedTypes].sort().length > 0
        ? [
            {
              title: "Object types",
              items: [...selectedTypes].sort().map((ot) => ({ label: ot, color: otColor(ot) })),
            },
          ]
        : [],
    [selectedTypes, otColor],
  );

  const chips = (
    <div>
      <FrequencyPicker
        items={objectTypes.map((ot) => ({ key: ot, count: objectCounts[ot] ?? 0 }))}
        value={selectedTypes}
        onChange={updateSelectedTypes}
        scope="objectType"
        colorOf={(_scope, key) => otColor(key)}
        emptyText="No object types"
      />
      <div className="text-center text-(--gray-9) text-[10px] mb-4 -mt-2">
        <div>
          {objectCountTotal.toLocaleString("en")} object{objectCountTotal === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );

  return (
    <DfgGraph
      activityCounts={activityCounts}
      arcs={arcs}
      metric={metric}
      setMetric={setMetric}
      hasPerformanceData={performance != null}
      activityColor={actHex}
      activityForeground={actForeground}
      formatDuration={cfg.format?.duration}
      legend={legend}
      topRightExtra={chips}
      onSelect={cfg.onSelect}
      actions={cfg.actions}
      onElementContextMenu={cfg.onElementContextMenu}
      renderSvg={renderSvg ?? cfg.layout?.renderSvg}
      layoutOverride={layoutOverride ?? cfg.layout?.ocdfg}
    />
  );
}
