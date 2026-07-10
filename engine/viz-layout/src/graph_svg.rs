//! Generic pure-draw SVG renderer.
//!
//! This module does no layout: it draws exactly the geometry it is given. Callers (DFG, OC-DFG,
//! OC-Declare, Petri, OCPN) build a [`StyledGraph`] from their own already-laid-out, already-styled
//! on-screen state (React Flow node positions + routed edge points), so the export is guaranteed to
//! match the screen pixel-for-pixel: there is no second layout pass that could diverge from the first.

use serde::{Deserialize, Serialize};

use crate::svg_util::{
    clean_path, fmt, marker_size_for, polyline_point_at, rounded_polyline, shorten_end,
    xml_escape, SvgPalette,
};

fn default_true() -> bool {
    true
}
fn default_padding() -> f64 {
    36.0
}
fn default_label_size() -> f64 {
    12.5
}
fn default_label_weight() -> f64 {
    500.0
}
fn default_stroke_width() -> f64 {
    1.75
}
fn default_edge_width() -> f64 {
    2.0
}
fn default_at() -> f64 {
    0.5
}

/// Node outline shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NodeShape {
    /// Rounded rectangle. `radius` is the corner radius in px (0 = sharp corners).
    Box {
        #[serde(default)]
        radius: f64,
    },
    /// Ellipse inscribed in the node's `w`x`h` box.
    Ellipse,
    /// Circle of diameter `w` (h is ignored).
    Circle,
}

/// One line of text drawn centered in a node, offset vertically by `dy`. Multiple labels stack
/// (e.g. an activity name line + a frequency-count line below it).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct StyledLabel {
    pub text: String,
    #[serde(default = "default_label_size")]
    pub size: f64,
    #[serde(default = "default_label_weight")]
    pub weight: f64,
    #[serde(default)]
    pub color: Option<String>,
    /// Vertical offset from the node center, in px.
    #[serde(default)]
    pub dy: f64,
    /// Word-wrap to fit the node width (max 2 lines, ellipsized). Off by default: pass one
    /// `StyledLabel` per pre-wrapped line instead when the caller already knows the split.
    #[serde(default)]
    pub wrap: bool,
}

/// Shape of one token-marking glyph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum MarkingKind {
    /// Filled circle (e.g. initial-marking token).
    Dot,
    /// Faded square (e.g. final-marking token).
    Square,
}

/// A group of same-kind tokens drawn inside a node (e.g. Petri place markings). Groups are drawn
/// left-to-right in a single row; if the total count across all groups doesn't fit the node's
/// width, the renderer collapses the whole row to a single numeral instead.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct MarkingGroup {
    pub kind: MarkingKind,
    #[serde(default)]
    pub color: Option<String>,
    pub count: u64,
}

/// A single decorative glyph drawn centered in a node (e.g. the start/end terminal chrome on a
/// DFG). Distinct from [`MarkingGroup`], which draws a *counted row* of tokens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum IconKind {
    /// "Play" triangle (start terminal).
    Triangle,
    /// "Stop" square (end terminal).
    Square,
}

#[derive(Debug, Clone, Serialize, Deserialize)]

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct StyledIcon {
    pub kind: IconKind,
    #[serde(default)]
    pub color: Option<String>,
    /// Icon half-size as a fraction of the node's half-extent. Defaults to the terminal-chrome
    /// proportions used on screen (~0.3 of the radius).
    #[serde(default = "default_icon_scale")]
    pub scale: f64,
}

fn default_icon_scale() -> f64 {
    0.3
}

/// One node in a [`StyledGraph`]: final position/size plus all of its own styling.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct StyledNode {
    pub cx: f64,
    pub cy: f64,
    pub w: f64,
    pub h: f64,
    #[serde(default = "default_box_shape")]
    pub shape: NodeShape,
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default = "default_stroke_width")]
    pub stroke_width: f64,
    #[serde(default)]
    pub stroke_dash: Option<String>,
    #[serde(default)]
    pub labels: Vec<StyledLabel>,
    #[serde(default)]
    pub marking: Vec<MarkingGroup>,
    #[serde(default)]
    pub icon: Option<StyledIcon>,
}

fn default_box_shape() -> NodeShape {
    NodeShape::Box { radius: 4.0 }
}

/// End-of-edge marker glyph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum EdgeMarker {
    #[default]
    None,
    Arrow,
    Ball,
    /// Arrow with a trailing dot behind it (OC-Declare "EFEP" combined marker).
    ArrowBall,
}

/// A text label anchored at a fraction along the edge's polyline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct EdgeLabel {
    pub text: String,
    /// Fraction (0..1) of the polyline's length. Defaults to the midpoint.
    #[serde(default = "default_at")]
    pub at: f64,
    /// Pixel displacement from the `at` anchor (e.g. the on-screen label de-overlap pass).
    #[serde(default)]
    pub dx: f64,
    #[serde(default)]
    pub dy: f64,
    #[serde(default)]
    pub bg: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

/// A small dot drawn along an edge's curve, filled or hollow (OC-Declare cardinality markers).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct EdgeDot {
    pub at: f64,
    pub color: String,
    #[serde(default = "default_true")]
    pub filled: bool,
}

/// One edge in a [`StyledGraph`]: an already-routed polyline plus its own styling.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct StyledEdge {
    /// Routed polyline points, already in the same coordinate space as node `cx`/`cy`.
    pub points: Vec<[f64; 2]>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default = "default_edge_width")]
    pub width: f64,
    #[serde(default)]
    pub dash: Option<String>,
    #[serde(default)]
    pub marker_start: EdgeMarker,
    #[serde(default)]
    pub marker_end: EdgeMarker,
    #[serde(default)]
    pub labels: Vec<EdgeLabel>,
    #[serde(default)]
    pub dots: Vec<EdgeDot>,
    /// Corner radius (px) for rounding the polyline's interior joins. 0 draws straight segments
    /// (a plain multi-point polyline), matching whatever radius the on-screen edge used.
    #[serde(default)]
    pub rounded: f64,
}

/// One legend entry: a labeled swatch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct LegendItem {
    pub label: String,
    #[serde(default)]
    pub color: Option<String>,
}

/// A titled group of legend entries (e.g. "Object types").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct LegendGroup {
    #[serde(default)]
    pub title: Option<String>,
    pub items: Vec<LegendItem>,
}

/// A fully laid-out, fully styled diagram, ready to draw with no further layout decisions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct StyledGraph {
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default = "default_padding")]
    pub padding: f64,
    pub nodes: Vec<StyledNode>,
    pub edges: Vec<StyledEdge>,
    #[serde(default)]
    pub legend: Vec<LegendGroup>,
}

// Rendering

type Pt = (f64, f64);

fn shape_half_extent(shape: &NodeShape, w: f64, h: f64) -> (f64, f64) {
    match shape {
        NodeShape::Circle => (w / 2.0, w / 2.0),
        _ => (w / 2.0, h / 2.0),
    }
}

fn node_path(shape: &NodeShape, cx: f64, cy: f64, w: f64, h: f64) -> String {
    match shape {
        NodeShape::Circle => format!(
            r#"<circle cx="{cx}" cy="{cy}" r="{r}""#,
            cx = fmt(cx),
            cy = fmt(cy),
            r = fmt(w / 2.0)
        ),
        NodeShape::Ellipse => format!(
            r#"<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}""#,
            cx = fmt(cx),
            cy = fmt(cy),
            rx = fmt(w / 2.0),
            ry = fmt(h / 2.0)
        ),
        NodeShape::Box { radius } => format!(
            r#"<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}""#,
            x = fmt(cx - w / 2.0),
            y = fmt(cy - h / 2.0),
            w = fmt(w),
            h = fmt(h),
            r = fmt(*radius)
        ),
    }
}

/// Mirrors the Petri `wrap_label` helper: greedy word/hyphen packing into at most `max_lines`
/// lines of at most `max_chars`, ellipsizing an overflowing final line.
fn wrap_label(label: &str, max_chars: usize, max_lines: usize) -> Vec<String> {
    if label.is_empty() {
        return vec![];
    }
    let mut words: Vec<String> = Vec::new();
    let mut cur_tok = String::new();
    for ch in label.chars() {
        cur_tok.push(ch);
        if ch == '-' || ch.is_whitespace() {
            let tok = cur_tok
                .trim_end_matches(|c: char| c.is_whitespace() && c != '-')
                .to_string();
            if !tok.is_empty() {
                words.push(tok);
            }
            cur_tok.clear();
        }
    }
    if !cur_tok.is_empty() {
        words.push(cur_tok);
    }
    let mut lines: Vec<String> = vec![];
    let mut cur = String::new();
    for w in &words {
        let next = if cur.is_empty() { w.clone() } else { format!("{} {}", cur, w) };
        if next.len() > max_chars && !cur.is_empty() {
            lines.push(cur.clone());
            cur = w.clone();
            if lines.len() == max_lines - 1 {
                break;
            }
        } else {
            cur = next;
        }
    }
    if !cur.is_empty() && lines.len() < max_lines {
        lines.push(cur);
    }
    if lines.len() == max_lines {
        let last = lines.last_mut().unwrap();
        if last.len() > max_chars {
            let trimmed: String = last.chars().take(max_chars.saturating_sub(1)).collect();
            *last = format!("{}…", trimmed.trim_end());
        }
    }
    lines
}

fn render_node(node: &StyledNode, palette: &SvgPalette, out: &mut String) {
    let fill = node.fill.as_deref().unwrap_or(&palette.node_bg);
    let stroke = node.stroke.as_deref().unwrap_or(&palette.node_border);
    let dash_attr = node
        .stroke_dash
        .as_ref()
        .map(|d| format!(r#" stroke-dasharray="{}""#, xml_escape(d)))
        .unwrap_or_default();

    out.push_str(&node_path(&node.shape, node.cx, node.cy, node.w, node.h));
    out.push_str(&format!(
        r#" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>
"#,
        fill = xml_escape(fill),
        stroke = xml_escape(stroke),
        sw = fmt(node.stroke_width),
        dash = dash_attr,
    ));

    let text_color = |c: &Option<String>| c.as_deref().unwrap_or(&palette.node_text).to_string();

    if let Some(icon) = &node.icon {
        let (hx, hy) = shape_half_extent(&node.shape, node.w, node.h);
        let r = hx.min(hy);
        let col = icon.color.clone().unwrap_or_else(|| "#ffffff".to_string());
        match icon.kind {
            IconKind::Triangle => {
                let half_w = r * icon.scale * 0.93;
                let half_h = r * icon.scale * 1.07;
                out.push_str(&format!(
                    r#"<polygon points="{x0},{y0} {x0},{y1} {x2},{ym}" fill="{col}"/>
"#,
                    x0 = fmt(node.cx - half_w),
                    y0 = fmt(node.cy - half_h),
                    y1 = fmt(node.cy + half_h),
                    x2 = fmt(node.cx + half_w),
                    ym = fmt(node.cy),
                    col = xml_escape(&col),
                ));
            }
            IconKind::Square => {
                let side = r * icon.scale * 2.33;
                out.push_str(&format!(
                    r#"<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="1" fill="{col}"/>
"#,
                    x = fmt(node.cx - side / 2.0),
                    y = fmt(node.cy - side / 2.0),
                    s = fmt(side),
                    col = xml_escape(&col),
                ));
            }
        }
    }

    for label in &node.labels {
        if label.wrap {
            let max_chars = usize::max(6, ((node.w - 12.0) / 7.0) as usize);
            let lines = wrap_label(&label.text, max_chars, 2);
            let line_h = label.size + 1.5;
            let y0 = node.cy + label.dy - (lines.len() as f64 - 1.0) * line_h / 2.0;
            for (i, line) in lines.iter().enumerate() {
                out.push_str(&format!(
                    r#"<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-size="{fs}" font-weight="{fw}" fill="{col}">{text}</text>
"#,
                    x = fmt(node.cx),
                    y = fmt(y0 + i as f64 * line_h),
                    fs = fmt(label.size),
                    fw = fmt(label.weight),
                    col = xml_escape(&text_color(&label.color)),
                    text = xml_escape(line),
                ));
            }
        } else if !label.text.is_empty() {
            out.push_str(&format!(
                r#"<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-size="{fs}" font-weight="{fw}" fill="{col}">{text}</text>
"#,
                x = fmt(node.cx),
                y = fmt(node.cy + label.dy),
                fs = fmt(label.size),
                fw = fmt(label.weight),
                col = xml_escape(&text_color(&label.color)),
                text = xml_escape(&label.text),
            ));
        }
    }

    if node.marking.is_empty() {
        return;
    }
    let total: u64 = node.marking.iter().map(|m| m.count).sum();
    if total == 0 {
        return;
    }
    let sw = node.stroke_width;
    let inner = node.w - 4.0 * sw;
    let max_dots = (inner / 6.0).floor().max(1.0) as u64;
    let default_col = text_color(&None);
    if total > max_dots {
        out.push_str(&format!(
            r#"<text x="{cx}" y="{cy}" text-anchor="middle" dominant-baseline="central" font-size="{fs}" font-weight="600" fill="{col}">{n}</text>
"#,
            cx = fmt(node.cx),
            cy = fmt(node.cy),
            fs = fmt(node.w * 0.4),
            col = xml_escape(&default_col),
            n = total,
        ));
        return;
    }
    let dot_d = (inner / total as f64 - 2.0).clamp(4.0, 11.0);
    let total_w = total as f64 * dot_d + (total - 1) as f64 * 2.0;
    let mut dx = node.cx - total_w / 2.0 + dot_d / 2.0;
    for group in &node.marking {
        let col = group.color.clone().unwrap_or_else(|| default_col.clone());
        for _ in 0..group.count {
            match group.kind {
                MarkingKind::Dot => {
                    out.push_str(&format!(
                        r#"<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/>
"#,
                        cx = fmt(dx),
                        cy = fmt(node.cy),
                        r = fmt(dot_d / 2.0),
                        col = xml_escape(&col),
                    ));
                }
                MarkingKind::Square => {
                    let sq = dot_d * 0.9;
                    out.push_str(&format!(
                        r#"<rect x="{x}" y="{y}" width="{w}" height="{w}" rx="2" fill="{col}" opacity="0.2"/>
"#,
                        x = fmt(dx - sq / 2.0),
                        y = fmt(node.cy - sq / 2.0),
                        w = fmt(sq),
                        col = xml_escape(&col),
                    ));
                }
            }
            dx += dot_d + 2.0;
        }
    }
}

/// Registers a `<marker>` for `kind`/`color`/`stroke_width` (if not `None`) and returns its id
/// plus how far the path end must be pulled back from the node border so the marker's visible
/// tip lands on the border (marker `refX` anchors at its back, so the glyph spans the gap).
fn ensure_marker(
    kind: EdgeMarker,
    color: &str,
    stroke_width: f64,
    idx: usize,
    end: &str,
    defs: &mut String,
) -> Option<(String, f64)> {
    if kind == EdgeMarker::None {
        return None;
    }
    let ms = marker_size_for(stroke_width);
    let scale = ms / 12.0;
    let id = format!("gsvg-mk-{idx}-{end}");
    // (ref_x, tip_x) in viewBox units: the marker is anchored at ref_x on the path end, and its
    // frontmost visible point is tip_x. gap = (tip_x - ref_x) * scale.
    let (body, ref_x, tip_x) = match kind {
        EdgeMarker::Arrow => (
            format!(
                r#"<path d="M 1,1 L 11,6 L 1,11 Z" fill="{col}" stroke="{col}" stroke-linejoin="round"/>"#,
                col = xml_escape(color)
            ),
            1.0,
            11.0,
        ),
        EdgeMarker::Ball => (
            format!(r#"<circle cx="6" cy="6" r="4" fill="{col}"/>"#, col = xml_escape(color)),
            6.0,
            10.0,
        ),
        EdgeMarker::ArrowBall => (
            format!(
                r#"<circle cx="1.5" cy="6" r="1.5" fill="{col}"/><path d="M 5,1 L 11,6 L 5,11 Z" fill="{col}" stroke="{col}" stroke-linejoin="round"/>"#,
                col = xml_escape(color)
            ),
            1.0,
            11.0,
        ),
        EdgeMarker::None => unreachable!(),
    };
    defs.push_str(&format!(
        r#"<marker id="{id}" markerWidth="{ms}" markerHeight="{ms}" viewBox="0 0 12 12" orient="auto" refX="{rx}" refY="6" markerUnits="userSpaceOnUse">{body}</marker>
"#,
        id = id,
        ms = fmt(ms),
        rx = fmt(ref_x),
        body = body,
    ));
    // Tuck the tip half a stroke into the border (matches the on-screen renderer) so thick
    // strokes join the node seamlessly instead of showing an anti-aliased seam.
    let gap = ((tip_x - ref_x) * scale - stroke_width / 2.0).max(0.0);
    Some((id, gap))
}

fn render_edge(edge: &StyledEdge, palette: &SvgPalette, idx: usize, out: &mut String, defs: &mut String) {
    if edge.points.len() < 2 {
        return;
    }
    let color = edge.color.clone().unwrap_or_else(|| palette.arc_color.clone());
    let mut pts: Vec<Pt> = edge.points.iter().map(|p| (p[0], p[1])).collect();

    let start_marker = ensure_marker(edge.marker_start, &color, edge.width, idx, "s", defs);
    let end_marker = ensure_marker(edge.marker_end, &color, edge.width, idx, "e", defs);

    // Simplify BEFORE trimming for the markers: trimming can leave a sub-pixel stub of the final
    // segment (its direction orients the arrowhead), which a later clean pass would flatten away -
    // swinging the arrow off the node it points into.
    if edge.rounded > 0.0 {
        pts = clean_path(&pts, 3.0);
    }
    if let Some((_, gap)) = &end_marker {
        pts = shorten_end(&pts, *gap);
    }
    if let Some((_, gap)) = &start_marker {
        let mut rev: Vec<Pt> = pts.iter().rev().copied().collect();
        rev = shorten_end(&rev, *gap);
        pts = rev.into_iter().rev().collect();
    }

    let raw_points = edge.points.iter().map(|p| (p[0], p[1])).collect::<Vec<Pt>>();
    let path_d = if edge.rounded > 0.0 {
        rounded_polyline(&pts, edge.rounded)
    } else {
        let mut d = format!("M {},{}", fmt(pts[0].0), fmt(pts[0].1));
        for &(x, y) in pts.iter().skip(1) {
            d.push_str(&format!(" L {},{}", fmt(x), fmt(y)));
        }
        d
    };

    let dash_attr = edge
        .dash
        .as_ref()
        .map(|d| format!(r#" stroke-dasharray="{}""#, xml_escape(d)))
        .unwrap_or_default();
    let marker_start_attr = start_marker
        .as_ref()
        .map(|(id, _)| format!(r#" marker-start="url(#{id})""#))
        .unwrap_or_default();
    let marker_end_attr = end_marker
        .as_ref()
        .map(|(id, _)| format!(r#" marker-end="url(#{id})""#))
        .unwrap_or_default();

    out.push_str(&format!(
        r#"<path d="{d}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="butt"{dash}{ms}{me}/>
"#,
        d = xml_escape(&path_d),
        col = xml_escape(&color),
        sw = fmt(edge.width),
        dash = dash_attr,
        ms = marker_start_attr,
        me = marker_end_attr,
    ));

    for dot in &edge.dots {
        let (x, y) = polyline_point_at(&raw_points, dot.at);
        if dot.filled {
            out.push_str(&format!(
                r#"<circle cx="{cx}" cy="{cy}" r="4.33" fill="{col}"/>
"#,
                cx = fmt(x),
                cy = fmt(y),
                col = xml_escape(&dot.color),
            ));
        } else {
            out.push_str(&format!(
                r#"<circle cx="{cx}" cy="{cy}" r="4.33" fill="{bg}" stroke="{col}" stroke-width="1.5"/>
"#,
                cx = fmt(x),
                cy = fmt(y),
                bg = xml_escape(&palette.export_bg),
                col = xml_escape(&dot.color),
            ));
        }
    }

    for label in &edge.labels {
        let (mut mx, mut my) = polyline_point_at(&raw_points, label.at);
        mx += label.dx;
        my += label.dy;
        // Glyph-hugging halo (a background-colored stroke drawn under the fill via paint-order)
        // instead of a filled chip: keeps the number legible over arcs without a hard box, and stays
        // opaque (SVG alpha is unevenly supported by consumers). Mirrors the on-screen text-shadow halo.
        let halo = label.bg.clone().unwrap_or_else(|| palette.arc_label_bg.clone());
        let col = label.color.clone().unwrap_or_else(|| color.clone());
        out.push_str(&format!(
            r#"<text x="{lx}" y="{ly}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="600" paint-order="stroke" stroke="{halo}" stroke-width="2.5" stroke-linejoin="round" fill="{col}">{label}</text>
"#,
            lx = fmt(mx),
            ly = fmt(my + 1.0),
            halo = xml_escape(&halo),
            col = xml_escape(&col),
            label = xml_escape(&label.text),
        ));
    }
}

fn render_legend(groups: &[LegendGroup], palette: &SvgPalette, x: f64, y: f64, out: &mut String) {
    let mut cy = y;
    for group in groups {
        if let Some(title) = &group.title {
            out.push_str(&format!(
                r#"<text x="{x}" y="{y}" font-size="11" font-weight="600" fill="{col}">{text}</text>
"#,
                x = fmt(x),
                y = fmt(cy),
                col = xml_escape(&palette.node_text),
                text = xml_escape(title),
            ));
            cy += 16.0;
        }
        for item in &group.items {
            let color = item.color.as_deref().unwrap_or(&palette.node_text);
            out.push_str(&format!(
                r#"<rect x="{x}" y="{y}" width="10" height="10" rx="2" fill="{col}"/>
<text x="{tx}" y="{ty}" font-size="11" fill="{tcol}">{text}</text>
"#,
                x = fmt(x),
                y = fmt(cy - 8.0),
                col = xml_escape(color),
                tx = fmt(x + 16.0),
                ty = fmt(cy),
                tcol = xml_escape(&palette.node_text),
                text = xml_escape(&item.label),
            ));
            cy += 16.0;
        }
        cy += 6.0;
    }
}

/// Draw a [`StyledGraph`] to a standalone SVG string. Pure draw: no layout decisions beyond
/// token-marking overflow (dots -> a single numeral when they wouldn't fit the node) and label
/// word-wrap (only when a label opts in via `wrap`).
pub fn render_graph_svg(graph: &StyledGraph, palette: &SvgPalette) -> String {
    let pad = graph.padding;
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for n in &graph.nodes {
        let (hx, hy) = shape_half_extent(&n.shape, n.w, n.h);
        min_x = min_x.min(n.cx - hx);
        min_y = min_y.min(n.cy - hy);
        max_x = max_x.max(n.cx + hx);
        max_y = max_y.max(n.cy + hy);
    }
    for e in &graph.edges {
        for p in &e.points {
            min_x = min_x.min(p[0]);
            min_y = min_y.min(p[1]);
            max_x = max_x.max(p[0]);
            max_y = max_y.max(p[1]);
        }
    }
    if min_x.is_infinite() {
        min_x = 0.0;
        min_y = 0.0;
        max_x = 100.0;
        max_y = 100.0;
    }

    let legend_w = if graph.legend.is_empty() { 0.0 } else { 160.0 };
    let vb_x = min_x - pad;
    let vb_y = min_y - pad;
    let width = max_x - min_x + 2.0 * pad + legend_w;
    let height = max_y - min_y + 2.0 * pad;

    let bg_color = graph.background.as_deref().unwrap_or(&palette.export_bg);
    let mut defs = String::new();
    let mut edges_svg = String::new();
    for (i, edge) in graph.edges.iter().enumerate() {
        render_edge(edge, palette, i, &mut edges_svg, &mut defs);
    }
    let mut nodes_svg = String::new();
    for node in &graph.nodes {
        render_node(node, palette, &mut nodes_svg);
    }
    let mut legend_svg = String::new();
    if !graph.legend.is_empty() {
        render_legend(&graph.legend, palette, max_x + pad, min_y, &mut legend_svg);
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x} {vb_y} {w} {h}" width="{w}" height="{h}" font-family="Inter, system-ui, -apple-system, sans-serif">
<defs>
{defs}</defs>
<rect x="{vb_x}" y="{vb_y}" width="{w}" height="{h}" fill="{bg}"/>
<g id="edges">
{edges}</g>
<g id="nodes">
{nodes}</g>
<g id="legend">
{legend}</g>
</svg>"#,
        vb_x = fmt(vb_x),
        vb_y = fmt(vb_y),
        w = fmt(width),
        h = fmt(height),
        defs = defs,
        bg = xml_escape(bg_color),
        edges = edges_svg,
        nodes = nodes_svg,
        legend = legend_svg,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_graph() -> StyledGraph {
        StyledGraph {
            background: None,
            padding: 36.0,
            nodes: vec![
                StyledNode {
                    cx: 100.0,
                    cy: 100.0,
                    w: 52.0,
                    h: 52.0,
                    shape: NodeShape::Circle,
                    fill: None,
                    stroke: None,
                    stroke_width: 1.75,
                    stroke_dash: None,
                    labels: vec![],
                    marking: vec![MarkingGroup { kind: MarkingKind::Dot, color: None, count: 1 }],
                    icon: None,
                },
                StyledNode {
                    cx: 250.0,
                    cy: 100.0,
                    w: 120.0,
                    h: 52.0,
                    shape: NodeShape::Box { radius: 4.0 },
                    fill: None,
                    stroke: None,
                    stroke_width: 1.75,
                    stroke_dash: None,
                    labels: vec![StyledLabel {
                        text: "Do Something".into(),
                        size: 12.5,
                        weight: 500.0,
                        color: None,
                        dy: 0.0,
                        wrap: true,
                    }],
                    marking: vec![],
                    icon: None,
                },
            ],
            edges: vec![StyledEdge {
                points: vec![[126.0, 100.0], [190.0, 100.0]],
                color: None,
                width: 2.0,
                dash: None,
                marker_start: EdgeMarker::None,
                marker_end: EdgeMarker::Arrow,
                labels: vec![EdgeLabel { text: "3".into(), at: 0.5, dx: 0.0, dy: 0.0, bg: None, color: None }],
                dots: vec![],
                rounded: 0.0,
            }],
            legend: vec![LegendGroup {
                title: Some("Object types".into()),
                items: vec![LegendItem { label: "orders".into(), color: Some("#3b82f6".into()) }],
            }],
        }
    }

    #[test]
    fn svg_contains_required_elements() {
        let svg = render_graph_svg(&simple_graph(), &SvgPalette::default());
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
        assert!(svg.contains("<circle"), "must draw the circle node + its dot marking");
        assert!(svg.contains("<rect"), "must draw the box node");
        assert!(svg.contains("<path"), "must draw the edge");
        assert!(svg.contains("<marker"), "must draw the arrow marker def");
        assert!(svg.contains("Do Something"), "must draw the wrapped label");
        assert!(svg.contains("Object types"), "must draw the legend");
    }

    #[test]
    fn edge_with_no_marker_has_no_marker_def() {
        let mut g = simple_graph();
        g.edges[0].marker_end = EdgeMarker::None;
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(!svg.contains("<marker"));
    }

    #[test]
    fn overflowing_marking_collapses_to_number() {
        let mut g = simple_graph();
        g.nodes[0].marking = vec![MarkingGroup { kind: MarkingKind::Dot, color: None, count: 50 }];
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(svg.contains(">50<"), "50 tokens must collapse to a numeral");
    }

    #[test]
    fn node_icon_draws_triangle_or_square() {
        let mut g = simple_graph();
        g.nodes[0].icon = Some(StyledIcon { kind: IconKind::Triangle, color: None, scale: 0.3 });
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(svg.contains("<polygon"), "triangle icon must draw a polygon");
    }

    #[test]
    fn arrow_tip_lands_on_node_border() {
        // Edge ends at the target's border x=190 (box cx=250, w=120). Stroke 2 -> marker size 12,
        // scale 1, back-anchored arrow (refX=1, tip at 11) spans 10; tuck = sw/2 = 1. The path
        // must therefore stop at 190 - (10 - 1) = 181 so the tip sits at 191 = border + tuck.
        let svg = render_graph_svg(&simple_graph(), &SvgPalette::default());
        assert!(svg.contains(r#"refX="1.00""#), "arrow marker must anchor at its back");
        assert!(svg.contains("L 181.00,100.00"), "path must stop one marker-span before the border");
    }

    #[test]
    fn short_last_segment_keeps_entry_direction() {
        // Last segment is only 4 long - shorter than the 9-unit arrow gap. The trim must NOT
        // walk back across the corner (that would orient the marker along the horizontal run,
        // leaving a floating sideways arrowhead); instead a stub of the final segment survives
        // so the arrow keeps pointing into the node, tucking slightly inside it.
        let mut g = simple_graph();
        g.edges[0].points = vec![[126.0, 100.0], [186.0, 100.0], [186.0, 104.0]];
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(
            svg.contains("L 186.00,100.50"),
            "final-segment stub must survive with its direction intact: {svg}"
        );
    }

    #[test]
    fn empty_graph_still_produces_valid_svg() {
        let g = StyledGraph { background: None, padding: 36.0, nodes: vec![], edges: vec![], legend: vec![] };
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(svg.contains("<svg") && svg.contains("</svg>"));
    }
}
