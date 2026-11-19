//! Whole-log views of an OCEL: which object types events carry, how many objects are alive over
//! time, and what looks wrong in the data.

use std::collections::{BTreeMap, HashMap, HashSet};

use process_mining::bindings::register_binding;
use process_mining::core::event_data::object_centric::linked_ocel::slim_linked_ocel::{
    EventIndex, ObjectIndex,
};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::core::event_data::object_centric::{
    OCELAttributeType, OCELAttributeValue, OCELType,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::repairs::{EventDefect, Repair};

/// Most signatures listed per event type; the rest are summed into `other_events`.
const MAX_SIGNATURES: usize = 8;
const MAX_EXAMPLES: usize = 5;

/// How many objects of one type the events of a signature are related to.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct SignatureObjects {
    pub object_type: String,
    pub min: usize,
    pub max: usize,
    pub mean: f64,
}

/// Events of one event type that are related to exactly the same set of object types.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct EventSignature {
    /// One entry per object type, sorted by object type
    pub objects: Vec<SignatureObjects>,
    pub events: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EventTypeSignatures {
    pub event_type: String,
    pub events: usize,
    /// Most frequent first
    pub signatures: Vec<EventSignature>,
    /// Events whose signature is not among `signatures`
    pub other_events: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EventSignatures {
    /// Most events first
    pub event_types: Vec<EventTypeSignatures>,
    /// Every object type that occurs in a signature, sorted, for a stable color order
    pub object_types: Vec<String>,
}

/// Distinct related objects per object type of one event, sorted by object type.
fn objects_per_type<'a>(ocel: &'a SlimLinkedOCEL, ev: &EventIndex) -> BTreeMap<&'a str, usize> {
    let mut seen: HashSet<ObjectIndex> = HashSet::new();
    let mut per_type: BTreeMap<&str, usize> = BTreeMap::new();
    for (_q, ob) in ocel.get_e2o(ev) {
        if seen.insert(*ob) {
            *per_type.entry(ocel.get_ob_type_of(ob)).or_default() += 1;
        }
    }
    per_type
}

#[derive(Default)]
struct SignatureStats<'a> {
    events: usize,
    /// Per object type: (min, max, sum)
    counts: BTreeMap<&'a str, (usize, usize, usize)>,
}

fn signatures_of_type(ocel: &SlimLinkedOCEL, event_type: &str) -> EventTypeSignatures {
    let mut by_types: HashMap<Vec<&str>, SignatureStats> = HashMap::new();
    let mut events = 0;
    for ev in ocel.get_evs_of_type(event_type) {
        events += 1;
        let per_type = objects_per_type(ocel, ev);
        let stats = by_types
            .entry(per_type.keys().copied().collect())
            .or_default();
        stats.events += 1;
        for (t, n) in per_type {
            let c = stats.counts.entry(t).or_insert((usize::MAX, 0, 0));
            *c = (c.0.min(n), c.1.max(n), c.2 + n);
        }
    }
    let mut signatures: Vec<EventSignature> = by_types
        .into_values()
        .map(|s| EventSignature {
            objects: s
                .counts
                .into_iter()
                .map(|(t, (min, max, sum))| SignatureObjects {
                    object_type: t.to_string(),
                    min,
                    max,
                    mean: sum as f64 / s.events as f64,
                })
                .collect(),
            events: s.events,
        })
        .collect();
    signatures.sort_by(|a, b| {
        b.events.cmp(&a.events).then_with(|| {
            let types = |s: &EventSignature| -> Vec<String> {
                s.objects.iter().map(|o| o.object_type.clone()).collect()
            };
            types(a).cmp(&types(b))
        })
    });
    let other_events = signatures
        .iter()
        .skip(MAX_SIGNATURES)
        .map(|s| s.events)
        .sum();
    signatures.truncate(MAX_SIGNATURES);
    EventTypeSignatures {
        event_type: event_type.to_string(),
        events,
        signatures,
        other_events,
    }
}

/// For each event type, the sets of object types its events are related to, with how many
/// objects of each type (e.g., `confirm order`: 1 customer, 1 order, 1 to 12 items).
#[register_binding]
pub fn get_event_signatures(ocel: &SlimLinkedOCEL) -> EventSignatures {
    let mut event_types: Vec<EventTypeSignatures> = ocel
        .get_ev_types()
        .map(|et| signatures_of_type(ocel, et))
        .filter(|e| e.events > 0)
        .collect();
    event_types.sort_by(|a, b| {
        b.events
            .cmp(&a.events)
            .then_with(|| a.event_type.cmp(&b.event_type))
    });
    let mut object_types: Vec<String> = event_types
        .iter()
        .flat_map(|e| e.signatures.iter())
        .flat_map(|s| s.objects.iter().map(|o| o.object_type.clone()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    object_types.sort();
    EventSignatures {
        event_types,
        object_types,
    }
}

/// Per object type, how many objects are alive in each time bin. An object is alive from its
/// first to its last event.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectPopulation {
    /// Start of each bin in epoch milliseconds; bins are `bin_width_ms` wide
    pub bin_starts_ms: Vec<i64>,
    pub bin_width_ms: i64,
    /// Most objects first
    pub object_types: Vec<ObjectTypePopulation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ObjectTypePopulation {
    pub object_type: String,
    /// Objects of the type that have at least one event
    pub objects: usize,
    /// Objects of the type without any event, which have no lifetime
    pub objects_without_events: usize,
    /// Objects alive at some point in each bin
    pub alive: Vec<usize>,
    /// Objects whose first event falls in each bin
    pub started: Vec<usize>,
    /// Objects whose last event falls in each bin
    pub ended: Vec<usize>,
}

/// Live objects per type over time, in `num_bins` equal bins between the first and last event.
#[register_binding]
pub fn get_object_population(
    ocel: &SlimLinkedOCEL,
    #[bind(default)] num_bins: Option<usize>,
) -> ObjectPopulation {
    let num_bins = num_bins.unwrap_or(60).clamp(1, 1000);
    let times = ocel
        .get_all_evs()
        .map(|ev| ocel.get_ev_time(ev).timestamp_millis());
    let (min, max) = times.fold((i64::MAX, i64::MIN), |(lo, hi), t| (lo.min(t), hi.max(t)));
    if min > max {
        return ObjectPopulation {
            bin_starts_ms: Vec::new(),
            bin_width_ms: 1,
            object_types: Vec::new(),
        };
    }
    let width = ((max - min) / num_bins as i64 + 1).max(1);
    let bin_of = |t: i64| (((t - min) / width) as usize).min(num_bins - 1);

    let mut object_types: Vec<ObjectTypePopulation> = ocel
        .get_ob_types()
        .map(|ot| {
            let mut delta = vec![0i64; num_bins + 1];
            let mut started = vec![0; num_bins];
            let mut ended = vec![0; num_bins];
            let (mut objects, mut without) = (0, 0);
            for ob in ocel.get_obs_of_type(ot) {
                let span = ocel
                    .get_e2o_rev_evs(ob)
                    .map(|ev| ocel.get_ev_time(ev).timestamp_millis())
                    .fold(None, |acc: Option<(i64, i64)>, t| {
                        Some(acc.map_or((t, t), |(lo, hi)| (lo.min(t), hi.max(t))))
                    });
                let Some((first, last)) = span else {
                    without += 1;
                    continue;
                };
                objects += 1;
                let (a, b) = (bin_of(first), bin_of(last));
                delta[a] += 1;
                delta[b + 1] -= 1;
                started[a] += 1;
                ended[b] += 1;
            }
            let alive = delta[..num_bins]
                .iter()
                .scan(0i64, |acc, d| {
                    *acc += d;
                    Some(*acc as usize)
                })
                .collect();
            ObjectTypePopulation {
                object_type: ot.to_string(),
                objects,
                objects_without_events: without,
                alive,
                started,
                ended,
            }
        })
        .collect();
    object_types.sort_by(|a, b| {
        b.objects
            .cmp(&a.objects)
            .then_with(|| a.object_type.cmp(&b.object_type))
    });
    ObjectPopulation {
        bin_starts_ms: (0..num_bins as i64).map(|i| min + i * width).collect(),
        bin_width_ms: width,
        object_types,
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Worth a look before analyses that depend on it
    Warning,
    /// Characterizes the data rather than flagging a defect
    Info,
}

/// A way to repair what a check found, as repairs to apply in order.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HealthFix {
    pub id: String,
    pub label: String,
    /// What the fix changes, including what it removes
    pub description: String,
    /// The fix to pick unless there is a reason not to
    pub recommended: bool,
    pub repairs: Vec<Repair>,
}

impl HealthFix {
    pub(crate) fn new(
        id: &str,
        label: &str,
        description: &str,
        recommended: bool,
        repairs: Vec<Repair>,
    ) -> Self {
        HealthFix {
            id: id.to_string(),
            label: label.to_string(),
            description: description.to_string(),
            recommended,
            repairs,
        }
    }
}

/// One data-quality check over an OCEL. A check with `count` 0 passed.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct HealthFinding {
    /// Stable id of the check, e.g., `objects_without_events`
    pub check: String,
    pub title: String,
    /// The kind of issue and what it concerns, e.g., "Imprecise time" or "Missing object"
    pub category: String,
    /// What the check looks for and what it affects
    pub description: String,
    pub severity: Severity,
    pub count: usize,
    /// A few affected event ids, object ids, type names or attribute names
    pub examples: Vec<String>,
    /// Ways to repair it; empty when there is no deterministic repair
    pub fixes: Vec<HealthFix>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcelHealth {
    pub num_events: usize,
    pub num_objects: usize,
    /// Every check, failed ones (most severe first) before passed ones
    pub findings: Vec<HealthFinding>,
}

pub(crate) fn finding(
    check: &str,
    title: &str,
    category: &str,
    description: &str,
    severity: Severity,
    t: Tally,
    fixes: Vec<HealthFix>,
) -> HealthFinding {
    HealthFinding {
        check: check.to_string(),
        title: title.to_string(),
        category: category.to_string(),
        description: description.to_string(),
        severity,
        count: t.count,
        examples: t.examples,
        fixes: if t.count > 0 { fixes } else { Vec::new() },
    }
}

#[derive(Default)]
pub(crate) struct Tally {
    pub(crate) count: usize,
    examples: Vec<String>,
}

impl Tally {
    /// Counts one affected item; an example already listed is not repeated.
    pub(crate) fn add(&mut self, example: impl FnOnce() -> String) {
        self.count += 1;
        if self.examples.len() < MAX_EXAMPLES {
            let e = example();
            if !self.examples.contains(&e) {
                self.examples.push(e);
            }
        }
    }
}

fn declared(t: Option<&OCELType>) -> HashMap<&str, OCELAttributeType> {
    t.map(|t| {
        t.attributes
            .iter()
            .map(|a| {
                (
                    a.name.as_str(),
                    OCELAttributeType::from_type_str(&a.value_type),
                )
            })
            .collect()
    })
    .unwrap_or_default()
}

/// Checks one attribute value against its type's declaration. A linked OCEL declares every
/// attribute it holds (it adds missing declarations on load), so only the type can be off.
fn check_value(
    declared: &HashMap<&str, OCELAttributeType>,
    name: &str,
    value: &OCELAttributeValue,
    mismatched: &mut Tally,
    nulls: &mut Tally,
    whose: &dyn Fn() -> String,
) {
    match (declared.get(name), value) {
        (_, OCELAttributeValue::Null) => nulls.add(|| format!("{} of {}", name, whose())),
        (Some(t), v) if *t != v.get_type() => mismatched.add(|| {
            format!(
                "{} of {}: {} declared {}",
                name,
                whose(),
                v.get_type().as_type_str(),
                t.as_type_str()
            )
        }),
        _ => {}
    }
}

/// Data-quality checks: unlinked events and objects, unused types, placeholder timestamps,
/// ambiguous event order, and attribute values that do not match their declared type.
#[register_binding]
pub fn get_ocel_health(ocel: &SlimLinkedOCEL) -> OcelHealth {
    let mut objects_without_events = Tally::default();
    let mut events_without_objects = Tally::default();
    let mut unused_types = Tally::default();
    let mut epoch_times = Tally::default();
    let mut same_time = Tally::default();
    let mut self_relations = Tally::default();
    let mut mismatched = Tally::default();
    let mut nulls = Tally::default();

    for et in ocel.get_ev_types() {
        if ocel.get_evs_of_type(et).next().is_none() {
            unused_types.add(|| format!("event type {et}"));
        }
    }
    for ot in ocel.get_ob_types() {
        if ocel.get_obs_of_type(ot).next().is_none() {
            unused_types.add(|| format!("object type {ot}"));
        }
    }

    let ev_decls: HashMap<&str, HashMap<&str, OCELAttributeType>> = ocel
        .get_ev_types()
        .map(|et| (et, declared(ocel.get_ev_type(et))))
        .collect();
    for ev in ocel.get_all_evs() {
        let id = || ocel.get_ev_id(ev).to_string();
        if ocel.get_e2o(ev).next().is_none() {
            events_without_objects.add(id);
        }
        if ocel.get_ev_time(ev).timestamp_millis() == 0 {
            epoch_times.add(id);
        }
        let decl = &ev_decls[ocel.get_ev_type_of(ev)];
        for name in ocel.get_ev_attrs(ev) {
            if let Some(v) = ocel.get_ev_attr_val(ev, name) {
                check_value(decl, name, v, &mut mismatched, &mut nulls, &|| {
                    format!("event {}", ocel.get_ev_id(ev))
                });
            }
        }
    }

    let ob_decls: HashMap<&str, HashMap<&str, OCELAttributeType>> = ocel
        .get_ob_types()
        .map(|ot| (ot, declared(ocel.get_ob_type(ot))))
        .collect();
    for ob in ocel.get_all_obs() {
        let id = || ocel.get_ob_id(ob).to_string();
        let mut times: Vec<i64> = ocel
            .get_e2o_rev_evs(ob)
            .map(|ev| ocel.get_ev_time(ev).timestamp_millis())
            .collect();
        if times.is_empty() {
            objects_without_events.add(id);
        }
        times.sort_unstable();
        if times.windows(2).any(|w| w[0] == w[1]) {
            same_time.add(id);
        }
        if ocel.get_o2o(ob).any(|(_q, other)| *other == ob) {
            self_relations.add(id);
        }
        let decl = &ob_decls[ocel.get_ob_type_of(ob)];
        for name in ocel.get_ob_attrs(ob) {
            for (_t, v) in ocel.get_ob_attr_vals(ob, name) {
                check_value(decl, name, v, &mut mismatched, &mut nulls, &|| {
                    format!("object {}", ocel.get_ob_id(ob))
                });
            }
        }
    }

    let mut findings = vec![
        finding(
            "epoch_timestamps",
            "Events at 1970-01-01",
            "Incorrect time",
            "Events with the time 1970-01-01T00:00:00Z, usually a missing timestamp. Durations and time ranges that include them are wrong.",
            Severity::Warning,
            epoch_times,
            vec![HealthFix::new(
                "remove",
                "Remove these events",
                "Removes the events at 1970-01-01.",
                true,
                vec![Repair::RemoveEvents {
                    defect: EventDefect::EpochTime,
                }],
            )],
        ),
        finding(
            "events_without_objects",
            "Events without objects",
            "Missing relation",
            "Events related to no object. Object-centric views (OC-DFG, OCPN, flattening) leave them out.",
            Severity::Warning,
            events_without_objects,
            vec![HealthFix::new(
                "remove",
                "Remove these events",
                "Removes the events related to no object.",
                true,
                vec![Repair::RemoveEventsWithoutObjects],
            )],
        ),
        finding(
            "objects_without_events",
            "Objects without events",
            "Irrelevant object",
            "Objects that no event relates to. Master data, such as customers or products, often has no events.",
            Severity::Info,
            objects_without_events,
            vec![
                HealthFix::new(
                    "remove_unrelated",
                    "Remove those without relations",
                    "Removes these objects unless they have an O2O relation, so linked master data stays.",
                    true,
                    vec![Repair::RemoveObjectsWithoutEvents { keep_related: true }],
                ),
                HealthFix::new(
                    "remove_all",
                    "Remove all",
                    "Removes all objects without events, together with their O2O relations.",
                    false,
                    vec![Repair::RemoveObjectsWithoutEvents { keep_related: false }],
                ),
            ],
        ),
        finding(
            "type_mismatch",
            "Values of another type than declared",
            "Incorrect attribute value",
            "Attribute values that do not match the declared attribute type, e.g., text in a number attribute. Filters and statistics skip or misread them.",
            Severity::Warning,
            mismatched,
            Vec::new(),
        ),
        finding(
            "same_time_events",
            "Objects with simultaneous events",
            "Imprecise time",
            "Objects with two or more events at the same time. Their order in directly-follows relations is arbitrary.",
            Severity::Info,
            same_time,
            vec![HealthFix::new(
                "spread",
                "Spread equal times by 1 ms",
                "Adds 1 ms steps between events that share a timestamp, ordered by where their activity typically occurs in an object's lifecycle and then by event id.",
                true,
                vec![Repair::SpreadTies],
            )],
        ),
        finding(
            "null_values",
            "Empty attribute values",
            "Missing attribute value",
            "Attribute values that are null.",
            Severity::Info,
            nulls,
            Vec::new(),
        ),
        finding(
            "unused_types",
            "Types without instances",
            "Irrelevant type",
            "Declared event or object types that no event or object has.",
            Severity::Info,
            unused_types,
            vec![HealthFix::new(
                "remove",
                "Remove these types",
                "Removes the declarations of these types.",
                true,
                vec![Repair::RemoveUnusedTypes],
            )],
        ),
        finding(
            "self_relations",
            "Objects related to themselves",
            "Incorrect relation",
            "O2O relations from an object to itself.",
            Severity::Info,
            self_relations,
            vec![HealthFix::new(
                "remove",
                "Remove these relations",
                "Removes O2O relations from an object to itself.",
                true,
                vec![Repair::RemoveSelfRelations],
            )],
        ),
    ];
    // Stable: failed checks, warnings first, then passed ones, each in the order above.
    findings.sort_by_key(|f| (f.count == 0, f.severity));
    OcelHealth {
        num_events: ocel.get_num_evs(),
        num_objects: ocel.get_num_obs(),
        findings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;
    use process_mining::OCEL;

    const OCEL_JSON: &str = r#"{
  "eventTypes": [
    {"name": "place", "attributes": [{"name": "price", "type": "float"}]},
    {"name": "pack", "attributes": []},
    {"name": "never", "attributes": []}
  ],
  "objectTypes": [
    {"name": "order", "attributes": []},
    {"name": "item", "attributes": []}
  ],
  "events": [
    {"id": "e1", "type": "place", "time": "2024-01-01T00:00:00Z",
     "attributes": [{"name": "price", "value": "cheap"}, {"name": "note", "value": "x"}],
     "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": ""}, {"objectId": "i2", "qualifier": ""}]},
    {"id": "e2", "type": "pack", "time": "2024-01-10T00:00:00Z",
     "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": "a"}, {"objectId": "i1", "qualifier": "b"}]},
    {"id": "e3", "type": "pack", "time": "2024-01-10T00:00:00Z",
     "relationships": [{"objectId": "o1", "qualifier": ""}]},
    {"id": "e4", "type": "pack", "time": "1970-01-01T00:00:00Z", "relationships": []}
  ],
  "objects": [
    {"id": "o1", "type": "order", "relationships": [{"objectId": "o1", "qualifier": "self"}]},
    {"id": "i1", "type": "item"},
    {"id": "i2", "type": "item"},
    {"id": "i3", "type": "item"}
  ]
}"#;

    fn ocel() -> SlimLinkedOCEL {
        SlimLinkedOCEL::from_ocel(OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap())
    }

    #[test]
    fn signatures_group_events_by_their_object_types() {
        let s = get_event_signatures(&ocel());
        let find = |t: &str| s.event_types.iter().find(|e| e.event_type == t).unwrap();
        let pack = find("pack");
        assert_eq!(pack.events, 3);
        let sets: Vec<Vec<&str>> = pack
            .signatures
            .iter()
            .map(|sig| sig.objects.iter().map(|o| o.object_type.as_str()).collect())
            .collect();
        assert!(sets.contains(&vec!["item", "order"]));
        assert!(sets.contains(&vec!["order"]));
        assert!(
            sets.contains(&vec![]),
            "an event without objects has the empty signature"
        );
        let items = &find("place").signatures[0].objects[0];
        assert_eq!(
            (items.object_type.as_str(), items.min, items.max),
            ("item", 2, 2)
        );
        assert_eq!(s.object_types, vec!["item", "order"]);
    }

    #[test]
    fn population_spans_first_to_last_event() {
        let p = get_object_population(&ocel(), Some(10));
        let items = p
            .object_types
            .iter()
            .find(|t| t.object_type == "item")
            .unwrap();
        assert_eq!(items.objects, 2);
        assert_eq!(items.objects_without_events, 1);
        let order = p
            .object_types
            .iter()
            .find(|t| t.object_type == "order")
            .unwrap();
        assert!(order.alive.iter().all(|&n| n <= 1));
        assert_eq!(order.started.iter().sum::<usize>(), 1);
    }

    #[test]
    fn health_reports_each_problem_once() {
        let h = get_ocel_health(&ocel());
        let count = |check: &str| h.findings.iter().find(|f| f.check == check).unwrap().count;
        assert_eq!(count("epoch_timestamps"), 1);
        assert_eq!(count("events_without_objects"), 1);
        assert_eq!(count("objects_without_events"), 1);
        assert_eq!(count("type_mismatch"), 1);
        assert_eq!(
            count("same_time_events"),
            1,
            "o1 has e2 and e3 at the same time"
        );
        assert_eq!(count("unused_types"), 1);
        assert_eq!(count("self_relations"), 1);
        assert_eq!(h.findings[0].severity, Severity::Warning);
    }

    #[test]
    fn recommended_fixes_clear_their_checks() {
        let src = ocel();
        let repairs: Vec<_> = get_ocel_health(&src)
            .findings
            .iter()
            .flat_map(|f| f.fixes.iter().filter(|x| x.recommended))
            .flat_map(|x| x.repairs.clone())
            .collect();
        let h = get_ocel_health(&crate::repairs::repair_ocel(&src, repairs));
        for f in &h.findings {
            if !matches!(
                f.check.as_str(),
                "type_mismatch" | "null_values" | "objects_without_events"
            ) {
                assert_eq!(f.count, 0, "{} after its fix", f.check);
            }
        }
    }
}
