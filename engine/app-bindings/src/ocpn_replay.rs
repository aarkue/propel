//! Objects replayed on an object-centric Petri net: each object aligned with its type's net, for
//! animating tokens, per-type conformance, and the waiting where object types synchronize.

use std::collections::{BTreeMap, HashMap, HashSet};

use process_mining::analysis::durations::summarize;
use process_mining::bindings::register_binding;
use process_mining::conformance::case_centric::alignments::{
    compute_fitness, AlignmentMove, AlignmentOptions, VariantAlignmentResult,
};
use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use process_mining::core::event_data::object_centric::linked_ocel::slim_linked_ocel::{
    EventIndex, ObjectIndex,
};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::core::process_models::case_centric::petri_net::{
    ArcType, Marking, PlaceID, TransitionID,
};
use process_mining::core::process_models::object_centric::ocpn::json::ObjectCentricPetriNetJson;
use process_mining::core::process_models::object_centric::ocpn::ObjectCentricPetriNet;
use process_mining::{AcceptingPetriNet, PetriNet};
use process_mining::{Cancelled, Control};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// A transition firing of a replayed object.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcpnFiring {
    /// Index of the transition in the OCPN's `transitions`
    pub transition: usize,
    /// Epoch milliseconds; a model-only move takes the time of the event before it
    pub time: i64,
    /// Whether an event matched the firing (`false` for a model-only move)
    pub sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcpnJourney {
    pub id: String,
    pub object_type: String,
    pub firings: Vec<OcpnFiring>,
    /// Events the type's net could not follow (log moves), as `(activity, epoch milliseconds)`
    pub log_moves: Vec<(String, i64)>,
}

/// Alignment-based conformance of one object type with its net.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TypeConformance {
    pub object_type: String,
    pub objects: usize,
    pub fitness: Option<f64>,
    pub perfectly_fitting: Option<f64>,
    /// Objects whose alignment failed, left out of the numbers
    pub unaligned: usize,
    /// Per activity, events of this type's objects the net could not follow, most first
    pub log_moves: Vec<(String, u64)>,
}

/// How often one object type fired a transition in sync with an event or as a model-only move.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TransitionConformance {
    pub transition: usize,
    pub object_type: String,
    pub sync: u64,
    pub model: u64,
}

/// Waiting at an activity several object types take part in: per event, the time from the moment
/// the first object type was ready (its objects' previous events done) until the last one was.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SyncPoint {
    pub activity: String,
    /// Index of the activity's transition in the OCPN
    pub transition: Option<usize>,
    /// Events where at least two object types had a previous event
    pub events: usize,
    pub median_wait_ms: f64,
    pub p90_wait_ms: f64,
    pub mean_wait_ms: f64,
    /// How often each object type was the last one ready, most first
    pub last_ready: Vec<(String, usize)>,
    /// Events where every object type was ready at the same moment
    pub simultaneous: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OcpnReplay {
    /// Sampled objects with their firings
    pub journeys: Vec<OcpnJourney>,
    /// Objects of the net's types with events, before sampling
    pub total_objects: usize,
    pub min_ms: i64,
    pub max_ms: i64,
    pub types: Vec<TypeConformance>,
    pub transitions: Vec<TransitionConformance>,
    /// Longest median wait first
    pub sync: Vec<SyncPoint>,
}

/// One object type's accepting net out of the flat OCPN, with the flat indices of its nodes.
struct TypeNet {
    net: AcceptingPetriNet,
    /// Local transition index to the flat transition index
    transitions: Vec<usize>,
}

fn type_nets(ocpn: &ObjectCentricPetriNetJson) -> BTreeMap<String, TypeNet> {
    let place_index: HashMap<&str, usize> = ocpn
        .places
        .iter()
        .enumerate()
        .map(|(i, p)| (p.name.as_str(), i))
        .collect();
    let transition_index: HashMap<&str, usize> = ocpn
        .transitions
        .iter()
        .enumerate()
        .map(|(i, t)| (t.name.as_str(), i))
        .collect();
    struct Building {
        net: PetriNet,
        places: HashMap<usize, PlaceID>,
        transitions: HashMap<usize, TransitionID>,
        flat_transitions: Vec<usize>,
    }
    let mut building: BTreeMap<String, Building> = BTreeMap::new();
    for arc in &ocpn.arcs {
        let (place, transition, place_first) = match (
            place_index.get(arc.source.as_str()),
            transition_index.get(arc.target.as_str()),
        ) {
            (Some(&p), Some(&t)) => (p, t, true),
            _ => match (
                place_index.get(arc.target.as_str()),
                transition_index.get(arc.source.as_str()),
            ) {
                (Some(&p), Some(&t)) => (p, t, false),
                _ => continue,
            },
        };
        let b = building
            .entry(ocpn.places[place].object_type.clone())
            .or_insert_with(|| Building {
                net: PetriNet::new(),
                places: HashMap::new(),
                transitions: HashMap::new(),
                flat_transitions: Vec::new(),
            });
        let pid = *b
            .places
            .entry(place)
            .or_insert_with(|| b.net.add_place(None));
        let tid = match b.transitions.get(&transition) {
            Some(&t) => t,
            None => {
                let t = b
                    .net
                    .add_transition(ocpn.transitions[transition].label.clone(), None);
                b.transitions.insert(transition, t);
                b.flat_transitions.push(transition);
                t
            }
        };
        b.net.add_arc(
            if place_first {
                ArcType::place_to_transition(pid, tid)
            } else {
                ArcType::transition_to_place(tid, pid)
            },
            Some(arc.weight),
        );
    }
    building
        .into_iter()
        .map(|(object_type, b)| {
            let marking = |m: &BTreeMap<String, u32>| -> Marking {
                m.iter()
                    .filter_map(|(name, &n)| {
                        let flat = *place_index.get(name.as_str())?;
                        Some((*b.places.get(&flat)?, n))
                    })
                    .collect()
            };
            let initial = marking(&ocpn.initial_marking);
            let final_ = marking(&ocpn.final_marking);
            (
                object_type,
                TypeNet {
                    net: AcceptingPetriNet::new(b.net, initial, final_),
                    transitions: b.flat_transitions,
                },
            )
        })
        .collect()
}

/// The objects of one type with their events by time.
type TypeObjects<'a> = (&'a String, Vec<(ObjectIndex, Vec<EventIndex>)>);

/// Each object's events by time, as indices into `events`.
fn sorted_events(ocel: &SlimLinkedOCEL, ob: ObjectIndex) -> Vec<EventIndex> {
    let mut evs: Vec<EventIndex> = ocel.get_e2o_rev_evs(ob).copied().collect();
    evs.sort_by(|a, b| {
        ocel.get_ev_time(a)
            .cmp(ocel.get_ev_time(b))
            .then_with(|| ocel.get_ev_id(a).cmp(ocel.get_ev_id(b)))
    });
    evs
}

pub(crate) fn projection_of(traces: &[Vec<String>]) -> EventLogActivityProjection {
    let mut activities: Vec<String> = traces
        .iter()
        .flatten()
        .cloned()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    activities.sort();
    let act_to_index: HashMap<String, usize> = activities
        .iter()
        .enumerate()
        .map(|(i, a)| (a.clone(), i))
        .collect();
    let mut counts: HashMap<Vec<usize>, u64> = HashMap::new();
    for t in traces {
        *counts
            .entry(t.iter().map(|a| act_to_index[a]).collect())
            .or_default() += 1;
    }
    let mut traces: Vec<(Vec<usize>, u64)> = counts.into_iter().collect();
    traces.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    EventLogActivityProjection {
        activities,
        act_to_index,
        traces,
    }
}

/// Replays every object of the net's object types on its type's net through alignments. Returns
/// up to `max_objects` (default 2,000) objects' firings, spread over each type's objects ordered
/// by first event, plus conformance per type and the waiting where object types synchronize.
///
/// Reports the alignments of each type as stage `"<type>: align variants"`.
#[register_binding(stringify_error)]
pub fn get_ocpn_replay(
    ocel: &SlimLinkedOCEL,
    ocpn: ObjectCentricPetriNetJson,
    #[bind(default)] max_objects: Option<usize>,
    #[bind(ctx)] ctl: &Control<'_>,
) -> Result<OcpnReplay, Cancelled> {
    let max_objects = max_objects.unwrap_or(2000).max(1);
    let nets = type_nets(&ocpn);
    let options = AlignmentOptions::default();
    let mut journeys = Vec::new();
    let mut types = Vec::new();
    let mut transitions: BTreeMap<(usize, String), (u64, u64)> = BTreeMap::new();
    let (mut min_ms, mut max_ms) = (i64::MAX, i64::MIN);

    let per_type: Vec<TypeObjects> = nets
        .keys()
        .map(|t| {
            let mut obs: Vec<(ObjectIndex, Vec<EventIndex>)> = ocel
                .get_obs_of_type(t)
                .map(|ob| (*ob, sorted_events(ocel, *ob)))
                .filter(|(_, evs)| !evs.is_empty())
                .collect();
            obs.sort_by_key(|(_, evs)| ocel.get_ev_time(evs[0]).timestamp_millis());
            (t, obs)
        })
        .collect();
    let total_objects: usize = per_type.iter().map(|(_, o)| o.len()).sum();

    for (object_type, objects) in &per_type {
        let tn = &nets[*object_type];
        let traces: Vec<Vec<String>> = objects
            .iter()
            .map(|(_, evs)| {
                evs.iter()
                    .map(|e| ocel.get_ev_type_of(e).to_string())
                    .collect()
            })
            .collect();
        let projection = projection_of(&traces);
        let alignments = crate::control::progress_only(ctl, Some(object_type)).align_variants(
            &tn.net,
            &projection,
            &options,
        )?;
        let fitness = compute_fitness(&tn.net, &alignments, &options).ok();
        let by_variant: HashMap<&[String], &VariantAlignmentResult> = alignments
            .iter()
            .map(|a| (a.activities.as_slice(), a))
            .collect();

        let mut log_moves: HashMap<String, u64> = HashMap::new();
        let mut unaligned = 0;
        for va in &alignments {
            match &va.result {
                Ok(a) => {
                    for m in &a.moves {
                        match m {
                            AlignmentMove::SyncMove { transition, .. } => {
                                let flat = tn.transitions[transition.index()];
                                transitions
                                    .entry((flat, object_type.to_string()))
                                    .or_default()
                                    .0 += va.frequency;
                            }
                            AlignmentMove::ModelMove { transition, .. } => {
                                let flat = tn.transitions[transition.index()];
                                transitions
                                    .entry((flat, object_type.to_string()))
                                    .or_default()
                                    .1 += va.frequency;
                            }
                            AlignmentMove::LogMove { trace_event_index } => {
                                if let Some(act) = va.activities.get(*trace_event_index) {
                                    *log_moves.entry(act.clone()).or_default() += va.frequency;
                                }
                            }
                        }
                    }
                }
                Err(_) => unaligned += va.frequency as usize,
            }
        }
        let mut log_moves: Vec<(String, u64)> = log_moves.into_iter().collect();
        log_moves.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        types.push(TypeConformance {
            object_type: object_type.to_string(),
            objects: objects.len(),
            fitness: fitness.as_ref().map(|f| f.average_fitness),
            perfectly_fitting: fitness.map(|f| f.perfectly_fitting_frac),
            unaligned,
            log_moves,
        });

        let quota = ((max_objects as f64) * objects.len() as f64 / total_objects.max(1) as f64)
            .ceil() as usize;
        // A type of the net may have no objects with events in this log (e.g., in a flow log).
        let quota = quota.max(1).min(objects.len());
        let step = objects.len() as f64 / quota as f64;
        for k in 0..quota {
            let i = (k as f64 * step) as usize;
            let (ob, evs) = &objects[i];
            let trace = &traces[i];
            let Some(Ok(alignment)) = by_variant.get(trace.as_slice()).map(|a| &a.result) else {
                continue;
            };
            let times: Vec<i64> = evs
                .iter()
                .map(|e| ocel.get_ev_time(e).timestamp_millis())
                .collect();
            min_ms = min_ms.min(times[0]);
            max_ms = max_ms.max(times[times.len() - 1]);
            let mut time = times[0];
            let mut firings = Vec::new();
            let mut log_moves = Vec::new();
            for m in &alignment.moves {
                match m {
                    AlignmentMove::SyncMove {
                        transition,
                        trace_event_index,
                        ..
                    } => {
                        time = times.get(*trace_event_index).copied().unwrap_or(time);
                        firings.push(OcpnFiring {
                            transition: tn.transitions[transition.index()],
                            time,
                            sync: true,
                        });
                    }
                    AlignmentMove::ModelMove { transition, .. } => firings.push(OcpnFiring {
                        transition: tn.transitions[transition.index()],
                        time,
                        sync: false,
                    }),
                    AlignmentMove::LogMove { trace_event_index } => {
                        time = times.get(*trace_event_index).copied().unwrap_or(time);
                        if let Some(ev) = evs.get(*trace_event_index) {
                            log_moves.push((ocel.get_ev_type_of(ev).to_string(), time));
                        }
                    }
                }
            }
            journeys.push(OcpnJourney {
                id: ocel.get_ob_id(ob).to_string(),
                object_type: object_type.to_string(),
                firings,
                log_moves,
            });
        }
    }
    if min_ms > max_ms {
        (min_ms, max_ms) = (0, 0);
    }

    Ok(OcpnReplay {
        journeys,
        total_objects,
        min_ms,
        max_ms,
        types,
        transitions: transitions
            .into_iter()
            .map(
                |((transition, object_type), (sync, model))| TransitionConformance {
                    transition,
                    object_type,
                    sync,
                    model,
                },
            )
            .collect(),
        sync: sync_points(ocel, &ocpn, &per_type),
    })
}

/// The waiting at every activity whose transition has places of several object types.
fn sync_points(
    ocel: &SlimLinkedOCEL,
    ocpn: &ObjectCentricPetriNetJson,
    per_type: &[TypeObjects],
) -> Vec<SyncPoint> {
    let place_type: HashMap<&str, &str> = ocpn
        .places
        .iter()
        .map(|p| (p.name.as_str(), p.object_type.as_str()))
        .collect();
    let mut types_of: HashMap<&str, HashSet<&str>> = HashMap::new();
    for arc in &ocpn.arcs {
        if let Some(t) = place_type.get(arc.source.as_str()) {
            types_of.entry(arc.target.as_str()).or_default().insert(t);
        }
    }
    let shared: HashMap<&str, usize> = ocpn
        .transitions
        .iter()
        .enumerate()
        .filter(|(_, t)| types_of.get(t.name.as_str()).is_some_and(|s| s.len() > 1))
        // Arcs name transitions by id; events carry the activity, the transition's label.
        .filter_map(|(i, t)| Some((t.label.as_deref()?, i)))
        .collect();
    if shared.is_empty() {
        return Vec::new();
    }
    // When each object's previous event happened, per (event, object).
    let mut previous: HashMap<(EventIndex, ObjectIndex), i64> = HashMap::new();
    for (_, objects) in per_type {
        for (ob, evs) in objects {
            for w in evs.windows(2) {
                previous.insert((w[1], *ob), ocel.get_ev_time(w[0]).timestamp_millis());
            }
        }
    }
    let mut out = Vec::new();
    for (activity, &transition) in &shared {
        let mut waits = Vec::new();
        let mut last_ready: HashMap<&str, usize> = HashMap::new();
        let mut simultaneous = 0;
        for ev in ocel.get_evs_of_type(activity) {
            let mut ready: HashMap<&str, i64> = HashMap::new();
            for (_q, ob) in ocel.get_e2o(ev) {
                if let Some(&t) = previous.get(&(*ev, *ob)) {
                    let r = ready.entry(ocel.get_ob_type_of(ob)).or_insert(t);
                    *r = (*r).max(t);
                }
            }
            if ready.len() < 2 {
                continue;
            }
            let first = *ready.values().min().unwrap_or(&0);
            let (last_type, last) = ready
                .iter()
                .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)))
                .map(|(t, v)| (*t, *v))
                .unwrap_or(("", 0));
            waits.push((last - first) as f64);
            if last == first {
                simultaneous += 1;
            } else {
                *last_ready.entry(last_type).or_default() += 1;
            }
        }
        let events = waits.len();
        let Some(s) = summarize(&mut waits) else {
            continue;
        };
        let mut last_ready: Vec<(String, usize)> = last_ready
            .into_iter()
            .map(|(t, n)| (t.to_string(), n))
            .collect();
        last_ready.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        out.push(SyncPoint {
            activity: activity.to_string(),
            transition: Some(transition),
            events,
            median_wait_ms: s.median,
            p90_wait_ms: s.p90,
            mean_wait_ms: s.mean,
            last_ready,
            simultaneous,
        });
    }
    out.sort_by(|a, b| {
        b.median_wait_ms
            .total_cmp(&a.median_wait_ms)
            .then_with(|| a.activity.cmp(&b.activity))
    });
    out
}

/// A saved object-centric Petri net in the flat form that the viewers and [`get_ocpn_replay`] take.
#[register_binding]
pub fn get_ocpn_json(#[bind(handle)] ocpn: &ObjectCentricPetriNet) -> ObjectCentricPetriNetJson {
    ocpn.to_json_form()
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::discovery::object_centric::ocpn::{discover_ocpn, OcpnDiscoveryOptions};
    use process_mining::{Importable, OCEL};

    const OCEL_JSON: &str = r#"{
  "eventTypes": [{"name": "place", "attributes": []}, {"name": "pick", "attributes": []}, {"name": "pack", "attributes": []}],
  "objectTypes": [{"name": "order", "attributes": []}, {"name": "item", "attributes": []}],
  "events": [
    {"id": "e1", "type": "place", "time": "2024-01-01T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": ""}]},
    {"id": "e2", "type": "pick", "time": "2024-01-02T00:00:00Z", "relationships": [{"objectId": "i1", "qualifier": ""}]},
    {"id": "e3", "type": "pack", "time": "2024-01-05T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": ""}]},
    {"id": "e4", "type": "place", "time": "2024-01-03T00:00:00Z", "relationships": [{"objectId": "o2", "qualifier": ""}, {"objectId": "i2", "qualifier": ""}]},
    {"id": "e5", "type": "pick", "time": "2024-01-06T00:00:00Z", "relationships": [{"objectId": "i2", "qualifier": ""}]},
    {"id": "e6", "type": "pack", "time": "2024-01-07T00:00:00Z", "relationships": [{"objectId": "o2", "qualifier": ""}, {"objectId": "i2", "qualifier": ""}]}
  ],
  "objects": [{"id": "o1", "type": "order"}, {"id": "o2", "type": "order"}, {"id": "i1", "type": "item"}, {"id": "i2", "type": "item"}]
}"#;

    #[test]
    fn replays_objects_and_measures_synchronization() {
        let ocel = SlimLinkedOCEL::from_ocel(
            OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap(),
        );
        let ocpn = discover_ocpn(&ocel, OcpnDiscoveryOptions::default());
        let r = get_ocpn_replay(&ocel, ocpn.clone(), None, &Control::new()).unwrap();
        assert_eq!(r.total_objects, 4);
        assert_eq!(r.journeys.len(), 4);
        assert!(r.types.iter().all(|t| t.fitness == Some(1.0)));
        let item = r.journeys.iter().find(|j| j.id == "i1").unwrap();
        let labels: Vec<Option<&str>> = item
            .firings
            .iter()
            .map(|f| ocpn.transitions[f.transition].label.as_deref())
            .filter(|l| l.is_some())
            .collect();
        assert_eq!(labels, vec![Some("place"), Some("pick"), Some("pack")]);
        // At pack, the orders were ready at place (day 1 and 3), the items after pick (day 2 and 6).
        let pack = r.sync.iter().find(|s| s.activity == "pack").unwrap();
        assert_eq!(pack.events, 2);
        assert_eq!(pack.last_ready[0], ("item".to_string(), 2));
        assert_eq!(pack.median_wait_ms, 2.0 * 86_400_000.0);
    }

    #[test]
    fn replays_a_net_whose_type_has_no_objects_with_events() {
        let full = SlimLinkedOCEL::from_ocel(
            OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap(),
        );
        let ocpn = discover_ocpn(&full, OcpnDiscoveryOptions::default());
        let mut orders_only = OCEL_JSON.to_string();
        for item in ["i1", "i2"] {
            let rel = format!(r#"{{"objectId": "{item}", "qualifier": ""}}"#);
            orders_only = orders_only
                .replace(&format!(", {rel}"), "")
                .replace(&rel, "");
        }
        let ocel = SlimLinkedOCEL::from_ocel(
            OCEL::import_from_bytes(orders_only.as_bytes(), "json").unwrap(),
        );
        let r = get_ocpn_replay(&ocel, ocpn, None, &Control::new()).unwrap();
        assert_eq!(r.total_objects, 2);
        assert_eq!(r.journeys.len(), 2);
    }

    #[test]
    fn a_saved_net_reads_back_in_flat_form() {
        let ocel = SlimLinkedOCEL::from_ocel(
            OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap(),
        );
        let ocpn = discover_ocpn(&ocel, OcpnDiscoveryOptions::default());
        let saved = ObjectCentricPetriNet::from_json_form(&ocpn);
        let flat = get_ocpn_json(&saved);
        assert_eq!(flat.places.len(), ocpn.places.len());
        assert_eq!(flat.transitions.len(), ocpn.transitions.len());
        assert_eq!(flat.arcs.len(), ocpn.arcs.len());
        let r = get_ocpn_replay(&ocel, flat, None, &Control::new()).unwrap();
        assert!(r.types.iter().all(|t| t.fitness == Some(1.0)));
    }
}
