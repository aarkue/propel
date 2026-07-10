//! Generic graph layout + SVG export bindings.
//!
//! Two domain-agnostic bindings: [`layout_graph`] / [`reroute_graph`] lay out an arbitrary directed
//! graph (node centres + edge polylines), and [`export_graph_svg`] draws a caller-supplied,
//! already-laid-out, already-styled [`graph_svg::StyledGraph`] to a standalone SVG (pure draw, no
//! layout). Viewers build both from their own on-screen React Flow state, so the export matches the
//! screen. The layered engine lives in the `viz_layout` crate (shared with the components wasm).

/// Petri layout adapter + geometry-quality metrics: test-only scaffolding that exercises the generic
/// `viz_layout` engine on Petri-shaped inputs. Not compiled into the shipped binary.
#[cfg(test)]
mod layout;
#[cfg(test)]
mod metrics;

use process_mining::bindings::register_binding;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use viz_layout::{render_graph_svg, StyledGraph, SvgPalette};

/// Draw a fully laid-out, fully styled diagram to a standalone SVG string. Pure draw: the caller
/// (DFG, OC-DFG, OC-Declare, Petri, OCPN viewers) supplies exact on-screen geometry and styling -
/// this binding performs no layout, so the export is guaranteed to match what's on screen. The
/// renderer itself lives in the `viz_layout` crate (shared with the components wasm).
#[register_binding(stringify_error)]
pub fn export_graph_svg(graph: StyledGraph, palette: Option<SvgPalette>) -> Result<String, String> {
    let palette = palette.unwrap_or_default();
    Ok(render_graph_svg(&graph, &palette))
}

/// One node in a generic graph-layout request. Only its size and shape matter to the layout;
/// labels/colors are the caller's concern (this binding returns geometry, not an image).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GraphNode {
    pub width: f64,
    pub height: f64,
    /// Draw as an ellipse (arcs meet the outline) vs a box. Defaults to box.
    #[serde(default)]
    pub ellipse: bool,
    /// Pin to the first or last layer: `"first"` (source rank) or `"last"` (sink rank).
    #[serde(default)]
    pub pin: Option<String>,
    /// Optional grouping id (e.g. an object type). Same-category nodes are held in a consistent
    /// order across layers as a crossing-neutral tiebreak. Absent means no grouping.
    #[serde(default)]
    pub category: Option<u32>,
    /// Optional seed centre `[x, y]` in final space. When any node has a seed, the layout keeps the
    /// structural layer/order but places the cross-axis at the seed (a stable relayout that leaves
    /// un-dragged nodes put). Absent means classic layout.
    #[serde(default)]
    pub seed: Option<[f64; 2]>,
    /// Hard-pin this node's seed cross-coordinate (others yield around it); use for the just-dragged
    /// node so it lands exactly where dropped. Only meaningful with `seed`.
    #[serde(default)]
    pub pinned: bool,
    /// Minimum clearance (px) to keep free beyond this node's border on the positive order side
    /// (screen right in TB, screen bottom in LR): room for caller-drawn self-loops + labels.
    #[serde(default)]
    pub clear_after: f64,
}

impl GraphNode {
    fn into_engine(self) -> viz_layout::GraphNode {
        let GraphNode {
            width,
            height,
            ellipse,
            pin,
            category,
            seed,
            pinned,
            clear_after,
        } = self;
        viz_layout::GraphNode {
            width,
            height,
            ellipse,
            pin,
            category,
            seed,
            pinned,
            clear_after,
        }
    }
}

/// A generic directed-graph layout request: sized nodes plus directed edges by node index.
/// Cycles, self-loops and multi-edges are handled. This is the same engine Petri/DFG use.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GraphSpec {
    pub nodes: Vec<GraphNode>,
    /// Directed edges as `(from_index, to_index)` into `nodes`.
    pub edges: Vec<(usize, usize)>,
    /// Optional per-edge importance (same length as `edges`); heavier edges lay out straighter
    /// and shorter. Empty => all equal.
    #[serde(default)]
    pub weights: Vec<f64>,
    /// `"TB"` top->bottom (default) or `"LR"` left->right.
    #[serde(default)]
    pub direction: Option<String>,
    /// Flow layout: tighter gaps + terminal centring (`true`) vs classic gaps (`false`, default).
    #[serde(default)]
    pub flow_edges: bool,
    /// Diagonal (flow) routing vs orthogonal straight-channel routing (`false`, default). Only
    /// meaningful with `flow_edges`.
    #[serde(default)]
    pub flow_diagonal: bool,
    /// Optional `[width, height]` in final space of each edge's mid-point label (same length/order
    /// as `edges`). The layout reserves that space on the edge centre so labels don't overlap other
    /// edges/nodes. Empty => no reservation.
    #[serde(default)]
    pub edge_label_sizes: Vec<[f64; 2]>,
    /// Optional per-edge drawn stroke width (same length/order as `edges`); port spreading keeps
    /// adjacent thick strokes from visually merging. Empty => all 2.0.
    #[serde(default)]
    pub thickness: Vec<f64>,
}

impl GraphSpec {
    fn into_engine(self) -> viz_layout::GraphSpec {
        let GraphSpec {
            nodes,
            edges,
            weights,
            direction,
            flow_edges,
            flow_diagonal,
            edge_label_sizes,
            thickness,
        } = self;
        viz_layout::GraphSpec {
            nodes: nodes.into_iter().map(GraphNode::into_engine).collect(),
            edges,
            weights,
            direction,
            flow_edges,
            flow_diagonal,
            edge_label_sizes,
            thickness,
        }
    }
}

/// Result of [`layout_graph`]: one centre per input node, one orthogonal/flow polyline per edge,
/// in the same order as the input. All coordinates in a single SVG-style space.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GraphLayout {
    pub centers: Vec<[f64; 2]>,
    pub routes: Vec<Vec<[f64; 2]>>,
}

impl From<viz_layout::GraphLayout> for GraphLayout {
    fn from(out: viz_layout::GraphLayout) -> Self {
        GraphLayout {
            centers: out.centers,
            routes: out.routes,
        }
    }
}

/// Lay out an arbitrary directed graph. Returns node centres + edge polylines; rendering is left to
/// the caller. Thin binding wrapper over the shared `viz_layout` engine.
#[register_binding(stringify_error)]
pub fn layout_graph(spec: GraphSpec) -> Result<GraphLayout, String> {
    viz_layout::layout_graph(spec.into_engine()).map(GraphLayout::from)
}

/// On-drop relayout: re-route edges over the caller's final node positions (each node's `seed` is its
/// current centre) without recomputing a layout. Node centres come back unchanged; only routes change.
#[register_binding(stringify_error)]
pub fn reroute_graph(spec: GraphSpec) -> Result<GraphLayout, String> {
    viz_layout::reroute_graph(spec.into_engine()).map(GraphLayout::from)
}

#[cfg(test)]
mod tests {
    use super::layout::{layout_petri_net, LayoutResult, NodeKind};
    use super::metrics::{compute, LayoutMetrics};
    use process_mining::bindings::list_functions_meta;
    use process_mining::core::process_models::case_centric::petri_net::ArcType;
    use process_mining::PetriNet;

    /// Geometry quality of a laid-out net, derived purely from node boxes and edge routes.
    fn petri_metrics(lr: &LayoutResult, net: &PetriNet) -> LayoutMetrics {
        let boxes: Vec<(f64, f64, f64, f64)> = lr
            .nodes
            .iter()
            .map(|n| (n.cx, n.cy, n.width, n.height))
            .collect();
        let ellipse: Vec<bool> = lr.nodes.iter().map(|n| n.kind == NodeKind::Place).collect();
        let routes: Vec<Vec<(f64, f64)>> = lr.edges.iter().map(|e| e.points.clone()).collect();
        let idx: std::collections::HashMap<_, _> = lr
            .nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.uuid, i))
            .collect();
        let endpoints: Vec<(usize, usize)> = net
            .arcs
            .iter()
            .map(|arc| {
                let (a, b) = match arc.from_to {
                    ArcType::PlaceTransition(p, t) => (p, t),
                    ArcType::TransitionPlace(t, p) => (t, p),
                };
                (
                    idx.get(&a).copied().unwrap_or(usize::MAX),
                    idx.get(&b).copied().unwrap_or(usize::MAX),
                )
            })
            .collect();
        compute(&boxes, &routes, &endpoints, &ellipse)
    }

    #[test]
    fn bindings_are_registered() {
        let metas = list_functions_meta();
        for id in [
            "app_bindings::viz::export_graph_svg",
            "app_bindings::viz::layout_graph",
            "app_bindings::viz::reroute_graph",
        ] {
            assert!(metas.iter().any(|m| m.id == id), "{id} must be registered");
        }
    }

    /// Tricky arc cases (2-cycle / read-arc loop, duplicate parallel arcs) must route cleanly:
    /// no two arcs coincident, no arc drawn through a node box.
    #[test]
    fn petri_loops_and_duplicates_route_cleanly() {
        let mut net = PetriNet::new();
        let p0 = net.add_place(None);
        let a = net.add_transition(Some("A".into()), None);
        let p1 = net.add_place(None);
        let b = net.add_transition(Some("B".into()), None);
        let p2 = net.add_place(None);
        net.add_arc(ArcType::place_to_transition(p0, a), None);
        net.add_arc(ArcType::transition_to_place(a, p1), None);
        net.add_arc(ArcType::place_to_transition(p1, b), None);
        net.add_arc(ArcType::transition_to_place(b, p1), None); // 2-cycle p1 <-> b
        net.add_arc(ArcType::transition_to_place(b, p2), None);
        net.add_arc(ArcType::place_to_transition(p1, b), None); // duplicate parallel arc

        let lr = layout_petri_net(&net);
        let m = petri_metrics(&lr, &net);
        assert_eq!(m.overlaps, 0, "no two arcs may be coincident");
        assert_eq!(m.node_hits, 0, "no arc may be routed through a node box");
    }

    /// Anti-parallel arcs on a transition's perpendicular (Top/Bottom) border must not cross:
    /// an input arriving from behind and an output leaving forward share the border, and if the
    /// ports are ordered by source/target alone (ignoring which node each runs toward) their two
    /// L-bends cross at the node corner. Reproduces the linear two-object-type "order management"
    /// OCPN whose "Place Order"/"Archive Order" corners previously crossed.
    #[test]
    fn transition_border_ports_do_not_cross() {
        let mut net = PetriNet::new();
        // Two parallel object-type lanes (orders "o", items "i") through four shared transitions.
        let place_order = net.add_transition(Some("Place Order".into()), None);
        let pay_order = net.add_transition(Some("Pay Order".into()), None);
        let ship_item = net.add_transition(Some("Ship Item".into()), None);
        let archive = net.add_transition(Some("Archive Order".into()), None);
        let o_start = net.add_place(None);
        let i_start = net.add_place(None);
        let o1 = net.add_place(None);
        let i1 = net.add_place(None);
        let o2 = net.add_place(None);
        let i2 = net.add_place(None);
        let o_end = net.add_place(None);
        let i_end = net.add_place(None);
        for arc in [
            ArcType::place_to_transition(o_start, place_order),
            ArcType::place_to_transition(i_start, place_order),
            ArcType::transition_to_place(place_order, o1),
            ArcType::transition_to_place(place_order, i1),
            ArcType::place_to_transition(o1, pay_order),
            ArcType::place_to_transition(i1, ship_item),
            ArcType::transition_to_place(pay_order, o2),
            ArcType::transition_to_place(ship_item, i2),
            ArcType::place_to_transition(o2, archive),
            ArcType::place_to_transition(i2, archive),
            ArcType::transition_to_place(archive, o_end),
            ArcType::transition_to_place(archive, i_end),
        ] {
            net.add_arc(arc, None);
        }

        let lr = layout_petri_net(&net);
        let m = petri_metrics(&lr, &net);
        assert_eq!(
            m.crossings, 0,
            "no arcs may cross on the transition borders"
        );
        assert_eq!(m.node_hits, 0, "no arc may be routed through a node box");
        assert_eq!(m.overlaps, 0, "no two arcs may be coincident");
    }

    /// The layout is a pure function of its input: laying the same net out twice must yield
    /// byte-identical geometry (guards the deterministic tie-breaks the engine relies on).
    #[test]
    fn layout_is_deterministic() {
        let mut net = PetriNet::new();
        let src = net.add_place(None);
        let split = net.add_transition(Some("split".into()), None);
        let (pa, pb) = (net.add_place(None), net.add_place(None));
        let join = net.add_transition(Some("join".into()), None);
        let sink = net.add_place(None);
        for arc in [
            ArcType::place_to_transition(src, split),
            ArcType::transition_to_place(split, pa),
            ArcType::transition_to_place(split, pb),
            ArcType::place_to_transition(pa, join),
            ArcType::place_to_transition(pb, join),
            ArcType::transition_to_place(join, sink),
        ] {
            net.add_arc(arc, None);
        }

        let a = layout_petri_net(&net);
        let b = layout_petri_net(&net);
        let centers = |lr: &LayoutResult| -> Vec<(f64, f64)> {
            lr.nodes.iter().map(|n| (n.cx, n.cy)).collect()
        };
        let routes = |lr: &LayoutResult| -> Vec<Vec<(f64, f64)>> {
            lr.edges.iter().map(|e| e.points.clone()).collect()
        };
        assert_eq!(
            centers(&a),
            centers(&b),
            "node centres must be deterministic"
        );
        assert_eq!(routes(&a), routes(&b), "edge routes must be deterministic");
    }

    /// The on-screen Petri layout (studio display) runs the generic `layout_graph` engine; the SVG
    /// export runs `layout_petri_net`. They must produce byte-identical geometry, or the exported
    /// image won't match what the user sees. This mirrors the canonical node order / sizes / weights
    /// the JS `layoutPetriNet` feeds the generic engine (places then transitions, each id-sorted).
    #[test]
    fn display_and_export_layouts_match() {
        use super::{layout_graph, GraphNode, GraphSpec};

        let mut net = PetriNet::new();
        let src = net.add_place(None);
        let split = net.add_transition(Some("split".into()), None);
        let pa = net.add_place(None);
        let pb = net.add_place(None);
        let join = net.add_transition(Some("join".into()), None);
        let sink = net.add_place(None);
        for arc in [
            ArcType::place_to_transition(src, split),
            ArcType::transition_to_place(split, pa),
            ArcType::transition_to_place(split, pb),
            ArcType::place_to_transition(pa, join),
            ArcType::place_to_transition(pb, join),
            ArcType::transition_to_place(join, sink),
        ] {
            net.add_arc(arc, None);
        }

        // Export path.
        let export = layout_petri_net(&net);

        // Display path: canonical node order = places (id-sorted) then transitions (id-sorted).
        let mut places: Vec<_> = net.places.keys().copied().collect();
        places.sort_unstable();
        let mut transitions: Vec<_> = net.transitions.keys().copied().collect();
        transitions.sort_unstable();
        let mut order: Vec<uuid::Uuid> = places.clone();
        order.extend(transitions.iter().copied());
        let index: std::collections::HashMap<uuid::Uuid, usize> =
            order.iter().enumerate().map(|(i, u)| (*u, i)).collect();
        let nodes: Vec<GraphNode> = order
            .iter()
            .map(|u| {
                let place = net.places.contains_key(u);
                GraphNode {
                    width: if place { 52.0 } else { 120.0 },
                    height: 52.0,
                    ellipse: place,
                    pin: None,
                    category: None,
                    seed: None,
                    pinned: false,
                    clear_after: 0.0,
                }
            })
            .collect();
        let edges: Vec<(usize, usize)> = net
            .arcs
            .iter()
            .map(|arc| {
                let (a, b) = match arc.from_to {
                    ArcType::PlaceTransition(p, t) => (p, t),
                    ArcType::TransitionPlace(t, p) => (t, p),
                };
                (index[&a], index[&b])
            })
            .collect();
        let weights = vec![1.0; edges.len()];
        let display = layout_graph(GraphSpec {
            nodes,
            edges,
            weights,
            direction: Some("LR".into()),
            flow_edges: false,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![],
        })
        .expect("layout_graph");

        // Export node i corresponds to canonical order[i]; compare centres.
        let export_centers: Vec<(f64, f64)> = order
            .iter()
            .map(|u| {
                let n = export.nodes.iter().find(|n| n.uuid == *u).unwrap();
                (n.cx, n.cy)
            })
            .collect();
        let display_centers: Vec<(f64, f64)> =
            display.centers.iter().map(|c| (c[0], c[1])).collect();
        assert_eq!(
            export_centers, display_centers,
            "export (layout_petri_net) and display (layout_graph) centres must match"
        );

        // Edge routes must match too (both keyed by net.arcs order).
        let export_routes: Vec<Vec<(f64, f64)>> =
            export.edges.iter().map(|e| e.points.clone()).collect();
        let display_routes: Vec<Vec<(f64, f64)>> = display
            .routes
            .iter()
            .map(|r| r.iter().map(|&[x, y]| (x, y)).collect())
            .collect();
        assert_eq!(
            export_routes, display_routes,
            "export and display edge routes must match"
        );
    }
}
