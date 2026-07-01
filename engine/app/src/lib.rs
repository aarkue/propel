//! Tauri target: runs the engine in a native desktop window.
//!
//! Commands mirror the wasm exports and match the frontend's `createTauriBackend`
//! (apps/studio/src/backends/tauri.ts). The same built studio `dist/` is embedded via
//! `frontendDist` in tauri.conf.json.

use std::fs::File;
use std::io::Write;
use std::str::FromStr;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use backend_shared::process_mining::bindings::RegistryItemKind;
use backend_shared::{Backend, ExtendedAppState};

// Force-link the open app-bindings crate so its registry entries are included. `extern crate` alone
// is dropped at opt-level 3 (its objects are never referenced); the #[used] anchor to a real symbol
// pulls the crate and all its inventory registrations.
extern crate app_bindings;
#[used]
static _FORCE_LINK_APP_BINDINGS: fn() -> String = app_bindings::app_ping;

struct TauriBackend<'b, 's> {
    app: &'b AppHandle,
    state: &'b State<'s, ExtendedAppState>,
}

impl<'b, 's> TauriBackend<'b, 's> {
    fn new(app: &'b AppHandle, state: &'b State<'s, ExtendedAppState>) -> Self {
        Self { app, state }
    }
}

impl Backend for TauriBackend<'_, '_> {
    fn get_state(&self) -> &ExtendedAppState {
        self.state
    }
    fn emit<S: Serialize + Clone>(&self, name: &str, data: S) -> Result<(), String> {
        self.app.emit(name, data).map_err(|e| e.to_string())
    }
}

#[derive(Serialize)]
struct LoadedObject {
    id: String,
    kind: String,
}

/// Paths the app was launched to open (OS file association / CLI args / macOS "Opened" events).
/// Drained by `get_initial_files` once the frontend is ready to import them.
#[derive(Default)]
struct InitialFiles(Mutex<Vec<String>>);

/// Resolve a launch argument to an existing file path. Accepts plain paths and `file://` URLs;
/// skips flags and anything that is not an existing file.
fn arg_to_file_path(arg: &str) -> Option<String> {
    if arg.starts_with('-') {
        return None;
    }
    let path = if arg.starts_with("file://") {
        tauri::Url::parse(arg)
            .ok()?
            .to_file_path()
            .ok()?
            .to_string_lossy()
            .to_string()
    } else {
        arg.to_string()
    };
    std::path::Path::new(&path).is_file().then_some(path)
}

/// Drain the paths the app was launched with (see [`InitialFiles`]). Empty after the first call
/// (or when launched without files), so the frontend can poll it on startup without re-importing.
#[tauri::command]
fn get_initial_files(state: State<'_, InitialFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut g| std::mem::take(&mut *g))
        .unwrap_or_default()
}

#[tauri::command]
async fn execute_binding(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    function_id: String,
    args: Value,
    output_name: Option<String>,
) -> Result<Value, String> {
    let backend = TauriBackend::new(&app, &state);
    let bytes =
        backend_shared::execute_binding(&backend, &function_id, &args, output_name.as_deref())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_all_objects_with_type(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
) -> Result<Vec<LoadedObject>, String> {
    let backend = TauriBackend::new(&app, &state);
    Ok(backend_shared::get_objects_with_type(&backend)?
        .into_iter()
        .map(|(id, kind)| LoadedObject { id, kind })
        .collect())
}

#[tauri::command]
async fn list_functions() -> Result<Value, String> {
    serde_json::to_value(backend_shared::list_functions()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_all_item_kinds() -> Result<Value, String> {
    serde_json::to_value(backend_shared::get_all_item_kinds()?).map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_item_bytes(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
    item_kind: String,
    data: Vec<u8>,
    format: String,
) -> Result<(), String> {
    let backend = TauriBackend::new(&app, &state);
    let kind = RegistryItemKind::from_str(&item_kind)
        .map_err(|_| format!("Unknown item kind: {item_kind}"))?;
    backend_shared::load_item_bytes(&backend, id, &kind, &data, &format)
}

#[tauri::command]
async fn export_object(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    name: String,
    format: String,
) -> Result<Vec<u8>, String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::export_object(&backend, &name, &format)
}

#[tauri::command]
async fn unload_object(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    name: String,
) -> Result<(), String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::unload_object(&backend, name)
}

#[tauri::command]
async fn load_artifact_bytes(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
    kind: String,
    data: Vec<u8>,
    format: String,
) -> Result<(), String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::load_artifact_bytes(&backend, id, &kind, &data, &format)
}

#[tauri::command]
async fn list_artifacts(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
) -> Result<Vec<LoadedObject>, String> {
    let backend = TauriBackend::new(&app, &state);
    Ok(backend_shared::list_artifacts(&backend)?
        .into_iter()
        .map(|(id, kind)| LoadedObject { id, kind })
        .collect())
}

#[tauri::command]
async fn get_artifact(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
) -> Result<Value, String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::get_artifact(&backend, &id)
}

#[tauri::command]
async fn unload_artifact(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
) -> Result<(), String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::unload_artifact(&backend, id)
}

#[tauri::command]
async fn export_artifact(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
    format: String,
) -> Result<Vec<u8>, String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::export_artifact(&backend, &id, &format)
}

#[tauri::command]
async fn load_artifact_path(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
    kind: String,
    path: String,
) -> Result<(), String> {
    let backend = TauriBackend::new(&app, &state);
    backend_shared::load_artifact_path(&backend, id, &kind, &path)
}

#[tauri::command]
async fn load_item_path(
    app: AppHandle,
    state: State<'_, ExtendedAppState>,
    id: String,
    item_kind: String,
    path: String,
) -> Result<(), String> {
    let backend = TauriBackend::new(&app, &state);
    let kind = RegistryItemKind::from_str(&item_kind)
        .map_err(|_| format!("Unknown item kind: {item_kind}"))?;
    backend_shared::load_item_path(&backend, id, &kind, &path)
}

#[tauri::command]
async fn save_bytes(app: AppHandle, data: Vec<u8>, filename: String) -> Result<(), String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    File::create(&path)
        .map_err(|e| e.to_string())?
        .write_all(&data)
        .map_err(|e| e.to_string())?;
    let _ = app.opener().reveal_item_in_dir(&path);
    Ok(())
}

// AppImage's bundled libwayland-client blanks the webview on Wayland (EGL_BAD_PARAMETER); re-exec
// once with the host lib preloaded. tauri-apps/tauri#11790.
#[cfg(all(desktop, target_os = "linux"))]
fn fix_appimage_wayland() {
    use std::os::unix::process::CommandExt;
    use std::path::Path;

    let appimage = std::env::var_os("APPIMAGE").is_some() || std::env::var_os("APPDIR").is_some();
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v == "wayland");
    if !appimage
        || !wayland
        || std::env::var_os("LD_PRELOAD").is_some()
        || std::env::var_os("PROPEL_WAYLAND_PRELOAD_DONE").is_some()
    {
        return;
    }

    let is_elf64 = |p: &Path| {
        use std::io::Read;
        let mut hdr = [0u8; 5];
        std::fs::File::open(p)
            .and_then(|mut f| f.read_exact(&mut hdr).map(|_| hdr))
            .is_ok_and(|h| &h[..4] == b"\x7fELF" && h[4] == 2)
    };
    const CANDIDATES: &[&str] = &[
        "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
        "/usr/lib64/libwayland-client.so.0",
        "/usr/lib/libwayland-client.so.0",
        "/lib/x86_64-linux-gnu/libwayland-client.so.0",
        "/lib64/libwayland-client.so.0",
    ];
    let Some(host) = CANDIDATES
        .iter()
        .map(Path::new)
        .find(|p| p.exists() && is_elf64(p))
    else {
        return;
    };
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    // exec() returns only on failure; fall through unpreloaded.
    let _ = std::process::Command::new(exe)
        .args(std::env::args_os().skip(1))
        .env("LD_PRELOAD", host)
        .env("PROPEL_WAYLAND_PRELOAD_DONE", "1")
        .exec();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(all(desktop, target_os = "linux"))]
    fix_appimage_wayland();

    // Keep WebKitGTK (Linux) GPU compositing ON for fast pan/zoom/edge animation.
    // The blurry reactflow we used to fix with WEBKIT_DISABLE_COMPOSITING_MODE=1 was caused by
    // `backdrop-filter` (radix translucent panels + some viewer CSS): WebKitGTK renders the
    // composited region behind such an element blurry. Fixed at the source (solid panels,
    // backdrop-filter removed from viewers), so we no longer disable compositing.
    // Set WEBKIT_DISABLE_COMPOSITING_MODE=1 before launch only as a slow last resort.

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .setup(|app| {
            app.manage(ExtendedAppState::default());
            // OS file association / CLI: on Linux & Windows the launch file paths arrive as process
            // args. (macOS delivers them via the `Opened` run event, handled below.)
            #[cfg(any(windows, target_os = "linux"))]
            let initial: Vec<String> = std::env::args()
                .skip(1)
                .filter_map(|a| arg_to_file_path(&a))
                .collect();
            #[cfg(not(any(windows, target_os = "linux")))]
            let initial: Vec<String> = Vec::new();
            app.manage(InitialFiles(Mutex::new(initial)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_binding,
            get_all_objects_with_type,
            list_functions,
            get_all_item_kinds,
            load_item_bytes,
            export_object,
            unload_object,
            load_artifact_bytes,
            list_artifacts,
            get_artifact,
            unload_artifact,
            export_artifact,
            load_artifact_path,
            load_item_path,
            save_bytes,
            get_initial_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS/iOS deliver "Open with" files at runtime via the Opened event. Append them and
            // notify the frontend, which re-polls `get_initial_files`.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &_event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if !paths.is_empty() {
                    if let Ok(mut g) = _app.state::<InitialFiles>().0.lock() {
                        g.extend(paths);
                    }
                    let _ = _app.emit("initial-files-changed", ());
                }
            }
        });
}
