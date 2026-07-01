import type { ViewerProps } from "./viewer/viewer-config";
import { StatCards } from "./shared/StatCards";

/** Event-log summary counts. Local view-model; structurally assignable to/from the generated
 *  `@r4pm/client` `NumberOfTracesAndEvents`. */
export interface NumberOfTracesAndEvents {
  num_traces: number;
  num_events: number;
}

/** Event-log summary (trace + event counts), from the `get_log_info` binding. */
export function LogSummary({ data }: ViewerProps<NumberOfTracesAndEvents>) {
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 120, padding: 16, overflow: "auto" }}>
      <StatCards
        align="center"
        items={[
          { label: "Cases", value: data.num_traces },
          { label: "Events", value: data.num_events },
        ]}
      />
    </div>
  );
}
