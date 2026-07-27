pub use process_mining;
use process_mining::{
    bindings::{self, RegistryItemKind},
    core::{
        event_data::case_centric::xes::{XESOuterLogData, XESParsingTraceStream},
        io::ExtensionWithMime,
    },
    EventLog, OCEL,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::RwLock;
pub mod artifact;
pub mod meta;
pub use meta::{ItemMeta, ItemRole, ObjMeta, Provenance};
pub use state::{Backend, ExtendedAppState};
pub mod state {
    use std::collections::HashMap;
    use std::ops::Deref;
    use std::{path::PathBuf, sync::RwLock};

    use process_mining::bindings::AppState;

    use serde::Serialize;

    use crate::artifact::PropelArtifact;
    use crate::meta::ObjMeta;

    #[derive(Default)]
    pub struct ExtendedAppState {
        pub inner: AppState,
        pub meta: ObjMeta,
        pub files_to_import: RwLock<Vec<PathBuf>>,
        pub artifacts: RwLock<HashMap<String, PropelArtifact>>,
        /// Insertion order of registry-object / artifact ids, kept because the underlying maps
        /// are unordered; reconciled lazily so the frontend gets a stable order. See `reconcile_order`.
        pub object_order: RwLock<Vec<String>>,
        pub artifact_order: RwLock<Vec<String>>,
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

fn item_count<B: Backend>(backend: &B) -> usize {
    backend
        .get_state()
        .items
        .read()
        .map(|m| m.len())
        .unwrap_or(0)
}

pub fn load_xes_object<B: Backend>(backend: &B, name: String, xes: EventLog) -> Result<(), String> {
    backend.get_state().add(name, xes);
    backend.emit("EventLog-import-finished", ())?;
    emit_objects_changed(backend);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EventLogStreamProgress {
    name: String,
    num_traces: usize,
    num_events: usize,
}

pub fn stream_load_xes_object<B: Backend>(
    backend: &B,
    name: String,
    mut trace_stream: XESParsingTraceStream,
    log_data: XESOuterLogData,
) -> Result<(), String> {
    let mut progress = EventLogStreamProgress {
        name: name.clone(),
        num_traces: 0,
        num_events: 0,
    };
    let traces: Vec<_> = trace_stream
        .inspect(|trace| {
            progress.num_traces += 1;
            progress.num_events += trace.events.len();
            // Do not send status updates for each trace
            if progress.num_events.is_multiple_of(221) {
                let _ = backend.emit("EventLog-import-progress", &progress);
            }
        })
        .collect();
    let _ = backend.emit("EventLog-import-finished", &progress);
    let xes = EventLog::from_traces_and_log_data(traces, log_data);
    backend.get_state().add(name, xes);
    emit_objects_changed(backend);
    Ok(())
}

pub fn load_ocel_object<B: Backend>(backend: &B, name: String, ocel: OCEL) -> Result<(), String> {
    backend.get_state().add(name.clone(), ocel);
    let _ = backend.emit("OCEL-import-finished", &name);
    emit_objects_changed(backend);
    Ok(())
}

pub fn unload_object<B: Backend>(backend: &B, name: String) -> Result<(), String> {
    let st = backend.get_state();
    st.meta.remove(&name);
    let _ = st.meta.remove_with_prefix(&format!("{name}__as__"));
    {
        let mut objects = st.items.write().map_err(|e| e.to_string())?;
        objects.remove(&name);
        let prefix = format!("{name}__as__");
        let derived: Vec<String> = objects
            .keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();
        for d in derived {
            objects.remove(&d);
        }
    }
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

/// Registry kinds an item of `kind` can be converted into, mirroring
/// `RegistryItem::convert`'s match arms; keep in sync if upstream adds a conversion.
pub fn convertible_to(kind: RegistryItemKind) -> Vec<RegistryItemKind> {
    use process_mining::bindings::RegistryItemKind::*;
    match kind {
        EventLog => vec![EventLogActivityProjection],
        OCEL => vec![IndexLinkedOCEL, SlimLinkedOCEL],
        IndexLinkedOCEL => vec![OCEL],
        SlimLinkedOCEL => vec![OCEL],
        EventLogActivityProjection => vec![],
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryItemInfo {
    pub kind: RegistryItemKind,
    pub import_formats: Vec<ExtensionWithMime>,
    pub export_formats: Vec<ExtensionWithMime>,
    pub convertible_to: Vec<RegistryItemKind>,
}
pub fn get_all_item_kinds() -> Result<Vec<RegistryItemInfo>, String> {
    Ok(bindings::RegistryItemKind::all_kinds()
        .iter()
        .map(|k| RegistryItemInfo {
            kind: *k,
            import_formats: k.known_import_formats(),
            export_formats: k.known_export_formats(),
            convertible_to: convertible_to(*k),
        })
        .collect())
}

/// Import/export formats for a Propel artifact kind (the non-registry, engine-stored values like
/// `PetriNet`). Parallels [`RegistryItemInfo`] so callers can treat both uniformly.
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

#[cfg(test)]
mod convert_pairs_tests {
    use super::convertible_to;
    use process_mining::bindings::RegistryItemKind::*;
    #[test]
    fn pairs_match_registryitem_convert_arms() {
        assert_eq!(convertible_to(EventLog), vec![EventLogActivityProjection]);
        assert_eq!(convertible_to(OCEL), vec![IndexLinkedOCEL, SlimLinkedOCEL]);
        assert_eq!(convertible_to(IndexLinkedOCEL), vec![OCEL]);
        assert_eq!(convertible_to(SlimLinkedOCEL), vec![OCEL]);
        assert_eq!(convertible_to(EventLogActivityProjection), Vec::new());
    }
}

pub fn load_item_bytes<B: Backend>(
    backend: &B,
    id: String,
    item_kind: &RegistryItemKind,
    data: &[u8],
    format: &str,
) -> Result<(), String> {
    let _ = backend.emit("import-started", &id);
    match bindings::RegistryItem::load_from_bytes(item_kind, data, format) {
        Ok(item) => {
            backend.get_state().add(id.clone(), item);
            let _ = backend.emit("import-finished", &id);
            emit_objects_changed(backend);
            Ok(())
        }
        Err(e) => {
            let _ = backend.emit("import-failed", serde_json::json!({ "id": id, "error": e }));
            Err(e)
        }
    }
}

pub fn load_item_path<B: Backend>(
    backend: &B,
    id: String,
    item_kind: &RegistryItemKind,
    path: &str,
) -> Result<(), String> {
    let _ = backend.emit("import-started", &id);
    match bindings::RegistryItem::load_from_path(item_kind, path) {
        Ok(item) => {
            backend.get_state().add(id.clone(), item);
            let _ = backend.emit("import-finished", &id);
            emit_objects_changed(backend);
            Ok(())
        }
        Err(e) => {
            let _ = backend.emit("import-failed", serde_json::json!({ "id": id, "error": e }));
            Err(e)
        }
    }
}

pub fn export_item_bytes<B: Backend>(
    backend: &B,
    id: &str,
    format: &str,
) -> Result<Vec<u8>, String> {
    let lock = backend
        .get_state()
        .items
        .read()
        .map_err(|e| e.to_string())?;
    if let Some(item) = lock.get(id) {
        item.export_to_bytes(format).map_err(|e| e.to_string())
    } else {
        Err("Item not found.".to_string())
    }
}

pub fn export_item_path<B: Backend>(backend: &B, id: &str, path: &str) -> Result<(), String> {
    let lock = backend
        .get_state()
        .items
        .read()
        .map_err(|e| e.to_string())?;
    if let Some(item) = lock.get(id) {
        item.export_to_path(path).map_err(|e| e.to_string())
    } else {
        Err("Item not found.".to_string())
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
        if !convertible_to(have_kind).contains(&want_kind) {
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
/// when a name is given, exactly one new handle appeared, and the result is that handle's JSON id.
pub fn decide_rename(
    result: &[u8],
    delta: i64,
    output_name: Option<&str>,
) -> Option<(String, String)> {
    let name = output_name?;
    if delta != 1 {
        return None;
    }
    let id: String = serde_json::from_slice(result).ok()?;
    Some((id, name.to_string()))
}

pub fn execute_binding<B: Backend>(
    backend: &B,
    function_id: &str,
    args: &Value,
    output_name: Option<&str>,
) -> Result<Vec<u8>, String> {
    let binding =
        bindings::get_fn_binding(function_id).ok_or_else(|| "Unknown function ID".to_string())?;
    let st = backend.get_state();
    let arg_schemas = (binding.args)();
    // Provenance sources are the user-supplied ids, captured before the __as__ conversion below may
    // rewrite an arg to point at a hidden derived object.
    let original_args = args.clone();
    let mut args = args.clone();

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

    // A binding may store a registry-typed result as a new handle. Detect that by the item-count
    // delta and emit the generic refresh signal so the UI picks up the derived object.
    let before = item_count(backend);
    let result = bindings::call(binding, &args, &st.inner);
    let after = item_count(backend);
    if after != before {
        emit_objects_changed(backend);
    }

    let provenance = build_provenance(function_id, &original_args, &arg_schemas, |id| {
        st.meta.generation_of(id)
    });

    // If the caller named the output and the call minted exactly one handle, re-key it to that
    // deterministic name, letting the pipeline overwrite a node's prior intermediate on re-run.
    if let Ok(bytes) = &result {
        if let Some((old, new)) = decide_rename(bytes, after as i64 - before as i64, output_name) {
            if let Ok(mut items) = st.items.write() {
                if let Some(item) = items.remove(&old) {
                    items.insert(new.clone(), item);
                }
            }
            st.meta.set(
                &new,
                ItemMeta {
                    role: ItemRole::Result,
                    generation: 0,
                    provenance,
                },
            );
            return serde_json::to_vec(&new).map_err(|e| e.to_string());
        }
    }

    // Un-renamed produced object: still record lineage on the minted handle.
    if let (Ok(bytes), Some(prov)) = (&result, provenance) {
        if after > before {
            if let Ok(minted_id) = serde_json::from_slice::<String>(bytes) {
                if st.contains_key(&minted_id) {
                    let role = st.meta.role_of(&minted_id);
                    let generation = st.meta.generation_of(&minted_id);
                    st.meta.set(
                        &minted_id,
                        ItemMeta {
                            role,
                            generation,
                            provenance: Some(prov),
                        },
                    );
                }
            }
        }
    }
    result
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
}

#[cfg(test)]
mod rename_tests {
    use super::decide_rename;
    #[test]
    fn renames_single_new_handle_when_named() {
        let res = serde_json::to_vec("res_abc").unwrap();
        assert_eq!(
            decide_rename(&res, 1, Some("pipe__n1")),
            Some(("res_abc".into(), "pipe__n1".into()))
        );
    }
    #[test]
    fn no_rename_when_no_output_name() {
        let res = serde_json::to_vec("res_abc").unwrap();
        assert_eq!(decide_rename(&res, 1, None), None);
    }
    #[test]
    fn no_rename_when_delta_not_one() {
        let res = serde_json::to_vec("res_abc").unwrap();
        assert_eq!(decide_rename(&res, 0, Some("x")), None);
    }
    #[test]
    fn no_rename_when_result_not_a_string_id() {
        let res = serde_json::to_vec(&serde_json::json!({"k":1})).unwrap();
        assert_eq!(decide_rename(&res, 1, Some("x")), None);
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
    const PNML: &str = r#"<?xml version="1.0"?><pnml><net id="n" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel"><page id="p0"><place id="p1"/><transition id="t1"/></page></net></pnml>"#;

    #[test]
    fn load_list_get_unload_artifact() {
        let b = backend();
        load_artifact_bytes(&b, "net1".into(), "PetriNet", PNML.as_bytes(), "pnml").unwrap();
        assert_eq!(
            list_artifacts(&b).unwrap(),
            vec![ObjectInfo {
                id: "net1".to_string(),
                kind: "PetriNet".to_string(),
                label: None,
                provenance: None,
            }]
        );
        assert!(get_artifact(&b, "net1").unwrap().get("places").is_some());
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
        load_artifact_bytes(&b, "n".into(), "PetriNet", PNML.as_bytes(), "pnml").unwrap();
        let bytes = export_artifact(&b, "n", "pnml").unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn listing_carries_provenance() {
        let b = backend();
        load_artifact_bytes(&b, "net1".into(), "PetriNet", PNML.as_bytes(), "pnml").unwrap();
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
        let out = execute_binding(&b, &fid, &json!({ "event_log": "log1" }), None).unwrap();
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
