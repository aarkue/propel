import {
  Button,
  Callout,
  Card,
  Checkbox,
  DropdownMenu,
  IconButton,
  Progress,
  Skeleton,
  Table,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaMinusCircle,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import { GiElephant } from "react-icons/gi";
import { PiCircle, PiCircleFill, PiCircleHalfFill } from "react-icons/pi";
import { useViewerConfig } from "./viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "./viewer/export";
import { ActivityChip, layoutActivityPills, renderActivityPillsSvg } from "./shared/ActivitySequence";
import { serializeSvg, SVG_NS, svgEl } from "./dfg/util/svg-export";

// Local view-model mirroring the generated @r4pm/client TraceVariants type.
export interface TraceVariants {
  activities: string[];
  act_to_index: Record<string, number>;
  traces: [number[], number][];
}

const PAGE_SIZE = 25;
const MAX_TRACE_LENGTH_COLLAPSED = 50;

interface VariantRow {
  idx: number;
  indices: number[];
  labels: string[];
  count: number;
  eventCount: number;
}

// Ported from propel's traceVariantsSvgExport. The on-screen panel is an
// interactive table whose height grows arbitrarily with the number of
// variants; rasterizing it directly produces an image that overflows. This
// renderer instead draws a bounded number of top variants into a
// self-contained SVG with a page-friendly aspect ratio, reusing the shared
// low-level helpers from the DFG export module.

interface TraceVariantsSvgRow {
  /** Activity names in execution order. */
  labels: string[];
  /** Number of cases that follow this exact trace. */
  count: number;
}

interface TraceVariantsSvgOptions {
  /** Every distinct variant in the log, ordered by descending frequency. */
  rows: TraceVariantsSvgRow[];
  /** Total number of cases across all variants; denominator for the % column. */
  totalTraces: number;
  /** Max rows to render; extra variants are summarised in a footer line. */
  maxRows?: number;
  /** Color resolver for an activity label. */
  activityColor: (name: string) => string;
  /** Optional title drawn at the top of the SVG. */
  title?: string;
}

// Visual constants, tuned so 15 rows fit in a page-friendly landscape
// aspect ratio.
const WIDTH = 1100;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 40;
const FOOTER_HEIGHT = 22;
const LEFT_PAD = 24;
const RIGHT_PAD = 24;
const RANK_COL_W = 28;

function buildTraceVariantsSvg(opts: TraceVariantsSvgOptions): string | null {
  const { rows, totalTraces, maxRows = 15, activityColor, title = "Trace Variants" } = opts;
  if (rows.length === 0) return null;

  const visibleRows = rows.slice(0, maxRows);
  const hiddenRows = Math.max(0, rows.length - visibleRows.length);
  const hiddenTraceCount = rows.slice(maxRows).reduce((s, r) => s + r.count, 0);

  // Column geometry, needed for the wrapping calculation below, so compute
  // it before we know the total height.
  const countLabelX = WIDTH - RIGHT_PAD - 140;
  const pctLabelX = WIDTH - RIGHT_PAD - 50;
  const variantLeft = LEFT_PAD + RANK_COL_W;
  const variantAreaRight = countLabelX - 20;

  const layouts = visibleRows.map((row) =>
    layoutActivityPills(row.labels, {
      startX: variantLeft,
      maxRight: variantAreaRight,
      colorOf: activityColor,
    }),
  );

  const rowTops: number[] = [];
  let runningY = HEADER_HEIGHT;
  for (const l of layouts) {
    rowTops.push(runningY);
    runningY += l.lineCount * ROW_HEIGHT;
  }
  const totalRowsHeight = runningY - HEADER_HEIGHT;

  const height = HEADER_HEIGHT + totalRowsHeight + (hiddenRows > 0 ? FOOTER_HEIGHT : 0) + 16;

  const svg = svgEl("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${WIDTH} ${height}`,
    width: WIDTH,
    height,
  }) as SVGSVGElement;
  svg.setAttribute("font-family", "Inter, system-ui, -apple-system, sans-serif");

  // Header row: title + column labels.
  const titleT = svgEl("text", {
    x: LEFT_PAD,
    y: 20,
    "font-size": 18,
    "font-weight": 700,
    fill: "#111827",
  });
  titleT.textContent = title;
  svg.appendChild(titleT);
  const headerColT = (text: string, x: number) => {
    const t = svgEl("text", {
      x,
      y: 20,
      "text-anchor": "end",
      "font-size": 12,
      "font-weight": 600,
      "letter-spacing": "0.05em",
      fill: "#6b7280",
    });
    t.textContent = text.toUpperCase();
    return t;
  };
  svg.appendChild(headerColT("Cases", countLabelX));
  svg.appendChild(headerColT("%", pctLabelX));
  svg.appendChild(
    svgEl("line", {
      x1: LEFT_PAD,
      y1: 30,
      x2: WIDTH - RIGHT_PAD,
      y2: 30,
      stroke: "#e5e7eb",
      "stroke-width": 1,
    }),
  );

  // Row rendering: uses the layout pass results for wrapping.
  for (let i = 0; i < visibleRows.length; i++) {
    const row = visibleRows[i];
    const layout = layouts[i];
    const yTop = rowTops[i];
    const rowHeight = layout.lineCount * ROW_HEIGHT;
    const firstLineMid = yTop + ROW_HEIGHT / 2;
    if (i % 2 === 1) {
      svg.appendChild(
        svgEl("rect", {
          x: LEFT_PAD - 4,
          y: yTop + 1,
          width: WIDTH - LEFT_PAD - RIGHT_PAD + 8,
          height: rowHeight - 2,
          rx: 3,
          ry: 3,
          fill: "#f8fafc",
        }),
      );
    }

    const rankT = svgEl("text", {
      x: LEFT_PAD + RANK_COL_W - 10,
      y: firstLineMid + 1,
      "text-anchor": "end",
      "dominant-baseline": "central",
      "font-size": 10,
      "font-variant-numeric": "tabular-nums",
      fill: "#9ca3af",
    });
    rankT.textContent = String(i + 1);
    svg.appendChild(rankT);

    renderActivityPillsSvg(svg, layout.pills, yTop, ROW_HEIGHT);

    // Count + %, anchored to the first line so the numbers stay next to the
    // start of each variant rather than floating in the middle of a
    // multi-line block.
    const countT = svgEl("text", {
      x: countLabelX,
      y: firstLineMid + 1,
      "text-anchor": "end",
      "dominant-baseline": "central",
      "font-size": 11,
      "font-weight": 600,
      "font-variant-numeric": "tabular-nums",
      fill: "#111827",
    });
    countT.textContent = row.count.toLocaleString("en");
    svg.appendChild(countT);

    const pct = totalTraces > 0 ? (100 * row.count) / totalTraces : 0;
    const pctT = svgEl("text", {
      x: pctLabelX,
      y: firstLineMid + 1,
      "text-anchor": "end",
      "dominant-baseline": "central",
      "font-size": 11,
      "font-variant-numeric": "tabular-nums",
      fill: "#374151",
    });
    pctT.textContent = `${pct.toFixed(1)}%`;
    svg.appendChild(pctT);
  }

  // Footer: summarize the variants we didn't render.
  if (hiddenRows > 0) {
    const y = HEADER_HEIGHT + totalRowsHeight + 14;
    const pct = totalTraces > 0 ? (100 * hiddenTraceCount) / totalTraces : 0;
    const foot = svgEl("text", {
      x: LEFT_PAD,
      y,
      "font-size": 10,
      "font-style": "italic",
      fill: "#6b7280",
    });
    foot.textContent = `…and ${hiddenRows} more variants (${hiddenTraceCount.toLocaleString("en")} cases, ${pct.toFixed(1)}%) not shown.`;
    svg.appendChild(foot);
  }

  return serializeSvg(svg);
}

function SelectionStatsBar({
  totalVariants,
  filteredCount,
  search,
  selCount,
  selTraces,
  selEvents,
  totalTraces,
  totalEvents,
  canFilter,
  onKeep,
  onExclude,
  onClear,
}: {
  totalVariants: number;
  filteredCount: number;
  search: string;
  selCount: number;
  selTraces: number;
  selEvents: number;
  totalTraces: number | undefined;
  totalEvents: number | undefined;
  /** Whether the host wired `onFilterVariants`; gates the Keep/Exclude actions. */
  canFilter: boolean;
  onKeep: () => void;
  onExclude: () => void;
  onClear: () => void;
}) {
  const pctTraces = totalTraces ? (100 * selTraces) / totalTraces : 0;
  const pctEvents = totalEvents ? (100 * selEvents) / totalEvents : 0;
  const fmt = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const hasSel = selCount > 0;
  return (
    <div className="flex items-center flex-wrap gap-2 px-2 py-1.5 rounded bg-[var(--gray-a3)] border border-[var(--gray-a6)] text-[12px]">
      <Text size="1" color="gray">
        {search ? `${filteredCount} of ${totalVariants}` : `${totalVariants}`} variant
        {totalVariants === 1 ? "" : "s"}
      </Text>
      <span className="text-[var(--gray-a6)]">·</span>
      {!hasSel ? (
        <Text size="1" color="gray">
          {canFilter ? "Pick variants to filter the log" : "Pick variants to inspect"}
        </Text>
      ) : (
        <>
          <Text size="1" weight="medium">
            {selCount} selected
          </Text>
          <Text size="1" color="gray">
            {selTraces.toLocaleString("en")} case{selTraces === 1 ? "" : "s"} ({fmt(pctTraces)}%) ·{" "}
            {selEvents.toLocaleString("en")} event{selEvents === 1 ? "" : "s"} ({fmt(pctEvents)}%)
          </Text>
        </>
      )}
      <div className="flex-1" />
      {/* Action group is always mounted (only its visibility toggles) so the bar
          reserves its full height up-front, so selecting a variant never shifts the
          table below. */}
      <div
        className={`flex items-center gap-2 ${hasSel ? "" : "invisible pointer-events-none"}`}
        aria-hidden={!hasSel}
      >
        {canFilter && (
          <>
            <Button
              size="1"
              variant="soft"
              color="green"
              onClick={onKeep}
              title="Keep only the selected variants (filter the log)"
            >
              <FaCheckCircle /> Keep selected
            </Button>
            <Button
              size="1"
              variant="soft"
              color="red"
              onClick={onExclude}
              title="Exclude the selected variants (filter the log)"
            >
              <FaMinusCircle /> Exclude selected
            </Button>
          </>
        )}
        <IconButton size="1" variant="ghost" color="gray" onClick={onClear} title="Clear selection">
          <FaTimes />
        </IconButton>
      </div>
    </div>
  );
}

export interface LogVariantsProps {
  /** Distinct trace variants of the log (from `get_log_trace_variants`). */
  variants: TraceVariants;
  /** Total number of traces in the log (drives "% of cases"). */
  numTraces: number;
  /** Total number of events in the log (drives selection aggregates). */
  numEvents: number;
  /** Optional callback when a single activity badge is clicked (drill into one
   *  activity, e.g. send-to-transforms). For the multi-variant checkbox
   *  selection, use {@link onSelectionChange} instead. */
  onSelect?: (activity: string) => void;
  /**
   * Optional callback emitting a variant-filter intent. The host turns this
   * into a `FilterVariants` transform ({@link KeepOrRemove} + `variants`); the
   * viewer only emits the selected variant indices and the requested mode.
   */
  onFilterVariants?: (sel: { variantIndices: number[]; mode: "keep" | "exclude" }) => void;
  /**
   * Optional callback fired whenever the checkbox selection changes, reporting
   * the current selection (independent of any keep/exclude action). Lets the
   * host react to "which variants/traces are selected": cross-highlight,
   * send-to-transforms, inspect, etc. `traceCount`/`eventCount` are the
   * aggregates across the selected variants.
   */
  onSelectionChange?: (sel: { variantIndices: number[]; traceCount: number; eventCount: number }) => void;
  /**
   * Optional initial checkbox selection (variant indices). Seeds the selection
   * on mount only; the component owns selection state afterwards. Hosts that
   * persist a selection (e.g. a FilterVariants transform editor) pass it here
   * and remount via `key` when the underlying log changes.
   */
  initialSelectedVariantIndices?: number[];
}

/**
 * Interactive trace-variant explorer. Lists an event log's distinct trace variants sorted by
 * frequency, each rendered as a chevron-badge activity sequence with per-variant case counts,
 * % of cases (coverage bar), and event counts. Supports activity search, expand/collapse,
 * incremental paging, multi-variant selection with a Keep/Exclude filter action, and SVG/PNG/JPEG
 * export advertised to a surrounding `<ViewerExportFrame>`.
 */
export function LogVariants({
  variants,
  numTraces,
  numEvents,
  onSelect,
  onFilterVariants,
  onSelectionChange,
  initialSelectedVariantIndices,
}: LogVariantsProps) {
  const { colorOf } = useViewerConfig({});
  const activityColorOf = (a: string) => colorOf?.("activity", a) ?? "#888888";

  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(
    () => new Set(initialSelectedVariantIndices ?? []),
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exportMaxRows, setExportMaxRows] = useState(15);

  const data = variants;
  const activities = variants.activities;
  const totalTraces = numTraces;
  const totalEvents = numEvents;

  const maxActSize = activities ? Math.max(...activities.map((a) => a.length)) : 20;

  // Pre-compute per-variant aggregates once. `traces` is `[activityIndices, count]`,
  // already sorted by count descending (the generated type is the precise tuple
  // `[number[], number]` thanks to the prefixItems->items codegen normalization).
  const variantRows = useMemo<VariantRow[]>(() => {
    if (!data || !activities) return [];
    return data.traces.map((trace, i) => {
      const [indices, count] = trace;
      const labels = indices.map((j) => activities[j] ?? "UNKNOWN");
      return {
        idx: i,
        indices,
        labels,
        count,
        eventCount: labels.length * count,
      };
    });
  }, [data, activities]);

  // Fuzzy-ish search: matches a variant if every whitespace-separated token in
  // the query is a case-insensitive substring of at least one activity in the
  // trace. Handles typical "pay confirm" style lookups.
  const filteredRows = useMemo(() => {
    if (!search.trim()) return variantRows;
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    return variantRows.filter(({ labels }) => {
      const hay = labels.map((a) => a.toLowerCase());
      return tokens.every((tok) => hay.some((a) => a.includes(tok)));
    });
  }, [variantRows, search]);

  const visibleRows = filteredRows.slice(0, visibleCount);

  // Selection aggregates (over the FULL variant set, not just filtered).
  const { selTraces, selEvents, selCount } = useMemo(() => {
    let t = 0;
    let e = 0;
    for (const i of selectedIdx) {
      const row = variantRows[i];
      if (row) {
        t += row.count;
        e += row.eventCount;
      }
    }
    return { selTraces: t, selEvents: e, selCount: selectedIdx.size };
  }, [selectedIdx, variantRows]);

  // Surface the live checkbox selection to the host (independent of keep/exclude).
  // The callback is held in a ref so a host passing a fresh inline closure each
  // render doesn't make this effect fire on every render; it should fire only
  // when the selection actually changes, else the emission storm churns host state.
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  useEffect(() => {
    onSelectionChangeRef.current?.({
      variantIndices: [...selectedIdx].sort((a, b) => a - b),
      traceCount: selTraces,
      eventCount: selEvents,
    });
  }, [selectedIdx, selTraces, selEvents]);

  const toggleSelect = (i: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Emit a filter intent for the current selection. The host maps this to a
  // `FilterVariants` transform; the viewer reports indices and mode.
  const applySelection = (mode: "keep" | "exclude") => {
    if (!onFilterVariants || selCount === 0) return;
    onFilterVariants({ variantIndices: [...selectedIdx].sort((a, b) => a - b), mode });
    setSelectedIdx(new Set());
  };

  const buildExportOptions = (maxRows?: number): TraceVariantsSvgOptions | null => {
    if (!data || !activities || totalTraces === undefined) return null;
    return {
      rows: data.traces.map((trace) => {
        const [indices, count] = trace;
        return { labels: indices.map((j) => activities[j] ?? "UNKNOWN"), count };
      }),
      totalTraces,
      maxRows,
      activityColor: (a: string) => activityColorOf(a),
      title: "Trace Variants",
    };
  };

  // Read the latest variants/colors at export time through a ref so the registered source is stable;
  // only the row-limit (shown in the menu) re-creates it.
  const toSvgRef = useRef<() => string | null>(() => null);
  toSvgRef.current = () => {
    const opts = buildExportOptions(Number.isFinite(exportMaxRows) ? exportMaxRows : undefined);
    return opts ? (buildTraceVariantsSvg(opts) ?? null) : null;
  };
  const exportSource = useMemo<VectorExportSource>(
    () => ({
      toSvg: () => toSvgRef.current(),
      menuExtras: (
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>
            Rows{" "}
            <Text size="1" color="gray" className="ml-1">
              {Number.isFinite(exportMaxRows) ? exportMaxRows : "All"}
            </Text>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.RadioGroup
              value={exportMaxRows.toString()}
              onValueChange={(v) =>
                setExportMaxRows(v === "all" ? Number.POSITIVE_INFINITY : parseInt(v, 10))
              }
            >
              {[10, 15, 25, 50, 100, 250].map((n) => (
                <DropdownMenu.RadioItem key={n} value={n.toString()} onSelect={(e) => e.preventDefault()}>
                  {n}
                </DropdownMenu.RadioItem>
              ))}
              <DropdownMenu.RadioItem value="all" onSelect={(e) => e.preventDefault()}>
                All
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      ),
    }),
    [exportMaxRows],
  );
  useRegisterExport("log-variants", exportSource);

  // Root sizes inline so it fills its container; inner layout uses Tailwind from the bundled stylesheet.
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-2 mb-2">
          <Text as="div" size="4" weight="bold">
            Trace Variants
          </Text>
        </div>

        {!data && <Skeleton className="w-full min-h-[20rem]" loading />}

        {data && activities && (
          <div className="grow flex flex-col gap-2 overflow-hidden" style={{ minHeight: 0 }}>
            {/* Activity search + select-all controls */}
            <div className="flex items-center gap-2">
              <TextField.Root
                size="1"
                placeholder="Search by activity (space-separated tokens)..."
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="!flex-1"
              >
                <TextField.Slot>
                  <FaSearch />
                </TextField.Slot>
                {search && (
                  <TextField.Slot>
                    <IconButton size="1" variant="ghost" color="gray" onClick={() => setSearch("")}>
                      <FaTimes />
                    </IconButton>
                  </TextField.Slot>
                )}
              </TextField.Root>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                title="Select none (all variants)"
                onClick={() => setSelectedIdx(new Set())}
              >
                <PiCircle />
              </IconButton>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                title="Invert (all variants)"
                onClick={() =>
                  setSelectedIdx((prev) => {
                    const next = new Set<number>();
                    for (let i = 0; i < variantRows.length; i++) if (!prev.has(i)) next.add(i);
                    return next;
                  })
                }
              >
                <PiCircleHalfFill />
              </IconButton>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                title={`Select all ${filteredRows.length} visible`}
                onClick={() =>
                  setSelectedIdx((prev) => {
                    const next = new Set(prev);
                    for (const r of filteredRows) next.add(r.idx);
                    return next;
                  })
                }
              >
                <PiCircleFill />
              </IconButton>
            </div>

            {/* Selection / coverage stats + filter actions */}
            <SelectionStatsBar
              totalVariants={variantRows.length}
              filteredCount={filteredRows.length}
              search={search}
              selCount={selCount}
              selTraces={selTraces}
              selEvents={selEvents}
              totalTraces={totalTraces}
              totalEvents={totalEvents}
              canFilter={!!onFilterVariants}
              onKeep={() => applySelection("keep")}
              onExclude={() => applySelection("exclude")}
              onClear={() => setSelectedIdx(new Set())}
            />

            {filteredRows.length === 0 && (
              <Callout.Root size="1">
                <Callout.Text>No variants match "{search}".</Callout.Text>
              </Callout.Root>
            )}

            <div className="grow overflow-auto" style={{ minHeight: 0 }}>
              <Table.Root variant="ghost">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell className="!w-6" />
                    <Table.ColumnHeaderCell className="!w-6" />
                    <Table.ColumnHeaderCell>Variant</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className="text-right">Cases</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className="text-right">% Cases</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className="text-right">Events</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleRows.map((row) => {
                    const isExpanded = expanded.has(row.idx);
                    const isSelected = selectedIdx.has(row.idx);
                    const showLabels = isExpanded
                      ? row.labels
                      : row.labels.slice(0, MAX_TRACE_LENGTH_COLLAPSED);
                    const truncated = !isExpanded && row.labels.length > MAX_TRACE_LENGTH_COLLAPSED;
                    return (
                      <Table.Row
                        key={row.idx}
                        className="!min-h-[4rem]"
                        style={{ background: isSelected ? "var(--accent-a3)" : undefined }}
                      >
                        <Table.Cell className="!align-middle">
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(row.idx)} />
                        </Table.Cell>
                        <Table.Cell className="!align-middle">
                          <IconButton
                            size="1"
                            variant="ghost"
                            color="gray"
                            title={isExpanded ? "Collapse" : "Expand"}
                            onClick={() => toggleExpand(row.idx)}
                            disabled={row.labels.length <= MAX_TRACE_LENGTH_COLLAPSED && !isExpanded}
                          >
                            {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                          </IconButton>
                        </Table.Cell>
                        <Table.Cell className="!h-fit min-w-0">
                          <div className="flex items-center flex-wrap gap-1">
                            {row.labels.length === 0 && <p className="italic font-light">Empty Trace</p>}
                            {truncated && (
                              <Text color="gray" size="1" className="w-full italic">
                                First {MAX_TRACE_LENGTH_COLLAPSED} of {row.labels.length} activities:
                              </Text>
                            )}
                            {showLabels.map((activity, j) => (
                              <div
                                key={`${j}-${activity}`}
                                onClick={onSelect ? () => onSelect(activity) : undefined}
                                style={onSelect ? { cursor: "pointer" } : undefined}
                              >
                                <ActivityChip
                                  activity={activity}
                                  color={activityColorOf(activity)}
                                  widthClass={maxActSize <= 4 ? "w-12" : "w-24"}
                                />
                              </div>
                            ))}
                          </div>
                          {isExpanded && (
                            <div className="mt-2 text-[11px] font-mono text-[var(--gray-a10)] break-all">
                              {row.labels.join(" → ")}
                            </div>
                          )}
                        </Table.Cell>
                        <Table.Cell className="text-right font-mono">
                          {row.count.toLocaleString("en")}
                        </Table.Cell>
                        <Table.Cell className="text-right font-mono">
                          {totalTraces === undefined ? (
                            <Skeleton>00.00%</Skeleton>
                          ) : (
                            <div className="flex flex-col items-center w-fit ml-auto">
                              {(Math.round((100 * 100 * row.count) / totalTraces) / 100).toLocaleString(
                                "en",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}
                              %
                              <Progress
                                color="gray"
                                radius="large"
                                size="1"
                                className="w-[3rem]"
                                value={(100 * row.count) / totalTraces}
                              />
                            </div>
                          )}
                        </Table.Cell>
                        <Table.Cell className="text-right font-mono">
                          {row.eventCount.toLocaleString("en")}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>

              {filteredRows.length > visibleCount && (
                <div className="flex justify-center mt-2">
                  <Button size="1" variant="soft" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, filteredRows.length - visibleCount)} more
                  </Button>
                </div>
              )}

              {data.traces.length > 200 && visibleCount >= filteredRows.length && (
                <Callout.Root size="1" className="!flex items-center mt-2">
                  <Callout.Icon>
                    <GiElephant className="size-5" />
                  </Callout.Icon>
                  <Callout.Text>
                    {filteredRows.length.toLocaleString("en")} variant{filteredRows.length === 1 ? "" : "s"}
                    {search ? ` matching "${search}"` : ""} (all shown).
                  </Callout.Text>
                </Callout.Root>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
