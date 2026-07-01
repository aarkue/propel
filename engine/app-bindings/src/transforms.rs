//! Event-log / OCEL transform pipeline.
//!
//! The registry bindings take `&EventLog` / `&SlimLinkedOCEL` directly (the
//! `#[register_binding]` macro maps these to handles) and return the transformed
//! `EventLog` / `OCEL`, which the engine auto-stores under a new handle id.
//!
//! The `#[serde(tag = "type")]` representation is preserved exactly so the
//! discriminated-union shape matches the frontend's `Transform["type"]`.
use std::collections::{HashMap, HashSet};

use process_mining::bindings::register_binding;
use process_mining::core::event_data::case_centric::{Event, XESEditableAttribute};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::{EventLog, OCEL};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::types::AttributeScope;

// --- Core enums ---

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum KeepOrRemove {
    Keep,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum RequiredOrForbidden {
    Required,
    Forbidden,
}

// --- Condition ---

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum Condition {
    AttributeEquals { key: String, value: String },
    AttributeGreaterThan { key: String, value: f64 },
    AttributeLessThan { key: String, value: f64 },
    AttributeContains { key: String, substring: String },
    And { conditions: Vec<Condition> },
    Or { conditions: Vec<Condition> },
    Not { condition: Box<Condition> },
}

// --- Relabeling ---

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum RelabelTarget {
    Literal { value: String },
    Template { template: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RelabelRule {
    pub target: RelabelTarget,
    pub condition: Option<Condition>,
}

// --- Transform ---

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum Transform {
    // Both XES and OCEL
    FilterActivities {
        activities: HashSet<String>,
        mode: KeepOrRemove,
    },
    RelabelActivities {
        rules: HashMap<String, Vec<RelabelRule>>,
    },
    FilterStartEnd {
        start_activities: Option<HashSet<String>>,
        end_activities: Option<HashSet<String>>,
    },
    FilterTraceContains {
        activities: HashSet<String>,
        mode: RequiredOrForbidden,
    },
    /// Filter traces by their exact activity sequence (variant).
    /// Each inner `Vec<String>` is one variant (ordered list of activity labels);
    /// a trace matches if its sequence equals any of them.
    FilterVariants {
        variants: Vec<Vec<String>>,
        mode: KeepOrRemove,
    },
    // OCEL-specific
    FilterObjectTypes {
        object_types: HashSet<String>,
        mode: KeepOrRemove,
    },
    RelabelObjectTypes {
        rules: HashMap<String, Vec<RelabelRule>>,
    },
    FilterMinRelatedEvents {
        min_events: Option<usize>,
        max_events: Option<usize>,
        of_type: Option<String>,
    },
    FilterMinRelatedObjects {
        min_objects: Option<usize>,
        max_objects: Option<usize>,
        of_type: Option<String>,
    },
    /// Sample randomly.
    Sample {
        /// How much to sample: a fixed count or a percentage of the total.
        amount: SampleAmount,
        /// Random seed for reproducibility. If None, uses a default seed.
        seed: Option<u32>,
        /// What to sample: traces (XES), objects, or events.
        target: SampleTarget,
    },
    /// Keep or remove events whose timestamp falls inside the given
    /// half-open range `[start, end)`. For XES logs, traces that become
    /// empty after the filter are dropped. For OCEL logs, objects whose
    /// events are all removed are also dropped.
    FilterTimeRange {
        /// Inclusive start of the range (ISO 8601 / RFC 3339, e.g. "2025-01-01T00:00:00+00:00").
        start: String,
        /// Exclusive end of the range (ISO 8601 / RFC 3339).
        end: String,
        mode: KeepOrRemove,
    },
    /// Rescale all timestamps to fit within a target timeframe.
    /// Preserves relative ordering and proportional gaps between events.
    RescaleTimeframe {
        /// Target start time (ISO 8601 / RFC 3339 string, e.g. "2025-01-01T00:00:00+00:00")
        target_start: String,
        /// Target end time (ISO 8601 / RFC 3339 string)
        target_end: String,
        /// If set, enforce a minimum gap (in milliseconds) between consecutive events after rescaling.
        min_gap_ms: Option<i64>,
        /// If set, enforce a maximum gap (in milliseconds) between consecutive events after rescaling.
        max_gap_ms: Option<i64>,
        /// For OCEL only: which object type to scope the gap clamping to.
        gap_object_type: Option<String>,
    },
    /// Filter events or cases/objects by attribute conditions.
    FilterAttributes {
        scope: AttributeScope,
        condition: Condition,
        mode: KeepOrRemove,
    },
    /// Remove named attribute keys from entities in a given scope.
    RemoveAttributes {
        scope: AttributeScope,
        keys: HashSet<String>,
    },
}

/// What to sample in a Sample transform.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum SampleTarget {
    /// Sample traces (XES) or objects (OCEL)
    TracesOrObjects,
    /// Sample individual events
    Events,
}

/// How much to sample in a Sample transform.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum SampleAmount {
    /// A fixed absolute count
    Count { value: usize },
    /// A percentage of the total (0.0-100.0)
    Percent { value: f64 },
}

impl SampleAmount {
    /// Compute the actual sample size given the total number of items.
    pub fn resolve(&self, total: usize) -> usize {
        match self {
            SampleAmount::Count { value } => (*value).min(total),
            SampleAmount::Percent { value } => {
                let pct = value.clamp(0.0, 100.0);
                ((total as f64 * pct / 100.0).round() as usize).min(total)
            }
        }
    }
}

// --- Shared helpers ---

/// Evaluate a condition against an attribute lookup function.
pub fn evaluate_condition(
    condition: &Condition,
    get_attr: &impl Fn(&str) -> Option<String>,
    get_attr_f64: &impl Fn(&str) -> Option<f64>,
) -> bool {
    match condition {
        Condition::AttributeEquals { key, value } => {
            get_attr(key).as_deref() == Some(value.as_str())
        }
        Condition::AttributeGreaterThan { key, value } => {
            get_attr_f64(key).is_some_and(|v| v > *value)
        }
        Condition::AttributeLessThan { key, value } => {
            get_attr_f64(key).is_some_and(|v| v < *value)
        }
        Condition::AttributeContains { key, substring } => {
            get_attr(key).is_some_and(|v| v.contains(substring.as_str()))
        }
        Condition::And { conditions } => conditions
            .iter()
            .all(|c| evaluate_condition(c, get_attr, get_attr_f64)),
        Condition::Or { conditions } => conditions
            .iter()
            .any(|c| evaluate_condition(c, get_attr, get_attr_f64)),
        Condition::Not { condition } => !evaluate_condition(condition, get_attr, get_attr_f64),
    }
}

/// Interpolate a template string like "Order_{country}" using an attribute lookup.
pub fn interpolate_template(template: &str, get_attr: &impl Fn(&str) -> Option<String>) -> String {
    let mut result = String::with_capacity(template.len());
    let mut chars = template.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '{' {
            let key: String = chars.by_ref().take_while(|&c| c != '}').collect();
            result.push_str(&get_attr(&key).unwrap_or_else(|| "UNKNOWN".to_string()));
        } else {
            result.push(ch);
        }
    }
    result
}

/// Apply relabel rules for a given original label. Returns the new label.
pub fn apply_relabel_rules(
    original: &str,
    rules: &HashMap<String, Vec<RelabelRule>>,
    get_attr: &impl Fn(&str) -> Option<String>,
    get_attr_f64: &impl Fn(&str) -> Option<f64>,
) -> String {
    let Some(rule_list) = rules.get(original) else {
        return original.to_string();
    };
    for rule in rule_list {
        let matches = match &rule.condition {
            None => true,
            Some(cond) => evaluate_condition(cond, get_attr, get_attr_f64),
        };
        if matches {
            return match &rule.target {
                RelabelTarget::Literal { value } => value.clone(),
                RelabelTarget::Template { template } => interpolate_template(template, get_attr),
            };
        }
    }
    original.to_string()
}

// --- XES apply helpers ---

fn get_event_activity(event: &Event) -> Option<&str> {
    event
        .attributes
        .get_by_key("concept:name")
        .and_then(|a| a.value.try_as_string())
        .map(|s| s.as_str())
}

fn xes_get_attr(event: &Event) -> impl Fn(&str) -> Option<String> + '_ {
    |key: &str| -> Option<String> {
        event
            .attributes
            .get_by_key(key)
            .map(|a| a.value.to_string())
    }
}

fn xes_get_attr_f64(event: &Event) -> impl Fn(&str) -> Option<f64> + '_ {
    use process_mining::core::event_data::case_centric::AttributeValue;
    |key: &str| -> Option<f64> {
        event
            .attributes
            .get_by_key(key)
            .and_then(|a| match &a.value {
                AttributeValue::Float(f) => Some(*f),
                AttributeValue::Int(i) => Some(*i as f64),
                AttributeValue::String(s) => s.parse().ok(),
                _ => None,
            })
    }
}

/// Apply a single transform to an event log (mutating in place).
fn apply_single_transform_xes(log: &mut EventLog, transform: &Transform) {
    use process_mining::core::event_data::case_centric::AttributeValue;
    match transform {
        Transform::FilterActivities { activities, mode } => {
            log.traces.iter_mut().for_each(|t| {
                t.events.retain(|e| {
                    let act = get_event_activity(e).unwrap_or("UNKNOWN");
                    let in_set = activities.contains(act);
                    match mode {
                        KeepOrRemove::Keep => in_set,
                        KeepOrRemove::Remove => !in_set,
                    }
                });
            });
        }
        Transform::RelabelActivities { rules } => {
            log.traces.iter_mut().for_each(|t| {
                t.events.iter_mut().for_each(|e| {
                    let act = get_event_activity(e).unwrap_or("UNKNOWN").to_string();
                    let new_label = {
                        let get_attr = xes_get_attr(e);
                        let get_attr_f64 = xes_get_attr_f64(e);
                        apply_relabel_rules(&act, rules, &get_attr, &get_attr_f64)
                    };
                    if new_label != act {
                        if let Some(attr) = e.attributes.get_by_key_mut("concept:name") {
                            attr.value = AttributeValue::String(new_label);
                        }
                    }
                });
            });
        }
        Transform::FilterStartEnd {
            start_activities,
            end_activities,
        } => {
            log.traces.retain(|t| {
                let start_ok = match start_activities {
                    Some(starts) => t
                        .events
                        .first()
                        .and_then(get_event_activity)
                        .is_some_and(|a| starts.contains(a)),
                    None => true,
                };
                let end_ok = match end_activities {
                    Some(ends) => t
                        .events
                        .last()
                        .and_then(get_event_activity)
                        .is_some_and(|a| ends.contains(a)),
                    None => true,
                };
                start_ok && end_ok
            });
        }
        Transform::FilterTraceContains { activities, mode } => {
            log.traces.retain(|t| {
                let contains = t
                    .events
                    .iter()
                    .any(|e| get_event_activity(e).is_some_and(|a| activities.contains(a)));
                match mode {
                    RequiredOrForbidden::Required => contains,
                    RequiredOrForbidden::Forbidden => !contains,
                }
            });
        }
        Transform::FilterTimeRange { start, end, mode } => {
            use process_mining::core::chrono::{DateTime, FixedOffset};
            let Ok(t_start) = start.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let Ok(t_end) = end.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let s_ms = t_start.timestamp_millis();
            let e_ms = t_end.timestamp_millis();
            for trace in &mut log.traces {
                trace.events.retain(|e| {
                    let Some(ts) = e
                        .attributes
                        .get_by_key("time:timestamp")
                        .and_then(|a| a.value.try_as_date())
                    else {
                        return matches!(mode, KeepOrRemove::Keep);
                    };
                    let ms = ts.timestamp_millis();
                    let inside = ms >= s_ms && ms < e_ms;
                    match mode {
                        KeepOrRemove::Keep => inside,
                        KeepOrRemove::Remove => !inside,
                    }
                });
            }
            log.traces.retain(|t| !t.events.is_empty());
        }
        Transform::FilterVariants { variants, mode } => {
            let variant_set: HashSet<Vec<String>> = variants.iter().cloned().collect();
            log.traces.retain(|t| {
                let seq: Vec<String> = t
                    .events
                    .iter()
                    .map(|e| get_event_activity(e).unwrap_or("UNKNOWN").to_string())
                    .collect();
                let matches = variant_set.contains(&seq);
                match mode {
                    KeepOrRemove::Keep => matches,
                    KeepOrRemove::Remove => !matches,
                }
            });
        }
        Transform::Sample {
            amount,
            seed,
            target,
        } => {
            use rand::seq::SliceRandom;
            use rand::SeedableRng;
            let mut rng = rand::rngs::SmallRng::seed_from_u64(seed.unwrap_or(42) as u64);
            match target {
                SampleTarget::TracesOrObjects => {
                    let count = amount.resolve(log.traces.len());
                    if log.traces.len() > count {
                        let mut indices: Vec<usize> = (0..log.traces.len()).collect();
                        indices.shuffle(&mut rng);
                        indices.truncate(count);
                        indices.sort();
                        log.traces = indices.into_iter().map(|i| log.traces[i].clone()).collect();
                    }
                }
                SampleTarget::Events => {
                    let total: usize = log.traces.iter().map(|t| t.events.len()).sum();
                    let count = amount.resolve(total);
                    if total > count {
                        let mut event_indices: Vec<usize> = (0..total).collect();
                        event_indices.shuffle(&mut rng);
                        event_indices.truncate(count);
                        let keep: HashSet<usize> = event_indices.into_iter().collect();
                        let mut global = 0usize;
                        for trace in &mut log.traces {
                            let mut local = 0usize;
                            trace.events.retain(|_| {
                                let kept = keep.contains(&(global + local));
                                local += 1;
                                kept
                            });
                            global += local;
                        }
                    }
                }
            }
        }
        Transform::RescaleTimeframe {
            target_start,
            target_end,
            min_gap_ms,
            max_gap_ms,
            ..
        } => {
            use process_mining::core::chrono::{DateTime, FixedOffset};
            let Ok(t_start) = target_start.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let Ok(t_end) = target_end.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let timestamps: Vec<i64> = log
                .traces
                .iter()
                .flat_map(|t| t.events.iter())
                .filter_map(|e| {
                    e.attributes
                        .get_by_key("time:timestamp")
                        .and_then(|a| a.value.try_as_date())
                        .map(|d| d.timestamp_millis())
                })
                .collect();
            let Some(&orig_min) = timestamps.iter().min() else {
                return;
            };
            let Some(&orig_max) = timestamps.iter().max() else {
                return;
            };
            let orig_range = (orig_max - orig_min) as f64;
            let target_min = t_start.timestamp_millis();
            let target_range = (t_end.timestamp_millis() - target_min) as f64;
            for trace in &mut log.traces {
                for event in &mut trace.events {
                    if let Some(attr) = event.attributes.get_by_key_mut("time:timestamp") {
                        if let Some(dt) = attr.value.try_as_date() {
                            let orig_ms = dt.timestamp_millis();
                            let ratio = if orig_range.abs() < 1.0 {
                                0.5
                            } else {
                                (orig_ms - orig_min) as f64 / orig_range
                            };
                            let new_ms = target_min + (ratio * target_range) as i64;
                            let new_dt =
                                DateTime::from_timestamp_millis(new_ms).map(|d| d.fixed_offset());
                            if let Some(new_dt) = new_dt {
                                attr.value = AttributeValue::Date(new_dt);
                            }
                        }
                    }
                }
            }
            if min_gap_ms.is_some() || max_gap_ms.is_some() {
                for trace in &mut log.traces {
                    let mut indexed: Vec<(usize, i64)> = trace
                        .events
                        .iter()
                        .enumerate()
                        .filter_map(|(i, e)| {
                            e.attributes
                                .get_by_key("time:timestamp")
                                .and_then(|a| a.value.try_as_date())
                                .map(|d| (i, d.timestamp_millis()))
                        })
                        .collect();
                    indexed.sort_by_key(|&(_, ms)| ms);
                    if indexed.len() < 2 {
                        continue;
                    }
                    for j in 1..indexed.len() {
                        let prev_ms = indexed[j - 1].1;
                        let curr_ms = indexed[j].1;
                        let mut new_ms = curr_ms;
                        if let Some(min) = min_gap_ms {
                            if (new_ms - prev_ms) < *min {
                                new_ms = prev_ms + *min;
                            }
                        }
                        if let Some(max) = max_gap_ms {
                            if (new_ms - prev_ms) > *max {
                                new_ms = prev_ms + *max;
                            }
                        }
                        indexed[j].1 = new_ms;
                    }
                    for (idx, new_ms) in indexed {
                        if let Some(attr) = trace.events[idx]
                            .attributes
                            .get_by_key_mut("time:timestamp")
                        {
                            if let Some(new_dt) =
                                DateTime::from_timestamp_millis(new_ms).map(|d| d.fixed_offset())
                            {
                                attr.value = AttributeValue::Date(new_dt);
                            }
                        }
                    }
                }
            }
        }
        // OCEL-only transforms: skip silently
        Transform::FilterObjectTypes { .. }
        | Transform::RelabelObjectTypes { .. }
        | Transform::FilterMinRelatedEvents { .. }
        | Transform::FilterMinRelatedObjects { .. } => {}
        Transform::FilterAttributes {
            scope,
            condition,
            mode,
        } => match scope {
            AttributeScope::LogGlobal => {}
            AttributeScope::Event { activity } => {
                for trace in &mut log.traces {
                    trace.events.retain(|e| {
                        if let Some(required) = activity.as_ref() {
                            let act = get_event_activity(e).unwrap_or("UNKNOWN");
                            if act != required.as_str() {
                                return true; // not in scope, keep
                            }
                        }
                        let get_attr = xes_get_attr(e);
                        let get_attr_f64 = xes_get_attr_f64(e);
                        let matches = evaluate_condition(condition, &get_attr, &get_attr_f64);
                        match mode {
                            KeepOrRemove::Keep => matches,
                            KeepOrRemove::Remove => !matches,
                        }
                    });
                }
                log.traces.retain(|t| !t.events.is_empty());
            }
            AttributeScope::Object { .. } => {
                log.traces.retain(|t| {
                    let get_attr = |key: &str| -> Option<String> {
                        t.attributes
                            .iter()
                            .find(|a| a.key == key)
                            .map(|a| a.value.to_string())
                    };
                    let get_attr_f64 = |key: &str| -> Option<f64> {
                        t.attributes
                            .iter()
                            .find(|a| a.key == key)
                            .and_then(|a| match &a.value {
                                AttributeValue::Float(f) => Some(*f),
                                AttributeValue::Int(i) => Some(*i as f64),
                                AttributeValue::String(s) => s.parse().ok(),
                                _ => None,
                            })
                    };
                    let matches = evaluate_condition(condition, &get_attr, &get_attr_f64);
                    match mode {
                        KeepOrRemove::Keep => matches,
                        KeepOrRemove::Remove => !matches,
                    }
                });
            }
        },
        Transform::RemoveAttributes { scope, keys } => {
            let is_structural = |k: &str| match scope {
                AttributeScope::Event { .. } => k == "concept:name" || k == "time:timestamp",
                AttributeScope::Object { .. } => k == "concept:name",
                AttributeScope::LogGlobal => false,
            };
            let effective: HashSet<&str> = keys
                .iter()
                .map(String::as_str)
                .filter(|k| !is_structural(k))
                .collect();
            if effective.is_empty() {
                return;
            }
            match scope {
                AttributeScope::LogGlobal => {
                    log.attributes
                        .retain(|a| !effective.contains(a.key.as_str()));
                }
                AttributeScope::Event { activity } => {
                    for trace in log.traces.iter_mut() {
                        for ev in trace.events.iter_mut() {
                            if let Some(required) = activity.as_ref() {
                                let act = get_event_activity(ev).unwrap_or("UNKNOWN");
                                if act != required.as_str() {
                                    continue;
                                }
                            }
                            ev.attributes
                                .retain(|a| !effective.contains(a.key.as_str()));
                        }
                    }
                    if activity.is_none() {
                        if let Some(defaults) = log.global_event_attrs.as_mut() {
                            defaults.retain(|a| !effective.contains(a.key.as_str()));
                        }
                    }
                }
                AttributeScope::Object { object_type } => {
                    if object_type.is_some() {
                        return; // XES has no object types
                    }
                    for trace in log.traces.iter_mut() {
                        trace
                            .attributes
                            .retain(|a| !effective.contains(a.key.as_str()));
                    }
                    if let Some(defaults) = log.global_trace_attrs.as_mut() {
                        defaults.retain(|a| !effective.contains(a.key.as_str()));
                    }
                }
            }
        }
    }
}

/// Apply a pipeline of transforms to an event log, mutating in place.
pub fn apply_transforms_to_event_log(log: &mut EventLog, transforms: &[Transform]) {
    for transform in transforms {
        apply_single_transform_xes(log, transform);
    }
}

// --- OCEL apply helpers ---

fn ocel_ev_get_attr<'a>(
    event: &'a process_mining::core::event_data::object_centric::OCELEvent,
) -> impl Fn(&str) -> Option<String> + 'a {
    |key: &str| -> Option<String> {
        event
            .attributes
            .iter()
            .find(|a| a.name == key)
            .map(|a| a.value.to_string())
    }
}

fn ocel_ev_get_attr_f64<'a>(
    event: &'a process_mining::core::event_data::object_centric::OCELEvent,
) -> impl Fn(&str) -> Option<f64> + 'a {
    use process_mining::core::event_data::object_centric::OCELAttributeValue;
    |key: &str| -> Option<f64> {
        event
            .attributes
            .iter()
            .find(|a| a.name == key)
            .and_then(|a| match &a.value {
                OCELAttributeValue::Float(f) => Some(*f),
                OCELAttributeValue::Integer(i) => Some(*i as f64),
                OCELAttributeValue::String(s) => s.parse().ok(),
                _ => None,
            })
    }
}

fn apply_single_transform_ocel(ocel: &mut OCEL, transform: &Transform) {
    use process_mining::core::event_data::object_centric::{OCELAttributeValue, OCELType};
    match transform {
        Transform::FilterActivities { activities, mode } => {
            ocel.events.retain(|e| {
                let in_set = activities.contains(&e.event_type);
                match mode {
                    KeepOrRemove::Keep => in_set,
                    KeepOrRemove::Remove => !in_set,
                }
            });
            let remaining_types: HashSet<_> =
                ocel.events.iter().map(|e| e.event_type.clone()).collect();
            ocel.event_types
                .retain(|t| remaining_types.contains(&t.name));
        }
        Transform::RelabelActivities { rules } => {
            for event in &mut ocel.events {
                let new_label = {
                    let get_attr = ocel_ev_get_attr(event);
                    let get_attr_f64 = ocel_ev_get_attr_f64(event);
                    apply_relabel_rules(&event.event_type, rules, &get_attr, &get_attr_f64)
                };
                event.event_type = new_label;
            }
            let actual_types: HashSet<_> =
                ocel.events.iter().map(|e| e.event_type.clone()).collect();
            ocel.event_types.retain(|t| actual_types.contains(&t.name));
            for t in &actual_types {
                if !ocel.event_types.iter().any(|et| et.name == *t) {
                    ocel.event_types.push(OCELType {
                        name: t.clone(),
                        attributes: Vec::new(),
                    });
                }
            }
        }
        Transform::FilterStartEnd {
            start_activities,
            end_activities,
        } => {
            let objects_to_remove: HashSet<String> = ocel
                .objects
                .iter()
                .filter(|ob| {
                    let mut obj_events: Vec<_> = ocel
                        .events
                        .iter()
                        .filter(|e| e.relationships.iter().any(|r| r.object_id == ob.id))
                        .collect();
                    obj_events.sort_by_key(|e| e.time);
                    let start_ok = match start_activities {
                        Some(starts) => obj_events
                            .first()
                            .is_some_and(|e| starts.contains(&e.event_type)),
                        None => true,
                    };
                    let end_ok = match end_activities {
                        Some(ends) => obj_events
                            .last()
                            .is_some_and(|e| ends.contains(&e.event_type)),
                        None => true,
                    };
                    !(start_ok && end_ok)
                })
                .map(|ob| ob.id.clone())
                .collect();
            ocel.objects
                .retain(|ob| !objects_to_remove.contains(&ob.id));
            for event in &mut ocel.events {
                event
                    .relationships
                    .retain(|r| !objects_to_remove.contains(&r.object_id));
            }
        }
        Transform::FilterVariants { .. } => {
            // Not applicable to OCEL: variants only make sense for trace-oriented logs.
        }
        Transform::FilterTimeRange { start, end, mode } => {
            use process_mining::core::chrono::{DateTime, FixedOffset};
            let Ok(t_start) = start.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let Ok(t_end) = end.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let s_ms = t_start.timestamp_millis();
            let e_ms = t_end.timestamp_millis();
            let removed_event_ids: HashSet<String> = ocel
                .events
                .iter()
                .filter(|e| {
                    let ms = e.time.timestamp_millis();
                    let inside = ms >= s_ms && ms < e_ms;
                    match mode {
                        KeepOrRemove::Keep => !inside,
                        KeepOrRemove::Remove => inside,
                    }
                })
                .map(|e| e.id.clone())
                .collect();
            ocel.events.retain(|e| !removed_event_ids.contains(&e.id));
            let referenced: HashSet<String> = ocel
                .events
                .iter()
                .flat_map(|e| e.relationships.iter().map(|r| r.object_id.clone()))
                .collect();
            ocel.objects.retain(|o| referenced.contains(&o.id));
        }
        Transform::FilterTraceContains { activities, mode } => {
            let objects_to_remove: HashSet<String> = ocel
                .objects
                .iter()
                .filter(|ob| {
                    let contains = ocel.events.iter().any(|e| {
                        e.relationships.iter().any(|r| r.object_id == ob.id)
                            && activities.contains(&e.event_type)
                    });
                    match mode {
                        RequiredOrForbidden::Required => !contains,
                        RequiredOrForbidden::Forbidden => contains,
                    }
                })
                .map(|ob| ob.id.clone())
                .collect();
            ocel.objects
                .retain(|ob| !objects_to_remove.contains(&ob.id));
            for event in &mut ocel.events {
                event
                    .relationships
                    .retain(|r| !objects_to_remove.contains(&r.object_id));
            }
        }
        Transform::FilterObjectTypes { object_types, mode } => {
            let removed_object_ids: HashSet<String> = ocel
                .objects
                .iter()
                .filter(|ob| {
                    let in_set = object_types.contains(&ob.object_type);
                    match mode {
                        KeepOrRemove::Keep => !in_set,
                        KeepOrRemove::Remove => in_set,
                    }
                })
                .map(|ob| ob.id.clone())
                .collect();
            ocel.objects
                .retain(|ob| !removed_object_ids.contains(&ob.id));
            ocel.object_types.retain(|t| {
                let in_set = object_types.contains(&t.name);
                match mode {
                    KeepOrRemove::Keep => in_set,
                    KeepOrRemove::Remove => !in_set,
                }
            });
            for event in &mut ocel.events {
                event
                    .relationships
                    .retain(|r| !removed_object_ids.contains(&r.object_id));
            }
            for obj in &mut ocel.objects {
                obj.relationships
                    .retain(|r| !removed_object_ids.contains(&r.object_id));
            }
        }
        Transform::RelabelObjectTypes { rules } => {
            let no_attr = |_: &str| -> Option<String> { None };
            let no_attr_f64 = |_: &str| -> Option<f64> { None };
            for obj in &mut ocel.objects {
                let new_label =
                    apply_relabel_rules(&obj.object_type, rules, &no_attr, &no_attr_f64);
                obj.object_type = new_label;
            }
            let actual_types: HashSet<_> =
                ocel.objects.iter().map(|o| o.object_type.clone()).collect();
            ocel.object_types.retain(|t| actual_types.contains(&t.name));
            for t in &actual_types {
                if !ocel.object_types.iter().any(|ot| ot.name == *t) {
                    ocel.object_types.push(OCELType {
                        name: t.clone(),
                        attributes: Vec::new(),
                    });
                }
            }
        }
        Transform::FilterMinRelatedEvents {
            min_events,
            max_events,
            of_type,
        } => {
            let objects_to_remove: HashSet<String> = ocel
                .objects
                .iter()
                .filter(|ob| {
                    let count = ocel
                        .events
                        .iter()
                        .filter(|e| {
                            e.relationships.iter().any(|r| r.object_id == ob.id)
                                && of_type.as_ref().is_none_or(|t| e.event_type == *t)
                        })
                        .count();
                    let too_few = min_events.is_some_and(|min| count < min);
                    let too_many = max_events.is_some_and(|max| count > max);
                    too_few || too_many
                })
                .map(|ob| ob.id.clone())
                .collect();
            ocel.objects
                .retain(|ob| !objects_to_remove.contains(&ob.id));
            for event in &mut ocel.events {
                event
                    .relationships
                    .retain(|r| !objects_to_remove.contains(&r.object_id));
            }
        }
        Transform::FilterMinRelatedObjects {
            min_objects,
            max_objects,
            of_type,
        } => {
            let object_ids_by_type: HashMap<&str, HashSet<&str>> = ocel
                .objects
                .iter()
                .map(|ob| (ob.object_type.as_str(), ob.id.as_str()))
                .fold(HashMap::new(), |mut acc, (ot, oid)| {
                    acc.entry(ot).or_default().insert(oid);
                    acc
                });
            let events_to_remove: HashSet<String> = ocel
                .events
                .iter()
                .filter(|e| {
                    let count = e
                        .relationships
                        .iter()
                        .filter(|r| {
                            of_type.as_ref().is_none_or(|t| {
                                object_ids_by_type
                                    .get(t.as_str())
                                    .is_some_and(|ids| ids.contains(r.object_id.as_str()))
                            })
                        })
                        .count();
                    let too_few = min_objects.is_some_and(|min| count < min);
                    let too_many = max_objects.is_some_and(|max| count > max);
                    too_few || too_many
                })
                .map(|e| e.id.clone())
                .collect();
            ocel.events.retain(|e| !events_to_remove.contains(&e.id));
            let remaining_types: HashSet<_> =
                ocel.events.iter().map(|e| e.event_type.clone()).collect();
            ocel.event_types
                .retain(|t| remaining_types.contains(&t.name));
        }
        Transform::Sample {
            amount,
            seed,
            target,
        } => {
            use rand::seq::SliceRandom;
            use rand::SeedableRng;
            let mut rng = rand::rngs::SmallRng::seed_from_u64(seed.unwrap_or(42) as u64);
            match target {
                SampleTarget::TracesOrObjects => {
                    let count = amount.resolve(ocel.objects.len());
                    if ocel.objects.len() > count {
                        let mut indices: Vec<usize> = (0..ocel.objects.len()).collect();
                        indices.shuffle(&mut rng);
                        indices.truncate(count);
                        indices.sort();
                        let kept_ids: HashSet<_> = indices
                            .into_iter()
                            .map(|i| ocel.objects[i].id.clone())
                            .collect();
                        ocel.objects.retain(|ob| kept_ids.contains(&ob.id));
                        for event in &mut ocel.events {
                            event
                                .relationships
                                .retain(|r| kept_ids.contains(&r.object_id));
                        }
                        for obj in &mut ocel.objects {
                            obj.relationships
                                .retain(|r| kept_ids.contains(&r.object_id));
                        }
                    }
                }
                SampleTarget::Events => {
                    let count = amount.resolve(ocel.events.len());
                    if ocel.events.len() > count {
                        let mut indices: Vec<usize> = (0..ocel.events.len()).collect();
                        indices.shuffle(&mut rng);
                        indices.truncate(count);
                        let kept_ids: HashSet<_> = indices
                            .into_iter()
                            .map(|i| ocel.events[i].id.clone())
                            .collect();
                        ocel.events.retain(|e| kept_ids.contains(&e.id));
                    }
                }
            }
        }
        Transform::RescaleTimeframe {
            target_start,
            target_end,
            min_gap_ms,
            max_gap_ms,
            gap_object_type,
        } => {
            use process_mining::core::chrono::{DateTime, FixedOffset};
            let Ok(t_start) = target_start.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let Ok(t_end) = target_end.parse::<DateTime<FixedOffset>>() else {
                return;
            };
            let Some(epoch) = DateTime::from_timestamp(0, 0).map(|d| d.fixed_offset()) else {
                return;
            };

            let timestamps: Vec<i64> = ocel
                .events
                .iter()
                .map(|e| e.time.timestamp_millis())
                .collect();
            let Some(&orig_min) = timestamps.iter().min() else {
                return;
            };
            let Some(&orig_max) = timestamps.iter().max() else {
                return;
            };
            let orig_range = (orig_max - orig_min) as f64;
            let target_min = t_start.timestamp_millis();
            let target_range = (t_end.timestamp_millis() - target_min) as f64;

            let rescale = |ts: &DateTime<FixedOffset>| -> DateTime<FixedOffset> {
                let orig_ms = ts.timestamp_millis();
                let ratio = if orig_range.abs() < 1.0 {
                    0.5
                } else {
                    (orig_ms - orig_min) as f64 / orig_range
                };
                let new_ms = target_min + (ratio * target_range) as i64;
                DateTime::from_timestamp_millis(new_ms)
                    .map(|d| d.fixed_offset())
                    .unwrap_or(*ts)
            };

            for event in &mut ocel.events {
                event.time = rescale(&event.time);
            }
            for obj in &mut ocel.objects {
                for attr in &mut obj.attributes {
                    if attr.time != epoch {
                        attr.time = rescale(&attr.time);
                    }
                }
            }
            if min_gap_ms.is_some() || max_gap_ms.is_some() {
                let obj_event_groups: Vec<Vec<usize>> = ocel
                    .objects
                    .iter()
                    .filter(|obj| match gap_object_type {
                        Some(ot) => obj.object_type == *ot,
                        None => true,
                    })
                    .map(|obj| {
                        let mut indices: Vec<usize> = ocel
                            .events
                            .iter()
                            .enumerate()
                            .filter(|(_, e)| e.relationships.iter().any(|r| r.object_id == obj.id))
                            .map(|(i, _)| i)
                            .collect();
                        indices.sort_by_key(|&i| ocel.events[i].time);
                        indices
                    })
                    .filter(|indices| indices.len() >= 2)
                    .collect();
                for obj_ev_indices in obj_event_groups {
                    let mut prev_ms = ocel.events[obj_ev_indices[0]].time.timestamp_millis();
                    for &idx in &obj_ev_indices[1..] {
                        let curr_ms = ocel.events[idx].time.timestamp_millis();
                        let mut new_ms = curr_ms;
                        if let Some(min) = min_gap_ms {
                            if (new_ms - prev_ms) < *min {
                                new_ms = prev_ms + *min;
                            }
                        }
                        if let Some(max) = max_gap_ms {
                            if (new_ms - prev_ms) > *max {
                                new_ms = prev_ms + *max;
                            }
                        }
                        if new_ms != curr_ms {
                            if let Some(new_dt) =
                                DateTime::from_timestamp_millis(new_ms).map(|d| d.fixed_offset())
                            {
                                ocel.events[idx].time = new_dt;
                            }
                        }
                        prev_ms = ocel.events[idx].time.timestamp_millis();
                    }
                }
            }
        }
        Transform::FilterAttributes {
            scope,
            condition,
            mode,
        } => match scope {
            AttributeScope::LogGlobal => {}
            AttributeScope::Event { activity } => {
                let removed_event_ids: HashSet<String> = ocel
                    .events
                    .iter()
                    .filter(|e| {
                        if let Some(required) = activity.as_ref() {
                            if e.event_type != *required {
                                return false; // not in scope, don't remove
                            }
                        }
                        let get_attr = ocel_ev_get_attr(e);
                        let get_attr_f64 = ocel_ev_get_attr_f64(e);
                        let matches = evaluate_condition(condition, &get_attr, &get_attr_f64);
                        match mode {
                            KeepOrRemove::Keep => !matches,
                            KeepOrRemove::Remove => matches,
                        }
                    })
                    .map(|e| e.id.clone())
                    .collect();
                ocel.events.retain(|e| !removed_event_ids.contains(&e.id));
                let referenced: HashSet<String> = ocel
                    .events
                    .iter()
                    .flat_map(|e| e.relationships.iter().map(|r| r.object_id.clone()))
                    .collect();
                ocel.objects.retain(|o| referenced.contains(&o.id));
            }
            AttributeScope::Object { object_type } => {
                let objects_to_remove: HashSet<String> = ocel
                    .objects
                    .iter()
                    .filter(|ob| {
                        if let Some(required) = object_type.as_ref() {
                            if ob.object_type != *required {
                                return false; // not in scope, don't remove
                            }
                        }
                        let get_attr = |key: &str| -> Option<String> {
                            ob.attributes
                                .iter()
                                .rfind(|a| a.name == key)
                                .map(|a| a.value.to_string())
                        };
                        let get_attr_f64 = |key: &str| -> Option<f64> {
                            ob.attributes.iter().rfind(|a| a.name == key).and_then(|a| {
                                match &a.value {
                                    OCELAttributeValue::Float(f) => Some(*f),
                                    OCELAttributeValue::Integer(i) => Some(*i as f64),
                                    OCELAttributeValue::String(s) => s.parse().ok(),
                                    _ => None,
                                }
                            })
                        };
                        let matches = evaluate_condition(condition, &get_attr, &get_attr_f64);
                        match mode {
                            KeepOrRemove::Keep => !matches,
                            KeepOrRemove::Remove => matches,
                        }
                    })
                    .map(|ob| ob.id.clone())
                    .collect();
                ocel.objects
                    .retain(|ob| !objects_to_remove.contains(&ob.id));
                for event in &mut ocel.events {
                    event
                        .relationships
                        .retain(|r| !objects_to_remove.contains(&r.object_id));
                }
            }
        },
        Transform::RemoveAttributes { scope, keys } => {
            if keys.is_empty() {
                return;
            }
            match scope {
                AttributeScope::LogGlobal => {}
                AttributeScope::Event { activity } => {
                    for ev in ocel.events.iter_mut() {
                        if let Some(required) = activity.as_ref() {
                            if ev.event_type != *required {
                                continue;
                            }
                        }
                        ev.attributes.retain(|a| !keys.contains(&a.name));
                    }
                }
                AttributeScope::Object { object_type } => {
                    for ob in ocel.objects.iter_mut() {
                        if let Some(required) = object_type.as_ref() {
                            if ob.object_type != *required {
                                continue;
                            }
                        }
                        ob.attributes.retain(|a| !keys.contains(&a.name));
                    }
                }
            }
        }
    }
}

// --- Registry bindings ---

/// Apply a pipeline of transforms to an event log, returning the transformed log.
#[register_binding]
pub fn apply_event_log_transforms(event_log: &EventLog, transforms: Vec<Transform>) -> EventLog {
    let mut out = event_log.clone();
    apply_transforms_to_event_log(&mut out, &transforms);
    out
}

/// Apply a pipeline of transforms to an OCEL. Contract is canonical `SlimLinkedOCEL` in and out, so
/// the result is directly usable by every OCEL panel and chainable into further transforms.
///
/// TODO(slim-native): internally this still round-trips through a plain `OCEL`
/// (`construct_ocel` -> mutate -> `from_ocel`). The slim structure is index-linked and read-optimized
/// with no projection/removal primitive, so filtering it natively means a full rebuild-via-builder.
/// Once upstream `process_mining` grows a slim filter/projection API, drop the round-trip and mutate
/// the slim log directly.
#[register_binding]
pub fn apply_ocel_transforms(ocel: &SlimLinkedOCEL, transforms: Vec<Transform>) -> SlimLinkedOCEL {
    let mut out = ocel.construct_ocel();
    for transform in &transforms {
        apply_single_transform_ocel(&mut out, transform);
    }
    SlimLinkedOCEL::from_ocel(out)
}
