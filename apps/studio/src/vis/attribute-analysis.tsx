import type { IDockviewPanelProps } from "dockview";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PiArrowLeft, PiTable } from "react-icons/pi";
import type { PlotParams } from "react-plotly.js";
import { Badge, Button, Card, Table, Text } from "@r4pm/components/ui";
import { ErrorState, LoadingState } from "@r4pm/components";
import type {
  AttributeInfo,
  AttributeKind,
  AttributeLevel,
  AttributeSummary,
  BackendContext,
  EventLogHandle,
  NumericStats,
} from "@r4pm/client";
import { withSelector, datasetEmptyBox } from "./_shared";
import { useDatasetSelection } from "../panels/active-datasets";
import { backend } from "../backends";
import { definePanel } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const Plot = lazy(() => import("@r4pm/components/charts").then((m) => ({ default: m.ThemedPlot })));

const GET_ATTRIBUTE_NAMES = "app_bindings::event_log::get_attribute_names" as const;
const GET_ATTRIBUTE_SUMMARY = "app_bindings::event_log::get_attribute_summary" as const;

function kindColor(kind: AttributeKind): "blue" | "orange" | "violet" | "gray" {
  switch (kind) {
    case "Numeric":
      return "blue";
    case "Categorical":
      return "orange";
    case "Date":
      return "violet";
    default:
      return "gray";
  }
}

function pctMissing(missing: number, present: number): string {
  if (present === 0) return "100%";
  return `${((missing / (present + missing)) * 100).toFixed(1)}%`;
}

const PLOT_CONFIG: PlotParams["config"] = {
  displaylogo: false,
  displayModeBar: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
  responsive: true,
};

function AttributeDetail({ summary, onBack }: { summary: AttributeSummary; onBack: () => void }) {
  const hasNumeric = summary.kind === "Numeric" && summary.numeric_stats != null;
  return (
    <div className="flex flex-col gap-3" style={{ height: "100%", minHeight: 0 }}>
      <div>
        <Button variant="surface" className="w-fit" size="1" onClick={onBack}>
          <PiArrowLeft /> Back
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Text weight="bold" size="5">
          {summary.name}
        </Text>
        <Badge color={kindColor(summary.kind)}>{summary.kind}</Badge>
        <Badge color="gray">{summary.total.toLocaleString("en")} total</Badge>
        {summary.missing > 0 && (
          <Badge color="red" variant="soft">
            {summary.missing.toLocaleString("en")} missing ({pctMissing(summary.missing, summary.total)})
          </Badge>
        )}
      </div>

      {hasNumeric ? <NumericDetail summary={summary} /> : <CategoricalDetail summary={summary} />}
    </div>
  );
}

function NumericDetail({ summary }: { summary: AttributeSummary }) {
  // numeric_stats is guaranteed non-null when reached (caller checks)
  const stats = summary.numeric_stats as NumericStats;

  const binCenters = useMemo(() => {
    const edges = summary.hist_bin_edges;
    const centers: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      centers.push((edges[i] + edges[i + 1]) / 2);
    }
    return centers;
  }, [summary.hist_bin_edges]);

  const binWidths = useMemo(() => {
    const edges = summary.hist_bin_edges;
    const widths: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      widths.push(edges[i + 1] - edges[i]);
    }
    return widths;
  }, [summary.hist_bin_edges]);

  return (
    <>
      <div className="flex gap-2 flex-wrap px-1">
        <Badge color="blue">min {stats.min.toLocaleString("en")}</Badge>
        <Badge color="blue">max {stats.max.toLocaleString("en")}</Badge>
        <Badge color="iris">mean {stats.mean.toFixed(2)}</Badge>
        <Badge color="iris">median {stats.median.toFixed(2)}</Badge>
        <Badge color="violet">stddev {stats.stddev.toFixed(2)}</Badge>
      </div>
      {binCenters.length > 0 && (
        <div className="grow" style={{ minHeight: 0 }}>
          <Suspense fallback={<LoadingState label="loading chart" />}>
            <Plot
              data={[
                {
                  type: "bar",
                  x: binCenters,
                  y: summary.hist_counts,
                  width: binWidths,
                  marker: { color: "#636AFA" },
                },
              ]}
              layout={{
                autosize: true,
                margin: { t: 16, b: 48, l: 56, r: 16 },
                bargap: 0.02,
                xaxis: { title: { text: summary.name }, fixedrange: false },
                yaxis: { title: { text: "Count" }, fixedrange: false },
              }}
              config={PLOT_CONFIG}
              style={{ width: "100%", height: "100%" }}
              useResizeHandler
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

function CategoricalDetail({ summary }: { summary: AttributeSummary }) {
  const topValues = summary.top_values;
  const labels = topValues.map(([v]) => String(v));
  const counts = topValues.map(([, c]) => c);

  return (
    <div className="grow" style={{ minHeight: 0 }}>
      {topValues.length === 0 ? (
        <Text color="gray" size="2">
          No values to display.
        </Text>
      ) : (
        <Suspense fallback={<LoadingState label="loading chart" />}>
          <Plot
            data={[
              {
                type: "bar",
                y: labels,
                x: counts,
                orientation: "h",
                marker: { color: "#636AFA" },
              },
            ]}
            layout={{
              autosize: true,
              margin: {
                t: 16,
                b: 48,
                l: Math.min(200, Math.max(80, Math.max(...labels.map((l) => l.length)) * 7)),
                r: 16,
              },
              xaxis: { title: { text: "Count" }, fixedrange: false },
              yaxis: {
                autorange: "reversed",
                fixedrange: false,
                automargin: true,
              },
            }}
            config={PLOT_CONFIG}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </Suspense>
      )}
    </div>
  );
}

function AttributeList({
  attributes,
  onSelect,
}: {
  attributes: AttributeInfo[];
  onSelect: (attr: AttributeInfo) => void;
}) {
  return (
    <div className="overflow-auto grow">
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Level</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Unique</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Total</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>% Missing</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {attributes.map((attr) => (
            <Table.Row
              key={`${attr.level}-${attr.name}`}
              className="cursor-pointer hover:bg-[var(--accent-a3)]"
              onClick={() => onSelect(attr)}
            >
              <Table.Cell>
                <Text weight="medium">{attr.name}</Text>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="soft" color="gray">
                  {attr.level}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge color={kindColor(attr.kind)}>{attr.kind}</Badge>
              </Table.Cell>
              <Table.Cell>{attr.unique_count.toLocaleString("en")}</Table.Cell>
              <Table.Cell>{attr.total_count.toLocaleString("en")}</Table.Cell>
              <Table.Cell>{pctMissing(attr.missing_count, attr.total_count)}</Table.Cell>
            </Table.Row>
          ))}
          {attributes.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={6}>
                <Text color="gray" size="2">
                  No attributes found.
                </Text>
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

export interface AttributeAnalysisPanelProps {
  backend: BackendContext;
  eventLog: EventLogHandle;
  /** Optional callback when an attribute is selected (e.g. send-to-transforms). */
  onSelect?: (attr: AttributeInfo) => void;
}

/**
 * Interactive attribute-analysis panel.
 * Lists an event log's attributes and drills into per-attribute summary/stats
 * (numeric histogram + stats, or categorical top-values bar chart) via the
 * migrated `get_attribute_names` / `get_attribute_summary` registry bindings.
 */
export function AttributeAnalysisPanel({ backend, eventLog, onSelect }: AttributeAnalysisPanelProps) {
  const namesQuery = useQuery({
    queryKey: ["attribute-names", eventLog],
    queryFn: () =>
      backend.callBinding(GET_ATTRIBUTE_NAMES, { event_log: eventLog }) as Promise<AttributeInfo[]>,
  });

  const [selected, setSelected] = useState<{ name: string; level: AttributeLevel } | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["attribute-summary", eventLog, selected?.name, selected?.level],
    queryFn: () =>
      backend.callBinding(GET_ATTRIBUTE_SUMMARY, {
        event_log: eventLog,
        attr_name: selected?.name ?? "",
        level: selected?.level ?? "Event",
      }) as Promise<AttributeSummary>,
    enabled: selected != null,
  });

  // Structural sizing inline so the panel renders in any host (Tailwind-agnostic).
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between gap-x-2 flex-wrap mb-2">
          <Text as="div" size="4" weight="bold">
            Attribute Analysis
          </Text>
        </div>
        {!summaryQuery.data && <p className="my-1">Click on a row for details and a distribution plot.</p>}
        <div className="grow flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {namesQuery.isLoading && <LoadingState label="loading attributes" />}
          {namesQuery.error && (
            <ErrorState
              error={namesQuery.error}
              title="Failed to load attribute names"
              onRetry={() => namesQuery.refetch()}
            />
          )}
          {!selected && namesQuery.data && (
            <AttributeList
              attributes={namesQuery.data}
              onSelect={(attr) => {
                setSelected({ name: attr.name, level: attr.level });
                onSelect?.(attr);
              }}
            />
          )}
          {selected && (
            <>
              {summaryQuery.isLoading && <LoadingState label="loading summary" />}
              {summaryQuery.error && (
                <ErrorState
                  error={summaryQuery.error}
                  title="Failed to load attribute summary"
                  onRetry={() => summaryQuery.refetch()}
                />
              )}
              {summaryQuery.data && (
                <AttributeDetail summary={summaryQuery.data} onBack={() => setSelected(null)} />
              )}
              {!summaryQuery.data && !summaryQuery.isLoading && !summaryQuery.error && (
                <Button variant="surface" className="w-fit" size="1" onClick={() => setSelected(null)}>
                  <PiArrowLeft /> Back
                </Button>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Interactive attribute analysis for the active event log. */
export function AttributeAnalysisDockPanel(_props: IDockviewPanelProps) {
  const { id: log, selector } = useDatasetSelection("EventLog");
  if (!log) return withSelector(selector, datasetEmptyBox("EventLog"), "attribute-analysis");
  return withSelector(
    selector,
    <AttributeAnalysisPanel key={log} backend={backend} eventLog={log as EventLogHandle} />,
    "attribute-analysis",
  );
}

export const vis = definePanel({
  type: "attributeAnalysis",
  name: "Attribute Analysis",
  description: "Per-attribute distribution, types, and stats for the event log.",
  category: "overview",
  icon: PiTable,
  supports: ["EventLog"],
  keywords: ["attributes", "distribution", "histogram", "stats"],
  order: 11,
  component: AttributeAnalysisDockPanel,
});
