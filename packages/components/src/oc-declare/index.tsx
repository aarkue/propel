import { Text } from "@r4pm/components/ui";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { useEffect, useMemo, useRef, useState } from "react";
import { useViewSetting } from "../viewer/view-state";
import { shadeHex } from "../dfg/util/colors";
import { OCDeclareViz, type OCDeclareVizHandle } from "./OCDeclareViz";
import { arcsToModel } from "./model";
import {
  arcList,
  focusHidden,
  isProjected,
  OC_DECLARE_HIDDEN_ACTIVITIES_KEY,
  projectionTargets,
} from "./projection";

export { ACT_NODE_WIDTH, ACT_NODE_HEIGHT } from "./ActivityNode";
export type { ConstraintEdgeData } from "./types";
export { OCDeclareViz } from "./OCDeclareViz";
export type { OCDeclareVizProps } from "./OCDeclareViz";
export { arcsToModel, mergeArcs, modelArcs, nodeDisplayName, toArcs } from "./model";
export { DiscoveryForm, type DiscoveryFormProps } from "./edit/DiscoveryForm";
export { DISCOVERY_DEFAULTS, discoverySummary } from "./edit/discovery-summary";
export {
  fromModelFile,
  OC_DECLARE_FILE_EXTENSION,
  type OCDeclareModelFile,
  toModelFile,
} from "./model-file";
export {
  focusHidden,
  isProjected,
  OC_DECLARE_HIDDEN_ACTIVITIES_KEY,
  projectionTargets,
  visibleArcCount,
} from "./projection";
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

/** OC-DECLARE viewer: renders object-centric DECLARE constraints as an interactive routed graph with filters, a layout-direction toggle and a legend. Laid out and exported by rust4pm through `ViewerConfig.viz`. */
export function OCDeclareViewer(
  props: ViewerProps<OCDeclareArc[]> & {
    /** Per-activity object-type involvement counts (min/max per event); drives the node dot strip. */
    activityInvolvements?: {
      [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
    };
    /** Per-activity event-occurrence counts from the OCEL; drives the frequency selector (sort by
     *  count + cutoff rail). Absent: the selector falls back to a name-sorted list. */
    eventTypeCounts?: Record<string, number>;
    /** Lossless projection onto a subset of activities (rust4pm's `project_oc_arcs`): the removed
     *  activities' constraints are folded into the kept ones. Absent: a naive drop-touching filter. */
    onProjectActivities?: (arcs: OCDeclareArc[], activities: string[]) => Promise<OCDeclareArc[]>;
    /** Objects per object type from the OCEL, to sort the side panel's object-type picker. */
    objectTypeCounts?: Record<string, number>;
    /** Default true. False leaves the activity picker out of the side panel, for a host that
     *  offers its own (it writes the same `hiddenActivities` view setting). */
    activityPicker?: boolean;
  },
) {
  const { activityInvolvements, eventTypeCounts, objectTypeCounts, activityPicker, onProjectActivities } =
    props;
  const data = useMemo(() => arcList(props.data), [props.data]);
  const cfg = useViewerConfig(props);
  const activityColor = (name: string, mode: "normal" | "foreground" | "light" | "surface" = "normal") =>
    shadeHex(cfg.colorOf?.("activity", name) ?? "#888888", mode);
  const objectTypeColor = (name: string, mode: "normal" | "foreground" | "light" | "surface" = "normal") =>
    shadeHex(cfg.colorOf?.("objectType", name) ?? "#888888", mode);
  const vizRef = useRef<OCDeclareVizHandle>(null);
  const [layoutDirection, setLayoutDirection] = useViewSetting<"RIGHT" | "DOWN">("layoutDirection", "RIGHT");
  const [showTextLabels, setShowTextLabels] = useViewSetting<boolean>("showTextLabels", false);
  // Persisted as arrays (JSON-safe); the viz filters work on the derived Sets.
  const [hiddenArcArr, setHiddenArcArr] = useViewSetting<string[]>("hiddenArcTypes", []);
  const [hiddenObjectArr, setHiddenObjectArr] = useViewSetting<string[]>("hiddenObjectTypes", []);
  const [hiddenActivityArr, setHiddenActivityArr] = useViewSetting<string[]>(
    OC_DECLARE_HIDDEN_ACTIVITIES_KEY,
    [],
  );
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
    if (!isProjected(data, hiddenActivities)) {
      setProjected(null);
      return;
    }
    if (onProjectActivities) {
      let cancelled = false;
      onProjectActivities(data, projectionTargets(data, hiddenActivities))
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
  }, [data, hiddenActivities, onProjectActivities]);
  const effectiveData = projected ?? data;

  // One model for the viz, which merges mirrored EF/EP arcs for display.
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
          onHideActivity={(a) => setHiddenActivities(new Set([...hiddenActivities, a]))}
          onFocusActivity={(a) => setHiddenActivities(new Set(focusHidden(data, a)))}
          direction={layoutDirection}
          onDirectionChange={setLayoutDirection}
          showTextLabels={showTextLabels}
          onShowTextLabelsChange={setShowTextLabels}
          activityInvolvements={activityInvolvements}
          eventTypeCounts={eventTypeCounts}
          objectTypeCounts={objectTypeCounts}
          activityPicker={activityPicker}
          viz={cfg.viz}
        />
      )}
    </div>
  );
}
