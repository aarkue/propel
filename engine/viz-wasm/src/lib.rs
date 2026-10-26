//! `process_mining::visualization::bindings` for the browser: [`call`] takes a binding's name and its
//! arguments as the same JSON object a backend's `callBinding` takes, so a host gets identical
//! results with or without a backend.
//!
//! Only what `@r4pm/components` needs is here. Bindings that return a `Scene` are left out, since
//! (de)serializing scenes would roughly double the wasm.

use std::borrow::Borrow;

use process_mining::core::process_models::dfg::DirectlyFollowsGraph;
use process_mining::core::process_models::object_centric::ocpn::json::ObjectCentricPetriNetJson;
use process_mining::core::process_models::oc_declare::OCDeclareArc;
use process_mining::core::process_models::ocdfg::OCDirectlyFollowsGraph;
use process_mining::core::process_models::process_tree::ProcessTree;
use process_mining::visualization::graphlay::json::{LayoutRequest, TreeRequest};
use process_mining::visualization::graphlay::svg::Palette;
use process_mining::visualization::graphlay::{Layout, Point};
use process_mining::visualization::oc_type_graph::OcTypeGraph;
use process_mining::visualization::{
    engine, layout_request, scene_from_layout, LayoutRequestOf, StyleOverrides, VisualizationError,
    Visualize,
};
use process_mining::AcceptingPetriNet;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Every binding names its model argument after the model.
#[derive(Deserialize)]
struct ModelArgs<M, O> {
    #[serde(
        alias = "net",
        alias = "dfg",
        alias = "ocdfg",
        alias = "arcs",
        alias = "tree",
        alias = "ocpn"
    )]
    graph: M,
    #[serde(default)]
    options: O,
}

#[derive(Deserialize)]
struct SvgArgs<M, O, S> {
    #[serde(
        alias = "net",
        alias = "dfg",
        alias = "ocdfg",
        alias = "arcs",
        alias = "tree",
        alias = "ocpn"
    )]
    graph: M,
    layout: Layout,
    #[serde(default)]
    options: O,
    #[serde(default)]
    style: S,
    #[serde(default)]
    overrides: StyleOverrides,
    palette: Option<Palette>,
}

#[derive(Deserialize)]
struct RequestArgs<R> {
    request: R,
}

#[derive(Deserialize)]
struct RerouteArgs {
    request: LayoutRequest,
    #[serde(default)]
    positions: Vec<Point>,
}

fn run<A: DeserializeOwned, R: Serialize>(
    args: &str,
    f: impl FnOnce(A) -> Result<R, VisualizationError>,
) -> Result<String, String> {
    let args: A = serde_json::from_str(args).map_err(|e| e.to_string())?;
    let out = f(args).map_err(|e| e.to_string())?;
    serde_json::to_string(&out).map_err(|e| e.to_string())
}

/// `<model>_layout_request` of the model `M`, read from JSON as `T`.
fn request<T, M>(args: &str) -> Result<String, String>
where
    T: DeserializeOwned + Borrow<M>,
    M: Visualize + ?Sized,
    M::Options: DeserializeOwned,
    LayoutRequestOf<M>: Serialize,
{
    run(args, |a: ModelArgs<T, M::Options>| {
        layout_request(a.graph.borrow(), &a.options)
    })
}

/// `<model>_svg_from_layout` of the model `M`, read from JSON as `T`.
fn svg_from_layout<T, M>(args: &str) -> Result<String, String>
where
    T: DeserializeOwned + Borrow<M>,
    M: Visualize + ?Sized,
    M::Options: DeserializeOwned,
    M::Style: DeserializeOwned,
{
    run(args, |a: SvgArgs<T, M::Options, M::Style>| {
        let model = a.graph.borrow();
        let scene = scene_from_layout(model, &a.layout, &a.options, &a.style, &a.overrides)?;
        Ok(engine::render_scene_svg(&scene, a.palette.as_ref()))
    })
}

/// Calls `$f::<T, M>(args)` for the model named `$model`, read from JSON as `T`.
macro_rules! by_model {
    ($model:expr, $f:ident, $args:expr) => {
        match $model {
            "dfg" => $f::<DirectlyFollowsGraph, DirectlyFollowsGraph>($args),
            "ocdfg" => $f::<OCDirectlyFollowsGraph, OCDirectlyFollowsGraph>($args),
            "oc_declare" => $f::<Vec<OCDeclareArc>, [OCDeclareArc]>($args),
            "petri_net" => $f::<AcceptingPetriNet, AcceptingPetriNet>($args),
            "ocpn" => $f::<ObjectCentricPetriNetJson, ObjectCentricPetriNetJson>($args),
            "process_tree" => $f::<ProcessTree, ProcessTree>($args),
            "oc_type_graph" => $f::<OcTypeGraph, OcTypeGraph>($args),
            other => Err(format!("viz-wasm has no model named {other}")),
        }
    };
}

/// Calls the visualization binding `name` with `args` (a JSON object keyed by argument name) and
/// returns its result as JSON.
#[wasm_bindgen]
pub fn call(name: &str, args: &str) -> Result<String, String> {
    match name {
        "layout_graph" => run(args, |a: RequestArgs<LayoutRequest>| {
            engine::layout_graph(&a.request)
        }),
        "reroute_graph" => run(args, |a: RerouteArgs| {
            engine::reroute_graph(&a.request, &a.positions)
        }),
        "layout_tree" => run(args, |a: RequestArgs<TreeRequest>| {
            engine::layout_tree(&a.request)
        }),
        _ => {
            if let Some(model) = name.strip_suffix("_layout_request") {
                by_model!(model, request, args)
            } else if let Some(model) = name.strip_suffix("_svg_from_layout") {
                by_model!(model, svg_from_layout, args)
            } else {
                Err(format!("viz-wasm has no binding named {name}"))
            }
        }
    }
}
