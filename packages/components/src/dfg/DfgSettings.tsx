import { Button, Slider } from "@r4pm/components/ui";
import { FaArrowDown, FaArrowRight, FaMinus, FaPlus } from "react-icons/fa";
import { PiChartBar, PiTimer } from "react-icons/pi";
import { SlGraph } from "react-icons/sl";
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
}

const FREQ_METRICS: { value: DfgMetric; label: string; title: string }[] = [
  { value: "count", label: "#", title: "Absolute count" },
  { value: "pct_source", label: "%", title: "% of source activity" },
];

const PERF_METRICS: { value: DfgMetric; label: string; title: string }[] = [
  { value: "mean", label: "Avg", title: "Mean duration" },
  { value: "median", label: "Med", title: "Median duration" },
  { value: "p90", label: "P90", title: "90th percentile duration" },
  { value: "min", label: "Min", title: "Minimum duration" },
  { value: "max", label: "Max", title: "Maximum duration" },
];

const ALL_METRICS = [...FREQ_METRICS, ...PERF_METRICS];

export function metricDisplayName(m: DfgMetric): string {
  return ALL_METRICS.find((x) => x.value === m)?.title ?? m;
}

export default function DfgSettings({
  metric,
  onMetricChange,
  edgeSlider,
  setEdgeSlider,
  coverage,
  hasPerformanceData,
  direction,
  onDirectionChange,
}: DfgSettingsProps) {
  const isPerf = isPerformanceMetric(metric);
  const subMetrics = isPerf ? PERF_METRICS : FREQ_METRICS;

  return (
    <div className="flex flex-col items-center gap-y-1">
      {/* Layout direction: vertical (top-down) vs horizontal (left-to-right). */}
      <div className="flex items-center rounded-md border border-(--gray-6) overflow-hidden">
        <button
          type="button"
          className={`p-1 text-[11px] ${direction === "TB" ? "bg-(--gray-12) text-(--gray-1)" : "bg-(--color-panel-solid) text-(--gray-9) hover:bg-(--gray-a3)"}`}
          title="Vertical layout"
          onClick={() => onDirectionChange("TB")}
        >
          <FaArrowDown />
        </button>
        <button
          type="button"
          className={`p-1 text-[11px] ${direction === "LR" ? "bg-(--gray-12) text-(--gray-1)" : "bg-(--color-panel-solid) text-(--gray-9) hover:bg-(--gray-a3)"}`}
          title="Horizontal layout"
          onClick={() => onDirectionChange("LR")}
        >
          <FaArrowRight />
        </button>
      </div>
      <SlGraph className="size-4 text-[var(--gray-10)]" title="Arcs" />
      <Slider
        size="2"
        orientation="vertical"
        className="!h-24"
        min={0}
        max={Math.max(coverage.edges.sliderMax, 1)}
        step={1}
        value={[Math.min(edgeSlider, Math.max(coverage.edges.sliderMax, 1))]}
        onValueChange={(v) => setEdgeSlider(v[0])}
      />
      <div className="flex flex-col items-center text-[10px] leading-tight text-[var(--gray-10)] tabular-nums">
        <span className="font-semibold text-[var(--gray-12)]">
          {coverage.edges.shown} / {coverage.edges.total}
        </span>
        <span>{coverage.edges.pct}% arcs</span>
        <span className="text-[var(--gray-9)]">
          {coverage.activities.shown} / {coverage.activities.total} activities
        </span>
      </div>
      <div className="flex gap-x-1">
        <Button
          size="1"
          variant="ghost"
          onClick={() => setEdgeSlider((e) => Math.max(typeof e === "number" ? e : 0, 1) - 1)}
          title="Fewer arcs"
        >
          <FaMinus />
        </Button>
        <Button
          size="1"
          variant="ghost"
          onClick={() =>
            setEdgeSlider((e) => Math.min((typeof e === "number" ? e : 0) + 1, coverage.edges.sliderMax))
          }
          title="More arcs"
        >
          <FaPlus />
        </Button>
      </div>

      {/* Mode toggle: frequency vs performance */}
      <div className="flex gap-x-0.5 mt-1">
        <button
          type="button"
          className={`p-1 rounded transition-colors ${!isPerf ? "bg-[var(--accent-9)] text-white" : "text-[var(--gray-9)] hover:bg-[var(--gray-3)]"}`}
          onClick={() => {
            if (isPerf) onMetricChange("count");
          }}
          title="Frequency"
        >
          <PiChartBar className="size-4" />
        </button>
        {hasPerformanceData && (
          <button
            type="button"
            className={`p-1 rounded transition-colors ${isPerf ? "bg-[var(--accent-9)] text-white" : "text-[var(--gray-9)] hover:bg-[var(--gray-3)]"}`}
            onClick={() => {
              if (!isPerf) onMetricChange("mean");
            }}
            title="Performance"
          >
            <PiTimer className="size-4" />
          </button>
        )}
      </div>

      {/* Sub-metric selector */}
      <div className="flex flex-wrap justify-center gap-0.5">
        {subMetrics.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
              metric === m.value
                ? "bg-[var(--accent-3)] text-[var(--accent-11)] border border-[var(--accent-7)]"
                : "text-[var(--gray-9)] hover:bg-[var(--gray-3)] border border-transparent"
            }`}
            onClick={() => onMetricChange(m.value)}
            title={m.title}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
