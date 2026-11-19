import { Flex, Text } from "@r4pm/components/ui";
import { type ReactNode, useCallback, useMemo } from "react";
import { PiFilmStrip } from "react-icons/pi";
import {
  arcKey,
  arcLooks,
  caseArcs,
  type DfgSource,
  dfgBuildOptions,
  type LaidDfg,
  layoutDfg,
  ocActivityCounts,
  ocArcs,
  selectArcs,
  shownModel,
  sourceCounter,
} from "../dfg/viz-layout";
import { flattenColor, mix, shadeHex } from "../dfg/util/colors";
import { DFG_END_ID, DFG_START_ID } from "../dfg/util/dfg-model";
import { EmptyState } from "../feedback/EmptyState";
import { LoadingState } from "../feedback/LoadingState";
import { fmtInt, LegendItem } from "../kit";
import { useAsyncResult, useElementSize, useKeyedState } from "../kit/hooks";
import { colorForKey, useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import type { Point } from "../viz/types";
import { fitLines } from "../kit/fit-label";
import { type AnimatedNode, TokenAnimator, type Trip } from "./TokenAnimator";

export interface Journey {
  id: string;
  object_type?: string | null;
  events: [string, number][];
}

export interface Journeys {
  journeys: Journey[];
  total: number;
  min_ms: number;
  max_ms: number;
}

export interface ProcessMapAnimationData {
  /** The map the tokens move over: a DFG, or an OC-DFG with the object types to show. */
  source: DfgSource;
  journeys: Journeys;
}

export type ProcessMapAnimationProps = ViewerProps<ProcessMapAnimationData>;

const CASE_COLOR = "var(--accent-9)";
/** rust4pm's DFG terminal fills, as in the DFG view. */
const START_FILL = "#4B9969";
const END_FILL = "#D4001F";

const nodeId = (name: string, group?: string) =>
  name === DFG_START_ID
    ? group
      ? `start:${group}`
      : "start"
    : name === DFG_END_ID
      ? group
        ? `end:${group}`
        : "end"
      : `act:${name}`;

/** Build the trips of every journey along the laid-out map; arcs the map leaves out are straight. */
/** An arc the map leaves out that a token still travels, drawn as a dashed shortcut. */
interface Shortcut {
  key: string;
  points: [Point, Point];
  group?: string;
}

/**
 * The trips of every journey along the laid-out map. A token is in flight between two consecutive
 * events of its case for the whole time between them, so it never leaves the map: an arc the map
 * hides becomes a dashed straight shortcut, and an activity the map hides is passed over.
 */
function tripsOf(
  laid: LaidDfg,
  journeys: Journey[],
  lead: number,
  color: (j: Journey) => string,
): { trips: Trip[]; shortcuts: Shortcut[]; skippedEvents: number } {
  const shortcuts = new Map<string, Shortcut>();
  const centre = new Map(laid.nodes.map((n, i) => [n.id, laid.layout.nodes[i]?.center]));
  const route = new Map(laid.edges.map((e, i) => [e.key, laid.layout.edges[i]?.points ?? []]));
  const pathOf = (
    kind: "start" | "follows" | "end",
    from: string,
    to: string,
    group?: string,
  ): Point[] | null => {
    const key = arcKey(group, kind, from, to);
    const r = route.get(key);
    if (r && r.length > 1) return r;
    const a = centre.get(nodeId(from, group));
    const b = centre.get(nodeId(to, group));
    if (!a || !b) return null;
    if (kind === "follows" && !shortcuts.has(key)) shortcuts.set(key, { key, points: [a, b], group });
    return [a, b];
  };
  const out: Trip[] = [];
  let skippedEvents = 0;
  for (const j of journeys) {
    const group = j.object_type ?? undefined;
    const c = color(j);
    const ev = j.events.filter(([a]) => centre.has(nodeId(a, group)));
    skippedEvents += j.events.length - ev.length;
    if (ev.length === 0) continue;
    const push = (points: Point[] | null, t0: number, t1: number, to: string) => {
      if (points) out.push({ points, t0, t1, color: c, target: nodeId(to, group) });
    };
    push(pathOf("start", DFG_START_ID, ev[0][0], group), ev[0][1] - lead, ev[0][1], ev[0][0]);
    for (let i = 1; i < ev.length; i++) {
      push(pathOf("follows", ev[i - 1][0], ev[i][0], group), ev[i - 1][1], ev[i][1], ev[i][0]);
    }
    const last = ev[ev.length - 1];
    push(pathOf("end", last[0], DFG_END_ID, group), last[1], last[1] + lead, DFG_END_ID);
  }
  return { trips: out, shortcuts: [...shortcuts.values()], skippedEvents };
}

/** A filled arrowhead at the end of a polyline, pointing along its last segment. */
function arrowHead(points: Point[], size: number): string {
  const b = points[points.length - 1];
  const a = points[points.length - 2];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const bx = b.x - ux * size;
  const by = b.y - uy * size;
  const w = size * 0.55;
  return `${b.x},${b.y} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`;
}

/** The map drawn like the DFG view: colored activity boxes with counts, terminals, weighted arcs. */
function MapScene({
  laid,
  shortcuts,
  arcCounts,
  activityCounts,
  activityColor,
  typeColor,
}: {
  laid: LaidDfg;
  shortcuts: Shortcut[];
  arcCounts: Map<string, number>;
  activityCounts: Record<string, number>;
  activityColor: (a: string) => string;
  typeColor: (t: string) => string;
}) {
  const max = Math.max(1, ...arcCounts.values());
  return (
    <>
      {shortcuts.map((sc) => (
        <line
          key={sc.key}
          x1={sc.points[0].x}
          y1={sc.points[0].y}
          x2={sc.points[1].x}
          y2={sc.points[1].y}
          stroke={sc.group ? typeColor(sc.group) : "var(--gray-8)"}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.45}
        />
      ))}
      {laid.edges.map((e, i) => {
        const pts = laid.layout.edges[i]?.points ?? [];
        if (pts.length < 2) return null;
        const w = 1.2 + 4.2 * Math.sqrt((arcCounts.get(e.key) ?? 0) / max);
        const stroke = e.group ? typeColor(e.group) : "var(--gray-8)";
        // Stop the line short of the tip so the arrowhead stays crisp.
        const head = 7 + w;
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
        const line = [
          ...pts.slice(0, -1),
          {
            x: last.x - ((last.x - prev.x) / len) * head * 0.8,
            y: last.y - ((last.y - prev.y) / len) * head * 0.8,
          },
        ];
        return (
          <g key={e.key} opacity={e.group ? 0.7 : 1}>
            <polyline
              points={line.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={stroke}
              strokeWidth={w}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polygon points={arrowHead(pts, head)} fill={stroke} />
          </g>
        );
      })}
      {laid.nodes.map((n, i) => {
        const pl = laid.layout.nodes[i];
        if (!pl) return null;
        const { center: c, size: s } = pl;
        const x = c.x - s.width / 2;
        const y = c.y - s.height / 2;
        if (n.kind !== "activity") {
          const start = n.kind === "start";
          const fill = n.group ? typeColor(n.group) : start ? START_FILL : END_FILL;
          const mark = n.group ? mix(flattenColor(fill), "#ffffff", 0.86) : "#ffffff";
          const r = s.height / 4;
          return (
            <g key={n.id}>
              <title>{`${start ? "Start" : "End"}${n.group ? `: ${n.group}` : ""}`}</title>
              <rect x={x} y={y} width={s.width} height={s.height} rx={5} fill={fill} />
              {start ? (
                <polygon
                  points={`${c.x - r},${c.y - r} ${c.x - r},${c.y + r} ${c.x + r},${c.y}`}
                  fill={mark}
                />
              ) : (
                <rect x={c.x - r} y={c.y - r} width={2 * r} height={2 * r} fill={mark} />
              )}
            </g>
          );
        }
        const color = activityColor(n.name);
        // Plain SVG, not HTML in a foreignObject: WebKit lays those out differently and clipped
        // the count below a wrapped name.
        const nameSize = 12;
        const countSize = 10;
        const lh = nameSize * 1.2;
        const lines = fitLines(
          n.name,
          s.width - 16,
          Math.max(1, Math.floor((s.height - 6 - countSize * 1.3) / lh)),
          nameSize,
          700,
        );
        const block = lines.length * lh + countSize * 1.3;
        const top = c.y - block / 2;
        return (
          <g key={n.id}>
            <title>{`${n.name}: ${fmtInt(activityCounts[n.name] ?? 0)}`}</title>
            <rect
              x={x + 1}
              y={y + 1}
              width={s.width - 2}
              height={s.height - 2}
              rx={8}
              strokeWidth={2}
              style={{
                fill: `color-mix(in srgb, ${color} 16%, var(--color-panel-solid))`,
                stroke: `color-mix(in srgb, ${color} 80%, transparent)`,
                filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.12))",
              }}
            />
            <text
              x={c.x}
              textAnchor="middle"
              fontSize={nameSize}
              fontWeight={700}
              style={{ fill: shadeHex(flattenColor(color), "foreground") }}
            >
              {lines.map((line, k) => (
                <tspan key={line} x={c.x} y={top + (k + 0.8) * lh}>
                  {line}
                </tspan>
              ))}
            </text>
            <text
              x={c.x}
              y={top + lines.length * lh + countSize}
              textAnchor="middle"
              fontSize={countSize}
              style={{ fill: "var(--gray-11)", fontVariantNumeric: "tabular-nums" }}
            >
              {fmtInt(activityCounts[n.name] ?? 0)}
            </text>
          </g>
        );
      })}
    </>
  );
}

/**
 * Cases (or objects, colored by type) moving over the DFG (or OC-DFG) along the real timeline. A
 * token travels an arc between the times of the two events, so busy arcs fill with waiting work and
 * activities glow as work reaches them.
 */
export function ProcessMapAnimation({ data, ...config }: ProcessMapAnimationProps) {
  const { source: fullSource, journeys: allJourneys } = data;
  const cfg = useViewerConfig(config);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of allJourneys.journeys)
      if (j.object_type) m.set(j.object_type, (m.get(j.object_type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allJourneys]);
  // Types with few objects (often resources such as employees) touch every activity and tangle the
  // map, so by default only types with at least 5% of the objects are shown.
  const typeSet = typeCounts
    .map(([t]) => t)
    .sort()
    .join("\u0000");
  const [picked, setPicked] = useKeyedState<string[] | null>(typeSet, null);
  const shownTypes = useMemo(() => {
    if (picked) return picked;
    const n = allJourneys.journeys.length;
    const main = typeCounts.filter(([, c]) => c >= 0.05 * n).map(([t]) => t);
    return main.length > 0 ? main : typeCounts.map(([t]) => t);
  }, [picked, typeCounts, allJourneys]);
  const source = useMemo<DfgSource>(
    () =>
      fullSource.kind === "ocdfg"
        ? { ...fullSource, types: fullSource.types.filter((t) => shownTypes.includes(t)) }
        : fullSource,
    [fullSource, shownTypes],
  );
  const journeys = useMemo<Journeys>(
    () =>
      fullSource.kind === "ocdfg"
        ? {
            ...allJourneys,
            journeys: allJourneys.journeys.filter(
              (j) => !j.object_type || shownTypes.includes(j.object_type),
            ),
          }
        : allJourneys,
    [fullSource.kind, allJourneys, shownTypes],
  );
  const toggleType = (t: string) => {
    if (!shownTypes.includes(t)) setPicked([...shownTypes, t]);
    else if (shownTypes.length > 1) setPicked(shownTypes.filter((x) => x !== t));
  };
  const { ref: boxRef, size } = useElementSize<HTMLDivElement>();
  const box = useMemo(() => ({ w: size?.width ?? 1200, h: size?.height ?? 700 }), [size]);
  const activityCounts = useMemo(
    () => (source.kind === "dfg" ? source.data.activities : ocActivityCounts(source.data, source.types)),
    [source],
  );
  const run = useCallback(async () => {
    const arcs = source.kind === "dfg" ? caseArcs(source.data) : ocArcs(source.data, source.types);
    const kept = selectArcs(arcs, null, activityCounts).kept;
    const model = shownModel(source, kept);
    const looks = arcLooks(kept, "count", sourceCounter(arcs, activityCounts));
    const lay = (direction: "TB" | "LR") =>
      layoutDfg(
        cfg.viz,
        model,
        dfgBuildOptions(model, kept, looks, activityCounts, { direction, routing: cfg.routing }),
        kept,
      );
    const [tb, lr] = await Promise.all([lay("TB"), lay("LR")]);
    return { tb, lr, counts: new Map(kept.map((a) => [a.key, a.count])) };
  }, [source, activityCounts, cfg.viz, cfg.routing]);
  // The map of the previous types stays up while the new one is laid out; it is looked up by name,
  // so the new journeys still find their nodes.
  const { latest: layouts, error } = useAsyncResult(run);

  // The direction whose layout fits the panel at the larger scale; the player bar takes ~64px.
  const laid = useMemo(() => {
    if (!layouts) return null;
    const fit = (l: LaidDfg) => {
      const b = l.layout.bounds;
      return Math.min(box.w / (b.max.x - b.min.x + 64), (box.h - 64) / (b.max.y - b.min.y + 64));
    };
    return { laid: fit(layouts.lr) > fit(layouts.tb) ? layouts.lr : layouts.tb, counts: layouts.counts };
  }, [layouts, box]);

  const activityColor = useMemo(
    () => (a: string) => cfg.colorOf?.("activity", a) ?? colorForKey("activity", a) ?? "#888888",
    [cfg.colorOf],
  );
  const typeColor = useMemo(
    () => (t: string) => cfg.colorOf?.("objectType", t) ?? colorForKey("objectType", t) ?? CASE_COLOR,
    [cfg.colorOf],
  );
  const lead = Math.max(1, (journeys.max_ms - journeys.min_ms) / 300);
  const built = useMemo(
    () =>
      laid
        ? tripsOf(laid.laid, journeys.journeys, lead, (j) =>
            j.object_type ? typeColor(j.object_type) : CASE_COLOR,
          )
        : null,
    [laid, journeys, lead, typeColor],
  );
  const nodes = useMemo(() => {
    const out: Record<string, AnimatedNode> = {};
    if (!laid) return out;
    laid.laid.nodes.forEach((n, i) => {
      const pl = laid.laid.layout.nodes[i];
      if (pl && n.kind === "activity") out[n.id] = { center: pl.center, size: pl.size, radius: 8 };
    });
    return out;
  }, [laid]);
  const scene = useMemo(
    () =>
      laid && built ? (
        <MapScene
          laid={laid.laid}
          shortcuts={built.shortcuts}
          arcCounts={laid.counts}
          activityCounts={activityCounts}
          activityColor={activityColor}
          typeColor={typeColor}
        />
      ) : null,
    [laid, built, activityCounts, activityColor, typeColor],
  );

  const objects = typeCounts.length > 0;
  const sampled = allJourneys.journeys.length < allJourneys.total;
  let body: ReactNode;
  if (journeys.journeys.length === 0) {
    body = (
      <EmptyState
        icon={<PiFilmStrip />}
        title="Nothing to animate"
        description="No case has an event with a timestamp."
      />
    );
  } else if (error) {
    body = <EmptyState title="Could not lay out the map" description={String(error)} />;
  } else if (!laid || !scene || !built) {
    body = <LoadingState label="laying out the map" />;
  } else {
    body = (
      <TokenAnimator
        bounds={laid.laid.layout.bounds}
        scene={scene}
        trips={built.trips}
        nodes={nodes}
        unit={objects ? "objects" : "cases"}
        range={[journeys.min_ms - lead, journeys.max_ms + lead]}
        formatDate={cfg.format?.date}
        legend={
          <Flex direction="column" gap="2">
            <Flex gap="3" align="center" wrap="wrap">
              {objects ? (
                typeCounts.map(([t, n]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    title={shownTypes.includes(t) ? `Hide ${t}` : `Show ${t}`}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--gray-a5)",
                      background: shownTypes.includes(t) ? "var(--gray-a3)" : "transparent",
                      opacity: shownTypes.includes(t) ? 1 : 0.45,
                    }}
                  >
                    <LegendItem color={typeColor(t)} label={`${t} ${fmtInt(n)}`} />
                  </button>
                ))
              ) : (
                <LegendItem color={CASE_COLOR} label="One dot per case" />
              )}
            </Flex>
            <Text size="1" color="gray">
              {sampled
                ? `${fmtInt(allJourneys.journeys.length)} of ${fmtInt(allJourneys.total)} ${objects ? "objects" : "cases"}, spread over time`
                : `${fmtInt(allJourneys.total)} ${objects ? "objects" : "cases"}`}
              {objects ? " · click a type to show or hide it" : " · scroll to zoom, drag to pan"}
            </Text>
            {built.shortcuts.length > 0 && (
              <Text size="1" color="gray">
                Dashed: {fmtInt(built.shortcuts.length)} rarer arcs the map leaves out, which tokens still
                take.
                {built.skippedEvents > 0 &&
                  ` ${fmtInt(built.skippedEvents)} events of hidden activities are passed over.`}
              </Text>
            )}
          </Flex>
        }
      />
    );
  }
  return (
    <div ref={boxRef} style={{ height: "100%", width: "100%", minHeight: 0 }}>
      {body}
    </div>
  );
}
