//! Why an OC-DECLARE constraint is violated: which source events violate it, how (too few or too
//! many target events), what happened instead, when, and with which objects. Also the activity and
//! edge statistics the OC-DECLARE editor shows (as in OCPQ).

use std::collections::{BTreeMap, HashMap, HashSet};

use process_mining::bindings::register_binding;
use process_mining::conformance::object_centric::oc_declare::target_events_for_binding;
use process_mining::core::chrono::{DateTime, FixedOffset};
use process_mining::core::event_data::object_centric::linked_ocel::e2o_rev_type_index::E2ORevByTypeIndex;
use process_mining::core::event_data::object_centric::linked_ocel::slim_linked_ocel::ObjectIndex;
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::core::process_models::object_centric::oc_declare::{
    EventOrSynthetic, OCDeclareArc, OCDeclareArcType, SetFilter, EXIT_EVENT_PREFIX,
    INIT_EVENT_PREFIX,
};
use process_mining::{Cancelled, Control};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Target counts above this are reported as this value: enough to tell "too many" apart.
const COUNT_CAP: usize = 50;
const TIME_BINS: usize = 40;
const TOP_OBJECTS: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    TooFew,
    TooMany,
}

/// One violating source event, with the first of its bindings that violates the constraint.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ArcViolation {
    /// The event id, or `<init> <object id>` / `<exit> <object id>` for a lifecycle event
    pub source: String,
    pub time_ms: i64,
    pub kind: ViolationKind,
    /// Matching target events the binding has (capped at 50)
    pub found: usize,
    /// `(object type, object id)` of the binding's objects
    pub objects: Vec<(String, String)>,
    /// For too few: the activity the binding's objects did next (before, for EP/DP) instead
    pub instead: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FoundBucket {
    /// Target events found for a binding (50 means 50 or more)
    pub found: usize,
    pub bindings: usize,
    /// Whether this count violates the constraint
    pub violating: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ViolationTimeBin {
    pub start_ms: i64,
    pub sources: usize,
    pub violations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CountedName {
    pub name: String,
    pub violations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ViolatingObject {
    pub object_type: String,
    pub id: String,
    pub violations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ArcViolations {
    /// Source events (with lifecycle events for `<init>`/`<exit>` sources)
    pub sources: usize,
    pub violating_sources: usize,
    pub too_few: usize,
    pub too_many: usize,
    pub bindings: usize,
    pub violating_bindings: usize,
    /// How many target events bindings have, fewest first
    pub found_histogram: Vec<FoundBucket>,
    pub over_time: Vec<ViolationTimeBin>,
    pub bin_width_ms: i64,
    /// For too few: what the objects did instead, most frequent first
    pub instead: Vec<CountedName>,
    /// Object types of the violating bindings' objects, most frequent first
    pub by_object_type: Vec<CountedName>,
    /// Objects in the most violations
    pub top_objects: Vec<ViolatingObject>,
    /// The violations, by time, at most `max_examples`
    pub examples: Vec<ArcViolation>,
}

fn source_name(ev: &EventOrSynthetic, ocel: &SlimLinkedOCEL) -> String {
    match ev {
        EventOrSynthetic::Event(e) => ocel.get_ev_id(e).to_string(),
        EventOrSynthetic::Init(o) => format!("{INIT_EVENT_PREFIX} {}", ocel.get_ob_id(o)),
        EventOrSynthetic::Exit(o) => format!("{EXIT_EVENT_PREFIX} {}", ocel.get_ob_id(o)),
    }
}

fn binding_objects<'a>(binding: &[SetFilter<&'a ObjectIndex>]) -> Vec<&'a ObjectIndex> {
    let mut out: Vec<&ObjectIndex> = binding
        .iter()
        .flat_map(|f| match f {
            SetFilter::Any(v) | SetFilter::All(v) => v.iter().copied(),
        })
        .collect();
    out.sort();
    out.dedup();
    out
}

/// The event of the binding's objects directly after (or before) `time`, as the library's DF/DP
/// check finds it.
fn adjacent_event(
    binding: &[SetFilter<&ObjectIndex>],
    ocel: &SlimLinkedOCEL,
    time: &DateTime<FixedOffset>,
    following: bool,
) -> Option<EventOrSynthetic> {
    let in_direction = |e: &EventOrSynthetic| {
        let t = e.get_timestamp(ocel);
        if following {
            t > *time
        } else {
            t < *time
        }
    };
    let candidates: Vec<EventOrSynthetic> = match binding.first() {
        None => ocel.get_all_evs().map(EventOrSynthetic::Event).collect(),
        Some(SetFilter::Any(items)) | Some(SetFilter::All(items)) if !items.is_empty() => {
            let items: Vec<ObjectIndex> = match &binding[0] {
                SetFilter::Any(v) => v.iter().map(|o| **o).collect(),
                SetFilter::All(v) => vec![*v[0]],
            };
            items
                .into_iter()
                .flat_map(|o| EventOrSynthetic::get_all_for_ob(ocel, o))
                .collect()
        }
        Some(_) => ocel.get_all_evs().map(EventOrSynthetic::Event).collect(),
    };
    let matching = candidates
        .into_iter()
        .filter(in_direction)
        .filter(|e| binding.iter().all(|f| f.check(&e.get_e2o_set(ocel))));
    if following {
        matching.min_by_key(|e| e.get_timestamp(ocel))
    } else {
        matching.max_by_key(|e| e.get_timestamp(ocel))
    }
}

struct BindingResult {
    found: usize,
    violated: bool,
    instead: Option<String>,
}

fn check_binding(
    arc: &OCDeclareArc,
    binding: &[SetFilter<&ObjectIndex>],
    source: &EventOrSynthetic,
    ocel: &SlimLinkedOCEL,
    index: &E2ORevByTypeIndex,
) -> BindingResult {
    let time = source.get_timestamp(ocel);
    let (min, max) = (arc.counts.0.unwrap_or(0), arc.counts.1);
    let to = arc.to.as_str();
    // Count far enough to judge both bounds, then report at most `COUNT_CAP`.
    let enough = COUNT_CAP.max(min).max(max.map_or(0, |m| m + 1));
    let counted = match arc.arc_type {
        OCDeclareArcType::AS | OCDeclareArcType::EF | OCDeclareArcType::EP => {
            target_events_for_binding(binding, ocel, to, index.for_ev_type(to))
                .filter(|e| {
                    let t = e.get_timestamp(ocel);
                    match arc.arc_type {
                        OCDeclareArcType::EF => time < t,
                        OCDeclareArcType::EP => time > t,
                        _ => true,
                    }
                })
                .take(enough)
                .count()
        }
        OCDeclareArcType::DF | OCDeclareArcType::DP => {
            let next = adjacent_event(binding, ocel, &time, arc.arc_type == OCDeclareArcType::DF);
            usize::from(next.is_some_and(|e| e.get_as_event_type(ocel) == to))
        }
    };
    let violated = counted < min || max.is_some_and(|m| counted > m);
    let found = counted.min(COUNT_CAP);
    let instead = (violated && counted < min).then(|| {
        let following = !matches!(arc.arc_type, OCDeclareArcType::EP | OCDeclareArcType::DP);
        adjacent_event(binding, ocel, &time, following)
            .map(|e| e.get_as_event_type(ocel))
            .unwrap_or_else(|| "(nothing)".to_string())
    });
    BindingResult {
        found,
        violated,
        instead,
    }
}

fn ranked(counts: HashMap<String, usize>) -> Vec<CountedName> {
    let mut v: Vec<CountedName> = counts
        .into_iter()
        .map(|(name, violations)| CountedName { name, violations })
        .collect();
    v.sort_by(|a, b| {
        b.violations
            .cmp(&a.violations)
            .then_with(|| a.name.cmp(&b.name))
    });
    v
}

/// The violations of one OC-DECLARE constraint in an OCEL, summarized and with up to
/// `max_examples` (default 500) violating source events.
#[register_binding(stringify_error)]
pub fn oc_declare_violations(
    ocel: &SlimLinkedOCEL,
    arc: OCDeclareArc,
    #[bind(default)] max_examples: Option<usize>,
    #[bind(ctx)] ctl: &Control<'_>,
) -> Result<ArcViolations, Cancelled> {
    let max_examples = max_examples.unwrap_or(500);
    let index = E2ORevByTypeIndex::build(ocel);
    let mut sources = EventOrSynthetic::get_all_syn_evs(ocel, arc.from.as_str());
    // By time, so the kept examples are the earliest violations (synthetic `<init>`/`<exit>`
    // sources come in object order).
    sources.sort_by_cached_key(|s| s.get_timestamp(ocel));
    let counter = ctl.counter("Checking the constraint", Some(sources.len() as u64));
    let mut found_hist: BTreeMap<usize, (usize, bool)> = BTreeMap::new();
    let mut instead: HashMap<String, usize> = HashMap::new();
    let mut by_type: HashMap<String, usize> = HashMap::new();
    let mut by_object: HashMap<ObjectIndex, usize> = HashMap::new();
    let (mut bindings, mut violating_bindings, mut too_few, mut too_many) = (0, 0, 0, 0);
    let mut timed: Vec<(i64, bool)> = Vec::with_capacity(sources.len());
    let mut examples = Vec::new();

    for source in &sources {
        ctl.check()?;
        counter.tick();
        let time = source.get_timestamp(ocel);
        let mut first: Option<(BindingResult, Vec<&ObjectIndex>)> = None;
        for binding in arc.label.get_bindings(source, ocel) {
            let r = check_binding(&arc, &binding, source, ocel, &index);
            bindings += 1;
            let entry = found_hist.entry(r.found).or_insert((0, r.violated));
            entry.0 += 1;
            if r.violated {
                violating_bindings += 1;
                if first.is_none() {
                    first = Some((r, binding_objects(&binding)));
                }
            }
        }
        timed.push((time.timestamp_millis(), first.is_some()));
        let Some((r, objects)) = first else {
            continue;
        };
        // Only a binding with too few targets names what happened instead.
        let kind = if r.instead.is_some() {
            too_few += 1;
            ViolationKind::TooFew
        } else {
            too_many += 1;
            ViolationKind::TooMany
        };
        if let Some(i) = &r.instead {
            *instead.entry(i.clone()).or_default() += 1;
        }
        let types: HashSet<&str> = objects.iter().map(|o| ocel.get_ob_type_of(*o)).collect();
        for t in types {
            *by_type.entry(t.to_string()).or_default() += 1;
        }
        for o in &objects {
            *by_object.entry(**o).or_default() += 1;
        }
        if examples.len() < max_examples {
            examples.push(ArcViolation {
                source: source_name(source, ocel),
                time_ms: time.timestamp_millis(),
                kind,
                found: r.found,
                objects: objects
                    .iter()
                    .map(|o| {
                        (
                            ocel.get_ob_type_of(*o).to_string(),
                            ocel.get_ob_id(*o).to_string(),
                        )
                    })
                    .collect(),
                instead: r.instead,
            });
        }
    }
    examples.sort_by_key(|e| e.time_ms);

    let (lo, hi) = timed.iter().fold((i64::MAX, i64::MIN), |(a, b), (t, _)| {
        (a.min(*t), b.max(*t))
    });
    let (over_time, bin_width_ms) = if lo > hi {
        (Vec::new(), 1)
    } else {
        let width = ((hi - lo) / TIME_BINS as i64 + 1).max(1);
        let mut bins: Vec<ViolationTimeBin> = (0..TIME_BINS as i64)
            .map(|i| ViolationTimeBin {
                start_ms: lo + i * width,
                sources: 0,
                violations: 0,
            })
            .collect();
        for (t, v) in &timed {
            let b = &mut bins[(((t - lo) / width) as usize).min(TIME_BINS - 1)];
            b.sources += 1;
            b.violations += usize::from(*v);
        }
        (bins, width)
    };

    let mut top_objects: Vec<ViolatingObject> = by_object
        .into_iter()
        .map(|(o, violations)| ViolatingObject {
            object_type: ocel.get_ob_type_of(o).to_string(),
            id: ocel.get_ob_id(o).to_string(),
            violations,
        })
        .collect();
    top_objects.sort_by(|a, b| {
        b.violations
            .cmp(&a.violations)
            .then_with(|| a.id.cmp(&b.id))
    });
    top_objects.truncate(TOP_OBJECTS);

    Ok(ArcViolations {
        sources: sources.len(),
        violating_sources: too_few + too_many,
        too_few,
        too_many,
        bindings,
        violating_bindings,
        found_histogram: found_hist
            .into_iter()
            .map(|(found, (bindings, violating))| FoundBucket {
                found,
                bindings,
                violating,
            })
            .collect(),
        over_time,
        bin_width_ms,
        instead: ranked(instead),
        by_object_type: ranked(by_type),
        top_objects,
        examples,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LaneEvent {
    pub id: String,
    pub activity: String,
    pub time_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectLane {
    pub object_type: String,
    pub id: String,
    /// By time
    pub events: Vec<LaneEvent>,
}

/// The events of each of the given objects (unknown ids are left out), for a violation's timeline.
#[register_binding]
pub fn oc_declare_object_lanes(ocel: &SlimLinkedOCEL, object_ids: Vec<String>) -> Vec<ObjectLane> {
    object_ids
        .iter()
        .filter_map(|id| {
            let ob = ocel.get_ob_by_id(id)?;
            let mut events: Vec<LaneEvent> = ocel
                .get_e2o_rev_evs(ob)
                .map(|ev| LaneEvent {
                    id: ocel.get_ev_id(ev).to_string(),
                    activity: ocel.get_ev_type_of(ev).to_string(),
                    time_ms: ocel.get_ev_time(ev).timestamp_millis(),
                })
                .collect();
            events.sort_by_key(|e| e.time_ms);
            Some(ObjectLane {
                object_type: ocel.get_ob_type_of(ob).to_string(),
                id: id.clone(),
                events,
            })
        })
        .collect()
}

/// How the events of an activity relate to object types (as in OCPQ's OC-DECLARE editor).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ActivityStatistics {
    /// Per object type, for each of its objects: how many events of the activity it has
    pub num_evs_per_ot_type: HashMap<String, Vec<usize>>,
    /// Per object type, for each event of the activity: how many objects of the type it has
    pub num_obs_of_ot_per_ev: HashMap<String, Vec<usize>>,
}

#[register_binding]
pub fn oc_declare_activity_statistics(
    ocel: &SlimLinkedOCEL,
    activity: String,
) -> ActivityStatistics {
    let synthetic = activity
        .strip_prefix(INIT_EVENT_PREFIX)
        .or_else(|| activity.strip_prefix(EXIT_EVENT_PREFIX))
        .and_then(|rest| rest.strip_prefix(' '));
    if let Some(ob_type) = synthetic {
        let ones = vec![1; ocel.get_obs_of_type(ob_type).count()];
        return ActivityStatistics {
            num_evs_per_ot_type: HashMap::from([(ob_type.to_string(), ones.clone())]),
            num_obs_of_ot_per_ev: HashMap::from([(ob_type.to_string(), ones)]),
        };
    }
    let mut per_event: HashMap<String, Vec<usize>> = HashMap::new();
    for ev in ocel.get_evs_of_type(&activity) {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        let mut seen = HashSet::new();
        for (_q, ob) in ocel.get_e2o(ev) {
            if seen.insert(*ob) {
                *counts.entry(ocel.get_ob_type_of(ob)).or_default() += 1;
            }
        }
        for (t, n) in counts {
            per_event.entry(t.to_string()).or_default().push(n);
        }
    }
    let per_object = per_event
        .keys()
        .map(|t| {
            let counts = ocel
                .get_obs_of_type(t)
                .map(|o| {
                    ocel.get_e2o_rev_evs(o)
                        .filter(|e| ocel.get_ev_type_of(*e) == activity)
                        .count()
                })
                .collect();
            (t.clone(), counts)
        })
        .collect();
    ActivityStatistics {
        num_evs_per_ot_type: per_object,
        num_obs_of_ot_per_ev: per_event,
    }
}

/// Durations from source events to their closest target event (the first after, or for EP/DP the
/// last before), binned for a histogram.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct BinnedEdgeDurationStats {
    pub bin_centers_ms: Vec<f64>,
    /// Share of all durations per bin, in percent
    pub percentages: Vec<f64>,
    pub bin_labels: Vec<String>,
    pub total_count: usize,
    pub min_ms: f64,
    pub max_ms: f64,
}

#[register_binding(stringify_error)]
pub fn oc_declare_edge_statistics(
    ocel: &SlimLinkedOCEL,
    arc: OCDeclareArc,
    #[bind(ctx)] ctl: &Control<'_>,
) -> Result<BinnedEdgeDurationStats, Cancelled> {
    let index = E2ORevByTypeIndex::build(ocel);
    let to = arc.to.as_str();
    // Before the source, the closest target is the latest one.
    let looks_back = matches!(arc.arc_type, OCDeclareArcType::EP | OCDeclareArcType::DP);
    let sources = EventOrSynthetic::get_all_syn_evs(ocel, arc.from.as_str());
    let counter = ctl.counter(
        "Measuring the constraint's durations",
        Some(sources.len() as u64),
    );
    let mut durations: Vec<i64> = Vec::new();
    for source in &sources {
        ctl.check()?;
        counter.tick();
        let time = source.get_timestamp(ocel);
        durations.extend(arc.label.get_bindings(source, ocel).filter_map(|binding| {
            target_events_for_binding(&binding, ocel, to, index.for_ev_type(to))
                .filter(|e| {
                    let t = e.get_timestamp(ocel);
                    match arc.arc_type {
                        OCDeclareArcType::EF | OCDeclareArcType::DF => time < t,
                        OCDeclareArcType::EP | OCDeclareArcType::DP => time > t,
                        OCDeclareArcType::AS => true,
                    }
                })
                .map(|e| e.get_timestamp(ocel))
                .reduce(|a, b| if looks_back { a.max(b) } else { a.min(b) })
                .map(|t| (t - time).num_milliseconds())
        }));
    }
    Ok(bin_durations(&durations))
}

/// Equal bins of a "nice" width (1, 2 or 5 times a power of ten), about 25 of them.
fn bin_durations(durations: &[i64]) -> BinnedEdgeDurationStats {
    let total_count = durations.len();
    let empty = |min_ms: f64, max_ms: f64| BinnedEdgeDurationStats {
        bin_centers_ms: Vec::new(),
        percentages: Vec::new(),
        bin_labels: Vec::new(),
        total_count,
        min_ms,
        max_ms,
    };
    let (Some(&min), Some(&max)) = (durations.iter().min(), durations.iter().max()) else {
        return empty(0.0, 0.0);
    };
    let (min_ms, max_ms) = (min as f64, max as f64);
    if min == max {
        return BinnedEdgeDurationStats {
            bin_centers_ms: vec![min_ms],
            percentages: vec![100.0],
            bin_labels: vec![format!("[{min_ms}, {max_ms}]")],
            ..empty(min_ms, max_ms)
        };
    }
    let rough = (max_ms - min_ms) / 25.0;
    let exponent = rough.log10().floor();
    let power = 10f64.powf(exponent);
    let mantissa = rough / power;
    let nice = if mantissa < 1.5 {
        1.0
    } else if mantissa < 3.0 {
        2.0
    } else if mantissa < 7.0 {
        5.0
    } else {
        10.0
    };
    let size = nice * power;
    let start = (min_ms / size).floor() * size;
    let count = (((max_ms / size).ceil() * size - start) / size)
        .round()
        .max(1.0) as usize;
    let mut bins = vec![0usize; count];
    for &d in durations {
        bins[(((d as f64 - start) / size).floor() as usize).min(count - 1)] += 1;
    }
    let precision = (-exponent).max(0.0) as usize;
    let mut out = empty(min_ms, max_ms);
    for (i, &n) in bins.iter().enumerate().filter(|(_, n)| **n > 0) {
        let lo = start + i as f64 * size;
        out.bin_centers_ms.push(lo + size / 2.0);
        out.percentages.push(n as f64 / total_count as f64 * 100.0);
        out.bin_labels
            .push(format!("[{lo:.precision$}, {:.precision$})", lo + size));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::{Importable, OCEL};

    // o1: place, pack. o2: place, never packed. o3: place, pack, pack.
    const OCEL_JSON: &str = r#"{
  "eventTypes": [{"name": "place", "attributes": []}, {"name": "pack", "attributes": []}, {"name": "cancel", "attributes": []}],
  "objectTypes": [{"name": "order", "attributes": []}],
  "events": [
    {"id": "p1", "type": "place", "time": "2024-01-01T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}]},
    {"id": "k1", "type": "pack", "time": "2024-01-02T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}]},
    {"id": "p2", "type": "place", "time": "2024-01-03T00:00:00Z", "relationships": [{"objectId": "o2", "qualifier": ""}]},
    {"id": "c2", "type": "cancel", "time": "2024-01-04T00:00:00Z", "relationships": [{"objectId": "o2", "qualifier": ""}]},
    {"id": "p3", "type": "place", "time": "2024-01-05T00:00:00Z", "relationships": [{"objectId": "o3", "qualifier": ""}]},
    {"id": "k3", "type": "pack", "time": "2024-01-06T00:00:00Z", "relationships": [{"objectId": "o3", "qualifier": ""}]},
    {"id": "k4", "type": "pack", "time": "2024-01-08T00:00:00Z", "relationships": [{"objectId": "o3", "qualifier": ""}]}
  ],
  "objects": [{"id": "o1", "type": "order"}, {"id": "o2", "type": "order"}, {"id": "o3", "type": "order"}]
}"#;

    fn ocel() -> SlimLinkedOCEL {
        SlimLinkedOCEL::from_ocel(OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap())
    }

    fn arc(arc_type: &str, counts: (Option<usize>, Option<usize>)) -> OCDeclareArc {
        serde_json::from_value(serde_json::json!({
            "from": "place",
            "to": "pack",
            "arc_type": arc_type,
            "label": {"each": [{"type": "Simple", "object_type": "order"}], "any": [], "all": []},
            "counts": [counts.0, counts.1],
        }))
        .unwrap()
    }

    #[test]
    fn explains_too_few_and_too_many() {
        let v = oc_declare_violations(
            &ocel(),
            arc("EF", (Some(1), Some(1))),
            None,
            &Control::new(),
        )
        .unwrap();
        assert_eq!((v.sources, v.violating_sources), (3, 2));
        assert_eq!((v.too_few, v.too_many), (1, 1));
        let few = v
            .examples
            .iter()
            .find(|e| e.kind == ViolationKind::TooFew)
            .unwrap();
        assert_eq!(few.source, "p2");
        assert_eq!(few.instead.as_deref(), Some("cancel"));
        assert_eq!(few.objects, vec![("order".to_string(), "o2".to_string())]);
        let many = v
            .examples
            .iter()
            .find(|e| e.kind == ViolationKind::TooMany)
            .unwrap();
        assert_eq!(many.found, 2);
        assert_eq!(v.instead[0].name, "cancel");
        let buckets: Vec<(usize, bool)> = v
            .found_histogram
            .iter()
            .map(|b| (b.found, b.violating))
            .collect();
        assert_eq!(buckets, vec![(0, true), (1, false), (2, true)]);
        assert_eq!(v.over_time.iter().map(|b| b.violations).sum::<usize>(), 2);
    }

    #[test]
    fn agrees_with_the_library_on_violation_fraction() {
        let ocel = ocel();
        for (t, c) in [
            ("EF", (Some(1), None)),
            ("DF", (Some(1), Some(1))),
            ("AS", (None, Some(1))),
        ] {
            let a = arc(t, c);
            let v = oc_declare_violations(&ocel, a.clone(), None, &Control::new()).unwrap();
            let expected = a.violation_fraction(&ocel);
            assert_eq!(
                v.violating_sources as f64 / v.sources as f64,
                expected,
                "{t}"
            );
        }
    }

    #[test]
    fn stops_when_cancelled() {
        let flag = std::sync::atomic::AtomicBool::new(true);
        let ctl = Control::new().cancel_flag(&flag);
        let a = arc("EF", (Some(1), None));
        assert!(oc_declare_violations(&ocel(), a.clone(), None, &ctl).is_err());
        assert!(oc_declare_edge_statistics(&ocel(), a, &ctl).is_err());
    }

    #[test]
    fn statistics_match_the_log() {
        let ocel = ocel();
        let s = oc_declare_activity_statistics(&ocel, "pack".into());
        let mut per_object = s.num_evs_per_ot_type["order"].clone();
        per_object.sort();
        assert_eq!(per_object, vec![0, 1, 2]);
        assert_eq!(s.num_obs_of_ot_per_ev["order"], vec![1, 1, 1]);
        let lanes = oc_declare_object_lanes(&ocel, vec!["o3".into(), "nope".into()]);
        assert_eq!(lanes.len(), 1);
        assert_eq!(
            lanes[0]
                .events
                .iter()
                .map(|e| e.id.as_str())
                .collect::<Vec<_>>(),
            vec!["p3", "k3", "k4"]
        );
        let e =
            oc_declare_edge_statistics(&ocel, arc("EF", (Some(1), None)), &Control::new()).unwrap();
        assert_eq!(e.total_count, 2);
        assert_eq!(e.min_ms, 86_400_000.0);
    }
}
