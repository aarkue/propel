//! Layout quality metrics - used by tests to objectively track routing/placement quality
//! and to catch regressions the eye would (bbox, crossings, coincident overlaps, edges
//! cutting through node boxes, edge<->node clearance, detours, bends, edge length).

type Pt = (f64, f64);
type Rect = (f64, f64, f64, f64); // (cx, cy, w, h)

/// Full geometry-quality suite. Tests assert the hard invariants (`overlaps`, `node_hits`);
/// the remaining fields are computed as a coherent set for ad-hoc geometry checks.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub struct LayoutMetrics {
    pub width: f64,
    pub height: f64,
    pub edges: usize,
    /// Segment-segment crossings between *different* edges (shared endpoints ignored).
    pub crossings: usize,
    /// Pairs of segments from *different* edges that run collinear and coincident
    /// (overlap >= 4px, perpendicular distance <= 2px) - edges drawn on top of each other.
    pub overlaps: usize,
    /// (edge, node) pairs where the edge's route passes through a node box it is not
    /// incident to - an arc drawn straight over/through an unrelated node.
    pub node_hits: usize,
    /// Smallest gap between any edge segment and any node box it neither touches nor is
    /// incident to. Low values mean edges hug or graze nodes.
    pub min_clearance: f64,
    /// Smallest distance between two edges' touch-points on the same node - how crowded the
    /// busiest node's ports are. Low values mean arcs meet the node almost on top of each other.
    pub min_port_sep: f64,
    /// Largest distance between an edge endpoint and the border of the node it connects to
    /// (source side measured strictly; target side allows the arrowhead end-gap). A shape-fit
    /// route touches its nodes -> this stays ~0.
    pub connection_gap: f64,
    /// Interior vertices whose turn angle exceeds ~8° (near-collinear points don't count).
    pub bends: usize,
    /// Edges whose route overshoots the span of their two endpoints (goes past then back) in
    /// open space - obstacle-avoidance jogs that hug the node they skirt are not counted.
    pub detours: usize,
    pub edge_len: f64,
}

fn ccw(a: Pt, b: Pt, c: Pt) -> f64 {
    (c.1 - a.1) * (b.0 - a.0) - (b.1 - a.1) * (c.0 - a.0)
}

fn shares_endpoint(s1: (Pt, Pt), s2: (Pt, Pt)) -> bool {
    let close = |p: Pt, q: Pt| (p.0 - q.0).abs() < 1.0 && (p.1 - q.1).abs() < 1.0;
    for p in [s1.0, s1.1] {
        for q in [s2.0, s2.1] {
            if close(p, q) {
                return true;
            }
        }
    }
    false
}

fn segments_cross(s1: (Pt, Pt), s2: (Pt, Pt)) -> bool {
    if shares_endpoint(s1, s2) {
        return false;
    }
    let (a, b) = s1;
    let (c, d) = s2;
    let d1 = ccw(c, d, a);
    let d2 = ccw(c, d, b);
    let d3 = ccw(a, b, c);
    let d4 = ccw(a, b, d);
    (d1 > 0.0) != (d2 > 0.0) && (d3 > 0.0) != (d4 > 0.0)
}

/// Two segments run collinear and coincident (drawn on top of each other).
fn segments_overlap(s1: (Pt, Pt), s2: (Pt, Pt)) -> bool {
    let (a, b) = s1;
    let (c, d) = s2;
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-6 {
        return false;
    }
    let (ux, uy) = (dx / len, dy / len);
    let perp = |p: Pt| ((p.0 - a.0) * uy - (p.1 - a.1) * ux).abs();
    if perp(c) > 2.0 || perp(d) > 2.0 {
        return false;
    }
    let proj = |p: Pt| (p.0 - a.0) * ux + (p.1 - a.1) * uy;
    let (t0, t1): (f64, f64) = (0.0, len);
    let (mut tc, mut td) = (proj(c), proj(d));
    if tc > td {
        std::mem::swap(&mut tc, &mut td);
    }
    let lo = t0.min(t1).max(tc);
    let hi = t0.max(t1).min(td);
    hi - lo > 4.0
}

/// Does the segment `p->q` enter the interior of rect (shrunk by `margin`)? Slab clip: a
/// non-empty t-interval where the point is inside both the x- and y-slab means it cuts through.
fn segment_enters_rect(p: Pt, q: Pt, r: Rect, margin: f64) -> bool {
    let (cx, cy, w, h) = r;
    let (xmin, xmax) = (cx - w / 2.0 + margin, cx + w / 2.0 - margin);
    let (ymin, ymax) = (cy - h / 2.0 + margin, cy + h / 2.0 - margin);
    if xmin >= xmax || ymin >= ymax {
        return false;
    }
    let mut t0 = 0.0f64;
    let mut t1 = 1.0f64;
    for &(pc, dc, lo, hi) in &[(p.0, q.0 - p.0, xmin, xmax), (p.1, q.1 - p.1, ymin, ymax)] {
        if dc.abs() < 1e-9 {
            if pc < lo || pc > hi {
                return false; // parallel to this slab and outside it
            }
        } else {
            let (mut ta, mut tb) = ((lo - pc) / dc, (hi - pc) / dc);
            if ta > tb {
                std::mem::swap(&mut ta, &mut tb);
            }
            t0 = t0.max(ta);
            t1 = t1.min(tb);
            if t0 > t1 {
                return false;
            }
        }
    }
    t0 < t1 - 1e-6
}

/// Shortest distance from point to segment.
fn point_seg_dist(pt: Pt, a: Pt, b: Pt) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let l2 = dx * dx + dy * dy;
    let t = if l2 < 1e-9 {
        0.0
    } else {
        (((pt.0 - a.0) * dx + (pt.1 - a.1) * dy) / l2).clamp(0.0, 1.0)
    };
    let (px, py) = (a.0 + t * dx, a.1 + t * dy);
    ((pt.0 - px).powi(2) + (pt.1 - py).powi(2)).sqrt()
}

/// Distance from segment to a rectangle (0 if it touches/enters).
fn segment_rect_dist(p: Pt, q: Pt, r: Rect) -> f64 {
    if segment_enters_rect(p, q, r, 0.0) {
        return 0.0;
    }
    let (cx, cy, w, h) = r;
    let (x0, x1, y0, y1) = (cx - w / 2.0, cx + w / 2.0, cy - h / 2.0, cy + h / 2.0);
    let corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)];
    let mut d = f64::INFINITY;
    // Segment endpoints vs rect edges + rect corners vs segment.
    for i in 0..4 {
        let (a, b) = (corners[i], corners[(i + 1) % 4]);
        d = d.min(point_seg_dist(p, a, b)).min(point_seg_dist(q, a, b));
        d = d.min(point_seg_dist(a, p, q));
    }
    d
}

/// Distance from a point to a node's drawn border. For a box it is the (signed->clamped)
/// distance to the rectangle outline; for an ellipse the radial gap to the outline. ~0 when
/// the point sits on the border, as a shape-fit arc endpoint should.
fn point_border_dist(p: Pt, r: Rect, ellipse: bool) -> f64 {
    let (cx, cy, w, h) = r;
    let (hw, hh) = (w / 2.0, h / 2.0);
    if ellipse {
        let (nx, ny) = ((p.0 - cx) / hw, (p.1 - cy) / hh);
        let rad = (nx * nx + ny * ny).sqrt();
        if rad < 1e-9 {
            return hw.min(hh);
        }
        // Point on the ellipse along the ray from the centre.
        let (bx, by) = (cx + (p.0 - cx) / rad, cy + (p.1 - cy) / rad);
        ((p.0 - bx).powi(2) + (p.1 - by).powi(2)).sqrt()
    } else {
        let dx = (p.0 - cx).abs() - hw;
        let dy = (p.1 - cy).abs() - hh;
        if dx <= 0.0 && dy <= 0.0 {
            // Inside: distance to the nearest side.
            (-dx).min(-dy)
        } else {
            dx.max(0.0).hypot(dy.max(0.0))
        }
    }
}

fn compact(poly: &[Pt]) -> Vec<Pt> {
    let mut out: Vec<Pt> = vec![];
    for &p in poly {
        if out
            .last()
            .is_none_or(|q: &Pt| (p.0 - q.0).abs() > 0.6 || (p.1 - q.1).abs() > 0.6)
        {
            out.push(p);
        }
    }
    out
}

fn count_bends(poly: &[Pt]) -> usize {
    let mut n = 0;
    for i in 1..poly.len().saturating_sub(1) {
        let (a, b, c) = (poly[i - 1], poly[i], poly[i + 1]);
        let (ux, uy) = (b.0 - a.0, b.1 - a.1);
        let (vx, vy) = (c.0 - b.0, c.1 - b.1);
        let lu = (ux * ux + uy * uy).sqrt();
        let lv = (vx * vx + vy * vy).sqrt();
        if lu < 1e-6 || lv < 1e-6 {
            continue;
        }
        let cos = ((ux * vx + uy * vy) / (lu * lv)).clamp(-1.0, 1.0);
        if cos.acos() > 8.0_f64.to_radians() {
            n += 1;
        }
    }
    n
}

/// Compute metrics. `edge_endpoints[i]` gives the node-box indices this edge connects
/// (`usize::MAX` for none), so those two boxes are excluded from its clearance/hit checks.
/// `node_ellipse[i]` marks a node drawn as an ellipse (else a box) for shape-aware gaps.
pub fn compute(
    node_boxes: &[Rect],
    edges: &[Vec<Pt>],
    edge_endpoints: &[(usize, usize)],
    node_ellipse: &[bool],
) -> LayoutMetrics {
    // Arrowhead end-gap the SVG writer leaves at the target (marker_size_for/end_gap_for at
    // stroke width 2) - the target endpoint is allowed to stop this far short of the border.
    const ARROW_GAP: f64 = 10.0;
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for &(cx, cy, w, h) in node_boxes {
        min_x = min_x.min(cx - w / 2.0);
        min_y = min_y.min(cy - h / 2.0);
        max_x = max_x.max(cx + w / 2.0);
        max_y = max_y.max(cy + h / 2.0);
    }

    // Keep original edge indices so we can look up endpoints after filtering degenerate ones.
    let polys: Vec<(usize, Vec<Pt>)> = edges
        .iter()
        .enumerate()
        .map(|(i, e)| (i, compact(e)))
        .filter(|(_, p)| p.len() >= 2)
        .collect();

    let mut segs: Vec<(usize, (Pt, Pt))> = vec![];
    for (pi, (_, poly)) in polys.iter().enumerate() {
        for w in poly.windows(2) {
            segs.push((pi, (w[0], w[1])));
        }
    }
    let mut crossings = 0;
    let mut overlaps = 0;
    for i in 0..segs.len() {
        for j in i + 1..segs.len() {
            if segs[i].0 == segs[j].0 {
                continue;
            }
            if segments_cross(segs[i].1, segs[j].1) {
                crossings += 1;
            }
            if segments_overlap(segs[i].1, segs[j].1) {
                overlaps += 1;
            }
        }
    }

    // Edge<->node: hits (cut through a non-incident box) and minimum clearance.
    let mut node_hits = 0;
    let mut min_clearance = f64::INFINITY;
    for (orig, poly) in polys.iter() {
        let (sa, sb) = edge_endpoints
            .get(*orig)
            .copied()
            .unwrap_or((usize::MAX, usize::MAX));
        for (ni, &r) in node_boxes.iter().enumerate() {
            if ni == sa || ni == sb {
                continue;
            }
            let mut hit = false;
            for w in poly.windows(2) {
                if segment_enters_rect(w[0], w[1], r, 1.0) {
                    hit = true;
                }
                let d = segment_rect_dist(w[0], w[1], r);
                if d < min_clearance {
                    min_clearance = d;
                }
            }
            if hit {
                node_hits += 1;
            }
        }
    }
    if !min_clearance.is_finite() {
        min_clearance = 0.0;
    }

    // Connection gap: how far each edge stops short of the node it joins. Source side is
    // measured strictly (the arc must touch); the target side allows the arrowhead end-gap.
    let mut connection_gap = 0.0f64;
    let is_ell = |i: usize| node_ellipse.get(i).copied().unwrap_or(false);
    for (orig, poly) in polys.iter() {
        let (sa, sb) = edge_endpoints
            .get(*orig)
            .copied()
            .unwrap_or((usize::MAX, usize::MAX));
        if sa < node_boxes.len() {
            let g = point_border_dist(poly[0], node_boxes[sa], is_ell(sa));
            connection_gap = connection_gap.max(g);
        }
        if sb < node_boxes.len() {
            let g = point_border_dist(poly[poly.len() - 1], node_boxes[sb], is_ell(sb));
            connection_gap = connection_gap.max((g - ARROW_GAP).max(0.0));
        }
    }

    let bends = polys.iter().map(|(_, p)| count_bends(p)).sum();

    // Detour: the route overshoots the order-axis span of its endpoints *in open space*. An
    // overshoot vertex that sits beside a node box (within a node-gap) is an obstacle-avoiding
    // jog, not a wiggle, so it is not flagged; a genuine up-then-down excursion in the clear is.
    let mut detours = 0;
    for (orig, p) in &polys {
        let (a, b) = (p[0], p[p.len() - 1]);
        let horiz = (b.0 - a.0).abs() >= (b.1 - a.1).abs();
        let val = |pt: &Pt| if horiz { pt.1 } else { pt.0 };
        let (lo, hi) = (val(&a).min(val(&b)), val(&a).max(val(&b)));
        let (sa, sb) = edge_endpoints
            .get(*orig)
            .copied()
            .unwrap_or((usize::MAX, usize::MAX));
        let near_node = |pt: Pt| -> bool {
            node_boxes
                .iter()
                .enumerate()
                .any(|(ni, &r)| ni != sa && ni != sb && point_border_dist(pt, r, is_ell(ni)) < 24.0)
        };
        if p.iter()
            .any(|pt| (val(pt) < lo - 3.0 || val(pt) > hi + 3.0) && !near_node(*pt))
        {
            detours += 1;
        }
    }
    let edge_len = segs
        .iter()
        .map(|(_, (a, b))| ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt())
        .sum();

    // Port crowding: per node, the closest pair of incident edge touch-points.
    let mut touch: Vec<Vec<Pt>> = vec![vec![]; node_boxes.len()];
    for (orig, poly) in &polys {
        let (sa, sb) = edge_endpoints
            .get(*orig)
            .copied()
            .unwrap_or((usize::MAX, usize::MAX));
        if sa < node_boxes.len() {
            touch[sa].push(poly[0]);
        }
        if sb < node_boxes.len() {
            touch[sb].push(poly[poly.len() - 1]);
        }
    }
    let mut min_port_sep = f64::INFINITY;
    for pts in &touch {
        for i in 0..pts.len() {
            for j in i + 1..pts.len() {
                min_port_sep = min_port_sep.min((pts[i].0 - pts[j].0).hypot(pts[i].1 - pts[j].1));
            }
        }
    }
    if !min_port_sep.is_finite() {
        min_port_sep = 0.0;
    }

    if !min_x.is_finite() {
        min_x = 0.0;
        min_y = 0.0;
        max_x = 0.0;
        max_y = 0.0;
    }
    LayoutMetrics {
        width: max_x - min_x,
        height: max_y - min_y,
        edges: polys.len(),
        crossings,
        overlaps,
        node_hits,
        min_clearance,
        min_port_sep,
        connection_gap,
        bends,
        detours,
        edge_len,
    }
}
