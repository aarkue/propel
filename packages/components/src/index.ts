// Re-exported so consumers use `<Theme>` without importing `@r4pm/components/ui` directly.
export { Theme } from "@r4pm/components/ui";
// Presentation contract: ViewerProps/ViewerConfig + interactivity + the deterministic color
// utilities. Engine-agnostic; the registry/routing half lives in the host app.
export * from "./viewer/viewer-config";
export { shadeHex, softBadgeStyle, colorToHex } from "./dfg/util/colors";
// Plotly-backed viewers (DottedChart, CaseDuration, EventsPerTime, ObjectAttributeChanges,
// ActivityChart, ThemedPlot) live behind the `@r4pm/components/charts` subpath to keep
// react-plotly.js out of the core entry. Import them from "@r4pm/components/charts".
// Universal image/SVG export control (frame + useRegisterExport).
export * from "./viewer/export";
// Generic pure-draw SVG export: the `StyledGraph` type shared with the `export_graph_svg` Rust
// binding. Concrete per-viewer builders live alongside each viewer (e.g. `dfg/util/styled-graph.ts`).
export * from "./graph-svg/styled-graph";
// Shared async/loading/error/empty UI for viewers and panels.
export * from "./feedback";
export * from "./petri-net";
export * from "./object-centric-petri-net";
export * from "./petri-net-simulator";
export * from "./object-centric-petri-net-simulator";
export * from "./petri-net-workbench";
export * from "./object-centric-petri-net-workbench";
export * from "./log-editor";
export * from "./dfg/index";
export * from "./ocel-count-info";
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
  createRustDfgLayout,
  createRustOcdfgLayout,
  layoutGraph,
  type GraphLayout,
  type GraphNodeSpec,
  type LaidOutGraph,
  type LayoutTransport,
} from "./rust-layout";
export { createRustLayout } from "./rust-layout/bundle";
