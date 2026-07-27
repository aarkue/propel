import type { DfgLayoutFn } from "../dfg/DfgGraph";
import { DFG_END_ID, DFG_START_ID } from "../dfg/util/dfg-model";
import { writeEdgeRouting } from "../dfg/util/edge-routing";

export type GraphLayout = { centers: [number, number][]; routes: [number, number][][] };

/** Pluggable layout transport: lays out (or re-routes) a `GraphSpec`, returning node centres + edge routes; passed explicitly, no global engine. */
export interface LayoutTransport {
  layoutGraph(spec: unknown): Promise<GraphLayout>;
  rerouteGraph(spec: unknown): Promise<GraphLayout>;
}

export type GraphNodeSpec = {
  width: number;
  height: number;
  ellipse?: boolean;
  pin?: "first" | "last";
  /** Minimum clearance (px) to keep free right of the node (TB) for caller-drawn decorations, e.g. DFG self-loops. */
  clear_after?: number;
  /** Optional grouping id; same-category nodes stay in a consistent lane across layers as a tiebreak. */
  category?: number;
  /** Optional seed centre `[x, y]`; when set, layout keeps structural layer/order but places the cross-axis at the seed. */
  seed?: [number, number];
  /** Hard-pin this node's seed cross-coordinate so it lands exactly where dropped. Only meaningful with `seed`. */
  pinned?: boolean;
};

/** Result of {@link layoutGraph}: node centers by index/id, and source->target-oriented routed points per kept edge. */
export type LaidOutGraph<E> = {
  centerOfIndex: (i: number) => { x: number; y: number };
  centerOf: (id: string) => { x: number; y: number };
  routeOf: (e: E) => { x: number; y: number }[] | undefined;
};

/** Shared driver for the generic `layout_graph` engine: builds the numeric spec via accessor callbacks and returns centers + per-edge routes. `reverse` swaps an edge's endpoints for layering but always returns source->target orientation. */
export async function layoutGraph<N, E>(
  nodes: N[],
  edges: E[],
  opts: {
    transport: LayoutTransport;
    id: (n: N) => string;
    source: (e: E) => string;
    target: (e: E) => string;
    nodeSpec: (n: N, i: number) => GraphNodeSpec;
    direction: "TB" | "LR";
    flowEdges: boolean;
    /** Diagonal (flow) routing instead of orthogonal straight-channel routing. Default `false`. */
    flowDiagonal?: boolean;
    /** Order-preserving cross-axis compaction (priority method) for dense hub-and-spoke graphs. Default `false`. */
    compact?: boolean;
    weight?: (e: E) => number;
    labelSize?: (e: E) => [number, number];
    reverse?: (e: E) => boolean;
    /** On-drop relayout: re-route edges over node seeds instead of a fresh layout. Requires every node seeded. */
    reroute?: boolean;
    /** Lay out as a tidy tree (parents centered over children); input must be a rooted tree, edges come back unrouted. */
    tree?: boolean;
  },
): Promise<LaidOutGraph<E>> {
  const idOf = new Map(nodes.map((n, i) => [opts.id(n), i]));
  const specNodes = nodes.map((n, i) => opts.nodeSpec(n, i));
  const specEdges: [number, number][] = [];
  const weights: number[] = [];
  const labelSizes: [number, number][] = [];
  const routeIndex = new Map<E, { index: number; reversed: boolean }>();
  for (const e of edges) {
    if (opts.source(e) === opts.target(e)) continue;
    const a = idOf.get(opts.source(e));
    const b = idOf.get(opts.target(e));
    if (a === undefined || b === undefined) continue;
    const reversed = opts.reverse?.(e) ?? false;
    routeIndex.set(e, { index: specEdges.length, reversed });
    specEdges.push(reversed ? [b, a] : [a, b]);
    // no min-1 clamp: terminal edges weigh 0.5, matching the Rust export
    if (opts.weight) weights.push(opts.weight(e));
    if (opts.labelSize) labelSizes.push(opts.labelSize(e));
  }
  const spec = {
    nodes: specNodes,
    edges: specEdges,
    weights: opts.weight ? weights : [],
    direction: opts.direction,
    flow_edges: opts.flowEdges,
    flow_diagonal: opts.flowDiagonal ?? false,
    compact: opts.compact ?? false,
    tree: opts.tree ?? false,
    ...(opts.labelSize ? { edge_label_sizes: labelSizes } : {}),
  };
  const g = await (opts.reroute ? opts.transport.rerouteGraph(spec) : opts.transport.layoutGraph(spec));
  const centerOfIndex = (i: number) => {
    const c = g.centers[i] ?? [0, 0];
    return { x: c[0], y: c[1] };
  };
  return {
    centerOfIndex,
    centerOf: (id) => centerOfIndex(idOf.get(id) ?? -1),
    routeOf: (e) => {
      const r = routeIndex.get(e);
      if (!r) return undefined;
      const pts = (g.routes[r.index] ?? []).map(([x, y]) => ({ x, y }));
      return r.reversed ? pts.reverse() : pts;
    },
  };
}

/** A `DfgLayoutFn` for the object-centric DFG, backed by generic Rust `layout_graph`. Builds the spec in the same canonical node/edge order as the SVG export, so screen and export stay consistent. */
export function createRustOcdfgLayout(transport: LayoutTransport, flowDiagonal = true): DfgLayoutFn {
  const START = "__START__";
  const END = "__END__";
  const geoId = (id: string) => (id === DFG_START_ID ? START : id === DFG_END_ID ? END : id);
  const rfId = (geo: string) => (geo === START ? DFG_START_ID : geo === END ? DFG_END_ID : geo);
  return async (nodes, edges, nodeSize, options) => {
    type Arc = { ot: string; from: string; to: string; count: number; edge: (typeof edges)[number] };
    const arcs: Arc[] = [];
    // reserve clearance for the host-drawn self-loop bump + label
    const loopLabels = new Map<string, string[]>();
    for (const e of edges) {
      if (e.source === e.target) {
        const id = geoId(e.source);
        const labels = loopLabels.get(id) ?? [];
        labels.push((e.data as { label?: string }).label ?? "");
        loopLabels.set(id, labels);
        continue;
      }
      arcs.push({
        ot: (e.data as { group?: string }).group ?? "",
        from: geoId(e.source),
        to: geoId(e.target),
        count: (e.data as { count?: number }).count ?? 0,
        edge: e,
      });
    }
    const loopClearance = (labels: string[]) =>
      labels.reduce((m, text, i) => Math.max(m, 27 + 18 * i + (text.length * 6.2 + 6) / 2 + 8), 0);

    // Canonical node order: START, END, then activities (union of arc endpoints) sorted by name.
    const actSet = new Set<string>();
    for (const a of arcs) for (const id of [a.from, a.to]) if (id !== START && id !== END) actSet.add(id);
    const nodeIds = [START, END, ...[...actSet].sort()];
    const indexOf = new Map(nodeIds.map((id, i) => [id, i]));

    // canonical edge order: per sorted object type, sorted starts/ends, then relations by source
    const types = [...new Set(arcs.map((a) => a.ot))].sort();
    const ordered: Arc[] = [];
    for (const ot of types) {
      const mine = arcs.filter((a) => a.ot === ot);
      ordered.push(
        ...mine.filter((a) => a.from === START).sort((x, y) => x.to.localeCompare(y.to)),
        ...mine.filter((a) => a.to === END).sort((x, y) => x.from.localeCompare(y.from)),
        ...mine
          .filter((a) => a.from !== START && a.to !== END)
          .sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to)),
      );
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const seedOf = new Map<string, { x: number; y: number; pinned?: boolean }>();
    if (options?.seed)
      for (const n of nodes) {
        const s = options.seed(n);
        if (s) seedOf.set(geoId(n.id), s);
      }
    const specNodes: GraphNodeSpec[] = nodeIds.map((id) => {
      const term = id === START || id === END;
      const rf = nodeById.get(rfId(id));
      const size = rf ? nodeSize(rf) : { width: term ? 36 : 150, height: term ? 36 : 58 };
      const s = seedOf.get(id);
      const labels = loopLabels.get(id);
      return {
        width: size.width,
        height: size.height,
        ellipse: term,
        pin: id === START ? "first" : id === END ? "last" : undefined,
        seed: s ? ([s.x, s.y] as [number, number]) : undefined,
        pinned: s?.pinned,
        clear_after: labels ? loopClearance(labels) : undefined,
      };
    });
    const specEdges = ordered.map(
      (a) => [indexOf.get(a.from) ?? 0, indexOf.get(a.to) ?? 0] as [number, number],
    );
    const weights = ordered.map((a) => (a.count <= 0 ? 0.5 : 1 + Math.log(a.count)));
    const thickness = ordered.map((a) => {
      const sw = (a.edge.style as React.CSSProperties | undefined)?.strokeWidth;
      return typeof sw === "number" ? sw : 2;
    });

    // on drop, every node is seeded at its current centre, so reroute only re-derives routes
    const spec = {
      nodes: specNodes,
      edges: specEdges,
      weights,
      thickness,
      direction: options?.direction ?? "TB",
      flow_edges: true,
      flow_diagonal: flowDiagonal,
    };
    const g = await (options?.reroute ? transport.rerouteGraph(spec) : transport.layoutGraph(spec));

    const centerOf = (geo: string) => {
      const i = indexOf.get(geo);
      return i == null ? undefined : g.centers[i];
    };
    const topLeft = (n: (typeof nodes)[number]) => {
      const c = centerOf(geoId(n.id));
      const { width, height } = nodeSize(n);
      return { x: (c?.[0] ?? 0) - width / 2, y: (c?.[1] ?? 0) - height / 2 };
    };
    for (const n of nodes) if (centerOf(geoId(n.id))) n.position = topLeft(n);
    ordered.forEach((a, i) => {
      const pts = (g.routes[i] ?? []).map(([x, y]) => ({ x, y }));
      const src = nodeById.get(a.edge.source);
      const tgt = nodeById.get(a.edge.target);
      writeEdgeRouting(a.edge, pts, src ? topLeft(src) : { x: 0, y: 0 }, tgt ? topLeft(tgt) : { x: 0, y: 0 });
    });
  };
}

/** A `DfgLayoutFn` for the case-centric DFG: a plain DFG is an OC-DFG with one implicit object type, so this is just {@link createRustOcdfgLayout}. */
export const createRustDfgLayout = createRustOcdfgLayout;

/** Engine-agnostic fallback `DfgLayoutFn`: stacks nodes in a column with straight-line edges. Import a real engine bundle for actual layout. */
export const noopDfgLayout: DfgLayoutFn = async (nodes, _edges, nodeSize) => {
  let y = 0;
  for (const n of nodes) {
    n.position = { x: 0, y };
    y += nodeSize(n).height + 40;
  }
};
