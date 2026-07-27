//! Generic pure-draw SVG renderer: does no layout, only draws exactly the geometry it's given.
//! Callers build a [`StyledGraph`] from their own already-laid-out, already-styled on-screen state, so the export matches the screen pixel-for-pixel.

use serde::{Deserialize, Serialize};

use crate::svg_util::{
    clean_path, fmt, marker_size_for, polyline_point_at, rounded_polyline, shorten_end, xml_escape,
    SvgPalette,
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
    /// Horizontal offset from the node center, in px (e.g. to re-center a text+bullet group).
    #[serde(default)]
    pub dx: f64,
    /// Word-wrap to fit the node width (max 2 lines, ellipsized). Off by default: pass one
    /// `StyledLabel` per pre-wrapped line instead when the caller already knows the split.
    #[serde(default)]
    pub wrap: bool,
    /// Small kind-indicator glyph drawn just left of the text (OCEL type graph: square = event
    /// type, dot = object type); ignored on wrapped labels.
    #[serde(default)]
    pub bullet: Option<MarkingKind>,
    /// Bullet fill; defaults to the label color.
    #[serde(default)]
    pub bullet_color: Option<String>,
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

/// A group of same-kind tokens drawn inside a node (e.g. Petri place markings), left-to-right in
/// a single row; if the total count doesn't fit the node's width, the row collapses to a numeral.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct MarkingGroup {
    pub kind: MarkingKind,
    #[serde(default)]
    pub color: Option<String>,
    pub count: u64,
    /// Draw a dashed border on each dot (OC-Declare optional involvement, min 0).
    #[serde(default)]
    pub dashed: bool,
    /// Fixed dot radius. When any group sets it, the whole row renders in exact mode: fixed
    /// sizes, tight per-group clusters, no fit-to-node scaling or numeral collapse.
    #[serde(default)]
    pub radius: Option<f64>,
    /// Center-to-center spacing between this group's dots (exact mode; below `2*radius`
    /// overlaps them into a cluster). Defaults to a non-overlapping `2*radius + 2`.
    #[serde(default)]
    pub step: Option<f64>,
    /// Ring stroke around each dot (exact mode). Absent: ring only when `dashed`, in the
    /// node's stroke color.
    #[serde(default)]
    pub stroke: Option<String>,
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
    /// Vertical offset of the marking row from the node center, in px (e.g. OC-Declare draws
    /// its involvement dots below the label).
    #[serde(default)]
    pub marking_dy: f64,
    #[serde(default)]
    pub icon: Option<StyledIcon>,
}

fn default_box_shape() -> NodeShape {
    NodeShape::Box { radius: 4.0 }
}

/// End-of-edge marker glyph. The ball-bearing kinds mirror the on-screen OC-Declare markers:
/// the ball is centered exactly on the path endpoint (the node border).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum EdgeMarker {
    #[default]
    None,
    Arrow,
    /// Arrowhead anchored at its center on the endpoint, tip half-embedded into the node
    /// (OC-Declare EF end; the plain `Arrow` pulls the path back so the tip lands ON the border).
    ArrowCentered,
    /// Filled circle centered on the endpoint (OC-Declare EF/AS start).
    Ball,
    /// Arrowhead whose tip sits at a ball centered on the endpoint (OC-Declare "EFEP" end).
    ArrowBall,
    /// `ArrowCentered` with the perpendicular "direct" bar behind the tail (OC-Declare DF end).
    ArrowBar,
    /// Ball on the endpoint plus an arrowhead pointing back into the node (OC-Declare EP start).
    BallArrow,
    /// `BallArrow` with the "direct" bar behind the arrow tail (OC-Declare DP start).
    BallBarArrow,
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
    /// Ring stroke around the dot (the on-screen `MultiDot` ring: color mixed toward
    /// CanvasText). Absent: filled dots draw ringless, hollow ones ring in `color`.
    #[serde(default)]
    pub stroke: Option<String>,
}

/// One stop of a [`StyledEdge::gradient`] stroke.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct GradientStop {
    /// Fraction (0..1) along the gradient axis.
    pub offset: f64,
    pub color: String,
}

/// One edge in a [`StyledGraph`]: an already-routed polyline plus its own styling.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
pub struct StyledEdge {
    /// Routed polyline points, already in the same coordinate space as node `cx`/`cy`.
    pub points: Vec<[f64; 2]>,
    #[serde(default)]
    pub color: Option<String>,
    /// Linear gradient stroke from the first to the last polyline point, used by OC-Declare
    /// multi-object-type arcs; two or more stops override `color` on the path.
    #[serde(default)]
    pub gradient: Vec<GradientStop>,
    #[serde(default = "default_edge_width")]
    pub width: f64,
    #[serde(default)]
    pub dash: Option<String>,
    #[serde(default)]
    pub marker_start: EdgeMarker,
    #[serde(default)]
    pub marker_end: EdgeMarker,
    /// Marker fill; defaults to the edge color (OC-Declare draws all markers in one neutral
    /// gray so the object-type color stays on the path itself).
    #[serde(default)]
    pub marker_color: Option<String>,
    /// Marker base size in px (the side of the 12-unit marker viewBox); defaults to
    /// `marker_size_for(width)`. OC-Declare passes 6 to match its small on-screen markers.
    #[serde(default)]
    pub marker_size: Option<f64>,
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
    /// Draw edges (and their markers/dots) AFTER nodes, so border-centered markers sit on top
    /// of node borders (OC-Declare). Default: edges underneath, like React Flow's default.
    #[serde(default)]
    pub edges_on_top: bool,
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
            // Clamp like CSS border-radius: SVG clamps rx to w/2 and ry to h/2 independently,
            // so an oversized radius (e.g. 999 for a pill) would render as an ellipse.
            r#"<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}""#,
            x = fmt(cx - w / 2.0),
            y = fmt(cy - h / 2.0),
            w = fmt(w),
            h = fmt(h),
            r = fmt(radius.min(w / 2.0).min(h / 2.0))
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
        let next = if cur.is_empty() {
            w.clone()
        } else {
            format!("{} {}", cur, w)
        };
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
            let lx = node.cx + label.dx;
            let ly = node.cy + label.dy;
            if let Some(kind) = label.bullet {
                // Estimated text width (~0.56em per char, matching the wrap heuristic's 7px at
                // size 12.5); the 7px glyph sits 4px left of the text's estimated left edge.
                let est_w = label.text.chars().count() as f64 * label.size * 0.56;
                let bx = lx - est_w / 2.0 - 4.0 - 3.5;
                let bc = label
                    .bullet_color
                    .clone()
                    .unwrap_or_else(|| text_color(&label.color));
                match kind {
                    MarkingKind::Square => out.push_str(&format!(
                        r#"<rect x="{x}" y="{y}" width="7" height="7" rx="1" fill="{col}"/>
"#,
                        x = fmt(bx - 3.5),
                        y = fmt(ly - 3.5),
                        col = xml_escape(&bc),
                    )),
                    MarkingKind::Dot => out.push_str(&format!(
                        r#"<circle cx="{cx}" cy="{cy}" r="3.5" fill="{col}"/>
"#,
                        cx = fmt(bx),
                        cy = fmt(ly),
                        col = xml_escape(&bc),
                    )),
                }
            }
            out.push_str(&format!(
                r#"<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-size="{fs}" font-weight="{fw}" fill="{col}">{text}</text>
"#,
                x = fmt(lx),
                y = fmt(ly),
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
    let my = node.cy + node.marking_dy;
    let default_col = text_color(&None);
    if node.marking.iter().any(|m| m.radius.is_some()) {
        // Exact mode: fixed-size per-group clusters in a row separated by a fixed gap; within a
        // group, dots are drawn right-to-left so the leftmost ends up on top when overlapping.
        const GROUP_GAP: f64 = 6.0;
        let dims: Vec<(f64, f64)> = node
            .marking
            .iter()
            .map(|g| {
                let r = g.radius.unwrap_or(4.33);
                (r, g.step.unwrap_or(r * 2.0 + 2.0))
            })
            .collect();
        let widths: Vec<f64> = node
            .marking
            .iter()
            .zip(&dims)
            .map(|(g, (r, step))| 2.0 * r + step * g.count.saturating_sub(1) as f64)
            .collect();
        let total_w: f64 =
            widths.iter().sum::<f64>() + GROUP_GAP * widths.len().saturating_sub(1) as f64;
        let mut gx = node.cx - total_w / 2.0;
        for (gi, group) in node.marking.iter().enumerate() {
            let (r, step) = dims[gi];
            let col = group.color.clone().unwrap_or_else(|| default_col.clone());
            let ring = group
                .stroke
                .clone()
                .or_else(|| group.dashed.then(|| stroke.to_string()));
            for i in (0..group.count).rev() {
                let cx = gx + r + i as f64 * step;
                let ring_attr = match &ring {
                    Some(rc) if group.dashed => format!(
                        r#" stroke="{}" stroke-width="1.3" stroke-dasharray="2.2 1.6""#,
                        xml_escape(rc)
                    ),
                    Some(rc) => format!(r#" stroke="{}" stroke-width="1""#, xml_escape(rc)),
                    None => String::new(),
                };
                out.push_str(&format!(
                    r#"<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"{ring}/>
"#,
                    cx = fmt(cx),
                    cy = fmt(my),
                    r = fmt(r),
                    col = xml_escape(&col),
                    ring = ring_attr,
                ));
            }
            gx += widths[gi] + GROUP_GAP;
        }
        return;
    }
    let sw = node.stroke_width;
    let inner = node.w - 4.0 * sw;
    let max_dots = (inner / 6.0).floor().max(1.0) as u64;
    if total > max_dots {
        out.push_str(&format!(
            r#"<text x="{cx}" y="{cy}" text-anchor="middle" dominant-baseline="central" font-size="{fs}" font-weight="600" fill="{col}">{n}</text>
"#,
            cx = fmt(node.cx),
            cy = fmt(my),
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
                        cy = fmt(my),
                        r = fmt(dot_d / 2.0),
                        col = xml_escape(&col),
                    ));
                    if group.dashed {
                        out.push_str(&format!(
                            r#"<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{stroke}" stroke-width="1" stroke-dasharray="2 1.4"/>
"#,
                            cx = fmt(dx),
                            cy = fmt(my),
                            r = fmt(dot_d / 2.0),
                            stroke = xml_escape(stroke),
                        ));
                    }
                }
                MarkingKind::Square => {
                    let sq = dot_d * 0.9;
                    out.push_str(&format!(
                        r#"<rect x="{x}" y="{y}" width="{w}" height="{w}" rx="2" fill="{col}" opacity="0.2"/>
"#,
                        x = fmt(dx - sq / 2.0),
                        y = fmt(my - sq / 2.0),
                        w = fmt(sq),
                        col = xml_escape(&col),
                    ));
                }
            }
            dx += dot_d + 2.0;
        }
    }
}

/// Registers a `<marker>` for `kind`/`color`/`stroke_width` and returns its id plus how far the
/// path end must be pulled back so the marker's visible tip lands on the border.
fn ensure_marker(
    kind: EdgeMarker,
    color: &str,
    stroke_width: f64,
    size: Option<f64>,
    idx: usize,
    end: &str,
    defs: &mut String,
) -> Option<(String, f64)> {
    if kind == EdgeMarker::None {
        return None;
    }
    let ms = size.unwrap_or_else(|| marker_size_for(stroke_width));
    let scale = ms / 12.0;
    let id = format!("gsvg-mk-{idx}-{end}");
    let col = xml_escape(color);
    // (body, ref_x, tip_x, vb_w) in viewBox units (height fixed 12): gap = (tip_x - ref_x) * scale.
    // Ball-bearing kinds anchor the ball center on the endpoint (ref_x = tip_x, gap 0).
    let (body, ref_x, tip_x, vb_w) = match kind {
        EdgeMarker::Arrow => (
            format!(
                r#"<path d="M 1,1 L 11,6 L 1,11 Z" fill="{col}" stroke="{col}" stroke-linejoin="round"/>"#
            ),
            1.0,
            11.0,
            12.0,
        ),
        EdgeMarker::ArrowCentered => (
            format!(r#"<path d="M 1,1 L 11,6 L 1,11 Z" fill="{col}"/>"#),
            6.0,
            6.0,
            12.0,
        ),
        EdgeMarker::Ball => (format!(r#"<circle cx="6" cy="6" r="5" fill="{col}"/>"#), 6.0, 6.0, 12.0),
        EdgeMarker::ArrowBall => (
            format!(
                r#"<path d="M 2,1 L 12,6 L 2,11 Z" fill="{col}"/><circle cx="12" cy="6" r="5" fill="{col}"/>"#
            ),
            12.0,
            12.0,
            18.0,
        ),
        EdgeMarker::ArrowBar => (
            format!(
                r#"<rect x="1.5" y="1" width="1.5" height="10" fill="{col}"/><path d="M 4,1 L 14,6 L 4,11 Z" fill="{col}"/>"#
            ),
            9.0,
            9.0,
            16.0,
        ),
        EdgeMarker::BallArrow => (
            format!(
                r#"<circle cx="5" cy="6" r="5" fill="{col}"/><path d="M 20,1 L 10,6 L 20,11 Z" fill="{col}"/>"#
            ),
            5.0,
            5.0,
            20.0,
        ),
        EdgeMarker::BallBarArrow => (
            format!(
                r#"<circle cx="5" cy="6" r="5" fill="{col}"/><rect x="21" y="1" width="1.5" height="10" fill="{col}"/><path d="M 20,1 L 10,6 L 20,11 Z" fill="{col}"/>"#
            ),
            5.0,
            5.0,
            23.0,
        ),
        EdgeMarker::None => unreachable!(),
    };
    defs.push_str(&format!(
        r#"<marker id="{id}" markerWidth="{mw}" markerHeight="{ms}" viewBox="0 0 {vw} 12" orient="auto" refX="{rx}" refY="6" markerUnits="userSpaceOnUse">{body}</marker>
"#,
        id = id,
        mw = fmt(ms * vb_w / 12.0),
        ms = fmt(ms),
        vw = fmt(vb_w),
        rx = fmt(ref_x),
        body = body,
    ));
    // Tuck the tip half a stroke into the border (matches the on-screen renderer) so thick
    // strokes join the node seamlessly instead of showing an anti-aliased seam.
    let gap = ((tip_x - ref_x) * scale - stroke_width / 2.0).max(0.0);
    Some((id, gap))
}

fn render_edge(
    edge: &StyledEdge,
    palette: &SvgPalette,
    idx: usize,
    out: &mut String,
    defs: &mut String,
) {
    if edge.points.len() < 2 {
        return;
    }
    let color = edge
        .color
        .clone()
        .unwrap_or_else(|| palette.arc_color.clone());
    let mut pts: Vec<Pt> = edge.points.iter().map(|p| (p[0], p[1])).collect();

    // Gradient stroke: axis runs from the first to the last routed point, mirroring the
    // on-screen source-center -> target-center linearGradient.
    let stroke_paint = if edge.gradient.len() >= 2 {
        let id = format!("gsvg-gr-{idx}");
        let first = pts[0];
        let last = pts[pts.len() - 1];
        defs.push_str(&format!(
            r#"<linearGradient id="{id}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">"#,
            x1 = fmt(first.0),
            y1 = fmt(first.1),
            x2 = fmt(last.0),
            y2 = fmt(last.1),
        ));
        for stop in &edge.gradient {
            defs.push_str(&format!(
                r#"<stop offset="{off}%" stop-color="{col}"/>"#,
                off = fmt(stop.offset * 100.0),
                col = xml_escape(&stop.color),
            ));
        }
        defs.push_str("</linearGradient>\n");
        format!("url(#{id})")
    } else {
        color.clone()
    };

    let marker_color = edge.marker_color.clone().unwrap_or_else(|| color.clone());
    let start_marker = ensure_marker(
        edge.marker_start,
        &marker_color,
        edge.width,
        edge.marker_size,
        idx,
        "s",
        defs,
    );
    let end_marker = ensure_marker(
        edge.marker_end,
        &marker_color,
        edge.width,
        edge.marker_size,
        idx,
        "e",
        defs,
    );

    // Simplify before trimming for the markers: trimming can leave a sub-pixel stub whose
    // direction orients the arrowhead, which a later clean pass would flatten and swing off the node.
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

    let raw_points = edge
        .points
        .iter()
        .map(|p| (p[0], p[1]))
        .collect::<Vec<Pt>>();
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
        col = xml_escape(&stroke_paint),
        sw = fmt(edge.width),
        dash = dash_attr,
        ms = marker_start_attr,
        me = marker_end_attr,
    ));

    // Match the on-screen `MultiDot` stacking where a cluster overlaps: hollow dots first,
    // filled on top; within a pass draw right-to-left, so the leftmost dot wins.
    let mut ordered: Vec<&EdgeDot> = edge.dots.iter().collect();
    ordered.sort_by(|a, b| b.at.total_cmp(&a.at));
    for pass_filled in [false, true] {
        for dot in ordered.iter().filter(|d| d.filled == pass_filled) {
            let (x, y) = polyline_point_at(&raw_points, dot.at);
            if dot.filled {
                let ring = dot
                    .stroke
                    .as_ref()
                    .map(|s| format!(r#" stroke="{}" stroke-width="1""#, xml_escape(s)))
                    .unwrap_or_default();
                out.push_str(&format!(
                    r#"<circle cx="{cx}" cy="{cy}" r="4.33" fill="{col}"{ring}/>
"#,
                    cx = fmt(x),
                    cy = fmt(y),
                    col = xml_escape(&dot.color),
                    ring = ring,
                ));
            } else {
                let ring = dot.stroke.as_deref().unwrap_or(&dot.color);
                out.push_str(&format!(
                    r#"<circle cx="{cx}" cy="{cy}" r="4.33" fill="{bg}" stroke="{col}" stroke-width="1"/>
"#,
                    cx = fmt(x),
                    cy = fmt(y),
                    bg = xml_escape(&palette.export_bg),
                    col = xml_escape(ring),
                ));
            }
        }
    }

    for label in &edge.labels {
        let (mut mx, mut my) = polyline_point_at(&raw_points, label.at);
        mx += label.dx;
        my += label.dy;
        // Glyph-hugging halo (background-colored stroke under the fill via paint-order) instead
        // of a filled chip: legible over arcs without a hard box, and stays opaque since SVG alpha support varies.
        let halo = label
            .bg
            .clone()
            .unwrap_or_else(|| palette.arc_label_bg.clone());
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
/// token-marking overflow and label word-wrap (only when a label opts in via `wrap`).
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
<g id="{g1_id}">
{g1}</g>
<g id="{g2_id}">
{g2}</g>
<g id="legend">
{legend}</g>
</svg>"#,
        vb_x = fmt(vb_x),
        vb_y = fmt(vb_y),
        w = fmt(width),
        h = fmt(height),
        defs = defs,
        bg = xml_escape(bg_color),
        g1_id = if graph.edges_on_top { "nodes" } else { "edges" },
        g1 = if graph.edges_on_top { &nodes_svg } else { &edges_svg },
        g2_id = if graph.edges_on_top { "edges" } else { "nodes" },
        g2 = if graph.edges_on_top { &edges_svg } else { &nodes_svg },
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
            edges_on_top: false,
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
                    marking: vec![MarkingGroup {
                        kind: MarkingKind::Dot,
                        color: None,
                        count: 1,
                        dashed: false,
                        radius: None,
                        step: None,
                        stroke: None,
                    }],
                    marking_dy: 0.0,
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
                        dx: 0.0,
                        wrap: true,
                        bullet: None,
                        bullet_color: None,
                    }],
                    marking: vec![],
                    marking_dy: 0.0,
                    icon: None,
                },
            ],
            edges: vec![StyledEdge {
                points: vec![[126.0, 100.0], [190.0, 100.0]],
                color: None,
                gradient: vec![],
                width: 2.0,
                dash: None,
                marker_start: EdgeMarker::None,
                marker_end: EdgeMarker::Arrow,
                marker_color: None,
                marker_size: None,
                labels: vec![EdgeLabel {
                    text: "3".into(),
                    at: 0.5,
                    dx: 0.0,
                    dy: 0.0,
                    bg: None,
                    color: None,
                }],
                dots: vec![],
                rounded: 0.0,
            }],
            legend: vec![LegendGroup {
                title: Some("Object types".into()),
                items: vec![LegendItem {
                    label: "orders".into(),
                    color: Some("#3b82f6".into()),
                }],
            }],
        }
    }

    #[test]
    fn svg_contains_required_elements() {
        let svg = render_graph_svg(&simple_graph(), &SvgPalette::default());
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
        assert!(
            svg.contains("<circle"),
            "must draw the circle node + its dot marking"
        );
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
        g.nodes[0].marking = vec![MarkingGroup {
            kind: MarkingKind::Dot,
            color: None,
            count: 50,
            dashed: false,
            radius: None,
            step: None,
            stroke: None,
        }];
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(svg.contains(">50<"), "50 tokens must collapse to a numeral");
    }

    #[test]
    fn node_icon_draws_triangle_or_square() {
        let mut g = simple_graph();
        g.nodes[0].icon = Some(StyledIcon {
            kind: IconKind::Triangle,
            color: None,
            scale: 0.3,
        });
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(
            svg.contains("<polygon"),
            "triangle icon must draw a polygon"
        );
    }

    #[test]
    fn arrow_tip_lands_on_node_border() {
        // Edge ends at target border x=190 (box cx=250, w=120); stroke 2 -> marker size 12, tuck = 1.
        // Path must stop at 190 - (10 - 1) = 181 so the tip sits at 191 = border + tuck.
        let svg = render_graph_svg(&simple_graph(), &SvgPalette::default());
        assert!(
            svg.contains(r#"refX="1.00""#),
            "arrow marker must anchor at its back"
        );
        assert!(
            svg.contains("L 181.00,100.00"),
            "path must stop one marker-span before the border"
        );
    }

    #[test]
    fn short_last_segment_keeps_entry_direction() {
        // Last segment is only 4 long, shorter than the 9-unit arrow gap; the trim must not walk
        // back across the corner (leaving a floating sideways arrowhead), so a stub survives instead.
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
        let g = StyledGraph {
            background: None,
            padding: 36.0,
            nodes: vec![],
            edges: vec![],
            edges_on_top: false,
            legend: vec![],
        };
        let svg = render_graph_svg(&g, &SvgPalette::default());
        assert!(svg.contains("<svg") && svg.contains("</svg>"));
    }
}
