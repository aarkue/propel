import { Badge, Callout, Card, Table, Text } from "@r4pm/components/ui";
import { memo, useCallback, useMemo, useRef } from "react";
import type { LogAlignments, VariantAlignmentResult } from "./shared/alignment-types";
import { AlignmentStrip } from "./shared/AlignmentStrip";
import { CoverageBar } from "./shared/CoverageBar";
import { StatCards } from "./shared/StatCards";
import { resolveMove, type ResolvedMove } from "./shared/TraceAlignmentStrip";
import { useVirtualRows } from "./shared/useVirtualRows";
import { useViewerConfig, type ViewerProps } from "./viewer/viewer-config";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
// Fixed virtualized row heights. The deviation strip is a two-lane + central-axis layout
// (~92px), so it needs more room than the single-line trace strip.
const ROW_H_TRACE = 116;
const ROW_H_DEVIATION = 116;

function FitnessHeader({ fitness }: { fitness: NonNullable<LogAlignments["fitness"]> }) {
  return (
    <StatCards
      items={[
        { label: "Avg. fitness", value: pct(fitness.average_fitness), progress: fitness.average_fitness },
        { label: "Log fitness", value: pct(fitness.log_fitness), progress: fitness.log_fitness },
        {
          label: "Perfectly fitting",
          value: pct(fitness.perfectly_fitting_frac),
          progress: fitness.perfectly_fitting_frac,
        },
        { label: "Total cost", value: fitness.total_costs },
      ]}
    />
  );
}

interface VariantRow {
  idx: number;
  variant: VariantAlignmentResult;
  cost: number | null;
  errored: boolean;
}

/**
 * One virtualized row. Memoized on stable props (cached `moves` ref, stable `colorOf`) so that
 * scrolling - which re-renders the list container every frame - does not re-reconcile the
 * (expensive, one-node-per-move) alignment strip of rows that stay in the window.
 */
const AlignmentRow = memo(function AlignmentRow({
  frequency,
  share,
  errored,
  cost,
  errText,
  moves,
  rowH,
  colorOf,
}: {
  frequency: number;
  share: number;
  errored: boolean;
  cost: number | null;
  errText: string | null;
  moves: ResolvedMove[];
  rowH: number;
  colorOf: (activity: string) => string;
}) {
  return (
    <Table.Row style={{ height: rowH }}>
      <Table.Cell className="text-right font-mono whitespace-nowrap" style={{ width: "1%" }}>
        {frequency.toLocaleString("en")}
      </Table.Cell>
      <Table.Cell className="text-right font-mono whitespace-nowrap" style={{ width: "1%" }}>
        <CoverageBar
          value={share}
          label={`${share.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
        />
      </Table.Cell>
      <Table.Cell className="text-right font-mono whitespace-nowrap" style={{ width: "1%" }}>
        {errored ? (
          <Badge color="red" size="1" title="Alignment failed for this variant">
            unaligned
          </Badge>
        ) : (
          <Badge color={cost === 0 ? "green" : "gray"} size="1">
            {cost}
          </Badge>
        )}
      </Table.Cell>
      <Table.Cell className="min-w-0">
        {errored ? (
          <Text size="1" color="red">
            {errText ?? "error"}
          </Text>
        ) : (
          <div style={{ height: rowH - 16, overflowX: "auto", overflowY: "hidden" }}>
            <AlignmentStrip singleLine moves={moves} colorOf={colorOf} />
          </div>
        )}
      </Table.Cell>
    </Table.Row>
  );
});

/**
 * Variant-explorer-style list of per-variant alignments. Each row shows the
 * frequency / share, the alignment cost, and an alignment strip (trace or
 * deviation style, per `cfg.alignmentStyle`) with per-column move-type coloring.
 */
export function AlignmentListViewer(props: ViewerProps<LogAlignments>) {
  const { data } = props;
  const cfg = useViewerConfig(props);
  const rows = useMemo<VariantRow[]>(() => {
    return data.variant_alignments
      .map((variant, idx) => {
        const errored = "Err" in variant.result;
        const cost = "Ok" in variant.result ? variant.result.Ok.cost : null;
        return { idx, variant, cost, errored };
      })
      .sort((a, b) => b.variant.frequency - a.variant.frequency);
  }, [data]);

  const totalFreq = useMemo(
    () => data.variant_alignments.reduce((s, v) => s + v.frequency, 0),
    [data.variant_alignments],
  );

  // The real scroller is this component's own `overflow-auto` div. Radix `Table.Root`'s inner
  // ScrollArea is inert here: `rt-TableRoot` is height:auto, so the ScrollArea grows to content
  // and never scrolls. Point the virtualizer at our bounded div, NOT the Radix viewport.
  const rowH = (cfg.alignmentStyle ?? "trace") === "deviation" ? ROW_H_DEVIATION : ROW_H_TRACE;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { virtualItems, totalSize } = useVirtualRows({
    count: rows.length,
    rowHeight: rowH,
    scrollRef,
    overscan: 4,
  });

  // Stable identity so memoized rows don't re-render on every scroll frame.
  const colorOf = useCallback(
    (activity: string) => cfg.colorOf?.("activity", activity) ?? "#888888",
    [cfg.colorOf],
  );
  // Cache resolved moves per variant (reset when the dataset changes) so scrolling reuses the
  // same array reference and the memoized row can bail out of re-rendering.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Wanted side effect
  const movesCache = useMemo(() => new Map<number, ResolvedMove[]>(), [data]);

  const padTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const padBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1].start + virtualItems[virtualItems.length - 1].size)
      : 0;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div>
            <Text as="div" size="4" weight="bold">
              Alignments
            </Text>
            <Text size="1" color="gray">
              {rows.length.toLocaleString("en")} variant{rows.length === 1 ? "" : "s"}
            </Text>
          </div>
          {data.fitness && (
            <div className="ml-auto">
              <FitnessHeader fitness={data.fitness} />
            </div>
          )}
        </div>

        {rows.length === 0 && (
          <Callout.Root size="1">
            <Callout.Text>No variant alignments to show.</Callout.Text>
          </Callout.Root>
        )}

        <div className="grow" style={{ position: "relative", minHeight: 0 }}>
          <div
            ref={scrollRef}
            className="overflow-auto"
            style={{ position: "absolute", inset: 0, overflowAnchor: "none" }}
          >
            <Table.Root variant="ghost">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell className="text-right whitespace-nowrap" style={{ width: "1%" }}>
                    Frequency
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="text-right whitespace-nowrap" style={{ width: "1%" }}>
                    % Cases
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="text-right whitespace-nowrap" style={{ width: "1%" }}>
                    Cost
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Alignment</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {padTop > 0 && (
                  <tr>
                    <td colSpan={4} style={{ height: padTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualItems.map((vi) => {
                  const row = rows[vi.index];
                  const share = totalFreq > 0 ? (100 * row.variant.frequency) / totalFreq : 0;
                  let moves = movesCache.get(row.idx);
                  if (!moves) {
                    moves =
                      !row.errored && "Ok" in row.variant.result
                        ? row.variant.result.Ok.moves.map((m) =>
                            resolveMove(m, row.variant.activities, data.net),
                          )
                        : [];
                    movesCache.set(row.idx, moves);
                  }
                  const errText = row.errored
                    ? "Err" in row.variant.result
                      ? JSON.stringify(row.variant.result.Err)
                      : "error"
                    : null;
                  return (
                    <AlignmentRow
                      key={row.idx}
                      frequency={row.variant.frequency}
                      share={share}
                      errored={row.errored}
                      cost={row.cost}
                      errText={errText}
                      moves={moves}
                      rowH={rowH}
                      colorOf={colorOf}
                    />
                  );
                })}
                {padBottom > 0 && (
                  <tr>
                    <td colSpan={4} style={{ height: padBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      </Card>
    </div>
  );
}
