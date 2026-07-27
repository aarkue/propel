import { Text } from "@r4pm/components/ui";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { useEffect, useMemo, useRef, useState } from "react";
import { useViewSetting } from "../viewer/view-state";
import { shadeHex } from "../dfg/util/colors";
import { OCDeclareViz, type OCDeclareVizHandle } from "./OCDeclareViz";
import type { DeclareLayoutFn } from "./layout-util";
import type { StyledGraphRenderer } from "../graph-svg/styled-graph";
import { arcsToModel } from "./model";

// Re-export layout primitives so a host can supply a custom layout matching the routed-edge output.
export { createRustDeclareLayout } from "./rust-declare-layout";
export type { DeclareLayoutFn } from "./layout-util";
export { roundedPointsToSvgPath, snapEndpointsToNodeBorders, edgeLabelWidth } from "./layout-util";
export { ACT_NODE_WIDTH, ACT_NODE_HEIGHT } from "./ActivityNode";
export type { ConstraintEdgeData } from "./types";
export { OCDeclareViz } from "./OCDeclareViz";
export type { OCDeclareVizProps } from "./OCDeclareViz";
export { arcsToModel, toArcs } from "./model";
export type { DeclareEdge, DeclareEdgeRoute, DeclareFlowModel, DeclareNode, EdgeTemplate } from "./model";
export type {
  ActivityStatistics,
  BinnedEdgeDurationStats,
  DiscoveryOptions,
  SupportCtx,
} from "./edit/edit-context";

// Local view-models mirroring the generated @r4pm/client types.
export type ObjectTypeAssociation =
  | {
      object_type: string;
      type: "Simple";
    }
  | {
      first: string;
      second: string;
      reversed: boolean;
      type: "O2O";
    };

export interface OCDeclareArcLabel {
  each: ObjectTypeAssociation[];
  any: ObjectTypeAssociation[];
  all: ObjectTypeAssociation[];
}

export interface OCDeclareArc {
  from: string;
  to: string;
  arc_type: "AS" | "EF" | "EP" | "DF" | "DP";
  label: OCDeclareArcLabel;
  counts: [number | null, number | null];
}

/** OC-DECLARE viewer: renders object-centric DECLARE constraints as an interactive routed graph with filters, a layout-direction toggle and a legend. */
export function OCDeclareViewer(
  props: ViewerProps<OCDeclareArc[]> & {
    layoutOverride?: DeclareLayoutFn;
    renderSvg?: StyledGraphRenderer;
    /** Per-activity object-type involvement counts (min/max per event); drives the node dot strip. */
    activityInvolvements?: {
      [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
    };
    /** Per-activity event-occurrence counts from the OCEL; drives the frequency selector (sort by
     *  count + cutoff rail). Absent: the selector falls back to a name-sorted list. */
    eventTypeCounts?: Record<string, number>;
    /** Lossless projection onto a subset of activities (rust `project_oc_declare`-style): the removed
     *  activities' constraints are folded into the kept ones. Absent: a naive drop-touching filter. */
    onProjectActivities?: (arcs: OCDeclareArc[], activities: string[]) => Promise<OCDeclareArc[]>;
  },
) {
  const { data, layoutOverride, renderSvg, activityInvolvements, eventTypeCounts, onProjectActivities } =
    props;
  const cfg = useViewerConfig(props);
  const activityColor = (name: string, mode: "normal" | "foreground" | "light" = "normal") =>
    shadeHex(cfg.colorOf?.("activity", name) ?? "#888888", mode);
  const objectTypeColor = (name: string, mode: "normal" | "foreground" | "light" = "normal") =>
    shadeHex(cfg.colorOf?.("objectType", name) ?? "#888888", mode);
  const vizRef = useRef<OCDeclareVizHandle>(null);
  const [layoutDirection, setLayoutDirection] = useViewSetting<"RIGHT" | "DOWN">("layoutDirection", "RIGHT");
  const [showTextLabels, setShowTextLabels] = useViewSetting<boolean>("showTextLabels", false);
  // Persisted as arrays (JSON-safe); the viz filters work on the derived Sets.
  const [hiddenArcArr, setHiddenArcArr] = useViewSetting<string[]>("hiddenArcTypes", []);
  const [hiddenObjectArr, setHiddenObjectArr] = useViewSetting<string[]>("hiddenObjectTypes", []);
  const [hiddenActivityArr, setHiddenActivityArr] = useViewSetting<string[]>("hiddenActivities", []);
  const hiddenArcTypes = useMemo(() => new Set(hiddenArcArr), [hiddenArcArr]);
  const hiddenObjectTypes = useMemo(() => new Set(hiddenObjectArr), [hiddenObjectArr]);
  const hiddenActivities = useMemo(() => new Set(hiddenActivityArr), [hiddenActivityArr]);
  const setHiddenArcTypes = (s: Set<string>) => setHiddenArcArr([...s]);
  const setHiddenObjectTypes = (s: Set<string>) => setHiddenObjectArr([...s]);
  const setHiddenActivities = (s: Set<string>) => setHiddenActivityArr([...s]);

  // Activities present in the data (object endpoints `<init>`/`<exit>` are excluded from the filter).
  const allActivities = useMemo(() => {
    const s = new Set<string>();
    for (const a of data) for (const nm of [a.from, a.to]) if (!nm.startsWith("<")) s.add(nm);
    return [...s].sort();
  }, [data]);

  // Project onto the kept activities when some are hidden: the injected `onProjectActivities` folds
  // the removed activities' constraints into the survivors (lossless); absent, drop touching arcs.
  const [projected, setProjected] = useState<OCDeclareArc[] | null>(null);
  useEffect(() => {
    if (hiddenActivities.size === 0) {
      setProjected(null);
      return;
    }
    const kept = allActivities.filter((a) => !hiddenActivities.has(a));
    if (onProjectActivities) {
      let cancelled = false;
      // Synthetic endpoints (<init>/<exit>) are never user-hideable; keep them in the target set so a
      // projection that drops arcs with an out-of-set endpoint doesn't delete their arcs.
      const synthetic = new Set<string>();
      for (const a of data) for (const nm of [a.from, a.to]) if (nm.startsWith("<")) synthetic.add(nm);
      onProjectActivities(data, [...kept, ...synthetic])
        .then((r) => !cancelled && setProjected(r))
        .catch(() => !cancelled && setProjected(null));
      return () => {
        cancelled = true;
      };
    }
    setProjected(
      data.filter(
        (a) =>
          (a.from.startsWith("<") || !hiddenActivities.has(a.from)) &&
          (a.to.startsWith("<") || !hiddenActivities.has(a.to)),
      ),
    );
  }, [data, hiddenActivities, allActivities, onProjectActivities]);
  const effectiveData = projected ?? data;

  // One model for the viz (EF/EP collapse is applied there as a display-only transform).
  const model = useMemo(() => arcsToModel(effectiveData), [effectiveData]);

  // Root sizes inline so it fills its container; all chrome (direction/annotation toggles, filters,
  // legend) is the viz's own shared ControlsCard, driven here as controlled + view-persisted state.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 200 }}>
      {effectiveData.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <Text size="2" color="gray">
            No constraints discovered.
          </Text>
        </div>
      ) : (
        <OCDeclareViz
          ref={vizRef}
          value={model}
          activityColor={activityColor}
          objectTypeColor={objectTypeColor}
          hiddenArcTypes={hiddenArcTypes}
          onHiddenArcTypesChange={setHiddenArcTypes}
          hiddenObjectTypes={hiddenObjectTypes}
          onHiddenObjectTypesChange={setHiddenObjectTypes}
          activities={allActivities}
          hiddenActivities={hiddenActivities}
          onHiddenActivitiesChange={setHiddenActivities}
          direction={layoutDirection}
          onDirectionChange={setLayoutDirection}
          showTextLabels={showTextLabels}
          onShowTextLabelsChange={setShowTextLabels}
          arcsCount={data.length}
          activityInvolvements={activityInvolvements}
          eventTypeCounts={eventTypeCounts}
          layoutOverride={layoutOverride ?? cfg.layout?.declare}
          renderSvg={renderSvg ?? cfg.layout?.renderSvg}
        />
      )}
    </div>
  );
}
