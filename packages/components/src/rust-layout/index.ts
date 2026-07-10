import type { DfgLayoutFn } from "../dfg/DfgGraph";
import { DFG_END_ID, DFG_START_ID } from "../dfg/util/dfg-model";
import { writeEdgeRouting } from "../dfg/util/edge-routing";

export type GraphLayout = { centers: [number, number][]; routes: [number, number][][] };

/**
 * Pluggable layout transport: lays out (or re-routes) a `GraphSpec`, returning node centres + edge
 * routes. A concrete transport is passed explicitly to each `createRust*Layout` factory - there is no
 * global engine. `@r4pm/components/rust-layout/wasm` exports `wasmTransport` (runs the bundled Rust
 * engine in-browser via wasm); a host with a binding channel (the studio backends) supplies one that
 * calls the `layout_graph` / `reroute_graph` bindings so layout runs wherever the backend runs.
 */
export interface LayoutTransport {
  layoutGraph(spec: unknown): Promise<GraphLayout>;
  rerouteGraph(spec: unknown): Promise<GraphLayout>;
}

export type GraphNodeSpec = {
  width: number;
  height: number;
  ellipse?: boolean;
  pin?: "first" | "last";
  /** Minimum clearance (px) to keep free right of the node (TB) for caller-drawn decorations the
   *  layout can't see - e.g. DFG self-loops and their labels. */
  clear_after?: number;
  /** Optional grouping id (e.g. an object type). Same-category nodes are held in a consistent lane
   *  across layers as a crossing-neutral tiebreak. Omit for no grouping. */
  category?: number;
  /** Optional seed centre `[x, y]` in final space. When any node has a seed, the layout keeps its
   *  structural layer/order/layer-x but places the cross-axis at the seed - a stable relayout that
   *  leaves un-dragged nodes put. Omit for classic layout. */
  seed?: [number, number];
  /** Hard-pin this node's seed cross-coordinate (others yield around it). Use for the just-dragged
   *  node so it lands exactly where dropped. Only meaningful with `seed`. */
  pinned?: boolean;
};

/** Result of {@link layoutGraph}: node centers by index/id, and source->target-oriented routed points
 *  per kept edge (undefined for self-loops and edges with unknown endpoints). */
export type LaidOutGraph<E> = {
  centerOfIndex: (i: number) => { x: number; y: number };
  centerOf: (id: string) => { x: number; y: number };
  routeOf: (e: E) => { x: number; y: number }[] | undefined;
};

/**
 * Shared driver for the generic `layout_graph` engine: builds the numeric node/edge spec from any
 * `{nodes, edges}` (via accessor callbacks), runs the layout, and returns node centers + per-edge
 * routes. Self-loops and edges with unknown endpoints are skipped. `reverse` swaps an edge's
 * endpoints for layering (temporal-backward EP/DP arcs) and un-reverses its returned route, so
 * callers always get source->target orientation.
 */
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
    weight?: (e: E) => number;
    labelSize?: (e: E) => [number, number];
    reverse?: (e: E) => boolean;
    /** On-drop relayout: re-route edges over the node seeds (each `nodeSpec` must return a `seed`)
     *  instead of computing a fresh layout. Returned centers equal the seeds (nodes stay put); only
     *  routes change. Requires every node seeded. */
    reroute?: boolean;
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
    // No min-1 clamp: terminal edges intentionally weigh 0.5 (matching the Rust export) so they
    // yield to the real DF flow.
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

/** A `DfgLayoutFn` for the object-centric DFG, backed by the generic Rust `layout_graph`. Builds the
 *  graph spec in ONE canonical order - START, END, then activities sorted by name; edges grouped per
 *  sorted object type as sorted starts, sorted ends, then relations sorted by source - with terminal
 *  edges weighted by their true frequency (`1 + ln(count)`, not deprioritized). This is the same
 *  construction the SVG export draws, so screen and export are consistent, and the terminal-heavy
 *  ordering keeps START/END edges short (clean, few crossings). Each OC-DFG edge carries its object
 *  type in `data.group`; parallel object-type arcs stay distinct. Self-loops fall back to the host's
 *  default edge. */
export function createRustOcdfgLayout(transport: LayoutTransport, flowDiagonal = true): DfgLayoutFn {
  const START = "__START__";
  const END = "__END__";
  const geoId = (id: string) => (id === DFG_START_ID ? START : id === DFG_END_ID ? END : id);
  const rfId = (geo: string) => (geo === START ? DFG_START_ID : geo === END ? DFG_END_ID : geo);
  return async (nodes, edges, nodeSize, options) => {
    type Arc = { ot: string; from: string; to: string; count: number; edge: (typeof edges)[number] };
    const arcs: Arc[] = [];
    // Self-loops are drawn by the host as a bump right of the node; the layout only needs to
    // reserve clearance for the bump + its label (mirrors Rust `dfg_self_loops_clearance`).
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

    // Canonical edge order: per sorted object type - sorted starts, sorted ends, then relations
    // sorted by source.
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

    // On drop (`options.reroute`) every node is seeded at its current centre, so `reroute` re-derives
    // the layer grid from the actual positions and re-routes only - it returns centers equal to the
    // seeds, which makes the position write below a no-op (nodes stay exactly where dropped).
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

/** A `DfgLayoutFn` for the case-centric DFG, backed by the generic Rust `layout_graph`. A plain DFG is
 *  an OC-DFG with a single (implicit) object type, so this is exactly {@link createRustOcdfgLayout}
 *  with no per-type grouping. */
export const createRustDfgLayout = createRustOcdfgLayout;

/** Engine-agnostic fallback `DfgLayoutFn`: stacks nodes in a single column and leaves edges to the
 *  renderer's straight-line default. The core ships no layout engine; import an engine bundle
 *  (`@r4pm/components/elk-layout` or `@r4pm/components/rust-layout/wasm`) and pass it via
 *  `layoutOverride` or `ViewerConfig.layout` for a real layout. */
export const noopDfgLayout: DfgLayoutFn = async (nodes, _edges, nodeSize) => {
  let y = 0;
  for (const n of nodes) {
    n.position = { x: 0, y };
    y += nodeSize(n).height + 40;
  }
};
