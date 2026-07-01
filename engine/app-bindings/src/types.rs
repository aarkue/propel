//! Shared result/argument structs for the event-log and OCEL analysis bindings.
//!
//! These derive `serde` + `schemars::JsonSchema` for the registry.
use std::collections::HashMap;

use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NumberOfTracesAndEvents {
    pub num_traces: usize,
    pub num_events: usize,
}

/// Activity-trace variants (sorted by frequency).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TraceVariants {
    pub activities: Vec<String>,
    pub act_to_index: HashMap<String, usize>,
    pub traces: Vec<(Vec<usize>, u64)>,
}

impl From<EventLogActivityProjection> for TraceVariants {
    fn from(value: EventLogActivityProjection) -> Self {
        Self {
            activities: value.activities,
            act_to_index: value.act_to_index,
            traces: value.traces,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CaseDurations {
    pub num_cases: usize,
    pub num_empty_cases: usize,
    pub min_ms: i64,
    pub max_ms: i64,
    pub mean_ms: f64,
    pub median_ms: i64,
    pub p90_ms: i64,
    pub p95_ms: i64,
    pub p99_ms: i64,
    pub hist_bin_edges_ms: Vec<f64>,
    pub hist_counts: Vec<usize>,
    pub ecdf_x_ms: Vec<i64>,
    pub ecdf_y: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogExtensionInfo {
    pub name: String,
    pub prefix: String,
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogClassifierInfo {
    pub name: String,
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogGlobals {
    /// Log-level free-form attributes.
    pub attributes: HashMap<String, String>,
    pub extensions: Vec<LogExtensionInfo>,
    pub classifiers: Vec<LogClassifierInfo>,
    /// Global trace-level attribute defaults (XES 2.0).
    pub global_trace_attrs: HashMap<String, String>,
    /// Global event-level attribute defaults (XES 2.0).
    pub global_event_attrs: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum AttributeLevel {
    Event,
    Case,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum AttributeKind {
    Numeric,
    Categorical,
    Date,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AttributeInfo {
    pub name: String,
    pub level: AttributeLevel,
    pub kind: AttributeKind,
    pub unique_count: usize,
    pub total_count: usize,
    pub missing_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NumericStats {
    pub min: f64,
    pub max: f64,
    pub mean: f64,
    pub median: f64,
    pub stddev: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AttributeSummary {
    pub name: String,
    pub level: AttributeLevel,
    pub kind: AttributeKind,
    pub total: usize,
    pub missing: usize,
    /// For categorical: top values and their counts (sorted desc)
    pub top_values: Vec<(String, usize)>,
    /// For numeric: histogram bin edges
    pub hist_bin_edges: Vec<f64>,
    /// For numeric: histogram counts
    pub hist_counts: Vec<usize>,
    /// For numeric: basic stats
    pub numeric_stats: Option<NumericStats>,
}

/// Where an attribute lives in a dataset.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum AttributeScope {
    LogGlobal,
    Event { activity: Option<String> },
    Object { object_type: Option<String> },
}

/// One entry in the attribute catalog returned by `get_removable_attributes_xes`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AttributeCatalogEntry {
    pub scope: AttributeScope,
    pub key: String,
    /// None for OCEL (declared attributes, no scan); Some for XES.
    pub occurrence_count: Option<usize>,
    /// Up to 5 distinct sample values. Empty for OCEL.
    pub sample_values: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TraceBrowserRow {
    pub case_index: usize,
    pub case_id: String,
    pub num_events: usize,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TraceBrowserPage {
    pub rows: Vec<TraceBrowserRow>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum TraceSortField {
    CaseId,
    NumEvents,
    StartTime,
    Duration,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TraceEventRow {
    pub activity: String,
    pub timestamp: Option<String>,
    pub attributes: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TraceDetail {
    /// Trace-level attributes, excluding `concept:name`.
    pub case_attributes: HashMap<String, String>,
    pub events: Vec<TraceEventRow>,
}

// ---- OCEL (object-centric) result/argument structs ----

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OCELInfo {
    pub num_objects: usize,
    pub num_events: usize,
    pub event_types: Vec<String>,
    pub object_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OCELObjectAttributeChanges {
    pub traces: HashMap<String, Vec<(String, String)>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectBrowserRow {
    pub object_id: String,
    pub object_type: String,
    pub num_events: usize,
    pub first_time: Option<String>,
    pub last_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectBrowserPage {
    pub rows: Vec<ObjectBrowserRow>,
    pub total: usize,
    pub object_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum ObjectSortField {
    ObjectId,
    ObjectType,
    NumEvents,
    FirstTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectEventRow {
    pub event_id: String,
    pub event_type: String,
    pub timestamp: String,
    /// (object_id, object_type)
    pub other_objects: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectDetail {
    pub object_id: String,
    pub object_type: String,
    pub events: Vec<ObjectEventRow>,
    /// (object_id, object_type) via O2O
    pub related_objects: Vec<(String, String)>,
    pub attributes: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum OcelAttributeLevel {
    Event,
    Object { object_type: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelAttributeInfo {
    pub name: String,
    pub level: OcelAttributeLevel,
    pub kind: AttributeKind,
    pub unique_count: usize,
    pub total_count: usize,
    pub missing_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelAttributeSummary {
    pub name: String,
    pub level: OcelAttributeLevel,
    pub kind: AttributeKind,
    pub total: usize,
    pub missing: usize,
    pub top_values: Vec<(String, usize)>,
    pub hist_bin_edges: Vec<f64>,
    pub hist_counts: Vec<usize>,
    pub numeric_stats: Option<NumericStats>,
}

/// Per-arc duration statistics.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DfArcDuration {
    pub source: String,
    pub target: String,
    pub count: usize,
    pub min_ms: f64,
    pub max_ms: f64,
    pub mean_ms: f64,
    pub median_ms: f64,
    pub p90_ms: f64,
}

/// Per-object-type DF performance statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct OcelDfPerformance {
    pub arcs_per_object_type: HashMap<String, Vec<DfArcDuration>>,
}

/// Case-centric DF performance statistics (one entry per directly-follows arc).
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct DfPerformance {
    pub arcs: Vec<DfArcDuration>,
}

/// Min/max number of objects of a type involved with an activity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ObjectInvolvementCounts {
    pub min: usize,
    pub max: usize,
}
