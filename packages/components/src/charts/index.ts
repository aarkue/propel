// Plotly-backed viewers, isolated behind the `@r4pm/components/charts` subpath so the core
// entry stays free of `react-plotly.js` (~1.3MB). Import these only when a chart is needed.
export { ThemedPlot } from "./themed-plot";
export * from "./dotted-chart";
export * from "./case-duration";
export * from "./events-per-time";
export * from "./object-attribute-changes";
export type { ObjectAttributeChanges, AttributeChange } from "./object-attribute-changes-data";
export * from "./activity-chart";
export * from "./variant-time-profile";
export {
  type CaseSort,
  type CaseTimeCurve,
  type InMemoryVariant,
  inMemoryVariantTiming,
  matchVariant,
  type StepTimeStats,
  type VariantPageRequest,
  type VariantProfileRequest,
  type VariantSort,
  type VariantSummary,
  type VariantTimeProfile,
  type VariantTimingLoaders,
  type VariantTimingPage,
} from "./variant-time-profile-data";
export { type DottedChartCaseOrder, orderRows } from "./dotted-chart-rows";
