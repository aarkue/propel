//! Tidy tree layout: parents centred over their children, siblings packed left to right. Edges
//! come back unrouted, since a tree edge is a straight parent-to-child line the caller clips to the node borders.

use crate::{GraphLayout, GraphSpec};

const SIBLING_GAP: f64 = 28.0;
const ROW_GAP: f64 = 56.0;

/// Lay out a rooted tree or forest. Errors if the input is not one: a node with two parents, or a
/// cycle, has no tree layout.
pub fn layout_tree(spec: &GraphSpec) -> Result<GraphLayout, String> {
    let n = spec.nodes.len();
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut indeg = vec![0usize; n];
    for &(a, b) in &spec.edges {
        if a >= n || b >= n {
            return Err(format!("tree layout: edge index out of range ({a} -> {b})"));
        }
        if a == b {
            return Err(format!("tree layout: self-loop on node {a}"));
        }
        children[a].push(b);
        indeg[b] += 1;
        if indeg[b] > 1 {
            return Err(format!("tree layout: node {b} has more than one parent"));
        }
    }
    let routes = vec![Vec::new(); spec.edges.len()];
    if n == 0 {
        return Ok(GraphLayout {
            centers: vec![],
            routes,
        });
    }

    // LR swaps the axes: siblings pack along y and depth runs along x.
    let lr = spec.direction.as_deref() == Some("LR");
    let cross = |i: usize| {
        if lr {
            spec.nodes[i].height
        } else {
            spec.nodes[i].width
        }
    };
    let along = |i: usize| {
        if lr {
            spec.nodes[i].width
        } else {
            spec.nodes[i].height
        }
    };

    let roots: Vec<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    if roots.is_empty() {
        return Err("tree layout: no root (input is cyclic)".into());
    }

    // Iterative throughout: depth is caller data, and a recursive walk overflows the (1MB) wasm
    // stack long before the input stops being plausible.
    let mut depth = vec![0usize; n];
    let mut seen = vec![false; n];
    let mut stack: Vec<(usize, usize)> = roots.iter().map(|&r| (r, 0)).collect();
    while let Some((i, d)) = stack.pop() {
        seen[i] = true;
        depth[i] = d;
        for &c in &children[i] {
            stack.push((c, d + 1));
        }
    }
    if seen.iter().any(|s| !s) {
        return Err("tree layout: unreachable nodes (input is cyclic)".into());
    }

    // `extent` is the cross-axis space a subtree needs, `centre` where its own box sits inside it,
    // `block` where its children start; extent is the union of the two, since a centred parent can hang past either end of the block.
    let mut extent = vec![0.0f64; n];
    let mut centre = vec![0.0f64; n];
    let mut block = vec![0.0f64; n];
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by_key(|&i| std::cmp::Reverse(depth[i]));
    for &i in &order {
        if children[i].is_empty() {
            extent[i] = cross(i);
            centre[i] = cross(i) / 2.0;
            continue;
        }
        let (mut total, mut first, mut last) = (0.0, 0.0, 0.0);
        for (k, &c) in children[i].iter().enumerate() {
            if k > 0 {
                total += SIBLING_GAP;
            }
            if k == 0 {
                first = total + centre[c];
            }
            last = total + centre[c];
            total += extent[c];
        }
        let mid = (first + last) / 2.0;
        let lo = (mid - cross(i) / 2.0).min(0.0);
        let hi = (mid + cross(i) / 2.0).max(total);
        extent[i] = hi - lo;
        block[i] = -lo;
        centre[i] = mid - lo;
    }

    let max_depth = depth.iter().copied().max().unwrap_or(0);
    let mut row_size = vec![0.0f64; max_depth + 1];
    for i in 0..n {
        row_size[depth[i]] = row_size[depth[i]].max(along(i));
    }
    let mut row_at = vec![0.0f64; max_depth + 1];
    let mut acc = 0.0;
    for d in 0..=max_depth {
        row_at[d] = acc + row_size[d] / 2.0;
        acc += row_size[d] + ROW_GAP;
    }

    let mut pos = vec![0.0f64; n];
    let mut work: Vec<(usize, f64)> = Vec::new();
    let mut left = 0.0;
    for &r in &roots {
        work.push((r, left));
        left += extent[r] + SIBLING_GAP;
    }
    while let Some((i, l)) = work.pop() {
        pos[i] = l + centre[i];
        let mut cursor = l + block[i];
        for (k, &c) in children[i].iter().enumerate() {
            if k > 0 {
                cursor += SIBLING_GAP;
            }
            work.push((c, cursor));
            cursor += extent[c];
        }
    }

    let centers = (0..n)
        .map(|i| {
            if lr {
                [row_at[depth[i]], pos[i]]
            } else {
                [pos[i], row_at[depth[i]]]
            }
        })
        .collect();
    Ok(GraphLayout { centers, routes })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::GraphNode;

    const OP: (f64, f64) = (56.0, 56.0);
    const LEAF: (f64, f64) = (132.0, 48.0);

    fn node((width, height): (f64, f64)) -> GraphNode {
        GraphNode {
            width,
            height,
            ellipse: false,
            pin: None,
            category: None,
            seed: None,
            pinned: false,
            clear_after: 0.0,
        }
    }

    fn spec(nodes: Vec<GraphNode>, edges: Vec<(usize, usize)>) -> GraphSpec {
        GraphSpec {
            nodes,
            edges,
            weights: vec![],
            direction: Some("TB".into()),
            flow_edges: false,
            flow_diagonal: false,
            edge_label_sizes: vec![],
            thickness: vec![],
            tree: true,
            compact: false,
        }
    }

    /// Box edges on the cross axis, which is what must not overlap.
    fn span(l: &GraphLayout, i: usize, width: f64) -> (f64, f64) {
        (l.centers[i][0] - width / 2.0, l.centers[i][0] + width / 2.0)
    }

    #[test]
    fn parent_is_centred_over_its_children() {
        let s = spec(
            vec![node(OP), node(LEAF), node(LEAF), node(LEAF)],
            vec![(0, 1), (0, 2), (0, 3)],
        );
        let l = layout_tree(&s).unwrap();
        let mid = (l.centers[1][0] + l.centers[3][0]) / 2.0;
        assert!((l.centers[0][0] - mid).abs() < 1e-6);
        assert!((l.centers[0][0] - l.centers[2][0]).abs() < 1e-6);
    }

    #[test]
    fn nested_parents_are_each_centred() {
        let s = spec(
            vec![node(OP), node(LEAF), node(OP), node(LEAF), node(LEAF)],
            vec![(0, 1), (0, 2), (2, 3), (2, 4)],
        );
        let l = layout_tree(&s).unwrap();
        let inner = (l.centers[3][0] + l.centers[4][0]) / 2.0;
        assert!((l.centers[2][0] - inner).abs() < 1e-6);
        let outer = (l.centers[1][0] + l.centers[2][0]) / 2.0;
        assert!((l.centers[0][0] - outer).abs() < 1e-6);
    }

    /// A parent wider than its children hangs past their block, and does so asymmetrically when the
    /// children differ in width. Its box, not its centre, is what must clear the next subtree.
    #[test]
    fn wide_parent_with_asymmetric_children_clears_its_sibling() {
        let s = spec(
            vec![
                node(OP),
                node((300.0, 48.0)),
                node(LEAF),
                node((200.0, 48.0)),
                node((20.0, 48.0)),
            ],
            vec![(0, 1), (0, 2), (1, 3), (1, 4)],
        );
        let l = layout_tree(&s).unwrap();
        let wide = span(&l, 1, 300.0);
        let sibling = span(&l, 2, 132.0);
        assert!(
            sibling.0 - wide.1 >= SIBLING_GAP - 1e-6,
            "gap {} between {wide:?} and {sibling:?}",
            sibling.0 - wide.1
        );
    }

    #[test]
    fn siblings_clear_each_other() {
        let s = spec(
            vec![node(OP), node(LEAF), node(LEAF), node(LEAF)],
            vec![(0, 1), (0, 2), (0, 3)],
        );
        let l = layout_tree(&s).unwrap();
        let mut spans: Vec<(f64, f64)> = (1..4).map(|i| span(&l, i, LEAF.0)).collect();
        spans.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        for w in spans.windows(2) {
            assert!(w[1].0 - w[0].1 >= SIBLING_GAP - 1e-6);
        }
    }

    #[test]
    fn rows_are_one_gap_apart() {
        let s = spec(vec![node(OP), node(LEAF)], vec![(0, 1)]);
        let l = layout_tree(&s).unwrap();
        let expected = OP.1 / 2.0 + ROW_GAP + LEAF.1 / 2.0;
        assert!((l.centers[1][1] - l.centers[0][1] - expected).abs() < 1e-6);
    }

    #[test]
    fn lr_swaps_the_axes() {
        let mut s = spec(vec![node(OP), node(LEAF)], vec![(0, 1)]);
        s.direction = Some("LR".into());
        let l = layout_tree(&s).unwrap();
        assert!(l.centers[1][0] > l.centers[0][0]);
        assert!((l.centers[1][1] - l.centers[0][1]).abs() < 1e-6);
    }

    #[test]
    fn a_forest_lays_its_roots_side_by_side() {
        let s = spec(
            vec![node(OP), node(LEAF), node(OP), node(LEAF)],
            vec![(0, 1), (2, 3)],
        );
        let l = layout_tree(&s).unwrap();
        assert!((l.centers[0][1] - l.centers[2][1]).abs() < 1e-6);
        let (a, b) = (span(&l, 1, LEAF.0), span(&l, 3, LEAF.0));
        assert!(b.0 - a.1 >= SIBLING_GAP - 1e-6);
    }

    #[test]
    fn one_route_per_edge() {
        let s = spec(vec![node(OP), node(LEAF), node(LEAF)], vec![(0, 1), (0, 2)]);
        assert_eq!(layout_tree(&s).unwrap().routes.len(), 2);
    }

    #[test]
    fn a_deep_chain_does_not_overflow_the_stack() {
        let n = 100_000;
        let s = spec(
            (0..n).map(|_| node(LEAF)).collect(),
            (0..n - 1).map(|i| (i, i + 1)).collect(),
        );
        assert_eq!(layout_tree(&s).unwrap().centers.len(), n);
    }

    #[test]
    fn a_single_leaf_lays_out() {
        let s = spec(vec![node(LEAF)], vec![]);
        assert_eq!(layout_tree(&s).unwrap().centers.len(), 1);
    }

    #[test]
    fn rejects_a_node_with_two_parents() {
        let s = spec(vec![node(OP), node(OP), node(LEAF)], vec![(0, 2), (1, 2)]);
        assert!(layout_tree(&s).is_err());
    }

    #[test]
    fn rejects_a_cycle() {
        let s = spec(vec![node(OP), node(OP)], vec![(0, 1), (1, 0)]);
        assert!(layout_tree(&s).is_err());
    }

    /// A cycle beside a valid tree still leaves a root, so only the reachability sweep catches it.
    #[test]
    fn rejects_a_cycle_beside_a_tree() {
        let s = spec(
            vec![node(OP), node(LEAF), node(OP), node(OP)],
            vec![(0, 1), (2, 3), (3, 2)],
        );
        assert!(layout_tree(&s).is_err());
    }

    #[test]
    fn rejects_an_out_of_range_edge() {
        let s = spec(vec![node(OP)], vec![(0, 7)]);
        assert!(layout_tree(&s).is_err());
    }
}
