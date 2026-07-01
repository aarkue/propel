// Plotly-backed viewers, isolated behind the `@r4pm/components/charts` subpath so the core
// entry stays free of `react-plotly.js` (~1.3MB). Import these only when a chart is needed.
export { ThemedPlot } from "./themed-plot";
export * from "./dotted-chart";
export * from "./case-duration";
export * from "./events-per-time";
export * from "./object-attribute-changes";
export type { ObjectAttributeChanges, AttributeChange } from "./object-attribute-changes-data";
export * from "./activity-chart";
