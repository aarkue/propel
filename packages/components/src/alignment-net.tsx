import { VariantSelect } from "./shared/VariantSelect";
import { Badge, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { useViewSetting } from "./viewer/view-state";
import { type MoveKind, MoveGlyphIcon, resolveMove } from "./shared/TraceAlignmentStrip";
import { MOVE_TERMS, moveColor } from "./shared/move-terms";
import { AlignmentStrip } from "./shared/AlignmentStrip";
import { RankedBarList } from "./shared/RankedBarList";
import { useViewerConfig, type ViewerProps } from "./viewer/viewer-config";
import { colorToHex } from "./dfg/util/colors";
import { Bar, fmtInt, Metric, MetricRow, type Option, scoreTone, Section, Segmented } from "./kit";
import { PetriNetViewer, type PetriNet, type PetriNetOverlay, type SvgBox } from "./petri-net";
import type {
  AlignmentAggregate,
  LogAlignments,
  PrecisionSummary,
  VariantAlignmentResult,
} from "./shared/alignment-types";
import { TransitionLabel } from "./petri/editor/helpers/transition-label";
import type { ElementStyle } from "./viz";

// deviation rate = model_fires / (sync_fires + model_fires):
// 0 = always conforming, 1 = always a model-only insertion.

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Deviations take the colors of their moves everywhere, never the green-amber-red of the scores.
const SYNC_RGB = hexToRgb(moveColor("sync"));
const MODEL_RGB = hexToRgb(moveColor("model"));

const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const byteHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
/** `#rrggbb`, or `#rrggbbaa` with `alpha`: colors the SVG export can carry. */
const hex = (c: Rgb, alpha?: number) =>
  `#${c.map(byteHex).join("")}${alpha === undefined ? "" : byteHex(alpha * 255)}`;

const DIMMED: ElementStyle = { opacity: 0.35 };

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

/** Synchronous, skipped (model-only) and not-followed (log-only) moves of one activity. */
interface Moves {
  sync: number;
  model: number;
  log: number;
}

/** A thin stacked bar of `m`, ProM style. */
function MovesBar({ m, style }: { m: Moves; style?: React.CSSProperties }) {
  const total = m.sync + m.model + m.log;
  if (total === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        height: 5,
        borderRadius: 3,
        overflow: "hidden",
        background: "var(--gray-a4)",
        ...style,
      }}
    >
      {(["sync", "model", "log"] as const).map((k) =>
        m[k] > 0 ? (
          <div key={k} style={{ width: `${(m[k] / total) * 100}%`, background: moveColor(k) }} />
        ) : null,
      )}
    </div>
  );
}

/** `MovesBar` for the exported image, at the bottom of a transition's `box`. */
function movesBarSvg(m: Moves, box: SvgBox, clipId: string): string {
  const total = m.sync + m.model + m.log;
  if (total === 0) return "";
  const x = box.x + 6;
  const width = box.width - 12;
  const y = box.y + box.height - 10;
  let at = x;
  const parts = (["sync", "model", "log"] as const)
    .filter((k) => m[k] > 0)
    .map((k) => {
      const w = (m[k] / total) * width;
      const rect = `<rect x="${at.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="5" fill="${moveColor(k)}"/>`;
      at += w;
      return rect;
    });
  return `<clipPath id="${clipId}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="5" rx="2.5"/></clipPath><g clip-path="url(#${clipId})">${parts.join("")}</g>`;
}

const movesTitle = (label: string, m: Moves, sharedLog: number) =>
  `${label}: ${fmtInt(m.sync)} fit, ${fmtInt(m.model)} missing events (model moves), ${
    sharedLog > 0
      ? `and ${fmtInt(sharedLog)} extra events of this activity, not shown on the bar: more than one transition has this label`
      : `${fmtInt(m.log)} extra events (log moves)`
  }`;

/**
 * Overlay putting each labeled transition's moves on it as a bar (ProM style): in sync, skipped by
 * the log, and events of its activity the model could not follow. Extra events belong to an activity,
 * not a transition, so they show only on the one transition with that label. A transition without deviations
 * is outlined in the sync color, one with deviations in the color of its more frequent deviation,
 * filled more strongly the larger their share. Transitions no trace reached are dimmed.
 */
function buildAggregateOverlay(net: PetriNet, aggregated: AlignmentAggregate): PetriNetOverlay {
  const transitionStyle: Record<string, ElementStyle> = {};
  const moves: Record<string, Moves> = {};
  const sharedLog: Record<string, number> = {};
  const transitionsWith = new Map<string, number>();
  for (const { label } of net.transitions)
    if (label) transitionsWith.set(label, (transitionsWith.get(label) ?? 0) + 1);
  for (const { id, label } of net.transitions) {
    const stats = aggregated.transition_stats[id];
    const total = stats ? stats.sync_fires + stats.model_fires : 0;
    if (total === 0) {
      transitionStyle[id] = DIMMED;
      continue;
    }
    if (isSilent(net, id) || !label) continue;
    const logMoves = aggregated.log_move_counts[label] ?? 0;
    const unique = transitionsWith.get(label) === 1;
    const m = { sync: stats.sync_fires, model: stats.model_fires, log: unique ? logMoves : 0 };
    moves[id] = m;
    sharedLog[id] = unique ? 0 : logMoves;
    const share = (m.model + m.log) / (m.sync + m.model + m.log);
    const c = share === 0 ? SYNC_RGB : hexToRgb(moveColor(m.model >= m.log ? "model" : "log"));
    transitionStyle[id] = { stroke: hex(c), stroke_width: 2, fill: hex(c, 0.06 + 0.3 * share) };
  }
  return {
    transition: (t) => {
      const elementStyle = transitionStyle[t.id];
      const m = moves[t.id];
      const label = t.label ?? "";
      return {
        elementStyle,
        style: elementStyle?.fill ? { fontWeight: 600 } : undefined,
        renderContent: m
          ? () => (
              <>
                <TransitionLabel
                  label={label}
                  marginBottom={6}
                  title={movesTitle(label, m, sharedLog[t.id])}
                />
                <MovesBar m={m} style={{ position: "absolute", left: 6, right: 6, bottom: 5 }} />
              </>
            )
          : undefined,
        exportDecoration: m
          ? (box) => movesBarSvg(m, box, `moves-${t.id.replace(/[^\w-]/g, "_")}`)
          : undefined,
      };
    },
  };
}

/** Activities whose events the model could not follow at all: no transition carries their label. */
function missingActivities(net: PetriNet, aggregated: AlignmentAggregate): [string, number][] {
  const labels = new Set(net.transitions.map((t) => t.label).filter(Boolean));
  return Object.entries(aggregated.log_move_counts)
    .filter(([a, n]) => n > 0 && !labels.has(a))
    .sort((a, b) => b[1] - a[1]);
}

/** The move colors, with the icons the alignment strips mark each move with. */
function MovesLegend() {
  const item = (kind: MoveKind) => (
    <span
      key={kind}
      title={MOVE_TERMS[kind].explain("case")}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "help" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 6,
          color: moveColor(kind),
          background: `var(--${MOVE_TERMS[kind].color}-a3)`,
          border: `1.5px solid ${moveColor(kind)}`,
        }}
      >
        <MoveGlyphIcon kind={kind} size={13} />
      </span>
      <Text size="2">{MOVE_TERMS[kind].name}</Text>
      <Text size="2" color="gray">
        ({MOVE_TERMS[kind].term})
      </Text>
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
      {(["sync", "model", "log"] as const).map(item)}
    </div>
  );
}

const ESCAPE = hexToRgb(colorToHex("amber"));
const END_LABEL = "(stop)";
const activityName = (a: string | null | undefined) => a ?? END_LABEL;

/** Overlay marking each transition by how much never-taken behavior it allows, in amber. */
function buildPrecisionOverlay(net: PetriNet, precision: PrecisionSummary): PetriNetOverlay {
  const weightOf = new Map(precision.by_activity.map((a) => [a.activity ?? null, a.weight]));
  const max = Math.max(1, ...precision.by_activity.map((a) => a.weight));
  return {
    transition: (t) => {
      const label = net.transitions.find((x) => x.id === t.id)?.label;
      const w = label ? weightOf.get(label) : undefined;
      if (!w) return { elementStyle: DIMMED };
      const share = w / Math.max(1, precision.weighted_escaping);
      const elementStyle: ElementStyle = {
        stroke: hex(ESCAPE),
        stroke_width: 1 + 3 * (w / max),
        fill: hex(ESCAPE, 0.1 + 0.4 * (w / max)),
        extra_label: `escapes ${pct(share)}`,
      };
      return { elementStyle, style: { fontWeight: 600 } };
    },
  };
}

const Step = ({ name, escaping }: { name: string; escaping?: boolean }) => (
  <span
    style={{
      display: "inline-block",
      maxWidth: 150,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      verticalAlign: "bottom",
      padding: "1px 7px",
      borderRadius: 999,
      fontSize: 11.5,
      lineHeight: "18px",
      background: escaping ? "var(--amber-a4)" : "var(--gray-a3)",
      color: escaping ? "var(--amber-12)" : "var(--gray-11)",
      fontWeight: escaping ? 600 : 400,
      border: escaping ? "1px solid var(--amber-a7)" : "1px solid transparent",
    }}
    title={name}
  >
    {name}
  </span>
);

function PrecisionPanel({ precision }: { precision: PrecisionSummary }) {
  const maxActivity = Math.max(1, ...precision.by_activity.map((a) => a.weight));
  const edges = precision.top_edges.slice(0, 20);
  const maxEdge = Math.max(1, ...edges.map((e) => e.weight));
  const p = precision.precision;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <MetricRow>
        <Metric
          label="Precision"
          value={pct(p)}
          tone={scoreTone(p)}
          hint={precision.search_limit_reached ? "approximate: a search limit was hit" : "escaping edges"}
        />
        <Metric label="States" value={fmtInt(precision.num_states)} hint="reached by the log" />
      </MetricRow>
      <Text size="1" color="gray">
        Where the model allows a step that no trace takes in the same state. Marked amber on the net.
      </Text>
      {precision.by_activity.length === 0 ? (
        <Text size="2" color="green">
          The model allows nothing the log does not do.
        </Text>
      ) : (
        <>
          <Section title="Allowed but never taken" subtitle="Share of all escaping behavior">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {precision.by_activity.map((a) => {
                const share = a.weight / Math.max(1, precision.weighted_escaping);
                return (
                  <Bar
                    key={activityName(a.activity)}
                    value={a.weight / maxActivity}
                    color="var(--amber-9)"
                    label={activityName(a.activity)}
                    hint={pct(share)}
                  />
                );
              })}
            </div>
          </Section>
          <Section
            title="Heaviest escaping edges"
            subtitle="The state, by its last steps, and the step never taken there"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {edges.map((e, i) => (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}
                  title={`State after ${e.prefix_len} steps, reached by ${fmtInt(e.weight)} traces`}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, rowGap: 4 }}>
                    <Text size="1" color="gray">
                      {e.prefix_len === 0 ? "At the start" : "After"}
                    </Text>
                    {e.prefix_len > e.prefix_tail.length && (
                      <Text size="1" color="gray">
                        ...
                      </Text>
                    )}
                    {e.prefix_tail.map((s, k) => (
                      <Step key={k} name={activityName(s)} />
                    ))}
                    <Text size="1" style={{ color: "var(--amber-11)" }}>
                      →
                    </Text>
                    <Step name={activityName(e.escaping)} escaping />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Bar value={e.weight / maxEdge} height={3} color="var(--amber-8)" style={{ flex: 1 }} />
                    <Text
                      size="1"
                      color="gray"
                      style={{ fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}
                    >
                      {fmtInt(e.weight)} traces
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/** A transition that fired while replaying a variant's alignment. */
interface FiredTransition {
  order: number;
  transitionId: string;
  kind: "sync" | "model";
  label: string | null;
}

const SYNC_HEX = moveColor("sync");
const MODEL_HEX = moveColor("model");

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

/** Highlight one variant's fired transitions (colored by kind, numbered by step), dim untouched. */
function buildVariantOverlay(net: PetriNet, fired: FiredTransition[]): PetriNetOverlay {
  const transitionStyle: Record<string, ElementStyle> = {};
  const ringColor: Record<string, string> = {};
  const firedIds = new Set(fired.map((f) => f.transitionId));

  for (const { id } of net.transitions) {
    if (!firedIds.has(id)) transitionStyle[id] = DIMMED;
  }

  const seen = new Set<string>();
  for (const f of fired) {
    if (seen.has(f.transitionId)) continue;
    seen.add(f.transitionId);
    const color = f.kind === "sync" ? SYNC_HEX : MODEL_HEX;
    const orders = fired.filter((x) => x.transitionId === f.transitionId).map((x) => x.order);
    transitionStyle[f.transitionId] = {
      stroke: color,
      stroke_width: 3,
      // A silent transition is a slim bar with no room for a line of text.
      extra_label: f.label ? orders.map((o) => `#${o}`).join(" ") : undefined,
    };
    ringColor[f.transitionId] = color;
  }

  return {
    transition: (t) => {
      const ring = ringColor[t.id];
      return {
        elementStyle: transitionStyle[t.id],
        style: ring ? { boxShadow: `0 0 0 2px ${ring}55`, fontWeight: 600 } : undefined,
      };
    },
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="r4pm-eyebrow">{children}</span>;
}

function DeviationBarRow({
  label,
  ratio,
  model,
  total,
}: Pick<DeviationRow, "label" | "ratio" | "model" | "total">) {
  const c = MODEL_RGB;

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

const logMoveColor = () => moveColor("log");

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
          <MetricRow>
            <Metric
              label="Trace fitness"
              value={pct(data.fitness.average_fitness)}
              progress={data.fitness.average_fitness}
              tone={scoreTone(data.fitness.average_fitness)}
            />
            <Metric
              label="Fitting traces"
              value={pct(data.fitness.perfectly_fitting_frac)}
              progress={data.fitness.perfectly_fitting_frac}
              tone={scoreTone(data.fitness.perfectly_fitting_frac)}
            />
            {data.precision && (
              <Metric
                label="Precision"
                value={pct(data.precision.precision)}
                progress={data.precision.precision}
                tone={scoreTone(data.precision.precision)}
              />
            )}
          </MetricRow>
          <Text size="1" color="gray">
            {data.aggregated.total_traces.toLocaleString("en")} traces · cost{" "}
            {data.fitness.total_costs.toLocaleString("en")}
          </Text>
        </div>
      )}

      <Section
        title="Transitions by deviation"
        subtitle="Share of firings without a matching event (missing events)"
      >
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
      </Section>

      {logMoves.length > 0 && (
        <Section
          title="Extra events (log moves)"
          subtitle="Events the model does not allow at that point, by activity"
        >
          <RankedBarList items={Object.fromEntries(logMoves)} scope="activity" colorOf={logMoveColor} />
        </Section>
      )}
    </div>
  );
}

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

  const selectedPos = variantsByFreq.findIndex((v) => v.idx === selectedIdx);
  const options = useMemo(
    () =>
      variantsByFreq.map(({ variant }) => ({
        activities: variant.activities,
        cases: variant.frequency,
        note: "Ok" in variant.result ? `cost ${variant.result.Ok.cost}` : "unaligned",
      })),
    [variantsByFreq],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionLabel>Variant · by frequency</SectionLabel>
        <VariantSelect
          variants={options}
          value={selectedPos >= 0 ? selectedPos : null}
          onChange={(i) => onSelect(variantsByFreq[i].idx)}
        />
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
          <AlignmentStrip moves={resolvedMoves} exportKey="alignment" />
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

type Mode = "aggregated" | "variant" | "precision";
const MODES: Option<Mode>[] = [
  { value: "aggregated", label: "Fitness" },
  { value: "variant", label: "By variant" },
  { value: "precision", label: "Precision" },
];

/** Petri net + analysis sidebar: fitness colors transitions by deviation rate, by-variant replays one trace's alignment path, precision marks the behavior the log never takes. */
export function AlignmentNetViewer({ data }: ViewerProps<LogAlignments>) {
  const [mode, setMode] = useViewSetting<Mode>("mode", "aggregated");

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

  const [variantIdx, setVariantIdx] = useViewSetting<number>("variantIdx", variantsByFreq[0]?.idx ?? 0);
  const selectedVariant = data.variant_alignments[variantIdx];
  const fired = useMemo(
    () => (selectedVariant ? firedTransitions(selectedVariant, data.net) : []),
    [selectedVariant, data.net],
  );
  const variantOverlay = useMemo(() => buildVariantOverlay(data.net, fired), [fired, data.net]);

  const precisionOverlay = useMemo(
    () => (data.precision ? buildPrecisionOverlay(data.net, data.precision) : undefined),
    [data.net, data.precision],
  );
  const shownMode = mode === "precision" && !data.precision ? "aggregated" : mode;
  const missing = useMemo(() => missingActivities(data.net, data.aggregated), [data.net, data.aggregated]);
  const overlay =
    shownMode === "precision"
      ? precisionOverlay
      : shownMode === "aggregated"
        ? aggregateOverlay
        : variantOverlay;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", minHeight: 256 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PetriNetViewer data={data.net} overlay={overlay} />
        </div>
        {shownMode === "aggregated" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 12px",
              borderTop: "1px solid var(--gray-a4)",
            }}
          >
            <MovesLegend />
            {missing.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <Text size="2" weight="medium" style={{ color: `var(--${MOVE_TERMS.log.color}-11)` }}>
                  Not in the model:
                </Text>
                {missing.map(([a, n]) => (
                  <Badge key={a} color={MOVE_TERMS.log.color} variant="soft" size="2">
                    {a} · {fmtInt(n)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--gray-4)",
            flexShrink: 0,
          }}
        >
          <Segmented
            value={shownMode}
            options={data.precision ? MODES : MODES.filter((m) => m.value !== "precision")}
            onChange={setMode}
            fill
            aria-label="Analysis"
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 16px" }}>
          {shownMode === "precision" && data.precision ? (
            <PrecisionPanel precision={data.precision} />
          ) : shownMode === "aggregated" ? (
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
