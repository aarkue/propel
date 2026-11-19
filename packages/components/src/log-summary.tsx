import type { StaticViewerProps } from "./viewer/viewer-config";
import { fmtInt, Metric, MetricRow } from "./kit";

/** Event-log summary counts. Local view-model; structurally assignable to/from the generated
 *  `@r4pm/client` `NumberOfTracesAndEvents`. */
export interface NumberOfTracesAndEvents {
  num_traces: number;
  num_events: number;
}

/** Event-log summary (trace + event counts), from the `get_log_info` binding. */
export function LogSummary({ data }: StaticViewerProps<NumberOfTracesAndEvents>) {
  const perCase = data.num_traces ? data.num_events / data.num_traces : 0;
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 120, padding: 16, overflow: "auto" }}>
      <MetricRow>
        <Metric label="Cases" value={fmtInt(data.num_traces)} />
        <Metric label="Events" value={fmtInt(data.num_events)} />
        <Metric label="Events per case" value={perCase.toFixed(1)} hint="on average" />
      </MetricRow>
    </div>
  );
}
