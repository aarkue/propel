//! Generic SVG drawing helpers shared by the pure-draw graph renderer ([`crate::viz::graph_svg`]):
//! number/text formatting, polyline rounding + simplification, and the export color palette. No
//! layout and no domain (Petri/DFG) knowledge lives here.

use serde::{Deserialize, Serialize};

/// Colors passed from the frontend (or defaulted to light theme).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct SvgPalette {
    pub node_bg: String,
    pub node_border: String,
    pub node_text: String,
    pub arc_color: String,
    pub arc_label_bg: String,
    pub export_bg: String,
}

impl Default for SvgPalette {
    fn default() -> Self {
        SvgPalette {
            node_bg: "#ffffff".into(),
            node_border: "#1f2937".into(),
            node_text: "#111827".into(),
            arc_color: "#374151".into(),
            arc_label_bg: "#ffffff".into(),
            export_bg: "#ffffff".into(),
        }
    }
}

pub(crate) fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// 2-decimal precision keeps the emitted SVG compact.
pub(crate) fn fmt(v: f64) -> String {
    format!("{:.2}", v)
}

/// Arrowhead marker size for a given stroke width (mirrors the TS `markerSizeFor`).
pub(crate) fn marker_size_for(sw: f64) -> f64 {
    f64::max(12.0, sw * 2.5)
}

type Pt = (f64, f64);

/// Shorten the last segment by `by` units (to leave room for the arrowhead). Never walks past the
/// last corner: the marker orients along the path's final segment, so consuming the corner would
/// swing the arrow away from the node it points into. When the final segment is shorter than `by`,
/// a stub of it is kept, so the arrow tucks partly into the node (still connected, pointing in).
pub(crate) fn shorten_end(pts: &[Pt], by: f64) -> Vec<Pt> {
    if pts.len() < 2 || by <= 0.0 {
        return pts.to_vec();
    }
    let mut out = pts.to_vec();
    let n = out.len();
    let (ax, ay) = out[n - 2];
    let (bx, by_) = out[n - 1];
    let len = f64::hypot(bx - ax, by_ - ay);
    let trim = by.min(len - 0.5).max(0.0);
    if trim > 0.0 {
        out[n - 1] = (bx - (bx - ax) / len * trim, by_ - (by_ - ay) / len * trim);
    }
    out
}

/// Rounded polyline to an SVG path with `Q` corners of radius `r` (mirrors the TS `roundedPolyline`).
pub(crate) fn rounded_polyline(pts: &[Pt], r: f64) -> String {
    if pts.len() < 2 {
        return String::new();
    }
    if pts.len() == 2 {
        return format!("M {},{} L {},{}", fmt(pts[0].0), fmt(pts[0].1), fmt(pts[1].0), fmt(pts[1].1));
    }
    let mut d = format!("M {},{}", fmt(pts[0].0), fmt(pts[0].1));
    for i in 1..pts.len() - 1 {
        let (x0, y0) = pts[i - 1];
        let (x1, y1) = pts[i];
        let (x2, y2) = pts[i + 1];
        let l1 = f64::hypot(x1 - x0, y1 - y0).max(1.0);
        let l2 = f64::hypot(x2 - x1, y2 - y1).max(1.0);
        let rr = r.min(l1 / 2.0).min(l2 / 2.0);
        let ax = x1 - (x1 - x0) / l1 * rr;
        let ay = y1 - (y1 - y0) / l1 * rr;
        let bx = x1 + (x2 - x1) / l2 * rr;
        let by = y1 + (y2 - y1) / l2 * rr;
        d.push_str(&format!(" L {},{} Q {},{} {},{}", fmt(ax), fmt(ay), fmt(x1), fmt(y1), fmt(bx), fmt(by)));
    }
    let last = pts[pts.len() - 1];
    d.push_str(&format!(" L {},{}", fmt(last.0), fmt(last.1)));
    d
}

/// RDP-simplify, then drop points closer together than 3px (removes sub-pixel grid jogs that become
/// visible stairstep kinks / zero-length segments in the rounded output). The first and last segments
/// are kept verbatim: their directions orient the start/end markers, and marker trimming can shrink
/// them to sub-pixel stubs that plain simplification would flatten into the neighbouring run.
pub(crate) fn clean_path(pts: &[Pt], tol: f64) -> Vec<Pt> {
    if pts.len() < 4 {
        return pts.to_vec();
    }
    let mut s = vec![pts[0]];
    s.extend(rdp(&pts[1..pts.len() - 1], tol));
    s.push(pts[pts.len() - 1]);
    let mut out: Vec<Pt> = Vec::with_capacity(s.len());
    for (i, &p) in s.iter().enumerate() {
        let keep_end = i <= 1 || i >= s.len() - 2;
        match out.last() {
            Some(&last) if !keep_end && (last.0 - p.0).hypot(last.1 - p.1) < 3.0 => {}
            _ => out.push(p),
        }
    }
    out
}

/// Ramer-Douglas-Peucker polyline simplification: drop points within `tol` of the chord, keeping
/// only the corners that define the route's shape.
fn rdp(pts: &[Pt], tol: f64) -> Vec<Pt> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    let (a, b) = (pts[0], pts[pts.len() - 1]);
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len = f64::hypot(dx, dy).max(1e-9);
    let mut far = 0usize;
    let mut fmax = 0.0;
    for (i, &p) in pts.iter().enumerate().take(pts.len() - 1).skip(1) {
        let d = ((p.0 - a.0) * dy - (p.1 - a.1) * dx).abs() / len; // perpendicular distance
        if d > fmax {
            fmax = d;
            far = i;
        }
    }
    if fmax <= tol {
        return vec![a, b];
    }
    let mut left = rdp(&pts[..=far], tol);
    let right = rdp(&pts[far..], tol);
    left.pop();
    left.extend(right);
    left
}

/// Point at `frac` (0..1) of the polyline's total length.
pub(crate) fn polyline_point_at(pts: &[Pt], frac: f64) -> Pt {
    if pts.len() < 2 {
        return pts.first().copied().unwrap_or((0.0, 0.0));
    }
    let segs: Vec<f64> = (1..pts.len())
        .map(|i| f64::hypot(pts[i].0 - pts[i - 1].0, pts[i].1 - pts[i - 1].1))
        .collect();
    let target: f64 = segs.iter().sum::<f64>() * frac.clamp(0.0, 1.0);
    let mut acc = 0.0;
    for (i, &s) in segs.iter().enumerate() {
        if acc + s >= target {
            let t = if s == 0.0 { 0.0 } else { (target - acc) / s };
            return (
                pts[i].0 + (pts[i + 1].0 - pts[i].0) * t,
                pts[i].1 + (pts[i + 1].1 - pts[i].1) * t,
            );
        }
        acc += s;
    }
    *pts.last().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_escape_works() {
        assert_eq!(xml_escape("a & b < c > d \"e\""), "a &amp; b &lt; c &gt; d &quot;e&quot;");
    }

    #[test]
    fn rounded_polyline_two_points_is_line() {
        let pts = vec![(0.0, 0.0), (10.0, 0.0)];
        let d = rounded_polyline(&pts, 8.0);
        assert!(d.starts_with("M "));
        assert!(d.contains(" L "));
        assert!(!d.contains(" Q "), "two-point polyline should not have quadratic curves");
    }

    #[test]
    fn rounded_polyline_three_points_has_curve() {
        let pts = vec![(0.0, 0.0), (0.0, 50.0), (50.0, 50.0)];
        let d = rounded_polyline(&pts, 8.0);
        assert!(d.contains(" Q "), "three-point polyline should round the corner");
    }
}
