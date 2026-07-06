//! OCEL (object-centric) analysis bindings.
//!
//! Each binding takes `&OCEL` directly; the `#[register_binding]` macro maps that to an
//! `OCELHandle` and resolves it from the object store at dispatch time. Where the body needs
//! the indexed `LinkedOCELAccess` API (relationships, reverse indices), we build a
//! `SlimLinkedOCEL` in-place via `SlimLinkedOCEL::from_ocel` (events are pre-sorted by
//! timestamp at link time).
use std::collections::{HashMap, HashSet};

use process_mining::bindings::register_binding;
use rayon::prelude::*;
use process_mining::core::chrono::DateTime;
use process_mining::core::event_data::object_centric::linked_ocel::slim_linked_ocel::ObjectIndex;
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::core::event_data::object_centric::{
    OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject, OCELObjectAttribute,
    OCELRelationship, OCELType, OCELTypeAttribute, OCEL,
};
use process_mining::ReadableOCEL;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::types::{
    AttributeCatalogEntry, AttributeKind, AttributeScope, DfArcDuration, NumericStats, OCELInfo,
    OCELObjectAttributeChanges, ObjectBrowserPage, ObjectBrowserRow, ObjectDetail, ObjectEventRow,
    ObjectInvolvementCounts, ObjectSortField, OcDfgCounts, OcelAttributeInfo, OcelAttributeLevel,
    OcelAttributeSummary, OcelDfPerformance,
};

/// One object instance taking part in a simulated firing.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcSimTraceObject {
    pub id: String,
    #[serde(rename = "objectType")]
    pub object_type: String,
}

/// One step of an object-centric simulation trace: a fired activity plus its objects.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcSimTraceStep {
    pub activity: String,
    pub objects: Vec<OcSimTraceObject>,
}

/// Build a slim linked OCEL from an object-centric simulation trace: one event per step
/// (timestamps spaced 1 minute apart from a fixed base), each linked to the objects it
/// touched. Object ids are prefixed with their type so they stay unique across types, and a
/// repeated (type, id) maps to a single shared object linked to every event it appears in.
/// Steps with a blank activity (silent transitions) are dropped. Auto-stored under a fresh
/// handle by the registry.
#[register_binding]
pub fn ocel_from_oc_sim_trace(trace: Vec<OcSimTraceStep>) -> SlimLinkedOCEL {
    const BASE_MS: i64 = 1_577_836_800_000; // 2020-01-01T00:00:00Z
    const STEP_MS: i64 = 60_000; // 1 minute between events

    let mut ocel = SlimLinkedOCEL::new();

    // Declare every event/object type up front; add_event/add_object reject unknown types.
    let mut event_types: HashSet<&str> = HashSet::new();
    let mut object_types: HashSet<&str> = HashSet::new();
    for step in &trace {
        if step.activity.trim().is_empty() {
            continue;
        }
        event_types.insert(&step.activity);
        for o in &step.objects {
            object_types.insert(&o.object_type);
        }
    }
    for et in &event_types {
        ocel.add_event_type(et, Vec::new());
    }
    for ot in &object_types {
        ocel.add_object_type(ot, Vec::new());
    }

    let prefixed = |o: &OcSimTraceObject| format!("{}:{}", o.object_type, o.id);
    let mut objects: HashMap<String, ObjectIndex> = HashMap::new();

    for (step_idx, step) in trace.into_iter().enumerate() {
        if step.activity.trim().is_empty() {
            continue;
        }
        let Some(time) = DateTime::from_timestamp_millis(BASE_MS + step_idx as i64 * STEP_MS)
            .map(|t| t.fixed_offset())
        else {
            continue;
        };
        let Some(event) = ocel.add_event(&step.activity, time, None, Vec::new(), Vec::new()) else {
            continue;
        };
        // Add each required object (once), then link it to this event.
        for o in &step.objects {
            let oid = prefixed(o);
            let object = match objects.get(&oid) {
                Some(idx) => *idx,
                None => {
                    match ocel.add_object(&o.object_type, Some(oid.clone()), Vec::new(), Vec::new())
                    {
                        Some(idx) => *objects.entry(oid).or_insert(idx),
                        None => continue,
                    }
                }
            };
            ocel.add_e2o(event, object, o.object_type.clone());
        }
    }

    ocel
}

/// A declared type (event or object) with its attribute schema, as authored in the editor.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelTypeInput {
    pub name: String,
    #[serde(default)]
    pub attributes: Vec<OcelTypeAttrInput>,
}

/// One attribute in a type's schema: a name plus its declared value type.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelTypeAttrInput {
    pub name: String,
    #[serde(rename = "type")]
    pub attr_type: String,
}

/// One typed attribute value (string-carried, `attr_type` selects parsing).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelAttrInput {
    pub name: String,
    #[serde(rename = "type")]
    pub attr_type: String,
    pub value: String,
}

/// One timestamped object attribute value (object attributes carry a `time` in OCEL).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelTimedAttrInput {
    pub name: String,
    #[serde(rename = "type")]
    pub attr_type: String,
    pub value: String,
    pub time: String,
}

/// A relationship (E2O on an event, O2O on an object): target object id plus qualifier.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelRelInput {
    #[serde(rename = "objectId")]
    pub object_id: String,
    pub qualifier: String,
}

/// One authored event: id, type, RFC3339 time, typed attributes, and its E2O relationships.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelEventInput {
    pub id: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub time: String,
    #[serde(default)]
    pub attributes: Vec<OcelAttrInput>,
    #[serde(default)]
    pub relationships: Vec<OcelRelInput>,
}

/// One authored object: id, type, timestamped attributes, and its O2O relationships.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelObjectInput {
    pub id: String,
    #[serde(rename = "type")]
    pub type_name: String,
    #[serde(default)]
    pub attributes: Vec<OcelTimedAttrInput>,
    #[serde(default)]
    pub relationships: Vec<OcelRelInput>,
}

/// The full OCEL as emitted by / loaded into the OCEL editor.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelInput {
    #[serde(rename = "eventTypes", default)]
    pub event_types: Vec<OcelTypeInput>,
    #[serde(rename = "objectTypes", default)]
    pub object_types: Vec<OcelTypeInput>,
    #[serde(default)]
    pub events: Vec<OcelEventInput>,
    #[serde(default)]
    pub objects: Vec<OcelObjectInput>,
}

/// Fixed base timestamp used when an authored value fails to parse (the editor always supplies a
/// valid RFC3339 time, so this is only a safety net): 2020-01-01T00:00:00Z.
fn base_time() -> process_mining::core::chrono::DateTime<process_mining::core::chrono::FixedOffset>
{
    DateTime::from_timestamp_millis(1_577_836_800_000)
        .expect("constant timestamp is valid")
        .fixed_offset()
}

/// Parse a string cell into a typed OCEL attribute value; falls back to `String` on parse failure.
fn parse_ocel_value(attr_type: &str, value: &str) -> OCELAttributeValue {
    match attr_type {
        "int" | "integer" => value
            .trim()
            .parse::<i64>()
            .map(OCELAttributeValue::Integer)
            .unwrap_or_else(|_| OCELAttributeValue::String(value.to_string())),
        "float" | "number" => value
            .trim()
            .parse::<f64>()
            .map(OCELAttributeValue::Float)
            .unwrap_or_else(|_| OCELAttributeValue::String(value.to_string())),
        "boolean" => match value.trim().to_ascii_lowercase().as_str() {
            "true" => OCELAttributeValue::Boolean(true),
            "false" => OCELAttributeValue::Boolean(false),
            _ => OCELAttributeValue::String(value.to_string()),
        },
        "date" | "time" => DateTime::parse_from_rfc3339(value.trim())
            .map(OCELAttributeValue::Time)
            .unwrap_or_else(|_| OCELAttributeValue::String(value.to_string())),
        _ => OCELAttributeValue::String(value.to_string()),
    }
}

/// Editor attribute-type string -> canonical OCEL 2.0 `value_type` for a declared type schema.
fn to_canonical_ocel_type(t: &str) -> String {
    match t {
        "int" => "integer",
        "date" => "time",
        other => other,
    }
    .to_string()
}

/// Canonical OCEL 2.0 `value_type` -> the editor's attribute-type string.
fn from_canonical_ocel_type(t: &str) -> String {
    match t {
        "integer" => "int",
        "time" => "date",
        "number" => "float",
        other => other,
    }
    .to_string()
}

fn map_ocel_type(t: OcelTypeInput) -> OCELType {
    OCELType {
        name: t.name,
        attributes: t
            .attributes
            .into_iter()
            .map(|a| OCELTypeAttribute {
                name: a.name,
                value_type: to_canonical_ocel_type(&a.attr_type),
            })
            .collect(),
    }
}

/// Build a slim linked OCEL from the editor's structured JSON: declared event/object types with
/// their attribute schemas, events (with E2O relationships) and objects (timestamped attributes,
/// O2O relationships). Constructed as a `process_mining::OCEL` then linked, so attribute indexing
/// and event time-sorting follow the crate's own `from_ocel`. Auto-stored under a fresh handle.
#[register_binding]
pub fn ocel_from_json(input: OcelInput) -> SlimLinkedOCEL {
    let events = input
        .events
        .into_iter()
        .map(|e| OCELEvent {
            id: e.id,
            event_type: e.type_name,
            time: DateTime::parse_from_rfc3339(e.time.trim()).unwrap_or_else(|_| base_time()),
            attributes: e
                .attributes
                .into_iter()
                .map(|a| OCELEventAttribute {
                    name: a.name,
                    value: parse_ocel_value(&a.attr_type, &a.value),
                })
                .collect(),
            relationships: e
                .relationships
                .into_iter()
                .map(|r| OCELRelationship {
                    object_id: r.object_id,
                    qualifier: r.qualifier,
                })
                .collect(),
        })
        .collect();

    let objects = input
        .objects
        .into_iter()
        .map(|o| OCELObject {
            id: o.id,
            object_type: o.type_name,
            attributes: o
                .attributes
                .into_iter()
                .map(|a| OCELObjectAttribute {
                    name: a.name,
                    value: parse_ocel_value(&a.attr_type, &a.value),
                    time: DateTime::parse_from_rfc3339(a.time.trim())
                        .unwrap_or_else(|_| base_time()),
                })
                .collect(),
            relationships: o
                .relationships
                .into_iter()
                .map(|r| OCELRelationship {
                    object_id: r.object_id,
                    qualifier: r.qualifier,
                })
                .collect(),
        })
        .collect();

    let ocel = OCEL {
        event_types: input.event_types.into_iter().map(map_ocel_type).collect(),
        object_types: input.object_types.into_iter().map(map_ocel_type).collect(),
        events,
        objects,
    };
    SlimLinkedOCEL::from_ocel(ocel)
}

/// Editor attribute-type string for a stored OCEL value.
fn ocel_value_type_str(v: &OCELAttributeValue) -> &'static str {
    match v {
        OCELAttributeValue::Integer(_) => "int",
        OCELAttributeValue::Float(_) => "float",
        OCELAttributeValue::Boolean(_) => "boolean",
        OCELAttributeValue::Time(_) => "date",
        OCELAttributeValue::String(_) | OCELAttributeValue::Null => "string",
    }
}

/// Read an existing OCEL back into the editor's structured JSON (import-to-seed). Inverse of
/// `ocel_from_json`: declared types with their schemas, events (E2O) and objects (timestamped
/// attributes, O2O), with qualifiers preserved.
#[register_binding]
pub fn ocel_to_json(ocel: &SlimLinkedOCEL) -> OcelInput {

    let map_type = |t: &process_mining::core::event_data::object_centric::OCELType| OcelTypeInput {
        name: t.name.clone(),
        attributes: t
            .attributes
            .iter()
            .map(|a| OcelTypeAttrInput {
                name: a.name.clone(),
                attr_type: from_canonical_ocel_type(&a.value_type),
            })
            .collect(),
    };

    let events = ocel
        .get_all_evs()
        .map(|ev| {
            let attributes = ocel
                .get_ev_attrs(&ev)
                .filter_map(|name| {
                    ocel.get_ev_attr_val(&ev, name).map(|v| OcelAttrInput {
                        name: name.to_string(),
                        attr_type: ocel_value_type_str(v).to_string(),
                        value: v.to_string(),
                    })
                })
                .collect();
            let relationships = ocel
                .get_e2o(&ev)
                .map(|(qual, ob)| OcelRelInput {
                    object_id: ocel.get_ob_id(ob).to_string(),
                    qualifier: qual.to_string(),
                })
                .collect();
            OcelEventInput {
                id: ocel.get_ev_id(&ev).to_string(),
                type_name: ocel.get_ev_type_of(&ev).to_string(),
                time: ocel.get_ev_time(&ev).to_rfc3339(),
                attributes,
                relationships,
            }
        })
        .collect();

    let objects = ocel
        .get_all_obs()
        .map(|ob| {
            let attributes = ocel
                .get_ob_attrs(&ob)
                .flat_map(|name| {
                    ocel
                        .get_ob_attr_vals(&ob, name)
                        .map(move |(time, v)| OcelTimedAttrInput {
                            name: name.to_string(),
                            attr_type: ocel_value_type_str(v).to_string(),
                            value: v.to_string(),
                            time: time.to_rfc3339(),
                        })
                        .collect::<Vec<_>>()
                })
                .collect();
            let relationships = ocel
                .get_o2o(&ob)
                .map(|(qual, other)| OcelRelInput {
                    object_id: ocel.get_ob_id(other).to_string(),
                    qualifier: qual.to_string(),
                })
                .collect();
            OcelObjectInput {
                id: ocel.get_ob_id(&ob).to_string(),
                type_name: ocel.get_ob_type_of(&ob).to_string(),
                attributes,
                relationships,
            }
        })
        .collect();

    OcelInput {
        event_types: ocel.event_types().iter().map(map_type).collect(),
        object_types: ocel.object_types().iter().map(map_type).collect(),
        events,
        objects,
    }
}

fn classify(v: &OCELAttributeValue) -> AttributeKind {
    match v {
        OCELAttributeValue::Float(_) | OCELAttributeValue::Integer(_) => AttributeKind::Numeric,
        OCELAttributeValue::Time(_) => AttributeKind::Date,
        OCELAttributeValue::String(_) => AttributeKind::Categorical,
        _ => AttributeKind::Categorical,
    }
}

/// Object/event type and count summary.
#[register_binding]
pub fn get_ocel_info(ocel: &SlimLinkedOCEL) -> OCELInfo {
    OCELInfo {
        num_objects: ocel.get_num_obs(),
        num_events: ocel.get_num_evs(),
        event_types: ocel.get_ev_types().map(|s| s.to_string()).collect(),
        object_types: ocel.get_ob_types().map(|s| s.to_string()).collect(),
    }
}

/// First 100 object IDs.
#[register_binding]
pub fn get_ocel_object_ids(ocel: &SlimLinkedOCEL) -> Vec<String> {
    ocel
        .get_all_obs()
        .take(100)
        .map(|o| ocel.get_ob_id(&o).to_string())
        .collect()
}

/// Object-attribute change history for one object (timestamped value changes).
#[register_binding]
pub fn get_ocel_object_changes_plot(
    ocel: &SlimLinkedOCEL,
    object_id: String,
) -> OCELObjectAttributeChanges {
    let Ok(lib_result) =
        process_mining::analysis::object_centric::object_attribute_changes::get_object_attribute_changes(
            ocel, &object_id,
        )
    else {
        return OCELObjectAttributeChanges {
            traces: HashMap::new(),
        };
    };
    let traces = lib_result
        .traces
        .into_iter()
        .map(|(attr_name, changes)| {
            let string_changes: Vec<(String, String)> = changes
                .into_iter()
                .map(|change| (change.time.to_rfc3339(), change.value.to_string()))
                .collect();
            (attr_name, string_changes)
        })
        .collect();
    OCELObjectAttributeChanges { traces }
}

/// Paginated, sortable, filterable object list.
#[register_binding]
pub fn get_ocel_objects_page(
    ocel: &SlimLinkedOCEL,
    offset: usize,
    limit: usize,
    sort_field: ObjectSortField,
    sort_asc: bool,
    filter: String,
    type_filter: Option<String>,
) -> ObjectBrowserPage {
    let object_types: Vec<String> = ocel.get_ob_types().map(|s| s.to_string()).collect();

    let mut rows: Vec<ObjectBrowserRow> = ocel
        .get_all_obs()
        .map(|ob| {
            let ob_id = ocel.get_ob_id(&ob).to_string();
            let ob_type = ocel.get_ob_type_of(&ob).to_string();

            let related_evs: Vec<_> = ocel.get_e2o_rev(&ob).collect();
            let num_events = related_evs.len();

            let mut first_ts: Option<i64> = None;
            let mut last_ts: Option<i64> = None;
            for (_qualifier, ev) in &related_evs {
                let ts = ocel.get_ev_time(*ev).timestamp_millis();
                first_ts = Some(first_ts.map_or(ts, |f: i64| f.min(ts)));
                last_ts = Some(last_ts.map_or(ts, |l: i64| l.max(ts)));
            }

            ObjectBrowserRow {
                object_id: ob_id,
                object_type: ob_type,
                num_events,
                first_time: first_ts.map(ms_to_rfc3339),
                last_time: last_ts.map(ms_to_rfc3339),
            }
        })
        .collect();

    if let Some(ref tf) = type_filter {
        if !tf.is_empty() {
            rows.retain(|r| r.object_type == *tf);
        }
    }

    if !filter.is_empty() {
        let lower = filter.to_lowercase();
        rows.retain(|r| r.object_id.to_lowercase().contains(&lower));
    }

    match sort_field {
        ObjectSortField::ObjectId => rows.sort_by(|a, b| a.object_id.cmp(&b.object_id)),
        ObjectSortField::ObjectType => rows.sort_by(|a, b| a.object_type.cmp(&b.object_type)),
        ObjectSortField::NumEvents => rows.sort_by_key(|a| a.num_events),
        ObjectSortField::FirstTime => rows.sort_by(|a, b| a.first_time.cmp(&b.first_time)),
    }
    if !sort_asc {
        rows.reverse();
    }

    let total = rows.len();
    let start = offset.min(total);
    let end = (start + limit).min(total);
    let page = rows[start..end].to_vec();

    ObjectBrowserPage {
        rows: page,
        total,
        object_types,
    }
}

fn ms_to_rfc3339(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms)
        .map(|d| d.fixed_offset().to_rfc3339())
        .unwrap_or_default()
}

/// Detail (events, O2O, attributes) for a single object.
///
/// On unknown `object_id` returns an empty `ObjectDetail`; the registry binding is infallible.
#[register_binding]
pub fn get_object_detail(ocel: &SlimLinkedOCEL, object_id: String) -> ObjectDetail {
    let Some(ob) = ocel.get_ob_by_id(&object_id) else {
        return ObjectDetail {
            object_id,
            object_type: String::new(),
            events: Vec::new(),
            related_objects: Vec::new(),
            attributes: HashMap::new(),
        };
    };
    let ob_type = ocel.get_ob_type_of(&ob).to_string();

    let mut event_rows: Vec<ObjectEventRow> = ocel
        .get_e2o_rev(&ob)
        .map(|(_qual, ev)| {
            let ev_id = ocel.get_ev_id(ev).to_string();
            let ev_type = ocel.get_ev_type_of(ev).to_string();
            let timestamp = ocel.get_ev_time(ev).to_rfc3339();

            let other_objects: Vec<(String, String)> = ocel
                .get_e2o(ev)
                .filter(|(_q, other_ob)| ocel.get_ob_id(*other_ob) != object_id.as_str())
                .map(|(_q, other_ob)| {
                    (
                        ocel.get_ob_id(other_ob).to_string(),
                        ocel.get_ob_type_of(other_ob).to_string(),
                    )
                })
                .collect();

            ObjectEventRow {
                event_id: ev_id,
                event_type: ev_type,
                timestamp,
                other_objects,
            }
        })
        .collect();

    event_rows.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    let related_objects: Vec<(String, String)> = ocel
        .get_o2o(&ob)
        .map(|(_qual, other_ob)| {
            (
                ocel.get_ob_id(other_ob).to_string(),
                ocel.get_ob_type_of(other_ob).to_string(),
            )
        })
        .collect();

    let attributes: HashMap<String, String> = ocel
        .get_ob_attrs(&ob)
        .filter_map(|attr_name| {
            let vals: Vec<_> = ocel.get_ob_attr_vals(&ob, attr_name).collect();
            vals.last()
                .map(|(_time, val)| (attr_name.to_string(), val.to_string()))
        })
        .collect();

    ObjectDetail {
        object_id,
        object_type: ob_type,
        events: event_rows,
        related_objects,
        attributes,
    }
}

/// List event- and object-level attributes with type/cardinality info.
#[register_binding]
pub fn get_ocel_attribute_names(ocel: &SlimLinkedOCEL) -> Vec<OcelAttributeInfo> {
    let mut result: Vec<OcelAttributeInfo> = Vec::new();

    let mut ev_attrs: HashMap<String, (HashSet<String>, usize, AttributeKind)> = HashMap::new();
    let total_events = ocel.get_num_evs();
    for ev in ocel.get_all_evs() {
        let attr_names: Vec<String> = ocel.get_ev_attrs(&ev).map(|s| s.to_string()).collect();
        for attr_name in &attr_names {
            if let Some(val) = ocel.get_ev_attr_val(&ev, attr_name.as_str()) {
                let entry = ev_attrs
                    .entry(attr_name.clone())
                    .or_insert_with(|| (HashSet::new(), 0, AttributeKind::Other));
                entry.0.insert(val.to_string());
                entry.1 += 1;
                if entry.1 == 1 {
                    entry.2 = classify(val);
                }
            }
        }
    }
    for (attr_name, (uniques, count, kind)) in ev_attrs {
        result.push(OcelAttributeInfo {
            name: attr_name,
            level: OcelAttributeLevel::Event,
            kind,
            unique_count: uniques.len(),
            total_count: count,
            missing_count: total_events.saturating_sub(count),
        });
    }

    let ob_types: Vec<String> = ocel.get_ob_types().map(|s| s.to_string()).collect();
    for ob_type in &ob_types {
        let mut ob_attrs: HashMap<String, (HashSet<String>, usize, AttributeKind)> = HashMap::new();
        let mut type_count = 0usize;
        for ob in ocel.get_obs_of_type(ob_type.as_str()) {
            type_count += 1;
            let attr_names: Vec<String> = ocel.get_ob_attrs(ob).map(|s| s.to_string()).collect();
            for attr_name in &attr_names {
                let vals: Vec<_> = ocel.get_ob_attr_vals(ob, attr_name.as_str()).collect();
                if let Some(&(_time, val)) = vals.last() {
                    let entry = ob_attrs
                        .entry(attr_name.clone())
                        .or_insert_with(|| (HashSet::new(), 0, AttributeKind::Other));
                    entry.0.insert(val.to_string());
                    entry.1 += 1;
                    if entry.1 == 1 {
                        entry.2 = classify(val);
                    }
                }
            }
        }
        for (attr_name, (uniques, count, kind)) in ob_attrs {
            result.push(OcelAttributeInfo {
                name: attr_name,
                level: OcelAttributeLevel::Object {
                    object_type: ob_type.to_string(),
                },
                kind,
                unique_count: uniques.len(),
                total_count: count,
                missing_count: type_count.saturating_sub(count),
            });
        }
    }

    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

/// Detailed summary (numeric stats/histogram or top-values) for one OCEL attribute.
#[register_binding]
pub fn get_ocel_attribute_summary(
    ocel: &SlimLinkedOCEL,
    attr_name: String,
    level: OcelAttributeLevel,
) -> OcelAttributeSummary {
    let mut values_str: Vec<String> = Vec::new();
    let mut values_f64: Vec<f64> = Vec::new();
    let mut total: usize = 0;

    match &level {
        OcelAttributeLevel::Event => {
            total = ocel.get_num_evs();
            for ev in ocel.get_all_evs() {
                if let Some(val) = ocel.get_ev_attr_val(&ev, attr_name.as_str()) {
                    match val {
                        OCELAttributeValue::Float(f) => values_f64.push(*f),
                        OCELAttributeValue::Integer(i) => values_f64.push(*i as f64),
                        _ => values_str.push(val.to_string()),
                    }
                }
            }
        }
        OcelAttributeLevel::Object { object_type } => {
            for ob in ocel.get_obs_of_type(object_type.as_str()) {
                total += 1;
                let vals: Vec<_> = ocel.get_ob_attr_vals(ob, attr_name.as_str()).collect();
                if let Some(&(_time, val)) = vals.last() {
                    match val {
                        OCELAttributeValue::Float(f) => values_f64.push(*f),
                        OCELAttributeValue::Integer(i) => values_f64.push(*i as f64),
                        _ => values_str.push(val.to_string()),
                    }
                }
            }
        }
    }

    let present = values_str.len() + values_f64.len();
    let missing = total.saturating_sub(present);

    if !values_f64.is_empty() {
        values_f64.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let count = values_f64.len();
        let min = values_f64[0];
        let max = values_f64[count - 1];
        let mean = values_f64.iter().sum::<f64>() / count as f64;
        let median = if count.is_multiple_of(2) {
            (values_f64[count / 2 - 1] + values_f64[count / 2]) / 2.0
        } else {
            values_f64[count / 2]
        };
        let variance = values_f64.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / count as f64;
        let stddev = variance.sqrt();

        let nbins = 40usize;
        let range = max - min;
        let bin_width = if range.abs() < 1e-12 {
            1.0
        } else {
            range / nbins as f64
        };
        let mut bin_edges: Vec<f64> = (0..=nbins).map(|i| min + i as f64 * bin_width).collect();
        if bin_edges.len() < 2 {
            bin_edges = vec![min, min + 1.0];
        }
        let mut counts = vec![0usize; bin_edges.len() - 1];
        for &v in &values_f64 {
            let idx = ((v - min) / bin_width).floor() as usize;
            let idx = idx.min(counts.len() - 1);
            counts[idx] += 1;
        }

        OcelAttributeSummary {
            name: attr_name,
            level,
            kind: AttributeKind::Numeric,
            total,
            missing,
            top_values: Vec::new(),
            hist_bin_edges: bin_edges,
            hist_counts: counts,
            numeric_stats: Some(NumericStats {
                min,
                max,
                mean,
                median,
                stddev,
            }),
        }
    } else {
        let mut freq: HashMap<String, usize> = HashMap::new();
        for v in &values_str {
            *freq.entry(v.clone()).or_default() += 1;
        }
        let mut top_values: Vec<(String, usize)> = freq.into_iter().collect();
        top_values.sort_by(|a, b| b.1.cmp(&a.1));
        top_values.truncate(100);

        OcelAttributeSummary {
            name: attr_name,
            level,
            kind: AttributeKind::Categorical,
            total,
            missing,
            top_values,
            hist_bin_edges: Vec::new(),
            hist_counts: Vec::new(),
            numeric_stats: None,
        }
    }
}

/// Catalog of removable attribute keys (declared on event/object types) for the
/// RemoveAttributes transform.
#[register_binding]
pub fn get_removable_attributes_ocel(ocel: &SlimLinkedOCEL) -> Vec<AttributeCatalogEntry> {
    let mut out: Vec<AttributeCatalogEntry> = Vec::new();

    let mut ev_union: HashSet<String> = HashSet::new();
    for t in ocel.event_types() {
        for a in &t.attributes {
            ev_union.insert(a.name.clone());
            out.push(AttributeCatalogEntry {
                scope: AttributeScope::Event {
                    activity: Some(t.name.clone()),
                },
                key: a.name.clone(),
                occurrence_count: None,
                sample_values: Vec::new(),
            });
        }
    }
    for key in ev_union {
        out.push(AttributeCatalogEntry {
            scope: AttributeScope::Event { activity: None },
            key,
            occurrence_count: None,
            sample_values: Vec::new(),
        });
    }

    let mut ob_union: HashSet<String> = HashSet::new();
    for t in ocel.object_types() {
        for a in &t.attributes {
            ob_union.insert(a.name.clone());
            out.push(AttributeCatalogEntry {
                scope: AttributeScope::Object {
                    object_type: Some(t.name.clone()),
                },
                key: a.name.clone(),
                occurrence_count: None,
                sample_values: Vec::new(),
            });
        }
    }
    for key in ob_union {
        out.push(AttributeCatalogEntry {
            scope: AttributeScope::Object { object_type: None },
            key,
            occurrence_count: None,
            sample_values: Vec::new(),
        });
    }

    out
}

/// Min/max object involvement counts per activity per object type.
#[register_binding]
pub fn get_ocel_activity_object_involvements(
    ocel: &SlimLinkedOCEL,
) -> HashMap<String, HashMap<String, ObjectInvolvementCounts>> {
    let raw =
        process_mining::core::process_models::object_centric::oc_declare::get_activity_object_involvements(
            ocel,
        );
    raw.into_iter()
        .map(|(act, per_type)| {
            let converted = per_type
                .into_iter()
                .map(|(ot, c)| {
                    (
                        ot,
                        ObjectInvolvementCounts {
                            min: c.min,
                            max: c.max,
                        },
                    )
                })
                .collect();
            (act, converted)
        })
        .collect()
}

/// Object-centric DFG counts. Replaces the crate's flatten-based `discover_dfg_from_ocel`:
/// per type, objects are reduced in parallel over interned event-type indices.
/// Start/end carry event-based frequencies.
#[register_binding]
pub fn get_ocel_df(ocel: &SlimLinkedOCEL) -> OcDfgCounts {
    let ev_type_names: Vec<&str> = ocel.get_ev_types().collect();
    let mut result = OcDfgCounts::default();

    type TypeAcc = (
        HashMap<usize, u32>,
        HashMap<usize, u32>,
        HashMap<usize, u32>,
        HashMap<(usize, usize), u32>,
    );
    let new_acc = || (HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new());

    let ob_types: Vec<String> = ocel.get_ob_types().map(|s| s.to_string()).collect();
    for ob_type in ob_types {
        let obs: Vec<ObjectIndex> = ocel.get_obs_of_type(&ob_type).copied().collect();
        result.object_counts.insert(ob_type.clone(), obs.len() as u32);

        let (activities, starts, ends, dfs): TypeAcc = obs
            .into_par_iter()
            .fold(new_acc, |mut acc, ob| {
                let trace: Vec<usize> = ob.get_obj_activity_trace_evtype_indices(ocel).collect();
                if let (Some(&first), Some(&last)) = (trace.first(), trace.last()) {
                    for &a in &trace {
                        *acc.0.entry(a).or_default() += 1;
                    }
                    *acc.1.entry(first).or_default() += 1;
                    *acc.2.entry(last).or_default() += 1;
                    for w in trace.windows(2) {
                        *acc.3.entry((w[0], w[1])).or_default() += 1;
                    }
                }
                acc
            })
            .reduce(new_acc, |mut a, b| {
                for (k, v) in b.0 {
                    *a.0.entry(k).or_default() += v;
                }
                for (k, v) in b.1 {
                    *a.1.entry(k).or_default() += v;
                }
                for (k, v) in b.2 {
                    *a.2.entry(k).or_default() += v;
                }
                for (k, v) in b.3 {
                    *a.3.entry(k).or_default() += v;
                }
                a
            });

        if activities.is_empty() {
            continue;
        }
        let dfg = result.object_type_to_dfg.entry(ob_type).or_default();
        for (a, c) in activities {
            dfg.activities.insert(ev_type_names[a].to_string(), c);
        }
        for (s, c) in starts {
            dfg.start_activities.insert(ev_type_names[s].to_string(), c);
        }
        for (e, c) in ends {
            dfg.end_activities.insert(ev_type_names[e].to_string(), c);
        }
        dfg.directly_follows_relations = dfs
            .into_iter()
            .map(|((f, t), c)| ((ev_type_names[f].to_string(), ev_type_names[t].to_string()), c))
            .collect();
    }

    result
}

/// Per-object-type directly-follows arc duration statistics (performance overlay).
#[register_binding]
pub fn get_ocel_df_performance(ocel: &SlimLinkedOCEL) -> OcelDfPerformance {

    // Durations keyed by object_type -> (source_activity, target_activity) -> [ms].
    let mut arc_durations: HashMap<String, HashMap<(String, String), Vec<f64>>> = HashMap::new();

    for ob in ocel.get_all_obs() {
        let ob_type = ocel.get_ob_type_of(&ob).to_string();
        let unique_events: HashSet<_> = ocel.get_e2o_rev(&ob).map(|(_q, e)| *e).collect();
        if unique_events.is_empty() {
            continue;
        }
        let mut events: Vec<_> = unique_events.into_iter().collect();
        events.sort_by_key(|e| ocel.get_ev_time(e));

        let type_durations = arc_durations.entry(ob_type).or_default();
        for pair in events.windows(2) {
            let src_type = ocel.get_ev_type_of(&pair[0]).to_string();
            let tgt_type = ocel.get_ev_type_of(&pair[1]).to_string();
            let src_ts = ocel.get_ev_time(&pair[0]).timestamp_millis();
            let tgt_ts = ocel.get_ev_time(&pair[1]).timestamp_millis();
            let duration_ms = (tgt_ts - src_ts) as f64;
            type_durations
                .entry((src_type, tgt_type))
                .or_default()
                .push(duration_ms);
        }
    }

    let mut result = OcelDfPerformance::default();
    for (ob_type, pairs) in arc_durations {
        let mut arcs: Vec<DfArcDuration> = pairs
            .into_iter()
            .map(|((source, target), mut durations)| {
                durations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let count = durations.len();
                let min_ms = durations[0];
                let max_ms = durations[count - 1];
                let mean_ms = durations.iter().sum::<f64>() / count as f64;
                let median_ms = if count % 2 == 0 {
                    (durations[count / 2 - 1] + durations[count / 2]) / 2.0
                } else {
                    durations[count / 2]
                };
                let p90_idx = ((0.9 * count as f64).ceil() as usize)
                    .saturating_sub(1)
                    .min(count - 1);
                let p90_ms = durations[p90_idx];
                DfArcDuration {
                    source,
                    target,
                    count,
                    min_ms,
                    max_ms,
                    mean_ms,
                    median_ms,
                    p90_ms,
                }
            })
            .collect();
        arcs.sort_by(|a, b| b.count.cmp(&a.count));
        result.arcs_per_object_type.insert(ob_type, arcs);
    }
    result
}
