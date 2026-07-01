import { Badge, Button, Card, IconButton, Select, Table, Text, TextField } from "@r4pm/components/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import {
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaSearch,
  FaSortAmountDown,
  FaSortAmountUp,
  FaTimes,
} from "react-icons/fa";
import { PiTable } from "react-icons/pi";
import { useViewerConfig } from "@r4pm/components";
import { ErrorState, LoadingState, LogMetadataCard, softBadgeStyle } from "@r4pm/components";
import type { IDockviewPanelProps } from "dockview";
import type {
  BackendContext,
  EventLogHandle,
  LogGlobals,
  ObjectBrowserPage,
  ObjectBrowserRow,
  ObjectDetail,
  ObjectSortField,
  SlimLinkedOCELHandle,
  TraceBrowserPage,
  TraceBrowserRow,
  TraceDetail,
  TraceSortField,
} from "@r4pm/client";
import { definePanel } from "./define-vis";
import { withSelector, datasetEmptyBox } from "./_shared";
import { useDatasetSelection } from "../panels/active-datasets";
import { backend } from "../backends";

const GET_LOG_TRACES = "app_bindings::event_log::get_log_traces" as const;
const GET_TRACE_EVENTS = "app_bindings::event_log::get_trace_events" as const;
const GET_LOG_GLOBALS = "app_bindings::event_log::get_log_globals" as const;

const GET_OCEL_OBJECTS_PAGE = "app_bindings::ocel::get_ocel_objects_page" as const;
const GET_OBJECT_DETAIL = "app_bindings::ocel::get_object_detail" as const;

const PAGE_SIZES = [20, 50, 100] as const;

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "-";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)} s`;
  const mins = secs / 60;
  if (mins < 60) return `${mins.toFixed(1)} min`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} h`;
  const days = hrs / 24;
  return `${days.toFixed(1)} d`;
}

function TraceRowWithDetail({
  row,
  isExpanded,
  onToggle,
  detail,
  detailLoading,
  activityColor,
}: {
  row: TraceBrowserRow;
  isExpanded: boolean;
  onToggle: () => void;
  detail?: TraceDetail;
  detailLoading: boolean;
  activityColor: (act: string) => string;
}) {
  return (
    <>
      <Table.Row className="cursor-pointer hover:bg-[var(--gray-a3)]" onClick={onToggle}>
        <Table.Cell className="!align-middle">
          <IconButton size="1" variant="ghost" color="gray">
            {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
          </IconButton>
        </Table.Cell>
        <Table.Cell className="font-mono text-sm">{row.case_id}</Table.Cell>
        <Table.Cell className="text-right font-mono">{row.num_events}</Table.Cell>
        <Table.Cell>{formatTimestamp(row.start_time)}</Table.Cell>
        <Table.Cell>{formatTimestamp(row.end_time)}</Table.Cell>
        <Table.Cell className="text-right font-mono">{formatDuration(row.duration_ms)}</Table.Cell>
      </Table.Row>
      {isExpanded && (
        <Table.Row>
          <Table.Cell colSpan={6} className="!p-0">
            <div className="bg-[var(--gray-a3)]/50 p-3 border-y border-[var(--gray-a6)]">
              {detailLoading && <LoadingState label="loading events" topBar={false} />}
              {detail && Object.keys(detail.case_attributes).length > 0 && (
                <div className="mb-3">
                  <Text size="2" weight="bold" className="mb-1 block">
                    Case Attributes
                  </Text>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(detail.case_attributes).map(([k, v]) => (
                      <Badge key={k} variant="outline" color="gray" size="1">
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {detail && detail.events.length > 0 && (
                <Table.Root variant="surface" size="1">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>#</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Activity</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Timestamp</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Attributes</Table.ColumnHeaderCell>
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
                        <Table.Cell className="text-xs text-[var(--gray-a10)] max-w-[20rem] truncate">
                          {Object.entries(ev.attributes ?? {})
                            .filter(([, v]) => v != null)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ") || "-"}
                        </Table.Cell>
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
            </div>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

export interface TraceBrowserPanelProps {
  backend: BackendContext;
  /** EventLog (case) browser. */
  eventLog?: EventLogHandle;
  /** OCEL object browser. Pass whichever OCEL handle the bindings need. */
  ocel?: SlimLinkedOCELHandle;
}

/**
 * Trace-browser panel. Supports two modes:
 *
 * - EventLog (case) browser when `eventLog` is supplied: a paged, sortable,
 *   filterable trace table with a per-trace event drill-down and a collapsible
 *   log metadata card.
 * - OCEL object browser when `ocel` is supplied: a paged, sortable object table
 *   with a per-object detail drill-down (attributes + events + related objects).
 *
 * If both handles are supplied a mode toggle is shown (Cases is only available
 * when `eventLog` is present). Backed by the migrated registry bindings
 * `get_log_traces`, `get_trace_events`, `get_log_globals` (cases) and
 * `get_ocel_objects_page`, `get_object_detail` (objects).
 */
export function TraceBrowserPanel({ backend, eventLog, ocel }: TraceBrowserPanelProps) {
  const hasEventLog = eventLog != null;
  const hasOCEL = ocel != null;
  const [mode, setMode] = useState<"EventLog" | "OCEL">(hasEventLog ? "EventLog" : "OCEL");

  // Keep the selected mode valid as handles change (Cases needs an event log).
  const effectiveMode: "EventLog" | "OCEL" = mode === "EventLog" && !hasEventLog ? "OCEL" : mode;

  // Mode toggle shown only when both datasets are available.
  const toggle =
    hasEventLog && hasOCEL ? (
      <div className="flex gap-1">
        <Button
          size="1"
          variant={effectiveMode === "EventLog" ? "solid" : "soft"}
          color="blue"
          onClick={() => setMode("EventLog")}
        >
          Cases
        </Button>
        <Button
          size="1"
          variant={effectiveMode === "OCEL" ? "solid" : "soft"}
          color="plum"
          onClick={() => setMode("OCEL")}
        >
          Objects
        </Button>
      </div>
    ) : null;

  if (effectiveMode === "OCEL" && hasOCEL) {
    return <ObjectBrowserPanel backend={backend} ocel={ocel} headerExtra={toggle} />;
  }

  if (hasEventLog) {
    return <EventLogTraceBrowser backend={backend} eventLog={eventLog} headerExtra={toggle} />;
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="w-full">
        <Text color="gray">No dataset supplied.</Text>
      </Card>
    </div>
  );
}

/**
 * EventLog (case) browser: a paged, sortable, filterable trace table with a
 * per-trace event drill-down (case attributes + ordered events) and a
 * collapsible log metadata card. Backed by `get_log_traces`,
 * `get_trace_events`, and `get_log_globals`.
 */
function EventLogTraceBrowser({
  backend,
  eventLog,
  headerExtra,
}: {
  backend: BackendContext;
  eventLog: EventLogHandle;
  headerExtra?: React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [sortField, setSortField] = useState<TraceSortField>("CaseId");
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState("");
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

  const data = pageQuery.data;
  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const startIdx = page * pageSize + 1;
  const endIdx = Math.min(page * pageSize + pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (field: TraceSortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: TraceSortField }) =>
    sortField === field ? (
      sortAsc ? (
        <FaSortAmountUp className="inline ml-0.5 text-[10px]" />
      ) : (
        <FaSortAmountDown className="inline ml-0.5 text-[10px]" />
      )
    ) : null;

  // Structural sizing inline so the panel renders in any host (Tailwind-agnostic).
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Text as="div" size="4" weight="bold">
            Trace Browser
          </Text>
          {headerExtra}
        </div>

        <LogMetadataCard globals={globalsQuery.data} />

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <TextField.Root
            size="1"
            placeholder="Filter by Case ID..."
            value={filter}
            onChange={(e) => {
              setFilter(e.currentTarget.value);
              setPage(0);
            }}
            className="!flex-1 !min-w-[12rem]"
          >
            <TextField.Slot>
              <FaSearch />
            </TextField.Slot>
            {filter && (
              <TextField.Slot>
                <IconButton size="1" variant="ghost" color="gray" onClick={() => setFilter("")}>
                  <FaTimes />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>

          <Select.Root
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
            size="1"
          >
            <Select.Trigger variant="soft" />
            <Select.Content>
              {PAGE_SIZES.map((s) => (
                <Select.Item key={s} value={String(s)}>
                  {s} per page
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

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
                    <Table.ColumnHeaderCell className="!w-4" />
                    <Table.ColumnHeaderCell
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("CaseId")}
                    >
                      Case ID
                      <SortIcon field="CaseId" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      className="text-right cursor-pointer select-none"
                      onClick={() => toggleSort("NumEvents")}
                    >
                      # Events
                      <SortIcon field="NumEvents" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("StartTime")}
                    >
                      Start Time
                      <SortIcon field="StartTime" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className="select-none">End Time</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      className="text-right cursor-pointer select-none"
                      onClick={() => toggleSort("Duration")}
                    >
                      Duration
                      <SortIcon field="Duration" />
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((row) => {
                    const isExpanded = expandedCase === row.case_index;
                    return (
                      <TraceRowWithDetail
                        key={row.case_index}
                        row={row}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedCase(isExpanded ? null : row.case_index)}
                        detail={isExpanded ? (eventsQuery.data ?? undefined) : undefined}
                        detailLoading={isExpanded && eventsQuery.isLoading}
                        activityColor={activityColor}
                      />
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

              <div className="flex items-center justify-between mt-2 text-xs text-[var(--gray-a10)]">
                <Text size="1" color="gray">
                  Showing {total > 0 ? startIdx : 0}-{endIdx} of {total.toLocaleString("en")}
                </Text>
                <div className="flex items-center gap-1">
                  <IconButton
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <FaChevronLeft />
                  </IconButton>
                  <Text size="1" color="gray">
                    Page {page + 1} of {totalPages}
                  </Text>
                  <IconButton
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <FaChevronRight />
                  </IconButton>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function ObjectRowWithDetail({
  row,
  isExpanded,
  onToggle,
  detail,
  detailLoading,
  detailError,
  activityColor,
  objectTypeColor,
  onNavigateToObject,
}: {
  row: ObjectBrowserRow;
  isExpanded: boolean;
  onToggle: () => void;
  detail?: ObjectDetail;
  detailLoading: boolean;
  detailError?: unknown;
  activityColor: (act: string) => string;
  objectTypeColor: (t: string) => string;
  onNavigateToObject: (id: string) => void;
}) {
  return (
    <>
      <Table.Row className="cursor-pointer hover:bg-[var(--gray-a3)]" onClick={onToggle}>
        <Table.Cell className="!align-middle">
          <IconButton size="1" variant="ghost" color="gray">
            {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
          </IconButton>
        </Table.Cell>
        <Table.Cell className="font-mono text-sm">{row.object_id}</Table.Cell>
        <Table.Cell>
          <Badge style={softBadgeStyle(objectTypeColor(row.object_type))} size="1">
            {row.object_type}
          </Badge>
        </Table.Cell>
        <Table.Cell className="text-right font-mono">{row.num_events}</Table.Cell>
        <Table.Cell>{formatTimestamp(row.first_time)}</Table.Cell>
        <Table.Cell>{formatTimestamp(row.last_time)}</Table.Cell>
      </Table.Row>
      {isExpanded && (
        <Table.Row>
          <Table.Cell colSpan={6} className="!p-0">
            <div className="bg-[var(--gray-a3)]/50 p-3 border-y border-[var(--gray-a6)]">
              {detailError ? (
                <ErrorState error={detailError} title="Failed to load object detail" />
              ) : detailLoading ? (
                <LoadingState label="loading..." topBar={false} />
              ) : null}
              {detail && (
                <div className="flex flex-col gap-3">
                  {detail.attributes && Object.keys(detail.attributes).length > 0 && (
                    <div>
                      <Text size="2" weight="bold" className="mb-1 block">
                        Attributes
                      </Text>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(detail.attributes)
                          .filter(([, v]) => v != null)
                          .map(([k, v]) => (
                            <Badge key={k} variant="outline" color="gray" size="1">
                              {k}: {v}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}

                  {detail.events.length > 0 && (
                    <div>
                      <Text size="2" weight="bold" className="mb-1 block">
                        Events ({detail.events.length})
                      </Text>
                      <Table.Root variant="surface" size="1">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>#</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Event Type</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Timestamp</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Other Objects</Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {detail.events.map((ev, i) => (
                            <Table.Row key={ev.event_id}>
                              <Table.Cell className="font-mono text-[var(--gray-a9)] text-xs">
                                {i + 1}
                              </Table.Cell>
                              <Table.Cell>
                                <Badge style={softBadgeStyle(activityColor(ev.event_type))} size="1">
                                  {ev.event_type}
                                </Badge>
                              </Table.Cell>
                              <Table.Cell className="text-sm">{formatTimestamp(ev.timestamp)}</Table.Cell>
                              <Table.Cell>
                                <div className="flex flex-wrap gap-1">
                                  {ev.other_objects.map(([objId, objType]) => (
                                    <Badge
                                      key={objId}
                                      style={softBadgeStyle(objectTypeColor(objType))}
                                      size="1"
                                      className="cursor-pointer hover:opacity-80"
                                      title={`${objType}: ${objId}`}
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onNavigateToObject(objId);
                                      }}
                                    >
                                      {objId}
                                    </Badge>
                                  ))}
                                  {ev.other_objects.length === 0 && (
                                    <Text size="1" color="gray">
                                      -
                                    </Text>
                                  )}
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </div>
                  )}

                  {detail.related_objects.length > 0 && (
                    <div>
                      <Text size="2" weight="bold" className="mb-1 block">
                        Related Objects ({detail.related_objects.length})
                      </Text>
                      <div className="flex flex-wrap gap-1">
                        {detail.related_objects.map(([objId, objType]) => (
                          <Badge
                            key={objId}
                            style={softBadgeStyle(objectTypeColor(objType))}
                            size="1"
                            className="cursor-pointer hover:opacity-80"
                            title={`${objType}: ${objId}`}
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              onNavigateToObject(objId);
                            }}
                          >
                            {objType}: {objId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.events.length === 0 && detail.related_objects.length === 0 && (
                    <Text size="2" color="gray">
                      No events or related objects.
                    </Text>
                  )}
                </div>
              )}
            </div>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

export interface ObjectBrowserPanelProps {
  backend: BackendContext;
  ocel: SlimLinkedOCELHandle;
  /** Optional content rendered next to the title (e.g. a mode toggle). */
  headerExtra?: React.ReactNode;
}

/**
 * Interactive OCEL object-browser panel. Shows a paged, sortable, filterable
 * object table with a per-object
 * detail drill-down (attributes + ordered events with cross-object navigation +
 * related objects). Backed by the migrated registry bindings
 * `get_ocel_objects_page` and `get_object_detail`, which operate on the slim OCEL.
 */
export function ObjectBrowserPanel({ backend, ocel, headerExtra }: ObjectBrowserPanelProps) {
  const ocelArg = ocel;

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [sortField, setSortField] = useState<ObjectSortField>("ObjectId");
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedObject, setExpandedObject] = useState<string | null>(null);

  // Local activity-color cache.
  const { colorOf } = useViewerConfig({});
  const activityColor = (act: string) => colorOf?.("activity", act) ?? "#888888";
  const objectTypeColor = (t: string) => colorOf?.("objectType", t) ?? "#888888";

  const pageQuery = useQuery({
    queryKey: [ocel, "object-browser", page, pageSize, sortField, sortAsc, filter, typeFilter],
    queryFn: () =>
      backend.callBinding(GET_OCEL_OBJECTS_PAGE, {
        ocel: ocelArg,
        offset: page * pageSize,
        limit: pageSize,
        sort_field: sortField,
        sort_asc: sortAsc,
        filter,
        type_filter: typeFilter,
      }) as Promise<ObjectBrowserPage>,
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: [ocel, "object-detail", expandedObject],
    queryFn: () =>
      backend.callBinding(GET_OBJECT_DETAIL, {
        ocel: ocelArg,
        object_id: expandedObject!,
      }) as Promise<ObjectDetail>,
    enabled: expandedObject != null,
  });

  const data = pageQuery.data;
  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const objectTypes = data?.object_types ?? [];
  const startIdx = page * pageSize + 1;
  const endIdx = Math.min(page * pageSize + pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (field: ObjectSortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: ObjectSortField }) =>
    sortField === field ? (
      sortAsc ? (
        <FaSortAmountUp className="inline ml-0.5 text-[10px]" />
      ) : (
        <FaSortAmountDown className="inline ml-0.5 text-[10px]" />
      )
    ) : null;

  const navigateToObject = (objectId: string) => {
    setExpandedObject(objectId);
    setFilter(objectId);
    setPage(0);
  };

  // Structural sizing inline so the panel renders in any host (Tailwind-agnostic).
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Text as="div" size="4" weight="bold">
            Object Browser
          </Text>
          {headerExtra}
        </div>

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <TextField.Root
            size="1"
            placeholder="Filter by Object ID..."
            value={filter}
            onChange={(e) => {
              setFilter(e.currentTarget.value);
              setPage(0);
            }}
            className="!flex-1 !min-w-[12rem]"
          >
            <TextField.Slot>
              <FaSearch />
            </TextField.Slot>
            {filter && (
              <TextField.Slot>
                <IconButton size="1" variant="ghost" color="gray" onClick={() => setFilter("")}>
                  <FaTimes />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>

          {objectTypes.length > 0 && (
            <Select.Root
              value={typeFilter ?? "__all__"}
              onValueChange={(v) => {
                setTypeFilter(v === "__all__" ? null : v);
                setPage(0);
              }}
              size="1"
            >
              <Select.Trigger variant="soft" placeholder="All types" />
              <Select.Content>
                <Select.Item value="__all__">All types</Select.Item>
                {objectTypes.map((t) => (
                  <Select.Item key={t} value={t}>
                    {t}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          )}

          <Select.Root
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
            size="1"
          >
            <Select.Trigger variant="soft" />
            <Select.Content>
              {PAGE_SIZES.map((s) => (
                <Select.Item key={s} value={String(s)}>
                  {s} per page
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <div className="grow overflow-auto" style={{ minHeight: 0 }}>
          {pageQuery.error ? (
            <ErrorState
              error={pageQuery.error}
              title="Failed to load objects"
              onRetry={() => pageQuery.refetch()}
            />
          ) : !data ? (
            <LoadingState label="loading objects" />
          ) : (
            <>
              <Table.Root variant="ghost" size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell className="!w-4" />
                    <Table.ColumnHeaderCell
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("ObjectId")}
                    >
                      Object ID
                      <SortIcon field="ObjectId" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("ObjectType")}
                    >
                      Type
                      <SortIcon field="ObjectType" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      className="text-right cursor-pointer select-none"
                      onClick={() => toggleSort("NumEvents")}
                    >
                      # Events
                      <SortIcon field="NumEvents" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("FirstTime")}
                    >
                      First Time
                      <SortIcon field="FirstTime" />
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className="select-none">Last Time</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((row) => {
                    const isExpanded = expandedObject === row.object_id;
                    return (
                      <ObjectRowWithDetail
                        key={row.object_id}
                        row={row}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedObject(isExpanded ? null : row.object_id)}
                        detail={isExpanded ? (detailQuery.data ?? undefined) : undefined}
                        detailLoading={isExpanded && detailQuery.isLoading}
                        detailError={isExpanded ? detailQuery.error : undefined}
                        activityColor={activityColor}
                        objectTypeColor={objectTypeColor}
                        onNavigateToObject={navigateToObject}
                      />
                    );
                  })}
                  {rows.length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={6}>
                        <Text color="gray" size="2">
                          {filter ? `No objects matching "${filter}".` : "No objects found."}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>

              <div className="flex items-center justify-between mt-2 text-xs text-[var(--gray-a10)]">
                <Text size="1" color="gray">
                  Showing {total > 0 ? startIdx : 0}-{endIdx} of {total.toLocaleString("en")}
                </Text>
                <div className="flex items-center gap-1">
                  <IconButton
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <FaChevronLeft />
                  </IconButton>
                  <Text size="1" color="gray">
                    Page {page + 1} of {totalPages}
                  </Text>
                  <IconButton
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <FaChevronRight />
                  </IconButton>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Interactive trace browser for the active event log. */
export function TraceBrowserDockPanel(_props: IDockviewPanelProps) {
  const { id: log, selector } = useDatasetSelection("EventLog");
  if (!log) return withSelector(selector, datasetEmptyBox("EventLog"), "trace-browser");
  return withSelector(
    selector,
    <TraceBrowserPanel key={log} backend={backend} eventLog={log as EventLogHandle} />,
    "trace-browser",
  );
}

export const vis = definePanel({
  type: "traceBrowser",
  name: "Trace Browser",
  description: "Paged, sortable trace table with expandable event detail.",
  category: "overview",
  icon: PiTable,
  supports: ["EventLog"],
  keywords: ["traces", "cases", "browse", "table", "search"],
  order: 12,
  component: TraceBrowserDockPanel,
});
