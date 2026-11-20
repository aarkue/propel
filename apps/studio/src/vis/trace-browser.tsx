import { Badge, Table, Text } from "@r4pm/components/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PiTable } from "react-icons/pi";
import {
  ExpandableRow,
  SearchField,
  SortableHeader,
  TablePager,
  Toolbar,
  useViewerConfig,
} from "@r4pm/components";
import { ErrorState, LoadingState, LogMetadataCard, softBadgeStyle } from "@r4pm/components";
import type { IDockviewPanelProps } from "dockview";
import type {
  BackendContext,
  EventLogHandle,
  LogGlobals,
  TraceBrowserPage,
  TraceDetail,
  TraceSortField,
} from "@r4pm/client";
import { type DatasetPanelProps, defineDatasetPanel } from "./define-vis";
import { useDatasetScopedState } from "../panels/panel-state";
import { backend } from "../backends";

import {
  FILTER_DEBOUNCE_MS,
  formatTimestamp,
  PAGE_SIZES,
  useDurationFormat,
} from "./components/browser-format";

const GET_LOG_TRACES = "app_bindings::get_log_traces" as const;
const GET_TRACE_EVENTS = "app_bindings::get_trace_events" as const;
const GET_LOG_GLOBALS = "app_bindings::get_log_globals" as const;

/** The attribute keys of `events`, in the order they first appear. */
function attributeKeys(events: TraceDetail["events"]): string[] {
  const keys = new Set<string>();
  for (const ev of events)
    for (const [k, v] of Object.entries(ev.attributes ?? {})) if (v != null) keys.add(k);
  return [...keys];
}

function TraceEvents({
  detail,
  loading,
  error,
  activityColor,
}: {
  detail?: TraceDetail;
  loading: boolean;
  error?: unknown;
  activityColor: (act: string) => string;
}) {
  const keys = detail ? attributeKeys(detail.events) : [];
  return (
    <>
      {loading && <LoadingState label="loading events" topBar={false} />}
      {!!error && <ErrorState error={error} title="Could not load the events" />}
      {detail && Object.keys(detail.case_attributes).length > 0 && (
        <div className="mb-3">
          <Text size="2" weight="bold" className="mb-1 block">
            Case Attributes
          </Text>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {Object.entries(detail.case_attributes).map(([k, v]) => (
              <span key={k} className="inline-flex items-baseline gap-1.5">
                <span className="text-[var(--gray-a10)]">{k}</span>
                <span className="font-medium tabular-nums text-[var(--gray-12)]">{v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {detail && detail.events.length > 0 && (
        <Table.Root variant="surface" size="1" className="max-w-full">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>#</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Activity</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Timestamp</Table.ColumnHeaderCell>
              {keys.map((k) => (
                <Table.ColumnHeaderCell
                  key={k}
                  className="whitespace-nowrap font-normal text-[var(--gray-a11)]"
                >
                  {k}
                </Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {detail.events.map((ev, i) => (
              <Table.Row key={i}>
                <Table.Cell className="font-mono text-[var(--gray-a9)] text-xs">{i + 1}</Table.Cell>
                <Table.Cell>
                  <Badge style={softBadgeStyle(activityColor(ev.activity))} size="1">
                    {ev.activity}
                  </Badge>
                </Table.Cell>
                <Table.Cell className="text-sm">{formatTimestamp(ev.timestamp)}</Table.Cell>
                {keys.map((k) => {
                  const v = ev.attributes?.[k];
                  // A value repeated from the previous event is dimmed, so changes stand out.
                  const same = i > 0 && v != null && detail.events[i - 1].attributes?.[k] === v;
                  return (
                    <Table.Cell
                      key={k}
                      className={`whitespace-nowrap text-xs tabular-nums ${same ? "text-[var(--gray-a8)]" : "text-[var(--gray-12)]"}`}
                    >
                      {v ?? ""}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      {detail && detail.events.length === 0 && Object.keys(detail.case_attributes).length === 0 && (
        <Text size="2" color="gray">
          No events or case attributes.
        </Text>
      )}
    </>
  );
}

interface LogView {
  page: number;
  pageSize: number;
  sortField: TraceSortField;
  sortAsc: boolean;
  filter: string;
}

const INITIAL_LOG_VIEW: LogView = { page: 0, pageSize: 20, sortField: "CaseId", sortAsc: true, filter: "" };

/**
 * EventLog (case) browser: a paged, sortable, filterable trace table with a
 * per-trace event drill-down (case attributes + ordered events) and a
 * collapsible log metadata card. Backed by `get_log_traces`,
 * `get_trace_events`, and `get_log_globals`.
 */
function EventLogTraceBrowser({
  props,
  backend,
  eventLog,
}: {
  props: IDockviewPanelProps;
  backend: BackendContext;
  eventLog: EventLogHandle;
}) {
  const [view, setView] = useDatasetScopedState<LogView>(props, "logView", eventLog, INITIAL_LOG_VIEW);
  const { page, pageSize, sortField, sortAsc, filter } = view;
  const [expandedCase, setExpandedCase] = useState<number | null>(null);

  // Shared activity color from the host (or the deterministic default), HSL hex.
  const { colorOf } = useViewerConfig({});
  const activityColor = (act: string) => colorOf?.("activity", act) ?? "#888888";

  const pageQuery = useQuery({
    queryKey: [eventLog, "trace-browser", page, pageSize, sortField, sortAsc, filter],
    queryFn: () =>
      backend.callBinding(GET_LOG_TRACES, {
        event_log: eventLog,
        offset: page * pageSize,
        limit: pageSize,
        sort_field: sortField,
        sort_asc: sortAsc,
        filter,
      }) as Promise<TraceBrowserPage>,
    placeholderData: keepPreviousData,
  });

  const globalsQuery = useQuery({
    queryKey: [eventLog, "log-globals"],
    queryFn: () => backend.callBinding(GET_LOG_GLOBALS, { event_log: eventLog }) as Promise<LogGlobals>,
  });

  const eventsQuery = useQuery({
    queryKey: [eventLog, "trace-events", expandedCase],
    queryFn: () =>
      backend.callBinding(GET_TRACE_EVENTS, {
        event_log: eventLog,
        case_index: expandedCase!,
      }) as Promise<TraceDetail>,
    enabled: expandedCase != null,
  });

  const formatDuration = useDurationFormat();
  const data = pageQuery.data;
  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];

  const toggleSort = (field: TraceSortField) => {
    if (sortField === field) {
      setView({ ...view, sortAsc: !sortAsc, page: 0 });
    } else {
      setView({ ...view, sortField: field, sortAsc: true, page: 0 });
    }
  };

  const header = (field: TraceSortField, label: string, align?: "right") => (
    <SortableHeader
      sorted={sortField === field ? (sortAsc ? "asc" : "desc") : null}
      onSort={() => toggleSort(field)}
      align={align}
    >
      {label}
    </SortableHeader>
  );

  // Structural sizing inline so the panel renders in any host (Tailwind-agnostic).
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "8px 16px 0",
      }}
    >
      <LogMetadataCard globals={globalsQuery.data} />

      <Toolbar>
        <SearchField
          placeholder="Filter by Case ID..."
          value={filter}
          onChange={(f) => setView({ ...view, filter: f, page: 0 })}
          debounceMs={FILTER_DEBOUNCE_MS}
        />
      </Toolbar>

      <div className="grow overflow-auto" style={{ minHeight: 0 }}>
        {pageQuery.error && (
          <ErrorState
            error={pageQuery.error}
            title="Failed to load traces"
            onRetry={() => pageQuery.refetch()}
          />
        )}
        {!data && !pageQuery.error && <LoadingState label="loading traces" />}

        {data && (
          <>
            <Table.Root variant="ghost" size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell style={{ width: 16 }} />
                  {header("CaseId", "Case ID")}
                  {header("NumEvents", "# Events", "right")}
                  {header("StartTime", "Start Time")}
                  <SortableHeader>End Time</SortableHeader>
                  {header("Duration", "Duration", "right")}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => {
                  const expanded = expandedCase === row.case_index;
                  return (
                    <ExpandableRow
                      key={row.case_index}
                      expanded={expanded}
                      onToggle={() => setExpandedCase(expanded ? null : row.case_index)}
                      columns={6}
                      detail={
                        <TraceEvents
                          detail={eventsQuery.data ?? undefined}
                          loading={eventsQuery.isLoading}
                          error={eventsQuery.error}
                          activityColor={activityColor}
                        />
                      }
                    >
                      <Table.Cell className="font-mono text-sm">{row.case_id}</Table.Cell>
                      <Table.Cell className="text-right font-mono">{row.num_events}</Table.Cell>
                      <Table.Cell>{formatTimestamp(row.start_time)}</Table.Cell>
                      <Table.Cell>{formatTimestamp(row.end_time)}</Table.Cell>
                      <Table.Cell className="text-right font-mono">
                        {formatDuration(row.duration_ms)}
                      </Table.Cell>
                    </ExpandableRow>
                  );
                })}
                {rows.length === 0 && (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text color="gray" size="2">
                        {filter ? `No cases matching "${filter}".` : "No cases found."}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>

            <TablePager
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(p) => setView({ ...view, page: p })}
              pageSizes={PAGE_SIZES}
              onPageSizeChange={(size) => setView({ ...view, pageSize: size, page: 0 })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function TraceBrowserPanel({ id, props }: DatasetPanelProps) {
  return <EventLogTraceBrowser props={props} backend={backend} eventLog={id as EventLogHandle} />;
}

export const vis = defineDatasetPanel({
  needs: "EventLog",
  type: "traceBrowser",
  name: "Trace Browser",
  description: "Paged, sortable trace table with expandable event detail.",
  category: "overview",
  icon: PiTable,
  supports: ["EventLog"],
  keywords: ["traces", "cases", "browse", "table", "search"],
  order: 12,
  component: TraceBrowserPanel,
});
