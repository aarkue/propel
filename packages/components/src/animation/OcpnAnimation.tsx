import { Flex, IconButton, Text } from "@r4pm/components/ui";
import { useCallback, useId, useMemo } from "react";
import { PiCornersOut, PiMinus, PiPlus, PiShareNetwork } from "react-icons/pi";
import { flattenColor, mix, shadeHex } from "../dfg/util/colors";
import { EmptyState } from "../feedback/EmptyState";
import { LoadingState } from "../feedback/LoadingState";
import {
  Bar,
  fmtInt,
  fmtPct,
  formatDuration,
  LegendItem,
  Metric,
  type Option,
  RampLegend,
  Section,
  Segmented,
  scoreTone,
  Toolbar,
  useChartTooltip,
} from "../kit";
import { useAsyncResult, useElementSize } from "../kit/hooks";
import { fitView, usePanZoom } from "../kit/pan-zoom";
import { MOVE_TERMS, moveColor, moveLabel } from "../shared/move-terms";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { layoutModel, type ModelLayout, type Ocpn, type Point } from "../viz";
import { type AnimatedNode, TokenAnimator, type Trip } from "./TokenAnimator";
import { FitLabel } from "../kit/fit-label";
import { type FlowFiring, type FlowGeometry, spreadSpot, tokenFlow } from "./token-flow";

export interface OcpnReplayFiring {
  transition: number;
  time: number;
  sync: boolean;
}

export interface OcpnReplay {
  journeys: {
    id: string;
    object_type: string;
    firings: OcpnReplayFiring[];
    log_moves?: [string, number][];
  }[];
  total_objects: number;
  min_ms: number;
  max_ms: number;
  types: {
    object_type: string;
    objects: number;
    fitness?: number | null;
    perfectly_fitting?: number | null;
    unaligned: number;
    log_moves: [string, number][];
  }[];
  transitions: { transition: number; object_type: string; sync: number; model: number }[];
  sync: {
    activity: string;
    transition?: number | null;
    events: number;
    median_wait_ms: number;
    p90_wait_ms: number;
    mean_wait_ms: number;
    last_ready: [string, number][];
    simultaneous: number;
  }[];
}

export interface OcpnAnimationData {
  ocpn: Ocpn;
  replay: OcpnReplay;
}

export type OcpnAnimationProps = ViewerProps<OcpnAnimationData>;

type Laid = ModelLayout<"ocpn">;
type Tab = "replay" | "conformance";
const TABS: Option<Tab>[] = [
  { value: "replay", label: "Replay" },
  { value: "conformance", label: "Conformance" },
];

const SKIPPED = moveColor("model");
const LOG_MOVE = moveColor("log");
const FITS = moveColor("sync");
const FEW_SKIPPED = mix(SKIPPED, "#9ca3af", 0.6);

/** For a share of model-only firings: the sync color at none, else the model-move color, from
 *  muted to full. Moves keep their colors, so this is not the green-amber-red of the scores. */
export function deviationColor(rate: number): string {
  const t = Math.max(0, Math.min(1, rate));
  return t === 0 ? FITS : mix(FEW_SKIPPED, SKIPPED, t);
}

const routeKey = (source: string, target: string) => `${source}\u0000${target}`;

/** Per transition name and object type, the indices of its input and output places. */
function placesByTransition(ocpn: Ocpn) {
  const typeOf = new Map(ocpn.places.map((p, i) => [p.name, { i, type: p.object_type }]));
  const inputs = new Map<string, Map<string, number[]>>();
  const outputs = new Map<string, Map<string, number[]>>();
  const add = (m: Map<string, Map<string, number[]>>, t: string, type: string, place: number) => {
    const byType = m.get(t) ?? new Map<string, number[]>();
    byType.set(type, [...(byType.get(type) ?? []), place]);
    m.set(t, byType);
  };
  for (const a of ocpn.arcs) {
    const src = typeOf.get(a.source);
    const tgt = typeOf.get(a.target);
    if (src) add(inputs, a.target, src.type, src.i);
    else if (tgt) add(outputs, a.source, tgt.type, tgt.i);
  }
  return { inputs, outputs };
}

/**
 * The token trips of every replayed object, as in the token game (see {@link tokenFlow}): tokens
 * wait in the places of the object's type and hop to the transition that consumes them. Tokens
 * consumed by a skipped visible step take the model-move color.
 */
export function ocpnTrips(
  ocpn: Ocpn,
  routes: Map<string, Point[]>,
  centres: Map<string, Point>,
  replay: Pick<OcpnReplay, "journeys">,
  hop: number,
  colorOf: (objectType: string) => string,
  radii: Map<string, number> = new Map(),
): Trip[] {
  const { inputs, outputs } = placesByTransition(ocpn);
  const geometry: FlowGeometry = {
    leg: (from, to) => {
      const r = routes.get(routeKey(from, to));
      if (r && r.length > 1) return r;
      const a = centres.get(from);
      const b = centres.get(to);
      return a && b ? [a, b] : [];
    },
    spot: (place, seed) => {
      const c = centres.get(place);
      return c ? spreadSpot(c, radii.get(place) ?? 9, seed) : undefined;
    },
  };
  const final = new Set(Object.keys(ocpn.final_marking));
  const out: Trip[] = [];
  const seed = { next: 0 };
  for (const j of replay.journeys) {
    const typeColor = colorOf(j.object_type);
    const places = (m: Map<string, Map<string, number[]>>, t: string): [string, number][] =>
      (m.get(t)?.get(j.object_type) ?? []).map((p) => [ocpn.places[p].name, 1]);
    const initial = ocpn.places
      .filter((p) => p.object_type === j.object_type && p.name in ocpn.initial_marking)
      .map((p) => [p.name, 1] as [string, number]);
    const firings: FlowFiring[] = [];
    for (const f of j.firings) {
      const tr = ocpn.transitions[f.transition];
      if (!tr) continue;
      firings.push({
        transition: tr.name,
        time: f.time,
        inputs: places(inputs, tr.name),
        outputs: places(outputs, tr.name),
        color: f.sync || !tr.label ? typeColor : SKIPPED,
        target: tr.label ? `t:${f.transition}` : undefined,
      });
    }
    tokenFlow(firings, initial, final, geometry, hop, typeColor, seed, out);
    // An event the net cannot follow shows above the transition of that activity, or else at the
    // transition the object fired last.
    for (const [activity, time] of j.log_moves ?? []) {
      const named = ocpn.transitions.find((t) => t.label === activity)?.name;
      const last = [...j.firings].reverse().find((f) => f.time <= time) ?? j.firings[0];
      const key = named ?? (last && ocpn.transitions[last.transition]?.name);
      const c = key ? centres.get(key) : undefined;
      if (!c) continue;
      const at = { x: c.x, y: c.y - (radii.get(key as string) ?? 10) - 10 };
      out.push({ points: [at, at], t0: time - hop, t1: time + 4 * hop, color: LOG_MOVE });
    }
  }
  return out;
}

/** Per transition index, sync and model-only firings summed over object types. */
export function deviationByTransition(
  rows: OcpnReplay["transitions"],
): Map<number, { sync: number; model: number }> {
  const m = new Map<number, { sync: number; model: number }>();
  for (const r of rows) {
    const c = m.get(r.transition) ?? { sync: 0, model: 0 };
    c.sync += r.sync;
    c.model += r.model;
    m.set(r.transition, c);
  }
  return m;
}

interface SceneProps {
  ocpn: Ocpn;
  laid: Laid;
  colorOf: (t: string) => string;
  /** Conformance overlay: fill and stroke of labeled transitions, extra label line. */
  transitionLook?: (
    index: number,
  ) => { stroke: string; fill: string; width: number; note?: string } | undefined;
  onTransitionHover?: (index: number | null, e?: React.MouseEvent) => void;
}

function OcpnScene({ ocpn, laid, colorOf, transitionLook, onTransitionHover }: SceneProps) {
  const placeType = new Map(ocpn.places.map((p) => [p.name, p.object_type]));
  const types = [...new Set(ocpn.places.map((p) => p.object_type))].sort();
  const arrowId = `ocpn-arrow-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <>
      <defs>
        {types.map((t, i) => (
          <marker
            key={t}
            id={`${arrowId}-${i}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={colorOf(t)} />
          </marker>
        ))}
      </defs>
      {laid.edges.map((e, i) => {
        const pts = laid.layout.edges[i]?.points ?? [];
        const arc = ocpn.arcs[e.arc];
        if (pts.length < 2 || !arc) return null;
        const type = placeType.get(arc.source) ?? placeType.get(arc.target) ?? "";
        const variable = arc.type === "variable";
        return (
          <polyline
            key={`${e.arc}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={colorOf(type)}
            strokeOpacity={0.55}
            strokeWidth={variable ? 3.2 : 1.5}
            strokeDasharray={variable ? "6 3" : undefined}
            markerEnd={`url(#${arrowId}-${types.indexOf(type)})`}
          />
        );
      })}
      {laid.nodes.map((ref, i) => {
        const pl = laid.layout.nodes[i];
        if (!pl) return null;
        const { center: c, size: s } = pl;
        if (ref.kind === "place") {
          const p = ocpn.places[ref.index];
          const marked = p.name in ocpn.initial_marking || p.name in ocpn.final_marking;
          const color = colorOf(p.object_type);
          return (
            <circle
              key={`p${ref.index}`}
              cx={c.x}
              cy={c.y}
              r={Math.min(s.width, s.height) / 2}
              fill={shadeHex(color, "light")}
              stroke={color}
              strokeWidth={marked ? 2.5 : 1.4}
            />
          );
        }
        const t = ocpn.transitions[ref.index];
        const look = transitionLook?.(ref.index);
        if (!t.label) {
          return (
            <rect
              key={`t${ref.index}`}
              x={c.x - s.width / 2}
              y={c.y - s.height / 2}
              width={s.width}
              height={s.height}
              rx={1}
              fill="var(--gray-12)"
              opacity={0.75}
            />
          );
        }
        return (
          <g
            key={`t${ref.index}`}
            onMouseMove={onTransitionHover && ((ev) => onTransitionHover(ref.index, ev))}
            onMouseLeave={onTransitionHover && (() => onTransitionHover(null))}
            style={{ cursor: onTransitionHover ? "default" : undefined }}
          >
            <rect
              x={c.x - s.width / 2}
              y={c.y - s.height / 2}
              width={s.width}
              height={s.height}
              rx={8}
              fill={look?.fill ?? "var(--color-panel-solid)"}
              stroke={look?.stroke ?? "var(--gray-8)"}
              strokeWidth={look?.width ?? 1}
            />
            <FitLabel
              label={t.label}
              x={c.x}
              y={look?.note ? c.y - 6 : c.y}
              width={s.width}
              height={look?.note ? s.height - 12 : s.height}
              fontSize={12}
              fontWeight={600}
            />
            {look?.note && (
              <text
                x={c.x}
                y={c.y + s.height / 2 - 6}
                textAnchor="middle"
                fontSize="10"
                fill="var(--gray-11)"
              >
                {look.note}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

/** The laid-out net plus lookups by node name. */
function useOcpnLayout(ocpn: Ocpn, viz: ViewerConfig["viz"]) {
  const run = useMemo(() => (viz ? () => layoutModel(viz, "ocpn", ocpn) : null), [viz, ocpn]);
  const { value: laid, error } = useAsyncResult(run);
  const lookups = useMemo(() => {
    if (!laid) return null;
    const centres = new Map<string, Point>();
    const radii = new Map<string, number>();
    laid.nodes.forEach((ref, i) => {
      const pl = laid.layout.nodes[i];
      if (!pl) return;
      const name = ref.kind === "place" ? ocpn.places[ref.index].name : ocpn.transitions[ref.index].name;
      centres.set(name, pl.center);
      radii.set(name, Math.min(pl.size.width, pl.size.height) / 2);
    });
    const routes = new Map<string, Point[]>();
    laid.edges.forEach((e, i) => {
      const arc = ocpn.arcs[e.arc];
      if (arc) routes.set(routeKey(arc.source, arc.target), laid.layout.edges[i]?.points ?? []);
    });
    return { centres, routes, radii };
  }, [laid, ocpn]);
  return { laid, error, lookups };
}

/**
 * Objects replayed on an object-centric Petri net: tokens move per object type through its places
 * and meet at shared transitions. The conformance tab shows each type's fitness, where the net had
 * to skip steps, and how long object types wait for each other where they synchronize.
 */
export function OcpnAnimation({ data, ...config }: OcpnAnimationProps) {
  const { ocpn, replay } = data;
  const cfg = useViewerConfig(config);
  const [tab, setTab] = useViewSetting<Tab>("ocpnAnimation.tab", "replay");
  const { laid, error, lookups } = useOcpnLayout(ocpn, cfg.viz);
  // As hex, since the place fills derive a light shade from it.
  const colorOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (t: string) => {
      let c = cache.get(t);
      if (c === undefined) {
        c = flattenColor(cfg.colorOf?.("objectType", t) ?? "#5b5bd6");
        cache.set(t, c);
      }
      return c;
    };
  }, [cfg.colorOf]);
  const lead = Math.max(1, (replay.max_ms - replay.min_ms) / 300);
  // About a quarter second per hop at the default speed (the whole log in a minute).
  const hop = Math.max(1, (replay.max_ms - replay.min_ms) / 1500);
  const trips = useMemo(
    () =>
      lookups ? ocpnTrips(ocpn, lookups.routes, lookups.centres, replay, hop, colorOf, lookups.radii) : [],
    [ocpn, lookups, replay, hop, colorOf],
  );
  const nodes = useMemo(() => {
    const out: Record<string, AnimatedNode> = {};
    laid?.nodes.forEach((ref, i) => {
      const pl = laid.layout.nodes[i];
      if (pl && ref.kind === "transition" && ocpn.transitions[ref.index]?.label) {
        out[`t:${ref.index}`] = { center: pl.center, size: pl.size, radius: 8 };
      }
    });
    return out;
  }, [laid, ocpn]);

  if (!cfg.viz) return <EmptyState title="No layout engine" description="The net layout is not available." />;
  if (error) return <EmptyState title="Layout failed" description={String(error)} />;
  if (!laid || !lookups) return <LoadingState label="laying out the net" />;
  if (replay.journeys.length === 0) {
    return (
      <EmptyState
        icon={<PiShareNetwork />}
        title="Nothing to replay"
        description="No object of the net's types could be aligned with its net."
      />
    );
  }
  const types = replay.types.map((t) => t.object_type);

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar>
        <Segmented value={tab} options={TABS} onChange={setTab} aria-label="View" />
      </Toolbar>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "replay" ? (
          <TokenAnimator
            bounds={laid.layout.bounds}
            scene={<OcpnScene ocpn={ocpn} laid={laid} colorOf={colorOf} />}
            trips={trips}
            range={[replay.min_ms - lead, replay.max_ms + lead]}
            formatDate={cfg.format?.date}
            nodes={nodes}
            unit="tokens"
            legend={
              <span style={{ display: "inline-flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {types.map((t) => (
                  <LegendItem key={t} color={colorOf(t)} label={t} />
                ))}
                <LegendItem
                  color={SKIPPED}
                  label={moveLabel("model")}
                  title={`Tokens of this color are steps the net fired without a matching event. ${MOVE_TERMS.model.explain("object")}`}
                />
                <LegendItem
                  color={LOG_MOVE}
                  label={moveLabel("log")}
                  title={`A flash above the transition of that activity, or else where the object is. ${MOVE_TERMS.log.explain("object")}`}
                />
                {replay.journeys.length < replay.total_objects && (
                  <Text size="1" color="gray">
                    {fmtInt(replay.journeys.length)} of {fmtInt(replay.total_objects)} objects
                  </Text>
                )}
              </span>
            }
          />
        ) : (
          <ConformanceTab
            ocpn={ocpn}
            laid={laid}
            replay={replay}
            colorOf={colorOf}
            duration={cfg.format?.duration}
          />
        )}
      </div>
    </Flex>
  );
}

function ConformanceTab({
  ocpn,
  laid,
  replay,
  colorOf,
  duration = formatDuration,
}: {
  ocpn: Ocpn;
  laid: Laid;
  replay: OcpnReplay;
  colorOf: (t: string) => string;
  duration?: (ms: number) => string;
}) {
  const { show, hide, tooltip } = useChartTooltip();
  const deviation = useMemo(() => deviationByTransition(replay.transitions), [replay.transitions]);
  const syncByTransition = useMemo(
    () => new Map(replay.sync.filter((s) => s.transition != null).map((s) => [s.transition as number, s])),
    [replay.sync],
  );
  const maxWait = Math.max(1, ...replay.sync.map((s) => s.median_wait_ms));
  const { bounds } = laid.layout;
  const { ref: boxRef, element: boxEl, size } = useElementSize<HTMLDivElement>();
  const box = useMemo(() => ({ w: size?.width ?? 800, h: size?.height ?? 600 }), [size]);
  const fit = useMemo(() => fitView(bounds, box, 32, 1.6), [bounds, box]);
  const { view, handlers, dragging, zoomBy, reset } = usePanZoom(boxEl, fit, bounds);

  const look = useCallback(
    (i: number) => {
      const d = deviation.get(i);
      const s = syncByTransition.get(i);
      if (!d && !s) return undefined;
      const total = d ? d.sync + d.model : 0;
      const rate = total ? (d?.model ?? 0) / total : 0;
      const color = deviationColor(rate);
      return {
        stroke: color,
        fill: shadeHex(color, "light"),
        width: s ? 1.5 + 3.5 * (s.median_wait_ms / maxWait) : 2,
        note:
          s && s.median_wait_ms > 0
            ? `waits ${duration(s.median_wait_ms)}`
            : rate >= 0.005
              ? `${fmtPct(rate, rate < 0.1 ? 1 : 0)} skipped`
              : undefined,
      };
    },
    [deviation, syncByTransition, maxWait, duration],
  );
  const hover = useCallback(
    (i: number | null, e?: React.MouseEvent) => {
      if (i == null || !e) return hide();
      const rows = replay.transitions
        .filter((r) => r.transition === i)
        .map((r) => ({
          label: r.object_type,
          value: `${fmtInt(r.sync)} fired, ${fmtInt(r.model)} skipped`,
          color: colorOf(r.object_type),
        }));
      const s = syncByTransition.get(i);
      show(e, {
        title: ocpn.transitions[i].label ?? "silent",
        rows: [
          ...rows,
          ...(s
            ? [
                { label: "Median wait for the last type", value: duration(s.median_wait_ms) },
                { label: "90% wait less than", value: duration(s.p90_wait_ms) },
              ]
            : []),
        ],
        footer: s?.last_ready[0]
          ? `last ready most often: ${s.last_ready[0][0]}`
          : s
            ? "object types are ready together"
            : undefined,
      });
    },
    [replay.transitions, syncByTransition, ocpn, colorOf, duration, show, hide],
  );
  // Panning re-renders on every move; the net itself stays the same element, so React skips it.
  const scene = useMemo(
    () => (
      <OcpnScene ocpn={ocpn} laid={laid} colorOf={colorOf} transitionLook={look} onTransitionHover={hover} />
    ),
    [ocpn, laid, colorOf, look, hover],
  );

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div
        ref={boxRef}
        data-tooltip-host
        className="r4pm-no-select"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          position: "relative",
          background: "var(--gray-a2)",
        }}
      >
        <svg
          width={box.w}
          height={box.h}
          role="img"
          aria-label="Object-centric Petri net with conformance overlay"
          style={{
            display: "block",
            position: "absolute",
            inset: 0,
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
          {...handlers}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>{scene}</g>
        </svg>
        {!dragging && tooltip}
        <Flex direction="column" gap="1" style={{ position: "absolute", right: 12, bottom: 12 }}>
          <IconButton size="1" variant="surface" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
            <PiPlus />
          </IconButton>
          <IconButton size="1" variant="surface" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
            <PiMinus />
          </IconButton>
          <IconButton size="1" variant="surface" aria-label="Fit" onClick={reset}>
            <PiCornersOut />
          </IconButton>
        </Flex>
        <Flex
          gap="3"
          align="center"
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            padding: "6px 10px",
            borderRadius: 8,
            background: "var(--color-panel-solid)",
            boxShadow: "var(--shadow-2)",
          }}
        >
          <RampLegend
            low="None skipped"
            high="All skipped"
            color={deviationColor}
            steps={[0, 0.25, 0.5, 0.75, 1]}
          />
          <Text size="1" color="gray">
            Border: synchronization wait
          </Text>
        </Flex>
      </div>
      <div
        style={{
          width: 380,
          flexShrink: 0,
          borderLeft: "1px solid var(--gray-a4)",
          overflow: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <Section title="Fitness per object type" subtitle="Each object aligned with its type's net">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {replay.types.map((t) => (
              <Metric
                key={t.object_type}
                label={t.object_type}
                value={t.fitness != null ? fmtPct(t.fitness) : "-"}
                tone={t.fitness == null ? undefined : scoreTone(t.fitness)}
                hint={`${t.perfectly_fitting != null ? fmtPct(t.perfectly_fitting, 0) : "-"} fit fully · ${fmtInt(t.objects)}`}
              />
            ))}
          </div>
        </Section>
        <Section
          title="Synchronization"
          subtitle="Waiting where object types synchronize, from the first ready type to the last"
        >
          {replay.sync.length === 0 ? (
            <Text size="1" color="gray">
              No activity of the net involves several object types.
            </Text>
          ) : (
            <Flex direction="column" gap="3">
              {replay.sync.map((s) => (
                <Flex key={s.activity} direction="column" gap="1">
                  <Bar
                    value={s.median_wait_ms / maxWait}
                    label={s.activity}
                    hint={duration(s.median_wait_ms)}
                  />
                  <Flex gap="2" align="center" wrap="wrap">
                    <Text size="1" color="gray">
                      {s.last_ready.length ? "last ready:" : "ready together"}
                    </Text>
                    {s.last_ready.slice(0, 3).map(([t, n]) => (
                      <LegendItem
                        key={t}
                        color={colorOf(t)}
                        label={`${t} ${fmtPct(n / Math.max(1, s.events), 0)}`}
                      />
                    ))}
                    {s.last_ready.length > 0 && s.simultaneous > 0 && (
                      <Text size="1" color="gray">
                        together {fmtPct(s.simultaneous / Math.max(1, s.events), 0)}
                      </Text>
                    )}
                    <Text size="1" color="gray" ml="auto">
                      p90 {duration(s.p90_wait_ms)} · {fmtInt(s.events)} events
                    </Text>
                  </Flex>
                </Flex>
              ))}
            </Flex>
          )}
        </Section>
        {replay.types.some((t) => t.log_moves.length > 0) && (
          <Section
            title="Extra events (log moves)"
            subtitle="Events the net does not allow at that point, per object type and activity"
          >
            <Flex direction="column" gap="2">
              {replay.types
                .filter((t) => t.log_moves.length > 0)
                .map((t) => (
                  <Flex key={t.object_type} direction="column" gap="1">
                    <LegendItem color={colorOf(t.object_type)} label={t.object_type} />
                    {t.log_moves.slice(0, 4).map(([a, n]) => (
                      <Flex key={a} justify="between" style={{ paddingLeft: 18 }}>
                        <Text size="1">{a}</Text>
                        <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtInt(n)}
                        </Text>
                      </Flex>
                    ))}
                  </Flex>
                ))}
            </Flex>
          </Section>
        )}
      </div>
    </div>
  );
}
