//! Event-log / OCEL transform pipeline. Registry bindings take `&EventLog`/`&SlimLinkedOCEL` directly and return the transformed log.
//! The `#[serde(tag = "type")]` shape is preserved exactly to match the frontend's `Transform["type"]`.
use std::collections::{HashMap, HashSet};
use std::hash::Hash;

use process_mining::bindings::register_binding;
use process_mining::core::event_data::case_centric::{Event, XESEditableAttribute};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::EventLog;
#[cfg(test)]
use process_mining::OCEL;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::slim_project::Overlay;
use crate::types::AttributeScope;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum KeepOrRemove {
    Keep,
    Remove,
}

impl KeepOrRemove {
    /// Whether an item that matched (`matched = true`) or didn't (`false`) should be kept.
    fn keeps(&self, matched: bool) -> bool {
        matches!(self, KeepOrRemove::Keep) == matched
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum RequiredOrForbidden {
    Required,
    Forbidden,
}

/// How an entity's temporal footprint must relate to a window `[start, end)`. For an event this
/// is its timestamp; for a trace/object it's the related event timestamps, `span` = `[first, last]`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum TimeframeMode {
    /// At least one event falls inside the window.
    AnyEvent,
    /// Every event falls inside the window.
    AllEvents,
    /// The whole span lies inside the window (`first >= start`, `last < end`).
    SpanWithin,
    /// The span covers the whole window (`first <= start`, `last >= end`).
    SpanEncloses,
    /// The span's first event falls inside the window.
    StartsWithin,
    /// The span's last event falls inside the window.
    EndsWithin,
    /// The span overlaps the window at all.
    Overlaps,
    /// The span ends before the window starts.
    Before,
    /// The span starts at or after the window ends.
    After,
}

/// How related entities (events / objects) must satisfy a sub-condition in an
/// `EventMatch` / `ObjectMatch` predicate.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum MatchQuantifier {
    /// At least one related entity matches.
    Any,
    /// Every related entity matches (false if there are none).
    All,
    /// The earliest related event matches (events are time-sorted; for objects = first).
    First,
    /// The latest related event matches (for objects = last in relation order).
    Last,
}

/// An owned, evaluable snapshot of one related entity (event or object), used to run a
/// sub-condition against related events (`EventMatch`) or objects (`ObjectMatch`).
pub struct EntityFacts {
    type_name: String,
    times_ms: Vec<i64>,
    string_attrs: HashMap<String, String>,
    f64_attrs: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum Condition {
    AttributeEquals {
        key: String,
        value: String,
    },
    AttributeGreaterThan {
        key: String,
        value: f64,
    },
    AttributeLessThan {
        key: String,
        value: f64,
    },
    AttributeContains {
        key: String,
        substring: String,
    },
    /// Match on the entity's event timestamps relative to the half-open window
    /// `[start, end)`. Composes with the other conditions via `And`/`Or`/`Not`.
    Timeframe {
        /// Inclusive window start (RFC 3339, e.g. "2025-01-01T00:00:00+00:00").
        start: String,
        /// Exclusive window end (RFC 3339).
        end: String,
        mode: TimeframeMode,
    },
    /// True if the entity carries the attribute `key` at all (any value).
    AttributeExists {
        key: String,
    },
    /// True if the entity's own type matches: event activity, or object type.
    EntityType {
        value: String,
    },
    /// True if the entity's `[first event, last event]` span duration (ms) is within
    /// `[min_ms, max_ms]` (either bound optional). Atomic events have zero-length spans.
    Duration {
        min_ms: Option<i64>,
        max_ms: Option<i64>,
    },
    /// (OCEL object / XES case scope) Evaluate the sub-condition against the entity's related
    /// events (their activity, attributes, timestamp) with the given quantifier.
    EventMatch {
        quantifier: MatchQuantifier,
        condition: Box<Condition>,
    },
    /// Evaluate the sub-condition against related objects: at event scope over E2O-linked
    /// objects ("events with a matching object"), at object scope over O2O-linked objects.
    ObjectMatch {
        quantifier: MatchQuantifier,
        condition: Box<Condition>,
    },
    And {
        conditions: Vec<Condition>,
    },
    Or {
        conditions: Vec<Condition>,
    },
    Not {
        condition: Box<Condition>,
    },
}

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
    /// Filter traces by their exact activity sequence (variant); a trace matches if its
    /// sequence equals any of the given variants.
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
    /// Keep or remove events whose timestamp falls inside the given half-open range
    /// `[start, end)`. Traces/objects left empty by the filter are dropped too.
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

/// Whether an entity's event timestamps (millis) satisfy `mode` against window `[s_ms, e_ms)`.
fn timeframe_matches(times_ms: &[i64], s_ms: i64, e_ms: i64, mode: &TimeframeMode) -> bool {
    let Some(&min) = times_ms.iter().min() else {
        return false; // no events -> no temporal footprint to match
    };
    let max = *times_ms.iter().max().unwrap();
    let in_win = |t: i64| t >= s_ms && t < e_ms;
    match mode {
        TimeframeMode::AnyEvent => times_ms.iter().any(|&t| in_win(t)),
        TimeframeMode::AllEvents => times_ms.iter().all(|&t| in_win(t)),
        TimeframeMode::SpanWithin => min >= s_ms && max < e_ms,
        TimeframeMode::SpanEncloses => min <= s_ms && max >= e_ms,
        TimeframeMode::StartsWithin => in_win(min),
        TimeframeMode::EndsWithin => in_win(max),
        TimeframeMode::Overlaps => min < e_ms && max >= s_ms,
        TimeframeMode::Before => max < s_ms,
        TimeframeMode::After => min >= e_ms,
    }
}

/// Accessors a `Condition` may consult while evaluating one entity. A field absent in the
/// current scope is `None`, and a predicate needing it fails closed (`false`).
#[derive(Default)]
pub struct EvalCtx<'a> {
    attr: Option<&'a dyn Fn(&str) -> Option<String>>,
    attr_f64: Option<&'a dyn Fn(&str) -> Option<f64>>,
    times_ms: Option<&'a dyn Fn() -> Vec<i64>>,
    entity_type: Option<&'a dyn Fn() -> Option<String>>,
    related_events: Option<&'a dyn Fn() -> Vec<EntityFacts>>,
    related_objects: Option<&'a dyn Fn() -> Vec<EntityFacts>>,
}

impl<'a> EvalCtx<'a> {
    /// Attribute + timestamp accessors, present in every filter scope.
    pub fn new(
        attr: &'a dyn Fn(&str) -> Option<String>,
        attr_f64: &'a dyn Fn(&str) -> Option<f64>,
        times_ms: &'a dyn Fn() -> Vec<i64>,
    ) -> Self {
        EvalCtx {
            attr: Some(attr),
            attr_f64: Some(attr_f64),
            times_ms: Some(times_ms),
            ..Default::default()
        }
    }

    /// Add the entity's own-type accessor (event activity, or object type).
    pub fn with_type(mut self, entity_type: &'a dyn Fn() -> Option<String>) -> Self {
        self.entity_type = Some(entity_type);
        self
    }

    /// Add the entity's related-events accessor (for `EventMatch`; object / case scope).
    pub fn with_events(mut self, related_events: &'a dyn Fn() -> Vec<EntityFacts>) -> Self {
        self.related_events = Some(related_events);
        self
    }

    /// Add the entity's related-objects accessor (for `ObjectMatch`; E2O at event scope,
    /// O2O at object scope).
    pub fn with_objects(mut self, related_objects: &'a dyn Fn() -> Vec<EntityFacts>) -> Self {
        self.related_objects = Some(related_objects);
        self
    }

    fn attr(&self, key: &str) -> Option<String> {
        self.attr.and_then(|f| f(key))
    }
    fn attr_f64(&self, key: &str) -> Option<f64> {
        self.attr_f64.and_then(|f| f(key))
    }
    fn times(&self) -> Vec<i64> {
        self.times_ms.map(|f| f()).unwrap_or_default()
    }
    fn entity_type(&self) -> Option<String> {
        self.entity_type.and_then(|f| f())
    }
}

/// Run `sub` against a set of related entities with the given quantifier.
fn match_related(items: &[EntityFacts], q: &MatchQuantifier, sub: &Condition) -> bool {
    let hit = |f: &EntityFacts| {
        let attr = |k: &str| f.string_attrs.get(k).cloned();
        let attr_f64 = |k: &str| f.f64_attrs.get(k).copied();
        let times = || f.times_ms.clone();
        let ty = || Some(f.type_name.clone());
        evaluate_condition(sub, &EvalCtx::new(&attr, &attr_f64, &times).with_type(&ty))
    };
    match q {
        MatchQuantifier::Any => items.iter().any(hit),
        MatchQuantifier::All => !items.is_empty() && items.iter().all(hit),
        MatchQuantifier::First => items.first().is_some_and(hit),
        MatchQuantifier::Last => items.last().is_some_and(hit),
    }
}

/// Evaluate a composable `Condition` for one entity via the accessors in `ctx`.
pub fn evaluate_condition(condition: &Condition, ctx: &EvalCtx) -> bool {
    match condition {
        Condition::AttributeEquals { key, value } => {
            ctx.attr(key).as_deref() == Some(value.as_str())
        }
        Condition::AttributeGreaterThan { key, value } => {
            ctx.attr_f64(key).is_some_and(|v| v > *value)
        }
        Condition::AttributeLessThan { key, value } => {
            ctx.attr_f64(key).is_some_and(|v| v < *value)
        }
        Condition::AttributeContains { key, substring } => ctx
            .attr(key)
            .is_some_and(|v| v.contains(substring.as_str())),
        Condition::AttributeExists { key } => ctx.attr(key).is_some(),
        Condition::EntityType { value } => ctx.entity_type().as_deref() == Some(value.as_str()),
        Condition::Timeframe { start, end, mode } => {
            use process_mining::core::chrono::{DateTime, FixedOffset};
            let (Ok(s), Ok(e)) = (
                start.parse::<DateTime<FixedOffset>>(),
                end.parse::<DateTime<FixedOffset>>(),
            ) else {
                return false; // unparseable bounds -> no match (UI supplies valid RFC 3339)
            };
            timeframe_matches(
                &ctx.times(),
                s.timestamp_millis(),
                e.timestamp_millis(),
                mode,
            )
        }
        Condition::Duration { min_ms, max_ms } => {
            let times = ctx.times();
            let (Some(&lo), Some(&hi)) = (times.iter().min(), times.iter().max()) else {
                return false; // no events -> no span to measure
            };
            let dur = hi - lo;
            min_ms.map_or(true, |m| dur >= m) && max_ms.map_or(true, |m| dur <= m)
        }
        Condition::EventMatch {
            quantifier,
            condition,
        } => match ctx.related_events {
            Some(f) => match_related(&f(), quantifier, condition),
            None => false,
        },
        Condition::ObjectMatch {
            quantifier,
            condition,
        } => match ctx.related_objects {
            Some(f) => match_related(&f(), quantifier, condition),
            None => false,
        },
        Condition::And { conditions } => conditions.iter().all(|c| evaluate_condition(c, ctx)),
        Condition::Or { conditions } => conditions.iter().any(|c| evaluate_condition(c, ctx)),
        Condition::Not { condition } => !evaluate_condition(condition, ctx),
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
    ctx: &EvalCtx,
) -> String {
    let Some(rule_list) = rules.get(original) else {
        return original.to_string();
    };
    for rule in rule_list {
        let matches = match &rule.condition {
            None => true,
            Some(cond) => evaluate_condition(cond, ctx),
        };
        if matches {
            return match &rule.target {
                RelabelTarget::Literal { value } => value.clone(),
                RelabelTarget::Template { template } => {
                    interpolate_template(template, &|k: &str| ctx.attr(k))
                }
            };
        }
    }
    original.to_string()
}

fn get_event_activity(event: &Event) -> Option<&str> {
    event
        .attributes
        .get_by_key("concept:name")
        .and_then(|a| a.value.try_as_string())
        .map(|s| s.as_str())
}

fn xes_event_time_ms(event: &Event) -> Option<i64> {
    use process_mining::core::chrono::{DateTime, FixedOffset};
    use process_mining::core::event_data::case_centric::AttributeValue;
    match event
        .attributes
        .get_by_key("time:timestamp")
        .map(|a| &a.value)
    {
        Some(AttributeValue::Date(dt)) => Some(dt.timestamp_millis()),
        Some(AttributeValue::String(s)) => s
            .parse::<DateTime<FixedOffset>>()
            .ok()
            .map(|d| d.timestamp_millis()),
        _ => None,
    }
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
                        let get_times = || xes_event_time_ms(e).into_iter().collect::<Vec<_>>();
                        let get_type = || get_event_activity(e).map(|s| s.to_string());
                        apply_relabel_rules(
                            &act,
                            rules,
                            &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                                .with_type(&get_type),
                        )
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
                        let get_times = || xes_event_time_ms(e).into_iter().collect::<Vec<_>>();
                        let get_type = || get_event_activity(e).map(|s| s.to_string());
                        let matches = evaluate_condition(
                            condition,
                            &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                                .with_type(&get_type),
                        );
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
                    let get_times = || {
                        t.events
                            .iter()
                            .filter_map(xes_event_time_ms)
                            .collect::<Vec<_>>()
                    };
                    let get_events = || t.events.iter().map(xes_event_facts).collect::<Vec<_>>();
                    let matches = evaluate_condition(
                        condition,
                        &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                            .with_events(&get_events),
                    );
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

// Reachable only from the `#[cfg(test)]` parity oracle now that production
// `apply_ocel_transforms` is slim-native; kept under `#[cfg(test)]` so a production build carries no dead code.

#[cfg(test)]
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

#[cfg(test)]
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

#[cfg(test)]
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
                    let get_times = || vec![event.time.timestamp_millis()];
                    let get_type = || Some(event.event_type.clone());
                    apply_relabel_rules(
                        &event.event_type,
                        rules,
                        &EvalCtx::new(&get_attr, &get_attr_f64, &get_times).with_type(&get_type),
                    )
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
                let no_times = || Vec::<i64>::new();
                let new_label = apply_relabel_rules(
                    &obj.object_type,
                    rules,
                    &EvalCtx::new(&no_attr, &no_attr_f64, &no_times),
                );
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
                        let get_times = || vec![e.time.timestamp_millis()];
                        let get_type = || Some(e.event_type.clone());
                        let matches = evaluate_condition(
                            condition,
                            &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                                .with_type(&get_type),
                        );
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
                let events_ref = &ocel.events;
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
                        let get_times = || {
                            events_ref
                                .iter()
                                .filter(|ev| ev.relationships.iter().any(|r| r.object_id == ob.id))
                                .map(|ev| ev.time.timestamp_millis())
                                .collect::<Vec<_>>()
                        };
                        let get_type = || Some(ob.object_type.clone());
                        let matches = evaluate_condition(
                            condition,
                            &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                                .with_type(&get_type),
                        );
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

// `fold_transform` folds one `Transform` into an `Overlay`'s keep-mask/remap state in place, reading only through the overlay's inherent helpers.
// Production `apply_ocel_transforms` below folds a whole pipeline into one `Overlay` before a single `build_slim` materializes it, no per-transform round-trip.
use process_mining::core::event_data::object_centric::OCELAttributeValue;

/// Coerce an OCEL attribute value to f64: numeric types pass through, a string is parsed,
/// everything else is `None`. Shared by every `fold_transform` numeric-comparison closure.
fn ocel_attr_f64(v: &OCELAttributeValue) -> Option<f64> {
    match v {
        OCELAttributeValue::Float(f) => Some(*f),
        OCELAttributeValue::Integer(i) => Some(*i as f64),
        OCELAttributeValue::String(s) => s.parse().ok(),
        _ => None,
    }
}

/// Drop every kept object with zero surviving related events (the orphan cascade after a
/// filter that can remove an object's only remaining events).
fn drop_orphan_objects<'a, A>(ov: &mut Overlay<'a, A>)
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    ov.retain_objects(|ov, o| ov.e2o_rev(o).next().is_some());
}

fn xes_attr_f64(
    value: &process_mining::core::event_data::case_centric::AttributeValue,
) -> Option<f64> {
    use process_mining::core::event_data::case_centric::AttributeValue;
    match value {
        AttributeValue::Float(f) => Some(*f),
        AttributeValue::Int(i) => Some(*i as f64),
        AttributeValue::String(s) => s.parse().ok(),
        _ => None,
    }
}

/// Evaluable snapshot of an XES event (for `EventMatch` at case scope).
fn xes_event_facts(e: &Event) -> EntityFacts {
    let mut string_attrs = HashMap::new();
    let mut f64_attrs = HashMap::new();
    for attr in e.attributes.iter() {
        string_attrs.insert(attr.key.clone(), attr.value.to_string());
        if let Some(x) = xes_attr_f64(&attr.value) {
            f64_attrs.insert(attr.key.clone(), x);
        }
    }
    EntityFacts {
        type_name: get_event_activity(e).unwrap_or("UNKNOWN").to_string(),
        times_ms: xes_event_time_ms(e).into_iter().collect(),
        string_attrs,
        f64_attrs,
    }
}

/// Evaluable snapshot of an OCEL event (slim-native).
fn event_facts_slim<'a, A>(ov: &Overlay<'a, A>, e: A::EventRepr) -> EntityFacts
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    let mut string_attrs = HashMap::new();
    let mut f64_attrs = HashMap::new();
    for name in ov.ev_attrs(e) {
        if let Some(v) = ov.ev_attr_val(e, name) {
            string_attrs.insert(name.to_string(), v.to_string());
            if let Some(x) = ocel_attr_f64(v) {
                f64_attrs.insert(name.to_string(), x);
            }
        }
    }
    EntityFacts {
        type_name: ov.ev_type(e).to_string(),
        times_ms: vec![ov.ev_time(e).timestamp_millis()],
        string_attrs,
        f64_attrs,
    }
}

/// Evaluable snapshot of an OCEL object (slim-native); its span = related-event times.
fn object_facts_slim<'a, A>(ov: &Overlay<'a, A>, o: A::ObjectRepr) -> EntityFacts
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    let mut string_attrs = HashMap::new();
    let mut f64_attrs = HashMap::new();
    for name in ov.ob_attrs(o) {
        if let Some((_, v)) = ov.ob_attr_vals(o, name).last() {
            string_attrs.insert(name.to_string(), v.to_string());
            if let Some(x) = ocel_attr_f64(v) {
                f64_attrs.insert(name.to_string(), x);
            }
        }
    }
    let times_ms = ov
        .related_events_sorted(o)
        .into_iter()
        .map(|e| ov.ev_time(e).timestamp_millis())
        .collect();
    EntityFacts {
        type_name: ov.ob_type(o).to_string(),
        times_ms,
        string_attrs,
        f64_attrs,
    }
}

pub(crate) fn fold_transform<'a, A>(ov: &mut Overlay<'a, A>, t: &Transform)
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    match t {
        Transform::FilterActivities { activities, mode } => {
            ov.retain_events(|ov, e| mode.keeps(activities.contains(ov.ev_type(e))));
        }
        Transform::FilterObjectTypes { object_types, mode } => {
            ov.retain_objects(|ov, o| mode.keeps(object_types.contains(ov.ob_type(o))));
        }
        Transform::FilterStartEnd {
            start_activities,
            end_activities,
        } => {
            ov.retain_objects(|ov, o| {
                // Only the first/last element of the effective-time-sorted related events is read.
                let evs = ov.related_events_sorted(o);
                let start_ok = match start_activities {
                    Some(starts) => evs.first().is_some_and(|&e| starts.contains(ov.ev_type(e))),
                    None => true,
                };
                let end_ok = match end_activities {
                    Some(ends) => evs.last().is_some_and(|&e| ends.contains(ov.ev_type(e))),
                    None => true,
                };
                start_ok && end_ok
            });
        }
        Transform::FilterTraceContains { activities, mode } => {
            ov.retain_objects(|ov, o| {
                let contains = ov
                    .e2o_rev(o)
                    .any(|(_, e)| activities.contains(ov.ev_type(e)));
                match mode {
                    RequiredOrForbidden::Required => contains,
                    RequiredOrForbidden::Forbidden => !contains,
                }
            });
        }
        Transform::FilterMinRelatedEvents {
            min_events,
            max_events,
            of_type,
        } => {
            ov.retain_objects(|ov, o| {
                // Dedup by event repr: `e2o_rev` yields one entry PER QUALIFIER, but an object
                // linked to one event via two qualifiers is still just one related event.
                let evs: HashSet<A::EventRepr> = ov
                    .e2o_rev(o)
                    .filter(|(_, e)| {
                        of_type
                            .as_ref()
                            .is_none_or(|t| ov.ev_type(*e) == t.as_str())
                    })
                    .map(|(_, e)| e)
                    .collect();
                let count = evs.len();
                let too_few = min_events.is_some_and(|min| count < min);
                let too_many = max_events.is_some_and(|max| count > max);
                !(too_few || too_many)
            });
        }
        Transform::FilterMinRelatedObjects {
            min_objects,
            max_objects,
            of_type,
        } => {
            ov.retain_events(|ov, e| {
                // No dedup: counts per relationship, matching the old arm (a multi-qualifier
                // edge to the same object counts once per qualifier).
                let count = ov
                    .e2o(e)
                    .filter(|(_, o)| {
                        of_type
                            .as_ref()
                            .is_none_or(|t| ov.ob_type(*o) == t.as_str())
                    })
                    .count();
                let too_few = min_objects.is_some_and(|min| count < min);
                let too_many = max_objects.is_some_and(|max| count > max);
                !(too_few || too_many)
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
            ov.retain_events(|ov, e| {
                let ms = ov.ev_time(e).timestamp_millis();
                let inside = ms >= s_ms && ms < e_ms;
                mode.keeps(inside)
            });
            // Orphan cascade: drop objects with zero surviving related events (matches the old
            // arm's `referenced` set built from post-retain `ocel.events`).
            drop_orphan_objects(ov);
        }
        Transform::FilterAttributes {
            scope,
            condition,
            mode,
        } => {
            match scope {
                AttributeScope::LogGlobal => {}
                AttributeScope::Event { activity } => {
                    ov.retain_events(|ov, e| {
                        if let Some(required) = activity.as_ref() {
                            if ov.ev_type(e) != required.as_str() {
                                return true; // not in scope, keep
                            }
                        }
                        let get_attr = |key: &str| -> Option<String> {
                            ov.ev_attr_val(e, key).map(|v| v.to_string())
                        };
                        let get_attr_f64 = |key: &str| -> Option<f64> {
                            ov.ev_attr_val(e, key).and_then(ocel_attr_f64)
                        };
                        let get_times = || vec![ov.ev_time(e).timestamp_millis()];
                        let get_type = || Some(ov.ev_type(e).to_string());
                        let get_objs = || {
                            ov.e2o(e)
                                .filter(|(_, ro)| ov.ob_kept(*ro))
                                .map(|(_, ro)| object_facts_slim(ov, ro))
                                .collect::<Vec<_>>()
                        };
                        let matches = evaluate_condition(
                            condition,
                            &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                                .with_type(&get_type)
                                .with_objects(&get_objs),
                        );
                        mode.keeps(matches)
                    });
                    // Event-scope cascade: same orphan-drop as `FilterTimeRange` above.
                    drop_orphan_objects(ov);
                }
                AttributeScope::Object { object_type } => {
                    // No event cascade here: the old arm only strips dangling relationships from
                    // events, it never removes an event (unlike the `Event`-scope arm above).
                    ov.retain_objects(|ov, o| {
                        if let Some(required) = object_type.as_ref() {
                            if ov.ob_type(o) != required.as_str() {
                                return true; // not in scope, keep
                            }
                        }
                        // LAST value in the time-series, matching the old arm's `rfind`.
                        let get_attr = |key: &str| -> Option<String> {
                            ov.ob_attr_vals(o, key).last().map(|(_, v)| v.to_string())
                        };
                        let get_attr_f64 = |key: &str| -> Option<f64> {
                            ov.ob_attr_vals(o, key)
                                .last()
                                .and_then(|(_, v)| ocel_attr_f64(v))
                        };
                        let get_times = || {
                            ov.related_events_sorted(o)
                                .into_iter()
                                .map(|e| ov.ev_time(e).timestamp_millis())
                                .collect::<Vec<_>>()
                        };
                        let get_type = || Some(ov.ob_type(o).to_string());
                        let get_events = || {
                            ov.related_events_sorted(o)
                                .into_iter()
                                .map(|ev| event_facts_slim(ov, ev))
                                .collect::<Vec<_>>()
                        };
                        let get_objs = || {
                            ov.source()
                                .get_o2o(o)
                                .filter(|(_, ro)| ov.ob_kept(**ro))
                                .map(|(_, ro)| object_facts_slim(ov, *ro))
                                .collect::<Vec<_>>()
                        };
                        let matches = evaluate_condition(
                            condition,
                            &EvalCtx::new(&get_attr, &get_attr_f64, &get_times)
                                .with_type(&get_type)
                                .with_events(&get_events)
                                .with_objects(&get_objs),
                        );
                        mode.keeps(matches)
                    });
                }
            }
        }
        Transform::Sample {
            amount,
            seed,
            target,
        } => {
            // Reproduce the old sampler bit-for-bit: same RNG type/seed and shuffle over a dense
            // `0..n` index vec, enumerated over currently-kept items in source order.
            use rand::seq::SliceRandom;
            use rand::SeedableRng;
            let mut rng = rand::rngs::SmallRng::seed_from_u64(seed.unwrap_or(42) as u64);
            match target {
                SampleTarget::TracesOrObjects => {
                    let kept: Vec<A::ObjectRepr> = ov
                        .source()
                        .get_all_obs()
                        .filter(|o| ov.ob_kept(*o))
                        .collect();
                    let count = amount.resolve(kept.len());
                    if kept.len() > count {
                        let mut indices: Vec<usize> = (0..kept.len()).collect();
                        indices.shuffle(&mut rng);
                        indices.truncate(count);
                        let selected: HashSet<A::ObjectRepr> =
                            indices.into_iter().map(|i| kept[i]).collect();
                        ov.retain_objects(|_, o| selected.contains(&o));
                    }
                }
                SampleTarget::Events => {
                    let kept: Vec<A::EventRepr> = ov
                        .source()
                        .get_all_evs()
                        .filter(|e| ov.ev_kept(*e))
                        .collect();
                    let count = amount.resolve(kept.len());
                    if kept.len() > count {
                        let mut indices: Vec<usize> = (0..kept.len()).collect();
                        indices.shuffle(&mut rng);
                        indices.truncate(count);
                        let selected: HashSet<A::EventRepr> =
                            indices.into_iter().map(|i| kept[i]).collect();
                        ov.retain_events(|_, e| selected.contains(&e));
                    }
                }
            }
        }
        Transform::RelabelActivities { rules } => {
            // PERF: evaluate the rule per kept event, then apply via the batch path, one
            // `recompute_eff_types()` for the whole transform rather than one per event.
            let kept: Vec<A::EventRepr> = ov
                .source()
                .get_all_evs()
                .filter(|e| ov.ev_kept(*e))
                .collect();
            let mut entries: Vec<(A::EventRepr, String)> = Vec::new();
            for e in kept {
                let original = ov.ev_type(e).to_string();
                let get_attr =
                    |key: &str| -> Option<String> { ov.ev_attr_val(e, key).map(|v| v.to_string()) };
                let get_attr_f64 =
                    |key: &str| -> Option<f64> { ov.ev_attr_val(e, key).and_then(ocel_attr_f64) };
                let get_times = || vec![ov.ev_time(e).timestamp_millis()];
                let get_type = || Some(ov.ev_type(e).to_string());
                let new_label = apply_relabel_rules(
                    &original,
                    rules,
                    &EvalCtx::new(&get_attr, &get_attr_f64, &get_times).with_type(&get_type),
                );
                if new_label != original {
                    entries.push((e, new_label));
                }
            }
            ov.relabel_events_batch(entries);
        }
        Transform::RelabelObjectTypes { rules } => {
            // Old arm evaluates rules against a stub attribute lookup that always returns `None`,
            // so a rule with a real attribute condition never matches; preserved verbatim for parity.
            let no_attr = |_: &str| -> Option<String> { None };
            let no_attr_f64 = |_: &str| -> Option<f64> { None };
            let kept: Vec<A::ObjectRepr> = ov
                .source()
                .get_all_obs()
                .filter(|o| ov.ob_kept(*o))
                .collect();
            let mut entries: Vec<(A::ObjectRepr, String)> = Vec::new();
            for o in kept {
                let original = ov.ob_type(o).to_string();
                let no_times = || Vec::<i64>::new();
                let new_label = apply_relabel_rules(
                    &original,
                    rules,
                    &EvalCtx::new(&no_attr, &no_attr_f64, &no_times),
                );
                if new_label != original {
                    entries.push((o, new_label));
                }
            }
            ov.relabel_objects_batch(entries);
        }
        Transform::RemoveAttributes { scope, keys } => {
            if keys.is_empty() {
                return;
            }
            match scope {
                AttributeScope::LogGlobal => {}
                AttributeScope::Event { activity } => {
                    ov.strip_ev_attr(activity.clone(), keys.iter().cloned());
                }
                AttributeScope::Object { object_type } => {
                    ov.strip_ob_attr(object_type.clone(), keys.iter().cloned());
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

            let kept_evs: Vec<A::EventRepr> = ov
                .source()
                .get_all_evs()
                .filter(|e| ov.ev_kept(*e))
                .collect();
            let timestamps: Vec<i64> = kept_evs
                .iter()
                .map(|&e| ov.ev_time(e).timestamp_millis())
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

            let rescale = |ts: DateTime<FixedOffset>| -> DateTime<FixedOffset> {
                let orig_ms = ts.timestamp_millis();
                let ratio = if orig_range.abs() < 1.0 {
                    0.5
                } else {
                    (orig_ms - orig_min) as f64 / orig_range
                };
                let new_ms = target_min + (ratio * target_range) as i64;
                DateTime::from_timestamp_millis(new_ms)
                    .map(|d| d.fixed_offset())
                    .unwrap_or(ts)
            };

            // (1) linear map: every kept event's effective time onto [target_start, target_end).
            for &e in &kept_evs {
                let new_t = rescale(ov.ev_time(e));
                ov.override_ev_time(e, new_t);
            }

            // (3, before the gap-clamp to match the old arm's order) object attribute times,
            // skipping the epoch sentinel used for a never-set attribute.
            let kept_obs: Vec<A::ObjectRepr> = ov
                .source()
                .get_all_obs()
                .filter(|o| ov.ob_kept(*o))
                .collect();
            for &o in &kept_obs {
                let names: Vec<String> = ov.ob_attrs(o).map(|n| n.to_string()).collect();
                for name in names {
                    let offset = ov.ob_attr_global_offset(o, &name);
                    let entries: Vec<(usize, DateTime<FixedOffset>)> = ov
                        .ob_attr_vals(o, &name)
                        .enumerate()
                        .map(|(i, (t, _v))| (offset + i, t))
                        .collect();
                    for (idx, t) in entries {
                        if t != epoch {
                            ov.override_ob_attr_time(o, idx, rescale(t));
                        }
                    }
                }
            }

            // (2) gap-clamp: sort each object's related events by rescaled time and clamp
            // consecutive gaps; the write is evolving, so `prev_ms` re-reads the just-written override.
            if min_gap_ms.is_some() || max_gap_ms.is_some() {
                let obj_ev_groups: Vec<Vec<A::EventRepr>> = kept_obs
                    .iter()
                    .copied()
                    .filter(|&o| match gap_object_type {
                        Some(ot) => ov.ob_type(o) == ot.as_str(),
                        None => true,
                    })
                    // Dedup to distinct events: a multi-qualifier edge must not be clamped twice
                    // (same rationale as `FilterStartEnd`'s dedup above).
                    .map(|o| ov.related_events_sorted(o))
                    .filter(|evs| evs.len() >= 2)
                    .collect();
                for evs in obj_ev_groups {
                    let mut prev_ms = ov.ev_time(evs[0]).timestamp_millis();
                    for &e in &evs[1..] {
                        let curr_ms = ov.ev_time(e).timestamp_millis();
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
                                ov.override_ev_time(e, new_dt);
                            }
                        }
                        prev_ms = ov.ev_time(e).timestamp_millis();
                    }
                }
            }
        }
        Transform::FilterVariants { .. } => {
            // Not applicable to OCEL, matches the old arm: variants only make sense for
            // trace-oriented (XES) logs.
        }
    }
}

/// Apply a pipeline of transforms to an event log, returning the transformed log.
#[register_binding]
pub fn apply_event_log_transforms(event_log: &EventLog, transforms: Vec<Transform>) -> EventLog {
    let mut out = event_log.clone();
    apply_transforms_to_event_log(&mut out, &transforms);
    out
}

/// Apply a pipeline of transforms to an OCEL, canonical `SlimLinkedOCEL` in and out. Each
/// transform folds into one `Overlay`, materialized by a single `build_slim` at the end.
#[register_binding]
pub fn apply_ocel_transforms(ocel: &SlimLinkedOCEL, transforms: Vec<Transform>) -> SlimLinkedOCEL {
    let mut ov = crate::slim_project::Overlay::identity(ocel);
    for t in &transforms {
        fold_transform(&mut ov, t);
    }
    crate::slim_project::build_slim(&ov)
}

// `apply_ocel_oracle` reproduces the retired round-trip verbatim so this suite can assert parity
// with the slim-native path, normalizing known deviations (no dangling edges, `RemoveAttributes` dropping vs. leaving `Null`).
#[cfg(test)]
mod parity_tests {
    use super::*;
    use process_mining::core::chrono::{DateTime, FixedOffset};
    use process_mining::core::event_data::object_centric::{
        OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject, OCELObjectAttribute,
        OCELRelationship, OCELType, OCELTypeAttribute,
    };
    use process_mining::ReadableOCEL;

    /// The retired round-trip, retained verbatim as the parity baseline production
    /// `apply_ocel_transforms` is checked against below.
    fn apply_ocel_oracle(src: &SlimLinkedOCEL, ts: &[Transform]) -> SlimLinkedOCEL {
        let mut o = src.construct_ocel();
        for t in ts {
            apply_single_transform_ocel(&mut o, t);
        }
        SlimLinkedOCEL::from_ocel(o)
    }

    fn dt(s: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(s).unwrap()
    }

    fn tattr(name: &str, ty: &str) -> OCELTypeAttribute {
        OCELTypeAttribute {
            name: name.to_string(),
            value_type: ty.to_string(),
        }
    }

    fn val_str(v: &OCELAttributeValue) -> String {
        use OCELAttributeValue::*;
        match v {
            Integer(i) => format!("int:{i}"),
            Float(f) => format!("float:{f}"),
            Boolean(b) => format!("bool:{b}"),
            Time(t) => format!("time:{}", t.to_rfc3339()),
            String(s) => format!("str:{s}"),
            Null => "null".to_string(),
        }
    }

    /// Structural fingerprint of a `SlimLinkedOCEL`; comparing two of these is an exact
    /// structural equivalence check (typed values, so `int 1` != `float 1.0` != `str "1"`).
    #[derive(Debug, Clone, PartialEq, Eq)]
    struct Canonical {
        events: Vec<(String, String, String, Vec<(String, String)>)>,
        objects: Vec<(String, String, Vec<(String, Vec<(String, String)>)>)>,
        e2o: Vec<(String, String, String)>,
        o2o: Vec<(String, String, String)>,
        ev_type_schemas: Vec<(String, Vec<(String, String)>)>,
        ob_type_schemas: Vec<(String, Vec<(String, String)>)>,
    }

    fn canon(o: &SlimLinkedOCEL) -> Canonical {
        let mut events = Vec::new();
        for e in o.get_all_evs() {
            let id = o.get_ev_id(e).to_string();
            let ty = o.get_ev_type_of(e).to_string();
            let time = o.get_ev_time(e).to_rfc3339();
            let mut attrs: Vec<(String, String)> = o
                .get_ev_attrs(e)
                .map(|n| {
                    (
                        n.to_string(),
                        o.get_ev_attr_val(e, n)
                            .map(val_str)
                            .unwrap_or_else(|| "null".to_string()),
                    )
                })
                .collect();
            attrs.sort();
            events.push((id, ty, time, attrs));
        }
        events.sort();

        let mut objects = Vec::new();
        for ob in o.get_all_obs() {
            let id = o.get_ob_id(ob).to_string();
            let ty = o.get_ob_type_of(ob).to_string();
            let mut attrs: Vec<(String, Vec<(String, String)>)> = o
                .get_ob_attrs(ob)
                .map(|n| {
                    let series: Vec<(String, String)> = o
                        .get_ob_attr_vals(ob, n)
                        .map(|(t, v)| (t.to_rfc3339(), val_str(v)))
                        .collect();
                    (n.to_string(), series)
                })
                .collect();
            attrs.sort();
            objects.push((id, ty, attrs));
        }
        objects.sort();

        let mut e2o = Vec::new();
        for e in o.get_all_evs() {
            let eid = o.get_ev_id(e).to_string();
            for (q, ob) in o.get_e2o(e) {
                e2o.push((eid.clone(), q.to_string(), o.get_ob_id(ob).to_string()));
            }
        }
        e2o.sort();

        let mut o2o = Vec::new();
        for ob in o.get_all_obs() {
            let fid = o.get_ob_id(ob).to_string();
            for (q, to) in o.get_o2o(ob) {
                o2o.push((fid.clone(), q.to_string(), o.get_ob_id(to).to_string()));
            }
        }
        o2o.sort();

        let mut ev_type_schemas: Vec<(String, Vec<(String, String)>)> = o
            .event_types()
            .iter()
            .map(|t| {
                (
                    t.name.clone(),
                    t.attributes
                        .iter()
                        .map(|a| (a.name.clone(), a.value_type.clone()))
                        .collect(),
                )
            })
            .collect();
        ev_type_schemas.sort();
        let mut ob_type_schemas: Vec<(String, Vec<(String, String)>)> = o
            .object_types()
            .iter()
            .map(|t| {
                (
                    t.name.clone(),
                    t.attributes
                        .iter()
                        .map(|a| (a.name.clone(), a.value_type.clone()))
                        .collect(),
                )
            })
            .collect();
        ob_type_schemas.sort();

        Canonical {
            events,
            objects,
            e2o,
            o2o,
            ev_type_schemas,
            ob_type_schemas,
        }
    }

    /// An O2O edge is dangling if its target object id is absent from `objects`. `from_ocel`
    /// already drops these on construction, so this is a defensive no-op proven against a hand-built `Canonical`.
    fn drop_dangling_o2o(c: &mut Canonical) {
        let ids: HashSet<&str> = c.objects.iter().map(|o| o.0.as_str()).collect();
        c.o2o.retain(|(_, _, to)| ids.contains(to.as_str()));
    }

    /// Same as above but for E2O edges.
    fn drop_dangling_e2o(c: &mut Canonical) {
        let ids: HashSet<&str> = c.objects.iter().map(|o| o.0.as_str()).collect();
        c.e2o.retain(|(_, _, ob)| ids.contains(ob.as_str()));
    }

    /// `RemoveAttributes`: the slim-native path fully drops a removed attribute, while the old
    /// round-trip leaves it declared with `Null` values; normalize both to treat a no-non-Null entry/schema as absent.
    fn normalize_removed_attrs(c: &mut Canonical) {
        for (_, _, _, attrs) in c.events.iter_mut() {
            attrs.retain(|(_, v)| v != "null");
        }
        for (_, _, attrs) in c.objects.iter_mut() {
            for (_, series) in attrs.iter_mut() {
                series.retain(|(_, v)| v != "null");
            }
            attrs.retain(|(_, series)| !series.is_empty());
        }

        let ev_attr_present: HashMap<String, HashSet<String>> = {
            let mut m: HashMap<String, HashSet<String>> = HashMap::new();
            for (_, ty, _, attrs) in &c.events {
                let set = m.entry(ty.clone()).or_default();
                for (name, _) in attrs {
                    set.insert(name.clone());
                }
            }
            m
        };
        for (ty, attrs) in c.ev_type_schemas.iter_mut() {
            let present = ev_attr_present.get(ty);
            attrs.retain(|(name, _)| present.is_some_and(|p| p.contains(name)));
        }

        let ob_attr_present: HashMap<String, HashSet<String>> = {
            let mut m: HashMap<String, HashSet<String>> = HashMap::new();
            for (_, ty, attrs) in &c.objects {
                let set = m.entry(ty.clone()).or_default();
                for (name, _) in attrs {
                    set.insert(name.clone());
                }
            }
            m
        };
        for (ty, attrs) in c.ob_type_schemas.iter_mut() {
            let present = ob_attr_present.get(ty);
            attrs.retain(|(name, _)| present.is_some_and(|p| p.contains(name)));
        }
    }

    /// `build_slim` only declares types with >=1 surviving member, but old-path filter arms
    /// leave an emptied type's schema declared; drop, on both sides, any schema entry with zero surviving members.
    fn drop_emptied_type_schemas(c: &mut Canonical) {
        let ev_types_present: HashSet<&str> =
            c.events.iter().map(|(_, ty, _, _)| ty.as_str()).collect();
        c.ev_type_schemas
            .retain(|(name, _)| ev_types_present.contains(name.as_str()));

        let ob_types_present: HashSet<&str> =
            c.objects.iter().map(|(_, ty, _)| ty.as_str()).collect();
        c.ob_type_schemas
            .retain(|(name, _)| ob_types_present.contains(name.as_str()));
    }

    /// Canonical-set parity: `new` must equal `old` after normalizing both sides for the known
    /// deviations (dangling edges dropped from `old` only; Null-retained/emptied-type reconciled on both).
    fn assert_parity(new: &SlimLinkedOCEL, old: &SlimLinkedOCEL) {
        let mut new_c = canon(new);
        let mut old_c = canon(old);
        drop_dangling_o2o(&mut old_c);
        drop_dangling_e2o(&mut old_c);
        normalize_removed_attrs(&mut new_c);
        normalize_removed_attrs(&mut old_c);
        drop_emptied_type_schemas(&mut new_c);
        drop_emptied_type_schemas(&mut old_c);
        assert_eq!(
            new_c, old_c,
            "OCEL transform parity mismatch: slim-native output != normalized old round-trip output"
        );
    }

    /// A small but non-trivial OCEL: one event type with an attribute, one object type with an
    /// attribute, an E2O relationship, and two events.
    fn fixture() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";

        let event_types = vec![OCELType {
            name: "order".to_string(),
            attributes: vec![tattr("priority", "integer")],
        }];
        let object_types = vec![OCELType {
            name: "item".to_string(),
            attributes: vec![tattr("price", "float")],
        }];
        let objects = vec![OCELObject {
            id: "i1".to_string(),
            object_type: "item".to_string(),
            attributes: vec![OCELObjectAttribute::new("price", 9.99_f64, dt(t0))],
            relationships: vec![],
        }];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![OCELRelationship::new("i1", "target")],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "order".to_string(),
                time: dt(t1),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(1),
                }],
                relationships: vec![OCELRelationship::new("i1", "target")],
            },
        ];

        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn self_parity_holds_on_identical_fixture() {
        assert_parity(&fixture(), &fixture());
    }

    #[test]
    #[should_panic(expected = "parity mismatch")]
    fn assert_parity_rejects_a_dropped_event() {
        let new = fixture();
        let mut old_ocel = fixture().construct_ocel();
        old_ocel.events.retain(|e| e.id != "e2");
        let old = SlimLinkedOCEL::from_ocel(old_ocel);
        assert_parity(&new, &old);
    }

    #[test]
    #[should_panic(expected = "parity mismatch")]
    fn assert_parity_rejects_a_changed_attribute_value() {
        let new = fixture();
        let mut old_ocel = fixture().construct_ocel();
        for e in old_ocel.events.iter_mut() {
            for a in e.attributes.iter_mut() {
                if a.name == "priority" {
                    a.value = OCELAttributeValue::Integer(999);
                }
            }
        }
        let old = SlimLinkedOCEL::from_ocel(old_ocel);
        assert_parity(&new, &old);
    }

    #[test]
    fn oracle_applies_the_given_transforms() {
        let src = fixture();
        let ts = vec![Transform::FilterActivities {
            activities: HashSet::from(["order".to_string()]),
            mode: KeepOrRemove::Remove,
        }];
        let out = apply_ocel_oracle(&src, &ts);
        assert_eq!(
            out.get_all_evs().count(),
            0,
            "the only event type present was removed"
        );
    }

    #[test]
    fn drop_dangling_o2o_normalizer_drops_only_dangling_edges() {
        let mut c = Canonical {
            events: vec![],
            objects: vec![
                ("a".to_string(), "t".to_string(), vec![]),
                ("b".to_string(), "t".to_string(), vec![]),
            ],
            e2o: vec![],
            o2o: vec![
                ("a".to_string(), "q".to_string(), "b".to_string()),
                ("a".to_string(), "q".to_string(), "ghost".to_string()),
            ],
            ev_type_schemas: vec![],
            ob_type_schemas: vec![],
        };
        drop_dangling_o2o(&mut c);
        assert_eq!(
            c.o2o,
            vec![("a".to_string(), "q".to_string(), "b".to_string())],
            "the edge to a present object survives; the edge to the absent 'ghost' is dropped"
        );
    }

    #[test]
    fn drop_dangling_e2o_normalizer_drops_only_dangling_edges() {
        let mut c = Canonical {
            events: vec![(
                "e1".to_string(),
                "t".to_string(),
                "2020-01-01T00:00:00+00:00".to_string(),
                vec![],
            )],
            objects: vec![("a".to_string(), "t".to_string(), vec![])],
            e2o: vec![
                ("e1".to_string(), "q".to_string(), "a".to_string()),
                ("e1".to_string(), "q".to_string(), "ghost".to_string()),
            ],
            o2o: vec![],
            ev_type_schemas: vec![],
            ob_type_schemas: vec![],
        };
        drop_dangling_e2o(&mut c);
        assert_eq!(
            c.e2o,
            vec![("e1".to_string(), "q".to_string(), "a".to_string())],
            "the edge to a present object survives; the edge to the absent 'ghost' is dropped"
        );
    }

    /// An event type with a `flag` attribute declared, and an event that never supplies a value
    /// for it: the shape `from_ocel` produces for a `RemoveAttributes` target whose values were stripped but schema declaration left untouched.
    fn old_shaped_with_null_retained_attr() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types: vec![OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer"), tattr("flag", "string")],
            }],
            object_types: vec![],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![],
            }],
            objects: vec![],
        })
    }

    /// Same log but `flag` was never declared at all: the slim-native shape once
    /// `RemoveAttributes` fully drops the column.
    fn new_shaped_without_removed_attr() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types: vec![OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer")],
            }],
            object_types: vec![],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![],
            }],
            objects: vec![],
        })
    }

    #[test]
    fn normalize_removed_attrs_reconciles_null_retained_vs_dropped_column() {
        let old = old_shaped_with_null_retained_attr();
        let new = new_shaped_without_removed_attr();
        assert_parity(&new, &old);

        // A genuine difference (not just the documented Null-retained deviation) must still fail.
        let mut broken_ocel = new.construct_ocel();
        for e in broken_ocel.events.iter_mut() {
            for a in e.attributes.iter_mut() {
                if a.name == "priority" {
                    a.value = OCELAttributeValue::Integer(999);
                }
            }
        }
        let broken_new = SlimLinkedOCEL::from_ocel(broken_ocel);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            assert_parity(&broken_new, &old);
        }));
        assert!(
            result.is_err(),
            "a genuine attribute-value difference must not be masked by the Null normalizer"
        );
    }

    #[test]
    fn drop_emptied_type_schemas_normalizer_drops_only_types_with_zero_members() {
        let mut c = Canonical {
            events: vec![(
                "e1".to_string(),
                "order".to_string(),
                "2020-01-01T00:00:00+00:00".to_string(),
                vec![],
            )],
            objects: vec![("i1".to_string(), "item".to_string(), vec![])],
            e2o: vec![],
            o2o: vec![],
            ev_type_schemas: vec![
                ("order".to_string(), vec![]),
                ("emptied_ev_type".to_string(), vec![]),
            ],
            ob_type_schemas: vec![
                ("item".to_string(), vec![]),
                ("emptied_ob_type".to_string(), vec![]),
            ],
        };
        drop_emptied_type_schemas(&mut c);
        assert_eq!(
            c.ev_type_schemas,
            vec![("order".to_string(), vec![])],
            "the type with a surviving event survives; the type with zero members is dropped"
        );
        assert_eq!(
            c.ob_type_schemas,
            vec![("item".to_string(), vec![])],
            "the type with a surviving object survives; the type with zero members is dropped"
        );
    }

    /// The old round-trip shape when a filter/sample transform empties a type's membership
    /// without re-pruning the type lists: `retired`/`discontinued` stay declared with zero members alongside a surviving `order`/`item` pair.
    fn old_shaped_with_emptied_types() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types: vec![
                OCELType {
                    name: "order".to_string(),
                    attributes: vec![tattr("priority", "integer")],
                },
                OCELType {
                    name: "retired".to_string(),
                    attributes: vec![tattr("legacy_flag", "boolean")],
                },
            ],
            object_types: vec![
                OCELType {
                    name: "item".to_string(),
                    attributes: vec![tattr("price", "float")],
                },
                OCELType {
                    name: "discontinued".to_string(),
                    attributes: vec![tattr("reason", "string")],
                },
            ],
            objects: vec![OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![OCELObjectAttribute::new("price", 9.99_f64, dt(t0))],
                relationships: vec![],
            }],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![],
            }],
        })
    }

    /// Same log but `retired`/`discontinued` were never declared: the slim-native shape once
    /// `build_slim`'s "only types with a surviving member" rule applies.
    fn new_shaped_without_emptied_types() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types: vec![OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer")],
            }],
            object_types: vec![OCELType {
                name: "item".to_string(),
                attributes: vec![tattr("price", "float")],
            }],
            objects: vec![OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![OCELObjectAttribute::new("price", 9.99_f64, dt(t0))],
                relationships: vec![],
            }],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![],
            }],
        })
    }

    #[test]
    fn normalize_emptied_types_reconciles_declared_but_emptied_type_vs_undeclared() {
        let old = old_shaped_with_emptied_types();
        let new = new_shaped_without_emptied_types();
        assert_parity(&new, &old);

        // A genuine schema difference on a surviving type must still fail: `priority` has a real
        // value in both logs, so the Null-retention normalizer doesn't touch it, but its declared type differs.
        let mut broken_ocel = new.construct_ocel();
        for t in broken_ocel.event_types.iter_mut() {
            if t.name == "order" {
                for a in t.attributes.iter_mut() {
                    if a.name == "priority" {
                        a.value_type = "string".to_string();
                    }
                }
            }
        }
        let broken_new = SlimLinkedOCEL::from_ocel(broken_ocel);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            assert_parity(&broken_new, &old);
        }));
        assert!(
            result.is_err(),
            "a genuine attribute-schema difference on a non-empty type must not be masked by the emptied-type normalizer"
        );
    }

    /// Two event types and two object types, so both type filters actually remove a member. Also
    /// carries an E2O edge into, and an O2O edge from, the object a `FilterObjectTypes` removal drops.
    fn fixture_multi_type() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";

        let event_types = vec![
            OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer")],
            },
            OCELType {
                name: "ship".to_string(),
                attributes: vec![tattr("carrier", "string")],
            },
        ];
        let object_types = vec![
            OCELType {
                name: "item".to_string(),
                attributes: vec![tattr("price", "float")],
            },
            OCELType {
                name: "customer".to_string(),
                attributes: vec![tattr("name", "string")],
            },
        ];
        let objects = vec![
            OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![OCELObjectAttribute::new("price", 9.99_f64, dt(t0))],
                relationships: vec![OCELRelationship::new("c1", "owned_by")],
            },
            OCELObject {
                id: "c1".to_string(),
                object_type: "customer".to_string(),
                attributes: vec![OCELObjectAttribute::new("name", "Alice", dt(t0))],
                relationships: vec![],
            },
        ];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![OCELRelationship::new("i1", "target")],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "ship".to_string(),
                time: dt(t1),
                attributes: vec![OCELEventAttribute {
                    name: "carrier".to_string(),
                    value: OCELAttributeValue::String("DHL".to_string()),
                }],
                relationships: vec![
                    OCELRelationship::new("i1", "target"),
                    OCELRelationship::new("c1", "buyer"),
                ],
            },
        ];

        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn fold_filter_activities_keep_matches_oracle() {
        let f = fixture_multi_type();
        let t = Transform::FilterActivities {
            activities: HashSet::from(["order".to_string()]),
            mode: KeepOrRemove::Keep,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "only the kept 'order' event e1 survives"
        );
    }

    #[test]
    fn fold_filter_activities_remove_matches_oracle() {
        let f = fixture_multi_type();
        let t = Transform::FilterActivities {
            activities: HashSet::from(["order".to_string()]),
            mode: KeepOrRemove::Remove,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "only the non-removed 'ship' event e2 survives"
        );
    }

    #[test]
    fn fold_filter_object_types_keep_matches_oracle() {
        let f = fixture_multi_type();
        let t = Transform::FilterObjectTypes {
            object_types: HashSet::from(["item".to_string()]),
            mode: KeepOrRemove::Keep,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            1,
            "only the kept 'item' object i1 survives"
        );
    }

    #[test]
    fn fold_filter_object_types_remove_matches_oracle() {
        let f = fixture_multi_type();
        let t = Transform::FilterObjectTypes {
            object_types: HashSet::from(["item".to_string()]),
            mode: KeepOrRemove::Remove,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            1,
            "only the non-removed 'customer' object c1 survives"
        );
    }

    /// Two event types, two object types; `e1` reaches `i1` through two qualifiers, the
    /// multi-qualifier E2O edge the dedup-asymmetry tests below key off. `c2` has zero related events.
    fn fixture_relations() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";
        let t2 = "2020-01-03T00:00:00+00:00";

        let event_types = vec![
            OCELType {
                name: "order".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "ship".to_string(),
                attributes: vec![],
            },
        ];
        let object_types = vec![
            OCELType {
                name: "item".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "customer".to_string(),
                attributes: vec![],
            },
        ];
        let objects = vec![
            OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![],
                relationships: vec![],
            },
            OCELObject {
                id: "i2".to_string(),
                object_type: "item".to_string(),
                attributes: vec![],
                relationships: vec![],
            },
            OCELObject {
                id: "c1".to_string(),
                object_type: "customer".to_string(),
                attributes: vec![],
                relationships: vec![],
            },
            OCELObject {
                id: "c2".to_string(),
                object_type: "customer".to_string(),
                attributes: vec![],
                relationships: vec![],
            },
        ];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t1),
                attributes: vec![],
                relationships: vec![
                    OCELRelationship::new("i1", "primary"),
                    OCELRelationship::new("i1", "secondary"),
                    OCELRelationship::new("c1", "buyer"),
                ],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "ship".to_string(),
                time: dt(t2),
                attributes: vec![],
                relationships: vec![
                    OCELRelationship::new("i1", "handled"),
                    OCELRelationship::new("i2", "handled"),
                ],
            },
            OCELEvent {
                id: "e3".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("i2", "primary")],
            },
        ];

        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn fold_filter_start_end_matches_oracle() {
        let f = fixture_relations();
        let t = Transform::FilterStartEnd {
            start_activities: Some(HashSet::from(["order".to_string()])),
            end_activities: Some(HashSet::from(["ship".to_string()])),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        // i1/i2's first event is "order" and last is "ship"; c1's only event is "order" (fails
        // the end check); c2 has no events at all (fails both, since both bounds are `Some`).
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "only i1 and i2 satisfy both the start and end constraints"
        );
        assert!(new.get_ob_by_id("i1").is_some());
        assert!(new.get_ob_by_id("i2").is_some());
    }

    #[test]
    fn fold_filter_start_end_none_sets_keep_all_including_eventless_object() {
        let f = fixture_relations();
        let t = Transform::FilterStartEnd {
            start_activities: None,
            end_activities: None,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            4,
            "both bounds None: every object (including the eventless c2) is kept"
        );
    }

    #[test]
    fn fold_filter_trace_contains_required_matches_oracle() {
        let f = fixture_relations();
        let t = Transform::FilterTraceContains {
            activities: HashSet::from(["ship".to_string()]),
            mode: RequiredOrForbidden::Required,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "only i1 and i2 have a related 'ship' event"
        );
    }

    #[test]
    fn fold_filter_trace_contains_forbidden_matches_oracle() {
        let f = fixture_relations();
        let t = Transform::FilterTraceContains {
            activities: HashSet::from(["ship".to_string()]),
            mode: RequiredOrForbidden::Forbidden,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "c1 and c2 have no related 'ship' event"
        );
    }

    #[test]
    fn fold_filter_min_related_events_dedups_multi_qualifier_edge() {
        let f = fixture_relations();
        // max_events=2: i1's true distinct related-event count is 2 (e1 via 2 qualifiers, plus
        // e2), not 3; counting raw e2o_rev entries instead of distinct events would wrongly drop it.
        let t = Transform::FilterMinRelatedEvents {
            min_events: None,
            max_events: Some(2),
            of_type: None,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert!(
            new.get_ob_by_id("i1").is_some(),
            "i1 must survive: 2 distinct related events, not 3 raw relationship rows"
        );
        assert_eq!(
            new.get_all_obs().count(),
            4,
            "no object exceeds the distinct-event bound of 2"
        );
    }

    #[test]
    fn fold_filter_min_related_events_of_type_matches_oracle() {
        let f = fixture_relations();
        let t = Transform::FilterMinRelatedEvents {
            min_events: Some(1),
            max_events: None,
            of_type: Some("order".to_string()),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            3,
            "i1 (via e1), i2 (via e3), c1 (via e1) each have >=1 related 'order' event; c2 has none"
        );
    }

    #[test]
    fn fold_filter_min_related_objects_no_dedup_on_multi_qualifier_edge() {
        let f = fixture_relations();
        // min_objects=3, no dedup: e1's per-relationship count is 3 (primary+secondary to i1,
        // buyer to c1); deduping by distinct object would compute 2 and wrongly drop it.
        let t = Transform::FilterMinRelatedObjects {
            min_objects: Some(3),
            max_objects: None,
            of_type: None,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert!(
            new.get_ev_by_id("e1").is_some(),
            "e1 must survive: 3 relationships (per-relationship, un-deduped), not 2 distinct objects"
        );
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "only e1 has >= 3 relationships"
        );
    }

    #[test]
    fn fold_filter_min_related_objects_of_type_matches_oracle() {
        let f = fixture_relations();
        let t = Transform::FilterMinRelatedObjects {
            min_objects: None,
            max_objects: Some(1),
            of_type: Some("item".to_string()),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "only e3 has <=1 relationship to an 'item'-typed object (e1 has 2, e2 has 2)"
        );
        assert!(new.get_ev_by_id("e3").is_some());
    }

    #[test]
    fn fold_filter_time_range_keep_matches_oracle_with_orphan_cascade() {
        let f = fixture_relations();
        // [t1, t2): only e1 (at t1) qualifies; e2 (t2) is excluded by the exclusive end, e3 (t0)
        // is before the range.
        let t = Transform::FilterTimeRange {
            start: "2020-01-02T00:00:00+00:00".to_string(),
            end: "2020-01-03T00:00:00+00:00".to_string(),
            mode: KeepOrRemove::Keep,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(new.get_all_evs().count(), 1, "only e1 falls in [t1, t2)");
        // i2 relates only to e2/e3 (both dropped) so it is orphaned; c2 has no events at all and
        // was already orphaned. i1 (via e1) and c1 (via e1) survive.
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "i2 and c2 are dropped as orphans; i1 and c1 survive via e1"
        );
        assert!(new.get_ob_by_id("i1").is_some());
        assert!(new.get_ob_by_id("c1").is_some());
    }

    #[test]
    fn fold_filter_time_range_remove_matches_oracle_with_orphan_cascade() {
        let f = fixture_relations();
        let t = Transform::FilterTimeRange {
            start: "2020-01-02T00:00:00+00:00".to_string(),
            end: "2020-01-03T00:00:00+00:00".to_string(),
            mode: KeepOrRemove::Remove,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            2,
            "e2 and e3 fall outside [t1, t2)"
        );
        // c1 relates only to e1 (dropped) so it is orphaned; i1/i2 survive via e2/e3.
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "c1 is dropped as an orphan; i1 and i2 survive via e2/e3"
        );
        assert!(new.get_ob_by_id("i1").is_some());
        assert!(new.get_ob_by_id("i2").is_some());
    }

    /// Two event types and two object types; each event relates to exactly one dedicated object,
    /// so an event-scope cascade drop is unambiguous. `i1`'s price series has first != last, so a condition scoped to the last value differs from one scoped to the first.
    fn fixture_filter_attrs() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";
        let t2 = "2020-01-03T00:00:00+00:00";

        let event_types = vec![
            OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer")],
            },
            OCELType {
                name: "ship".to_string(),
                attributes: vec![tattr("carrier", "string")],
            },
        ];
        let object_types = vec![
            OCELType {
                name: "item".to_string(),
                attributes: vec![tattr("price", "float")],
            },
            OCELType {
                name: "customer".to_string(),
                attributes: vec![tattr("name", "string")],
            },
        ];
        let objects = vec![
            OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![
                    OCELObjectAttribute::new("price", 10.0_f64, dt(t0)),
                    OCELObjectAttribute::new("price", 20.0_f64, dt(t1)),
                ],
                relationships: vec![],
            },
            OCELObject {
                id: "i2".to_string(),
                object_type: "item".to_string(),
                attributes: vec![OCELObjectAttribute::new("price", 5.0_f64, dt(t0))],
                relationships: vec![],
            },
            OCELObject {
                id: "c1".to_string(),
                object_type: "customer".to_string(),
                attributes: vec![OCELObjectAttribute::new("name", "Alice", dt(t0))],
                relationships: vec![],
            },
        ];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(5),
                }],
                relationships: vec![OCELRelationship::new("i1", "target")],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "ship".to_string(),
                time: dt(t1),
                attributes: vec![OCELEventAttribute {
                    name: "carrier".to_string(),
                    value: OCELAttributeValue::String("DHL".to_string()),
                }],
                relationships: vec![OCELRelationship::new("c1", "target")],
            },
            OCELEvent {
                id: "e3".to_string(),
                event_type: "order".to_string(),
                time: dt(t2),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(1),
                }],
                relationships: vec![OCELRelationship::new("i2", "target")],
            },
        ];

        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn fold_filter_attributes_event_scope_keep_matches_oracle_with_cascade() {
        let f = fixture_filter_attrs();
        let t = Transform::FilterAttributes {
            scope: AttributeScope::Event {
                activity: Some("order".to_string()),
            },
            condition: Condition::AttributeGreaterThan {
                key: "priority".to_string(),
                value: 3.0,
            },
            mode: KeepOrRemove::Keep,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        // e1 (order, priority=5>3) matches -> kept; e3 (order, priority=1) doesn't -> removed;
        // e2 (ship) is out of scope -> kept unconditionally.
        assert_eq!(
            new.get_all_evs().count(),
            2,
            "e1 and e2 survive; e3 is removed"
        );
        // i2 related only to e3 (removed) -> orphaned and dropped; i1 (via e1) and c1 (via e2)
        // survive.
        assert_eq!(new.get_all_obs().count(), 2, "i2 is dropped as an orphan");
        assert!(new.get_ob_by_id("i1").is_some());
        assert!(new.get_ob_by_id("c1").is_some());
    }

    #[test]
    fn fold_filter_attributes_event_scope_remove_matches_oracle_with_cascade() {
        let f = fixture_filter_attrs();
        let t = Transform::FilterAttributes {
            scope: AttributeScope::Event {
                activity: Some("order".to_string()),
            },
            condition: Condition::AttributeGreaterThan {
                key: "priority".to_string(),
                value: 3.0,
            },
            mode: KeepOrRemove::Remove,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        // e1 (order, priority=5>3) matches -> removed; e3 (order, priority=1) doesn't -> kept;
        // e2 (ship) is out of scope -> kept unconditionally.
        assert_eq!(
            new.get_all_evs().count(),
            2,
            "e2 and e3 survive; e1 is removed"
        );
        // i1 related only to e1 (removed) -> orphaned and dropped; i2 (via e3) and c1 (via e2)
        // survive.
        assert_eq!(new.get_all_obs().count(), 2, "i1 is dropped as an orphan");
        assert!(new.get_ob_by_id("i2").is_some());
        assert!(new.get_ob_by_id("c1").is_some());
    }

    #[test]
    fn fold_filter_attributes_object_scope_keep_uses_last_value_matches_oracle() {
        let f = fixture_filter_attrs();
        let t = Transform::FilterAttributes {
            scope: AttributeScope::Object {
                object_type: Some("item".to_string()),
            },
            condition: Condition::AttributeGreaterThan {
                key: "price".to_string(),
                value: 15.0,
            },
            mode: KeepOrRemove::Keep,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        // i1's last price value is 20.0 (matches, kept); using the first value (10.0) would
        // wrongly drop it. i2's only price (5.0) doesn't match; c1 is out of scope.
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "i1 and c1 survive; i2 is removed"
        );
        assert!(new.get_ob_by_id("i1").is_some());
        assert!(new.get_ob_by_id("c1").is_some());
        // Object-scope filtering never removes events, only dangling relationships.
        assert_eq!(
            new.get_all_evs().count(),
            3,
            "no event is dropped by an Object-scope filter"
        );
    }

    #[test]
    fn fold_filter_attributes_object_scope_remove_uses_last_value_matches_oracle() {
        let f = fixture_filter_attrs();
        let t = Transform::FilterAttributes {
            scope: AttributeScope::Object {
                object_type: Some("item".to_string()),
            },
            condition: Condition::AttributeGreaterThan {
                key: "price".to_string(),
                value: 15.0,
            },
            mode: KeepOrRemove::Remove,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        // i1's LAST price value is 20.0 (>15, matches) -> removed; i2's only price is 5.0
        // (doesn't match) -> kept; c1 is out of scope -> kept.
        assert_eq!(
            new.get_all_obs().count(),
            2,
            "i2 and c1 survive; i1 is removed"
        );
        assert!(new.get_ob_by_id("i2").is_some());
        assert!(new.get_ob_by_id("c1").is_some());
        assert_eq!(
            new.get_all_evs().count(),
            3,
            "no event is dropped by an Object-scope filter"
        );
    }

    #[test]
    fn fold_filter_attributes_log_global_is_a_no_op() {
        let f = fixture_filter_attrs();
        let t = Transform::FilterAttributes {
            scope: AttributeScope::LogGlobal,
            condition: Condition::AttributeEquals {
                key: "whatever".to_string(),
                value: "x".to_string(),
            },
            mode: KeepOrRemove::Remove,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            3,
            "LogGlobal scope is a no-op: nothing is removed"
        );
        assert_eq!(
            new.get_all_obs().count(),
            3,
            "LogGlobal scope is a no-op: nothing is removed"
        );
    }

    /// 10 objects, each with exactly one related event, so sampling on either target actually
    /// drops members. Strictly increasing timestamps keep source order deterministic for the sampler.
    fn fixture_sample() -> SlimLinkedOCEL {
        let event_types = vec![OCELType {
            name: "order".to_string(),
            attributes: vec![],
        }];
        let object_types = vec![OCELType {
            name: "item".to_string(),
            attributes: vec![],
        }];
        let mut objects = Vec::new();
        let mut events = Vec::new();
        for i in 0..10 {
            let oid = format!("i{i}");
            objects.push(OCELObject {
                id: oid.clone(),
                object_type: "item".to_string(),
                attributes: vec![],
                relationships: vec![],
            });
            events.push(OCELEvent {
                id: format!("e{i}"),
                event_type: "order".to_string(),
                time: dt(&format!("2020-01-01T00:00:{i:02}+00:00")),
                attributes: vec![],
                relationships: vec![OCELRelationship::new(&oid, "target")],
            });
        }
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn fold_sample_events_fixed_seed_matches_oracle_bit_for_bit() {
        let f = fixture_sample();
        let t = Transform::Sample {
            amount: SampleAmount::Count { value: 4 },
            seed: Some(7),
            target: SampleTarget::Events,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        // assert_parity does an exact structural comparison, so this also proves the SAME 4
        // events were selected as the oracle (not merely the same count).
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            4,
            "sample truncates to the requested count"
        );
        assert_eq!(
            new.get_all_obs().count(),
            10,
            "sampling Events never touches the object set, only relationships"
        );
    }

    #[test]
    fn fold_sample_traces_or_objects_fixed_seed_matches_oracle_bit_for_bit() {
        let f = fixture_sample();
        let t = Transform::Sample {
            amount: SampleAmount::Count { value: 4 },
            seed: Some(7),
            target: SampleTarget::TracesOrObjects,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        // Same rationale: exact structural parity proves identical object selection, not just
        // identical count.
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            4,
            "sample truncates to the requested count"
        );
        assert_eq!(
            new.get_all_evs().count(),
            10,
            "sampling TracesOrObjects never removes events, only dangling relationships"
        );
    }

    /// Two events with different `priority` values, so an attribute-conditioned relabel rule
    /// matches one and not the other, and both attributes let us check the renamed event kept its original values.
    fn fixture_relabel_activities() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";

        let event_types = vec![OCELType {
            name: "order".to_string(),
            attributes: vec![tattr("priority", "integer"), tattr("note", "string")],
        }];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![
                    OCELEventAttribute {
                        name: "priority".to_string(),
                        value: OCELAttributeValue::Integer(5),
                    },
                    OCELEventAttribute {
                        name: "note".to_string(),
                        value: OCELAttributeValue::String("rush".to_string()),
                    },
                ],
                relationships: vec![],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "order".to_string(),
                time: dt(t1),
                attributes: vec![
                    OCELEventAttribute {
                        name: "priority".to_string(),
                        value: OCELAttributeValue::Integer(1),
                    },
                    OCELEventAttribute {
                        name: "note".to_string(),
                        value: OCELAttributeValue::String("calm".to_string()),
                    },
                ],
                relationships: vec![],
            },
        ];
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types: vec![],
            events,
            objects: vec![],
        })
    }

    #[test]
    fn fold_relabel_activities_attribute_conditioned_rule_preserves_values_matches_oracle() {
        let f = fixture_relabel_activities();
        let rules = HashMap::from([(
            "order".to_string(),
            vec![RelabelRule {
                target: RelabelTarget::Literal {
                    value: "C".to_string(),
                },
                condition: Some(Condition::AttributeGreaterThan {
                    key: "priority".to_string(),
                    value: 3.0,
                }),
            }],
        )]);
        let t = Transform::RelabelActivities { rules };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let e1 = new.get_ev_by_id("e1").unwrap();
        let e2 = new.get_ev_by_id("e2").unwrap();
        assert_eq!(
            new.get_ev_type_of(e1),
            "C",
            "priority 5 > 3 matches -> relabeled"
        );
        assert_eq!(
            new.get_ev_type_of(e2),
            "order",
            "priority 1 does not satisfy the condition -> unchanged"
        );

        // append_* fidelity: the renamed event carries its ORIGINAL attribute values under the
        // new type, proving the batch relabel path does not lose or reset attribute data.
        assert_eq!(
            new.get_ev_attr_val(e1, "priority").map(val_str),
            Some("int:5".to_string())
        );
        assert_eq!(
            new.get_ev_attr_val(e1, "note").map(val_str),
            Some("str:rush".to_string())
        );
    }

    #[test]
    fn fold_relabel_activities_merges_two_source_types_into_one_matches_oracle() {
        let f = fixture_multi_type(); // event types "order" (e1) and "ship" (e2)
        let rules = HashMap::from([
            (
                "order".to_string(),
                vec![RelabelRule {
                    target: RelabelTarget::Literal {
                        value: "handled".to_string(),
                    },
                    condition: None,
                }],
            ),
            (
                "ship".to_string(),
                vec![RelabelRule {
                    target: RelabelTarget::Literal {
                        value: "handled".to_string(),
                    },
                    condition: None,
                }],
            ),
        ]);
        let t = Transform::RelabelActivities { rules };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        assert_eq!(
            new.event_types().len(),
            1,
            "order and ship both relabel to 'handled': the merged type is declared once"
        );
        assert_eq!(new.event_types()[0].name, "handled");
        for e in new.get_all_evs() {
            assert_eq!(new.get_ev_type_of(e), "handled");
        }
    }

    #[test]
    fn fold_relabel_object_types_unconditional_rename_matches_oracle() {
        let f = fixture_multi_type(); // object types "item" (i1, price=9.99) and "customer" (c1)
        let rules = HashMap::from([(
            "item".to_string(),
            vec![RelabelRule {
                target: RelabelTarget::Literal {
                    value: "asset".to_string(),
                },
                condition: None,
            }],
        )]);
        let t = Transform::RelabelObjectTypes { rules };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let i1 = new.get_ob_by_id("i1").unwrap();
        let c1 = new.get_ob_by_id("c1").unwrap();
        assert_eq!(new.get_ob_type_of(i1), "asset");
        assert_eq!(
            new.get_ob_type_of(c1),
            "customer",
            "no rule keyed for 'customer'"
        );
        assert_eq!(
            new.get_ob_attr_vals(i1, "price")
                .map(|(_, v)| val_str(v))
                .collect::<Vec<_>>(),
            vec!["float:9.99".to_string()],
            "relabeled object keeps its original attribute value under the new type"
        );
    }

    #[test]
    fn fold_relabel_object_types_conditioned_rule_never_matches_stub_matches_oracle() {
        let f = fixture_multi_type();
        // The old arm evaluates object relabel rules through a stub lookup that always returns
        // `None`, so a rule can never match even though i1's real `price` would satisfy it; preserved for parity.
        let rules = HashMap::from([(
            "item".to_string(),
            vec![RelabelRule {
                target: RelabelTarget::Literal {
                    value: "expensive_item".to_string(),
                },
                condition: Some(Condition::AttributeGreaterThan {
                    key: "price".to_string(),
                    value: 5.0,
                }),
            }],
        )]);
        let t = Transform::RelabelObjectTypes { rules };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let i1 = new.get_ob_by_id("i1").unwrap();
        assert_eq!(
            new.get_ob_type_of(i1),
            "item",
            "condition can never be satisfied through the None-returning stub"
        );
    }

    #[test]
    fn fold_remove_attributes_event_scope_matches_oracle() {
        let f = fixture_multi_type(); // order event e1 (priority), ship event e2 (carrier)
        let t = Transform::RemoveAttributes {
            scope: AttributeScope::Event {
                activity: Some("order".to_string()),
            },
            keys: HashSet::from(["priority".to_string()]),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let e1 = new.get_ev_by_id("e1").unwrap();
        let e2 = new.get_ev_by_id("e2").unwrap();
        assert!(
            new.get_ev_attr_val(e1, "priority").is_none(),
            "priority stripped from the scoped 'order' event"
        );
        assert_eq!(
            new.get_ev_attr_val(e2, "carrier").map(val_str),
            Some("str:DHL".to_string()),
            "ship event is out of scope, untouched"
        );
        // Fully dropped column (deviation #3): the type schema no longer declares it either.
        let order_ty = new
            .event_types()
            .iter()
            .find(|ty| ty.name == "order")
            .unwrap();
        assert!(!order_ty.attributes.iter().any(|a| a.name == "priority"));
    }

    #[test]
    fn fold_remove_attributes_object_scope_matches_oracle() {
        let f = fixture_multi_type(); // item object i1 (price), customer object c1 (name)
        let t = Transform::RemoveAttributes {
            scope: AttributeScope::Object {
                object_type: Some("item".to_string()),
            },
            keys: HashSet::from(["price".to_string()]),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let i1 = new.get_ob_by_id("i1").unwrap();
        let c1 = new.get_ob_by_id("c1").unwrap();
        assert_eq!(
            new.get_ob_attr_vals(i1, "price").count(),
            0,
            "price stripped from the scoped 'item' object"
        );
        assert_eq!(
            new.get_ob_attr_vals(c1, "name")
                .map(|(_, v)| val_str(v))
                .collect::<Vec<_>>(),
            vec!["str:Alice".to_string()],
            "customer object is out of scope, untouched"
        );
        let item_ty = new
            .object_types()
            .iter()
            .find(|ty| ty.name == "item")
            .unwrap();
        assert!(!item_ty.attributes.iter().any(|a| a.name == "price"));
    }

    #[test]
    fn fold_remove_attributes_log_global_is_a_no_op() {
        let f = fixture_multi_type();
        let t = Transform::RemoveAttributes {
            scope: AttributeScope::LogGlobal,
            keys: HashSet::from(["priority".to_string(), "price".to_string()]),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(
            canon(&new),
            canon(&f),
            "LogGlobal scope is a no-op: nothing changes"
        );
    }

    /// `item`'s `price` attribute carries one entry stamped at the Unix epoch sentinel and one
    /// at the earliest event's time; no relationships, isolating the linear time map + epoch skip from gap-clamp.
    fn fixture_rescale_basic() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-01T00:00:10+00:00";
        let t2 = "2020-01-01T00:00:20+00:00";
        let epoch = "1970-01-01T00:00:00+00:00";

        let event_types = vec![OCELType {
            name: "step".to_string(),
            attributes: vec![],
        }];
        let object_types = vec![OCELType {
            name: "item".to_string(),
            attributes: vec![tattr("price", "float")],
        }];
        let objects = vec![OCELObject {
            id: "i1".to_string(),
            object_type: "item".to_string(),
            attributes: vec![
                OCELObjectAttribute::new("price", 1.5_f64, dt(epoch)),
                OCELObjectAttribute::new("price", 9.99_f64, dt(t0)),
            ],
            relationships: vec![],
        }];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "step".to_string(),
                time: dt(t0),
                attributes: vec![],
                relationships: vec![],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "step".to_string(),
                time: dt(t1),
                attributes: vec![],
                relationships: vec![],
            },
            OCELEvent {
                id: "e3".to_string(),
                event_type: "step".to_string(),
                time: dt(t2),
                attributes: vec![],
                relationships: vec![],
            },
        ];
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn fold_rescale_timeframe_linear_map_object_attrs_and_epoch_skip_matches_oracle() {
        let f = fixture_rescale_basic();
        let t = Transform::RescaleTimeframe {
            target_start: "2021-06-01T00:00:00+00:00".to_string(),
            target_end: "2021-06-01T02:00:00+00:00".to_string(),
            min_gap_ms: None,
            max_gap_ms: None,
            gap_object_type: None,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let e1 = new.get_ev_by_id("e1").unwrap();
        let e2 = new.get_ev_by_id("e2").unwrap();
        let e3 = new.get_ev_by_id("e3").unwrap();
        assert_eq!(
            *new.get_ev_time(e1),
            dt("2021-06-01T00:00:00+00:00"),
            "min -> target_start"
        );
        assert_eq!(
            *new.get_ev_time(e2),
            dt("2021-06-01T01:00:00+00:00"),
            "midpoint (10/20) -> midpoint of the target range"
        );
        assert_eq!(
            *new.get_ev_time(e3),
            dt("2021-06-01T02:00:00+00:00"),
            "max -> target_end"
        );

        let i1 = new.get_ob_by_id("i1").unwrap();
        let price: Vec<(String, String)> = new
            .get_ob_attr_vals(i1, "price")
            .map(|(t, v)| (t.to_rfc3339(), val_str(v)))
            .collect();
        assert!(
            price.contains(&(
                dt("1970-01-01T00:00:00+00:00").to_rfc3339(),
                "float:1.5".to_string()
            )),
            "the epoch-stamped entry is SKIPPED: its time is left exactly at the sentinel"
        );
        assert!(
            price.contains(&(
                dt("2021-06-01T00:00:00+00:00").to_rfc3339(),
                "float:9.99".to_string()
            )),
            "the non-epoch entry is rescaled through the SAME linear map as events"
        );
    }

    /// i1 relates to `e1`/`e2`; c1 relates to `e3`/`e4`, disjoint from i1's events so gap-clamping
    /// one object's group is never entangled with the other's. Target range equals the source range, so absent a clamp the rescale is an identity map.
    fn fixture_rescale_gap() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-01T00:00:01+00:00";
        let t2 = "2020-01-01T00:00:02+00:00";
        let t3 = "2020-01-01T00:00:03+00:00";

        let event_types = vec![OCELType {
            name: "step".to_string(),
            attributes: vec![],
        }];
        let object_types = vec![
            OCELType {
                name: "item".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "customer".to_string(),
                attributes: vec![],
            },
        ];
        let objects = vec![
            OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![],
                relationships: vec![],
            },
            OCELObject {
                id: "c1".to_string(),
                object_type: "customer".to_string(),
                attributes: vec![],
                relationships: vec![],
            },
        ];
        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "step".to_string(),
                time: dt(t0),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("i1", "rel")],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "step".to_string(),
                time: dt(t1),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("i1", "rel")],
            },
            OCELEvent {
                id: "e3".to_string(),
                event_type: "step".to_string(),
                time: dt(t2),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("c1", "rel")],
            },
            OCELEvent {
                id: "e4".to_string(),
                event_type: "step".to_string(),
                time: dt(t3),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("c1", "rel")],
            },
        ];
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn fold_rescale_timeframe_gap_clamp_scoped_to_gap_object_type_matches_oracle() {
        let f = fixture_rescale_gap();
        let t = Transform::RescaleTimeframe {
            target_start: "2020-01-01T00:00:00+00:00".to_string(),
            target_end: "2020-01-01T00:00:03+00:00".to_string(),
            min_gap_ms: Some(5000),
            max_gap_ms: None,
            gap_object_type: Some("item".to_string()),
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let e1 = new.get_ev_by_id("e1").unwrap();
        let e2 = new.get_ev_by_id("e2").unwrap();
        let e3 = new.get_ev_by_id("e3").unwrap();
        let e4 = new.get_ev_by_id("e4").unwrap();

        // i1 is "item" (scoped): its natural 1s gap is clamped up to the 5s minimum.
        assert_eq!(*new.get_ev_time(e1), dt("2020-01-01T00:00:00+00:00"));
        assert_eq!(
            *new.get_ev_time(e2),
            dt("2020-01-01T00:00:05+00:00"),
            "gap clamped up to the 5s minimum"
        );
        // c1 is "customer" (NOT of gap_object_type "item"): its gap is left untouched.
        assert_eq!(*new.get_ev_time(e3), dt("2020-01-01T00:00:02+00:00"));
        assert_eq!(
            *new.get_ev_time(e4),
            dt("2020-01-01T00:00:03+00:00"),
            "un-scoped object's natural 1s gap is untouched"
        );
    }

    #[test]
    fn fold_rescale_timeframe_gap_clamp_without_gap_object_type_applies_to_all_matches_oracle() {
        let f = fixture_rescale_gap();
        let t = Transform::RescaleTimeframe {
            target_start: "2020-01-01T00:00:00+00:00".to_string(),
            target_end: "2020-01-01T00:00:03+00:00".to_string(),
            min_gap_ms: Some(5000),
            max_gap_ms: None,
            gap_object_type: None,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);

        let e1 = new.get_ev_by_id("e1").unwrap();
        let e2 = new.get_ev_by_id("e2").unwrap();
        let e3 = new.get_ev_by_id("e3").unwrap();
        let e4 = new.get_ev_by_id("e4").unwrap();

        assert_eq!(*new.get_ev_time(e1), dt("2020-01-01T00:00:00+00:00"));
        assert_eq!(*new.get_ev_time(e2), dt("2020-01-01T00:00:05+00:00"));
        // With no `gap_object_type` scoping, c1's group is clamped too.
        assert_eq!(*new.get_ev_time(e3), dt("2020-01-01T00:00:02+00:00"));
        assert_eq!(
            *new.get_ev_time(e4),
            dt("2020-01-01T00:00:07+00:00"),
            "customer's gap is now ALSO clamped since gap_object_type is None"
        );
    }

    #[test]
    fn fold_filter_variants_is_a_no_op() {
        let f = fixture_multi_type();
        let t = Transform::FilterVariants {
            variants: vec![vec!["order".to_string()]],
            mode: KeepOrRemove::Keep,
        };
        let new = {
            let mut ov = crate::slim_project::Overlay::identity(&f);
            fold_transform(&mut ov, &t);
            crate::slim_project::build_slim(&ov)
        };
        let old = apply_ocel_oracle(&f, std::slice::from_ref(&t));
        assert_parity(&new, &old);
        assert_eq!(canon(&new), canon(&f), "FilterVariants is a no-op for OCEL");
    }

    // Every test below drives the production binding on a multi-transform pipeline and compares
    // it to `apply_ocel_oracle` applied sequentially, catching a fold that reads a stale pre-transform view.

    #[test]
    fn pipeline_two_filters_matches_oracle() {
        let f = fixture_multi_type(); // order/e1->i1(item); ship/e2->i1(item)+c1(customer)
        let pipeline = vec![
            Transform::FilterActivities {
                activities: HashSet::from(["order".to_string()]),
                mode: KeepOrRemove::Keep,
            },
            Transform::FilterObjectTypes {
                object_types: HashSet::from(["item".to_string()]),
                mode: KeepOrRemove::Keep,
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "only 'order' event e1 survives the first filter"
        );
        assert_eq!(
            new.get_all_obs().count(),
            1,
            "only 'item' object i1 survives the second filter"
        );
        assert!(new.get_ev_by_id("e1").is_some());
        assert!(new.get_ob_by_id("i1").is_some());
    }

    #[test]
    fn pipeline_relabel_then_filter_sees_the_relabeled_type() {
        let f = fixture_multi_type(); // event types "order" (e1), "ship" (e2)
        let pipeline = vec![
            Transform::RelabelActivities {
                rules: HashMap::from([(
                    "order".to_string(),
                    vec![RelabelRule {
                        target: RelabelTarget::Literal {
                            value: "handled".to_string(),
                        },
                        condition: None,
                    }],
                )]),
            },
            // If this filter read the pre-relabel type, "handled" would match nothing; the oracle
            // mutates event_type in place before the next transform, so its filter also sees "handled".
            Transform::FilterActivities {
                activities: HashSet::from(["handled".to_string()]),
                mode: KeepOrRemove::Keep,
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "only the relabeled former-'order' event e1 matches 'handled'"
        );
        let e1 = new.get_ev_by_id("e1").unwrap();
        assert_eq!(new.get_ev_type_of(e1), "handled");
    }

    #[test]
    fn pipeline_filter_then_relabel_matches_oracle() {
        let f = fixture_multi_type(); // event types "order" (e1), "ship" (e2)
        let pipeline = vec![
            Transform::FilterActivities {
                activities: HashSet::from(["ship".to_string()]),
                mode: KeepOrRemove::Remove,
            },
            Transform::RelabelActivities {
                rules: HashMap::from([(
                    "order".to_string(),
                    vec![RelabelRule {
                        target: RelabelTarget::Literal {
                            value: "processed".to_string(),
                        },
                        condition: None,
                    }],
                )]),
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_evs().count(),
            1,
            "'ship' event e2 was removed first"
        );
        let e1 = new.get_ev_by_id("e1").unwrap();
        assert_eq!(
            new.get_ev_type_of(e1),
            "processed",
            "surviving 'order' event was then relabeled"
        );
    }

    /// Isolates `RescaleTimeframe` -> `FilterStartEnd` ordering: a reversed target range flips
    /// i1's post-rescale first/last event, so `FilterStartEnd` must read the rescale's effective time, not a stale pre-rescale one.
    fn fixture_start_end_time_reversal() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";
        let event_types = vec![
            OCELType {
                name: "start".to_string(),
                attributes: vec![],
            },
            OCELType {
                name: "end".to_string(),
                attributes: vec![],
            },
        ];
        let object_types = vec![OCELType {
            name: "item".to_string(),
            attributes: vec![],
        }];
        let objects = vec![OCELObject {
            id: "i1".to_string(),
            object_type: "item".to_string(),
            attributes: vec![],
            relationships: vec![],
        }];
        let events = vec![
            OCELEvent {
                id: "e_a".to_string(),
                event_type: "start".to_string(),
                time: dt(t0),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("i1", "rel")],
            },
            OCELEvent {
                id: "e_b".to_string(),
                event_type: "end".to_string(),
                time: dt(t1),
                attributes: vec![],
                relationships: vec![OCELRelationship::new("i1", "rel")],
            },
        ];
        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    #[test]
    fn pipeline_rescale_then_filter_start_end_orders_by_effective_time_matches_oracle() {
        let f = fixture_start_end_time_reversal();
        let pipeline = vec![
            Transform::RescaleTimeframe {
                // target_start is AFTER target_end: a decreasing map that reverses e_a/e_b's
                // relative order.
                target_start: "2025-01-01T00:00:00+00:00".to_string(),
                target_end: "2020-06-01T00:00:00+00:00".to_string(),
                min_gap_ms: None,
                max_gap_ms: None,
                gap_object_type: None,
            },
            Transform::FilterStartEnd {
                start_activities: Some(HashSet::from(["start".to_string()])),
                end_activities: Some(HashSet::from(["end".to_string()])),
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);
        assert_eq!(
            new.get_all_obs().count(),
            0,
            "post-rescale, i1's effective first/last events swap (end-then-start), failing the \
             start/end check -- i1 is dropped"
        );
        assert_eq!(
            new.get_all_evs().count(),
            2,
            "FilterStartEnd never removes events, only objects"
        );
    }

    #[test]
    fn pipeline_full_mix_attribute_filter_sample_remove_attrs_relabel_matches_oracle() {
        /// Six objects, each with one related event carrying an integer `priority` equal to its
        /// index, so an attribute filter keeping `priority > 2` leaves exactly `{i3, i4, i5}`.
        fn fixture_full_mix() -> SlimLinkedOCEL {
            let event_types = vec![OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer"), tattr("note", "string")],
            }];
            let object_types = vec![OCELType {
                name: "item".to_string(),
                attributes: vec![],
            }];
            let mut objects = Vec::new();
            let mut events = Vec::new();
            for i in 0..6 {
                let oid = format!("i{i}");
                objects.push(OCELObject {
                    id: oid.clone(),
                    object_type: "item".to_string(),
                    attributes: vec![],
                    relationships: vec![],
                });
                events.push(OCELEvent {
                    id: format!("e{i}"),
                    event_type: "order".to_string(),
                    time: dt(&format!("2020-01-01T00:00:{i:02}+00:00")),
                    attributes: vec![
                        OCELEventAttribute {
                            name: "priority".to_string(),
                            value: OCELAttributeValue::Integer(i),
                        },
                        OCELEventAttribute {
                            name: "note".to_string(),
                            value: OCELAttributeValue::String(format!("n{i}")),
                        },
                    ],
                    relationships: vec![OCELRelationship::new(&oid, "target")],
                });
            }
            SlimLinkedOCEL::from_ocel(OCEL {
                event_types,
                object_types,
                events,
                objects,
            })
        }

        let f = fixture_full_mix();
        let pipeline = vec![
            Transform::FilterAttributes {
                scope: AttributeScope::Event {
                    activity: Some("order".to_string()),
                },
                condition: Condition::AttributeGreaterThan {
                    key: "priority".to_string(),
                    value: 2.0,
                },
                mode: KeepOrRemove::Keep,
            },
            Transform::Sample {
                amount: SampleAmount::Count { value: 2 },
                seed: Some(3),
                target: SampleTarget::Events,
            },
            Transform::RemoveAttributes {
                scope: AttributeScope::Event {
                    activity: Some("order".to_string()),
                },
                keys: HashSet::from(["note".to_string()]),
            },
            Transform::RelabelActivities {
                rules: HashMap::from([(
                    "order".to_string(),
                    vec![RelabelRule {
                        target: RelabelTarget::Literal {
                            value: "processed".to_string(),
                        },
                        condition: None,
                    }],
                )]),
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);

        assert_eq!(
            new.get_all_evs().count(),
            2,
            "attribute filter keeps 3 (e3,e4,e5); sample truncates to 2"
        );
        assert_eq!(
            new.get_all_obs().count(),
            3,
            "i3/i4/i5 survive the attribute filter's orphan cascade; Sample never drops objects"
        );
        for e in new.get_all_evs() {
            assert_eq!(
                new.get_ev_type_of(e),
                "processed",
                "surviving events were relabeled"
            );
            assert!(
                new.get_ev_attr_val(e, "note").is_none(),
                "note stripped by RemoveAttributes"
            );
            assert!(
                new.get_ev_attr_val(e, "priority").is_some(),
                "priority left untouched"
            );
        }
    }

    #[test]
    fn pipeline_empty_ocel_matches_oracle() {
        let f = SlimLinkedOCEL::new();
        let pipeline = vec![
            Transform::FilterActivities {
                activities: HashSet::from(["whatever".to_string()]),
                mode: KeepOrRemove::Keep,
            },
            Transform::RelabelActivities {
                rules: HashMap::new(),
            },
            Transform::Sample {
                amount: SampleAmount::Count { value: 5 },
                seed: Some(1),
                target: SampleTarget::Events,
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);
        assert_eq!(new.get_all_evs().count(), 0);
        assert_eq!(new.get_all_obs().count(), 0);
    }

    #[test]
    fn pipeline_remove_everything_matches_oracle() {
        let f = fixture_multi_type();
        let pipeline = vec![
            Transform::FilterActivities {
                activities: HashSet::from(["order".to_string(), "ship".to_string()]),
                mode: KeepOrRemove::Remove,
            },
            Transform::FilterObjectTypes {
                object_types: HashSet::from(["item".to_string(), "customer".to_string()]),
                mode: KeepOrRemove::Remove,
            },
        ];
        let new = apply_ocel_transforms(&f, pipeline.clone());
        let old = apply_ocel_oracle(&f, &pipeline);
        assert_parity(&new, &old);
        assert_eq!(new.get_all_evs().count(), 0);
        assert_eq!(new.get_all_obs().count(), 0);
        assert!(
            new.event_types().is_empty(),
            "no event type has a surviving member"
        );
        assert!(
            new.object_types().is_empty(),
            "no object type has a surviving member"
        );
    }

    // Measurement, not a gate: no assertion depends on timing, since a flaky perf threshold
    // would be worse than no check; `report_pipeline_timing` also runs `assert_parity` as a correctness check.

    /// Event/object counts for the synthesized log, kept small enough for a default `cargo test`
    /// run; bump these (and re-run `perf_large_ocel --release --ignored`) to probe a bigger size.
    const PERF_N_EVENTS: usize = 100_000;
    const PERF_N_OBJECTS: usize = 20_000;
    const PERF_ITERS: usize = 5;

    /// Synthesizes a `SlimLinkedOCEL` with `n_events` events across 4 event types and `n_objects`
    /// objects across 3 types, each event linking to 1-3 objects and one O2O edge per "order" object.
    fn synth_large_ocel(n_events: usize, n_objects: usize) -> SlimLinkedOCEL {
        use process_mining::core::chrono::Duration;

        let event_type_names = ["create", "update", "ship", "cancel"];
        let object_type_names = ["item", "customer", "order"];

        let event_types: Vec<OCELType> = event_type_names
            .iter()
            .map(|name| OCELType {
                name: name.to_string(),
                attributes: vec![tattr("amount", "float")],
            })
            .collect();
        let object_types: Vec<OCELType> = object_type_names
            .iter()
            .map(|name| OCELType {
                name: name.to_string(),
                attributes: vec![tattr("value", "float")],
            })
            .collect();

        let base = dt("2020-01-01T00:00:00+00:00");
        let mut objects = Vec::with_capacity(n_objects);
        for i in 0..n_objects {
            let ty = object_type_names[i % object_type_names.len()];
            let mut relationships = Vec::new();
            if ty == "order" && i >= 1 {
                relationships.push(OCELRelationship::new(&format!("o{}", i - 1), "placed_by"));
            }
            objects.push(OCELObject {
                id: format!("o{i}"),
                object_type: ty.to_string(),
                attributes: vec![OCELObjectAttribute::new("value", (i % 100) as f64, base)],
                relationships,
            });
        }

        let mut events = Vec::with_capacity(n_events);
        for i in 0..n_events {
            let ty = event_type_names[i % event_type_names.len()];
            let time = base + Duration::seconds(i as i64);
            let o0 = i % n_objects;
            let mut relationships = vec![OCELRelationship::new(&format!("o{o0}"), "primary")];
            if i % 3 != 0 {
                let o1 = (i + 1) % n_objects;
                relationships.push(OCELRelationship::new(&format!("o{o1}"), "secondary"));
            }
            if i % 3 == 2 {
                let o2 = (i + 2) % n_objects;
                relationships.push(OCELRelationship::new(&format!("o{o2}"), "tertiary"));
            }
            if i % 5 == 0 {
                // A second qualifier onto the SAME object as "primary": the multi-qualifier edge.
                relationships.push(OCELRelationship::new(&format!("o{o0}"), "also_primary"));
            }
            events.push(OCELEvent {
                id: format!("e{i}"),
                event_type: ty.to_string(),
                time,
                attributes: vec![OCELEventAttribute {
                    name: "amount".to_string(),
                    value: OCELAttributeValue::Float((i % 1000) as f64),
                }],
                relationships,
            });
        }

        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    /// Fast, always-run sanity check on `synth_large_ocel`'s shape at a tiny size, since
    /// `perf_large_ocel` (which runs it large) is skipped by default.
    #[test]
    fn synth_large_ocel_smoke_is_well_formed() {
        let small = synth_large_ocel(200, 50);
        assert_eq!(small.get_all_evs().count(), 200);
        assert_eq!(small.get_all_obs().count(), 50);
        assert!(small.event_types().len() <= 4);
        assert!(small.object_types().len() <= 3);
        // A pipeline run must not panic and must stay internally consistent (parity against the
        // oracle) at this small size too.
        let pipeline = vec![Transform::FilterObjectTypes {
            object_types: HashSet::from(["item".to_string()]),
            mode: KeepOrRemove::Keep,
        }];
        let new = apply_ocel_transforms(&small, pipeline.clone());
        let old = apply_ocel_oracle(&small, &pipeline);
        assert_parity(&new, &old);
    }

    /// Runs `f` `iters` times and returns `(min, median)` wall-clock duration.
    fn time_iters<F: FnMut() -> SlimLinkedOCEL>(
        mut f: F,
        iters: usize,
    ) -> (std::time::Duration, std::time::Duration) {
        let mut times: Vec<std::time::Duration> = Vec::with_capacity(iters);
        for _ in 0..iters {
            let start = std::time::Instant::now();
            let out = f();
            times.push(start.elapsed());
            std::hint::black_box(&out);
        }
        times.sort();
        let min = times[0];
        let median = times[times.len() / 2];
        (min, median)
    }

    /// Times one pipeline through both the old oracle and the new production binding, asserts
    /// parity once, and prints old-vs-new min/median plus the speedup ratio.
    fn report_pipeline_timing(name: &str, large: &SlimLinkedOCEL, pipeline: &[Transform]) {
        let new_out = apply_ocel_transforms(large, pipeline.to_vec());
        let old_out = apply_ocel_oracle(large, pipeline);
        assert_parity(&new_out, &old_out);

        let (old_min, old_median) = time_iters(|| apply_ocel_oracle(large, pipeline), PERF_ITERS);
        let (new_min, new_median) = time_iters(
            || apply_ocel_transforms(large, pipeline.to_vec()),
            PERF_ITERS,
        );
        let speedup_min = old_min.as_secs_f64() / new_min.as_secs_f64().max(1e-12);
        let speedup_median = old_median.as_secs_f64() / new_median.as_secs_f64().max(1e-12);
        println!(
            "[perf] {name}\n       old (round-trip)  min={old_min:>10.2?}  median={old_median:>10.2?}\n       new (slim-native) min={new_min:>10.2?}  median={new_median:>10.2?}\n       speedup           min={speedup_min:>7.2}x  median={speedup_median:>7.2}x"
        );
    }

    /// Large-OCEL timing: old round-trip vs. slim-native `apply_ocel_transforms`. `#[ignore]`d
    /// since it's a measurement, not a CI check, and debug-build timings aren't meaningful. Run:
    ///
    ///   cargo test --manifest-path engine/Cargo.toml -p app-bindings perf_large_ocel --release -- --ignored --nocapture
    #[test]
    #[ignore]
    fn perf_large_ocel() {
        let large = synth_large_ocel(PERF_N_EVENTS, PERF_N_OBJECTS);
        println!(
            "[perf] synthesized {} events / {} objects",
            large.get_all_evs().count(),
            large.get_all_obs().count()
        );

        report_pipeline_timing(
            "(i) single FilterObjectTypes (selective: keep 1 of 3 object types)",
            &large,
            &[Transform::FilterObjectTypes {
                object_types: HashSet::from(["item".to_string()]),
                mode: KeepOrRemove::Keep,
            }],
        );

        let base = dt("2020-01-01T00:00:00+00:00");
        let q1 = base + process_mining::core::chrono::Duration::seconds((PERF_N_EVENTS / 4) as i64);
        let q3 =
            base + process_mining::core::chrono::Duration::seconds((3 * PERF_N_EVENTS / 4) as i64);
        report_pipeline_timing(
            "(ii) 3-filter stack (FilterActivities + FilterTimeRange + FilterMinRelatedEvents)",
            &large,
            &[
                Transform::FilterActivities {
                    activities: HashSet::from(["create".to_string(), "update".to_string()]),
                    mode: KeepOrRemove::Keep,
                },
                Transform::FilterTimeRange {
                    start: q1.to_rfc3339(),
                    end: q3.to_rfc3339(),
                    mode: KeepOrRemove::Keep,
                },
                Transform::FilterMinRelatedEvents {
                    min_events: Some(1),
                    max_events: None,
                    of_type: None,
                },
            ],
        );

        report_pipeline_timing(
            "(iii) relabel + filter",
            &large,
            &[
                Transform::RelabelActivities {
                    rules: HashMap::from([(
                        "create".to_string(),
                        vec![RelabelRule {
                            target: RelabelTarget::Literal {
                                value: "created".to_string(),
                            },
                            condition: None,
                        }],
                    )]),
                },
                Transform::FilterActivities {
                    activities: HashSet::from(["created".to_string()]),
                    mode: KeepOrRemove::Keep,
                },
            ],
        );
    }
}
