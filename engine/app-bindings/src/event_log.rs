//! Event-log analysis bindings.
//!
//! Each binding takes `&EventLog` directly; the `#[register_binding]` macro maps that to an
//! `EventLogHandle` and resolves it from the object store at dispatch time.
use std::collections::{HashMap, HashSet};

use process_mining::bindings::register_binding;
use process_mining::core::chrono::DateTime;
use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use process_mining::core::event_data::case_centric::{
    Attribute, AttributeValue, Attributes, Event, Trace, XESEditableAttribute,
};
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::types::{
    AttributeCatalogEntry, AttributeInfo, AttributeKind, AttributeLevel, AttributeScope,
    AttributeSummary, AttributeValues, CaseDurations, DfArcDuration, DfPerformance, DfgCounts,
    LogClassifierInfo, LogExtensionInfo, LogGlobals, NumberOfTracesAndEvents, NumericStats,
    TraceBrowserPage, TraceBrowserRow, TraceDetail, TraceEventRow, TraceSortField, TraceVariants,
    ATTR_VALUES_CAP,
};

/// Build an event log from one or more simulated traces: one case per trace, one event per
/// activity name, timestamps spaced 1 minute apart from a fixed base (restarting each trace).
/// The caller is expected to have already removed silent/tau transitions. The returned
/// `EventLog` is auto-stored by the registry under a fresh handle, so the frontend gets a
/// dataset handle back.
#[register_binding]
pub fn event_log_from_activities(traces: Vec<Vec<String>>) -> EventLog {
    const BASE_MS: i64 = 1_577_836_800_000; // 2020-01-01T00:00:00Z
    const STEP_MS: i64 = 60_000; // 1 minute between events

    let mut log = EventLog::new();
    for (trace_idx, activities) in traces.into_iter().enumerate() {
        let mut trace = Trace::new();
        trace.attributes.add_attribute(Attribute::new(
            "concept:name".to_string(),
            AttributeValue::String(format!("simulated-trace-{}", trace_idx + 1)),
        ));

        for (step, activity) in activities.into_iter().enumerate() {
            let mut event = Event::new(activity);
            if let Some(ts) = DateTime::from_timestamp_millis(BASE_MS + step as i64 * STEP_MS) {
                event.attributes.add_attribute(Attribute::new(
                    "time:timestamp".to_string(),
                    AttributeValue::Date(ts.fixed_offset()),
                ));
            }
            trace.events.push(event);
        }
        log.traces.push(trace);
    }
    log
}

/// One typed attribute as authored in the editor: value carried as a string, `attr_type` selecting
/// how it is parsed into an `AttributeValue` (`string` | `int` | `float` | `boolean` | `date`).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct XesAttrInput {
    pub name: String,
    #[serde(rename = "type")]
    pub attr_type: String,
    pub value: String,
}

/// One event of an authored trace. `time` is RFC3339; events without a parseable time get none.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct XesEventInput {
    pub activity: String,
    pub time: String,
    #[serde(default)]
    pub attributes: Vec<XesAttrInput>,
}

/// One authored trace (case): its id plus events, with optional case-level attributes.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct XesTraceInput {
    #[serde(rename = "caseId")]
    pub case_id: String,
    #[serde(default)]
    pub events: Vec<XesEventInput>,
    #[serde(default)]
    pub attributes: Vec<XesAttrInput>,
}

/// The full event log as emitted by / loaded into the EventLog editor.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EventLogInput {
    #[serde(default)]
    pub traces: Vec<XesTraceInput>,
}

/// Parse a string cell into a typed XES attribute value; falls back to `String` on a parse failure
/// so authoring never silently drops a value.
fn parse_xes_value(attr_type: &str, value: &str) -> AttributeValue {
    match attr_type {
        "int" => value
            .trim()
            .parse::<i64>()
            .map(AttributeValue::Int)
            .unwrap_or_else(|_| AttributeValue::String(value.to_string())),
        "float" => value
            .trim()
            .parse::<f64>()
            .map(AttributeValue::Float)
            .unwrap_or_else(|_| AttributeValue::String(value.to_string())),
        "boolean" => match value.trim().to_ascii_lowercase().as_str() {
            "true" => AttributeValue::Boolean(true),
            "false" => AttributeValue::Boolean(false),
            _ => AttributeValue::String(value.to_string()),
        },
        "date" => DateTime::parse_from_rfc3339(value.trim())
            .map(AttributeValue::Date)
            .unwrap_or_else(|_| AttributeValue::String(value.to_string())),
        _ => AttributeValue::String(value.to_string()),
    }
}

/// Inverse of `parse_xes_value`: the editor's `(type, value-string)` pair for a stored value.
/// Returns `None` for structural values (lists/containers/ids) the flat editor does not author.
fn xes_value_type_and_string(v: &AttributeValue) -> Option<(&'static str, String)> {
    match v {
        AttributeValue::String(s) => Some(("string", s.clone())),
        AttributeValue::Int(i) => Some(("int", i.to_string())),
        AttributeValue::Float(f) => Some(("float", f.to_string())),
        AttributeValue::Boolean(b) => Some(("boolean", b.to_string())),
        AttributeValue::Date(d) => Some(("date", d.to_rfc3339())),
        _ => None,
    }
}

/// Build an event log from the editor's structured JSON: one trace per case (`concept:name`), one
/// event per row (`concept:name` + `time:timestamp`), typed custom attributes preserved. The result
/// is auto-stored under a fresh handle, so the frontend gets a dataset handle back.
#[register_binding]
pub fn event_log_from_json(log: EventLogInput) -> EventLog {
    let mut out = EventLog::new();
    for t in log.traces {
        let mut trace = Trace::new();
        trace.attributes.add_attribute(Attribute::new(
            "concept:name".to_string(),
            AttributeValue::String(t.case_id),
        ));
        for a in t.attributes {
            trace.attributes.add_attribute(Attribute::new(
                a.name,
                parse_xes_value(&a.attr_type, &a.value),
            ));
        }
        for ev in t.events {
            let mut event = Event::new(ev.activity);
            if let Ok(ts) = DateTime::parse_from_rfc3339(ev.time.trim()) {
                event.attributes.add_attribute(Attribute::new(
                    "time:timestamp".to_string(),
                    AttributeValue::Date(ts),
                ));
            }
            for a in ev.attributes {
                event.attributes.add_attribute(Attribute::new(
                    a.name,
                    parse_xes_value(&a.attr_type, &a.value),
                ));
            }
            trace.events.push(event);
        }
        out.traces.push(trace);
    }
    out
}

/// Read an existing event log back into the editor's structured JSON (import-to-seed). Inverse of
/// `event_log_from_json`; `concept:name`/`time:timestamp` are lifted to `caseId`/`activity`/`time`.
#[register_binding]
pub fn event_log_to_json(event_log: &EventLog) -> EventLogInput {
    let traces = event_log
        .traces
        .iter()
        .enumerate()
        .map(|(i, trace)| {
            let case_id = trace
                .attributes
                .iter()
                .find(|a| a.key == "concept:name")
                .map(|a| a.value.to_string())
                .unwrap_or_else(|| format!("case-{i}"));
            let attributes = trace
                .attributes
                .iter()
                .filter(|a| a.key != "concept:name")
                .filter_map(|a| {
                    xes_value_type_and_string(&a.value).map(|(t, v)| XesAttrInput {
                        name: a.key.clone(),
                        attr_type: t.to_string(),
                        value: v,
                    })
                })
                .collect();
            let events = trace
                .events
                .iter()
                .map(|e| {
                    let activity = get_event_activity(e).unwrap_or("").to_string();
                    let time = e
                        .attributes
                        .get_by_key("time:timestamp")
                        .and_then(|a| a.value.try_as_date())
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default();
                    let attributes = e
                        .attributes
                        .iter()
                        .filter(|a| a.key != "concept:name" && a.key != "time:timestamp")
                        .filter_map(|a| {
                            xes_value_type_and_string(&a.value).map(|(t, v)| XesAttrInput {
                                name: a.key.clone(),
                                attr_type: t.to_string(),
                                value: v,
                            })
                        })
                        .collect();
                    XesEventInput {
                        activity,
                        time,
                        attributes,
                    }
                })
                .collect();
            XesTraceInput {
                case_id,
                events,
                attributes,
            }
        })
        .collect();
    EventLogInput { traces }
}

/// Activity-trace variants sorted by frequency.
#[register_binding]
pub fn get_log_trace_variants(event_log: &EventLog) -> TraceVariants {
    let mut projection = EventLogActivityProjection::from(event_log);
    projection.traces.sort_by(|a, b| b.1.cmp(&a.1));
    projection.into()
}

/// Get the activity name (`concept:name`) from an XES event.
fn get_event_activity(event: &Event) -> Option<&str> {
    event
        .attributes
        .get_by_key("concept:name")
        .and_then(|a| a.value.try_as_string())
        .map(|s| s.as_str())
}

/// Number of events per activity (`concept:name`).
#[register_binding]
pub fn get_activity_counts(event_log: &EventLog) -> HashMap<String, usize> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for trace in &event_log.traces {
        for event in &trace.events {
            let activity = event
                .attributes
                .get_by_key("concept:name")
                .and_then(|a| a.value.try_as_string())
                .map(|s| s.as_str())
                .unwrap_or("UNKNOWN");
            *counts.entry(activity.to_string()).or_default() += 1;
        }
    }
    counts
}

/// Number of traces and events in the log.
#[register_binding]
pub fn get_log_info(event_log: &EventLog) -> NumberOfTracesAndEvents {
    NumberOfTracesAndEvents {
        num_traces: event_log.traces.len(),
        num_events: event_log.traces.iter().map(|t| t.events.len()).sum(),
    }
}

/// Get the timestamp (`time:timestamp`) of an XES event in epoch milliseconds.
fn get_event_time_ms(event: &Event) -> Option<i64> {
    event
        .attributes
        .get_by_key("time:timestamp")
        .and_then(|a| match &a.value {
            AttributeValue::Date(d) => Some(d.timestamp_millis()),
            _ => None,
        })
}

/// Case-centric DFG counts. Activities interned via `&str` to avoid per-event `String` alloc;
/// start/end carry real per-activity trace frequencies.
#[register_binding]
pub fn get_df(event_log: &EventLog) -> DfgCounts {
    let mut idx_of: HashMap<&str, usize> = HashMap::new();
    let mut names: Vec<&str> = Vec::new();
    let mut activity_counts: Vec<u32> = Vec::new();
    let mut start_counts: Vec<u32> = Vec::new();
    let mut end_counts: Vec<u32> = Vec::new();
    let mut dfs: HashMap<(usize, usize), u32> = HashMap::new();

    for trace in &event_log.traces {
        let mut prev: Option<usize> = None;
        for event in &trace.events {
            let Some(act) = get_event_activity(event) else {
                continue;
            };
            let idx = match idx_of.get(act) {
                Some(&i) => i,
                None => {
                    let i = names.len();
                    idx_of.insert(act, i);
                    names.push(act);
                    activity_counts.push(0);
                    start_counts.push(0);
                    end_counts.push(0);
                    i
                }
            };
            activity_counts[idx] += 1;
            match prev {
                Some(p) => *dfs.entry((p, idx)).or_default() += 1,
                None => start_counts[idx] += 1,
            }
            prev = Some(idx);
        }
        if let Some(p) = prev {
            end_counts[p] += 1;
        }
    }

    let mut result = DfgCounts::default();
    for (i, &name) in names.iter().enumerate() {
        result
            .activities
            .insert(name.to_string(), activity_counts[i]);
        if start_counts[i] > 0 {
            result
                .start_activities
                .insert(name.to_string(), start_counts[i]);
        }
        if end_counts[i] > 0 {
            result
                .end_activities
                .insert(name.to_string(), end_counts[i]);
        }
    }
    result.directly_follows_relations = dfs
        .into_iter()
        .map(|((a, b), c)| ((names[a].to_string(), names[b].to_string()), c))
        .collect();
    result
}

/// Per-arc directly-follows duration statistics (case-centric performance overlay);
/// same per-pair math as `get_ocel_df_performance`.
#[register_binding]
pub fn get_df_performance(event_log: &EventLog) -> DfPerformance {
    // Durations keyed by (source_activity, target_activity) -> [ms].
    let mut arc_durations: HashMap<(String, String), Vec<f64>> = HashMap::new();

    for trace in &event_log.traces {
        for pair in trace.events.windows(2) {
            let (Some(src_act), Some(tgt_act)) =
                (get_event_activity(&pair[0]), get_event_activity(&pair[1]))
            else {
                continue;
            };
            let (Some(src_ts), Some(tgt_ts)) =
                (get_event_time_ms(&pair[0]), get_event_time_ms(&pair[1]))
            else {
                continue;
            };
            let duration_ms = (tgt_ts - src_ts) as f64;
            arc_durations
                .entry((src_act.to_string(), tgt_act.to_string()))
                .or_default()
                .push(duration_ms);
        }
    }

    let mut arcs: Vec<DfArcDuration> = arc_durations
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
    DfPerformance { arcs }
}

const CASE_DURATION_HIST_BINS: usize = 60;
const CASE_DURATION_ECDF_POINTS: usize = 512;

/// Case-duration distribution (stats, histogram, ECDF).
#[register_binding]
pub fn get_case_durations(event_log: &EventLog) -> CaseDurations {
    let mut num_empty_cases: usize = 0;
    let mut durations_ms: Vec<i64> = Vec::with_capacity(event_log.traces.len());
    for trace in &event_log.traces {
        let mut first: Option<i64> = None;
        let mut last: Option<i64> = None;
        for ev in &trace.events {
            let ts = ev
                .attributes
                .get_by_key("time:timestamp")
                .and_then(|a| match &a.value {
                    AttributeValue::Date(d) => Some(d.timestamp_millis()),
                    _ => None,
                });
            if let Some(ts) = ts {
                first = Some(first.map_or(ts, |f| f.min(ts)));
                last = Some(last.map_or(ts, |l| l.max(ts)));
            }
        }
        match (first, last) {
            (Some(f), Some(l)) => durations_ms.push(l - f),
            _ => num_empty_cases += 1,
        }
    }

    let num_cases = durations_ms.len();
    if num_cases == 0 {
        return CaseDurations {
            num_cases: 0,
            num_empty_cases,
            min_ms: 0,
            max_ms: 0,
            mean_ms: 0.0,
            median_ms: 0,
            p90_ms: 0,
            p95_ms: 0,
            p99_ms: 0,
            hist_bin_edges_ms: Vec::new(),
            hist_counts: Vec::new(),
            ecdf_x_ms: Vec::new(),
            ecdf_y: Vec::new(),
        };
    }

    durations_ms.sort_unstable();

    let min_ms = durations_ms[0];
    let max_ms = durations_ms.last().copied().unwrap_or(0);
    let mean_ms: f64 = durations_ms.iter().map(|&v| v as f64).sum::<f64>() / num_cases as f64;
    let quantile = |q: f64| -> i64 {
        let idx = ((q * num_cases as f64).ceil() as usize)
            .saturating_sub(1)
            .min(num_cases - 1);
        durations_ms[idx]
    };
    let median_ms = if num_cases.is_multiple_of(2) {
        let mid = num_cases / 2;
        (durations_ms[mid - 1] + durations_ms[mid]) / 2
    } else {
        durations_ms[num_cases / 2]
    };
    let p90_ms = quantile(0.9);
    let p95_ms = quantile(0.95);
    let p99_ms = quantile(0.99);

    let nbins = CASE_DURATION_HIST_BINS;
    let lo = (min_ms.max(1)) as f64;
    let hi = (max_ms.max(min_ms + 1)) as f64;
    let mut hist_bin_edges_ms: Vec<f64> = Vec::with_capacity(nbins + 1);
    if hi <= lo {
        hist_bin_edges_ms.push(lo);
        hist_bin_edges_ms.push(lo + 1.0);
    } else {
        let log_lo = lo.ln();
        let log_hi = hi.ln();
        for i in 0..=nbins {
            let t = i as f64 / nbins as f64;
            hist_bin_edges_ms.push((log_lo + t * (log_hi - log_lo)).exp());
        }
    }

    let mut hist_counts: Vec<usize> = vec![0; hist_bin_edges_ms.len() - 1];
    for &d in &durations_ms {
        let df = d.max(0) as f64;
        let bin = hist_bin_edges_ms
            .binary_search_by(|e| e.partial_cmp(&df).unwrap_or(std::cmp::Ordering::Equal))
            .map(|i| i.min(hist_counts.len() - 1))
            .unwrap_or_else(|i| i.saturating_sub(1).min(hist_counts.len() - 1));
        hist_counts[bin] += 1;
    }

    let ecdf_n = CASE_DURATION_ECDF_POINTS.min(num_cases);
    let mut ecdf_x_ms: Vec<i64> = Vec::with_capacity(ecdf_n);
    let mut ecdf_y: Vec<f64> = Vec::with_capacity(ecdf_n);
    for i in 0..ecdf_n {
        let idx = if ecdf_n == 1 {
            0
        } else {
            (i * (num_cases - 1)) / (ecdf_n - 1)
        };
        let x = durations_ms[idx];
        let y = (idx + 1) as f64 / num_cases as f64;
        if ecdf_x_ms.last().copied() != Some(x) {
            ecdf_x_ms.push(x);
            ecdf_y.push(y);
        } else if let Some(last) = ecdf_y.last_mut() {
            *last = y;
        }
    }

    CaseDurations {
        num_cases,
        num_empty_cases,
        min_ms,
        max_ms,
        mean_ms,
        median_ms,
        p90_ms,
        p95_ms,
        p99_ms,
        hist_bin_edges_ms,
        hist_counts,
        ecdf_x_ms,
        ecdf_y,
    }
}

/// Log-level metadata: attributes, extensions, classifiers, XES 2.0 global defaults.
#[register_binding]
pub fn get_log_globals(event_log: &EventLog) -> LogGlobals {
    let attributes: HashMap<String, String> = event_log
        .attributes
        .iter()
        .map(|a| (a.key.clone(), a.value.to_string()))
        .collect();

    let extensions: Vec<LogExtensionInfo> = event_log
        .extensions
        .as_ref()
        .map(|v| {
            v.iter()
                .map(|e| LogExtensionInfo {
                    name: e.name.clone(),
                    prefix: e.prefix.clone(),
                    uri: e.uri.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    let classifiers: Vec<LogClassifierInfo> = event_log
        .classifiers
        .as_ref()
        .map(|v| {
            v.iter()
                .map(|c| LogClassifierInfo {
                    name: c.name.clone(),
                    keys: c.keys.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    let attrs_to_map = |opt: &Option<Attributes>| -> HashMap<String, String> {
        opt.as_ref()
            .map(|v| {
                v.iter()
                    .map(|a| (a.key.clone(), a.value.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    };

    LogGlobals {
        attributes,
        extensions,
        classifiers,
        global_trace_attrs: attrs_to_map(&event_log.global_trace_attrs),
        global_event_attrs: attrs_to_map(&event_log.global_event_attrs),
    }
}

/// List event- and case-level attributes with type/cardinality info.
#[register_binding]
pub fn get_attribute_names(event_log: &EventLog) -> Vec<AttributeInfo> {
    let mut result: Vec<AttributeInfo> = Vec::new();

    let mut ev_attrs: HashMap<String, (HashSet<String>, usize, AttributeKind)> = HashMap::new();
    let total_events: usize = event_log.traces.iter().map(|t| t.events.len()).sum();
    for trace in &event_log.traces {
        for event in &trace.events {
            for attr in event.attributes.iter() {
                if attr.key == "concept:name" || attr.key == "time:timestamp" {
                    continue;
                }
                let entry = ev_attrs
                    .entry(attr.key.clone())
                    .or_insert_with(|| (HashSet::new(), 0, AttributeKind::Other));
                entry.0.insert(attr.value.to_string());
                entry.1 += 1;
                if entry.1 == 1 {
                    entry.2 = match &attr.value {
                        AttributeValue::Float(_) | AttributeValue::Int(_) => AttributeKind::Numeric,
                        AttributeValue::Date(_) => AttributeKind::Date,
                        AttributeValue::String(_) => AttributeKind::Categorical,
                        _ => AttributeKind::Categorical,
                    };
                }
            }
        }
    }

    for (attr_name, (uniques, count, kind)) in ev_attrs {
        result.push(AttributeInfo {
            name: attr_name,
            level: AttributeLevel::Event,
            kind,
            unique_count: uniques.len(),
            total_count: count,
            missing_count: total_events.saturating_sub(count),
        });
    }

    let mut case_attrs: HashMap<String, (HashSet<String>, usize, AttributeKind)> = HashMap::new();
    let total_cases = event_log.traces.len();
    for trace in &event_log.traces {
        for attr in &trace.attributes {
            if attr.key == "concept:name" {
                continue;
            }
            let entry = case_attrs
                .entry(attr.key.clone())
                .or_insert_with(|| (HashSet::new(), 0, AttributeKind::Other));
            entry.0.insert(attr.value.to_string());
            entry.1 += 1;
            if entry.1 == 1 {
                entry.2 = match &attr.value {
                    AttributeValue::Float(_) | AttributeValue::Int(_) => AttributeKind::Numeric,
                    AttributeValue::Date(_) => AttributeKind::Date,
                    AttributeValue::String(_) => AttributeKind::Categorical,
                    _ => AttributeKind::Categorical,
                };
            }
        }
    }

    for (attr_name, (uniques, count, kind)) in case_attrs {
        result.push(AttributeInfo {
            name: attr_name,
            level: AttributeLevel::Case,
            kind,
            unique_count: uniques.len(),
            total_count: count,
            missing_count: total_cases.saturating_sub(count),
        });
    }

    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

/// Detailed summary (stats/histogram or top-values) for one attribute.
#[register_binding]
pub fn get_attribute_summary(
    event_log: &EventLog,
    attr_name: String,
    level: AttributeLevel,
) -> AttributeSummary {
    let mut values_str: Vec<String> = Vec::new();
    let mut values_f64: Vec<f64> = Vec::new();
    let total: usize;
    let mut kind = AttributeKind::Other;
    let mut first = true;

    let classify = |v: &AttributeValue| match v {
        AttributeValue::Float(_) | AttributeValue::Int(_) => AttributeKind::Numeric,
        AttributeValue::Date(_) => AttributeKind::Date,
        AttributeValue::String(_) => AttributeKind::Categorical,
        _ => AttributeKind::Categorical,
    };

    match level {
        AttributeLevel::Event => {
            total = event_log.traces.iter().map(|t| t.events.len()).sum();
            for trace in &event_log.traces {
                for event in &trace.events {
                    if let Some(attr) = event.attributes.get_by_key(&attr_name) {
                        if first {
                            kind = classify(&attr.value);
                            first = false;
                        }
                        match &attr.value {
                            AttributeValue::Float(f) => values_f64.push(*f),
                            AttributeValue::Int(i) => values_f64.push(*i as f64),
                            _ => values_str.push(attr.value.to_string()),
                        }
                    }
                }
            }
        }
        AttributeLevel::Case => {
            total = event_log.traces.len();
            for trace in &event_log.traces {
                if let Some(attr) = trace.attributes.iter().find(|a| a.key == attr_name) {
                    if first {
                        kind = classify(&attr.value);
                        first = false;
                    }
                    match &attr.value {
                        AttributeValue::Float(f) => values_f64.push(*f),
                        AttributeValue::Int(i) => values_f64.push(*i as f64),
                        _ => values_str.push(attr.value.to_string()),
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

        AttributeSummary {
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

        AttributeSummary {
            name: attr_name,
            level,
            kind,
            total,
            missing,
            top_values,
            hist_bin_edges: Vec::new(),
            hist_counts: Vec::new(),
            numeric_stats: None,
        }
    }
}

/// All distinct categorical values (with counts, most-frequent first) for one attribute -
/// the full list the attribute filter's value picker searches. Numeric values are ignored.
/// Capped at `ATTR_VALUES_CAP`; `total_distinct` reports the true count before truncation.
#[register_binding]
pub fn get_attribute_values(
    event_log: &EventLog,
    attr_name: String,
    level: AttributeLevel,
) -> AttributeValues {
    let mut freq: HashMap<String, usize> = HashMap::new();
    let mut tally = |v: &AttributeValue| {
        if !matches!(v, AttributeValue::Float(_) | AttributeValue::Int(_)) {
            *freq.entry(v.to_string()).or_default() += 1;
        }
    };

    match level {
        AttributeLevel::Event => {
            for trace in &event_log.traces {
                for event in &trace.events {
                    if let Some(attr) = event.attributes.get_by_key(&attr_name) {
                        tally(&attr.value);
                    }
                }
            }
        }
        AttributeLevel::Case => {
            for trace in &event_log.traces {
                if let Some(attr) = trace.attributes.iter().find(|a| a.key == attr_name) {
                    tally(&attr.value);
                }
            }
        }
    }

    let total_distinct = freq.len();
    let mut values: Vec<(String, usize)> = freq.into_iter().collect();
    values.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    values.truncate(ATTR_VALUES_CAP);
    AttributeValues {
        values,
        total_distinct,
    }
}

/// Catalog of removable attributes (log/case/event scopes) for the RemoveAttributes transform.
#[register_binding]
pub fn get_removable_attributes_xes(event_log: &EventLog) -> Vec<AttributeCatalogEntry> {
    const SAMPLE_CAP: usize = 5;
    let mut out: Vec<AttributeCatalogEntry> = Vec::new();

    let mut log_seen: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    for a in &event_log.attributes {
        let e = log_seen.entry(a.key.clone()).or_default();
        e.0 += 1;
        if e.1.len() < SAMPLE_CAP {
            e.1.insert(a.value.to_string());
        }
    }
    for (key, (count, samples)) in log_seen {
        out.push(AttributeCatalogEntry {
            scope: AttributeScope::LogGlobal,
            key,
            occurrence_count: Some(count),
            sample_values: samples.into_iter().collect(),
        });
    }

    let mut case_seen: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    for trace in &event_log.traces {
        for a in &trace.attributes {
            if a.key == "concept:name" {
                continue;
            }
            let e = case_seen.entry(a.key.clone()).or_default();
            e.0 += 1;
            if e.1.len() < SAMPLE_CAP {
                e.1.insert(a.value.to_string());
            }
        }
    }
    for (key, (count, samples)) in case_seen {
        out.push(AttributeCatalogEntry {
            scope: AttributeScope::Object { object_type: None },
            key,
            occurrence_count: Some(count),
            sample_values: samples.into_iter().collect(),
        });
    }

    let mut evt_all: HashMap<String, (usize, HashSet<String>)> = HashMap::new();
    let mut evt_by_act: HashMap<(String, String), (usize, HashSet<String>)> = HashMap::new();
    for trace in &event_log.traces {
        for ev in &trace.events {
            let act = get_event_activity(ev).unwrap_or("UNKNOWN").to_string();
            for a in ev.attributes.iter() {
                if a.key == "concept:name" || a.key == "time:timestamp" {
                    continue;
                }
                let val = a.value.to_string();
                let e = evt_all.entry(a.key.clone()).or_default();
                e.0 += 1;
                if e.1.len() < SAMPLE_CAP {
                    e.1.insert(val.clone());
                }
                let e2 = evt_by_act.entry((act.clone(), a.key.clone())).or_default();
                e2.0 += 1;
                if e2.1.len() < SAMPLE_CAP {
                    e2.1.insert(val);
                }
            }
        }
    }
    for (key, (count, samples)) in evt_all {
        out.push(AttributeCatalogEntry {
            scope: AttributeScope::Event { activity: None },
            key,
            occurrence_count: Some(count),
            sample_values: samples.into_iter().collect(),
        });
    }
    for ((act, key), (count, samples)) in evt_by_act {
        out.push(AttributeCatalogEntry {
            scope: AttributeScope::Event {
                activity: Some(act),
            },
            key,
            occurrence_count: Some(count),
            sample_values: samples.into_iter().collect(),
        });
    }

    out
}

/// Paginated, sortable, filterable case list for the trace browser.
#[register_binding]
pub fn get_log_traces(
    event_log: &EventLog,
    offset: usize,
    limit: usize,
    sort_field: TraceSortField,
    sort_asc: bool,
    filter: String,
) -> TraceBrowserPage {
    let mut rows: Vec<TraceBrowserRow> = event_log
        .traces
        .iter()
        .enumerate()
        .map(|(i, trace)| {
            let case_id = trace
                .attributes
                .iter()
                .find(|a| a.key == "concept:name")
                .map(|a| a.value.to_string())
                .unwrap_or_else(|| format!("Case {}", i));

            let mut first_ts: Option<i64> = None;
            let mut last_ts: Option<i64> = None;
            for ev in &trace.events {
                if let Some(ts) = ev
                    .attributes
                    .get_by_key("time:timestamp")
                    .and_then(|a| match &a.value {
                        AttributeValue::Date(d) => Some(d.timestamp_millis()),
                        _ => None,
                    })
                {
                    first_ts = Some(first_ts.map_or(ts, |f: i64| f.min(ts)));
                    last_ts = Some(last_ts.map_or(ts, |l: i64| l.max(ts)));
                }
            }

            let duration_ms = match (first_ts, last_ts) {
                (Some(f), Some(l)) if l > f => Some((l - f) as f64),
                _ => None,
            };

            TraceBrowserRow {
                case_index: i,
                case_id,
                num_events: trace.events.len(),
                start_time: first_ts.map(|ms| {
                    DateTime::from_timestamp_millis(ms)
                        .map(|d| d.fixed_offset().to_rfc3339())
                        .unwrap_or_default()
                }),
                end_time: last_ts.map(|ms| {
                    DateTime::from_timestamp_millis(ms)
                        .map(|d| d.fixed_offset().to_rfc3339())
                        .unwrap_or_default()
                }),
                duration_ms,
            }
        })
        .collect();

    if !filter.is_empty() {
        let lower = filter.to_lowercase();
        rows.retain(|r| r.case_id.to_lowercase().contains(&lower));
    }

    match sort_field {
        TraceSortField::CaseId => rows.sort_by(|a, b| a.case_id.cmp(&b.case_id)),
        TraceSortField::NumEvents => rows.sort_by_key(|a| a.num_events),
        TraceSortField::StartTime => rows.sort_by(|a, b| a.start_time.cmp(&b.start_time)),
        TraceSortField::Duration => rows.sort_by(|a, b| {
            a.duration_ms
                .partial_cmp(&b.duration_ms)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
    }
    if !sort_asc {
        rows.reverse();
    }

    let total = rows.len();
    let start = offset.min(total);
    let end = (start + limit).min(total);
    let page = rows[start..end].to_vec();

    TraceBrowserPage { rows: page, total }
}

/// Events and case-level attributes for a single trace.
///
/// On an out-of-bounds `case_index` returns an empty `TraceDetail`; the registry binding is
/// infallible, so we yield empty rather than panic.
#[register_binding]
pub fn get_trace_events(event_log: &EventLog, case_index: usize) -> TraceDetail {
    let Some(trace) = event_log.traces.get(case_index) else {
        return TraceDetail {
            case_attributes: HashMap::new(),
            events: Vec::new(),
        };
    };

    let case_attributes: HashMap<String, String> = trace
        .attributes
        .iter()
        .filter(|a| a.key != "concept:name")
        .map(|a| (a.key.clone(), a.value.to_string()))
        .collect();

    let events: Vec<TraceEventRow> = trace
        .events
        .iter()
        .map(|e| {
            let activity = get_event_activity(e).unwrap_or("UNKNOWN").to_string();
            let timestamp = e
                .attributes
                .get_by_key("time:timestamp")
                .and_then(|a| a.value.try_as_date())
                .map(|d| d.to_rfc3339());
            let attributes: HashMap<String, String> = e
                .attributes
                .iter()
                .filter(|a| a.key != "concept:name" && a.key != "time:timestamp")
                .map(|a| (a.key.clone(), a.value.to_string()))
                .collect();
            TraceEventRow {
                activity,
                timestamp,
                attributes,
            }
        })
        .collect();

    TraceDetail {
        case_attributes,
        events,
    }
}
