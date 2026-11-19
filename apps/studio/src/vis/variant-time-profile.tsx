import { lazy, useMemo } from "react";
import type { EventLogHandle } from "@r4pm/client";
import { ViewStateProvider } from "@r4pm/components";
import type { VariantTimingLoaders } from "@r4pm/components/charts";
import { PiChartLineUp } from "react-icons/pi";
import { backend } from "../backends";
import { usePanelState } from "../panels/panel-state";
import { type DatasetPanelProps, defineDatasetPanel } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const VariantTimeProfileChart = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.VariantTimeProfileChart })),
);

const PAGE = "app_bindings::get_variant_timing_page" as const;
const PROFILE = "app_bindings::get_variant_time_profile" as const;
const EMPTY_VIEW_STATE: Record<string, unknown> = {};

function VariantTimeProfileDockPanel({ id, props }: DatasetPanelProps) {
  const [viewState, setViewState] = usePanelState(props, "viewState", EMPTY_VIEW_STATE);
  const loaders = useMemo<VariantTimingLoaders>(() => {
    const event_log = id as EventLogHandle;
    return {
      loadVariants: (req) => backend.callBinding(PAGE, { event_log, ...req }),
      loadProfile: (req) => backend.callBinding(PROFILE, { event_log, ...req }),
    };
  }, [id]);
  return (
    <ViewStateProvider viewState={viewState} onViewStateChange={setViewState}>
      <VariantTimeProfileChart {...loaders} />
    </ViewStateProvider>
  );
}

export const vis = defineDatasetPanel({
  needs: "EventLog",
  type: "variantTimeProfile",
  name: "Variant Timing",
  description: "Schwanen-Küsters plot: time since case start at each step of a variant.",
  category: "time",
  icon: PiChartLineUp,
  supports: ["EventLog"],
  keywords: ["schwanen", "kuesters", "küsters", "variant", "performance", "elapsed", "throughput"],
  order: 11,
  component: VariantTimeProfileDockPanel,
});
