import { useId, useMemo } from "react";
import { EmptyState } from "../feedback/EmptyState";
import { LoadingState } from "../feedback/LoadingState";
import { LegendItem } from "../kit";
import { useAsyncResult } from "../kit/hooks";
import { MOVE_TERMS, moveColor, moveLabel } from "../shared/move-terms";
import type { RustPetriNet } from "../petri/net-json";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { layoutModel, type ModelLayout, type Point } from "../viz";
import { type AnimatedNode, TokenAnimator, type Trip } from "./TokenAnimator";
import { FitLabel } from "../kit/fit-label";
import { type FlowFiring, type FlowGeometry, spreadSpot, tokenFlow } from "./token-flow";

export interface NetFiring {
  transition: number;
  time: number;
  sync: boolean;
}

export interface NetReplay {
  journeys: { firings: NetFiring[]; log_moves: [string, number][] }[];
  total: number;
  unaligned: number;
  min_ms: number;
  max_ms: number;
}

export interface PetriNetAnimationData {
  net: RustPetriNet;
  replay: NetReplay;
}

export type PetriNetAnimationProps = ViewerProps<PetriNetAnimationData>;

const FITTING = moveColor("sync");
const DEVIATING = moveColor("model");
const LOG_MOVE = moveColor("log");

type Laid = ModelLayout<"petri_net">;
type NodeKey = `p${number}` | `t${number}`;

/**
 * Token flow of every replayed case, as in the token game: a firing's output tokens hop into their
 * places, wait there (spread over the place, so a queue shows as a pile), and hop out to the
 * transition that consumes them just before it fires. Hops take at most `hop` (data time), so a
 * token is visible in its place for nearly the whole wait however short the steps are. Tokens that
 * a model-only move (a skipped step) consumes take the model-move color.
 */
export function netTrips(net: RustPetriNet, laid: Laid, replay: NetReplay, hop: number): Trip[] {
  const centre = new Map<NodeKey, Point>();
  const radius = new Map<NodeKey, number>();
  laid.nodes.forEach((ref, i) => {
    const pl = laid.layout.nodes[i];
    if (!pl) return;
    const key: NodeKey = `${ref.kind === "place" ? "p" : "t"}${ref.index}`;
    centre.set(key, pl.center);
    radius.set(key, Math.min(pl.size.width, pl.size.height) / 2);
  });
  const route = new Map<string, Point[]>();
  laid.edges.forEach((e, i) => {
    const k = (r: { kind: string; index: number }) => `${r.kind === "place" ? "p" : "t"}${r.index}`;
    route.set(`${k(e.source)}>${k(e.target)}`, laid.layout.edges[i]?.points ?? []);
  });
  const leg = (from: NodeKey, to: NodeKey): Point[] => {
    const r = route.get(`${from}>${to}`);
    if (r && r.length > 1) return r;
    const a = centre.get(from);
    const b = centre.get(to);
    return a && b ? [a, b] : [];
  };
  const final = new Set(Object.keys(net.final_marking).map((p) => `p${p}`));
  const initial = Object.entries(net.initial_marking).map(([p, n]) => [`p${p}`, n] as [string, number]);
  const geometry: FlowGeometry = {
    leg: (from, to) => leg(from as NodeKey, to as NodeKey),
    spot: (place, seed) => {
      const c = centre.get(place as NodeKey);
      return c ? spreadSpot(c, radius.get(place as NodeKey) ?? 8, seed) : undefined;
    },
  };
  // Where an event the net cannot follow shows: just above the transition of the same name if there
  // is one, otherwise at the transition the case fired last.
  const byLabel = new Map<string, NodeKey>();
  net.transitions.forEach((t, i) => {
    if (t.label && !byLabel.has(t.label)) byLabel.set(t.label, `t${i}`);
  });
  const above = (key: NodeKey): Point | undefined => {
    const c = centre.get(key);
    return c && { x: c.x, y: c.y - (radius.get(key) ?? 10) - 10 };
  };
  const out: Trip[] = [];
  const seed = { next: 0 };
  for (const j of replay.journeys) {
    for (const [activity, time] of j.log_moves) {
      const last = [...j.firings].reverse().find((f) => f.time <= time) ?? j.firings[0];
      const named = byLabel.get(activity);
      const at = named ? above(named) : last && centre.get(`t${last.transition}`);
      if (at) out.push({ points: [at, at], t0: time - hop, t1: time + 4 * hop, color: LOG_MOVE });
    }
    const firings: FlowFiring[] = [];
    for (const f of j.firings) {
      const tr = net.transitions[f.transition];
      if (!tr) continue;
      firings.push({
        transition: `t${f.transition}`,
        time: f.time,
        inputs: tr.inputs.map(([p, w]) => [`p${p}`, w]),
        outputs: tr.outputs.map(([p, w]) => [`p${p}`, w]),
        // A silent transition has no event to match, so only skipping a visible step deviates.
        color: f.sync || !tr.label ? FITTING : DEVIATING,
        target: `t${f.transition}`,
      });
    }
    tokenFlow(firings, initial, final, geometry, hop, FITTING, seed, out);
  }
  return out;
}

function NetScene({ net, laid }: { net: RustPetriNet; laid: Laid }) {
  const arrowId = `pn-arrow-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <>
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="var(--gray-8)" />
        </marker>
      </defs>
      {laid.layout.edges.map((e, i) =>
        e.points.length > 1 ? (
          <polyline
            key={i}
            points={e.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--gray-7)"
            strokeWidth={1.4}
            markerEnd={`url(#${arrowId})`}
          />
        ) : null,
      )}
      {laid.nodes.map((ref, i) => {
        const pl = laid.layout.nodes[i];
        if (!pl) return null;
        const { center: c, size: s } = pl;
        if (ref.kind === "place") {
          const marked = ref.index in net.initial_marking || ref.index in net.final_marking;
          return (
            <circle
              key={`p${ref.index}`}
              cx={c.x}
              cy={c.y}
              r={Math.min(s.width, s.height) / 2}
              fill="var(--color-panel-solid)"
              stroke={marked ? "var(--gray-11)" : "var(--gray-8)"}
              strokeWidth={marked ? 2 : 1.4}
            />
          );
        }
        const label = net.transitions[ref.index]?.label;
        return (
          <g key={`t${ref.index}`}>
            <rect
              x={c.x - s.width / 2}
              y={c.y - s.height / 2}
              width={s.width}
              height={s.height}
              rx={label ? 6 : 1}
              fill={label ? "var(--color-panel-solid)" : "var(--gray-12)"}
              stroke="var(--gray-8)"
            />
            {label && <FitLabel label={label} x={c.x} y={c.y} width={s.width} height={s.height} />}
          </g>
        );
      })}
    </>
  );
}

/** Cases replayed on a Petri net through their alignments, as tokens over time. */
export function PetriNetAnimation({ data, ...config }: PetriNetAnimationProps) {
  const { net, replay } = data;
  const cfg = useViewerConfig(config);
  const viz = cfg.viz;
  const run = useMemo(() => (viz ? () => layoutModel(viz, "petri_net", net) : null), [viz, net]);
  const { value: laid, error } = useAsyncResult(run);
  const lead = Math.max(1, (replay.max_ms - replay.min_ms) / 300);
  // About a quarter second per hop at the default speed (the whole log in a minute).
  const hop = Math.max(1, (replay.max_ms - replay.min_ms) / 1500);
  const trips = useMemo(() => (laid ? netTrips(net, laid, replay, hop) : []), [net, laid, replay, hop]);
  const nodes = useMemo(() => {
    const out: Record<string, AnimatedNode> = {};
    laid?.nodes.forEach((ref, i) => {
      const pl = laid.layout.nodes[i];
      if (pl && ref.kind === "transition" && net.transitions[ref.index]?.label)
        out[`t${ref.index}`] = { center: pl.center, size: pl.size, radius: 6 };
    });
    return out;
  }, [laid, net]);

  if (replay.journeys.length === 0) {
    return <EmptyState title="Nothing to replay" description="No case could be aligned with the net." />;
  }
  if (!cfg.viz)
    return <EmptyState title="No layout engine" description="The Petri net layout is not available." />;
  if (error) return <EmptyState title="Layout failed" description={String(error)} />;
  if (!laid) return <LoadingState label="laying out the net" />;
  return (
    <TokenAnimator
      bounds={laid.layout.bounds}
      scene={<NetScene net={net} laid={laid} />}
      trips={trips}
      range={[replay.min_ms - lead, replay.max_ms + lead]}
      formatDate={cfg.format?.date}
      nodes={nodes}
      unit="tokens"
      legend={
        <span style={{ display: "inline-flex", gap: 14, alignItems: "center" }}>
          <LegendItem
            color={FITTING}
            label={moveLabel("sync")}
            title={`Tokens moved by steps that match an event. ${MOVE_TERMS.sync.explain("case")}`}
          />
          <LegendItem
            color={DEVIATING}
            label={moveLabel("model")}
            title={`Tokens of this color are steps the net fired without a matching event. ${MOVE_TERMS.model.explain("case")}`}
          />
          <LegendItem
            color={LOG_MOVE}
            label={`${moveLabel("log")}: ${replay.journeys.reduce((n, j) => n + j.log_moves.length, 0).toLocaleString("en")}`}
            title={`A flash above the transition of that activity, or else where the case is. ${MOVE_TERMS.log.explain("case")}`}
          />
          {replay.unaligned > 0 && (
            <LegendItem
              color="var(--gray-8)"
              label={`${replay.unaligned} cases not aligned`}
              title="No alignment was found for these cases, so they are not replayed."
            />
          )}
        </span>
      }
    />
  );
}
