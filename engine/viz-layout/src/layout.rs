//! Pure-Rust Sugiyama-style layered layout, direction-generic (Petri nets = LR, DFGs = TB).
//! Pipeline from [`LayeredInput`]: cycle-break (Eades-Lin-Smyth) -> longest-path/network-simplex
//! layering -> dummy insertion -> barycenter+transposition crossing minimization ->
//! Brandes-Kopf coordinates -> four-sided ported orthogonal routing -> unwind dummies/reversed
//! arcs and transpose for TB into [`LayeredOutput`].

use std::collections::BTreeMap;

// Node sizes (match TS constants in layout-graph.ts)
pub const PLACE_W: f64 = 52.0;
pub const PLACE_H: f64 = 52.0;
pub const TRANS_W: f64 = 120.0;
pub const TRANS_H: f64 = 52.0;

// Spacing near ELK layered defaults, held a touch looser so edge<->node clearance stays >~25px.
const LAYER_GAP: f64 = 68.0;  // between layer columns
const NODE_GAP: f64  = 46.0;  // between two real nodes in same layer
const DUMMY_GAP: f64 = 30.0;  // between a routing track and a node

/// Primary flow direction of the layered layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Layers march left->right; used by Petri nets.
    LeftRight,
    /// Layers march top->bottom; used by directly-follows graphs.
    TopBottom,
}

/// Pin a node to the first or last layer (e.g. DFG start / end terminals).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayerConstraint {
    First,
    Last,
}

/// Border shape of a node - the router projects port anchors onto it so arcs touch
/// the drawn outline (a box-border point lies outside a circle at an offset -> visible gap).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeShape {
    Box,
    Ellipse,
}

#[derive(Clone)]
pub struct LayeredInputNode {
    pub width: f64,
    pub height: f64,
    pub shape: NodeShape,
    pub constraint: Option<LayerConstraint>,
    /// Optional grouping id. Same-category nodes are kept in a consistent order across layers
    /// (crossing-neutral tiebreak) so a category forms a straight lane. `None` = no constraint.
    pub category: Option<u32>,
    /// Minimum clearance (px) beyond this node's positive-order-side border, reserving room for
    /// caller-drawn decorations (e.g. DFG self-loops) the layout can't see. `0.0` = normal gaps.
    pub clear_after: f64,
}

/// Generic input to [`layout_layered`]: real nodes (indexed `0..n`) plus directed edges
/// referencing those indices. The edge index doubles as its identity in the output.
#[derive(Clone)]
pub struct LayeredInput {
    pub nodes: Vec<LayeredInputNode>,
    pub edges: Vec<(usize, usize)>,
    /// Relative importance per edge (same length/order as `edges`). Heavier edges are laid out
    /// shorter, straighter, and get first pick of a straight long-edge lane. Empty => all 1.0.
    pub weights: Vec<f64>,
    /// Drawn stroke width per edge (same length/order as `edges`). Port spreading keeps adjacent
    /// ports far enough apart that thick strokes don't visually merge. Empty => all 2.0.
    pub thickness: Vec<f64>,
    pub direction: Direction,
    /// Flow layout: tighter gaps and START/END terminal centring for a compact process-map look.
    /// DFG uses this; Petri keeps classic gaps (`false`). Routing style is separate (`flow_diagonal`).
    pub flow_edges: bool,
    /// Route edges as diagonal port-to-port/channel lines instead of orthogonal L-shapes. Only
    /// meaningful with `flow_edges`. Default `false` => orthogonal.
    pub flow_diagonal: bool,
    /// Optional `(width, height)` of each edge's mid-point label (same order as `edges`); the layout
    /// reserves that space so labels don't collide. Empty => none; `(0,0)` entries ignored.
    pub edge_label_sizes: Vec<(f64, f64)>,
    /// Optional per-node seed centre `(x, y)` (same order as `nodes`). Layer/order are computed
    /// normally but the cross-axis coord uses the seed - a stable relayout keeping un-dragged nodes put.
    pub seed: Vec<Option<(f64, f64)>>,
    /// Optional per-node hard-pin flag (same order as `nodes`). A pinned node holds its seed
    /// cross-coord exactly; others yield around it. Only meaningful with `seed`. Empty => none.
    pub pinned: Vec<bool>,
}

/// Result of [`layout_layered`], in final SVG coordinates for the requested direction.
pub struct LayeredOutput {
    /// Centre `(x, y)` per input node index.
    pub centers: Vec<(f64, f64)>,
    /// Border-to-border orthogonal polyline per input edge index.
    pub routes: Vec<Vec<(f64, f64)>>,
}

// Internal graph

#[derive(Clone, Copy, PartialEq, Eq)]
enum InternalKind {
    /// Any real (non-routing) node.
    Real,
    /// Synthetic routing waypoint inserted for multi-layer edges.
    Dummy,
}

struct Graph {
    n: usize,
    kind: Vec<InternalKind>,
    /// Edges: (from, to, arc_index, reversed).
    edges: Vec<(usize, usize, usize, bool)>,
}

impl Graph {
    fn new() -> Self {
        Graph { n: 0, kind: vec![], edges: vec![] }
    }
    fn add_node(&mut self, k: InternalKind) -> usize {
        let idx = self.n;
        self.n += 1;
        self.kind.push(k);
        idx
    }
    fn add_edge(&mut self, from: usize, to: usize, arc: usize, rev: bool) {
        self.edges.push((from, to, arc, rev));
    }
}


// Phase 2: greedy feedback-arc-set cycle breaking

/// Greedy (Eades-Lin-Smyth) feedback-arc-set cycle breaking, weight-aware: orients the heaviest
/// flow forward and reverses only light edges (a max-weight acyclic orientation, min reversed flow).
fn break_cycles(g: &mut Graph, arc_weight: &[f64]) {
    let n = g.n;
    if n == 0 {
        return;
    }
    // Process real edges heaviest-first. `reach[x][y]` = y reachable from x via oriented edges;
    // keep from->to unless `to` already reaches `from` (would close a cycle), else flip to back-edge.
    let mut order: Vec<usize> =
        (0..g.edges.len()).filter(|&i| g.edges[i].0 != g.edges[i].1).collect();
    order.sort_by(|&a, &b| {
        let wa = arc_weight.get(g.edges[a].2).copied().unwrap_or(1.0);
        let wb = arc_weight.get(g.edges[b].2).copied().unwrap_or(1.0);
        // Heaviest first; ties by edge index keep it deterministic.
        wb.partial_cmp(&wa).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(&b))
    });

    let mut reach = vec![vec![false; n]; n];
    for i in order {
        let (from, to, arc, rev) = g.edges[i];
        if reach[to][from] {
            // Keeping from->to would close a cycle -> reverse it. `to` already reaches `from`, so the
            // flipped edge agrees with the established order and adds no new reachability.
            g.edges[i] = (to, from, arc, !rev);
            continue;
        }
        if reach[from][to] {
            continue; // already implied (e.g. a parallel same-direction arc) - nothing new.
        }
        // Orient from->to and extend the transitive closure: everyone who can reach `from` (and
        // `from` itself) now reaches `to` and everything `to` reaches.
        let reach_to = reach[to].clone();
        for x in 0..n {
            if x == from || reach[x][from] {
                reach[x][to] = true;
                for y in 0..n {
                    if reach_to[y] {
                        reach[x][y] = true;
                    }
                }
            }
        }
    }
}

// Phase 3: layering (longest-path init -> network simplex)

/// Longest-path ranking: a feasible layer assignment (every edge spans >= 1 layer).
fn longest_path(g: &Graph) -> Vec<i32> {
    let n = g.n;
    let mut in_deg = vec![0i32; n];
    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    for &(from, to, _, _) in &g.edges {
        if from == to {
            continue;
        }
        in_deg[to] += 1;
        adj[from].push(to);
    }
    let mut layer = vec![-1i32; n];
    let mut queue: Vec<usize> = (0..n).filter(|&i| in_deg[i] == 0).collect();
    for &s in &queue {
        layer[s] = 0;
    }
    let mut head = 0;
    while head < queue.len() {
        let u = queue[head];
        head += 1;
        for &v in &adj[u] {
            if layer[u] + 1 > layer[v] {
                layer[v] = layer[u] + 1;
            }
            in_deg[v] -= 1;
            if in_deg[v] == 0 {
                queue.push(v);
            }
        }
    }
    for l in layer.iter_mut() {
        if *l < 0 {
            *l = 0;
        }
    }
    layer
}

fn assign_layers(g: &Graph, constraints: &[Option<LayerConstraint>], weight: &[f64]) -> Vec<i32> {
    let mut layer = longest_path(g);
    // Tighten the ranking (minimise sum  weighted span -> fewer dummies, tighter columns; heavy edges
    // pulled shortest).
    network_simplex(g, &mut layer, weight);

    // Apply First/Last layer constraints (e.g. DFG start/end terminals).
    if constraints.iter().any(|c| c.is_some()) {
        let max_layer = *layer.iter().max().unwrap_or(&0);
        for (i, c) in constraints.iter().enumerate().take(g.n) {
            match c {
                Some(LayerConstraint::First) => layer[i] = 0,
                Some(LayerConstraint::Last) => layer[i] = max_layer,
                None => {}
            }
        }
    }
    let min = *layer.iter().min().unwrap_or(&0);
    for l in layer.iter_mut() {
        *l -= min;
    }
    layer
}

/// Network-simplex rank optimisation (Gansner et al.): from a feasible ranking, swap a
/// negative-cut-value tree edge for a tighter non-tree edge until optimal.
fn network_simplex(g: &Graph, rank: &mut [i32], weight: &[f64]) {
    let n = g.n;
    // Directed edges (skip self-loops), each carrying its layout weight (minlen = 1 for all).
    let edges: Vec<(usize, usize, f64)> = g
        .edges
        .iter()
        .filter(|&&(u, v, _, _)| u != v)
        .map(|&(u, v, arc, _)| (u, v, weight.get(arc).copied().unwrap_or(1.0)))
        .collect();
    if edges.is_empty() || n < 2 {
        return;
    }
    // Undirected incidence: node -> list of edge indices.
    let mut inc: Vec<Vec<usize>> = vec![vec![]; n];
    for (i, &(u, v, _)) in edges.iter().enumerate() {
        inc[u].push(i);
        inc[v].push(i);
    }
    let slack = |rank: &[i32], e: usize| -> i32 {
        let (u, v, _) = edges[e];
        rank[v] - rank[u] - 1
    };

    // Grow a spanning tree of tight (slack 0) edges from node 0; returns tree edge set and
    // the in-tree flag per node.
    let tight_tree = |rank: &[i32]| -> (Vec<bool>, Vec<bool>) {
        let mut in_tree = vec![false; n];
        let mut tree_edge = vec![false; edges.len()];
        in_tree[0] = true;
        let mut stack = vec![0usize];
        while let Some(u) = stack.pop() {
            for &e in &inc[u] {
                let (a, b, _) = edges[e];
                let w = if a == u { b } else { a };
                if !in_tree[w] && slack(rank, e) == 0 {
                    in_tree[w] = true;
                    tree_edge[e] = true;
                    stack.push(w);
                }
            }
        }
        (in_tree, tree_edge)
    };

    // Feasible tight spanning tree: grow, and whenever stuck shift the tree to make the
    // least-slack crossing edge tight, until every node is included.
    let (mut in_tree, mut tree_edge) = tight_tree(rank);
    let mut guard = 0;
    while in_tree.iter().filter(|&&b| b).count() < n && guard < 4 * n + 8 {
        guard += 1;
        let mut best = usize::MAX;
        let mut best_slack = i32::MAX;
        for (i, &(u, v, _)) in edges.iter().enumerate() {
            if in_tree[u] != in_tree[v] && slack(rank, i) < best_slack {
                best_slack = slack(rank, i);
                best = i;
            }
        }
        if best == usize::MAX {
            break;
        }
        let (u, _, _) = edges[best];
        let delta = if in_tree[u] { best_slack } else { -best_slack };
        for node in 0..n {
            if in_tree[node] {
                rank[node] += delta;
            }
        }
        let (it, te) = tight_tree(rank);
        in_tree = it;
        tree_edge = te;
    }

    // Recompute ranks from a tight spanning tree (BFS honouring edge directions).
    let ranks_from_tree = |tree_edge: &[bool]| -> Vec<i32> {
        let mut r = vec![i32::MIN; n];
        r[0] = 0;
        let mut stack = vec![0usize];
        while let Some(u) = stack.pop() {
            for &e in &inc[u] {
                if !tree_edge[e] {
                    continue;
                }
                let (a, b, _) = edges[e];
                let w = if a == u { b } else { a };
                if r[w] != i32::MIN {
                    continue;
                }
                r[w] = if a == u { r[u] + 1 } else { r[u] - 1 };
                stack.push(w);
            }
        }
        for x in r.iter_mut() {
            if *x == i32::MIN {
                *x = 0;
            }
        }
        r
    };

    // Component (head side of a removed tree edge) via tree BFS excluding that edge.
    let head_component = |tree_edge: &[bool], leave: usize| -> Vec<bool> {
        let (_, hv, _) = edges[leave];
        let mut comp = vec![false; n];
        comp[hv] = true;
        let mut stack = vec![hv];
        while let Some(u) = stack.pop() {
            for &e in &inc[u] {
                if !tree_edge[e] || e == leave {
                    continue;
                }
                let (a, b, _) = edges[e];
                let w = if a == u { b } else { a };
                if !comp[w] {
                    comp[w] = true;
                    stack.push(w);
                }
            }
        }
        comp
    };

    let mut iter = 0;
    let max_iter = 4 * n + 16;
    loop {
        iter += 1;
        if iter > max_iter {
            break;
        }
        // Find a tree edge with negative cut value.
        let mut leave = usize::MAX;
        for (i, _) in edges.iter().enumerate() {
            if !tree_edge[i] {
                continue;
            }
            let comp = head_component(&tree_edge, i);
            // Weighted cut value: (tail-comp -> head-comp) - (head-comp -> tail-comp), each edge
            // counted by its weight. At uniform weight 1 this is exactly the plain edge count.
            let mut cut = 0f64;
            for &(a, b, w) in &edges {
                match (comp[a], comp[b]) {
                    (false, true) => cut += w, // tail-comp -> head-comp
                    (true, false) => cut -= w, // head-comp -> tail-comp
                    _ => {}
                }
            }
            if cut < -1e-9 {
                leave = i;
                break;
            }
        }
        if leave == usize::MAX {
            break; // optimal
        }
        // Enter edge: non-tree edge from head-comp back to tail-comp, min slack.
        let comp = head_component(&tree_edge, leave);
        let mut enter = usize::MAX;
        let mut enter_slack = i32::MAX;
        for (i, &(a, b, _)) in edges.iter().enumerate() {
            if !tree_edge[i] && comp[a] && !comp[b] && slack(rank, i) < enter_slack {
                enter_slack = slack(rank, i);
                enter = i;
            }
        }
        if enter == usize::MAX {
            break;
        }
        tree_edge[leave] = false;
        tree_edge[enter] = true;
        rank.copy_from_slice(&ranks_from_tree(&tree_edge));
    }

    // Balance (Gansner et al. 4.2): a node with equal in/out degree slides freely in its rank
    // window; centre each such free node (Gauss-Seidel) so neither span runs the full width.
    {
        let mut in_adj: Vec<Vec<usize>> = vec![vec![]; n];
        let mut out_adj: Vec<Vec<usize>> = vec![vec![]; n];
        for &(u, v, _) in &edges {
            out_adj[u].push(v);
            in_adj[v].push(u);
        }
        for _ in 0..(2 * n + 8) {
            let mut changed = false;
            for v in 0..n {
                if in_adj[v].is_empty()
                    || out_adj[v].is_empty()
                    || in_adj[v].len() != out_adj[v].len()
                {
                    continue;
                }
                let low = in_adj[v].iter().map(|&u| rank[u] + 1).max().unwrap();
                let high = out_adj[v].iter().map(|&w| rank[w] - 1).min().unwrap();
                if low <= high {
                    let mid = (low + high) / 2;
                    if rank[v] != mid {
                        rank[v] = mid;
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }
    }

    // Normalise so ranks are non-negative (dummy insertion assumes >= 0, ascending).
    let min = *rank.iter().min().unwrap_or(&0);
    for r in rank.iter_mut() {
        *r -= min;
    }
}

// Phase 4: dummy-node insertion

struct ExpandedGraph {
    g: Graph,
    layer: Vec<i32>,
}

fn insert_dummies(mut g: Graph, layer: Vec<i32>) -> ExpandedGraph {
    let orig_edges: Vec<(usize, usize, usize, bool)> = g.edges.drain(..).collect();
    let mut new_layer = layer.clone();

    for (from, to, arc_idx, rev) in orig_edges {
        let span = new_layer[to] - new_layer[from];
        if span <= 1 {
            g.add_edge(from, to, arc_idx, rev);
        } else {
            // Insert (span-1) dummy nodes chaining from -> d1 -> d2 -> ... -> to.
            let mut prev = from;
            for k in 1..span {
                let d = g.add_node(InternalKind::Dummy);
                new_layer.push(new_layer[from] + k);
                g.add_edge(prev, d, arc_idx, rev);
                prev = d;
            }
            g.add_edge(prev, to, arc_idx, rev);
        }
    }

    ExpandedGraph { g, layer: new_layer }
}

// Phase 5: crossing minimization (barycenter + greedy transposition)

/// Visit every permutation of `arr` (Heap's algorithm). Only used for tiny layers (<=7).
fn for_each_perm(arr: &mut [usize], f: &mut impl FnMut(&[usize])) {
    let n = arr.len();
    let mut c = vec![0usize; n];
    f(arr);
    let mut i = 0;
    while i < n {
        if c[i] < i {
            if i % 2 == 0 {
                arr.swap(0, i);
            } else {
                arr.swap(c[i], i);
            }
            f(arr);
            c[i] += 1;
            i = 0;
        } else {
            c[i] = 0;
            i += 1;
        }
    }
}

/// Crossings of one layer (in candidate `order`) against its upper and lower neighbours,
/// whose positions are fixed in `pos`. Counted independently per side and summed.
fn small_layer_cost(
    order: &[usize],
    pred: &[Vec<usize>],
    succ: &[Vec<usize>],
    pos: &[usize],
    n_layers: usize,
    li: usize,
) -> usize {
    let mut total = 0;
    for (nb, present) in [(pred, li > 0), (succ, li + 1 < n_layers)] {
        if !present {
            continue;
        }
        // `nr` is just the node's index in `order` (a permutation), so no rank lookup is needed.
        let mut inter: Vec<(usize, usize)> = Vec::with_capacity(order.len() * 2);
        for (nr, &node) in order.iter().enumerate() {
            for &m in &nb[node] {
                inter.push((pos[m], nr));
            }
        }
        for i in 0..inter.len() {
            for j in i + 1..inter.len() {
                let (a, b) = (inter[i], inter[j]);
                if (a.0 < b.0 && a.1 > b.1) || (a.0 > b.0 && a.1 < b.1) {
                    total += 1;
                }
            }
        }
    }
    total
}

/// Total adjacent-layer edge crossings for a node ordering (`pos` = each node's index within its
/// layer, `pred` = upper-layer neighbours per node).
fn count_crossings(layers: &[Vec<usize>], pred: &[Vec<usize>], pos: &[usize]) -> usize {
    let mut inter: Vec<(usize, usize)> = vec![];
    let mut total = 0;
    for layer in &layers[1..] {
        inter.clear();
        for &node in layer {
            for &p in &pred[node] {
                inter.push((pos[p], pos[node]));
            }
        }
        for i in 0..inter.len() {
            for j in i + 1..inter.len() {
                let (a, b) = (inter[i], inter[j]);
                if (a.0 < b.0 && a.1 > b.1) || (a.0 > b.0 && a.1 < b.1) {
                    total += 1;
                }
            }
        }
    }
    total
}

fn crossing_minimization(layers: &mut Vec<Vec<usize>>, g: &Graph, weight: &[f64]) {
    let n_layers = layers.len();
    if n_layers <= 1 {
        return;
    }

    let mut succ: Vec<Vec<usize>> = vec![vec![]; g.n];
    let mut pred: Vec<Vec<usize>> = vec![vec![]; g.n];
    // Parallel per-neighbour weights (same indexing as succ/pred) for the weighted barycenter.
    let mut succ_w: Vec<Vec<f64>> = vec![vec![]; g.n];
    let mut pred_w: Vec<Vec<f64>> = vec![vec![]; g.n];
    for &(from, to, arc, _) in &g.edges {
        let w = weight.get(arc).copied().unwrap_or(1.0);
        succ[from].push(to);
        succ_w[from].push(w);
        pred[to].push(from);
        pred_w[to].push(w);
    }

    let layer_of: Vec<usize> = {
        let mut lo = vec![0usize; g.n];
        for (li, layer) in layers.iter().enumerate() {
            for &v in layer {
                lo[v] = li;
            }
        }
        lo
    };
    // Structural seed (dagre `initOrder`): DFS from `start` following `adj`, appending each node to
    // its layer in visit order, then any unvisited. Graph-shape-derived, index-order-independent.
    let structural_seed = |start: &[usize], adj: &[Vec<usize>]| -> Vec<Vec<usize>> {
        let mut new_layers: Vec<Vec<usize>> = vec![vec![]; n_layers];
        let mut seen = vec![false; g.n];
        let mut stack: Vec<usize> = start.iter().rev().copied().collect();
        while let Some(u) = stack.pop() {
            if seen[u] {
                continue;
            }
            seen[u] = true;
            new_layers[layer_of[u]].push(u);
            for &w in adj[u].iter().rev() {
                if !seen[w] {
                    stack.push(w);
                }
            }
        }
        for (li, layer) in layers.iter().enumerate() {
            for &v in layer {
                if !seen[v] {
                    seen[v] = true;
                    new_layers[li].push(v);
                }
            }
        }
        new_layers
    };
    let dfs_seed = structural_seed(&layers[0], &succ);
    let rev_seed = structural_seed(&layers[n_layers - 1], &pred);
    // Optimise from several seeds (structural + shuffled restarts); keep the global best.
    let mut dfs_mirror = dfs_seed.clone();
    for l in dfs_mirror.iter_mut() {
        l.reverse();
    }
    let mut seeds: Vec<Vec<Vec<usize>>> = vec![dfs_seed.clone(), dfs_mirror, rev_seed];
    let mut rng: u64 = 0x9e3779b97f4a7c15; // fixed -> deterministic restarts
    for _ in 0..6 {
        let mut s = dfs_seed.clone();
        for layer in s.iter_mut() {
            for i in (1..layer.len()).rev() {
                rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let j = (rng >> 33) as usize % (i + 1);
                layer.swap(i, j);
            }
        }
        seeds.push(s);
    }

    let mut pos: Vec<usize> = vec![0; g.n];
    let refresh_pos = |layers: &[Vec<usize>], pos: &mut Vec<usize>| {
        for layer in layers.iter() {
            for (rank, &node) in layer.iter().enumerate() {
                pos[node] = rank;
            }
        }
    };
    refresh_pos(layers, &mut pos);

    // Weighted barycenter: heavy incident edges pull the node harder toward their neighbours, so
    // the high-importance flow ends up straighter. At uniform weight 1 this is the plain mean.
    let barycenter = |node: usize, nb: &[Vec<usize>], nb_w: &[Vec<f64>], pos: &[usize]| -> f64 {
        let ns = &nb[node];
        if ns.is_empty() {
            pos[node] as f64
        } else {
            let ws = &nb_w[node];
            let sum: f64 = ns.iter().zip(ws).map(|(&n, &w)| w * pos[n] as f64).sum();
            sum / ws.iter().sum::<f64>()
        }
    };

    // Total edge crossings across every adjacent layer pair (O(e^2) - fine at these sizes).
    let total_crossings =
        |layers: &[Vec<usize>], pos: &[usize]| count_crossings(layers, &pred, pos);

    // Local crossing change from swapping adjacent nodes u (left) and v (right): only edges to the
    // layer above (pred) and below (succ) are affected; the swap flips whichever was crossing.
    let swap_delta = |u: usize, v: usize, nb: &[Vec<usize>], pos: &[usize]| -> i32 {
        let mut before = 0i32;
        let mut after = 0i32;
        for &a in &nb[u] {
            for &b in &nb[v] {
                if pos[a] > pos[b] {
                    before += 1;
                }
                if pos[a] < pos[b] {
                    after += 1;
                }
            }
        }
        after - before
    };

    let mut global_best = layers.clone();
    let mut global_cross = usize::MAX;

    for seed in seeds {
        if global_cross == 0 {
            break; // an earlier seed already reached a crossing-free order; nothing to beat.
        }
        *layers = seed;
        refresh_pos(layers, &mut pos);
        let mut best = layers.clone();
        let mut best_cross = total_crossings(layers, &pos);

        for _ in 0..8 {
            if best_cross == 0 {
                break; // already optimal for this seed; further sweeps can't improve.
            }
            // Barycenter sweeps give a good starting order for the transposition pass.
            for li in 1..n_layers {
                layers[li].sort_by(|&a, &b| {
                    barycenter(a, &pred, &pred_w, &pos)
                        .partial_cmp(&barycenter(b, &pred, &pred_w, &pos))
                        .unwrap()
                });
                refresh_pos(layers, &mut pos);
            }
            for li in (0..n_layers - 1).rev() {
                layers[li].sort_by(|&a, &b| {
                    barycenter(a, &succ, &succ_w, &pos)
                        .partial_cmp(&barycenter(b, &succ, &succ_w, &pos))
                        .unwrap()
                });
                refresh_pos(layers, &mut pos);
            }

            // Greedy adjacent transposition: swap neighbours whenever it strictly reduces
            // real crossings, repeating until no layer improves.
            let mut improved = true;
            while improved {
                improved = false;
                for layer in layers.iter_mut() {
                    for k in 0..layer.len().saturating_sub(1) {
                        let u = layer[k];
                        let v = layer[k + 1];
                        let delta = swap_delta(u, v, &pred, &pos) + swap_delta(u, v, &succ, &pos);
                        if delta < 0 {
                            layer.swap(k, k + 1);
                            pos[u] = k + 1;
                            pos[v] = k;
                            improved = true;
                        }
                    }
                }
            }

            // Small layers (2..=5): brute-force every permutation, keep the crossing-minimal one
            // (escapes local optima; never regresses). Wider layers use transpose + sifting.
            for li in 0..n_layers {
                let len = layers[li].len();
                if !(2..=5).contains(&len) {
                    continue;
                }
                let mut best_order = layers[li].clone();
                let mut best_c = small_layer_cost(&best_order, &pred, &succ, &pos, n_layers, li);
                if best_c == 0 {
                    continue; // layer already crossing-free; no permutation can help.
                }
                let mut perm = layers[li].clone();
                for_each_perm(&mut perm, &mut |p| {
                    let c = small_layer_cost(p, &pred, &succ, &pos, n_layers, li);
                    if c < best_c {
                        best_c = c;
                        best_order = p.to_vec();
                    }
                });
                if best_order != layers[li] {
                    layers[li] = best_order;
                    refresh_pos(layers, &mut pos);
                }
            }

            let c = total_crossings(layers, &pos);
            if c < best_cross {
                best_cross = c;
                best = layers.clone();
            }
        }

        if best_cross < global_cross {
            global_cross = best_cross;
            global_best = best;
        }
    }

    // Final sifting on the winning order (once, outside the loops for speed): for wide layers
    // (>7, no brute force) pull each node out and reinsert at its crossing-minimal slot.
    *layers = global_best.clone();
    refresh_pos(layers, &mut pos);
    for li in 0..n_layers {
        if layers[li].len() <= 7 {
            continue;
        }
        let mut changed = true;
        let mut rounds = 0;
        while changed && rounds < 4 {
            changed = false;
            rounds += 1;
            for vi in 0..layers[li].len() {
                let v = layers[li][vi];
                let mut rest = layers[li].clone();
                rest.remove(vi);
                let (mut best_pos, mut best_c) = (vi, usize::MAX);
                for p in 0..=rest.len() {
                    rest.insert(p, v);
                    let cst = small_layer_cost(&rest, &pred, &succ, &pos, n_layers, li);
                    rest.remove(p);
                    if cst < best_c {
                        best_c = cst;
                        best_pos = p;
                    }
                }
                if best_pos != vi {
                    rest.insert(best_pos, v);
                    layers[li] = rest;
                    refresh_pos(layers, &mut pos);
                    changed = true;
                }
            }
        }
    }
    if total_crossings(layers, &pos) > global_cross {
        *layers = global_best;
    }
}


// Phase 5b: crossing-neutral category (lane) consistency

/// Reorder each layer so same-`category` nodes form consistent lanes without raising crossings:
/// categorized nodes pin their id, others relax to the neighbour mean; kept only if crossings hold.
fn category_consistency_pass(layers: &mut [Vec<usize>], g: &Graph, category: &[Option<u32>]) {
    if !category.iter().any(Option::is_some) {
        return;
    }
    let mut adj: Vec<Vec<usize>> = vec![vec![]; g.n];
    let mut pred: Vec<Vec<usize>> = vec![vec![]; g.n];
    for &(from, to, _, _) in &g.edges {
        if from == to {
            continue;
        }
        adj[from].push(to);
        adj[to].push(from);
        pred[to].push(from);
    }
    // Lane value: categorized nodes anchor their id; others relax to the neighbour mean until stable.
    // Nodes unreachable from any category settle at neutral 0.5, keeping their crossing-min order.
    let mut lane = vec![f64::NAN; g.n];
    for (i, c) in category.iter().enumerate() {
        if let Some(v) = c {
            lane[i] = *v as f64;
        }
    }
    for _ in 0..64 {
        let mut changed = false;
        for i in 0..g.n {
            if category[i].is_some() {
                continue;
            }
            let (mut sum, mut cnt) = (0.0f64, 0.0f64);
            for &j in &adj[i] {
                if !lane[j].is_nan() {
                    sum += lane[j];
                    cnt += 1.0;
                }
            }
            if cnt > 0.0 {
                let m = sum / cnt;
                if lane[i].is_nan() || (lane[i] - m).abs() > 1e-9 {
                    lane[i] = m;
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    for l in lane.iter_mut() {
        if l.is_nan() {
            *l = 0.5;
        }
    }

    let mut pos = vec![0usize; g.n];
    let refresh = |layers: &[Vec<usize>], pos: &mut [usize]| {
        for layer in layers {
            for (rank, &v) in layer.iter().enumerate() {
                pos[v] = rank;
            }
        }
    };
    refresh(layers, &mut pos);
    let total_crossings =
        |layers: &[Vec<usize>], pos: &[usize]| count_crossings(layers, &pred, pos);
    let orig_cross = total_crossings(layers, &pos);
    let saved: Vec<Vec<usize>> = layers.to_vec();

    let barycentre = |node: usize, pos: &[usize]| -> f64 {
        let ns = &adj[node];
        if ns.is_empty() {
            pos[node] as f64
        } else {
            ns.iter().map(|&j| pos[j] as f64).sum::<f64>() / ns.len() as f64
        }
    };
    for _ in 0..8 {
        for li in 0..layers.len() {
            layers[li].sort_by(|&a, &b| {
                lane[a]
                    .partial_cmp(&lane[b])
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(
                        barycentre(a, &pos)
                            .partial_cmp(&barycentre(b, &pos))
                            .unwrap_or(std::cmp::Ordering::Equal),
                    )
                    .then(a.cmp(&b))
            });
            refresh(layers, &mut pos);
        }
    }
    if total_crossings(layers, &pos) > orig_cross {
        for (i, s) in saved.into_iter().enumerate() {
            layers[i] = s;
        }
    }
}

// Phase 6: coordinate assignment (Brandes-Kopf)

/// Minimum centre-to-centre separation between two order-adjacent nodes; `a` is the negative-order-
/// side one. `clear[a]` widens the gap when `a` reserves clearance beyond its positive-side border.
fn sep(a: usize, b: usize, node_h: &[f64], is_dummy: &[bool], node_gap: f64, clear: &[f64]) -> f64 {
    let gap = if is_dummy[a] || is_dummy[b] { DUMMY_GAP } else { node_gap };
    node_h[a] / 2.0 + gap.max(clear[a]) + node_h[b] / 2.0
}

/// Pull each multi-layer edge's dummy chain onto a single order-lane (one straight run, not a
/// staircase). Dummies move only within their slot; heaviest edges straighten first for the clearest lane.
#[allow(clippy::too_many_arguments)]
fn straighten_long_edges(
    chains: &BTreeMap<usize, Vec<usize>>,
    layers: &[Vec<usize>],
    layer_of: &[i32],
    is_dummy: &[bool],
    ow: &[f64],
    weight: &[f64],
    node_gap: f64,
    clear: &[f64],
    cy: &mut [f64],
) {
    let mut pos_in_layer = vec![0usize; cy.len()];
    for layer in layers {
        for (i, &v) in layer.iter().enumerate() {
            pos_in_layer[v] = i;
        }
    }
    let mut arcs: Vec<(usize, f64)> = chains
        .iter()
        .filter(|(_, c)| c.len() >= 3 && c[1..c.len() - 1].iter().any(|&n| is_dummy[n]))
        .map(|(&a, _)| (a, weight.get(a).copied().unwrap_or(1.0)))
        .collect();
    arcs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));
    for (arc, _) in arcs {
        let chain = &chains[&arc];
        let dummies: Vec<usize> =
            chain[1..chain.len() - 1].iter().copied().filter(|&n| is_dummy[n]).collect();
        if dummies.is_empty() {
            continue;
        }
        let mut ys: Vec<f64> = dummies.iter().map(|&d| cy[d]).collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let lane_y = ys[ys.len() / 2];
        for &d in &dummies {
            let l = layer_of[d] as usize;
            let i = pos_in_layer[d];
            let lo = if i > 0 {
                cy[layers[l][i - 1]] + sep(layers[l][i - 1], d, ow, is_dummy, node_gap, clear)
            } else {
                f64::NEG_INFINITY
            };
            let hi = if i + 1 < layers[l].len() {
                cy[layers[l][i + 1]] - sep(d, layers[l][i + 1], ow, is_dummy, node_gap, clear)
            } else {
                f64::INFINITY
            };
            if lo <= hi {
                cy[d] = lane_y.clamp(lo, hi);
            }
        }
    }
}

/// Isotonic 1-D projection with minimum gaps (pool-adjacent-violators): positions `p` minimising
/// `sum (p_i - d_i)^2` subject to `p_{i+1} - p_i >= gap_i`. Exact least-displacement projection.
fn project_gaps(d: &[f64], gap: &[f64]) -> Vec<f64> {
    let m = d.len();
    if m == 0 {
        return vec![];
    }
    // Shift out the cumulative minimum gaps -> a plain monotone (non-decreasing) fit on y.
    let mut off = vec![0.0; m];
    for i in 1..m {
        off[i] = off[i - 1] + gap[i - 1];
    }
    let y: Vec<f64> = (0..m).map(|i| d[i] - off[i]).collect();
    // PAVA: merge adjacent blocks whose means violate monotonicity.
    let mut val: Vec<f64> = vec![];
    let mut cnt: Vec<f64> = vec![];
    for &yi in &y {
        val.push(yi);
        cnt.push(1.0);
        while val.len() > 1 && val[val.len() - 2] > val[val.len() - 1] {
            let (v1, c1) = (val.pop().unwrap(), cnt.pop().unwrap());
            let (v0, c0) = (val.pop().unwrap(), cnt.pop().unwrap());
            val.push((v0 * c0 + v1 * c1) / (c0 + c1));
            cnt.push(c0 + c1);
        }
    }
    // Expand blocks back to per-node values, re-adding the offsets.
    let mut out = Vec::with_capacity(m);
    for (b, &v) in val.iter().enumerate() {
        for _ in 0..cnt[b] as usize {
            let i = out.len();
            out.push(v + off[i]);
        }
    }
    out
}

/// Isotonic projection with some positions hard-fixed (`Some` in `fixed`): fixed nodes hold exact
/// value, free runs project against `d` then shift for min-gap. Falls back to [`project_gaps`] if none fixed.
fn project_gaps_pinned(d: &[f64], gap: &[f64], fixed: &[Option<f64>]) -> Vec<f64> {
    let m = d.len();
    if m == 0 {
        return vec![];
    }
    if fixed.iter().all(Option::is_none) {
        return project_gaps(d, gap);
    }
    let mut out = vec![0.0; m];
    let mut i = 0;
    while i < m {
        if let Some(f) = fixed[i] {
            out[i] = f;
            i += 1;
            continue;
        }
        // Maximal run of free nodes [i, j).
        let mut j = i;
        while j < m && fixed[j].is_none() {
            j += 1;
        }
        let mut p = project_gaps(&d[i..j], &gap[i..j.saturating_sub(1)]);
        // Respect the min-gap to the fixed node just below (i-1) by shifting the whole run up.
        if i > 0 {
            let lo = out[i - 1] + gap[i - 1];
            if p[0] < lo {
                let s = lo - p[0];
                for x in p.iter_mut() {
                    *x += s;
                }
            }
        }
        // ...and to the fixed node just above (j) by shifting the whole run down.
        if j < m {
            let hi = fixed[j].unwrap() - gap[j - 1];
            let last = p.len() - 1;
            if p[last] > hi {
                let s = p[last] - hi;
                for x in p.iter_mut() {
                    *x -= s;
                }
            }
        }
        for (k, &v) in p.iter().enumerate() {
            out[i + k] = v;
        }
        i = j;
    }
    out
}

/// Weighted median of `(value, weight)` samples: minimises `sum w*|m - value|`. The optimum sits ON
/// a sample, so a node lands aligned with a neighbour (straight edge) instead of averaged between them.
fn weighted_median(samples: &mut [(f64, f64)]) -> f64 {
    samples.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let total: f64 = samples.iter().map(|s| s.1).sum();
    let mut acc = 0.0;
    for &(v, w) in samples.iter() {
        acc += w;
        if acc * 2.0 >= total {
            return v;
        }
    }
    samples.last().map(|s| s.0).unwrap_or(0.0)
}

/// Seeded (stable) cross-axis placement: each real node at its seed (dragged node pinned), dummies
/// keep the Brandes-Kopf warm start, then `project_gaps_pinned` restores order/separation minimally.
#[allow(clippy::too_many_arguments)]
fn seeded_coords(
    layers: &[Vec<usize>],
    ow: &[f64],
    is_dummy: &[bool],
    node_gap: f64,
    clear: &[f64],
    tb: bool,
    n_in: usize,
    seed: &[Option<(f64, f64)>],
    pinned: &[bool],
    cy: &mut [f64],
) {
    // The cross axis is y in LeftRight and x in TopBottom (the final `map` transposes for TB).
    let order_seed = |i: usize| -> Option<f64> {
        seed.get(i).copied().flatten().map(|(x, y)| if tb { x } else { y })
    };
    let desired: Vec<f64> =
        (0..cy.len()).map(|v| if v < n_in { order_seed(v).unwrap_or(cy[v]) } else { cy[v] }).collect();
    for layer in layers {
        if layer.len() < 2 {
            if let Some(&v) = layer.first() {
                cy[v] = desired[v];
            }
            continue;
        }
        let d: Vec<f64> = layer.iter().map(|&v| desired[v]).collect();
        let gap: Vec<f64> = (0..layer.len() - 1)
            .map(|i| sep(layer[i], layer[i + 1], ow, is_dummy, node_gap, clear))
            .collect();
        let fixed: Vec<Option<f64>> = layer
            .iter()
            .map(|&v| if v < n_in && pinned.get(v).copied().unwrap_or(false) { order_seed(v) } else { None })
            .collect();
        let p = project_gaps_pinned(&d, &gap, &fixed);
        for (i, &v) in layer.iter().enumerate() {
            cy[v] = p[i];
        }
    }
}

/// Post-BK straightness snap: snap each real node onto the neighbour order-value that maximises
/// 0-bend edges (strict gains, tie toward current). Stays in the node's slot; separation/order hold.
#[allow(clippy::too_many_arguments)]
fn snap_align(
    layers: &[Vec<usize>],
    g: &Graph,
    arc_weight: &[f64],
    ow: &[f64],
    is_dummy: &[bool],
    node_gap: f64,
    clear: &[f64],
    ys: &mut [f64],
) {
    let n = g.n;
    // Neighbours carry their edge weight so the snap maximises weighted straightness (align onto the
    // heaviest neighbour). Uniform weights (Petri) reduce to the unweighted snap.
    let mut nb: Vec<Vec<(usize, f64)>> = vec![vec![]; n];
    for &(a, b, arc, _) in &g.edges {
        if a == b {
            continue;
        }
        let w = arc_weight.get(arc).copied().unwrap_or(1.0);
        nb[a].push((b, w));
        nb[b].push((a, w));
    }
    for _ in 0..8 {
        let mut changed = false;
        for layer in layers {
            for (i, &v) in layer.iter().enumerate() {
                if is_dummy[v] || nb[v].is_empty() {
                    continue;
                }
                let lo = if i > 0 {
                    ys[layer[i - 1]] + sep(layer[i - 1], v, ow, is_dummy, node_gap, clear)
                } else {
                    f64::NEG_INFINITY
                };
                let hi = if i + 1 < layer.len() {
                    ys[layer[i + 1]] - sep(v, layer[i + 1], ow, is_dummy, node_gap, clear)
                } else {
                    f64::INFINITY
                };
                let cur = ys[v];
                let straight_at = |y: f64| -> f64 {
                    nb[v].iter().filter(|&&(u, _)| (ys[u] - y).abs() < 1.0).map(|&(_, w)| w).sum()
                };
                let mut best_y = cur;
                let mut best_cnt = straight_at(cur);
                for &(u, _) in &nb[v] {
                    let y = ys[u];
                    if y < lo - 1e-6 || y > hi + 1e-6 {
                        continue;
                    }
                    let c = straight_at(y);
                    // Strict weighted gain; ties keep the position closest to current (-> no move).
                    if c > best_cnt + 1e-9
                        || ((c - best_cnt).abs() < 1e-9 && (y - cur).abs() < (best_y - cur).abs())
                    {
                        best_cnt = c;
                        best_y = y;
                    }
                }
                if (best_y - cur).abs() > 1.0 {
                    ys[v] = best_y.clamp(lo, hi);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
}

/// Brandes-Kopf horizontal compaction: place the block containing `v` as close to the top as its
/// already-placed left neighbours allow. Cross-class blocks are linked via `sink`/`shift`.
#[allow(clippy::too_many_arguments)]
fn bk_place_block(
    v: usize,
    ord: &[Vec<usize>],
    tlayer: &[usize],
    tpos: &[usize],
    root: &[usize],
    align: &[usize],
    sink: &mut [usize],
    shift: &mut [f64],
    xs: &mut [f64],
    ow: &[f64],
    is_dummy: &[bool],
    node_gap: f64,
    clear: &[f64],
    flipped: bool,
) {
    if !xs[v].is_nan() {
        return;
    }
    xs[v] = 0.0;
    let mut w = v;
    loop {
        if tpos[w] > 0 {
            let u_above = ord[tlayer[w]][tpos[w] - 1];
            let u = root[u_above];
            bk_place_block(
                u, ord, tlayer, tpos, root, align, sink, shift, xs, ow, is_dummy, node_gap, clear,
                flipped,
            );
            if sink[v] == v {
                sink[v] = sink[u];
            }
            // In within-layer-reversed passes the transformed "above" node is the true positive-
            // side one, so the clearance owner (true negative-side node of the pair) is `w`.
            let owner = if flipped { w } else { u_above };
            let s = ow[u_above] / 2.0
                + (if is_dummy[u_above] || is_dummy[w] { DUMMY_GAP } else { node_gap })
                    .max(clear[owner])
                + ow[w] / 2.0;
            if sink[v] == sink[u] {
                xs[v] = xs[v].max(xs[u] + s);
            } else {
                let su = sink[u];
                shift[su] = shift[su].min(xs[v] - xs[u] - s);
            }
        }
        w = align[w];
        if w == v {
            break;
        }
    }
}

/// Brandes-Kopf coordinate assignment on the order axis (dagre/ELK placement): align each node with
/// a median neighbour into blocks, run four biased passes (top/bottom x left/right), combine them.
#[allow(clippy::too_many_arguments)]
fn brandes_koepf(
    layers: &[Vec<usize>],
    layer_of: &[i32],
    g: &Graph,
    ow: &[f64],
    is_dummy: &[bool],
    node_gap: f64,
    clear: &[f64],
) -> Vec<f64> {
    let n = g.n;
    let n_layers = layers.len();
    if n == 0 {
        return vec![];
    }

    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    let mut preds: Vec<Vec<usize>> = vec![vec![]; n];
    for &(from, to, _, _) in &g.edges {
        adj[from].push(to);
        adj[to].push(from);
        // Predecessor = the endpoint in the lower-index layer.
        if layer_of[from] < layer_of[to] {
            preds[to].push(from);
        } else if layer_of[to] < layer_of[from] {
            preds[from].push(to);
        }
    }

    let mut pos0 = vec![0usize; n];
    for layer in layers {
        for (i, &v) in layer.iter().enumerate() {
            pos0[v] = i;
        }
    }

    // Type-1 conflicts: a non-inner segment crossing an inner (dummy-dummy) segment.
    // Preferring inner segments keeps long edges straight through their dummy chain.
    let inner_upper = |v: usize| -> Option<usize> {
        if is_dummy[v] {
            preds[v].iter().copied().find(|&u| is_dummy[u])
        } else {
            None
        }
    };
    let mut conflicts: std::collections::BTreeSet<(usize, usize)> = Default::default();
    for i in 0..n_layers.saturating_sub(1) {
        let (upper, lower) = (&layers[i], &layers[i + 1]);
        let mut k0 = 0usize;
        let mut scan = 0usize;
        for l1 in 0..lower.len() {
            let v = lower[l1];
            let w = inner_upper(v);
            if w.is_some() || l1 == lower.len() - 1 {
                let k1 = w.map(|w| pos0[w]).unwrap_or(upper.len().saturating_sub(1));
                for &vl in &lower[scan..=l1] {
                    for &u in &adj[vl] {
                        if layer_of[u] as usize == i {
                            let up = pos0[u];
                            if (up < k0 || up > k1) && !(is_dummy[u] && is_dummy[vl]) {
                                conflicts.insert((u.min(vl), u.max(vl)));
                            }
                        }
                    }
                }
                scan = l1 + 1;
                k0 = k1;
            }
        }
    }

    // One biased alignment + compaction over a transformed layer stack `ord`. `flipped` = within-
    // layer order reversed (right-biased), swapping which node of a pair owns the `clear` reservation.
    let align_compact = |ord: &[Vec<usize>], flipped: bool| -> Vec<f64> {
        let mut tlayer = vec![0usize; n];
        let mut tpos = vec![0usize; n];
        for (i, layer) in ord.iter().enumerate() {
            for (j, &v) in layer.iter().enumerate() {
                tlayer[v] = i;
                tpos[v] = j;
            }
        }
        let mut root: Vec<usize> = (0..n).collect();
        let mut align: Vec<usize> = (0..n).collect();
        // Classic BK: each node aligns with one of its two median upper neighbours, scanning
        // left-to-right with a monotone claim pointer.
        for (i, layer) in ord.iter().enumerate().skip(1) {
            let mut prev: i64 = -1;
            for &v in layer {
                let mut ws: Vec<usize> =
                    adj[v].iter().copied().filter(|&u| tlayer[u] + 1 == i).collect();
                ws.sort_by_key(|&u| tpos[u]);
                if ws.is_empty() {
                    continue;
                }
                let m = ws.len();
                for &w in &[ws[(m - 1) / 2], ws[m / 2]] {
                    if align[v] == v
                        && prev < tpos[w] as i64
                        && !conflicts.contains(&(w.min(v), w.max(v)))
                    {
                        align[w] = v;
                        root[v] = root[w];
                        align[v] = root[w];
                        prev = tpos[w] as i64;
                    }
                }
            }
        }
        let mut xs = vec![f64::NAN; n];
        let mut sink: Vec<usize> = (0..n).collect();
        let mut shift = vec![f64::INFINITY; n];
        for v in 0..n {
            if root[v] == v {
                bk_place_block(
                    v, ord, &tlayer, &tpos, &root, &align, &mut sink, &mut shift, &mut xs, ow,
                    is_dummy, node_gap, clear, flipped,
                );
            }
        }
        for v in 0..n {
            xs[v] = xs[root[v]];
        }
        for v in 0..n {
            let s = sink[root[v]];
            if shift[s].is_finite() {
                xs[v] += shift[s];
            }
        }
        xs
    };

    // Four passes: align from top/bottom (reverse layer stack) x left/right (reverse
    // within-layer order). Reversing within a layer flips the axis, so negate afterwards.
    let mut assigns: Vec<Vec<f64>> = vec![];
    for up in [false, true] {
        for left in [false, true] {
            let mut ord: Vec<Vec<usize>> = layers.to_vec();
            if up {
                ord.reverse();
            }
            if !left {
                for l in &mut ord {
                    l.reverse();
                }
            }
            let mut y = align_compact(&ord, !left);
            if !left {
                for v in y.iter_mut() {
                    *v = -*v;
                }
            }
            assigns.push(y);
        }
    }

    // Balance: centre each pass on its median.
    for a in assigns.iter_mut() {
        let mut s = a.clone();
        s.sort_by(|x, y| x.partial_cmp(y).unwrap());
        let med = s[n / 2];
        for v in a.iter_mut() {
            *v -= med;
        }
    }
    // ELK balance: per node, mean of the middle two of the four biased passes.
    (0..n)
        .map(|v| {
            let mut vals = [assigns[0][v], assigns[1][v], assigns[2][v], assigns[3][v]];
            vals.sort_by(|a, b| a.partial_cmp(b).unwrap());
            (vals[1] + vals[2]) / 2.0
        })
        .collect()
}


fn assign_x_positions(layers: &[Vec<usize>], node_w: &[f64], layer_gap: f64) -> Vec<f64> {
    let mut cx = vec![0.0f64; node_w.len()];
    let mut x = 0.0f64;
    for layer in layers {
        // Layer width = max node width in this layer.
        let layer_w = layer.iter().map(|&n| node_w[n]).fold(0.0f64, f64::max);
        let centre_x = x + layer_w / 2.0;
        for &node in layer {
            cx[node] = centre_x;
        }
        x += layer_w + layer_gap;
    }
    cx
}

// Phase 7: ported + laned orthogonal routing (layer axis = x)

#[derive(Clone, Copy, PartialEq, Eq)]
enum Side {
    Right,
    Left,
    Top,
    Bottom,
}

impl Side {
    fn horizontal(self) -> bool {
        matches!(self, Side::Right | Side::Left)
    }
    fn index(self) -> u8 {
        match self {
            Side::Right => 0,
            Side::Left => 1,
            Side::Top => 2,
            Side::Bottom => 3,
        }
    }
}

const STUB: f64 = 15.0;
const MIN_PORT_GAP: f64 = 18.0;
/// Visual daylight to keep between the strokes of two adjacent ports (added to their half-widths).
const PORT_STROKE_CLEAR: f64 = 14.0;

/// A resolved port: where the arc meets the node border and a stub just outside it.
#[derive(Clone, Copy)]
struct Port {
    anchor: (f64, f64),
    stub: (f64, f64),
    side: Side,
}

/// Per-internal-node box geometry in flow space (layer axis = x, order axis = y). Real nodes
/// occupy indices `0..n_real`; the rest are zero-size routing dummies.
struct Boxes {
    cx: Vec<f64>,      // layer-axis centre
    cy: Vec<f64>,      // order-axis centre
    layer_w: Vec<f64>, // extent along the layer axis
    order_w: Vec<f64>, // extent along the order axis
    ellipse: Vec<bool>,
    n_real: usize,
}

/// Project a port anchor onto the node border for `side` at signed offset `off`. On an ellipse the
/// anchor lands on the actual outline; the stub sits just outside the box.
fn project_port(node: usize, side: Side, off: f64, b: &Boxes) -> Port {
    let (cxn, cyn) = (b.cx[node], b.cy[node]);
    let (hw, hh) = (b.layer_w[node] / 2.0, b.order_w[node] / 2.0);
    let ell = b.ellipse[node];
    // Fraction of the half-extent the ellipse still spans at the perpendicular offset.
    let ell_span = |o: f64, half: f64| -> f64 {
        if half <= 0.0 { 1.0 } else { (1.0 - (o / half).powi(2)).max(0.0).sqrt() }
    };
    let (anchor, stub) = match side {
        Side::Right => {
            let o = off.clamp(-hh * 0.95, hh * 0.95);
            let ax = if ell { cxn + hw * ell_span(o, hh) } else { cxn + hw };
            ((ax, cyn + o), (cxn + hw + STUB, cyn + o))
        }
        Side::Left => {
            let o = off.clamp(-hh * 0.95, hh * 0.95);
            let ax = if ell { cxn - hw * ell_span(o, hh) } else { cxn - hw };
            ((ax, cyn + o), (cxn - hw - STUB, cyn + o))
        }
        Side::Top => {
            let o = off.clamp(-hw * 0.95, hw * 0.95);
            let ay = if ell { cyn - hh * ell_span(o, hw) } else { cyn - hh };
            ((cxn + o, ay), (cxn + o, cyn - hh - STUB))
        }
        Side::Bottom => {
            let o = off.clamp(-hw * 0.95, hw * 0.95);
            let ay = if ell { cyn + hh * ell_span(o, hw) } else { cyn + hh };
            ((cxn + o, ay), (cxn + o, cyn + hh + STUB))
        }
    };
    Port { anchor, stub, side }
}

/// Fix-up for one end diagonal of a flow-style route: `Some(vec![])` if `p->q` clears every box,
/// `Some(vec![bend])` for the cheapest one-corner detour, `None` if none works (caller falls back).
fn flow_diag_fix(
    p: (f64, f64),
    q: (f64, f64),
    b: &Boxes,
    skip1: usize,
    skip2: usize,
) -> Option<Vec<(f64, f64)>> {
    // Flow diagonals must not merely miss a box - a graze reads as bad as a hit. Demand a
    // real gap; a straight segment closer than this takes the corner detour instead.
    const CLEAR: f64 = 8.0;
    const MARGIN: f64 = 12.0;
    if !seg_hits_box_pad(p, q, b, skip1, skip2, CLEAR) {
        return Some(vec![]);
    }
    let dist = |a: (f64, f64), c: (f64, f64)| (a.0 - c.0).hypot(a.1 - c.1);
    let mut best: Option<((f64, f64), f64)> = None;
    for i in 0..b.n_real {
        if i == skip1 || i == skip2 || b.layer_w[i] <= 0.0 {
            continue;
        }
        let hx = b.layer_w[i] / 2.0 + MARGIN;
        let hy = b.order_w[i] / 2.0 + MARGIN;
        for (sx, sy) in [(-1.0, -1.0), (-1.0, 1.0), (1.0, -1.0), (1.0, 1.0)] {
            let c = (b.cx[i] + sx * hx, b.cy[i] + sy * hy);
            if seg_hits_box_pad(p, c, b, skip1, skip2, CLEAR)
                || seg_hits_box_pad(c, q, b, skip1, skip2, CLEAR)
            {
                continue;
            }
            let extra = dist(p, c) + dist(c, q) - dist(p, q);
            if best.is_none_or(|(_, e)| extra < e) {
                best = Some((c, extra));
            }
        }
    }
    best.map(|(c, _)| vec![c])
}

/// Does segment `p->q` cut through any real node box other than `skip1`/`skip2`?
fn seg_hits_box(p: (f64, f64), q: (f64, f64), b: &Boxes, skip1: usize, skip2: usize) -> bool {
    seg_hits_box_pad(p, q, b, skip1, skip2, -1.0)
}

/// [`seg_hits_box`] with each box inflated by `pad` (negative shrinks - the plain hit test
/// uses -1 so routes may touch a border without counting as a hit).
fn seg_hits_box_pad(
    p: (f64, f64),
    q: (f64, f64),
    b: &Boxes,
    skip1: usize,
    skip2: usize,
    pad: f64,
) -> bool {
    for i in 0..b.n_real {
        if i == skip1 || i == skip2 || b.layer_w[i] <= 0.0 {
            continue;
        }
        let (xmin, xmax) = (b.cx[i] - b.layer_w[i] / 2.0 - pad, b.cx[i] + b.layer_w[i] / 2.0 + pad);
        let (ymin, ymax) = (b.cy[i] - b.order_w[i] / 2.0 - pad, b.cy[i] + b.order_w[i] / 2.0 + pad);
        if xmin >= xmax || ymin >= ymax {
            continue;
        }
        let (mut t0, mut t1) = (0.0f64, 1.0f64);
        let mut outside = false;
        for &(pc, dc, lo, hi) in &[(p.0, q.0 - p.0, xmin, xmax), (p.1, q.1 - p.1, ymin, ymax)] {
            if dc.abs() < 1e-9 {
                if pc < lo || pc > hi {
                    outside = true;
                    break;
                }
            } else {
                let (mut ta, mut tb) = ((lo - pc) / dc, (hi - pc) / dc);
                if ta > tb {
                    std::mem::swap(&mut ta, &mut tb);
                }
                t0 = t0.max(ta);
                t1 = t1.min(tb);
            }
        }
        if !outside && t0 < t1 - 1e-6 {
            return true;
        }
    }
    false
}

/// Proper (interior) intersection test for open segments p1p2 and p3p4 via CCW orientation. Shared
/// endpoints are NOT excluded; callers that need to skip them do so before calling.
fn segments_cross(p1: (f64, f64), p2: (f64, f64), p3: (f64, f64), p4: (f64, f64)) -> bool {
    let o = |a: (f64, f64), b: (f64, f64), c: (f64, f64)| {
        (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0)
    };
    (o(p3, p4, p1) > 0.0) != (o(p3, p4, p2) > 0.0)
        && (o(p1, p2, p3) > 0.0) != (o(p1, p2, p4) > 0.0)
}

/// Count proper segment intersections between edge `arc`'s polyline and every other edge's.
fn arc_crossings(routes: &[Vec<(f64, f64)>], arc: usize) -> usize {
    let mut n = 0;
    for j in 0..routes.len() {
        if j == arc {
            continue;
        }
        for wa in routes[arc].windows(2) {
            for wb in routes[j].windows(2) {
                let (p1, p2, p3, p4) = (wa[0], wa[1], wb[0], wb[1]);
                if p1 == p3 || p1 == p4 || p2 == p3 || p2 == p4 {
                    continue;
                }
                if segments_cross(p1, p2, p3, p4) {
                    n += 1;
                }
            }
        }
    }
    n
}

/// Route every arc as an orthogonal polyline in flow space (layers left->right). Ports are four-sided,
/// spread per border; returns one layer-ascending polyline per arc (caller reverses feedback arcs).
#[allow(clippy::too_many_arguments)]
fn route_edges(
    n_arcs: usize,
    layers: &[Vec<usize>],
    layer_of: &[i32],
    b: &Boxes,
    chains: &BTreeMap<usize, Vec<usize>>,
    thickness: &[f64],
    flow_edges: bool,
    side_port: bool,
) -> Vec<Vec<(f64, f64)>> {
    let (cx, cy, lw, ow, is_ellipse) = (&b.cx, &b.cy, &b.layer_w, &b.order_w, &b.ellipse);
    let n_in = b.n_real;
    let n_layers = layers.len();
    let layer_x: Vec<f64> = layers.iter().map(|l| l.first().map(|&n| cx[n]).unwrap_or(0.0)).collect();
    let layer_half: Vec<f64> =
        layers.iter().map(|l| l.iter().map(|&n| lw[n] / 2.0).fold(0.0, f64::max)).collect();

    // Iterate arcs in a stable sorted-key order everywhere below so tie-breaks (port/lane order)
    // stay deterministic across runs.
    let mut arc_keys: Vec<usize> = chains.keys().copied().collect();
    arc_keys.sort_unstable();
    let ordered = || arc_keys.iter().filter_map(|&a| chains.get(&a).map(|c| (a, c)));

    // Endpoint side selection: each endpoint attaches to the border facing where its edge heads -
    // source forward (right), target backward (left), or top/bottom when strongly perpendicular.
    struct EdgeEnd {
        node: usize,
        side: Side,
        aim_order: f64,
        aim_layer: f64,
    }
    // A direct edge across a vertical offset needs exactly ONE perpendicular endpoint for a clean
    // single-bend L; choose jointly, else keep both facing (-> gutter Z).
    let seg_hits =
        |p: (f64, f64), q: (f64, f64), s1: usize, s2: usize| seg_hits_box(p, q, b, s1, s2);
    let direct_sides = |lo: usize, hi: usize| -> (Side, Side) {
        let dy = cy[hi] - cy[lo];
        if dy.abs() < 1.0 {
            return (Side::Right, Side::Left); // aligned -> straight
        }
        // If source and target share an order-axis column (perpendicular extents overlap), route
        // through the forward faces (straight drop / gutter Z). Off-column edges use a perp endpoint.
        let overlap = (cy[lo] - ow[lo] / 2.0).max(cy[hi] - ow[hi] / 2.0)
            < (cy[lo] + ow[lo] / 2.0).min(cy[hi] + ow[hi] / 2.0);
        if overlap {
            return (Side::Right, Side::Left);
        }
        let (s_perp, t_perp) = if dy > 0.0 {
            (Side::Bottom, Side::Top)
        } else {
            (Side::Top, Side::Bottom)
        };
        // Orientation B: down/up at the source's x, then across to the target's West border.
        let b_ok = !seg_hits((cx[lo], cy[lo]), (cx[lo], cy[hi]), lo, hi)
            && !seg_hits((cx[lo], cy[hi]), (cx[hi], cy[hi]), lo, hi);
        // Orientation A: across at the source's y, then down/up into the target's Top/Bottom.
        let a_ok = !seg_hits((cx[lo], cy[lo]), (cx[hi], cy[lo]), lo, hi)
            && !seg_hits((cx[hi], cy[lo]), (cx[hi], cy[hi]), lo, hi);
        // Each orientation has one riser sweeping a layer column; a riser through dummy channels is a
        // crossing. When both clear the boxes, take the fewer-channel-crossing riser (B wins ties).
        let dummy_cross = |layer_node: usize, y0: f64, y1: f64| -> usize {
            let l = layer_of[layer_node];
            let (lo_y, hi_y) = (y0.min(y1) + 1.0, y0.max(y1) - 1.0);
            (n_in..cx.len())
                .filter(|&d| layer_of[d] == l && cy[d] > lo_y && cy[d] < hi_y)
                .count()
        };
        if b_ok && a_ok && dummy_cross(hi, cy[lo], cy[hi]) < dummy_cross(lo, cy[lo], cy[hi]) {
            return (Side::Right, t_perp);
        }
        if b_ok {
            return (s_perp, Side::Left);
        }
        if a_ok {
            return (Side::Right, t_perp);
        }
        (Side::Right, Side::Left)
    };
    // Multi-hop endpoint: face the adjacent waypoint's border so the arc drops into its channel.
    // Source flips to top/bottom above slope 0.7; target only when strongly vertical (2.0), per ELK.
    let perp_side = |node: usize, aim: usize, is_source: bool| -> Side {
        let (dx, dy) = (cx[aim] - cx[node], cy[aim] - cy[node]);
        let thresh = if is_source { 0.7 } else { 2.0 };
        if dy.abs() > dx.abs() * thresh {
            if dy > 0.0 { Side::Bottom } else { Side::Top }
        } else if is_source {
            Side::Right
        } else {
            Side::Left
        }
    };
    // Flow style: attach each end to the border the node-centre -> aim-centre ray exits through, so
    // the diagonal leaves perpendicular-ish. Steepness judged by box aspect (|dy|*h <= |dx|*w), but
    // only flip to a top/bottom port when the cross-offset also dominates the layer-offset
    // (|dy| > |dx|). The aspect test alone flips too eagerly for wide-short nodes (LR, 150x58): a
    // forward edge with a mild slope still exits the short top face, so adjacent-layer arcs attach
    // top/bottom instead of the forward face. The extra gate keeps forward ports clean regardless of
    // orientation, and is a no-op for tall-in-cross nodes (TB), whose aspect threshold already
    // implies |dy| > |dx| whenever it flips.
    let ray_side = |node: usize, ax: f64, ay: f64| -> Side {
        let (dx, dy) = (ax - cx[node], ay - cy[node]);
        if dy.abs() * lw[node] <= dx.abs() * ow[node] || dy.abs() <= dx.abs() {
            if dx > 0.0 {
                Side::Right
            } else {
                Side::Left
            }
        } else if dy > 0.0 {
            Side::Bottom
        } else {
            Side::Top
        }
    };
    let mut arc_ends: BTreeMap<usize, (EdgeEnd, EdgeEnd)> = BTreeMap::new();
    for (arc, chain) in ordered() {
        if chain.len() < 2 {
            continue;
        }
        let lo = chain[0];
        let hi = chain[chain.len() - 1];
        let direct = chain.len() == 2;
        let s_aim = chain[1];
        let t_aim = chain[chain.len() - 2];
        let (s_side, t_side) = if flow_edges {
            // A long edge whose target sits in a laterally-offset column reads better leaving via the
            // cross-face toward it. Aim the side at the target cross-position when offset > ~a node width.
            let s = if side_port
                && chain.len() >= 5
                && (cy[hi] - cy[lo]).abs() > ow[lo] * 0.9
            {
                ray_side(lo, cx[lo], cy[hi])
            } else {
                ray_side(lo, cx[s_aim], cy[s_aim])
            };
            (s, ray_side(hi, cx[t_aim], cy[t_aim]))
        } else if direct {
            direct_sides(lo, hi)
        } else {
            (perp_side(lo, s_aim, true), perp_side(hi, t_aim, false))
        };
        arc_ends.insert(
            arc,
            (
                EdgeEnd { node: lo, side: s_side, aim_order: cy[s_aim], aim_layer: cx[s_aim] },
                EdgeEnd { node: hi, side: t_side, aim_order: cy[t_aim], aim_layer: cx[t_aim] },
            ),
        );
    }

    // Perpendicular target relief for lightly-loaded nodes: a multi-hop edge approaching from well
    // above/below pays a second bend at the facing border; if low-degree with a free perp side, enter there.
    {
        let mut deg: Vec<usize> = vec![0; n_in];
        for (_, chain) in ordered() {
            if chain.len() >= 2 {
                let (a, b) = (chain[0], chain[chain.len() - 1]);
                if a < n_in {
                    deg[a] += 1;
                }
                if b < n_in {
                    deg[b] += 1;
                }
            }
        }
        let mut occ: BTreeMap<(usize, u8), usize> = BTreeMap::new();
        for (s, t) in arc_ends.values() {
            *occ.entry((s.node, s.side.index())).or_default() += 1;
            *occ.entry((t.node, t.side.index())).or_default() += 1;
        }
        let mut flips: Vec<(usize, Side)> = vec![];
        for (arc, chain) in ordered() {
            if chain.len() <= 2 {
                continue; // direct edges are already single-bend via choose_direct
            }
            let t = &arc_ends[&arc].1;
            if t.side != Side::Left {
                continue;
            }
            let hi = chain[chain.len() - 1];
            let t_aim = chain[chain.len() - 2];
            let drop = cy[t_aim] - cy[hi];
            // Within the facing border's port span the channel enters straight; beyond it needs a jog.
            // On busy nodes only a jog wider than a port gap justifies stealing the perp border.
            let span = ow[hi] * 0.45;
            if drop.abs() <= span || (deg[hi] > 4 && drop.abs() <= span + MIN_PORT_GAP) {
                continue;
            }
            let perp = if drop > 0.0 { Side::Bottom } else { Side::Top };
            if *occ.get(&(hi, perp.index())).unwrap_or(&0) != 0 {
                continue; // keep the perpendicular border clear of collisions
            }
            // Don't strand this edge from a same-direction cluster: if another arc-end sits on `hi`'s
            // facing border with the same drop sign, keep it there rather than flip to the perp border.
            let clustered = arc_ends.iter().any(|(&other, (s2, t2))| {
                other != arc
                    && ((s2.node == hi && s2.side == Side::Left && (s2.aim_order - cy[hi]) * drop > 0.0)
                        || (t2.node == hi && t2.side == Side::Left && (t2.aim_order - cy[hi]) * drop > 0.0))
            });
            if clustered {
                continue;
            }
            // The clean L: horizontal along the approach line to the target column, then a riser
            // straight into the perpendicular border. Only take it if that riser clears every box.
            let bx = cx[hi];
            if seg_hits((bx, cy[t_aim]), (bx, cy[hi]), chain[0], hi) {
                continue;
            }
            flips.push((arc, perp));
        }
        for (arc, perp) in flips {
            let ends = arc_ends.get_mut(&arc).unwrap();
            if let Some(c) = occ.get_mut(&(ends.1.node, ends.1.side.index())) {
                *c = c.saturating_sub(1);
            }
            *occ.entry((ends.1.node, perp.index())).or_default() += 1;
            ends.1.side = perp;
        }
    }

    // Port spreading per (node, side): bucket endpoints by border, order by where each edge heads (lone
    // port centred). On a perp border nest the L's so the fan is planar; facing borders use aim-order.
    type Bucket = Vec<(usize, bool, f64, f64)>;
    let perp_key = |side: Side, is_source: bool, aim_order: f64| -> f64 {
        if is_source == (side == Side::Bottom) { -aim_order } else { aim_order }
    };
    // Flow (diagonal) edges: put the port where the centre -> aim line crosses the border, not at the
    // aim's raw coordinate. Orthogonal routing keeps `raw`. Gated on `flow_edges`.
    let flow_pos = |node: usize, side: Side, aim_cx: f64, aim_cy: f64, raw: f64| -> f64 {
        if !flow_edges {
            return raw;
        }
        let (dx, dy) = (aim_cx - cx[node], aim_cy - cy[node]);
        if side.horizontal() {
            let hw = lw[node] / 2.0;
            if dx.abs() < 1e-6 { raw } else { cy[node] + dy * (hw / dx.abs()) }
        } else {
            let hh = ow[node] / 2.0;
            if dy.abs() < 1e-6 { raw } else { cx[node] + dx * (hh / dy.abs()) }
        }
    };
    // Flow edges on an ellipse use ONE radial bucket (key 4), not four side buckets: a small circle
    // has no meaningful "side". Radial entries carry the approach angle as sort key and position.
    const RADIAL: u8 = 4;
    let radial = |node: usize| flow_edges && node < n_in && is_ellipse[node];
    let mut buckets: BTreeMap<(usize, u8), Bucket> = BTreeMap::new();
    for (&arc, (s, t)) in arc_ends.iter() {
        let (s_sort, s_pos) = if radial(s.node) {
            let th = (s.aim_order - cy[s.node]).atan2(s.aim_layer - cx[s.node]);
            (th, th)
        } else if s.side.horizontal() {
            let p = flow_pos(s.node, s.side, s.aim_layer, s.aim_order, s.aim_order);
            (p, p)
        } else {
            let p = flow_pos(s.node, s.side, s.aim_layer, s.aim_order, s.aim_layer);
            (perp_key(s.side, true, s.aim_order), p)
        };
        let (t_sort, t_pos) = if radial(t.node) {
            let th = (t.aim_order - cy[t.node]).atan2(t.aim_layer - cx[t.node]);
            (th, th)
        } else if t.side.horizontal() {
            let p = flow_pos(t.node, t.side, t.aim_layer, t.aim_order, t.aim_order);
            (p, p)
        } else {
            let p = flow_pos(t.node, t.side, t.aim_layer, t.aim_order, t.aim_layer);
            (perp_key(t.side, false, t.aim_order), p)
        };
        let s_key = if radial(s.node) { RADIAL } else { s.side.index() };
        let t_key = if radial(t.node) { RADIAL } else { t.side.index() };
        buckets.entry((s.node, s_key)).or_default().push((arc, true, s_sort, s_pos));
        buckets.entry((t.node, t_key)).or_default().push((arc, false, t_sort, t_pos));
    }
    let mut port: BTreeMap<(usize, bool), Port> = BTreeMap::new();
    let mut bucket_keys: Vec<(usize, u8)> = buckets.keys().copied().collect();
    bucket_keys.sort_unstable();
    for key in bucket_keys {
        let side = match key.1 {
            0 => Side::Right,
            1 => Side::Left,
            2 => Side::Top,
            _ => Side::Bottom,
        };
        let node = key.0;
        let mut list = buckets.remove(&key).unwrap();
        // Orthogonal ports on a perp border run along the layer axis after their bend, so order them
        // by aim layer position (it.3) first, `perp_key` (it.2) as tiebreak. Facing/flow keep it.2 only.
        if !flow_edges && !side.horizontal() {
            list.sort_by(|a, b| {
                a.3.partial_cmp(&b.3)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then(a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal))
                    .then(a.0.cmp(&b.0))
            });
        } else {
            list.sort_by(|a, b| {
                a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0))
            });
        }
        if key.1 == RADIAL {
            // Radial fan around an ellipse: sort by approach angle, cut at the largest angular gap
            // (keeps a +/-pi cluster contiguous), spread with a min angular gap, anchor along each ray.
            use std::f64::consts::TAU;
            let n = list.len();
            let (cxn, cyn) = (cx[node], cy[node]);
            let (hw, hh) = (lw[node] / 2.0, ow[node] / 2.0);
            let r_eff = (hw + hh) / 2.0;
            let mut cut = 0usize;
            let mut best_gap = -1.0;
            for i in 0..n {
                let a = list[i].2;
                let b_ = list[(i + 1) % n].2 + if i + 1 == n { TAU } else { 0.0 };
                if b_ - a > best_gap {
                    best_gap = b_ - a;
                    cut = (i + 1) % n;
                }
            }
            let base = list[cut].2;
            let unwrap_th = |th: f64| {
                let mut t = th - base;
                if t < -1e-9 {
                    t += TAU;
                }
                t
            };
            let t_of = |it: &(usize, bool, f64, f64)| thickness.get(it.0).copied().unwrap_or(2.0);
            let gap_lin = (0..n.saturating_sub(1)).fold(MIN_PORT_GAP, |g, i| {
                g.max((t_of(&list[i]) + t_of(&list[i + 1])) / 2.0 + PORT_STROKE_CLEAR)
            });
            let gap_ang = gap_lin / r_eff;
            let desired: Vec<f64> = (0..n).map(|k| unwrap_th(list[(cut + k) % n].2)).collect();
            // Keep the fan near its natural angular span: cap the total span slightly beyond the
            // cluster, centre it, and shrink the gap to fit (else ports wrap around the far side).
            let d_span = desired[n - 1] - desired[0];
            let max_span = (d_span + 2.0 * gap_ang).min(TAU - gap_ang);
            let gap_eff =
                if n > 1 { gap_ang.min(max_span / (n as f64 - 1.0)) } else { gap_ang };
            let lo_b = desired[0] - (max_span - d_span) / 2.0;
            let hi_b = lo_b + max_span;
            let mut pos = desired.clone();
            pos[0] = pos[0].max(lo_b);
            for i in 1..n {
                if pos[i] < pos[i - 1] + gap_eff {
                    pos[i] = pos[i - 1] + gap_eff;
                }
            }
            if n > 1 && pos[n - 1] > hi_b {
                pos[n - 1] = hi_b;
                for i in (0..n - 1).rev() {
                    pos[i] = pos[i].min(pos[i + 1] - gap_eff);
                }
            }
            for (k, p) in pos.iter().enumerate() {
                let it = &list[(cut + k) % n];
                let th = base + p;
                let (dc, ds) = (th.cos(), th.sin());
                let scale = 1.0 / ((dc / hw).powi(2) + (ds / hh).powi(2)).sqrt();
                let anchor = (cxn + scale * dc, cyn + scale * ds);
                let stub = (anchor.0 + STUB * dc, anchor.1 + STUB * ds);
                let side = if ds.abs() * lw[node] <= dc.abs() * ow[node] {
                    if dc > 0.0 { Side::Right } else { Side::Left }
                } else if ds > 0.0 {
                    Side::Bottom
                } else {
                    Side::Top
                };
                port.insert((it.0, it.1), Port { anchor, stub, side });
            }
            continue;
        }
        let n = list.len();
        let (cxn, cyn) = (cx[node], cy[node]);
        let extent = if side.horizontal() { ow[node] } else { lw[node] };
        let centre = if side.horizontal() { cyn } else { cxn };
        // Stroke-aware port gap: two thick strokes 18px apart leave almost no daylight, so each
        // adjacent pair needs at least half their strokes plus a constant visual clearance.
        let t_of = |i: usize| thickness.get(list[i].0).copied().unwrap_or(2.0);
        let pair_gap =
            |a: usize, b: usize| MIN_PORT_GAP.max((t_of(a) + t_of(b)) / 2.0 + PORT_STROKE_CLEAR);
        let offs: Vec<f64> = if n == 1 {
            // Flow edges anchor a lone port where the centre->aim ray crosses the border (collinear
            // diagonal); orthogonal routing keeps the border centre.
            if flow_edges {
                let lim = extent * 0.45;
                vec![(list[0].3 - centre).clamp(-lim, lim)]
            } else {
                vec![0.0]
            }
        } else {
            // Spread ports along the border, ordered by aim, min-gap apart, bounded both ends so
            // the clamp can't squash them back together.
            let lim = extent * 0.45;
            let desired: Vec<f64> = list.iter().map(|it| (it.3 - centre).clamp(-lim, lim)).collect();
            // Below MIN_PORT_GAP a linear split can't fit; on an ellipse space by true (Euclidean)
            // border distance so outer ports pack tighter. Linear otherwise (matches box offsets).
            let oversubscribed = (2.0 * lim / (n - 1) as f64) < MIN_PORT_GAP;
            if is_ellipse[node] && oversubscribed {
                let half_along = extent / 2.0;
                let perp_half = (if side.horizontal() { lw[node] } else { ow[node] }) / 2.0;
                let span = |o: f64| ((1.0 - (o / half_along).powi(2)).max(0.0)).sqrt();
                let euclid = |a: f64, b: f64| (perp_half * (span(a) - span(b))).hypot(a - b);
                // Smallest o >= prev with euclid(prev,o) >= gap (binary search over the physical
                // half-extent, so an overflow past `lim` is detected and back-propagated).
                let next_off = |prev: f64, gap: f64| -> f64 {
                    if euclid(prev, half_along) < gap {
                        return half_along;
                    }
                    let (mut lo, mut hi) = (prev, half_along);
                    for _ in 0..40 {
                        let mid = (lo + hi) / 2.0;
                        if euclid(prev, mid) < gap { lo = mid; } else { hi = mid; }
                    }
                    hi
                };
                let prev_off = |next: f64, gap: f64| -> f64 {
                    if euclid(next, -half_along) < gap {
                        return -half_along;
                    }
                    let (mut lo, mut hi) = (-half_along, next);
                    for _ in 0..40 {
                        let mid = (lo + hi) / 2.0;
                        if euclid(next, mid) < gap { hi = mid; } else { lo = mid; }
                    }
                    lo
                };
                let place = |gap: f64| -> Option<Vec<f64>> {
                    let mut pos = desired.clone();
                    pos[0] = pos[0].max(-lim);
                    for i in 1..n {
                        if pos[i] <= pos[i - 1] || euclid(pos[i - 1], pos[i]) < gap {
                            pos[i] = next_off(pos[i - 1], gap);
                        }
                    }
                    if pos[n - 1] > lim + 1e-6 {
                        pos[n - 1] = lim;
                        for i in (0..n - 1).rev() {
                            pos[i] = pos[i].min(prev_off(pos[i + 1], gap));
                        }
                        if pos[0] < -lim - 1e-6 {
                            return None;
                        }
                    }
                    Some(pos)
                };
                let gap_req = (1..n).fold(MIN_PORT_GAP, |g, i| g.max(pair_gap(i - 1, i)));
                place(gap_req).unwrap_or_else(|| {
                    // Degree too high even with curvature: binary-search the largest gap that fits.
                    let (mut lo, mut hi) = (0.0, gap_req);
                    let mut best = place(0.0).unwrap();
                    for _ in 0..24 {
                        let mid = (lo + hi) / 2.0;
                        match place(mid) {
                            Some(p) => { best = p; lo = mid; }
                            None => { hi = mid; }
                        }
                    }
                    best
                })
            } else {
                // Bias each aim 30% toward centre (divergent edges don't park at corners), bounded
                // both ends. Per-pair stroke-aware gaps, scaled down uniformly if they can't fit.
                let mut gaps: Vec<f64> = (1..n).map(|i| pair_gap(i - 1, i)).collect();
                let total: f64 = gaps.iter().sum();
                if total > 2.0 * lim && total > 0.0 {
                    let scale = 2.0 * lim / total;
                    for gv in &mut gaps {
                        *gv *= scale;
                    }
                }
                let mut pos: Vec<f64> =
                    desired.iter().map(|d| (d * 0.7).clamp(-lim, lim)).collect();
                pos[0] = pos[0].max(-lim);
                for i in 1..n {
                    pos[i] = pos[i].max(pos[i - 1] + gaps[i - 1]);
                }
                if pos[n - 1] > lim {
                    pos[n - 1] = lim;
                    for i in (0..n - 1).rev() {
                        pos[i] = pos[i].min(pos[i + 1] - gaps[i]);
                    }
                }
                pos
            }
        };
        for (it, &off) in list.iter().zip(&offs) {
            port.insert((it.0, it.1), project_port(node, side, off, b));
        }
    }

    // Uncross parallel/anti-parallel bundles: two edges between the same node pair can get ports whose
    // segments cross. If swapping the ports at one shared endpoint uncrosses them, do it.
    let arc_pair: BTreeMap<usize, (usize, usize)> = chains
        .iter()
        .filter(|(_, c)| c.len() >= 2)
        .map(|(&a, c)| (a, (c[0], c[c.len() - 1])))
        .collect();
    let mut bundles: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
    for (&a, &(lo, hi)) in &arc_pair {
        bundles.entry((lo.min(hi), lo.max(hi))).or_default().push(a);
    }
    let seg_x = |p1: ((f64, f64), (f64, f64)), p2: ((f64, f64), (f64, f64))| -> bool {
        segments_cross(p1.0, p1.1, p2.0, p2.1)
    };
    for ((_, _), arcs) in bundles.iter().filter(|(_, v)| v.len() >= 2) {
        let mut sorted = arcs.clone();
        sorted.sort_unstable();
        for i in 0..sorted.len() {
            for j in i + 1..sorted.len() {
                let (a, b) = (sorted[i], sorted[j]);
                // The endpoint the two arcs share on the high side; swap ports there if it uncrosses.
                let (a_lo, a_hi) = arc_pair[&a];
                let (b_lo, b_hi) = arc_pair[&b];
                // Segment a: a's low-port -> a's high-port; likewise b.
                let seg = |arc: usize| -> ((f64, f64), (f64, f64)) {
                    (port[&(arc, true)].anchor, port[&(arc, false)].anchor)
                };
                if !seg_x(seg(a), seg(b)) {
                    continue;
                }
                // Uncross by swapping the two ports on a shared endpoint (same node + side). Handle all
                // four low/high pairings so an anti-parallel 2-cycle rides parallel lanes, not an X.
                let (ka, kb) = if a_hi == b_hi {
                    ((a, false), (b, false))
                } else if a_lo == b_lo {
                    ((a, true), (b, true))
                } else if a_lo == b_hi {
                    ((a, true), (b, false))
                } else if a_hi == b_lo {
                    ((a, false), (b, true))
                } else {
                    continue;
                };
                if port[&ka].side.index() == port[&kb].side.index() {
                    let (pa, pb) = (port[&ka], port[&kb]);
                    port.insert(ka, pb);
                    port.insert(kb, pa);
                }
            }
        }
    }

    // Channel alignment for multi-hop endpoint ports: a dummy channel sits at a fixed order coord; if
    // spreading put its facing port elsewhere, slide it onto the channel (on-span, unobstructed, full gap).
    {
        let on_side: Vec<((usize, bool), usize, u8)> = arc_ends
            .iter()
            .flat_map(|(&a, (s, t))| {
                [((a, true), s.node, s.side.index()), ((a, false), t.node, t.side.index())]
            })
            .collect();
        for (arc, chain) in ordered() {
            let m = chain.len();
            if m <= 2 {
                continue;
            }
            for (is_source, node, adj) in
                [(true, chain[0], chain[1]), (false, chain[m - 1], chain[m - 2])]
            {
                let p = port[&(arc, is_source)];
                if !p.side.horizontal() || radial(node) {
                    continue;
                }
                let (track, old) = (cy[adj], p.anchor.1);
                if (track - old).abs() < 0.5 || (track - cy[node]).abs() > ow[node] * 0.45 {
                    continue;
                }
                let ok = on_side.iter().all(|&(key, n2, s2)| {
                    if key == (arc, is_source) || n2 != node || s2 != p.side.index() {
                        return true;
                    }
                    let other = port[&key].anchor.1;
                    (other - track).abs() >= MIN_PORT_GAP
                        && ((other < old.min(track)) || (other > old.max(track)))
                });
                if ok {
                    port.insert((arc, is_source), project_port(node, p.side, track - cy[node], b));
                }
            }
        }
    }

    // Facing-port alignment for direct edges: two facing ports at slightly different order coords draw a
    // micro-dogleg; snap both onto one shared coord when a side can host it. Radial fans keep spread.
    {
        let on_side: Vec<((usize, bool), usize, u8)> = arc_ends
            .iter()
            .flat_map(|(&a, (s, t))| {
                [((a, true), s.node, s.side.index()), ((a, false), t.node, t.side.index())]
            })
            .collect();
        let t_of_arc = |a: usize| thickness.get(a).copied().unwrap_or(2.0);
        for (arc, chain) in ordered() {
            if chain.len() != 2 {
                continue;
            }
            let (s, t) = (port[&(arc, true)], port[&(arc, false)]);
            if !(s.side == Side::Right && t.side == Side::Left) {
                continue;
            }
            let (ys, yt) = (s.anchor.1, t.anchor.1);
            if (ys - yt).abs() < 0.5 || (ys - yt).abs() > 24.0 {
                continue;
            }
            let feasible = |node: usize, key: (usize, bool), side: Side, tgt: f64, old: f64| -> bool {
                if radial(node) || (tgt - cy[node]).abs() > ow[node] * 0.45 {
                    return false;
                }
                on_side.iter().all(|&(k2, n2, s2)| {
                    if k2 == key || n2 != node || s2 != side.index() {
                        return true;
                    }
                    let other = port[&k2].anchor.1;
                    let gap = MIN_PORT_GAP
                        .max((t_of_arc(arc) + t_of_arc(k2.0)) / 2.0 + PORT_STROKE_CLEAR);
                    (other - tgt).abs() >= gap
                        && ((other < old.min(tgt)) || (other > old.max(tgt)))
                })
            };
            let (s_node, t_node) = (chain[0], chain[1]);
            if feasible(t_node, (arc, false), t.side, ys, yt) {
                port.insert((arc, false), project_port(t_node, t.side, ys - cy[t_node], b));
            } else if feasible(s_node, (arc, true), s.side, yt, ys) {
                port.insert((arc, true), project_port(s_node, s.side, yt - cy[s_node], b));
            }
        }
    }

    // Cross-side port relaxation: ports from ADJACENT sides can land almost atop each other at a corner.
    // Per node, greedily nudge the closest too-close pair apart while it improves; channel-aligned stay.
    {
        const SEP: f64 = 10.0;
        const STEP: f64 = 3.0;
        // Endpoint key = (arc, is_source), paired with the border it sits on.
        type NodePorts = Vec<((usize, bool), Side)>;
        let mut by_node: BTreeMap<usize, NodePorts> = BTreeMap::new();
        for &arc in &arc_keys {
            let Some((s, t)) = arc_ends.get(&arc) else { continue };
            by_node.entry(s.node).or_default().push(((arc, true), s.side));
            by_node.entry(t.node).or_default().push(((arc, false), t.side));
        }
        let mut node_ids: Vec<usize> = by_node.keys().copied().collect();
        node_ids.sort_unstable();
        for node in node_ids {
            if radial(node) {
                continue; // radial fan already enforces an angular min gap on the outline
            }
            let entries = &by_node[&node];
            if entries.len() < 2 {
                continue;
            }
            let pinned: Vec<bool> = entries
                .iter()
                .map(|&((arc, is_source), side)| {
                    if !side.horizontal() {
                        return false;
                    }
                    let chain = &chains[&arc];
                    if chain.len() <= 2 {
                        return false;
                    }
                    let adj = if is_source { chain[1] } else { chain[chain.len() - 2] };
                    (cy[adj] - port[&(arc, is_source)].anchor.1).abs() < 0.75
                })
                .collect();
            let dist = |a: (f64, f64), c: (f64, f64)| (a.0 - c.0).hypot(a.1 - c.1);
            // Crowding potential: squared shortfall below SEP summed over all pairs, so several
            // simultaneously-bad pairs each pull on the descent instead of masking one another.
            let potential = |anch: &[(f64, f64)]| -> f64 {
                let mut p = 0.0;
                for i in 0..anch.len() {
                    for j in i + 1..anch.len() {
                        let short = (SEP - dist(anch[i], anch[j])).max(0.0);
                        p += short * short;
                    }
                }
                p
            };
            for _ in 0..48 {
                let anchors: Vec<(f64, f64)> =
                    entries.iter().map(|(k, _)| port[k].anchor).collect();
                let p0 = potential(&anchors);
                if p0 <= 1e-6 {
                    break;
                }
                // Best single +/-STEP move of any unpinned port.
                let mut best: Option<(usize, f64, f64)> = None; // (entry, new off, new potential)
                for (e, &(_, side)) in entries.iter().enumerate() {
                    if pinned[e] {
                        continue;
                    }
                    let horiz = side.horizontal();
                    let cur = if horiz { anchors[e].1 - cy[node] } else { anchors[e].0 - cx[node] };
                    let lim = (if horiz { ow[node] } else { lw[node] }) * 0.45;
                    // Long jumps let a port tunnel past a blocking neighbour instead of being
                    // walled in behind it (the potential is not unimodal along a border).
                    for dir in [-5.0 * STEP, -3.0 * STEP, -STEP, STEP, 3.0 * STEP, 5.0 * STEP] {
                        let o2 = (cur + dir).clamp(-lim, lim);
                        if (o2 - cur).abs() < 0.5 {
                            continue;
                        }
                        let mut trial = anchors.clone();
                        trial[e] = project_port(node, side, o2, b).anchor;
                        let p1 = potential(&trial);
                        if p1 < p0 - 1e-3 && best.is_none_or(|(_, _, bp)| p1 < bp) {
                            best = Some((e, o2, p1));
                        }
                    }
                }
                match best {
                    Some((e, o2, _)) => {
                        let (key, side) = entries[e];
                        port.insert(key, project_port(node, side, o2, b));
                    }
                    None => break,
                }
            }
        }
    }

    // Direct-edge port pairing: a facing-to-facing edge on different order lines draws a gutter Z; if
    // either port can slide onto the other's line (on-span, clearing every box), pair them straight.
    {
        let all_ports: Vec<((usize, bool), usize, u8)> = arc_ends
            .iter()
            .flat_map(|(&a, (s, t))| {
                [((a, true), s.node, s.side.index()), ((a, false), t.node, t.side.index())]
            })
            .collect();
        for (arc, chain) in ordered() {
            if chain.len() != 2 {
                continue;
            }
            let (lo, hi) = (chain[0], chain[1]);
            let (ps, pt) = (port[&(arc, true)], port[&(arc, false)]);
            if !ps.side.horizontal() || !pt.side.horizontal() {
                continue;
            }
            if (ps.anchor.1 - pt.anchor.1).abs() < 0.5 {
                continue;
            }
            for (is_source, node, y2) in [(true, lo, pt.anchor.1), (false, hi, ps.anchor.1)] {
                let p = port[&(arc, is_source)];
                let old = p.anchor.1;
                if radial(node) || (y2 - cy[node]).abs() > ow[node] * 0.45 {
                    continue;
                }
                // A lone port sits centred on its border; give up the centre only for a jog
                // that is a visible fraction of that border, not for a slight offset.
                let lone = all_ports
                    .iter()
                    .filter(|&&(_, n2, s2)| n2 == node && s2 == p.side.index())
                    .count()
                    == 1;
                if lone && (y2 - old).abs() <= ow[node] * 0.3 {
                    continue;
                }
                if seg_hits((cx[lo], y2), (cx[hi], y2), lo, hi) {
                    continue;
                }
                let trial = project_port(node, p.side, y2 - cy[node], b);
                let ok = all_ports.iter().all(|&(key, n2, s2)| {
                    if key == (arc, is_source) || n2 != node {
                        return true;
                    }
                    let q = port[&key];
                    if s2 == p.side.index() {
                        (q.anchor.1 - y2).abs() >= MIN_PORT_GAP
                            && ((q.anchor.1 < old.min(y2)) || (q.anchor.1 > old.max(y2)))
                    } else {
                        (q.anchor.0 - trial.anchor.0).hypot(q.anchor.1 - trial.anchor.1) >= 10.0
                    }
                });
                if ok {
                    port.insert((arc, is_source), trial);
                    break;
                }
            }
        }
    }

    // Multi-hop spine waypoints (source stub -> dummy centres -> target stub)
    let mut waypoints: BTreeMap<usize, Vec<(f64, f64)>> = BTreeMap::new();
    for (arc, chain) in ordered() {
        let m = chain.len();
        if m < 2 {
            continue;
        }
        let plo = port[&(arc, true)];
        let phi = port[&(arc, false)];
        let mut v = Vec::with_capacity(m);
        for (i, &node) in chain.iter().enumerate() {
            if i == 0 {
                v.push(plo.stub);
            } else if i == m - 1 {
                v.push(phi.stub);
            } else {
                v.push((cx[node], cy[node]));
            }
        }
        if m > 2 {
            let ys: Vec<f64> = v[1..m - 1].iter().map(|p| p.1).collect();
            let mono = monotone_project(&ys, v[m - 1].1 >= v[0].1);
            for (p, &y) in v[1..m - 1].iter_mut().zip(&mono) {
                p.1 = y;
            }
        }
        waypoints.insert(arc, v);
    }

    // Gutter lane assignment: each arc crossing a gutter gets its own vertical x-lane (by mid-height) so
    // parallels never coincide. Sized to every layer index so a last-layer waypoint can't over-index.
    let n_gutters = n_layers.max(1);
    let mut gutter_segs: Vec<Vec<(usize, f64)>> = (0..n_gutters).map(|_| vec![]).collect();
    for (arc, chain) in ordered() {
        if chain.len() < 2 {
            continue;
        }
        let v = &waypoints[&arc];
        for i in 0..chain.len() - 1 {
            let l = layer_of[chain[i]] as usize;
            gutter_segs[l].push((arc, (v[i].1 + v[i + 1].1) / 2.0));
        }
    }
    let mut lane: Vec<BTreeMap<usize, f64>> = (0..n_gutters).map(|_| BTreeMap::new()).collect();
    for (l, segs) in gutter_segs.iter_mut().enumerate() {
        segs.sort_by(|a, b| {
            a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0))
        });
        let k = segs.len();
        let gl = layer_x[l] + layer_half[l];
        let gr = if l + 1 < n_layers { layer_x[l + 1] - layer_half[l + 1] } else { gl + LAYER_GAP };
        for (i, &(arc, _)) in segs.iter().enumerate() {
            let f = (i as f64 + 1.0) / (k as f64 + 1.0);
            lane[l].insert(arc, gl + (gr - gl) * f);
        }
    }

    // Emit orthogonal polylines
    let hits = |p: (f64, f64), q: (f64, f64), s1: usize, s2: usize| -> bool {
        seg_hits_box(p, q, b, s1, s2)
    };
    let poly_hits = |pts: &[(f64, f64)], s1: usize, s2: usize| -> bool {
        pts.windows(2).any(|w| hits(w[0], w[1], s1, s2))
    };

    let mut routes: Vec<Vec<(f64, f64)>> = vec![vec![]; n_arcs];
    for (arc, chain) in ordered() {
        let m = chain.len();
        if m < 2 {
            continue;
        }
        let lo = chain[0];
        let hi = chain[m - 1];
        let ps = port[&(arc, true)];
        let pt = port[&(arc, false)];
        let lx = *lane[layer_of[lo] as usize].get(&arc).unwrap();

        if m == 2 {
            // Direct edge: pick the cleanest orthogonal path that clears other node boxes.
            let (a_s, s_s) = (ps.anchor, ps.stub);
            let (a_t, s_t) = (pt.anchor, pt.stub);
            let gutter = vec![a_s, s_s, (lx, s_s.1), (lx, s_t.1), s_t, a_t];
            let mut cands: Vec<Vec<(f64, f64)>> = vec![];
            // Flow style: prefer a straight diagonal port-to-port line (ELK look), used only when it
            // clears every node box; else fall through to the orthogonal candidates.
            if flow_edges {
                cands.push(vec![a_s, a_t]);
            }
            // The single-bend L; its corner depends on which side each endpoint leaves from.
            match (ps.side.horizontal(), pt.side.horizontal()) {
                (true, true) if (s_s.1 - s_t.1).abs() < 0.5 => cands.push(vec![a_s, s_s, s_t, a_t]),
                (true, true) => {}
                (true, false) => cands.push(vec![a_s, s_s, (s_t.0, s_s.1), s_t, a_t]),
                (false, _) => cands.push(vec![a_s, s_s, (s_s.0, s_t.1), s_t, a_t]),
            }
            let chosen = cands.into_iter().find(|c| !poly_hits(c, lo, hi)).unwrap_or(gutter);
            routes[arc] = simplify_collinear(chosen);
        } else if flow_edges && {
            // Flow style: diagonal into the dummy lane, straight down it, diagonal out (ELK long-edge
            // look). If an end diagonal clips a box, try one corner detour before the orthogonal staircase.
            let v = &waypoints[&arc];
            // Preferred: when the target is entered perpendicular, run the straight lane on the port's
            // own cross-position (single diagonal + straight drop), used only when it clears every box.
            let aligned = if side_port && pt.side.horizontal() {
                let lane_c = pt.anchor.1;
                let cand = simplify_collinear(vec![
                    ps.anchor,
                    (v[1].0, lane_c),
                    (v[m - 2].0, lane_c),
                    pt.anchor,
                ]);
                (!poly_hits(&cand, lo, hi)).then_some(cand)
            } else {
                None
            };
            if let Some(cand) = aligned {
                routes[arc] = cand;
                true
            } else {
            let head = flow_diag_fix(ps.anchor, v[1], b, lo, hi);
            let tail = flow_diag_fix(v[m - 2], pt.anchor, b, lo, hi);
            if let (Some(hd), Some(tl)) = (head, tail) {
                let mut pts = vec![ps.anchor];
                pts.extend(hd);
                pts.push(v[1]);
                pts.push(v[m - 2]);
                pts.extend(tl);
                pts.push(pt.anchor);
                let cand = simplify_collinear(pts);
                let ok = !poly_hits(&cand, lo, hi);
                if ok {
                    routes[arc] = cand;
                }
                ok
            } else {
                false
            }
            }
        } {
            // handled above
        } else {
            // Long edge: staircase through the dummy channel via gutter lanes (separated risers -> 0
            // crossings). A perp source drops straight down its column into the channel first.
            let v = &waypoints[&arc];
            let mut pts: Vec<(f64, f64)> = vec![ps.anchor, v[0]];
            if !ps.side.horizontal() {
                pts.push((v[0].0, v[1].1));
            }
            for i in 0..m - 1 {
                let l = layer_of[chain[i]] as usize;
                let last_perp = i == m - 2 && !pt.side.horizontal();
                let glx = if last_perp { v[m - 1].0 } else { *lane[l].get(&arc).unwrap() };
                let cur_y = pts.last().unwrap().1;
                let y_there = v[i + 1].1;
                if (glx - pts.last().unwrap().0).abs() > 0.5 {
                    pts.push((glx, cur_y));
                }
                if (y_there - cur_y).abs() > 0.5 {
                    pts.push((glx, y_there));
                }
            }
            if !pt.side.horizontal() {
                let last = *pts.last().unwrap();
                if (last.0 - v[m - 1].0).abs() > 0.5 {
                    pts.push((v[m - 1].0, last.1));
                }
            }
            pts.push(v[m - 1]);
            pts.push(pt.anchor);
            routes[arc] = simplify_collinear(pts);
        }
    }
    for (arc, chain) in ordered() {
        if chain.len() < 2 {
            continue;
        }
        let (hy, ty) = (port[&(arc, true)].side.horizontal(), port[&(arc, false)].side.horizontal());
        snap_endpoint_jogs(&mut routes[arc], hy, ty);
    }
    nest_parallel_bundle_channels(&mut routes, chains, cy);
    separate_horizontal_overlaps(&mut routes);
    routes
}

/// Uncross a parallel long-edge bundle at its shared target: if the outer channel turns before the
/// inner one, keep it in its channel past the inner channel's end (nesting the two turns).
fn nest_parallel_bundle_channels(
    routes: &mut [Vec<(f64, f64)>],
    chains: &BTreeMap<usize, Vec<usize>>,
    cy: &[f64],
) {
    // Longest axis-aligned run along the layer axis = the edge's channel. Returns its downstream
    // corner index (larger layer coord), the channel's order coord, and that corner's layer coord.
    let channel = |r: &[(f64, f64)]| -> Option<(usize, f64, f64)> {
        let mut best: Option<(usize, f64)> = None; // (corner index, run length)
        for i in 0..r.len().saturating_sub(1) {
            let (dx, dy) = ((r[i + 1].0 - r[i].0).abs(), (r[i + 1].1 - r[i].1).abs());
            if dy < 1.0 && dx > best.map_or(1.0, |(_, l)| l) {
                let corner = if r[i + 1].0 >= r[i].0 { i + 1 } else { i };
                best = Some((corner, dx));
            }
        }
        best.map(|(c, _)| (c, r[c].1, r[c].0))
    };
    let crosses = |a: &[(f64, f64)], b: &[(f64, f64)]| -> bool {
        for wa in a.windows(2) {
            for wb in b.windows(2) {
                let (p1, p2, p3, p4) = (wa[0], wa[1], wb[0], wb[1]);
                if p1 == p3 || p1 == p4 || p2 == p3 || p2 == p4 {
                    continue;
                }
                if segments_cross(p1, p2, p3, p4) {
                    return true;
                }
            }
        }
        false
    };
    const GAP: f64 = 12.0;
    let mut bundles: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
    for (&arc, c) in chains {
        if c.len() > 2 {
            let (lo, hi) = (c[0], c[c.len() - 1]);
            bundles.entry((lo.min(hi), lo.max(hi))).or_default().push(arc);
        }
    }
    for (&(_, hi), arcs) in bundles.iter().filter(|(_, v)| v.len() >= 2) {
        let target_order = cy[hi];
        let mut sorted = arcs.clone();
        sorted.sort_unstable();
        for i in 0..sorted.len() {
            for j in i + 1..sorted.len() {
                let (a, b) = (sorted[i], sorted[j]);
                if !crosses(&routes[a], &routes[b]) {
                    continue;
                }
                let (Some((ca, ord_a, endx_a)), Some((cb, ord_b, endx_b))) =
                    (channel(&routes[a]), channel(&routes[b]))
                else {
                    continue;
                };
                // Outer = channel farther (in order) from the target; it must turn last (deepest).
                let (outer, oc, oend, iend) = if (ord_a - target_order).abs() >= (ord_b - target_order).abs() {
                    (a, ca, endx_a, endx_b)
                } else {
                    (b, cb, endx_b, endx_a)
                };
                if oend >= iend {
                    continue; // already nested
                }
                // Keep the turn shy of the target so the final approach still has room.
                let target_x = routes[outer].last().map_or(oend, |p| p.0);
                let new_x = (iend + GAP).min(target_x - 1.0);
                if new_x <= oend {
                    continue;
                }
                // Slide the channel's downstream corner and the cross-lane run that starts at it
                // (points sharing the old end layer coord) out to `new_x`.
                let old = routes[outer][oc].0;
                for p in routes[outer].iter_mut().skip(oc) {
                    if (p.0 - old).abs() < 0.5 {
                        p.0 = new_x;
                    } else {
                        break;
                    }
                }
            }
        }
    }
}

/// Straighten a tiny port jog: slide an endpoint's anchor+stub along its border onto the edge's main
/// track. `head_along_y`/`tail_along_y` say which axis the border runs along (snap only ALONG it).
fn snap_endpoint_jogs(route: &mut Vec<(f64, f64)>, head_along_y: bool, tail_along_y: bool) {
    const SNAP: f64 = 6.0;
    const MIN_TRACK: f64 = 25.0;
    if route.len() < 3 {
        return;
    }
    // Snap the run at one end onto the track set by the first long segment from that end.
    // `head`: work forward from route[0]; else backward from route[n-1].
    let snap_one = |route: &mut [(f64, f64)], head: bool, along_y: bool| {
        let n = route.len();
        let anchor = if head { route[0] } else { route[n - 1] };
        let ks: Vec<usize> = if head { (0..n - 1).collect() } else { (1..n).rev().collect() };
        for k in ks {
            let (p, q) = if head { (route[k], route[k + 1]) } else { (route[k - 1], route[k]) };
            if (p.0 - q.0).hypot(p.1 - q.1) < MIN_TRACK {
                continue;
            }
            let range = if head { 0..=k } else { k..=n - 1 };
            // A horizontal track slides the run in y, a vertical one in x; each legal only when that
            // axis runs along the endpoint's border (axis-aligned and mutually exclusive).
            if along_y
                && (p.1 - q.1).abs() < 0.5
                && (anchor.1 - p.1).abs() > 0.5
                && (anchor.1 - p.1).abs() < SNAP
            {
                for pt in &mut route[range] {
                    pt.1 = p.1;
                }
            } else if !along_y
                && (p.0 - q.0).abs() < 0.5
                && (anchor.0 - p.0).abs() > 0.5
                && (anchor.0 - p.0).abs() < SNAP
            {
                for pt in &mut route[range] {
                    pt.0 = p.0;
                }
            }
            break;
        }
    };
    snap_one(route, true, head_along_y);
    snap_one(route, false, tail_along_y);
    *route = simplify_collinear(std::mem::take(route));
}

/// Nudge apart long horizontal runs from different edges sharing (nearly) the same y and
/// overlapping in x - the horizontal analogue of gutter lanes. Each pass shifts one run a step.
fn separate_horizontal_overlaps(routes: &mut [Vec<(f64, f64)>]) {
    const STEP: f64 = 8.0;
    for _ in 0..8 {
        // Collect long horizontal segments: (arc, vertex i, y, x-lo, x-hi).
        let mut segs: Vec<(usize, usize, f64, f64, f64)> = vec![];
        for (a, r) in routes.iter().enumerate() {
            for i in 0..r.len().saturating_sub(1) {
                if (r[i].1 - r[i + 1].1).abs() < 1.0 {
                    let (x0, x1) = (r[i].0.min(r[i + 1].0), r[i].0.max(r[i + 1].0));
                    if x1 - x0 > 6.0 {
                        segs.push((a, i, r[i].1, x0, x1));
                    }
                }
            }
        }
        let mut hit: Option<(usize, usize, f64)> = None;
        'scan: for p in 0..segs.len() {
            for q in p + 1..segs.len() {
                let (ap, ip, yp, x0p, x1p) = segs[p];
                let (aq, iq, yq, x0q, x1q) = segs[q];
                if ap == aq {
                    continue;
                }
                if (yp - yq).abs() < 2.5 && x0p.max(x0q) < x1p.min(x1q) - 6.0 {
                    // Nudge the higher-index arc's run away from the other.
                    let (a, i, dir) = if aq > ap {
                        (aq, iq, if yq >= yp { 1.0 } else { -1.0 })
                    } else {
                        (ap, ip, if yp >= yq { 1.0 } else { -1.0 })
                    };
                    hit = Some((a, i, dir));
                    break 'scan;
                }
            }
        }
        match hit {
            Some((a, i, dir)) => {
                routes[a][i].1 += dir * STEP;
                routes[a][i + 1].1 += dir * STEP;
            }
            None => break,
        }
    }
}

/// Project a sequence onto the nearest monotone (non-decreasing if `increasing`, else non-increasing)
/// sequence so a track never doubles back. Averages the forward and backward monotone envelopes.
fn monotone_project(ys: &[f64], increasing: bool) -> Vec<f64> {
    let n = ys.len();
    if n == 0 {
        return vec![];
    }
    let s: Vec<f64> = if increasing { ys.to_vec() } else { ys.iter().map(|y| -y).collect() };
    // Forward: non-decreasing lower envelope.
    let mut fwd = s.clone();
    for i in 1..n {
        if fwd[i] < fwd[i - 1] {
            fwd[i] = fwd[i - 1];
        }
    }
    // Backward: non-decreasing upper envelope.
    let mut bwd = s.clone();
    for i in (0..n - 1).rev() {
        if bwd[i] > bwd[i + 1] {
            bwd[i] = bwd[i + 1];
        }
    }
    (0..n)
        .map(|i| {
            let v = (fwd[i] + bwd[i]) / 2.0;
            if increasing { v } else { -v }
        })
        .collect()
}

/// Drop redundant vertices: coincident points and any point that lies on the straight
/// line between its neighbours (so a run of collinear steps becomes one segment).
fn simplify_collinear(pts: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    let mut dd: Vec<(f64, f64)> = Vec::with_capacity(pts.len());
    for p in pts {
        if dd.last().is_none_or(|q: &(f64, f64)| (p.0 - q.0).abs() > 0.5 || (p.1 - q.1).abs() > 0.5) {
            dd.push(p);
        }
    }
    if dd.len() <= 2 {
        return dd;
    }
    let mut out: Vec<(f64, f64)> = vec![dd[0]];
    for i in 1..dd.len() - 1 {
        let (a, b, c) = (*out.last().unwrap(), dd[i], dd[i + 1]);
        let cross = (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0);
        if cross.abs() > 1.0 {
            out.push(b); // b is a real corner
        }
    }
    out.push(*dd.last().unwrap());
    out
}

/// For each arc, the chain of internal node indices (layer-ascending) it passes
/// through, including source, dummies, and target.
fn build_edge_chains(g: &Graph, layer_of: &[i32]) -> BTreeMap<usize, Vec<usize>> {
    let mut segs: BTreeMap<usize, Vec<(i32, usize, usize)>> = BTreeMap::new();
    for &(from, to, arc_idx, _) in &g.edges {
        segs.entry(arc_idx).or_default().push((layer_of[from], from, to));
    }
    let mut result: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for (arc_idx, mut chain) in segs {
        chain.sort_by_key(|&(l, _, _)| l);
        let mut nodes: Vec<usize> = vec![];
        for (i, &(_, from, to)) in chain.iter().enumerate() {
            if i == 0 {
                nodes.push(from);
            }
            nodes.push(to);
        }
        result.insert(arc_idx, nodes);
    }
    result
}

// Generic engine

/// Run the full Sugiyama pipeline on a [`LayeredInput`], returning node centres and orthogonal edge
/// routes in final SVG coords. Runs in flow space (layers left->right); TB transposes `(x,y)->(y,x)`.
pub fn layout_layered(input: &LayeredInput) -> LayeredOutput {
    let n_in = input.nodes.len();
    if n_in == 0 {
        return LayeredOutput { centers: vec![], routes: vec![] };
    }
    layout_layered_inner(input)
}

/// Daylight kept between the strokes of two lanes inside one parallel-arc bundle.
const LANE_GAP: f64 = 8.0;

/// Collapse same-direction parallel arcs into one edge (weights summed, corridor width reserved),
/// route once, then expand into per-arc offset lanes re-projected onto the outline. `None` if no bundle.
fn bundle_parallel_arcs(input: &LayeredInput) -> Option<LayeredOutput> {
    let n_arcs = input.edges.len();
    let mut of_pair: BTreeMap<(usize, usize), usize> = BTreeMap::new();
    let mut bundles: Vec<Vec<usize>> = vec![];
    for (arc, &(a, b)) in input.edges.iter().enumerate() {
        let idx = *of_pair.entry((a, b)).or_insert_with(|| {
            bundles.push(vec![]);
            bundles.len() - 1
        });
        bundles[idx].push(arc);
    }
    if bundles.iter().all(|b| b.len() < 2) {
        return None;
    }

    let t_of =
        |arc: usize| if input.thickness.len() == n_arcs { input.thickness[arc] } else { 2.0 };
    let w_of = |arc: usize| if input.weights.len() == n_arcs { input.weights[arc] } else { 1.0 };

    // Per-arc lane offset (centred around the bundle route) + per-bundle corridor width.
    let mut lane_off: Vec<f64> = vec![0.0; n_arcs];
    let mut corridor: Vec<f64> = Vec::with_capacity(bundles.len());
    for arcs in &bundles {
        let mut pos = vec![0.0f64; arcs.len()];
        for i in 1..arcs.len() {
            pos[i] = pos[i - 1] + (t_of(arcs[i - 1]) + t_of(arcs[i])) / 2.0 + LANE_GAP;
        }
        let span = pos[arcs.len() - 1];
        for (i, &arc) in arcs.iter().enumerate() {
            lane_off[arc] = pos[i] - span / 2.0;
        }
        corridor.push(span + (t_of(arcs[0]) + t_of(arcs[arcs.len() - 1])) / 2.0);
    }

    let b_edges: Vec<(usize, usize)> = bundles.iter().map(|arcs| input.edges[arcs[0]]).collect();
    let b_weights: Vec<f64> =
        bundles.iter().map(|arcs| arcs.iter().map(|&a| w_of(a)).sum()).collect();
    let b_labels: Vec<(f64, f64)> = if input.edge_label_sizes.len() == n_arcs {
        bundles
            .iter()
            .map(|arcs| {
                arcs.iter().fold((0.0f64, 0.0f64), |(w, h), &a| {
                    let (aw, ah) = input.edge_label_sizes[a];
                    (w.max(aw), h.max(ah))
                })
            })
            .collect()
    } else {
        vec![]
    };
    let bundled = LayeredInput {
        nodes: input.nodes.clone(),
        edges: b_edges,
        weights: b_weights,
        thickness: corridor,
        direction: input.direction,
        flow_edges: input.flow_edges,
        flow_diagonal: input.flow_diagonal,
        edge_label_sizes: b_labels,
        seed: input.seed.clone(),
        pinned: input.pinned.clone(),
    };
    let out = layout_layered_inner(&bundled);

    let routes: Vec<Vec<(f64, f64)>> = (0..n_arcs)
        .map(|arc| {
            let bl = of_pair[&input.edges[arc]];
            let route = &out.routes[bl];
            if route.len() < 2 || lane_off[arc] == 0.0 {
                return route.clone();
            }
            let (from, to) = input.edges[arc];
            offset_route(route, lane_off[arc], &out.centers, &input.nodes, from, to)
        })
        .collect();
    Some(LayeredOutput { centers: out.centers, routes })
}

/// Intersection of two infinite lines, each given by two points. `None` when (near-)parallel.
fn intersect_lines(
    l1: ((f64, f64), (f64, f64)),
    l2: ((f64, f64), (f64, f64)),
) -> Option<(f64, f64)> {
    let (p, p2) = l1;
    let (q, q2) = l2;
    let r = (p2.0 - p.0, p2.1 - p.1);
    let s = (q2.0 - q.0, q2.1 - q.1);
    let denom = r.0 * s.1 - r.1 * s.0;
    if denom.abs() < 1e-9 {
        return None;
    }
    let t = ((q.0 - p.0) * s.1 - (q.1 - p.1) * s.0) / denom;
    Some((p.0 + t * r.0, p.1 + t * r.1))
}

/// Move `end` along the `inner`->`end` line onto the outline of the node centred at `c`, so an offset
/// lane still ends exactly on the border. `None` when the line misses the node (caller keeps the point).
fn project_onto_outline(
    end: (f64, f64),
    inner: (f64, f64),
    c: (f64, f64),
    node: &LayeredInputNode,
) -> Option<(f64, f64)> {
    let (hw, hh) = (node.width / 2.0, node.height / 2.0);
    let d = (end.0 - inner.0, end.1 - inner.1);
    let len = d.0.hypot(d.1);
    if len < 1e-9 {
        return None;
    }
    let dir = (d.0 / len, d.1 / len);
    match node.shape {
        NodeShape::Ellipse => {
            // Solve |((inner + t.dir) - c) (empty) (hw, hh)|^2 = 1 for t (measured from `inner`).
            let ox = (inner.0 - c.0) / hw;
            let oy = (inner.1 - c.1) / hh;
            let dx = dir.0 / hw;
            let dy = dir.1 / hh;
            let a = dx * dx + dy * dy;
            let b = 2.0 * (ox * dx + oy * dy);
            let cc = ox * ox + oy * oy - 1.0;
            let disc = b * b - 4.0 * a * cc;
            if disc < 0.0 || a.abs() < 1e-12 {
                return None;
            }
            let sq = disc.sqrt();
            let (t1, t2) = ((-b - sq) / (2.0 * a), (-b + sq) / (2.0 * a));
            let t = if (t1 - len).abs() <= (t2 - len).abs() { t1 } else { t2 };
            Some((inner.0 + t * dir.0, inner.1 + t * dir.1))
        }
        NodeShape::Box => {
            let mut best: Option<((f64, f64), f64)> = None;
            for (coord, vertical) in
                [(c.0 - hw, true), (c.0 + hw, true), (c.1 - hh, false), (c.1 + hh, false)]
            {
                let (o, dd, cross_o, cross_d, span_c, span_h) = if vertical {
                    (inner.0, dir.0, inner.1, dir.1, c.1, hh)
                } else {
                    (inner.1, dir.1, inner.0, dir.0, c.0, hw)
                };
                if dd.abs() < 1e-9 {
                    continue;
                }
                let t = (coord - o) / dd;
                let along = cross_o + t * cross_d;
                if (along - span_c).abs() > span_h + 0.5 {
                    continue;
                }
                let p = (inner.0 + t * dir.0, inner.1 + t * dir.1);
                let dist = (p.0 - end.0).hypot(p.1 - end.1);
                if best.is_none_or(|(_, bd)| dist < bd) {
                    best = Some((p, dist));
                }
            }
            best.map(|(p, _)| p)
        }
    }
}

/// Shift a routed polyline laterally by `d` (positive = right of travel), miter-joining interior
/// corners at offset-line intersections and re-projecting both endpoints onto the node outlines.
fn offset_route(
    route: &[(f64, f64)],
    d: f64,
    centers: &[(f64, f64)],
    nodes: &[LayeredInputNode],
    from: usize,
    to: usize,
) -> Vec<(f64, f64)> {
    let mut pts: Vec<(f64, f64)> = Vec::with_capacity(route.len());
    for &p in route {
        if pts.last().is_none_or(|&q: &(f64, f64)| (p.0 - q.0).hypot(p.1 - q.1) > 1e-6) {
            pts.push(p);
        }
    }
    if pts.len() < 2 {
        return route.to_vec();
    }
    let n = pts.len();
    let seg: Vec<((f64, f64), (f64, f64))> = (0..n - 1)
        .map(|i| {
            let (ax, ay) = pts[i];
            let (bx, by) = pts[i + 1];
            let len = (bx - ax).hypot(by - ay);
            let (nx, ny) = (-(by - ay) / len, (bx - ax) / len);
            ((ax + nx * d, ay + ny * d), (bx + nx * d, by + ny * d))
        })
        .collect();
    let mut out: Vec<(f64, f64)> = Vec::with_capacity(n);
    out.push(seg[0].0);
    for i in 1..n - 1 {
        out.push(intersect_lines(seg[i - 1], seg[i]).unwrap_or(seg[i].0));
    }
    out.push(seg[n - 2].1);
    if let Some(p) = project_onto_outline(out[0], out[1], centers[from], &nodes[from]) {
        out[0] = p;
    }
    let last = out.len() - 1;
    if let Some(p) = project_onto_outline(out[last], out[last - 1], centers[to], &nodes[to]) {
        out[last] = p;
    }
    out
}

/// Route edges for the current style. Diagonal flow: route with and without side-port, reverting each
/// edge to plain only where side-port adds crossings. Otherwise plain orthogonal routing.
fn route_with_sideport_guard(
    input: &LayeredInput,
    layers: &[Vec<usize>],
    layer: &[i32],
    boxes: &Boxes,
    chains: &BTreeMap<usize, Vec<usize>>,
    thickness: &[f64],
) -> Vec<Vec<(f64, f64)>> {
    if input.flow_edges && input.flow_diagonal {
        let with = route_edges(input.edges.len(), layers, layer, boxes, chains, thickness, true, true);
        let plain = route_edges(input.edges.len(), layers, layer, boxes, chains, thickness, true, false);
        let mut routes = with;
        for arc in 0..routes.len() {
            if routes[arc] == plain[arc] {
                continue;
            }
            let side_c = arc_crossings(&routes, arc);
            let prev = std::mem::replace(&mut routes[arc], plain[arc].clone());
            if arc_crossings(&routes, arc) >= side_c {
                routes[arc] = prev; // plain is no better -> keep the side-port variant
            }
        }
        routes
    } else {
        route_edges(input.edges.len(), layers, layer, boxes, chains, thickness, false, false)
    }
}

fn layout_layered_inner(input: &LayeredInput) -> LayeredOutput {
    let n_in = input.nodes.len();
    if n_in == 0 {
        return LayeredOutput { centers: vec![], routes: vec![] };
    }

    // Parallel-arc bundling: arcs sharing the same (from, to) are laid out as ONE edge (weights summed,
    // corridor reserved), routed once, emitted as parallel offset lanes; routing independently scatters.
    if let Some(out) = bundle_parallel_arcs(input) {
        return out;
    }

    // Edgeless nodes carry no layering info and pile into one column. Lay out only connected nodes,
    // then pack the isolated ones into a compact grid below.
    let mut degree = vec![0usize; n_in];
    for &(a, b) in &input.edges {
        degree[a] += 1;
        degree[b] += 1;
    }
    let isolated: Vec<usize> = (0..n_in).filter(|&i| degree[i] == 0).collect();
    if !isolated.is_empty() && isolated.len() < n_in {
        let active: Vec<usize> = (0..n_in).filter(|&i| degree[i] > 0).collect();
        let remap: BTreeMap<usize, usize> =
            active.iter().enumerate().map(|(new, &old)| (old, new)).collect();
        let sub = LayeredInput {
            nodes: active
                .iter()
                .map(|&i| LayeredInputNode {
                    width: input.nodes[i].width,
                    height: input.nodes[i].height,
                    shape: input.nodes[i].shape,
                    constraint: input.nodes[i].constraint,
                    category: input.nodes[i].category,
                    clear_after: input.nodes[i].clear_after,
                })
                .collect(),
            edges: input.edges.iter().map(|&(a, b)| (remap[&a], remap[&b])).collect(),
            weights: input.weights.clone(),
            thickness: input.thickness.clone(),
            direction: input.direction,
            flow_diagonal: input.flow_diagonal,
            flow_edges: input.flow_edges,
            edge_label_sizes: input.edge_label_sizes.clone(),
            seed: if input.seed.is_empty() {
                vec![]
            } else {
                active.iter().map(|&i| input.seed[i]).collect()
            },
            pinned: if input.pinned.is_empty() {
                vec![]
            } else {
                active.iter().map(|&i| input.pinned[i]).collect()
            },
        };
        let sub_out = layout_layered_inner(&sub);
        let mut centers = vec![(0.0, 0.0); n_in];
        let (mut min_x, mut max_x, mut max_y) = (f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        for (new, &old) in active.iter().enumerate() {
            centers[old] = sub_out.centers[new];
            let (hw, hh) = (input.nodes[old].width / 2.0, input.nodes[old].height / 2.0);
            min_x = min_x.min(centers[old].0 - hw);
            max_x = max_x.max(centers[old].0 + hw);
            max_y = max_y.max(centers[old].1 + hh);
        }
        if !min_x.is_finite() {
            (min_x, max_x, max_y) = (0.0, 0.0, 0.0);
        }
        // Grid the isolated nodes below the connected layout - square-ish, and at least as wide
        // as the connected layout, so they never stack into a tall single column.
        let cell = isolated.iter().map(|&i| input.nodes[i].width.max(input.nodes[i].height)).fold(0.0, f64::max) + NODE_GAP;
        let by_area = (isolated.len() as f64).sqrt().ceil() as usize;
        let by_width = ((max_x - min_x) / cell).floor() as usize;
        let cols = by_area.max(by_width).clamp(1, isolated.len().max(1));
        let top = max_y + NODE_GAP + cell / 2.0;
        for (k, &node) in isolated.iter().enumerate() {
            let (r, c) = (k / cols, k % cols);
            centers[node] = (min_x + cell / 2.0 + c as f64 * cell, top + r as f64 * cell);
        }
        return LayeredOutput { centers, routes: sub_out.routes };
    }

    let tb = input.direction == Direction::TopBottom;

    // Canonical extents: `lw` = size along the layer axis (x), `ow` = along the order axis (y).
    let lw_in: Vec<f64> = input.nodes.iter().map(|nd| if tb { nd.height } else { nd.width }).collect();
    let ow_in: Vec<f64> = input.nodes.iter().map(|nd| if tb { nd.width } else { nd.height }).collect();
    let ellipse_in: Vec<bool> = input.nodes.iter().map(|nd| nd.shape == NodeShape::Ellipse).collect();
    let constraints: Vec<Option<LayerConstraint>> = input.nodes.iter().map(|nd| nd.constraint).collect();

    // Per-edge-index importance (looked up via a graph edge's arc_index). Empty => uniform 1.0,
    // which makes every weighted step below reduce exactly to its unweighted form.
    let arc_weight: Vec<f64> = if input.weights.len() == input.edges.len() {
        input.weights.clone()
    } else {
        vec![1.0; input.edges.len()]
    };

    // Build internal graph (real nodes marked Transition as a neutral non-dummy kind).
    let mut g = Graph::new();
    for _ in 0..n_in {
        g.add_node(InternalKind::Real);
    }
    for (arc_idx, &(from, to)) in input.edges.iter().enumerate() {
        g.add_edge(from, to, arc_idx, false);
    }

    break_cycles(&mut g, &arc_weight);
    let layer = assign_layers(&g, &constraints, &arc_weight);
    let ExpandedGraph { g, layer } = insert_dummies(g, layer);

    let n_layers = (*layer.iter().max().unwrap_or(&0) + 1) as usize;
    let mut layers: Vec<Vec<usize>> = vec![vec![]; n_layers];
    for i in 0..g.n {
        layers[layer[i] as usize].push(i);
    }
    crossing_minimization(&mut layers, &g, &arc_weight);

    // Hold each object-type/category in a consistent lane where it's free (never adds crossings).
    let node_category: Vec<Option<u32>> =
        (0..g.n).map(|i| if i < n_in { input.nodes[i].category } else { None }).collect();
    category_consistency_pass(&mut layers, &g, &node_category);

    // Per-internal-node box extents (dummies -> 0).
    let is_dummy: Vec<bool> = (0..g.n).map(|i| g.kind[i] == InternalKind::Dummy).collect();
    let mut lw: Vec<f64> = (0..g.n).map(|i| if i < n_in { lw_in[i] } else { 0.0 }).collect();
    let mut ow: Vec<f64> = (0..g.n).map(|i| if i < n_in { ow_in[i] } else { 0.0 }).collect();
    let ellipse: Vec<bool> = (0..g.n).map(|i| i < n_in && ellipse_in[i]).collect();
    // Positive-order-side clearance per internal node (dummies reserve nothing).
    let clear: Vec<f64> =
        (0..g.n).map(|i| if i < n_in { input.nodes[i].clear_after.max(0.0) } else { 0.0 }).collect();
    // Per-edge drawn stroke width (looked up via arc index). Empty => uniform 2.0.
    let thickness: Vec<f64> = if input.thickness.len() == input.edges.len() {
        input.thickness.clone()
    } else {
        vec![2.0; input.edges.len()]
    };

    let chains = build_edge_chains(&g, &layer);

    // Reserve edge-label space on each labelled edge's middle dummy: giving the dummy the label's
    // extents makes `sep`/`assign_x_positions` widen the layout there. Only multi-layer edges.
    if !input.edge_label_sizes.is_empty() {
        for (&arc, chain) in &chains {
            let (w, h) = match input.edge_label_sizes.get(arc) {
                Some(&(w, h)) if w > 0.0 && h > 0.0 => (w, h),
                _ => continue,
            };
            let (lbl_lw, lbl_ow) = if tb { (h, w) } else { (w, h) };
            let mid_dummy = chain[1..chain.len().saturating_sub(1)]
                .iter()
                .copied()
                .filter(|&d| is_dummy[d])
                .collect::<Vec<_>>();
            if let Some(&d) = mid_dummy.get(mid_dummy.len() / 2) {
                lw[d] = lw[d].max(lbl_lw);
                ow[d] = ow[d].max(lbl_ow);
            }
        }
    }

    // Flow layouts (DFG) use tighter gaps for a compact, ELK-like composition; Petri keeps classic.
    let (layer_gap, node_gap) =
        if input.flow_edges { (64.0, 54.0) } else { (LAYER_GAP, NODE_GAP) };
    let mut cx = assign_x_positions(&layers, &lw, layer_gap);
    let mut cy = brandes_koepf(&layers, &layer, &g, &ow, &is_dummy, node_gap, &clear);
    let has_seed = input.seed.iter().take(n_in).any(Option::is_some);
    if has_seed {
        // Stable relayout: place each node at its seed (dragged node pinned) so un-dragged nodes stay
        // put; long-edge dummies still snap to a single lane.
        seeded_coords(&layers, &ow, &is_dummy, node_gap, &clear, tb, n_in, &input.seed, &input.pinned, &mut cy);
        // A pinned node holds its dropped position on BOTH axes (cross set above, layer here), floating
        // off its structural column. We do NOT re-layer, so only its own edges re-route.
        for i in 0..n_in {
            if input.pinned.get(i).copied().unwrap_or(false) {
                if let Some(&Some((sx, sy))) = input.seed.get(i) {
                    cx[i] = if tb { sy } else { sx };
                }
            }
        }
        straighten_long_edges(&chains, &layers, &layer, &is_dummy, &ow, &arc_weight, node_gap, &clear, &mut cy);
    } else {
        snap_align(&layers, &g, &arc_weight, &ow, &is_dummy, node_gap, &clear, &mut cy);
        straighten_long_edges(&chains, &layers, &layer, &is_dummy, &ow, &arc_weight, node_gap, &clear, &mut cy);
    }

    // Channel pull-in: a long edge's channel is clamped by its worst layer, exiling it far outside the
    // graph. Hop such dummies over the neighbouring real node toward the endpoint line when crossings hold.
    if !has_seed && input.flow_edges {
        for _ in 0..3 {
            let mut pos_in_layer = vec![0usize; g.n];
            for l in &layers {
                for (i, &v) in l.iter().enumerate() {
                    pos_in_layer[v] = i;
                }
            }
            let mut pred: Vec<Vec<usize>> = vec![vec![]; g.n];
            let mut succ: Vec<Vec<usize>> = vec![vec![]; g.n];
            for &(a, bb, _, _) in &g.edges {
                if a == bb {
                    continue;
                }
                let (up, dn) = if layer[a] < layer[bb] { (a, bb) } else { (bb, a) };
                pred[dn].push(up);
                succ[up].push(dn);
            }
            // Crossing change if u (lower order) and v swap, counted over one adjacency direction.
            let delta_one = |u: usize, v: usize, nbv: &[Vec<usize>], pos: &[usize]| -> i32 {
                let mut d = 0i32;
                for &nu in &nbv[u] {
                    for &nv in &nbv[v] {
                        if pos[nu] > pos[nv] {
                            d -= 1; // was crossing, swap uncrosses
                        } else if pos[nu] < pos[nv] {
                            d += 1;
                        }
                    }
                }
                d
            };
            let mut changed = false;
            for (_, chain) in chains.iter().filter(|(_, c)| c.len() >= 3) {
                let lane = (cy[chain[0]] + cy[chain[chain.len() - 1]]) / 2.0;
                for &d in &chain[1..chain.len() - 1] {
                    if !is_dummy[d] {
                        continue;
                    }
                    let l = layer[d] as usize;
                    let p = pos_in_layer[d];
                    let toward = lane - cy[d];
                    if toward.abs() < 1.0 {
                        continue;
                    }
                    let np = if toward < 0.0 { p.checked_sub(1) } else { Some(p + 1) };
                    let Some(np) = np.filter(|&np| np < layers[l].len()) else { continue };
                    let nb = layers[l][np];
                    // Hop only over real nodes standing between the dummy and its lane; dummy-dummy
                    // order encodes channel bundling and stays as the ordering pass left it.
                    if is_dummy[nb] {
                        continue;
                    }
                    if (cy[nb] - cy[d]).signum() != toward.signum() {
                        continue;
                    }
                    let (u, v) = if np < p { (nb, d) } else { (d, nb) };
                    if delta_one(u, v, &pred, &pos_in_layer) + delta_one(u, v, &succ, &pos_in_layer) > 0 {
                        continue;
                    }
                    layers[l].swap(p, np);
                    pos_in_layer[d] = np;
                    pos_in_layer[nb] = p;
                    changed = true;
                }
            }
            if !changed {
                break;
            }
            cy = brandes_koepf(&layers, &layer, &g, &ow, &is_dummy, node_gap, &clear);
            snap_align(&layers, &g, &arc_weight, &ow, &is_dummy, node_gap, &clear, &mut cy);
            straighten_long_edges(&chains, &layers, &layer, &is_dummy, &ow, &arc_weight, node_gap, &clear, &mut cy);
        }
    }

    // Centre the START/END terminals on the median cross-position of their neighbours so they sit
    // above/below the flow. DFG only (Petri is translation-invariant).
    if input.flow_edges {
        let mut nb: Vec<Vec<(usize, f64)>> = vec![vec![]; g.n];
        for &(a, b, arc, _) in &g.edges {
            if a != b {
                let w = arc_weight.get(arc).copied().unwrap_or(1.0);
                nb[a].push((b, w));
                nb[b].push((a, w));
            }
        }
        for i in 0..n_in {
            if constraints[i].is_some() && !nb[i].is_empty() {
                // Weighted median: the terminal sits over its dominant flow, not over whichever
                // neighbour happens to be the upper of an even-count plain median.
                let mut s: Vec<(f64, f64)> = nb[i].iter().map(|&(u, w)| (cy[u], w)).collect();
                cy[i] = weighted_median(&mut s);
            }
        }
    }

    let boxes = Boxes { cx, cy, layer_w: lw, order_w: ow, ellipse, n_real: n_in };

    let reversed: std::collections::BTreeSet<usize> = g
        .edges
        .iter()
        .filter(|&&(_, _, _, rev)| rev)
        .map(|&(_, _, arc, _)| arc)
        .collect();

    let flow = route_with_sideport_guard(input, &layers, &layer, &boxes, &chains, &thickness);

    let map = |p: (f64, f64)| -> (f64, f64) { if tb { (p.1, p.0) } else { p } };

    let centers: Vec<(f64, f64)> = (0..n_in).map(|i| map((boxes.cx[i], boxes.cy[i]))).collect();

    let routes: Vec<Vec<(f64, f64)>> = (0..input.edges.len())
        .map(|arc| {
            let mut pts = flow[arc].clone();
            if pts.len() < 2 {
                return vec![];
            }
            if reversed.contains(&arc) {
                pts.reverse();
            }
            pts.into_iter().map(map).collect()
        })
        .collect();

    LayeredOutput { centers, routes }
}

// Position-driven re-route (on-drop relayout)

/// Nearest order-coordinate to `x` outside every interval in `ivals` (obstacle order-extents). Merges
/// them; returns `x` if clear, else the nearer boundary of the merged interval containing it.
fn nearest_clear_lane(x: f64, ivals: &mut [(f64, f64)]) -> f64 {
    if ivals.is_empty() {
        return x;
    }
    ivals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut merged: Vec<(f64, f64)> = vec![];
    for &(a, b) in ivals.iter() {
        match merged.last_mut() {
            Some(last) if a <= last.1 => last.1 = last.1.max(b),
            _ => merged.push((a, b)),
        }
    }
    for &(a, b) in &merged {
        if x >= a && x <= b {
            return if x - a <= b - x { a } else { b };
        }
    }
    x
}

/// Re-route edges over the caller's FINAL node positions (seeds) instead of a fresh layout: rebuild
/// the grid from geometry, regenerate dummy chains, run only the router. Requires every node to seed.
pub fn reroute_from_positions(input: &LayeredInput) -> LayeredOutput {
    let n = input.nodes.len();
    if n == 0 {
        return LayeredOutput { centers: vec![], routes: vec![] };
    }
    let tb = input.direction == Direction::TopBottom;
    // Canonical flow space: cx = layer axis, cy = order axis. `map` transposes back for TB, so a
    // node's canonical layer coord is its SVG y under TB and its SVG x under LR.
    let mut cx = vec![0.0f64; n];
    let mut cy = vec![0.0f64; n];
    let mut lw = vec![0.0f64; n];
    let mut ow = vec![0.0f64; n];
    let mut ellipse = vec![false; n];
    for i in 0..n {
        let (sx, sy) = input.seed.get(i).and_then(|s| *s).unwrap_or((0.0, 0.0));
        cx[i] = if tb { sy } else { sx };
        cy[i] = if tb { sx } else { sy };
        lw[i] = if tb { input.nodes[i].height } else { input.nodes[i].width };
        ow[i] = if tb { input.nodes[i].width } else { input.nodes[i].height };
        ellipse[i] = input.nodes[i].shape == NodeShape::Ellipse;
    }

    // Cluster the layer axis into rows: open a new layer wherever consecutive boxes no longer overlap
    // on that axis (centre gap >= averaged extents). Parameter-free; a clear drop lands in its own row.
    let mut by_layer: Vec<usize> = (0..n).collect();
    by_layer.sort_by(|&a, &b| cx[a].partial_cmp(&cx[b]).unwrap_or(std::cmp::Ordering::Equal));
    let mut layer = vec![0i32; n];
    let mut cur = 0i32;
    for w in 1..n {
        let (a, b) = (by_layer[w - 1], by_layer[w]);
        if cx[b] - cx[a] >= 0.5 * (lw[a] + lw[b]) {
            cur += 1;
        }
        layer[b] = cur;
    }
    let n_layers = (cur + 1) as usize;

    // Orient every edge from its lower layer to its higher layer (equal => keep source->target); the
    // router emits layer-ascending, so a flipped arc's polyline is reversed on output.
    let mut g = Graph::new();
    for _ in 0..n {
        g.add_node(InternalKind::Real);
    }
    let mut reversed_arc = vec![false; input.edges.len()];
    for (arc, &(s, t)) in input.edges.iter().enumerate() {
        let (from, to, rev) = if layer[s] <= layer[t] { (s, t, false) } else { (t, s, true) };
        reversed_arc[arc] = rev;
        g.add_edge(from, to, arc, rev);
    }
    let ExpandedGraph { g, layer, .. } = insert_dummies(g, layer);
    let n_all = g.n;
    cx.resize(n_all, 0.0);
    cy.resize(n_all, 0.0);
    lw.resize(n_all, 0.0);
    ow.resize(n_all, 0.0);
    ellipse.resize(n_all, false);

    // Representative layer coord per row (mean of real members) - used only to place dummies and by
    // the router's gutter estimate; real-node ports still read each node's exact cx.
    let mut lay_sum = vec![0.0f64; n_layers];
    let mut lay_cnt = vec![0.0f64; n_layers];
    for i in 0..n {
        lay_sum[layer[i] as usize] += cx[i];
        lay_cnt[layer[i] as usize] += 1.0;
    }
    let lay_rep: Vec<f64> =
        (0..n_layers).map(|l| if lay_cnt[l] > 0.0 { lay_sum[l] / lay_cnt[l] } else { 0.0 }).collect();

    let chains = build_edge_chains(&g, &layer);
    // Dummy layer-axis coord = its row's representative; the order-axis coord is seeded from a straight-
    // line interpolation between the chain endpoints only to pick a within-layer order.
    for chain in chains.values() {
        if chain.len() < 3 {
            continue;
        }
        let (lo, hi) = (chain[0], chain[chain.len() - 1]);
        let span = cx[hi] - cx[lo];
        for &d in &chain[1..chain.len() - 1] {
            let l = layer[d] as usize;
            cx[d] = lay_rep[l];
            let frac = if span.abs() > 1e-6 { (lay_rep[l] - cx[lo]) / span } else { 0.0 };
            cy[d] = cy[lo] + (cy[hi] - cy[lo]) * frac;
        }
    }

    // Within-layer order: real nodes by dropped cross position, dummies by the interpolation seed.
    // On a tie the real sorts first, so a dummy sharing its lane is shoved clear by separation.
    let mut layers: Vec<Vec<usize>> = vec![vec![]; n_layers];
    for i in 0..n_all {
        layers[layer[i] as usize].push(i);
    }
    for l in &mut layers {
        l.sort_by(|&a, &b| cy[a].partial_cmp(&cy[b]).unwrap_or(std::cmp::Ordering::Equal));
    }

    // Cross-axis placement via the fresh layout's machinery (NOT naive interpolation, which rakes
    // waypoints through skipped boxes): Brandes-Kopf warm start, `seeded_coords` pins reals, straighten.
    let is_dummy: Vec<bool> = (0..n_all).map(|i| i >= n).collect();
    let arc_weight: Vec<f64> = if input.weights.len() == input.edges.len() {
        input.weights.clone()
    } else {
        vec![1.0; input.edges.len()]
    };
    let clear: Vec<f64> =
        (0..n_all).map(|i| if i < n { input.nodes[i].clear_after.max(0.0) } else { 0.0 }).collect();
    let node_gap = if input.flow_edges { 54.0 } else { NODE_GAP };
    let all_pinned = vec![true; n];
    cy = brandes_koepf(&layers, &layer, &g, &ow, &is_dummy, node_gap, &clear);
    seeded_coords(&layers, &ow, &is_dummy, node_gap, &clear, tb, n, &input.seed, &all_pinned, &mut cy);
    straighten_long_edges(&chains, &layers, &layer, &is_dummy, &ow, &arc_weight, node_gap, &clear, &mut cy);

    // Single clear lane per long chain (drag-robust): per-layer separation can zigzag a chain's dummies
    // onto opposite sides of intervening nodes, whose averaged lane rakes them. Snap all to ONE clear lane.
    for chain in chains.values() {
        if chain.len() < 3 {
            continue;
        }
        let (lo, hi) = (chain[0], chain[chain.len() - 1]);
        let dummies: Vec<usize> =
            chain[1..chain.len() - 1].iter().copied().filter(|&d| is_dummy[d]).collect();
        if dummies.is_empty() {
            continue;
        }
        let mut ys: Vec<f64> = dummies.iter().map(|&d| cy[d]).collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let desired = ys[ys.len() / 2];
        let mut intervals: Vec<(f64, f64)> = vec![];
        for &d in &dummies {
            for &r in &layers[layer[d] as usize] {
                if r < n && r != lo && r != hi {
                    let h = ow[r] / 2.0 + DUMMY_GAP;
                    intervals.push((cy[r] - h, cy[r] + h));
                }
            }
        }
        let lane = nearest_clear_lane(desired, &mut intervals);
        for &d in &dummies {
            cy[d] = lane;
        }
    }
    // Re-establish within-layer order after the lane snap so port spreading matches the new positions.
    for l in &mut layers {
        l.sort_by(|&a, &b| cy[a].partial_cmp(&cy[b]).unwrap_or(std::cmp::Ordering::Equal));
    }

    let thickness: Vec<f64> = if input.thickness.len() == input.edges.len() {
        input.thickness.clone()
    } else {
        vec![2.0; input.edges.len()]
    };
    let boxes = Boxes { cx, cy, layer_w: lw, order_w: ow, ellipse, n_real: n };

    // Same routing-style selection as the full pipeline (diagonal only when explicitly requested).
    let route_flow = input.flow_edges && input.flow_diagonal;
    let flow = route_with_sideport_guard(input, &layers, &layer, &boxes, &chains, &thickness);

    let map = |p: (f64, f64)| -> (f64, f64) { if tb { (p.1, p.0) } else { p } };
    let centers: Vec<(f64, f64)> = (0..n).map(|i| map((boxes.cx[i], boxes.cy[i]))).collect();
    let mut routes: Vec<Vec<(f64, f64)>> = (0..input.edges.len())
        .map(|arc| {
            let mut pts = flow[arc].clone();
            if pts.len() < 2 {
                return vec![];
            }
            if reversed_arc[arc] {
                pts.reverse();
            }
            pts.into_iter().map(map).collect()
        })
        .collect();

    // Orthogonal end-approach relief (reroute only): a dragged graph loses clean columns, so an arrowhead
    // can rake a node in the target's row. Re-attach it to a perp border (clean L), only if it adds no rake.
    if !route_flow {
        let box_of =
            |i: usize| (centers[i].0, centers[i].1, input.nodes[i].width / 2.0, input.nodes[i].height / 2.0);
        let seg_hits = |p: (f64, f64), q: (f64, f64), c: (f64, f64, f64, f64)| -> bool {
            let inset = 1.5;
            let (l, r, t, b) = (c.0 - c.2 + inset, c.0 + c.2 - inset, c.1 - c.3 + inset, c.1 + c.3 - inset);
            (0..=48).any(|k| {
                let f = k as f64 / 48.0;
                let (x, y) = (p.0 + (q.0 - p.0) * f, p.1 + (q.1 - p.1) * f);
                x > l && x < r && y > t && y < b
            })
        };
        let route_rakes = |pts: &[(f64, f64)], s: usize, t: usize| -> bool {
            pts.windows(2).any(|w| (0..n).any(|i| i != s && i != t && seg_hits(w[0], w[1], box_of(i))))
        };
        for (arc, &(s, t)) in input.edges.iter().enumerate() {
            let rlen = routes[arc].len();
            if rlen < 2 || !route_rakes(&routes[arc], s, t) {
                continue;
            }
            let (tcx, tcy, _, thh) = box_of(t);
            let lo = rlen.saturating_sub(4).max(1);
            for j in (lo..=rlen - 2).rev() {
                let a = routes[arc][j];
                let e = (tcx, if a.1 < tcy { tcy - thh } else { tcy + thh });
                let mut cand = routes[arc][..=j].to_vec();
                if (tcx - a.0).abs() > 1e-6 {
                    cand.push((tcx, a.1));
                }
                cand.push(e);
                if !route_rakes(&cand, s, t) {
                    routes[arc] = cand;
                    break;
                }
            }
        }
    }

    LayeredOutput { centers, routes }
}

