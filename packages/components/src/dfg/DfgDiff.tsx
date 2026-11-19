import { Flex, Text } from "@r4pm/components/ui";
import { type ReactNode, useCallback, useMemo } from "react";
import { fmtInt, LegendItem, Metric, MetricRow } from "../kit";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import type { Dfg } from "../viz/types";
import { DfgGraph } from "./DfgGraph";
import { colorToHex, shadeHex } from "./util/colors";
import { DFG_END_ID, DFG_START_ID, type DfgArc, type DfgMetric } from "./util/dfg-model";
import { type ArcLook, caseArcs, type DfgSource } from "./viz-layout";

export interface ComparedArc {
  kind: "follows" | "start" | "end";
  from: string;
  to: string;
  a: number;
  b: number;
}

export interface DfgComparison {
  a_label: string;
  b_label: string;
  a_cases: number;
  b_cases: number;
  activities: { activity: string; a: number; b: number }[];
  arcs: ComparedArc[];
}

export interface DfgDiffViewerProps extends ViewerProps<DfgComparison> {
  /** A caveat shown under the summary. */
  note?: ReactNode;
}

const MORE = colorToHex("orange");
const LESS = colorToHex("blue");
const SAME = "#9ca3af";

const arcId = (kind: string, from: string, to: string) => `${kind}\u0000${from}\u0000${to}`;

/** Both sides as one DFG with summed counts, so the layout and edge slider see every arc. */
function unionDfg(c: DfgComparison): Dfg {
  const sum = (kind: ComparedArc["kind"]) =>
    Object.fromEntries(
      c.arcs.filter((a) => a.kind === kind).map((a) => [kind === "start" ? a.to : a.from, a.a + a.b]),
    );
  return {
    activities: Object.fromEntries(c.activities.map((a) => [a.activity, a.a + a.b])),
    directly_follows_relations: c.arcs
      .filter((a) => a.kind === "follows")
      .map((a) => [[a.from, a.to], a.a + a.b] as [[string, string], number]),
    start_activities: sum("start"),
    end_activities: sum("end"),
  } as Dfg;
}

/** Relative change of an arc's share of cases from A to B, as a label. */
function changeLabel(fa: number, fb: number): string {
  if (fa === 0) return "new";
  if (fb === 0) return "gone";
  const r = (fb - fa) / fa;
  if (Math.abs(r) < 0.005) return "=";
  return `${r > 0 ? "+" : ""}${(r * 100).toFixed(Math.abs(r) < 0.1 ? 1 : 0)}%`;
}

/**
 * The DFG of two logs (or periods) on one layout. Each arc is compared as the share of cases that
 * take it, so logs of different size compare fairly: orange arcs are more frequent in B, blue arcs
 * less, and the line width grows with the size of the change.
 */
export function DfgDiffViewer(props: DfgDiffViewerProps) {
  const { data, note } = props;
  const cfg = useViewerConfig(props);
  const [metric, setMetric] = useViewSetting<DfgMetric>("metric", "count");
  const dfg = useMemo(() => unionDfg(data), [data]);
  const source = useMemo<DfgSource>(() => ({ kind: "dfg", data: dfg }), [dfg]);
  const arcs = useMemo(() => caseArcs(dfg), [dfg]);
  const byId = useMemo(() => new Map(data.arcs.map((a) => [arcId(a.kind, a.from, a.to), a])), [data.arcs]);
  const share = useCallback(
    (a: ComparedArc) => [a.a / Math.max(1, data.a_cases), a.b / Math.max(1, data.b_cases)] as const,
    [data.a_cases, data.b_cases],
  );
  const maxDelta = useMemo(
    () => data.arcs.reduce((m, a) => Math.max(m, Math.abs(share(a)[1] - share(a)[0])), 1e-9),
    [data.arcs, share],
  );
  const arcLook = useCallback(
    (arc: DfgArc): ArcLook => {
      const from = arc.from === DFG_START_ID ? "" : arc.from;
      const to = arc.to === DFG_END_ID ? "" : arc.to;
      const c = byId.get(arcId(arc.kind, from, to));
      if (!c) return { label: "", width: 1.5 };
      const [fa, fb] = share(c);
      const t = Math.abs(fb - fa) / maxDelta;
      const label = changeLabel(fa, fb);
      return {
        label,
        width: 1.5 + 4.5 * Math.sqrt(t),
        heat: label === "=" ? SAME : fb > fa ? MORE : LESS,
      };
    },
    [byId, share, maxDelta],
  );
  const actHex = useCallback((act: string) => cfg.colorOf?.("activity", act) ?? "#888888", [cfg.colorOf]);
  const actForeground = useCallback((act: string) => shadeHex(actHex(act), "foreground"), [actHex]);

  const summary = useMemo(() => {
    const follows = data.arcs.filter((a) => a.kind === "follows");
    let up: ComparedArc | undefined;
    let down: ComparedArc | undefined;
    const delta = (a: ComparedArc) => share(a)[1] - share(a)[0];
    for (const a of follows) {
      if (!up || delta(a) > delta(up)) up = a;
      if (!down || delta(a) < delta(down)) down = a;
    }
    return {
      onlyA: follows.filter((a) => a.b === 0).length,
      onlyB: follows.filter((a) => a.a === 0).length,
      up: up && delta(up) > 0 ? { arc: up, d: delta(up) } : undefined,
      down: down && delta(down) < 0 ? { arc: down, d: delta(down) } : undefined,
    };
  }, [data.arcs, share]);
  const pp = (d: number) => `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)} pp`;

  const legend = (
    <Flex direction="column" gap="2" p="2">
      <Side letter="A" label={data.a_label} cases={data.a_cases} />
      <Side letter="B" label={data.b_label} cases={data.b_cases} />
      <span style={{ height: 1, background: "var(--gray-a5)" }} />
      <LegendItem color={MORE} label="More often in B" shape="line" />
      <LegendItem color={LESS} label="Less often in B" shape="line" />
      <Text size="1" color="gray" style={{ lineHeight: 1.35 }}>
        Labels: change in the share of cases taking the arc. Width: size of the change.
      </Text>
    </Flex>
  );

  const graph = (
    <DfgGraph
      source={source}
      arcs={arcs}
      activityCounts={dfg.activities}
      metric={metric}
      setMetric={setMetric}
      hasPerformanceData={false}
      activityColor={actHex}
      activityForeground={actForeground}
      topRightExtra={legend}
      onSelect={cfg.onSelect}
      viz={cfg.viz}
      routing={cfg.routing}
      arcLook={arcLook}
    />
  );

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--gray-a3)" }}>
        <MetricRow>
          <Metric label="Cases in A" value={fmtInt(data.a_cases)} hint={data.a_label} />
          <Metric label="Cases in B" value={fmtInt(data.b_cases)} hint={data.b_label} />
          <Metric label="Arcs only in A" value={fmtInt(summary.onlyA)} hint="gone in B" />
          <Metric label="Arcs only in B" value={fmtInt(summary.onlyB)} hint="new in B" />
          {summary.up && (
            <Metric
              label="Biggest increase"
              value={<span style={{ color: "var(--orange-11)" }}>{pp(summary.up.d)}</span>}
              hint={`${summary.up.arc.from} → ${summary.up.arc.to}`}
            />
          )}
          {summary.down && (
            <Metric
              label="Biggest decrease"
              value={<span style={{ color: "var(--blue-11)" }}>{pp(summary.down.d)}</span>}
              hint={`${summary.down.arc.from} → ${summary.down.arc.to}`}
            />
          )}
        </MetricRow>
        {note && (
          <Text as="p" size="1" color="gray" mt="2">
            {note}
          </Text>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{graph}</div>
    </Flex>
  );
}

function Side({ letter, label, cases }: { letter: string; label: string; cases: number }) {
  return (
    <Flex align="center" gap="2" style={{ minWidth: 0 }}>
      <span
        style={{
          flex: "none",
          width: 18,
          height: 18,
          borderRadius: 5,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          background: "var(--gray-a4)",
          color: "var(--gray-12)",
        }}
      >
        {letter}
      </span>
      <Flex direction="column" style={{ minWidth: 0 }}>
        <Text size="1" weight="medium" truncate title={label}>
          {label}
        </Text>
        <Text size="1" color="gray">
          {fmtInt(cases)} cases
        </Text>
      </Flex>
    </Flex>
  );
}
