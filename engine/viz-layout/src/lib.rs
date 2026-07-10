//! Pure layered-layout engine + generic StyledGraph SVG renderer, free of `process_mining`, so it can
//! compile to a small standalone wasm for the components library as well as being reused by the backend.
pub mod graph_svg;
pub mod layout;
mod svg_util;

pub use graph_svg::{render_graph_svg, StyledGraph};
pub use svg_util::SvgPalette;

use layout::{Direction, LayerConstraint, LayeredInput, LayeredInputNode, NodeShape};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub ellipse: bool,
    /// `"first"` / `"last"` to pin to the source / sink rank.
    #[serde(default)]
    pub pin: Option<String>,
    /// Optional grouping id (e.g. an object type). Same-category nodes are held in a consistent
    /// order across layers as a crossing-neutral tiebreak, so each category reads as a straight
    /// lane. `null`/absent => no grouping.
    #[serde(default)]
    pub category: Option<u32>,
    /// Optional seed centre `[x, y]` in final space. When any node has a seed, the cross-axis
    /// coordinate is placed at the seed instead of the straightness-optimal spot - a stable
    /// relayout that keeps un-dragged nodes put (layer/order stay structural). `null` => none.
    #[serde(default)]
    pub seed: Option<[f64; 2]>,
    /// Hard-pin this node's seed cross-coordinate (others yield around it). Only meaningful with
    /// `seed`; use for the just-dragged node so it lands exactly where dropped.
    #[serde(default)]
    pub pinned: bool,
    /// Minimum clearance (px) to keep free beyond this node's border on the positive order side
    /// (screen right in TB, screen bottom in LR) - room for caller-drawn self-loops + labels.
    #[serde(default)]
    pub clear_after: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphSpec {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<(usize, usize)>,
    #[serde(default)]
    pub weights: Vec<f64>,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub flow_edges: bool,
    /// Diagonal (flow) routing instead of orthogonal. Only meaningful with `flow_edges`. Default
    /// `false` => orthogonal.
    #[serde(default)]
    pub flow_diagonal: bool,
    #[serde(default)]
    pub edge_label_sizes: Vec<[f64; 2]>,
    /// Drawn stroke width per edge (same length/order as `edges`); port spreading keeps adjacent
    /// thick strokes from visually merging. Empty => all 2.0.
    #[serde(default)]
    pub thickness: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphLayout {
    pub centers: Vec<[f64; 2]>,
    pub routes: Vec<Vec<[f64; 2]>>,
}

/// Build the engine's `LayeredInput` from a `GraphSpec`, validating edge indices. Shared by
/// [`layout_graph`] and [`reroute_graph`] so the two entry points differ only in which layout pass
/// they run.
fn spec_to_input(spec: GraphSpec) -> Result<LayeredInput, String> {
    let n = spec.nodes.len();
    for &(a, b) in &spec.edges {
        if a >= n || b >= n {
            return Err(format!("edge ({a},{b}) references a node index outside 0..{n}"));
        }
    }
    let nodes: Vec<LayeredInputNode> = spec
        .nodes
        .iter()
        .map(|nd| LayeredInputNode {
            width: nd.width,
            height: nd.height,
            shape: if nd.ellipse { NodeShape::Ellipse } else { NodeShape::Box },
            constraint: match nd.pin.as_deref() {
                Some("first") => Some(LayerConstraint::First),
                Some("last") => Some(LayerConstraint::Last),
                _ => None,
            },
            category: nd.category,
            clear_after: nd.clear_after,
        })
        .collect();
    let direction = match spec.direction.as_deref() {
        Some(d) if d.eq_ignore_ascii_case("LR") => Direction::LeftRight,
        _ => Direction::TopBottom,
    };
    let weights = if spec.weights.len() == spec.edges.len() { spec.weights } else { vec![] };
    let thickness = if spec.thickness.len() == spec.edges.len() { spec.thickness } else { vec![] };
    let seed = spec.nodes.iter().map(|nd| nd.seed.map(|[x, y]| (x, y))).collect();
    let pinned = spec.nodes.iter().map(|nd| nd.pinned).collect();
    Ok(LayeredInput {
        nodes,
        edges: spec.edges,
        weights,
        thickness,
        direction,
        flow_edges: spec.flow_edges,
        flow_diagonal: spec.flow_diagonal,
        edge_label_sizes: spec.edge_label_sizes.iter().map(|&[w, h]| (w, h)).collect(),
        seed,
        pinned,
    })
}

fn to_graph_layout(out: &layout::LayeredOutput) -> GraphLayout {
    GraphLayout {
        centers: out.centers.iter().map(|&(x, y)| [x, y]).collect(),
        routes: out.routes.iter().map(|r| r.iter().map(|&(x, y)| [x, y]).collect()).collect(),
    }
}

/// Lay out an arbitrary directed graph -> node centres + edge polylines.
pub fn layout_graph(spec: GraphSpec) -> Result<GraphLayout, String> {
    Ok(to_graph_layout(&layout::layout_layered(&spec_to_input(spec)?)))
}

/// On-drop relayout: re-route edges over the caller's final node positions (each node's `seed` is its
/// current centre) without recomputing a layout. The grid is derived from the positions, so a dragged
/// node's edges route cleanly against where it was actually dropped. Node centres come back unchanged.
/// See [`layout::reroute_from_positions`].
pub fn reroute_graph(spec: GraphSpec) -> Result<GraphLayout, String> {
    Ok(to_graph_layout(&layout::reroute_from_positions(&spec_to_input(spec)?)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Two parallel object-type lanes (physical lane A = node indices 0,3,7,10; lane B = 1,4,8,11)
    /// run through shared, uncategorized transitions. `lane_a_category` is the category id given to
    /// lane A; lane B gets the other. The crossing-neutral consistency pass must always order each
    /// column ascending by category (cat0 above cat1), so which physical lane ends up on top is
    /// dictated purely by the category assignment.
    fn two_lane_spec(lane_a_category: u32) -> GraphSpec {
        // 0 A_start,1 B_start | 2 T | 3 A1,4 B1 | 5 T,6 T | 7 A2,8 B2 | 9 T | 10 A_end,11 B_end
        let other = 1 - lane_a_category;
        let place = |c: u32| GraphNode {
            width: 52.0,
            height: 52.0,
            ellipse: true,
            pin: None,
            category: Some(c),
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        let trans = || GraphNode {
            width: 120.0,
            height: 52.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        let (a, b) = (lane_a_category, other);
        let nodes = vec![
            place(a), place(b), trans(),
            place(a), place(b), trans(), trans(),
            place(a), place(b), trans(),
            place(a), place(b),
        ];
        let edges = vec![
            (0, 2), (1, 2), (2, 3), (2, 4), (3, 5), (4, 6),
            (5, 7), (6, 8), (7, 9), (8, 9), (9, 10), (9, 11),
        ];
        GraphSpec {
            nodes,
            edges,
            weights: vec![],
            direction: Some("LR".into()),
            flow_edges: false,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![],
        }
    }

    /// Every column (nodes sharing an x) must place all category-0 nodes above (smaller y) all
    /// category-1 nodes. Returns false at the first violated column.
    fn lanes_consistent(spec: &GraphSpec, layout: &GraphLayout) -> bool {
        use std::collections::BTreeMap;
        let mut columns: BTreeMap<i64, Vec<(u32, f64)>> = BTreeMap::new();
        for (i, nd) in spec.nodes.iter().enumerate() {
            if let Some(c) = nd.category {
                let x = layout.centers[i][0].round() as i64;
                columns.entry(x).or_default().push((c, layout.centers[i][1]));
            }
        }
        for col in columns.values() {
            let max0 = col.iter().filter(|(c, _)| *c == 0).map(|(_, y)| *y).fold(f64::NEG_INFINITY, f64::max);
            let min1 = col.iter().filter(|(c, _)| *c == 1).map(|(_, y)| *y).fold(f64::INFINITY, f64::min);
            if max0.is_finite() && min1.is_finite() && max0 >= min1 {
                return false;
            }
        }
        true
    }

    fn line_spec(n: usize) -> GraphSpec {
        GraphSpec {
            nodes: (0..n)
                .map(|_| GraphNode {
                    width: 52.0,
                    height: 52.0,
                    ellipse: true,
                    pin: None,
                    category: None,
                    seed: None,
                    pinned: false,
                    clear_after: 0.0,
                })
                .collect(),
            edges: (0..n.saturating_sub(1)).map(|i| (i, i + 1)).collect(),
            weights: vec![],
            direction: Some("LR".into()),
            flow_edges: false,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![],
        }
    }

    /// Seeding every node at its current centre and dragging one (pinned) must move *only* that node:
    /// the layout is deterministic so layer/order/layer-x are unchanged, and the seeded coordinate
    /// pass keeps every other node exactly where it was (each is alone in its layer -> no separation
    /// pressure). The dragged node holds its drop position exactly.
    #[test]
    fn seeded_relayout_keeps_undragged_nodes_put() {
        let base = line_spec(5);
        let o0 = layout_graph(base).unwrap();

        let mut seeded = line_spec(5);
        for (i, nd) in seeded.nodes.iter_mut().enumerate() {
            nd.seed = Some(o0.centers[i]);
        }
        let target_y = o0.centers[2][1] + 120.0;
        seeded.nodes[2].seed = Some([o0.centers[2][0], target_y]);
        seeded.nodes[2].pinned = true;
        let o1 = layout_graph(seeded).unwrap();

        assert!((o1.centers[2][1] - target_y).abs() < 1e-6, "pinned node must hold its drop y");
        assert!((o1.centers[2][0] - o0.centers[2][0]).abs() < 1e-6, "layer-x is structural, unchanged");
        for i in [0usize, 1, 3, 4] {
            assert!(
                (o1.centers[i][0] - o0.centers[i][0]).abs() < 1e-6
                    && (o1.centers[i][1] - o0.centers[i][1]).abs() < 1e-6,
                "node {i} must stay put on a stable relayout"
            );
        }
    }

    /// A pinned node must hold its dropped position on the *layer* axis too (the axis a node is
    /// dragged across to change layers), not just the cross axis - it floats off its structural
    /// column to exactly where it was dropped.
    #[test]
    fn seeded_pin_holds_layer_axis() {
        let base = line_spec(5);
        let o0 = layout_graph(base).unwrap(); // LR: layer axis = x.
        let mut seeded = line_spec(5);
        for (i, nd) in seeded.nodes.iter_mut().enumerate() {
            nd.seed = Some(o0.centers[i]);
        }
        let target_x = o0.centers[2][0] + 200.0; // drag node 2 far along the layer (x) axis
        seeded.nodes[2].seed = Some([target_x, o0.centers[2][1]]);
        seeded.nodes[2].pinned = true;
        let o1 = layout_graph(seeded).unwrap();
        assert!(
            (o1.centers[2][0] - target_x).abs() < 1e-6,
            "pinned node must hold its dropped layer-axis position, got {} want {target_x}",
            o1.centers[2][0]
        );
        // Un-pinned neighbours keep their layer columns.
        for i in [0usize, 1, 3, 4] {
            assert!((o1.centers[i][0] - o0.centers[i][0]).abs() < 1e-6, "node {i} column must not move");
        }
    }

    /// A seeded node dropped on top of a sibling in the *same* layer must still respect separation:
    /// the pinned node holds its spot and the sibling yields just enough (never overlapping).
    #[test]
    fn seeded_relayout_respects_separation() {
        // Diamond: 0 -> {1,2} -> 3, so nodes 1 and 2 share the middle layer.
        let mk = || GraphNode {
            width: 52.0,
            height: 52.0,
            ellipse: true,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        let spec = GraphSpec {
            nodes: vec![mk(), mk(), mk(), mk()],
            edges: vec![(0, 1), (0, 2), (1, 3), (2, 3)],
            weights: vec![],
            direction: Some("LR".into()),
            flow_edges: false,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![],
        };
        let o0 = layout_graph(spec.clone()).unwrap();
        // Which of 1/2 is upper vs lower is structural; drag the lower one up onto the upper one.
        let (upper, lower) = if o0.centers[1][1] < o0.centers[2][1] { (1, 2) } else { (2, 1) };
        let mut seeded = spec;
        for (i, nd) in seeded.nodes.iter_mut().enumerate() {
            nd.seed = Some(o0.centers[i]);
        }
        seeded.nodes[lower].seed = Some([o0.centers[lower][0], o0.centers[upper][1]]); // onto the sibling
        seeded.nodes[lower].pinned = true;
        let o1 = layout_graph(seeded).unwrap();

        assert!(
            (o1.centers[lower][1] - o0.centers[upper][1]).abs() < 1e-6,
            "pinned node holds its (overlapping) drop position"
        );
        assert!(
            (o1.centers[lower][1] - o1.centers[upper][1]).abs() >= 51.9,
            "the sibling must yield so the two never overlap (>= one node height apart)"
        );
    }

    /// The dominant flow must read as ONE straight vertical spine, even when a rare-path node sits
    /// in the layer a heavy skip-edge passes through. Mirrors the order-management OC-DFG:
    /// send package ->(5,917)-> package delivered skips over failed delivery (214-path). The heavy
    /// edge's channel must claim the spine (source and target centred on it); the light node is
    /// the one pushed aside - not the other way around.
    #[test]
    fn flow_node_centers_between_predecessors() {
        let act = || GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        // 0 create -> 1 send -> 2 failed -> 3 delivered, plus the heavy skip 1 -> 3.
        let spec = GraphSpec {
            nodes: vec![act(), act(), act(), act()],
            edges: vec![(0, 1), (1, 3), (1, 2), (2, 3)],
            weights: vec![
                1.0 + 7100.0f64.ln(),
                1.0 + 5917.0f64.ln(),
                1.0 + 214.0f64.ln(),
                1.0 + 214.0f64.ln(),
            ],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![7.7, 7.2, 4.1, 4.1],
        };
        let o = layout_graph(spec).unwrap();
        let x = |i: usize| o.centers[i][0];
        // Flow graphs favour centred edge->node attachment over dead-straight heavy trunks
        // (`favor_centered`, mirroring ELK). The 0->1 heavy forward edge still aligns, but the heavy
        // skip 1->3 no longer *pins* node 3 dead-straight under node 1: node 3 yields off the spine so
        // its incident edges meet it nearer centre. (Under the old weighted priority-straightness the
        // chain was pinned straight - x3 == x1 - and the light node exiled to one side.)
        assert!(
            (x(0) - x(1)).abs() < 1.0,
            "heavy forward edge 0->1 still aligns: got {:.1} / {:.1}",
            x(0),
            x(1)
        );
        assert!(
            (x(3) - x(1)).abs() > 20.0,
            "node 3 is no longer pinned to the straight spine (centring wins): x3={:.1}, x1={:.1}",
            x(3),
            x(1)
        );
        assert!(
            (x(2) - x(1)).abs() > 40.0,
            "the light branch node still sits clear of the main line: |{:.1} - {:.1}|",
            x(2),
            x(1)
        );
    }

    /// A second, lighter parallel skip-edge (the 914-packages arc) has to detour around the
    /// off-spine node - but its route must still END by entering the target's border with a
    /// proper final approach, not stop on a horizontal run floating next to / above the node.
    #[test]
    fn detour_skip_edge_enters_target_border() {
        let act = || GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        let spec = GraphSpec {
            nodes: vec![act(), act(), act(), act()],
            edges: vec![(0, 1), (1, 3), (1, 3), (1, 2), (2, 3)],
            weights: vec![
                1.0 + 7100.0f64.ln(),
                1.0 + 5917.0f64.ln(),
                1.0 + 914.0f64.ln(),
                1.0 + 214.0f64.ln(),
                1.0 + 214.0f64.ln(),
            ],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![7.7, 7.2, 7.3, 4.1, 4.1],
        };
        let o = layout_graph(spec).unwrap();
        let (cx3, cy3) = (o.centers[3][0], o.centers[3][1]);
        let detour = &o.routes[2];
        assert!(detour.len() >= 2, "detour must have a route");
        let end = detour[detour.len() - 1];
        let on_border = (end[1] - (cy3 - 29.0)).abs() < 1.0 && (end[0] - cx3).abs() <= 76.0
            || (end[0] - cx3).abs() >= 74.0 && (end[0] - cx3).abs() <= 76.0 && (end[1] - cy3).abs() <= 30.0;
        assert!(
            on_border,
            "detour end {end:?} must lie ON the target border (target centre ({cx3:.1},{cy3:.1}))"
        );
        let prev = detour[detour.len() - 2];
        let (dx, dy) = (end[0] - prev[0], end[1] - prev[1]);
        // Entering the top border must be a (mostly) vertical approach; entering a side border a
        // (mostly) horizontal one. A near-flat approach onto the top border floats the arrow.
        if (end[1] - (cy3 - 29.0)).abs() < 1.0 {
            assert!(
                dy.abs() >= dx.abs() * 0.5,
                "top-border entry must approach downward, got segment ({dx:.1},{dy:.1})"
            );
        }
    }

    /// Parallel same-(from,to) arcs (one per object type in an OC-DFG) must ride ONE corridor:
    /// identical route shape, laterally offset lanes, every lane still anchored on the node
    /// borders. Independently routed they scatter over different ports and channels.
    #[test]
    fn parallel_arcs_ride_one_corridor() {
        let act = || GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        let spec = GraphSpec {
            nodes: vec![act(), act()],
            edges: vec![(0, 1), (0, 1), (0, 1)],
            weights: vec![9.0, 8.0, 7.0],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![8.0, 7.0, 4.0],
        };
        let o = layout_graph(spec).unwrap();
        assert_eq!(o.routes.len(), 3);
        let len0 = o.routes[0].len();
        assert!(len0 >= 2);
        for r in &o.routes {
            assert_eq!(r.len(), len0, "all lanes must share the bundle's shape");
        }
        // Lanes are parallel: the lateral delta between two lanes is the same at every point.
        for pair in [(0usize, 1usize), (1, 2)] {
            let d0 = (o.routes[pair.1][0][0] - o.routes[pair.0][0][0],
                      o.routes[pair.1][0][1] - o.routes[pair.0][0][1]);
            for k in 0..len0 {
                let dk = (o.routes[pair.1][k][0] - o.routes[pair.0][k][0],
                          o.routes[pair.1][k][1] - o.routes[pair.0][k][1]);
                assert!(
                    (dk.0 - d0.0).abs() < 0.6 && (dk.1 - d0.1).abs() < 0.6,
                    "lane {pair:?} not parallel at point {k}: {dk:?} vs {d0:?}"
                );
            }
            assert!(
                d0.0.hypot(d0.1) >= 10.0,
                "lanes must be visibly separated, got {:.1}",
                d0.0.hypot(d0.1)
            );
        }
        // Every lane still starts on the source's bottom border and ends on the target's top.
        let (sy, ty) = (o.centers[0][1] + 29.0, o.centers[1][1] - 29.0);
        for r in &o.routes {
            assert!((r[0][1] - sy).abs() < 0.6, "lane start off the source border: {:?}", r[0]);
            assert!(
                (r[r.len() - 1][1] - ty).abs() < 0.6,
                "lane end off the target border: {:?}",
                r[r.len() - 1]
            );
        }
    }

    #[test]
    fn category_controls_lane_order() {
        // Lane A = cat0 -> lane A sits on top and stays there in every column.
        let s0 = two_lane_spec(0);
        let o0 = layout_graph(s0.clone()).unwrap();
        assert!(lanes_consistent(&s0, &o0), "cat0 lane must stay above cat1 in every column");
        let a_above_b_0 = o0.centers[0][1] < o0.centers[1][1];

        // Swap the categories -> the *same* physical lanes, but now lane B is cat0, so lane B must
        // rise above lane A. Both layouts are internally consistent; the flip proves the category
        // (not node index or structure) dictates the order.
        let s1 = two_lane_spec(1);
        let o1 = layout_graph(s1.clone()).unwrap();
        assert!(lanes_consistent(&s1, &o1), "cat0 lane must stay above cat1 after the swap too");
        let a_above_b_1 = o1.centers[0][1] < o1.centers[1][1];

        assert_ne!(
            a_above_b_0, a_above_b_1,
            "swapping the category assignment must swap which physical lane is on top"
        );
    }

    /// Sampled test: does segment `p->q` pass through the interior (inset 2px) of the box centred at
    /// `c` with half-extents `hw`,`hh`?
    fn seg_hits_box(p: [f64; 2], q: [f64; 2], c: [f64; 2], hw: f64, hh: f64) -> bool {
        let inset = 2.0;
        let (l, r, t, b) = (c[0] - hw + inset, c[0] + hw - inset, c[1] - hh + inset, c[1] + hh - inset);
        for k in 0..=64 {
            let f = k as f64 / 64.0;
            let (x, y) = (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f);
            if x > l && x < r && y > t && y < b {
                return true;
            }
        }
        false
    }

    /// The on-drop reroute must keep every node exactly where dropped AND route the dragged node's
    /// edge cleanly around the boxes. Reproduces the reported bug: `send package -> package delivered`
    /// where delivered is dragged up-and-right of send - the old seeded relayout raked the arc
    /// straight through the send box (stale topological chain); rerouting from the actual positions
    /// must not.
    #[test]
    fn reroute_dragged_node_edge_clears_boxes() {
        let act = || GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        // 0 = send, 1 = delivered; heavy 0 -> 1 arc.
        let spec = GraphSpec {
            nodes: vec![act(), act()],
            edges: vec![(0, 1)],
            weights: vec![1.0 + 5917.0f64.ln()],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![7.2],
        };
        let base = layout_graph(spec.clone()).unwrap();
        let send = base.centers[0];
        let dropped = [send[0] + 480.0, send[1] - 130.0]; // delivered dragged up-and-right of send

        let mut drag = spec;
        drag.nodes[0].seed = Some(send);
        drag.nodes[0].pinned = true;
        drag.nodes[1].seed = Some(dropped);
        drag.nodes[1].pinned = true;
        let out = reroute_graph(drag).unwrap();

        assert!(
            (out.centers[0][0] - send[0]).abs() < 1e-6 && (out.centers[0][1] - send[1]).abs() < 1e-6,
            "send must stay exactly put"
        );
        assert!(
            (out.centers[1][0] - dropped[0]).abs() < 1e-6 && (out.centers[1][1] - dropped[1]).abs() < 1e-6,
            "delivered must hold its drop position exactly"
        );

        let route = &out.routes[0];
        assert!(route.len() >= 2, "the arc must be routed");
        for w in route.windows(2) {
            for &c in &[out.centers[0], out.centers[1]] {
                assert!(
                    !seg_hits_box(w[0], w[1], c, 75.0, 29.0),
                    "route segment {:?}->{:?} rakes through the box at {:?}",
                    w[0],
                    w[1],
                    c
                );
            }
        }
    }

    /// Regression: an identity reroute (every node seeded at its fresh centre, nothing actually
    /// dragged) must reproduce the fresh routes and never re-derive a multi-layer edge's waypoints
    /// onto the nodes its chain skips. A vertical chain 0->1->2->3->4 with a long skip 0->4 (3 dummies) is
    /// the trap: naive straight-line dummy placement dropped the skip straight down the chain column
    /// and raked nodes 1..3; the coordinate machinery must lane it aside exactly like the fresh
    /// layout does.
    #[test]
    fn reroute_identity_reproduces_fresh_and_clears_boxes() {
        let act = || GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        };
        let spec = GraphSpec {
            nodes: vec![act(), act(), act(), act(), act()],
            edges: vec![(0, 1), (1, 2), (2, 3), (3, 4), (0, 4)],
            weights: vec![5.0; 5],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![],
        };
        let fresh = layout_graph(spec.clone()).unwrap();
        let mut seeded = spec;
        for (i, nd) in seeded.nodes.iter_mut().enumerate() {
            nd.seed = Some(fresh.centers[i]);
            nd.pinned = true;
        }
        let re = reroute_graph(seeded).unwrap();

        for (i, r) in re.routes.iter().enumerate() {
            assert_eq!(r.len(), fresh.routes[i].len(), "edge {i} route length changed on identity reroute");
            for (a, b) in r.iter().zip(&fresh.routes[i]) {
                assert!(
                    (a[0] - b[0]).abs() < 1e-6 && (a[1] - b[1]).abs() < 1e-6,
                    "edge {i} route changed on identity reroute: {a:?} vs {b:?}"
                );
            }
        }
        let edges = [(0usize, 1usize), (1, 2), (2, 3), (3, 4), (0, 4)];
        for (ei, &(s, t)) in edges.iter().enumerate() {
            for w in re.routes[ei].windows(2) {
                for ni in 0..5 {
                    if ni == s || ni == t {
                        continue;
                    }
                    assert!(
                        !seg_hits_box(w[0], w[1], re.centers[ni], 75.0, 29.0),
                        "edge {ei} rakes node {ni} on identity reroute"
                    );
                }
            }
        }
    }

    /// The guarded orthogonal end-approach relief. In a dragged OC-DFG where `create` and `failed`
    /// share a row (same Y), the `send -> failed` feedback arc would otherwise enter `failed` through a
    /// side run raking `create`. The relief must re-attach the arrowhead to a perpendicular border so
    /// no route rakes a non-endpoint box - in orthogonal mode, where the columnar router can't see it.
    #[test]
    fn reroute_orthogonal_end_approach_clears_boxes() {
        let act = |x: f64, y: f64| GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: Some([x, y]),
            pinned: true,
            clear_after: 0.0,
        };
        // 0 create, 1 send, 2 delivered (dragged up-right), 3 failed - the reported positions.
        let spec = GraphSpec {
            nodes: vec![
                act(120.75, 495.0),
                act(118.65, 725.0),
                act(601.96, 594.61),
                act(370.54, 509.32),
            ],
            edges: vec![(0, 1), (1, 2), (1, 3), (3, 2)],
            weights: vec![9.0, 9.0, 4.0, 4.0],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: false, // orthogonal - the mode the relief targets
            edge_label_sizes: vec![],
            thickness: vec![7.7, 7.2, 4.1, 4.1],
        };
        let out = reroute_graph(spec).unwrap();
        for (ei, &(s, t)) in [(0usize, 1usize), (1, 2), (1, 3), (3, 2)].iter().enumerate() {
            for w in out.routes[ei].windows(2) {
                for ni in 0..4 {
                    if ni == s || ni == t {
                        continue;
                    }
                    assert!(
                        !seg_hits_box(w[0], w[1], out.centers[ni], 75.0, 29.0),
                        "orthogonal edge {ei} rakes node {ni}"
                    );
                }
            }
        }
    }

    /// A dragged OC-DFG (ocdfg(23)): `start -> create package` is a long edge whose straight channel
    /// crosses `place order` (x=0) and `pick item` (dragged to x=92). Per-layer dummy separation put
    /// its waypoints on opposite sides; the emitter averaged them into a channel raking both boxes.
    /// The single-clear-lane pass must route the whole chain to one side - no route may rake a
    /// non-endpoint box, in either routing mode.
    #[test]
    fn reroute_long_edge_single_lane_clears_boxes() {
        // ocdfg(23) positions: [x, y, terminal]
        let pos: [(f64, f64, bool); 11] = [
            (0.0, 18.0, true), (0.0, 129.0, false), (120.75, 495.0, false), (120.75, 617.0, false),
            (180.35, 861.0, false), (92.91, 229.34, false), (-164.6, 251.0, false), (-164.6, 1105.0, false),
            (-59.6, 983.0, false), (61.15, 739.0, false), (-164.6, 1216.0, true),
        ];
        let nodes: Vec<GraphNode> = pos
            .iter()
            .map(|&(x, y, t)| GraphNode {
                width: if t { 36.0 } else { 150.0 },
                height: if t { 36.0 } else { 58.0 },
                ellipse: t,
                pin: None,
                category: None,
                seed: Some([x, y]),
                pinned: true,
                clear_after: 0.0,
            })
            .collect();
        let e: [(usize, usize, f64); 26] = [
            (0,1,7659.0),(2,3,7100.0),(3,4,5917.0),(5,2,5290.0),(1,6,5232.0),(7,10,4278.0),(6,5,3528.0),
            (4,7,3381.0),(4,8,2562.0),(1,5,1915.0),(8,7,1669.0),(4,8,1606.0),(5,6,1495.0),(6,7,1363.0),
            (0,1,2000.0),(7,10,2000.0),(1,6,2000.0),(6,7,1557.0),(6,8,443.0),(8,7,443.0),
            (0,2,1128.0),(2,3,1128.0),(4,7,1128.0),(3,4,914.0),(9,4,214.0),(3,9,214.0),
        ];
        let edges: Vec<(usize, usize)> = e.iter().map(|&(a, b, _)| (a, b)).collect();
        for flow_diagonal in [false, true] {
            let spec = GraphSpec {
                nodes: nodes.clone(),
                edges: edges.clone(),
                weights: e.iter().map(|&(_, _, c)| 1.0 + c.ln()).collect(),
                direction: Some("TB".into()),
                flow_edges: true,
                flow_diagonal,
                edge_label_sizes: vec![],
                thickness: e.iter().map(|&(_, _, c)| 1.0 + 7.0 * (c / 7659.0).sqrt()).collect(),
            };
            let out = reroute_graph(spec).unwrap();
            for (ei, &(s, t)) in edges.iter().enumerate() {
                for w in out.routes[ei].windows(2) {
                    for (ni, &(_, _, term)) in pos.iter().enumerate() {
                        if ni == s || ni == t {
                            continue;
                        }
                        let (hw, hh) = if term { (18.0, 18.0) } else { (75.0, 29.0) };
                        assert!(
                            !seg_hits_box(w[0], w[1], out.centers[ni], hw, hh),
                            "diagonal={flow_diagonal}: edge {ei} ({s}->{t}) rakes node {ni}"
                        );
                    }
                }
            }
        }
    }

    /// Anti-parallel edges between two same-row nodes (a 2-cycle - e.g. `confirm order <-> pick item`
    /// after a drag) must ride parallel lanes, not cross. The port uncross pass handles the
    /// swapped-endpoint case (a's source shares a node with b's target).
    #[test]
    fn reroute_antiparallel_same_row_no_cross() {
        let act = |x: f64, y: f64| GraphNode {
            width: 150.0,
            height: 58.0,
            ellipse: false,
            pin: None,
            category: None,
            seed: Some([x, y]),
            pinned: true,
            clear_after: 0.0,
        };
        // A and B on the same row (confirm order + pick item positions); edges A->B and B->A.
        let spec = GraphSpec {
            nodes: vec![act(-164.6, 251.0), act(30.9, 261.0)],
            edges: vec![(0, 1), (1, 0)],
            weights: vec![1.0 + 3528.0f64.ln(), 1.0 + 1495.0f64.ln()],
            direction: Some("TB".into()),
            flow_edges: true,
            flow_diagonal: true, // diagonal is where the X appeared
            edge_label_sizes: vec![],
            thickness: vec![5.75, 4.1],
        };
        let out = reroute_graph(spec).unwrap();
        let (ab, ba) = (&out.routes[0], &out.routes[1]);
        let ccw = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| {
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        };
        for i in 0..ab.len() - 1 {
            for j in 0..ba.len() - 1 {
                let (p, q, r, s) = (ab[i], ab[i + 1], ba[j], ba[j + 1]);
                let proper = ccw(p, q, r) * ccw(p, q, s) < 0.0 && ccw(r, s, p) * ccw(r, s, q) < 0.0;
                assert!(!proper, "anti-parallel edges cross at segment {i}/{j}");
            }
        }
    }
}
