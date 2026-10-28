import { lazy, Suspense, useMemo } from "react";
import type { IDockviewPanelProps } from "dockview";
import type { EventLogHandle } from "@r4pm/client";
import { LoadingState, ViewStateProvider } from "@r4pm/components";
import type { VariantTimingLoaders } from "@r4pm/components/charts";
import { PiChartLineUp } from "react-icons/pi";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";
import { usePanelState } from "../panels/panel-state";
import { datasetEmptyBox, withSelector } from "./_shared";
import { definePanel } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const VariantTimeProfileChart = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.VariantTimeProfileChart })),
);

const PAGE = "app_bindings::variant_timing::get_variant_timing_page" as const;
const PROFILE = "app_bindings::variant_timing::get_variant_time_profile" as const;
const EMPTY_VIEW_STATE: Record<string, unknown> = {};

export function VariantTimeProfileDockPanel(props: IDockviewPanelProps) {
  const { id: log, selector } = useDatasetSelection("EventLog", props);
  const [viewState, setViewState] = usePanelState(props, "viewState", EMPTY_VIEW_STATE);
  const loaders = useMemo<VariantTimingLoaders | null>(() => {
    if (!log) return null;
    const event_log = log as EventLogHandle;
    return {
      loadVariants: (req) => backend.callBinding(PAGE, { event_log, ...req }),
      loadProfile: (req) => backend.callBinding(PROFILE, { event_log, ...req }),
    };
  }, [log]);
  if (!loaders) return withSelector(selector, datasetEmptyBox("EventLog"));
  return withSelector(
    selector,
    <Suspense fallback={<LoadingState label="loading" />}>
      <ViewStateProvider viewState={viewState} onViewStateChange={setViewState}>
        <VariantTimeProfileChart key={log} {...loaders} />
      </ViewStateProvider>
    </Suspense>,
  );
}

export const vis = definePanel({
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
