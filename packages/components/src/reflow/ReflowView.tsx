import { Flex, Text } from "@r4pm/components/ui";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { inkOn } from "../dfg/util/colors";
import {
  fmtInt,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  Section,
  Toolbar,
  ToolbarDivider,
  TypeChip,
} from "../kit";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { type ReflowCellState, gridOrder, type ReflowCell, type ReflowSummary, viaText } from "./model";

export interface ReflowControls {
  theta: number;
  search: "heuristic" | "exact";
  expand: boolean;
}

export const DEFAULT_REFLOW_CONTROLS: ReflowControls = { theta: 0.95, search: "heuristic", expand: false };

export interface ReflowViewProps extends ViewerProps<ReflowSummary> {
  /** Without them the toolbar shows no settings. */
  controls?: ReflowControls;
  onControlsChange?: (next: ReflowControls) => void;
  /** Toolbar actions at the end, e.g., making the flow log. */
  toolbarEnd?: ReactNode;
}

const THETAS: Option<string>[] = [
  { value: "1", label: "100%", description: "A type follows only if it does for every event" },
  { value: "0.99", label: "99%", description: "Tolerate 1% of events that break the relation" },
  { value: "0.95", label: "95%", description: "Tolerate 5% (default)" },
  { value: "0.9", label: "90%", description: "Tolerate 10%, for fewer arcs and a rougher reconstruction" },
];
const SEARCHES: Option<ReflowControls["search"]>[] = [
  { value: "heuristic", label: "Heuristic", description: "Fast, and usually finds the fewest arcs" },
  {
    value: "exact",
    label: "Exact",
    description: "Branch and bound for the fewest arcs, within a work budget",
  },
];
const EXPAND: Option<"off" | "on">[] = [
  { value: "off", label: "Off", description: "Only participations the log records" },
  {
    value: "on",
    label: "On",
    description: "Also write participations a relation determines, when they show a new ordering",
  },
];

const STATE_TEXT: Record<ReflowCellState, string> = {
  flow: "Flows here, so its participations add directly-follows arcs.",
  implied: "Follows from a flowing type at this activity, so it adds no arcs of its own.",
  involved: "Takes part, but no flowing type here determines it. It is kept as an annotation.",
};

/**
 * What Reflow found for a log: how many arcs vanish, and per activity and object type whether the
 * participations flow, follow from a flowing type, or are only involved.
 */
export function ReflowView({
  data,
  controls,
  onControlsChange,
  toolbarEnd,
  colorOf,
  format,
}: ReflowViewProps) {
  const cfg = useViewerConfig({ colorOf, format });
  const color = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--accent-9)";
  const { activities, types } = useMemo(() => gridOrder(data), [data]);
  const byKey = useMemo(() => new Map(data.cells.map((c) => [`${c.activity}\n${c.objectType}`, c])), [data]);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = selected ? byKey.get(selected) : undefined;
  const s = data.stats;
  const saved = s.arcsRecorded > 0 ? 1 - s.arcsFlow / s.arcsRecorded : 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {(controls || toolbarEnd) && (
        <Toolbar end={toolbarEnd}>
          {controls && (
            <>
              <OptionMenu
                label="Threshold"
                value={String(controls.theta)}
                options={THETAS}
                onChange={(v) => onControlsChange?.({ ...controls, theta: Number(v) })}
                disabled={!onControlsChange}
              />
              <OptionMenu
                label="Search"
                value={controls.search}
                options={SEARCHES}
                onChange={(search) => onControlsChange?.({ ...controls, search })}
                disabled={!onControlsChange}
              />
              <ToolbarDivider />
              <OptionMenu
                label="Add unrecorded"
                value={controls.expand ? "on" : "off"}
                options={EXPAND}
                onChange={(v) => onControlsChange?.({ ...controls, expand: v === "on" })}
                disabled={!onControlsChange}
              />
            </>
          )}
        </Toolbar>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5">
          <MetricRow>
            <Metric
              label="Arcs"
              value={
                <span>
                  <span style={{ color: "var(--gray-9)", fontWeight: 400, textDecoration: "line-through" }}>
                    {fmtInt(s.arcsRecorded)}
                  </span>{" "}
                  {fmtInt(s.arcsFlow)}
                </span>
              }
              hint={`${Math.round(saved * 100)}% fewer than the recorded log`}
              tone={saved > 0.3 ? "good" : undefined}
            />
            <Metric
              label="Orderings kept"
              value={fmtInt(s.facts)}
              hint="every one stays visible or follows"
            />
            <Metric
              label="Cells"
              value={`${s.flow} flow`}
              hint={`${s.implied} implied · ${s.involved} involved${s.added ? ` · ${s.added} added` : ""}`}
            />
            <Metric
              label="Search"
              value={s.seed ? `${s.seed[0].toUpperCase()}${s.seed.slice(1)} seed` : "Edited"}
              hint={
                s.limitReached
                  ? "Work budget reached, so the result might not be the smallest"
                  : `${fmtInt(s.work)} work units${s.repaired ? ` · ${s.repaired} cells repaired` : ""}`
              }
              tone={s.limitReached ? "warn" : undefined}
            />
          </MetricRow>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
            <Section
              title="Cells"
              subtitle="One per activity and object type. Click a cell to see why it is in its state."
              style={{ flex: "1 1 520px" }}
            >
              <div style={{ overflowX: "auto" }}>
                <CellGrid
                  activities={activities}
                  types={types}
                  byKey={byKey}
                  color={color}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
              <Legend />
            </Section>
            <Section title="Selected cell" style={{ flex: "0 1 320px", minWidth: 260 }}>
              {sel ? (
                <Inspector cell={sel} color={color(sel.objectType)} />
              ) : (
                <Text size="2" color="gray">
                  Select a cell. Only flowing cells add arcs to models of the flow log; the others can be
                  drawn on top of them as annotations.
                </Text>
              )}
            </Section>
          </div>
        </Flex>
      </div>
    </div>
  );
}

function CellGrid({
  activities,
  types,
  byKey,
  color,
  selected,
  onSelect,
}: {
  activities: string[];
  types: string[];
  byKey: Map<string, ReflowCell>;
  color: (t: string) => string;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <table style={{ borderCollapse: "separate", borderSpacing: 3, fontVariantNumeric: "tabular-nums" }}>
      <thead>
        <tr>
          <th />
          {types.map((t) => (
            <th
              key={t}
              style={{ fontSize: 11.5, fontWeight: 500, color: "var(--gray-11)", padding: "0 0 4px" }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: color(t) }} />
                {t}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {activities.map((a) => (
          <tr key={a}>
            <th
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--gray-11)",
                textAlign: "left",
                whiteSpace: "nowrap",
                paddingRight: 8,
              }}
            >
              {a}
            </th>
            {types.map((t) => {
              const key = `${a}\n${t}`;
              const c = byKey.get(key);
              return (
                <td key={t}>
                  {c ? (
                    <CellButton
                      cell={c}
                      color={color(t)}
                      on={selected === key}
                      onClick={() => onSelect(selected === key ? null : key)}
                    />
                  ) : (
                    <div style={{ width: 84, height: 28, display: "grid", placeItems: "center" }}>
                      <span style={{ width: 4, height: 4, borderRadius: 2, background: "var(--gray-a6)" }} />
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CellButton({
  cell,
  color,
  on,
  onClick,
}: {
  cell: ReflowCell;
  color: string;
  on: boolean;
  onClick: () => void;
}) {
  const look =
    cell.state === "flow"
      ? { background: color, color: inkOn(color), border: `1px solid ${color}`, fontWeight: 600 }
      : cell.state === "implied"
        ? {
            background: `color-mix(in srgb, ${color} 14%, var(--color-panel-solid))`,
            color: `color-mix(in srgb, ${color} 65%, var(--gray-12))`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          }
        : {
            background: "var(--color-panel-solid)",
            color: `color-mix(in srgb, ${color} 70%, var(--gray-12))`,
            border: `1.5px dashed ${color}`,
          };
  const label =
    cell.state === "flow"
      ? fmtInt(cell.participations)
      : cell.state === "implied"
        ? `← ${cell.determinedBy?.from ?? "?"}`
        : "involved";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={`${cell.activity}, ${cell.objectType}: ${cell.state}`}
      title={`${cell.activity} × ${cell.objectType}: ${cell.state}, ${fmtInt(cell.participations)} participations`}
      style={{
        all: "unset",
        boxSizing: "border-box",
        position: "relative",
        width: 84,
        height: 28,
        borderRadius: 6,
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: "pointer",
        boxShadow: on ? "0 0 0 2px var(--color-panel-solid), 0 0 0 4px var(--gray-12)" : undefined,
        ...look,
      }}
    >
      {label}
      {!cell.recorded && (
        <span
          title="Added by Reflow, not recorded in the log"
          style={{ position: "absolute", top: 1, right: 4, fontSize: 10, fontWeight: 700 }}
        >
          +
        </span>
      )}
    </button>
  );
}

function Legend() {
  const swatch = (style: CSSProperties) => (
    <span style={{ width: 18, height: 12, borderRadius: 3, display: "inline-block", ...style }} />
  );
  const c = "var(--accent-9)";
  return (
    <Flex gap="4" wrap="wrap">
      {(
        [
          [swatch({ background: c }), "flow: adds arcs"],
          [
            swatch({
              background: `color-mix(in srgb, ${c} 14%, var(--color-panel-solid))`,
              border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
            }),
            "implied: follows from a flowing type",
          ],
          [swatch({ border: `1.5px dashed ${c}` }), "involved: present, not determined"],
        ] as const
      ).map(([sw, text]) => (
        <Text
          key={text}
          size="1"
          color="gray"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {sw}
          {text}
        </Text>
      ))}
    </Flex>
  );
}

function Inspector({ cell, color }: { cell: ReflowCell; color: string }) {
  const via = viaText(cell);
  const share = cell.determinedBy?.reconstruction.share;
  const row = (k: string, v: ReactNode) => (
    <Flex justify="between" gap="3">
      <Text size="1" color="gray">
        {k}
      </Text>
      <Text size="1" align="right">
        {v}
      </Text>
    </Flex>
  );
  return (
    <Flex
      direction="column"
      gap="2"
      style={{
        background: "var(--gray-a2)",
        border: "1px solid var(--gray-a4)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Text size="2" weight="bold">
          {cell.activity} {"×"} {cell.objectType}
        </Text>
        <TypeChip color={color}>
          <span style={{ fontWeight: 600 }}>{cell.state}</span>
        </TypeChip>
      </Flex>
      <Text size="2">{STATE_TEXT[cell.state]}</Text>
      {row("Participations", fmtInt(cell.participations))}
      {cell.determinedBy && row("Follows from", cell.determinedBy.from)}
      {via && row("Through", via)}
      {share != null && row("Holds for", `${(share * 100).toFixed(share < 1 ? 1 : 0)}% of events`)}
      {!cell.recorded && row("Recorded", "no, added by Reflow")}
    </Flex>
  );
}
