import { IconButton, Slider, Tooltip } from "@r4pm/components/ui";
import { FaArrowDown, FaArrowRight } from "react-icons/fa";
import { PiChartBar, PiMinus, PiPlus, PiTimer } from "react-icons/pi";
import { SlGraph } from "react-icons/sl";
import { type Option, Segmented } from "../kit";
import { type DfgCoverage, type DfgMetric, isPerformanceMetric } from "./util/dfg-model";

export interface DfgSettingsProps {
  metric: DfgMetric;
  onMetricChange: (m: DfgMetric) => void;
  edgeSlider: number;
  setEdgeSlider: (v: number | ((prev: number) => number)) => void;
  coverage: DfgCoverage;
  hasPerformanceData: boolean;
  /** Layout flow direction: "TB" (top-to-bottom) or "LR" (left-to-right). */
  direction: "TB" | "LR";
  onDirectionChange: (d: "TB" | "LR") => void;
  /** Hide the frequency/performance metric picker, for a view that labels arcs itself. */
  hideMetrics?: boolean;
}

const FREQ_METRICS: Option<DfgMetric>[] = [
  { value: "count", label: "#", description: "Count: how often the arc was taken" },
  { value: "pct_source", label: "%", description: "Share of the source activity's occurrences" },
];

const PERF_METRICS: Option<DfgMetric>[] = [
  { value: "mean", label: "Avg", description: "Mean time between the two activities" },
  { value: "median", label: "Med", description: "Median time between the two activities" },
  { value: "p90", label: "P90", description: "90th percentile of the time between the two activities" },
  { value: "min", label: "Min", description: "Shortest passage" },
  { value: "max", label: "Max", description: "Longest passage" },
];

const DIRECTIONS: Option<"TB" | "LR">[] = [
  { value: "TB", label: "Top-down layout", icon: <FaArrowDown /> },
  { value: "LR", label: "Left-to-right layout", icon: <FaArrowRight /> },
];

const MODES: Option<"freq" | "perf">[] = [
  { value: "freq", label: "Label arcs by frequency", icon: <PiChartBar size={14} /> },
  { value: "perf", label: "Label arcs by time", icon: <PiTimer size={14} /> },
];

export default function DfgSettings({
  metric,
  onMetricChange,
  edgeSlider,
  setEdgeSlider,
  coverage,
  hasPerformanceData,
  direction,
  onDirectionChange,
  hideMetrics,
}: DfgSettingsProps) {
  const max = Math.max(coverage.edges.sliderMax, 1);
  const isPerf = isPerformanceMetric(metric);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "4px 2px" }}
    >
      <Segmented
        value={direction}
        options={DIRECTIONS}
        onChange={onDirectionChange}
        compact
        iconOnly
        tooltipSide="left"
        aria-label="Layout direction"
      />
      <Divider />
      <Tooltip content="Arcs shown, most frequent first" side="left">
        <span style={{ color: "var(--gray-10)", display: "flex" }}>
          <SlGraph size={15} aria-label="Arcs" />
        </span>
      </Tooltip>
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        aria-label="More arcs"
        onClick={() => setEdgeSlider((e) => Math.min((typeof e === "number" ? e : 0) + 1, max))}
      >
        <PiPlus />
      </IconButton>
      <Slider
        size="2"
        orientation="vertical"
        min={0}
        max={max}
        step={1}
        value={[Math.min(edgeSlider, max)]}
        onValueChange={(v) => setEdgeSlider(v[0])}
        style={{ height: 112 }}
      />
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        aria-label="Fewer arcs"
        onClick={() => setEdgeSlider((e) => Math.max(typeof e === "number" ? e : 0, 1) - 1)}
      >
        <PiMinus />
      </IconButton>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1.25,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-12)" }}>
          {coverage.edges.shown} / {coverage.edges.total}
        </span>
        <span style={{ fontSize: 10, color: "var(--gray-10)" }}>{coverage.edges.pct}% of flow</span>
        <span style={{ fontSize: 10, color: "var(--gray-9)" }}>
          {coverage.activities.shown} / {coverage.activities.total} activities
        </span>
      </div>
      {!hideMetrics && (
        <>
          <Divider />
          {hasPerformanceData && (
            <Segmented
              value={isPerf ? "perf" : "freq"}
              options={MODES}
              onChange={(m) => {
                if (m === "perf" && !isPerf) onMetricChange("mean");
                if (m === "freq" && isPerf) onMetricChange("count");
              }}
              compact
              iconOnly
              tooltipSide="left"
              aria-label="Arc labels"
            />
          )}
          <Segmented
            value={metric}
            options={isPerf ? PERF_METRICS : FREQ_METRICS}
            onChange={onMetricChange}
            compact
            wrap
            tooltipSide="left"
            aria-label="Arc metric"
          />
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ alignSelf: "stretch", height: 1, margin: "0 6px", background: "var(--gray-a4)" }} />;
}
