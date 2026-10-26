import type { OCDeclareArc } from "../oc-declare";
import type { RustPetriNet } from "../petri-net";
import type {
  Dfg,
  DfgEdgeRef,
  DfgNodeRef,
  GraphRequest,
  Layout,
  OcDeclareEdgeRef,
  OcDeclareNodeRef,
  OcDfg,
  OcdfgEdgeRef,
  OcdfgNodeRef,
  Ocpn,
  OcpnArcRef,
  OcpnNodeRef,
  Palette,
  PetriArcRef,
  PetriNodeRef,
  Point,
  ProcessTree,
  ProcessTreeNodeRef,
  StyleOverrides,
  TreeRequest,
  OcTypeGraph,
} from "./types";

export * from "./types";

/**
 * Runs rust4pm's visualization bindings (`process_mining::visualization::bindings`) by name, with
 * the same JSON arguments a backend's `callBinding` takes. The embedded wasm (`wasmViz` from
 * `@r4pm/components/viz/wasm`) and a backend give the same results.
 */
export interface VizTransport {
  call(fn: string, args: Record<string, unknown>): Promise<unknown>;
}

/** What each model kind takes and what its layout refers back to. */
export interface VizModels {
  dfg: { data: Dfg; node: DfgNodeRef; edge: DfgEdgeRef };
  ocdfg: { data: OcDfg; node: OcdfgNodeRef; edge: OcdfgEdgeRef };
  oc_declare: { data: OCDeclareArc[]; node: OcDeclareNodeRef; edge: OcDeclareEdgeRef };
  petri_net: { data: RustPetriNet; node: PetriNodeRef; edge: PetriArcRef };
  ocpn: { data: Ocpn; node: OcpnNodeRef; edge: OcpnArcRef };
  process_tree: { data: ProcessTree; node: ProcessTreeNodeRef; edge: ProcessTreeNodeRef };
  oc_type_graph: { data: OcTypeGraph; node: number; edge: number };
}
export type VizModel = keyof VizModels;

/** The name of the model argument of each binding. */
const MODEL_ARG: Record<VizModel, string> = {
  dfg: "dfg",
  ocdfg: "ocdfg",
  oc_declare: "arcs",
  petri_net: "net",
  ocpn: "ocpn",
  process_tree: "tree",
  oc_type_graph: "graph",
};

/** A model laid out: the request (needed to re-route after a drag), the refs and the layout. */
export interface ModelLayout<M extends VizModel> {
  model: M;
  request: unknown;
  nodes: VizModels[M]["node"][];
  edges: VizModels[M]["edge"][];
  layout: Layout;
}

/** A model's layout request and refs, without laying it out. */
export type ModelLayoutRequest<M extends VizModel> = Omit<ModelLayout<M>, "layout">;

/** The layout request of a model, e.g., to re-route a model that changed since its last layout
 *  (with {@link rerouteModel}) without placing it anew. */
export async function modelLayoutRequest<M extends VizModel>(
  viz: VizTransport,
  model: M,
  data: VizModels[M]["data"],
  options?: Record<string, unknown>,
): Promise<ModelLayoutRequest<M>> {
  const req = (await viz.call(`${model}_layout_request`, { [MODEL_ARG[model]]: data, options })) as {
    request: unknown;
    nodes: VizModels[M]["node"][];
    edges: VizModels[M]["edge"][];
  };
  return { model, ...req };
}

/** Lay out a model with rust4pm. `options` are the model's build options (rust4pm JSON). */
export async function layoutModel<M extends VizModel>(
  viz: VizTransport,
  model: M,
  data: VizModels[M]["data"],
  options?: Record<string, unknown>,
): Promise<ModelLayout<M>> {
  const req = await modelLayoutRequest(viz, model, data, options);
  const layout = (await viz.call(model === "process_tree" ? "layout_tree" : "layout_graph", {
    request: req.request,
  })) as Layout;
  return { ...req, layout };
}

/** Re-route the edges of a model over new node centres (one per node, in graph order), e.g.,
 *  after a drag. Node centres come back unchanged. */
export async function rerouteModel<M extends Exclude<VizModel, "process_tree">>(
  viz: VizTransport,
  laid: ModelLayoutRequest<M>,
  positions: Point[],
): Promise<Layout> {
  return (await viz.call("reroute_graph", { request: laid.request, positions })) as Layout;
}

/** Draw a model over a layout of its graph (e.g., the on-screen one) as standalone SVG. */
export async function modelSvg<M extends VizModel>(
  viz: VizTransport,
  model: M,
  data: VizModels[M]["data"],
  layout: Layout,
  opts?: {
    options?: Record<string, unknown>;
    style?: Record<string, unknown>;
    overrides?: StyleOverrides;
    palette?: Palette;
  },
): Promise<string> {
  return (await viz.call(`${model}_svg_from_layout`, {
    [MODEL_ARG[model]]: data,
    layout,
    ...opts,
  })) as string;
}

/** Lay out a caller-built graph, for graphs no rust4pm model covers. */
export async function layoutGraph(viz: VizTransport, request: GraphRequest): Promise<Layout> {
  return (await viz.call("layout_graph", { request })) as Layout;
}

/** Re-route a caller-built graph over new node centres. */
export async function rerouteGraph(
  viz: VizTransport,
  request: GraphRequest,
  positions: Point[],
): Promise<Layout> {
  return (await viz.call("reroute_graph", { request, positions })) as Layout;
}

/** Lay out a caller-built rooted tree or forest. */
export async function layoutTree(viz: VizTransport, request: TreeRequest): Promise<Layout> {
  return (await viz.call("layout_tree", { request })) as Layout;
}
