pub use process_mining;
use process_mining::{
    bindings::{self, RegistryItemKind},
    core::io::ExtensionWithMime,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};

use cache::ResultCache;
use std::sync::RwLock;
pub mod artifact;
pub mod cache;
pub mod jobs;
pub mod meta;
pub mod models;
pub mod oc_declare_file;
pub mod reflow_mapping_file;
pub use meta::{ItemMeta, ItemRole, ObjMeta, Provenance};
pub use state::{Backend, ExtendedAppState};
pub mod state {
    use std::collections::HashMap;
    use std::ops::Deref;
    use std::sync::RwLock;

    use process_mining::bindings::AppState;

    use serde::Serialize;

    use crate::artifact::PropelArtifact;
    use crate::meta::ObjMeta;

    #[derive(Default)]
    pub struct ExtendedAppState {
        pub inner: AppState,
        pub meta: ObjMeta,
        pub artifacts: RwLock<HashMap<String, PropelArtifact>>,
        /// Insertion order of registry-object / artifact ids, kept because the underlying maps
        /// are unordered; reconciled lazily so the frontend gets a stable order. See `reconcile_order`.
        pub object_order: RwLock<Vec<String>>,
        pub artifact_order: RwLock<Vec<String>>,
        pub results: crate::cache::ResultCache,
        pub jobs: crate::jobs::Jobs,
    }
    /// Deref to the wrapped `AppState` so existing `.items` / `.add` / `.contains_key` call
    /// sites keep working unchanged; only the lifecycle policy (`.meta`) is new.
    impl Deref for ExtendedAppState {
        type Target = AppState;
        fn deref(&self) -> &AppState {
            &self.inner
        }
    }

    pub trait Backend {
        fn get_state(&self) -> &ExtendedAppState;
        fn emit<S: Serialize + Clone>(&self, name: &str, data: S) -> Result<(), String>;
    }
}

/// Single generic signal the frontend subscribes to so every surface refreshes whenever the
/// loaded-object set changes, regardless of which path mutated it.
fn emit_objects_changed<B: Backend>(backend: &B) {
    let _ = backend.emit("objects-changed", ());
}

/// Drop what was computed from the item `id`: its converted copies and cached results. Called
/// whenever the item is replaced or removed.
fn forget_derived(st: &ExtendedAppState, id: &str) {
    st.results.invalidate(id);
    let prefix = format!("{id}__as__");
    let _ = st.meta.remove_with_prefix(&prefix);
    if let Ok(mut objects) = st.items.write() {
        objects.retain(|k, _| !k.starts_with(&prefix));
    }
}

/// Ask the running job `id` to stop. See [`execute_binding`].
pub fn cancel_job<B: Backend>(backend: &B, id: &str) {
    backend.get_state().jobs.cancel(id);
}

pub fn unload_object<B: Backend>(backend: &B, name: String) -> Result<(), String> {
    let st = backend.get_state();
    forget_derived(st, &name);
    st.meta.remove(&name);
    st.items.write().map_err(|e| e.to_string())?.remove(&name);
    emit_objects_changed(backend);
    Ok(())
}

fn emit_artifacts_changed<B: Backend>(backend: &B) {
    let _ = backend.emit("artifacts-changed", ());
}

pub fn load_artifact_bytes<B: Backend>(
    backend: &B,
    id: String,
    kind: &str,
    bytes: &[u8],
    format: &str,
) -> Result<(), String> {
    let a = crate::artifact::PropelArtifact::import_from_bytes(kind, bytes, format)?;
    backend
        .get_state()
        .artifacts
        .write()
        .map_err(|e| e.to_string())?
        .insert(id, a);
    emit_artifacts_changed(backend);
    Ok(())
}

pub fn load_artifact_path<B: Backend>(
    backend: &B,
    id: String,
    kind: &str,
    path: &str,
) -> Result<(), String> {
    let a = crate::artifact::PropelArtifact::import_from_path(kind, path)?;
    backend
        .get_state()
        .artifacts
        .write()
        .map_err(|e| e.to_string())?
        .insert(id, a);
    emit_artifacts_changed(backend);
    Ok(())
}

pub fn list_artifacts<B: Backend>(backend: &B) -> Result<Vec<ObjectInfo>, String> {
    let st = backend.get_state();
    let m = st.artifacts.read().map_err(|e| e.to_string())?;
    let present: HashSet<String> = m.keys().cloned().collect();
    let ordered = reconcile_order(&st.artifact_order, &present);
    Ok(ordered
        .into_iter()
        .filter_map(|id| {
            m.get(&id).map(|a| ObjectInfo {
                kind: a.kind().to_string(),
                label: st.meta.label_of(&id),
                provenance: st.meta.provenance_of(&id),
                id,
            })
        })
        .collect())
}

pub fn get_artifact<B: Backend>(backend: &B, id: &str) -> Result<serde_json::Value, String> {
    let m = backend
        .get_state()
        .artifacts
        .read()
        .map_err(|e| e.to_string())?;
    m.get(id)
        .ok_or_else(|| "Artifact not found".to_string())?
        .to_json()
}

pub fn unload_artifact<B: Backend>(backend: &B, id: String) -> Result<(), String> {
    let st = backend.get_state();
    st.artifacts.write().map_err(|e| e.to_string())?.remove(&id);
    st.meta.set_label(&id, None);
    emit_artifacts_changed(backend);
    Ok(())
}

pub fn export_artifact<B: Backend>(backend: &B, id: &str, format: &str) -> Result<Vec<u8>, String> {
    let m = backend
        .get_state()
        .artifacts
        .read()
        .map_err(|e| e.to_string())?;
    m.get(id)
        .ok_or_else(|| "Artifact not found".to_string())?
        .export_to_bytes(format)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryItemInfo {
    pub kind: RegistryItemKind,
    pub import_formats: Vec<ExtensionWithMime>,
    pub export_formats: Vec<ExtensionWithMime>,
    pub convertible_to: Vec<RegistryItemKind>,
}
pub fn get_all_item_kinds() -> Result<Vec<RegistryItemInfo>, String> {
    Ok(RegistryItemKind::all_registered_kinds()
        .into_iter()
        .filter(|k| !models::is_hidden_kind(k))
        .map(|k| {
            let mut import_formats = k.known_import_formats();
            import_formats.extend(models::extra_import_formats(&k));
            RegistryItemInfo {
                kind: k,
                import_formats,
                export_formats: k.known_export_formats(),
                convertible_to: k.convertible_to(),
            }
        })
        .collect())
}

/// Import/export formats for a Propel artifact kind (the non-registry, engine-stored values like
/// OC-DECLARE models). Parallels [`RegistryItemInfo`] so callers can treat both uniformly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactKindInfo {
    pub kind: String,
    pub import_formats: Vec<ExtensionWithMime>,
    pub export_formats: Vec<ExtensionWithMime>,
}
pub fn get_all_artifact_kinds() -> Vec<ArtifactKindInfo> {
    use crate::artifact::PropelArtifact;
    PropelArtifact::KINDS
        .iter()
        .map(|&kind| ArtifactKindInfo {
            kind: kind.to_string(),
            import_formats: PropelArtifact::known_import_formats(kind),
            export_formats: PropelArtifact::known_export_formats(kind),
        })
        .collect()
}

/// Import an item from `data`. An object-centric log reports its progress as job `id` and can be
/// cancelled with [`cancel_job`].
pub fn load_item_bytes<B: Backend + Sync>(
    backend: &B,
    id: String,
    item_kind: &RegistryItemKind,
    data: &[u8],
    format: &str,
) -> Result<(), String> {
    let _ = backend.emit("import-started", &id);
    let loaded = jobs::with_job(backend, Some(&id), |ctl| {
        models::load_from_bytes_with(item_kind, data, format, ctl)
    });
    match loaded {
        Ok(item) => {
            forget_derived(backend.get_state(), &id);
            backend.get_state().add(id.clone(), item);
            let _ = backend.emit("import-finished", &id);
            emit_objects_changed(backend);
            Ok(())
        }
        Err(e) if e == jobs::CANCELLED => {
            let _ = backend.emit("import-cancelled", &id);
            Err(e)
        }
        Err(e) => {
            let _ = backend.emit("import-failed", serde_json::json!({ "id": id, "error": e }));
            Err(e)
        }
    }
}

/// [`load_item_bytes`] from a file at `path`.
pub fn load_item_path<B: Backend + Sync>(
    backend: &B,
    id: String,
    item_kind: &RegistryItemKind,
    path: &str,
) -> Result<(), String> {
    let _ = backend.emit("import-started", &id);
    let loaded = jobs::with_job(backend, Some(&id), |ctl| {
        models::load_from_path_with(item_kind, path, ctl)
    });
    match loaded {
        Ok(item) => {
            forget_derived(backend.get_state(), &id);
            backend.get_state().add(id.clone(), item);
            let _ = backend.emit("import-finished", &id);
            emit_objects_changed(backend);
            Ok(())
        }
        Err(e) if e == jobs::CANCELLED => {
            let _ = backend.emit("import-cancelled", &id);
            Err(e)
        }
        Err(e) => {
            let _ = backend.emit("import-failed", serde_json::json!({ "id": id, "error": e }));
            Err(e)
        }
    }
}

/// A loaded registry object as the frontend sees it: handle `id`, registry `kind`, and the
/// optional user-facing `label` (absent when the user never renamed it, so the UI shows the id).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectInfo {
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    /// Recorded lineage when this object was produced by a binding (transform/discovery); absent for imports.
    pub provenance: Option<Provenance>,
}

/// The ids in `present`, in insertion order: drop remembered ids that are gone, append ones we
/// haven't seen. Gives the frontend a stable "newest last" order over the unordered stores.
fn reconcile_order(order_lock: &RwLock<Vec<String>>, present: &HashSet<String>) -> Vec<String> {
    let mut order = order_lock.write().unwrap();
    order.retain(|id| present.contains(id));
    // Append ids we have not seen. Normally one appears at a time (each add re-lists), so this is
    // plain insertion order; sorting only breaks ties when several first show up in the same call.
    let mut newcomers: Vec<&String> = present.iter().filter(|id| !order.contains(id)).collect();
    newcomers.sort();
    order.extend(newcomers.into_iter().cloned());
    order.clone()
}

pub fn get_objects_with_type<B: Backend>(backend: &B) -> Result<Vec<ObjectInfo>, String> {
    let st = backend.get_state();
    let meta = &st.meta;
    let objects = st.items.read().map_err(|e| e.to_string())?;
    let present: HashSet<String> = objects
        .iter()
        .filter(|(name, _)| !meta.is_hidden(name))
        .map(|(name, _)| name.clone())
        .collect();
    let ordered = reconcile_order(&st.object_order, &present);
    Ok(ordered
        .into_iter()
        .filter_map(|id| {
            objects.get(&id).map(|object| ObjectInfo {
                kind: object.kind().to_string(),
                label: meta.label_of(&id),
                provenance: meta.provenance_of(&id),
                id,
            })
        })
        .collect())
}

/// Set (or, when `label` is empty/blank, clear) the user-facing display label for object `id`;
/// emits `objects-changed` so every surface picks up the new name.
pub fn set_object_label<B: Backend>(
    backend: &B,
    id: String,
    label: Option<String>,
) -> Result<(), String> {
    let label = label.filter(|l| !l.trim().is_empty());
    backend.get_state().meta.set_label(&id, label);
    emit_objects_changed(backend);
    Ok(())
}

pub fn export_object<B: Backend>(backend: &B, name: &str, format: &str) -> Result<Vec<u8>, String> {
    let lock = backend
        .get_state()
        .items
        .read()
        .map_err(|e| e.to_string())?;
    if let Some(object) = lock.get(name) {
        object.export_to_bytes(format).map_err(|e| e.to_string())
    } else {
        Err("Object not found".to_string())
    }
}

/// Export an object straight to a filesystem path, in an explicitly named `format`.
///
/// Unlike [`export_object`], this handles the OCEL 2.0 bundled format's uncompressed directory
/// form (which has no byte stream) and avoids materializing a large log just to cross IPC.
pub fn export_object_to_path<B: Backend>(
    backend: &B,
    name: &str,
    format: &str,
    path: &str,
) -> Result<(), String> {
    let lock = backend
        .get_state()
        .items
        .read()
        .map_err(|e| e.to_string())?;
    if let Some(object) = lock.get(name) {
        object.export_to_path_as(path, format)
    } else {
        Err("Object not found".to_string())
    }
}

pub fn list_functions() -> Vec<bindings::BindingMeta> {
    bindings::list_functions_meta()
}

/// A single planned argument conversion: the item referenced by `arg_name` (`src_id`) should be
/// materialized as `derived_id` of `target_kind`, and the argument swapped to point at it.
pub struct ConvPlan {
    pub arg_name: String,
    pub src_id: String,
    pub target_kind: String,
    pub derived_id: String,
}

/// Pure planner: for each registry-ref argument whose passed id has a different but convertible
/// kind, plan a conversion to the wanted kind. `kind_of` maps a stored id to its current kind.
pub fn plan_conversions(
    args: &Value,
    arg_schemas: &[(String, Value)],
    kind_of: impl Fn(&str) -> Option<String>,
) -> Vec<ConvPlan> {
    let mut out = Vec::new();
    let obj = match args.as_object() {
        Some(o) => o,
        None => return out,
    };
    for (name, schema) in arg_schemas {
        let want = match schema.get("x-registry-ref").and_then(|v| v.as_str()) {
            Some(w) => w,
            None => continue,
        };
        // A `&mut` binding would change the converted copy, not the passed item.
        if schema.get("x-registry-mut").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let id = match obj.get(name).and_then(|v| v.as_str()) {
            Some(i) => i,
            None => continue,
        };
        let have = match kind_of(id) {
            Some(h) => h,
            None => continue,
        };
        if have == want {
            continue;
        }
        let have_kind: RegistryItemKind = match have.parse() {
            Ok(k) => k,
            Err(_) => continue,
        };
        let want_kind: RegistryItemKind = match want.parse() {
            Ok(k) => k,
            Err(_) => continue,
        };
        if !have_kind.convertible_to().contains(&want_kind) {
            continue;
        }
        out.push(ConvPlan {
            arg_name: name.clone(),
            src_id: id.to_string(),
            target_kind: want.to_string(),
            derived_id: format!("{id}__as__{want}"),
        });
    }
    out
}

/// Ids of the args whose schema is a registry reference (`x-registry-ref`).
pub fn registry_ref_arg_ids(args: &Value, arg_schemas: &[(String, Value)]) -> Vec<String> {
    let obj = match args.as_object() {
        Some(o) => o,
        None => return Vec::new(),
    };
    arg_schemas
        .iter()
        .filter(|(_, schema)| {
            schema
                .get("x-registry-ref")
                .and_then(|v| v.as_str())
                .is_some()
        })
        .filter_map(|(name, _)| obj.get(name).and_then(|v| v.as_str()).map(String::from))
        .collect()
}

/// `None` when the call reads no registry objects.
pub fn build_provenance(
    function_id: &str,
    args: &Value,
    arg_schemas: &[(String, Value)],
    gen_of: impl Fn(&str) -> u64,
) -> Option<Provenance> {
    let sources = registry_ref_arg_ids(args, arg_schemas);
    if sources.is_empty() {
        return None;
    }
    let source_gen = sources.iter().map(|id| gen_of(id)).max().unwrap_or(0);
    let op = serde_json::json!({ "fn": function_id, "args": args });
    Some(Provenance {
        sources,
        op,
        source_gen,
    })
}

/// Whether the cached derived object `derived_id` was built from the current generation of its
/// source (so it can be reused instead of rebuilt).
fn is_fresh(meta: &ObjMeta, derived_id: &str, src_gen: u64) -> bool {
    meta.provenance_source_gen(derived_id) == Some(src_gen)
}

/// Decide whether a binding result should be re-keyed to a caller-supplied name: applies only
/// when a name is given and the call minted exactly one handle.
pub fn decide_rename(minted: &[String], output_name: Option<&str>) -> Option<(String, String)> {
    match (minted, output_name) {
        ([id], Some(name)) => Some((id.clone(), name.to_string())),
        _ => None,
    }
}

/// Store each registry-ref argument passed inline (as JSON, e.g., a pipeline's by-value Petri net)
/// as a hidden temporary item and point the argument at it. Returns the temporary ids.
fn store_inline_handles(
    st: &ExtendedAppState,
    args: &mut Value,
    arg_schemas: &[(String, Value)],
) -> Result<Vec<String>, String> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let mut stored = Vec::new();
    let Some(obj) = args.as_object_mut() else {
        return Ok(stored);
    };
    for (name, schema) in arg_schemas {
        let Some(kind) = schema.get("x-registry-ref").and_then(Value::as_str) else {
            continue;
        };
        let Some(value) = obj.get(name).filter(|v| v.is_object() || v.is_array()) else {
            continue;
        };
        let item = kind
            .parse::<RegistryItemKind>()
            .and_then(|k| bindings::RegistryItem::from_json_value(&k, value))
            .map_err(|e| format!("Invalid argument '{name}': {e}"));
        let item = match item {
            Ok(item) => item,
            Err(e) => {
                remove_temporary(st, &stored);
                return Err(e);
            }
        };
        let id = format!("__inline__{}", NEXT.fetch_add(1, Ordering::Relaxed));
        st.add(id.clone(), item);
        st.meta.set(
            &id,
            ItemMeta {
                role: ItemRole::Derived,
                generation: 0,
                provenance: None,
            },
        );
        obj.insert(name.clone(), Value::String(id.clone()));
        stored.push(id);
    }
    Ok(stored)
}

/// The reverse of [`store_inline_handles`]: an argument that takes a model by value (an object
/// schema titled with a model kind, e.g. `AcceptingPetriNet`) also accepts the id of a stored
/// model of that kind, so a saved model can be passed wherever its JSON is expected.
fn inline_stored_models(
    st: &ExtendedAppState,
    args: &mut Value,
    arg_schemas: &[(String, Value)],
) -> Result<(), String> {
    let Some(obj) = args.as_object_mut() else {
        return Ok(());
    };
    let items = st.items.read().map_err(|e| e.to_string())?;
    for (name, schema) in arg_schemas {
        if schema.get("x-registry-ref").is_some() || schema.get("type") != Some(&json!("object")) {
            continue;
        }
        let Some(title) = schema.get("title").and_then(Value::as_str) else {
            continue;
        };
        let Some(item) = obj
            .get(name)
            .and_then(Value::as_str)
            .and_then(|id| items.get(id))
        else {
            continue;
        };
        if matches!(item.kind(), RegistryItemKind::Custom(k) if k == title) {
            obj.insert(name.clone(), item.to_value()?);
        }
    }
    Ok(())
}

/// The registry items an argument object names: every top-level string that is a stored id.
fn items_read(st: &ExtendedAppState, args: &Value) -> Vec<String> {
    let Ok(items) = st.items.read() else {
        return Vec::new();
    };
    args.as_object()
        .into_iter()
        .flat_map(|o| o.values())
        .filter_map(Value::as_str)
        .filter(|id| items.contains_key(*id))
        .map(String::from)
        .collect()
}

fn remove_temporary(st: &ExtendedAppState, ids: &[String]) {
    for id in ids {
        st.remove(id);
        st.meta.remove(id);
    }
}

/// Run binding `function_id`. With a `job` id, it reports progress and partial results as
/// `job-update` events and stops on [`cancel_job`], failing with [`jobs::CANCELLED`].
pub fn execute_binding<B: Backend + Sync>(
    backend: &B,
    function_id: &str,
    args: &Value,
    output_name: Option<&str>,
    job: Option<&str>,
) -> Result<Vec<u8>, String> {
    let binding =
        bindings::get_fn_binding(function_id).ok_or_else(|| "Unknown function ID".to_string())?;
    let st = backend.get_state();
    let arg_schemas = (binding.args)();
    // Provenance sources are the user-supplied ids, captured before the __as__ conversion below may
    // rewrite an arg to point at a hidden derived object.
    let original_args = args.clone();
    // Bindings declared under `process_mining::bindings` read or change the registry itself, and a
    // named output, an `output_id` or a `&mut` argument changes state, so only the rest are pure
    // functions of their args.
    let cache_key = (!binding.module.starts_with("process_mining::bindings")
        && output_name.is_none()
        && arg_schemas
            .iter()
            .all(|(n, s)| n != "output_id" && s.get("x-registry-mut").is_none()))
    .then(|| ResultCache::key(function_id, args))
    .flatten();
    if let Some(hit) = cache_key.as_deref().and_then(|k| st.results.get(k)) {
        return Ok(hit);
    }
    let cache_epoch = st.results.epoch();
    let read = items_read(st, &original_args);
    let mut args = args.clone();
    inline_stored_models(st, &mut args, &arg_schemas)?;
    let inline_ids = store_inline_handles(st, &mut args, &arg_schemas)?;

    // The temporary inline items go on every path, also when a conversion below fails.
    let outcome = (|| -> Result<_, String> {
        // Transparently convert registry-ref arguments whose passed object is of a different but
        // convertible kind, caching the result as a hidden `{src}__as__{Kind}` derived item.
        let plans = {
            let kind_of = |id: &str| {
                st.items
                    .read()
                    .ok()
                    .and_then(|m| m.get(id).map(|i| i.kind().to_string()))
            };
            plan_conversions(&args, &arg_schemas, kind_of)
        };
        for p in &plans {
            let src_gen = st.meta.generation_of(&p.src_id);
            if !st.contains_key(&p.derived_id) || !is_fresh(&st.meta, &p.derived_id, src_gen) {
                let converted = {
                    let items = st.items.read().map_err(|e| e.to_string())?;
                    let item = items.get(&p.src_id).ok_or("source not found")?;
                    item.convert(p.target_kind.parse()?)?
                };
                st.add(p.derived_id.clone(), converted);
                st.meta.set(
                    &p.derived_id,
                    ItemMeta {
                        role: ItemRole::Derived,
                        generation: 0,
                        provenance: Some(Provenance {
                            sources: vec![p.src_id.clone()],
                            op: format!("convert:{}", p.target_kind).into(),
                            source_gen: src_gen,
                        }),
                    },
                );
            }
            if let Some(obj) = args.as_object_mut() {
                obj.insert(p.arg_name.clone(), Value::String(p.derived_id.clone()));
            }
        }

        let outcome = jobs::with_job(backend, job, |ctl| {
            bindings::call_with_outcome(binding, &args, &st.inner, ctl)
        })
        .map_err(|e| match e {
            bindings::CallError::Cancelled => jobs::CANCELLED.to_string(),
            bindings::CallError::Failed(msg) => msg,
        });
        Ok(outcome)
    })();
    remove_temporary(st, &inline_ids);
    let outcome = outcome?;
    if let Ok(o) = &outcome {
        for id in o.mutated.iter().chain(&o.minted) {
            st.meta.bump_generation(id);
            forget_derived(st, id);
        }
        if !o.minted.is_empty() || !o.mutated.is_empty() {
            emit_objects_changed(backend);
        }
    }

    let provenance = build_provenance(function_id, &original_args, &arg_schemas, |id| {
        st.meta.generation_of(id)
    });

    // If the caller named the output and the call minted exactly one handle, re-key it to that
    // deterministic name, letting the pipeline overwrite a node's prior intermediate on re-run.
    let outcome = outcome?;
    if let Some((old, new)) = decide_rename(&outcome.minted, output_name) {
        forget_derived(st, &new);
        // The minted id lives on only as `new`.
        st.meta.remove(&old);
        let replaced = match st.items.write() {
            Ok(mut items) => match items.remove(&old) {
                Some(item) => items.insert(new.clone(), item).is_some(),
                None => false,
            },
            Err(_) => false,
        };
        // A re-run replaces the item under the same name, so the generation must move on, or a
        // conversion cached from the previous item would still count as fresh.
        let generation = if replaced {
            st.meta.generation_of(&new) + 1
        } else {
            0
        };
        st.meta.set(
            &new,
            ItemMeta {
                role: ItemRole::Result,
                generation,
                provenance,
            },
        );
        return serde_json::to_vec(&new).map_err(|e| e.to_string());
    }

    if let Some(key) = cache_key {
        if outcome.minted.is_empty() && outcome.mutated.is_empty() {
            st.results
                .put(key, read, outcome.result.clone(), cache_epoch);
        }
    }

    // Un-renamed produced object: still record lineage on the minted handle.
    if let Some(prov) = provenance {
        for minted_id in outcome.minted.iter().filter(|id| st.contains_key(id)) {
            let role = st.meta.role_of(minted_id);
            let generation = st.meta.generation_of(minted_id);
            st.meta.set(
                minted_id,
                ItemMeta {
                    role,
                    generation,
                    provenance: Some(prov.clone()),
                },
            );
        }
    }
    Ok(outcome.result)
}

#[cfg(test)]
mod convert_dispatch_tests {
    use super::{build_provenance, plan_conversions, registry_ref_arg_ids};
    use serde_json::json;

    fn schemas() -> Vec<(String, serde_json::Value)> {
        vec![(
            "log_proj".into(),
            json!({ "x-registry-ref": "EventLogActivityProjection" }),
        )]
    }

    #[test]
    fn collects_registry_ref_arg_ids() {
        let schemas = vec![
            (
                "event_log".to_string(),
                json!({ "x-registry-ref": "EventLog" }),
            ),
            ("transforms".to_string(), json!({ "type": "array" })),
        ];
        let args = json!({ "event_log": "log1", "transforms": [] });
        assert_eq!(
            registry_ref_arg_ids(&args, &schemas),
            vec!["log1".to_string()]
        );
        let plain = vec![("n".to_string(), json!({ "type": "number" }))];
        assert!(registry_ref_arg_ids(&json!({ "n": 1 }), &plain).is_empty());
    }

    #[test]
    fn builds_provenance_from_registry_args() {
        let schemas = vec![(
            "event_log".to_string(),
            json!({ "x-registry-ref": "EventLog" }),
        )];
        let args = json!({ "event_log": "log1", "transforms": [{ "FilterActivities": {} }] });
        let p = build_provenance("apply_event_log_transforms", &args, &schemas, |id| {
            if id == "log1" {
                3
            } else {
                0
            }
        })
        .unwrap();
        assert_eq!(p.sources, vec!["log1".to_string()]);
        assert_eq!(p.source_gen, 3);
        assert_eq!(p.op["fn"], "apply_event_log_transforms");
        assert_eq!(p.op["args"], args);
    }

    #[test]
    fn no_provenance_without_registry_args() {
        let schemas = vec![("x".to_string(), json!({ "type": "number" }))];
        assert!(build_provenance("f", &json!({ "x": 1 }), &schemas, |_| 0).is_none());
    }

    #[test]
    fn plans_conversion_when_kind_differs_and_convertible() {
        let args = json!({ "log_proj": "mylog" });
        let plans = plan_conversions(&args, &schemas(), |id| {
            if id == "mylog" {
                Some("EventLog".into())
            } else {
                None
            }
        });
        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].derived_id, "mylog__as__EventLogActivityProjection");
        assert_eq!(plans[0].src_id, "mylog");
        assert_eq!(plans[0].target_kind, "EventLogActivityProjection");
    }

    #[test]
    fn no_plan_when_kind_matches() {
        let args = json!({ "log_proj": "p" });
        let plans = plan_conversions(&args, &schemas(), |_| {
            Some("EventLogActivityProjection".into())
        });
        assert!(plans.is_empty());
    }

    #[test]
    fn no_plan_when_arg_is_not_a_known_id() {
        let args = json!({ "log_proj": "p" });
        let plans = plan_conversions(&args, &schemas(), |_| None);
        assert!(plans.is_empty());
    }

    #[test]
    fn no_plan_for_non_registry_arg() {
        let args = json!({ "threshold": 0.5 });
        let schemas = vec![("threshold".into(), json!({ "type": "number" }))];
        let plans = plan_conversions(&args, &schemas, |_| Some("EventLog".into()));
        assert!(plans.is_empty());
    }

    #[test]
    fn no_plan_for_mut_registry_arg() {
        let args = json!({ "ocel": "o" });
        let schemas = vec![(
            "ocel".into(),
            json!({ "x-registry-ref": "SlimLinkedOCEL", "x-registry-mut": true }),
        )];
        let plans = plan_conversions(&args, &schemas, |_| Some("OCEL".into()));
        assert!(plans.is_empty());
    }
}

#[cfg(test)]
mod rename_tests {
    use super::decide_rename;
    #[test]
    fn renames_single_new_handle_when_named() {
        assert_eq!(
            decide_rename(&["res_abc".into()], Some("pipe__n1")),
            Some(("res_abc".into(), "pipe__n1".into()))
        );
    }
    #[test]
    fn no_rename_when_no_output_name() {
        assert_eq!(decide_rename(&["res_abc".into()], None), None);
    }
    #[test]
    fn no_rename_unless_exactly_one_minted() {
        assert_eq!(decide_rename(&[], Some("x")), None);
        assert_eq!(decide_rename(&["a".into(), "b".into()], Some("x")), None);
    }
}

#[cfg(test)]
mod artifact_store_tests {
    use super::*;
    use std::sync::Mutex;

    struct StubBackend {
        state: ExtendedAppState,
        events: Mutex<Vec<String>>,
    }
    impl Backend for StubBackend {
        fn get_state(&self) -> &ExtendedAppState {
            &self.state
        }
        fn emit<S: serde::Serialize + Clone>(&self, name: &str, _data: S) -> Result<(), String> {
            self.events.lock().unwrap().push(name.to_string());
            Ok(())
        }
    }
    fn backend() -> StubBackend {
        StubBackend {
            state: ExtendedAppState::default(),
            events: Mutex::new(Vec::new()),
        }
    }
    const MODEL: &str = r#"{"version":1,"arcs":[],"nodes":[{"name":"a"}]}"#;

    const LOCEL_NEW: &str = "process_mining::locel_new";

    #[test]
    fn a_cancelled_job_fails_as_cancelled_and_stores_nothing() {
        let b = backend();
        cancel_job(&b, "job-1");
        let out = execute_binding(&b, LOCEL_NEW, &json!({}), None, Some("job-1"));
        assert_eq!(out, Err(jobs::CANCELLED.to_string()));
        assert!(get_objects_with_type(&b).unwrap().is_empty());
        // A finished job is forgotten, so its id can run again.
        assert!(execute_binding(&b, LOCEL_NEW, &json!({}), None, Some("job-1")).is_ok());
    }

    #[test]
    fn an_ocel_import_reports_progress_as_the_job_of_its_id() {
        let b = backend();
        let ocel = br#"{"objectTypes":[],"eventTypes":[],"objects":[],"events":[]}"#;
        let kind = RegistryItemKind::SlimLinkedOCEL;
        load_item_bytes(&b, "log".into(), &kind, ocel, "json").unwrap();
        let events = b.events.lock().unwrap().clone();
        assert!(events.contains(&"job-update".to_string()), "{events:?}");
        cancel_job(&b, "log2");
        let out = load_item_bytes(&b, "log2".into(), &kind, ocel, "json");
        assert_eq!(out, Err(jobs::CANCELLED.to_string()));
        assert!(b
            .events
            .lock()
            .unwrap()
            .contains(&"import-cancelled".to_string()));
    }

    #[test]
    fn an_xes_import_reports_progress_and_cancels() {
        let b = backend();
        let xes =
            br#"<log><trace><event><string key="concept:name" value="a"/></event></trace></log>"#;
        let kind = RegistryItemKind::EventLog;
        load_item_bytes(&b, "log".into(), &kind, xes, "xes").unwrap();
        assert!(b.events.lock().unwrap().contains(&"job-update".to_string()));
        cancel_job(&b, "log2");
        let out = load_item_bytes(&b, "log2".into(), &kind, xes, "xes");
        assert_eq!(out, Err(jobs::CANCELLED.to_string()));
        // A cancel after an import finished does not stop the next import of that id.
        cancel_job(&b, "log");
        assert!(load_item_bytes(&b, "log".into(), &kind, xes, "xes").is_ok());
    }

    #[test]
    fn an_ocel_path_import_reports_progress_too() {
        let b = backend();
        let path = std::env::temp_dir().join(format!("propel-job-{}.jsonocel", std::process::id()));
        std::fs::write(
            &path,
            br#"{"objectTypes":[],"eventTypes":[],"objects":[],"events":[]}"#,
        )
        .unwrap();
        let kind = RegistryItemKind::SlimLinkedOCEL;
        let out = load_item_path(&b, "log".into(), &kind, path.to_str().unwrap());
        std::fs::remove_file(&path).unwrap();
        out.unwrap();
        assert!(b.events.lock().unwrap().contains(&"job-update".to_string()));
    }

    #[test]
    fn load_list_get_unload_artifact() {
        let b = backend();
        load_artifact_bytes(
            &b,
            "net1".into(),
            "OCDeclare",
            MODEL.as_bytes(),
            "ocdeclare",
        )
        .unwrap();
        assert_eq!(
            list_artifacts(&b).unwrap(),
            vec![ObjectInfo {
                id: "net1".to_string(),
                kind: "OCDeclare".to_string(),
                label: None,
                provenance: None,
            }]
        );
        assert!(get_artifact(&b, "net1").unwrap().get("nodes").is_some());
        assert!(b
            .events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e == "artifacts-changed"));
        unload_artifact(&b, "net1".into()).unwrap();
        assert!(list_artifacts(&b).unwrap().is_empty());
    }

    #[test]
    fn export_artifact_round_trips() {
        let b = backend();
        load_artifact_bytes(&b, "n".into(), "OCDeclare", MODEL.as_bytes(), "ocdeclare").unwrap();
        let bytes = export_artifact(&b, "n", "ocdeclare").unwrap();
        assert!(!bytes.is_empty());
    }

    /// A named binding output is a pipeline intermediate and is hidden from `/objects` on purpose;
    /// the failure mode is silent (object exists, never shows up as a dataset), so pin both halves.
    #[test]
    fn named_binding_output_is_hidden_but_an_unnamed_one_is_listed() {
        let b = backend();
        let unnamed = execute_binding(
            &b,
            "process_mining::locel_new",
            &serde_json::json!({}),
            None,
            None,
        )
        .expect("locel_new");
        let unnamed_id: String = serde_json::from_slice(&unnamed).expect("handle");

        execute_binding(
            &b,
            "process_mining::locel_new",
            &serde_json::json!({}),
            Some("named-output"),
            None,
        )
        .expect("locel_new with a name");

        let listed: Vec<String> = get_objects_with_type(&b)
            .expect("objects")
            .into_iter()
            .map(|o| o.id)
            .collect();
        assert!(
            listed.contains(&unnamed_id),
            "an unnamed binding output must be listed as a dataset, got {listed:?}"
        );
        assert!(
            !listed.contains(&"named-output".to_string()),
            "a named binding output is a pipeline intermediate and must stay hidden, got {listed:?}"
        );
        assert!(
            b.get_state().contains_key("named-output"),
            "the named object should still exist, just not be listed"
        );
    }

    #[test]
    fn rerun_under_the_same_name_invalidates_cached_conversions() {
        let b = backend();
        let run = || {
            execute_binding(
                &b,
                "process_mining::locel_new",
                &serde_json::json!({}),
                Some("pipe__n1"),
                None,
            )
            .expect("locel_new")
        };
        run();
        let first = b.get_state().meta.generation_of("pipe__n1");
        run();
        assert!(b.get_state().meta.generation_of("pipe__n1") > first);
    }

    #[test]
    fn item_kinds_offer_accepting_petri_nets_as_pnml() {
        let kinds = get_all_item_kinds().unwrap();
        let names: Vec<&str> = kinds.iter().map(|k| k.kind.name()).collect();
        assert!(!names.contains(&"PetriNet"), "{names:?}");
        let apn = kinds
            .iter()
            .find(|k| k.kind.name() == "AcceptingPetriNet")
            .expect("AcceptingPetriNet listed");
        let exts: Vec<&str> = apn
            .import_formats
            .iter()
            .map(|f| f.extension.as_str())
            .collect();
        assert!(
            exts.contains(&"pnml") && exts.contains(&"apnml"),
            "{exts:?}"
        );
    }

    #[test]
    fn listing_carries_provenance() {
        let b = backend();
        load_artifact_bytes(
            &b,
            "net1".into(),
            "OCDeclare",
            MODEL.as_bytes(),
            "ocdeclare",
        )
        .unwrap();
        b.get_state().meta.set(
            "net1",
            ItemMeta {
                role: ItemRole::Primary,
                generation: 0,
                provenance: Some(Provenance {
                    sources: vec!["log1".into()],
                    op: "op".into(),
                    source_gen: 0,
                }),
            },
        );
        let listed = list_artifacts(&b).unwrap();
        let info = listed.iter().find(|o| o.id == "net1").expect("net1 listed");
        assert_eq!(
            info.provenance.as_ref().unwrap().sources,
            vec!["log1".to_string()]
        );
    }
}

#[cfg(test)]
mod provenance_dispatch_tests {
    use super::*;
    use process_mining::bindings::register_binding;
    use serde_json::json;
    use std::sync::Mutex;

    #[register_binding]
    fn test_clone_log(event_log: &process_mining::EventLog) -> process_mining::EventLog {
        event_log.clone()
    }

    #[register_binding]
    fn test_count_places(#[bind(handle)] net: &process_mining::AcceptingPetriNet) -> usize {
        net.net.places().len()
    }

    #[register_binding]
    fn test_count_places_by_value(net: process_mining::AcceptingPetriNet) -> usize {
        net.net.places().len()
    }

    #[test]
    fn by_value_model_args_accept_a_stored_model_id() {
        let b = B {
            state: ExtendedAppState::default(),
            events: Mutex::new(Vec::new()),
        };
        let mut net = process_mining::PetriNet::new();
        net.add_place(None);
        net.add_place(None);
        let net =
            process_mining::AcceptingPetriNet::new(net, Default::default(), Default::default());
        b.get_state()
            .add("n1", process_mining::bindings::RegistryItem::custom(net));
        let fid = list_functions()
            .into_iter()
            .map(|f| f.id)
            .find(|id| id.ends_with("test_count_places_by_value"))
            .expect("test binding registered");
        let out = execute_binding(&b, &fid, &json!({ "net": "n1" }), None, None).unwrap();
        assert_eq!(serde_json::from_slice::<usize>(&out).unwrap(), 2);
    }

    #[test]
    fn cached_results_follow_a_reloaded_item() {
        let b = B {
            state: ExtendedAppState::default(),
            events: Mutex::new(Vec::new()),
        };
        let fid = list_functions()
            .into_iter()
            .map(|f| f.id)
            .find(|id| id.ends_with("test_count_places"))
            .expect("test binding registered");
        let net_json = |places: usize| {
            let mut net = process_mining::PetriNet::new();
            for _ in 0..places {
                net.add_place(None);
            }
            let net =
                process_mining::AcceptingPetriNet::new(net, Default::default(), Default::default());
            serde_json::to_vec(&net).unwrap()
        };
        let kind: RegistryItemKind = "AcceptingPetriNet".parse().unwrap();
        let count = || {
            let out = execute_binding(&b, &fid, &json!({ "net": "n" }), None, None).unwrap();
            serde_json::from_slice::<usize>(&out).unwrap()
        };
        load_item_bytes(&b, "n".into(), &kind, &net_json(2), "json").unwrap();
        assert_eq!(count(), 2);
        assert_eq!(b.get_state().results.len(), 1, "the pure call was cached");
        assert_eq!(count(), 2);
        load_item_bytes(&b, "n".into(), &kind, &net_json(3), "json").unwrap();
        assert_eq!(count(), 3, "reloading the item drops its cached results");
    }

    #[test]
    fn handle_args_accept_inline_json_and_leave_nothing_behind() {
        let b = B {
            state: ExtendedAppState::default(),
            events: Mutex::new(Vec::new()),
        };
        let mut net = process_mining::PetriNet::new();
        net.add_place(None);
        let net =
            process_mining::AcceptingPetriNet::new(net, Default::default(), Default::default());
        let fid = list_functions()
            .into_iter()
            .map(|f| f.id)
            .find(|id| id.ends_with("test_count_places"))
            .expect("test binding registered");
        let before = b.get_state().items.read().unwrap().len();
        let inline = serde_json::to_value(&net).unwrap();
        let out = execute_binding(&b, &fid, &json!({ "net": inline }), None, None).unwrap();
        assert_eq!(serde_json::from_slice::<usize>(&out).unwrap(), 1);
        assert_eq!(b.get_state().items.read().unwrap().len(), before);

        b.get_state()
            .add("n1", process_mining::bindings::RegistryItem::custom(net));
        let out = execute_binding(&b, &fid, &json!({ "net": "n1" }), None, None).unwrap();
        assert_eq!(serde_json::from_slice::<usize>(&out).unwrap(), 1);
    }

    struct B {
        state: ExtendedAppState,
        events: Mutex<Vec<String>>,
    }
    impl Backend for B {
        fn get_state(&self) -> &ExtendedAppState {
            &self.state
        }
        fn emit<S: serde::Serialize + Clone>(&self, name: &str, _data: S) -> Result<(), String> {
            self.events.lock().unwrap().push(name.to_string());
            Ok(())
        }
    }

    #[test]
    fn records_provenance_for_produced_object() {
        let b = B {
            state: ExtendedAppState::default(),
            events: Mutex::new(Vec::new()),
        };
        b.get_state()
            .add("log1".to_string(), process_mining::EventLog::default());
        // The test binding's registry id is compiler-decided; find it by suffix.
        let fid = list_functions()
            .into_iter()
            .map(|f| f.id)
            .find(|id| id.ends_with("test_clone_log"))
            .expect("test binding registered");
        let out = execute_binding(&b, &fid, &json!({ "event_log": "log1" }), None, None).unwrap();
        let new_id: String = serde_json::from_slice(&out).unwrap();
        let prov = b
            .get_state()
            .meta
            .provenance_of(&new_id)
            .expect("provenance recorded");
        assert_eq!(prov.sources, vec!["log1".to_string()]);
        assert!(prov.op["fn"].as_str().unwrap().ends_with("test_clone_log"));
    }
}
