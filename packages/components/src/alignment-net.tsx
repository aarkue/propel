import { Badge, SegmentedControl, Text } from "@r4pm/components/ui";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { resolveMove } from "./shared/TraceAlignmentStrip";
import { AlignmentStrip } from "./shared/AlignmentStrip";
import { useVirtualRows } from "./shared/useVirtualRows";
import { StatCards } from "./shared/StatCards";
import { RankedBarList } from "./shared/RankedBarList";
import { useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { colorToHex } from "./dfg/util/colors";
import { PetriNetViewer, type PetriNet, type PetriNetOverlay } from "./petri-net";
import type { AlignmentAggregate, LogAlignments, VariantAlignmentResult } from "./shared/alignment-types";

// deviation rate = model_fires / (sync_fires + model_fires):
// 0 = always conforming, 1 = always a model-only insertion.

const PICKER_ROW_H = 29;

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const STOP_LOW = hexToRgb(colorToHex("green"));
const STOP_MID = hexToRgb(colorToHex("amber"));
const STOP_HIGH = hexToRgb(colorToHex("red"));

/** Piecewise-linear green->amber->red; `ratio` clamped to [0,1]. */
function heatmapRgb(ratio: number): Rgb {
  const t = Math.max(0, Math.min(1, ratio));
  const [from, to, local] = t < 0.5 ? [STOP_LOW, STOP_MID, t / 0.5] : [STOP_MID, STOP_HIGH, (t - 0.5) / 0.5];
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * local)) as Rgb;
}

const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** A silent (invisible) transition has no label; deviation rate is meaninglessly 1; skip it. */
function isSilent(net: PetriNet, transitionId: string): boolean {
  const label = net.transitions.find((t) => t.id === transitionId)?.label;
  return !label || label === "";
}

function displayLabel(net: PetriNet, transitionId: string): string {
  const label = net.transitions.find((t) => t.id === transitionId)?.label;
  return label && label !== "" ? label : "τ";
}

interface DeviationRow {
  id: string;
  label: string;
  sync: number;
  model: number;
  total: number;
  ratio: number;
}

function deviationRows(net: PetriNet, aggregated: AlignmentAggregate): DeviationRow[] {
  const rows: DeviationRow[] = [];
  for (const { id } of net.transitions) {
    if (isSilent(net, id)) continue;
    const stats = aggregated.transition_stats[id];
    if (!stats) continue;
    const total = stats.sync_fires + stats.model_fires;
    if (total === 0) continue;
    rows.push({
      id,
      label: displayLabel(net, id),
      sync: stats.sync_fires,
      model: stats.model_fires,
      total,
      ratio: stats.model_fires / total,
    });
  }
  rows.sort((a, b) => b.ratio - a.ratio || b.model - a.model);
  return rows;
}

/** Overlay coloring every transition by its deviation rate; untouched transitions are dimmed. */
function buildAggregateOverlay(net: PetriNet, aggregated: AlignmentAggregate): PetriNetOverlay {
  const transitionStyle: Record<string, CSSProperties> = {};
  for (const { id } of net.transitions) {
    const stats = aggregated.transition_stats[id];
    const total = stats ? stats.sync_fires + stats.model_fires : 0;
    if (total === 0) {
      transitionStyle[id] = { opacity: 0.35 };
      continue;
    }
    if (isSilent(net, id)) continue;
    const c = heatmapRgb(stats.model_fires / total);
    transitionStyle[id] = {
      borderColor: rgb(c),
      borderWidth: 3,
      backgroundColor: rgba(c, 0.18),
      fontWeight: 600,
    };
  }
  return { transition: (t) => ({ style: transitionStyle[t.id] }) };
}

/** A transition that fired while replaying a variant's alignment. */
interface FiredTransition {
  order: number;
  transitionId: string;
  kind: "sync" | "model";
  label: string | null;
}

const SYNC_HEX = colorToHex("green");
const MODEL_HEX = colorToHex("orange");

function firedTransitions(variant: VariantAlignmentResult, net: PetriNet): FiredTransition[] {
  if (!("Ok" in variant.result)) return [];
  const fired: FiredTransition[] = [];
  for (const move of variant.result.Ok.moves) {
    let transitionId: string | undefined;
    let kind: "sync" | "model" | undefined;
    if ("SyncMove" in move) {
      transitionId = move.SyncMove.transition;
      kind = "sync";
    } else if ("ModelMove" in move) {
      transitionId = move.ModelMove.transition;
      kind = "model";
    }
    if (transitionId && kind) {
      fired.push({
        order: fired.length + 1,
        transitionId,
        kind,
        label: net.transitions.find((t) => t.id === transitionId)?.label ?? null,
      });
    }
  }
  return fired;
}

/** Highlight one variant's fired transitions (numbered, colored by kind), dim untouched. */
function buildVariantOverlay(net: PetriNet, fired: FiredTransition[]): PetriNetOverlay {
  const transitionStyle: Record<string, CSSProperties> = {};
  const transitionLabel: Record<string, string> = {};
  const firedIds = new Set(fired.map((f) => f.transitionId));

  for (const { id } of net.transitions) {
    if (!firedIds.has(id)) transitionStyle[id] = { opacity: 0.35 };
  }

  const seen = new Set<string>();
  for (const f of fired) {
    if (seen.has(f.transitionId)) continue;
    seen.add(f.transitionId);
    const hex = f.kind === "sync" ? SYNC_HEX : MODEL_HEX;
    const orders = fired.filter((x) => x.transitionId === f.transitionId).map((x) => x.order);
    transitionStyle[f.transitionId] = {
      borderColor: hex,
      borderWidth: 3,
      boxShadow: `0 0 0 2px ${hex}55`,
      fontWeight: 600,
    };
    const baseLabel = f.label && f.label !== "" ? f.label : "τ";
    transitionLabel[f.transitionId] = `${orders.join("/")}. ${baseLabel}`;
  }

  return { transition: (t) => ({ style: transitionStyle[t.id], label: transitionLabel[t.id] }) };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--gray-9)",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

// ─── Custom deviation bar row ─────────────────────────────────────────────────

function DeviationBarRow({
  label,
  ratio,
  model,
  total,
}: Pick<DeviationRow, "label" | "ratio" | "model" | "total">) {
  const c = heatmapRgb(ratio);

  const { colorOf } = useViewerConfig({});
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "2px 8px 2px 6px",
        borderRadius: 6,
        height: 28,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 3,
          bottom: 3,
          width: `${ratio * 100}%`,
          borderRadius: 6,
          background: rgba(c, 0.18),
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          width: 8,
          height: 8,
          borderRadius: 2,
          flexShrink: 0,
          background: colorOf?.("activity", label),
        }}
      />
      <span
        className="truncate"
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--gray-12)",
          fontStyle: label === "τ" ? "italic" : undefined,
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{ position: "relative", fontSize: 12, color: "var(--gray-10)", flexShrink: 0 }}
      >
        {model}/{total}
      </span>
      <span
        className="tabular-nums"
        style={{
          position: "relative",
          fontSize: 12,
          color: rgb(c),
          flexShrink: 0,
          minWidth: 28,
          textAlign: "right",
          fontWeight: 600,
        }}
      >
        {(ratio * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Aggregated panel ─────────────────────────────────────────────────────────

function AggregatedPanel({ data }: { data: LogAlignments }) {
  const rows = useMemo(() => deviationRows(data.net, data.aggregated), [data.net, data.aggregated]);
  const logMoves = useMemo(
    () => Object.entries(data.aggregated.log_move_counts).sort((a, b) => b[1] - a[1]),
    [data.aggregated],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {data.fitness && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <StatCards
            indicator="bar"
            items={[
              {
                label: "Avg. fitness",
                value: pct(data.fitness.average_fitness),
                progress: data.fitness.average_fitness,
              },
              {
                label: "Perfect traces",
                value: pct(data.fitness.perfectly_fitting_frac),
                progress: data.fitness.perfectly_fitting_frac,
              },
            ]}
          />
          <Text size="1" color="gray">
            {data.aggregated.total_traces.toLocaleString("en")} traces · cost{" "}
            {data.fitness.total_costs.toLocaleString("en")}
          </Text>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionLabel>Transitions by deviation</SectionLabel>
        {rows.length === 0 ? (
          <Text size="1" color="gray">
            No transitions fired.
          </Text>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r) => (
              <DeviationBarRow key={r.id} label={r.label} ratio={r.ratio} model={r.model} total={r.total} />
            ))}
          </div>
        )}
      </div>

      {logMoves.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionLabel>Log-only moves</SectionLabel>
          <RankedBarList items={Object.fromEntries(logMoves)} scope="activity" />
        </div>
      )}
    </div>
  );
}

// ─── Variant panel ────────────────────────────────────────────────────────────

interface VariantPanelProps {
  data: LogAlignments;
  selectedIdx: number;
  onSelect: (idx: number) => void;
  variantsByFreq: Array<{ variant: VariantAlignmentResult; idx: number }>;
}

function VariantPanel({ data, selectedIdx, onSelect, variantsByFreq }: VariantPanelProps) {
  const selected = data.variant_alignments[selectedIdx];
  const cost = selected && "Ok" in selected.result ? selected.result.Ok.cost : null;
  const errored = selected ? "Err" in selected.result : false;

  const resolvedMoves = useMemo(
    () =>
      selected && "Ok" in selected.result
        ? selected.result.Ok.moves.map((m) => resolveMove(m, selected.activities, data.net))
        : [],
    [selected, data.net],
  );

  const pickerRef = useRef<HTMLDivElement>(null);
  const { virtualItems, totalSize, scrollToIndex } = useVirtualRows({
    count: variantsByFreq.length,
    rowHeight: PICKER_ROW_H,
    scrollRef: pickerRef,
  });
  const selectedPos = variantsByFreq.findIndex((v) => v.idx === selectedIdx);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Wanted side effect
  useEffect(() => {
    if (selectedPos >= 0) scrollToIndex(selectedPos);
  }, [selectedPos]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionLabel>Variant · by frequency</SectionLabel>
        <div
          ref={pickerRef}
          style={{
            border: "1px solid var(--gray-4)",
            borderRadius: 8,
            overflow: "hidden",
            maxHeight: 196,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ position: "relative", height: totalSize, width: "100%" }}>
            {virtualItems.map((vi) => {
              const { variant, idx } = variantsByFreq[vi.index];
              const isSelected = idx === selectedIdx;
              const label = variant.activities.join(" → ") || "(empty trace)";
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelect(idx)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                    height: PICKER_ROW_H,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px",
                    border: "none",
                    borderBottom: "1px solid var(--gray-3)",
                    background: isSelected ? "var(--accent-3)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    minWidth: 0,
                  }}
                >
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: 11,
                      color: isSelected ? "var(--accent-11)" : "var(--gray-9)",
                      flexShrink: 0,
                      minWidth: 28,
                      textAlign: "right",
                    }}
                  >
                    {variant.frequency}×
                  </span>
                  <span
                    className="truncate"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      color: isSelected ? "var(--accent-12)" : "var(--gray-12)",
                      fontWeight: isSelected ? 500 : 400,
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text size="2" weight="bold" style={{ color: "var(--gray-11)" }}>
          Cost
        </Text>
        {errored ? (
          <Badge color="red" size="1">
            unaligned
          </Badge>
        ) : (
          <Badge color={cost === 0 ? "green" : "gray"} size="1">
            {cost}
          </Badge>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SYNC_HEX, flexShrink: 0 }} />
            <Text size="1" color="gray">
              sync
            </Text>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: MODEL_HEX, flexShrink: 0 }} />
            <Text size="1" color="gray">
              model-only
            </Text>
          </span>
        </span>
      </div>

      {resolvedMoves.length > 0 && !errored && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionLabel>Alignment</SectionLabel>
          <AlignmentStrip moves={resolvedMoves} />
        </div>
      )}

      {errored && selected && "Err" in selected.result && (
        <Text size="1" color="red">
          {JSON.stringify(selected.result.Err)}
        </Text>
      )}
    </div>
  );
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

type Mode = "aggregated" | "variant";

/**
 * Alignment viewer: Petri net on the left, analysis sidebar on the right.
 *
 * Aggregated mode colors every transition by deviation rate (green = conforming,
 * red = always model-only) and lists transitions + log-only activities ranked by
 * deviation. Variant mode lets you pick any trace variant and inspect its
 * alignment path on the net (sync = green, model-only = violet, numbered in
 * firing order).
 */
export function AlignmentNetViewer({ data }: ViewerProps<LogAlignments>) {
  const [mode, setMode] = useState<Mode>("aggregated");

  const aggregateOverlay = useMemo(
    () => buildAggregateOverlay(data.net, data.aggregated),
    [data.net, data.aggregated],
  );

  const variantsByFreq = useMemo(
    () =>
      data.variant_alignments
        .map((variant, idx) => ({ variant, idx }))
        .sort((a, b) => b.variant.frequency - a.variant.frequency),
    [data.variant_alignments],
  );

  const [variantIdx, setVariantIdx] = useState<number>(() => variantsByFreq[0]?.idx ?? 0);
  const selectedVariant = data.variant_alignments[variantIdx];
  const fired = useMemo(
    () => (selectedVariant ? firedTransitions(selectedVariant, data.net) : []),
    [selectedVariant, data.net],
  );
  const variantOverlay = useMemo(() => buildVariantOverlay(data.net, fired), [fired, data.net]);

  const overlay = mode === "aggregated" ? aggregateOverlay : variantOverlay;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", minHeight: 256 }}>
      {/* Net */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <PetriNetViewer data={data.net} overlay={overlay} />
      </div>

      {/* Sidebar */}
      <div
        className="w-1/3"
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--gray-4)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--gray-4)",
            flexShrink: 0,
          }}
        >
          <SegmentedControl.Root
            size="1"
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            style={{ width: "100%" }}
          >
            <SegmentedControl.Item value="aggregated">Aggregated</SegmentedControl.Item>
            <SegmentedControl.Item value="variant">By variant</SegmentedControl.Item>
          </SegmentedControl.Root>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 16px" }}>
          {mode === "aggregated" ? (
            <AggregatedPanel data={data} />
          ) : (
            <VariantPanel
              data={data}
              selectedIdx={variantIdx}
              onSelect={setVariantIdx}
              variantsByFreq={variantsByFreq}
            />
          )}
        </div>
      </div>
    </div>
  );
}
