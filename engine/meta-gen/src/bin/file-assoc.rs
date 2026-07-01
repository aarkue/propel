//! Regenerates `bundle.fileAssociations` in `engine/app/tauri.conf.json` from the engine's own
//! import formats, so OS "Open with propel" stays in lockstep with what the engine can actually
//! parse. Sources of truth: `RegistryItemKind` (event logs / OCEL / ...) and `PropelArtifact`
//! (engine-stored values like PetriNet). Each kind delegates to its `Importable` impl.
//!
//! Run: `cargo run -p meta-gen --bin file-assoc [-- <tauri.conf.json path>]`.
//! Default path: `../app/tauri.conf.json` relative to this crate.

use std::collections::BTreeSet;

use backend_shared::{get_all_artifact_kinds, get_all_item_kinds};
use serde_json::{json, Value};

fn main() {
    // (display name, [(extension, mime)]) per kind, in a stable order. An extension is assigned to
    // the first kind that claims it (e.g. OCEL precedes the linked-OCEL variants in `all_kinds`,
    // so `.ocel`/`.json` land under "OCEL" and the redundant variants drop out).
    let mut assocs: Vec<(String, Vec<(String, String)>)> = Vec::new();
    let mut seen_ext: BTreeSet<String> = BTreeSet::new();

    let mut push =
        |name: String,
         formats: Vec<backend_shared::process_mining::core::io::ExtensionWithMime>| {
            let mut exts: Vec<(String, String)> = Vec::new();
            for f in formats {
                let ext = f.extension.trim_start_matches('.').to_string();
                if ext.is_empty() || !seen_ext.insert(ext.clone()) {
                    continue;
                }
                exts.push((ext, f.mime));
            }
            if !exts.is_empty() {
                assocs.push((name, exts));
            }
        };

    for info in get_all_item_kinds().expect("get_all_item_kinds") {
        let name = serde_json::to_value(&info.kind)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| format!("{:?}", info.kind));
        push(name, info.import_formats);
    }
    for info in get_all_artifact_kinds() {
        push(info.kind, info.import_formats);
    }

    let file_associations: Vec<Value> = assocs
        .into_iter()
        .map(|(name, exts)| {
            let mime = exts[0].1.clone();
            json!({
                "ext": exts.iter().map(|(e, _)| e.clone()).collect::<Vec<_>>(),
                "name": format!("{name} file"),
                "description": format!("{name} file"),
                "mimeType": mime,
                "role": "Editor",
            })
        })
        .collect();

    let conf_path = std::env::args().nth(1).unwrap_or_else(|| {
        concat!(env!("CARGO_MANIFEST_DIR"), "/../app/tauri.conf.json").to_string()
    });
    let src =
        std::fs::read_to_string(&conf_path).unwrap_or_else(|e| panic!("read {conf_path}: {e}"));
    // serde_json here has `preserve_order` (see Cargo.toml), so untouched keys keep their order.
    let mut conf: Value = serde_json::from_str(&src).expect("parse tauri.conf.json");
    conf["bundle"]["fileAssociations"] = Value::Array(file_associations);

    let mut out = serde_json::to_string_pretty(&conf).expect("serialize");
    out.push('\n');
    if out == src {
        eprintln!("file-assoc: {conf_path} already up to date");
        return;
    }
    std::fs::write(&conf_path, out).unwrap_or_else(|e| panic!("write {conf_path}: {e}"));
    eprintln!("file-assoc: updated {conf_path}");
}
