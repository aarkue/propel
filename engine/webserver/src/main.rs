//! Webserver target: runs the engine in an axum process and serves the studio over HTTP.
//!
//! The API mirrors the wasm exports one-to-one and matches the contract the frontend's
//! `createHttpBackend` (apps/studio/src/backends/http.ts) speaks. The same built studio `dist/`
//! is served as static files, so dev (vite proxies `/api`) and prod (axum serves both) share it.

use std::convert::Infallible;
use std::str::FromStr;
use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query, State},
    http::{header, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use backend_shared::process_mining::bindings::RegistryItemKind;
use backend_shared::{Backend, ExtendedAppState};

// Force-link the open app-bindings crate so its registry entries are included. `extern crate` alone
// is a pure side-effect link the opt-level-3 build drops; the #[used] reference to a real symbol
// pulls the crate (one codegen unit, see engine/Cargo.toml) and all its inventory registrations.
extern crate app_bindings;
#[used]
static _FORCE_LINK_APP_BINDINGS: fn() -> String = app_bindings::app_ping;

#[derive(Clone)]
struct WebBackend {
    state: Arc<ExtendedAppState>,
    /// Engine events fanned out to connected SSE clients as `(event name, JSON payload)`.
    events: broadcast::Sender<(String, String)>,
}

impl Default for WebBackend {
    fn default() -> Self {
        let (events, _) = broadcast::channel(256);
        Self {
            state: Arc::new(ExtendedAppState::default()),
            events,
        }
    }
}

impl Backend for WebBackend {
    fn get_state(&self) -> &ExtendedAppState {
        &self.state
    }
    fn emit<S: Serialize + Clone>(&self, name: &str, data: S) -> Result<(), String> {
        let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
        // Best-effort: zero connected SSE clients (no subscribers) is not an error.
        let _ = self.events.send((name.to_string(), json));
        Ok(())
    }
}

/// Map a backend `Result<_, String>` error into a 500 with the message as the body text.
fn err(e: String) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e)
}

#[derive(Deserialize)]
struct CallReq {
    id: String,
    args: Value,
    #[serde(default)]
    output_name: Option<String>,
}

async fn call(
    State(b): State<WebBackend>,
    Json(req): Json<CallReq>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let bytes = backend_shared::execute_binding(&b, &req.id, &req.args, req.output_name.as_deref())
        .map_err(err)?;
    Ok(([(header::CONTENT_TYPE, "application/json")], bytes))
}

#[derive(Serialize)]
struct LoadedObject {
    id: String,
    kind: String,
}

async fn objects(State(b): State<WebBackend>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let objs = backend_shared::get_objects_with_type(&b).map_err(err)?;
    let out: Vec<LoadedObject> = objs
        .into_iter()
        .map(|(id, kind)| LoadedObject { id, kind })
        .collect();
    Ok(Json(out))
}

async fn functions() -> impl IntoResponse {
    Json(backend_shared::list_functions())
}

async fn item_kinds() -> Result<impl IntoResponse, (StatusCode, String)> {
    Ok(Json(backend_shared::get_all_item_kinds().map_err(err)?))
}

#[derive(Deserialize)]
struct LoadParams {
    id: String,
    kind: String,
    format: String,
}

async fn load(
    State(b): State<WebBackend>,
    Query(p): Query<LoadParams>,
    data: Bytes,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let kind = RegistryItemKind::from_str(&p.kind).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("Unknown item kind: {}", p.kind),
        )
    })?;
    backend_shared::load_item_bytes(&b, p.id, &kind, &data, &p.format).map_err(err)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct ExportParams {
    name: String,
    format: String,
}

async fn export(
    State(b): State<WebBackend>,
    Query(p): Query<ExportParams>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let bytes = backend_shared::export_object(&b, &p.name, &p.format).map_err(err)?;
    Ok(([(header::CONTENT_TYPE, "application/octet-stream")], bytes))
}

#[derive(Deserialize)]
struct UnloadParams {
    name: String,
}

async fn unload(
    State(b): State<WebBackend>,
    Query(p): Query<UnloadParams>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    backend_shared::unload_object(&b, p.name).map_err(err)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct LoadArtifactParams {
    id: String,
    kind: String,
    format: String,
}

async fn load_artifact(
    State(b): State<WebBackend>,
    Query(p): Query<LoadArtifactParams>,
    data: Bytes,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    backend_shared::load_artifact_bytes(&b, p.id, &p.kind, &data, &p.format).map_err(err)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn artifacts(State(b): State<WebBackend>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let v = backend_shared::list_artifacts(&b).map_err(err)?;
    let out: Vec<LoadedObject> = v
        .into_iter()
        .map(|(id, kind)| LoadedObject { id, kind })
        .collect();
    Ok(Json(out))
}

#[derive(Deserialize)]
struct ArtifactParams {
    id: String,
}

async fn artifact(
    State(b): State<WebBackend>,
    Query(p): Query<ArtifactParams>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    Ok(Json(backend_shared::get_artifact(&b, &p.id).map_err(err)?))
}

async fn unload_artifact(
    State(b): State<WebBackend>,
    Query(p): Query<ArtifactParams>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    backend_shared::unload_artifact(&b, p.id).map_err(err)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct ExportArtifactParams {
    id: String,
    format: String,
}

async fn export_artifact(
    State(b): State<WebBackend>,
    Query(p): Query<ExportArtifactParams>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let bytes = backend_shared::export_artifact(&b, &p.id, &p.format).map_err(err)?;
    Ok(([(header::CONTENT_TYPE, "application/octet-stream")], bytes))
}

/// Server-Sent Events stream of engine events (`objects-changed`, `import-*`, ...), so the http
/// transport live-reconciles like wasm/tauri. Each engine `emit` is forwarded as a named SSE event.
async fn events(State(b): State<WebBackend>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(b.events.subscribe()).filter_map(|msg| {
        msg.ok()
            .map(|(name, json)| Ok(Event::default().event(name).data(json)))
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[tokio::main]
async fn main() {
    let state = WebBackend::default();

    let api = Router::new()
        .route("/call", post(call))
        .route("/objects", get(objects))
        .route("/functions", get(functions))
        .route("/item-kinds", get(item_kinds))
        .route("/load", post(load))
        .route("/export", get(export))
        .route("/unload", post(unload))
        .route("/load-artifact", post(load_artifact))
        .route("/artifacts", get(artifacts))
        .route("/artifact", get(artifact))
        .route("/unload-artifact", post(unload_artifact))
        .route("/export-artifact", get(export_artifact))
        .route("/events", get(events))
        .layer(DefaultBodyLimit::disable());

    // Built studio assets. Overridable for deployment; defaults to the in-repo build output.
    let dist = std::env::var("PROPEL_DIST")
        .unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/studio/dist").into());
    let index = format!("{dist}/index.html");

    let app = Router::new()
        .nest("/api", api)
        // SPA: serve static files, falling back to index.html for client-side routes.
        .fallback_service(ServeDir::new(&dist).not_found_service(ServeFile::new(index)))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port: u16 = std::env::var("PROPEL_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3751);
    let addr = format!("0.0.0.0:{port}");
    println!("propel webserver on http://{addr}  (serving {dist})");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
