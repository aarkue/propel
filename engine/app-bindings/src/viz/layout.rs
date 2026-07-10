//! Pure-Rust Sugiyama-style layered layout, direction-generic (Petri nets = LR, DFGs = TB).
//!
//! Pipeline:
//!   1. Build integer-ID adjacency from the [`LayeredInput`] (Petri/DFG adapters feed it).
//!   2. Greedy feedback-arc-set cycle breaking (Eades-Lin-Smyth).
//!   3. Longest-path layering (+ First/Last layer constraints for terminals).
//!   4. Dummy-node insertion for edges spanning > 1 layer.
//!   5. Barycenter + greedy-transposition crossing minimization (keep-best).
//!   6. Brandes-Köpf coordinate assignment (aligns chains/long edges straight).
//!   7. Four-sided ported orthogonal routing with gutter lanes + monotone tracks.
//!   8. Unwind dummies/reversed arcs; transpose for TB -> [`LayeredOutput`].

use process_mining::core::process_models::case_centric::petri_net::ArcType;
use process_mining::PetriNet;
use std::collections::HashMap;
use uuid::Uuid;

// The generic layered-layout engine now lives in the `viz-layout` crate.
pub use viz_layout::layout::*;

// Node sizes (match TS constants in layout-graph.ts)
pub const PLACE_W: f64 = 52.0;
pub const PLACE_H: f64 = 52.0;
pub const TRANS_W: f64 = 120.0;
pub const TRANS_H: f64 = 52.0;

// Public output types

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    Place,
    Transition,
}

#[derive(Debug, Clone)]
pub struct LayoutNode {
    pub uuid: Uuid,
    pub kind: NodeKind,
    /// Centre x/y in SVG coordinate space.
    pub cx: f64,
    pub cy: f64,
    pub width: f64,
    pub height: f64,
}

/// Bend-point chain for one arc (includes start + end points). `edges[i]` corresponds to
/// `PetriNet::arcs[i]`.
#[derive(Debug, Clone)]
pub struct LayoutEdge {
    /// Polyline points: first = source border (approximate), last = target border.
    /// Intermediate points are dummy-node centres (orthogonal routing).
    pub points: Vec<(f64, f64)>,
}

#[derive(Debug)]
pub struct LayoutResult {
    pub nodes: Vec<LayoutNode>,
    pub edges: Vec<LayoutEdge>,
}

pub fn layout_petri_net(net: &PetriNet) -> LayoutResult {
    if net.places.is_empty() && net.transitions.is_empty() {
        return LayoutResult {
            nodes: vec![],
            edges: vec![],
        };
    }

    // Fixed node order: places then transitions. Track uuid + kind per input index.
    let mut uuids: Vec<Uuid> = vec![];
    let mut kinds: Vec<NodeKind> = vec![];
    let mut id_map: HashMap<Uuid, usize> = HashMap::new();
    let mut in_nodes: Vec<LayeredInputNode> = vec![];
    // `net.places`/`net.transitions` are HashMaps - iterate them in a stable (uuid-sorted)
    // order so node indices, and hence the whole layout, are deterministic across runs.
    let mut place_ids: Vec<Uuid> = net.places.keys().copied().collect();
    place_ids.sort_unstable();
    let mut trans_ids: Vec<Uuid> = net.transitions.keys().copied().collect();
    trans_ids.sort_unstable();
    for uuid in place_ids {
        id_map.insert(uuid, in_nodes.len());
        uuids.push(uuid);
        kinds.push(NodeKind::Place);
        in_nodes.push(LayeredInputNode {
            width: PLACE_W,
            height: PLACE_H,
            shape: NodeShape::Ellipse,
            constraint: None,
            category: None,
            clear_after: 0.0,
        });
    }
    for uuid in trans_ids {
        id_map.insert(uuid, in_nodes.len());
        uuids.push(uuid);
        kinds.push(NodeKind::Transition);
        in_nodes.push(LayeredInputNode {
            width: TRANS_W,
            height: TRANS_H,
            shape: NodeShape::Box,
            constraint: None,
            category: None,
            clear_after: 0.0,
        });
    }

    // Edges follow `net.arcs` order so the arc index is preserved.
    let mut in_edges: Vec<(usize, usize)> = vec![];
    let mut arc_present: Vec<bool> = vec![];
    for arc in &net.arcs {
        let (from_uuid, to_uuid) = match arc.from_to {
            ArcType::PlaceTransition(p, t) => (p, t),
            ArcType::TransitionPlace(t, p) => (t, p),
        };
        match (id_map.get(&from_uuid), id_map.get(&to_uuid)) {
            (Some(&f), Some(&t)) => {
                in_edges.push((f, t));
                arc_present.push(true);
            }
            _ => {
                in_edges.push((0, 0));
                arc_present.push(false);
            }
        }
    }

    let out = layout_layered(&LayeredInput {
        weights: vec![1.0; in_edges.len()], // Petri arcs are unweighted -> uniform importance.
        thickness: vec![],
        nodes: in_nodes,
        edges: in_edges,
        direction: Direction::LeftRight,
        flow_edges: false,
        flow_diagonal: false,
        edge_label_sizes: vec![],
        seed: vec![],
        pinned: vec![],
    });

    let nodes: Vec<LayoutNode> = (0..uuids.len())
        .map(|i| LayoutNode {
            uuid: uuids[i],
            kind: kinds[i],
            cx: out.centers[i].0,
            cy: out.centers[i].1,
            width: if kinds[i] == NodeKind::Place {
                PLACE_W
            } else {
                TRANS_W
            },
            height: PLACE_H,
        })
        .collect();

    let edges: Vec<LayoutEdge> = (0..net.arcs.len())
        .map(|i| LayoutEdge {
            points: if arc_present[i] {
                out.routes[i].clone()
            } else {
                vec![]
            },
        })
        .collect();

    LayoutResult { nodes, edges }
}

// Tests

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::core::process_models::case_centric::petri_net::ArcType;
    use process_mining::PetriNet;

    fn linear_net() -> PetriNet {
        let mut net = PetriNet::new();
        let p1 = net.add_place(None);
        let t1 = net.add_transition(Some("A".into()), None);
        let p2 = net.add_place(None);
        net.add_arc(ArcType::place_to_transition(p1, t1), None);
        net.add_arc(ArcType::transition_to_place(t1, p2), None);
        net
    }

    fn diamond_net() -> PetriNet {
        let mut net = PetriNet::new();
        let p = net.add_place(None);
        let t1 = net.add_transition(Some("A".into()), None);
        let t2 = net.add_transition(Some("B".into()), None);
        let p2 = net.add_place(None);
        net.add_arc(ArcType::place_to_transition(p, t1), None);
        net.add_arc(ArcType::place_to_transition(p, t2), None);
        net.add_arc(ArcType::transition_to_place(t1, p2), None);
        net.add_arc(ArcType::transition_to_place(t2, p2), None);
        net
    }

    #[test]
    fn linear_net_distinct_x() {
        let net = linear_net();
        let result = layout_petri_net(&net);
        assert_eq!(result.nodes.len(), 3);
        // All nodes must have distinct x coords (different layers).
        let xs: Vec<i64> = result.nodes.iter().map(|n| n.cx as i64).collect();
        let unique: std::collections::HashSet<_> = xs.iter().collect();
        assert_eq!(unique.len(), 3, "all 3 nodes should be in different layers");
    }

    #[test]
    fn linear_net_edges_have_points() {
        let net = linear_net();
        let result = layout_petri_net(&net);
        assert_eq!(result.edges.len(), 2);
        for e in &result.edges {
            assert!(e.points.len() >= 2, "each edge must have at least 2 points");
        }
    }

    #[test]
    fn diamond_net_no_panic() {
        let net = diamond_net();
        let result = layout_petri_net(&net);
        assert_eq!(result.nodes.len(), 4);
        assert_eq!(result.edges.len(), 4);
    }

    #[test]
    fn empty_net_returns_empty() {
        let net = PetriNet::new();
        let result = layout_petri_net(&net);
        assert!(result.nodes.is_empty());
        assert!(result.edges.is_empty());
    }

    #[test]
    fn cyclic_net_no_panic() {
        // p->t->p (self-loop through a transition).
        let mut net = PetriNet::new();
        let p = net.add_place(None);
        let t = net.add_transition(Some("loop".into()), None);
        net.add_arc(ArcType::place_to_transition(p, t), None);
        net.add_arc(ArcType::transition_to_place(t, p), None);
        let result = layout_petri_net(&net);
        assert_eq!(result.nodes.len(), 2);
    }
}
