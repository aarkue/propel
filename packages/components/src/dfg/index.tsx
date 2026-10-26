import { useCallback, useMemo } from "react";
import { FrequencyPicker } from "../inputs/FrequencyPicker";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import type { Dfg, OcDfg } from "../viz/types";
import { DfgGraph } from "./DfgGraph";
import { shadeHex } from "./util/colors";
import type { DfgMetric } from "./util/dfg-model";
import type { DfPerformance, OcelDfPerformance } from "./util/performance-types";
import { caseArcs, type DfgSource, ocActivityCounts, ocArcs } from "./viz-layout";

export type { Dfg, OcDfg } from "../viz/types";
export type { DfArcDuration, DfPerformance, OcelDfPerformance } from "./util/performance-types";

/** Extra props for the case-centric DFG viewer. `performance` enables the frequency/performance toggle and duration heatmap; omit to show frequency only. */
export interface DFGViewerProps extends ViewerProps<Dfg> {
  performance?: DfPerformance;
}

export function DFGViewer(props: DFGViewerProps) {
  const { data, performance } = props;
  const cfg = useViewerConfig(props);
  const [metric, setMetric] = useViewSetting<DfgMetric>("metric", "count");

  const actHex = useCallback((act: string) => cfg.colorOf?.("activity", act) ?? "#888888", [cfg.colorOf]);
  const actForeground = useCallback((act: string) => shadeHex(actHex(act), "foreground"), [actHex]);
  const source = useMemo<DfgSource>(() => ({ kind: "dfg", data }), [data]);
  const arcs = useMemo(() => caseArcs(data, performance), [data, performance]);

  return (
    <DfgGraph
      source={source}
      arcs={arcs}
      activityCounts={data.activities}
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
      viz={cfg.viz}
      routing={cfg.routing}
    />
  );
}

/** Extra props for the OC-DFG viewer. `performance` enables the frequency/performance toggle; omit to show frequency only. */
export interface OCDFGViewerProps extends ViewerProps<OcDfg> {
  performance?: OcelDfPerformance;
  /** Objects per object type, to rank the object-type chips. Without it they rank by arc count. */
  objectCounts?: Record<string, number>;
}

/** The summed count of an object type's arcs. */
function arcTotal(dfg: Dfg | undefined): number {
  if (!dfg) return 0;
  const sum = (counts: Record<string, number>) => Object.values(counts).reduce((s, c) => s + c, 0);
  return (
    dfg.directly_follows_relations.reduce((s, [, c]) => s + c, 0) +
    sum(dfg.start_activities) +
    sum(dfg.end_activities)
  );
}

export function OCDFGViewer(props: OCDFGViewerProps) {
  const { data, performance, objectCounts } = props;
  const cfg = useViewerConfig(props);
  const [metric, setMetric] = useViewSetting<DfgMetric>("metric", "count");
  const actHex = useCallback((act: string) => cfg.colorOf?.("activity", act) ?? "#888888", [cfg.colorOf]);
  const actForeground = useCallback((act: string) => shadeHex(actHex(act), "foreground"), [actHex]);
  const otColor = useCallback((ot: string) => cfg.colorOf?.("objectType", ot) ?? "#888888", [cfg.colorOf]);

  const objectTypes = useMemo(() => Object.keys(data.object_type_to_dfg).sort(), [data]);
  const rankOf = useMemo(() => {
    const ranks = new Map(
      objectTypes.map((ot) => [
        ot,
        objectCounts ? (objectCounts[ot] ?? 0) : arcTotal(data.object_type_to_dfg[ot]),
      ]),
    );
    return (ot: string) => ranks.get(ot) ?? 0;
  }, [objectTypes, objectCounts, data]);

  // JSON-safe array. Null = not yet chosen, fall back to the default (top-3 by rank).
  const [userSelectedTypes, setUserSelectedTypes] = useViewSetting<string[] | null>("selectedTypes", null);
  const selectedTypes = useMemo<Set<string>>(() => {
    if (userSelectedTypes !== null) return new Set(userSelectedTypes);
    const ranked = [...objectTypes].sort((a, b) => rankOf(b) - rankOf(a));
    return new Set(ranked.slice(0, 3));
  }, [userSelectedTypes, objectTypes, rankOf]);

  const updateSelectedTypes = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const current = userSelectedTypes !== null ? new Set(userSelectedTypes) : selectedTypes;
    const next = typeof updater === "function" ? updater(current) : updater;
    setUserSelectedTypes([...next]);
  };

  const types = useMemo(() => objectTypes.filter((t) => selectedTypes.has(t)), [objectTypes, selectedTypes]);
  const source = useMemo<DfgSource>(() => ({ kind: "ocdfg", data, types }), [data, types]);
  const arcs = useMemo(() => ocArcs(data, types, performance), [data, types, performance]);
  const activityCounts = useMemo(() => ocActivityCounts(data, types), [data, types]);
  const objectTotal = objectCounts ? types.reduce((s, t) => s + (objectCounts[t] ?? 0), 0) : undefined;

  const chips = (
    <div>
      <FrequencyPicker
        items={objectTypes.map((ot) => ({ key: ot, count: rankOf(ot) }))}
        value={selectedTypes}
        onChange={updateSelectedTypes}
        scope="objectType"
        colorOf={(_scope, key) => otColor(key)}
        emptyText="No object types"
      />
      {objectTotal !== undefined && (
        <div className="text-center text-(--gray-9) text-[10px] mb-4 -mt-2">
          <div>
            {objectTotal.toLocaleString("en")} object{objectTotal === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <DfgGraph
      source={source}
      arcs={arcs}
      activityCounts={activityCounts}
      metric={metric}
      setMetric={setMetric}
      hasPerformanceData={performance != null}
      activityColor={actHex}
      activityForeground={actForeground}
      typeColor={otColor}
      formatDuration={cfg.format?.duration}
      topRightExtra={chips}
      onSelect={cfg.onSelect}
      actions={cfg.actions}
      onElementContextMenu={cfg.onElementContextMenu}
      viz={cfg.viz}
      routing={cfg.routing}
    />
  );
}
