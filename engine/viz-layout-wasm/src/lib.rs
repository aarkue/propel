use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn layout_graph(spec_json: &str) -> Result<String, String> {
    let spec = serde_json::from_str(spec_json).map_err(|e| e.to_string())?;
    let out = viz_layout::layout_graph(spec)?;
    serde_json::to_string(&out).map_err(|e| e.to_string())
}

/// On-drop relayout: re-route edges over the given final node positions (each node's `seed` is its
/// current centre). Same `GraphSpec` shape as `layout_graph`; returns unchanged centres + new routes.
#[wasm_bindgen]
pub fn reroute_graph(spec_json: &str) -> Result<String, String> {
    let spec = serde_json::from_str(spec_json).map_err(|e| e.to_string())?;
    let out = viz_layout::reroute_graph(spec)?;
    serde_json::to_string(&out).map_err(|e| e.to_string())
}

/// Draw a fully laid-out, fully styled `StyledGraph` to a standalone SVG string. Same renderer as the
/// backend's `export_graph_svg` binding, for components with no binding channel. `palette_json` empty
/// uses the default (light) palette.
#[wasm_bindgen]
pub fn export_graph_svg(graph_json: &str, palette_json: &str) -> Result<String, String> {
    let graph: viz_layout::StyledGraph =
        serde_json::from_str(graph_json).map_err(|e| e.to_string())?;
    let palette = if palette_json.is_empty() {
        viz_layout::SvgPalette::default()
    } else {
        serde_json::from_str(palette_json).map_err(|e| e.to_string())?
    };
    Ok(viz_layout::render_graph_svg(&graph, &palette))
}
