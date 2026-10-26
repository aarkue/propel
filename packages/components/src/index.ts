// Re-exported so consumers use `<Theme>` without importing `@r4pm/components/ui` directly.
export { Theme } from "@r4pm/components/ui";
// Presentation contract: ViewerProps/ViewerConfig + interactivity + the deterministic color
// utilities. Engine-agnostic; the registry/routing half lives in the host app.
export * from "./viewer/viewer-config";
// Persisted viewer display settings: `useViewSetting` (drop-in for useState) + host `ViewStateProvider`.
export * from "./viewer/view-state";
export { shadeHex, softBadgeStyle, colorToHex, type ThemeColor } from "./dfg/util/colors";
// Plotly-backed viewers (DottedChart, CaseDuration, EventsPerTime, ObjectAttributeChanges,
// ActivityChart, ThemedPlot) live behind the `@r4pm/components/charts` subpath to keep
// react-plotly.js out of the core entry. Import them from "@r4pm/components/charts".
// Universal image/SVG export control (frame + useRegisterExport).
export * from "./viewer/export";
// Shared async/loading/error/empty UI for viewers and panels.
export * from "./feedback";
export * from "./petri-net";
export * from "./object-centric-petri-net";
export * from "./petri-net-simulator";
export * from "./object-centric-petri-net-simulator";
export * from "./petri-net-workbench";
export * from "./process-tree";
export * from "./process-tree-workbench";
export * from "./object-centric-petri-net-workbench";
export * from "./log-editor";
export * from "./dfg/index";
export * from "./ocel-count-info";
export * from "./attribute-value-stats";
export {
  OcelTypeGraph,
  type OcelTypeGraphEdge,
  type OcelTypeGraphNode,
  type OcelTypeGraphProps,
} from "./ocel-type-graph/OcelTypeGraph";
export * from "./ocel-type-graph/TypeScopeSelector";
export * from "./ocel-type-graph/OcelTypeGraphViewer";
export * from "./ocel-schema-path/OcelSchemaPath";
export * from "./log-summary";
export * from "./fitness";
export * from "./alignment-list";
export * from "./alignment-net";
export * from "./shared/alignment-types";
export * from "./log-variants";
export * from "./oc-declare/index";
export * from "./json-viewer";
export * from "./inputs/SelectionActions";
export * from "./inputs/FrequencyPicker";
export * from "./inputs/choosers";
export * from "./shared/RankedBarList";
export * from "./shared/StatCards";
// Curated: low-level SVG-layout constants + list/selection helpers stay internal (siblings import
// them via relative paths), so only the public components/types are part of the package surface.
export { ActivityChip, ActivitySequence } from "./shared/ActivitySequence";
export {
  ObjectCentricSequence,
  type ObjectCentricSequenceProps,
  type OcSequenceStep,
  type OcSequenceObject,
} from "./shared/ObjectCentricSequence";
export {
  TraceAlignmentStrip,
  buildTraceAlignmentSvg,
  type MoveKind,
  type ResolvedMove,
} from "./shared/TraceAlignmentStrip";
export { DeviationAlignmentStrip, buildDeviationAlignmentSvg } from "./shared/DeviationAlignmentStrip";
export { AlignmentStrip } from "./shared/AlignmentStrip";
export * from "./shared/CoverageBar";
export * from "./shared/LogMetadataCard";
export {
  layoutModel,
  modelLayoutRequest,
  rerouteModel,
  modelSvg,
  type VizTransport,
  type VizModel,
  type VizModels,
  type ModelLayout,
  type ModelLayoutRequest,
} from "./viz";
// Generic graphlay layout of caller-built graphs, for graphs no rust4pm model covers.
export {
  layoutGraph,
  rerouteGraph,
  layoutTree,
  type GraphRequest,
  type GraphNode,
  type GraphEdge,
  type TreeRequest,
  type Layout,
  type Placement,
  type EdgeRoute,
  type Point,
  type Size,
  type Rect,
} from "./viz";
