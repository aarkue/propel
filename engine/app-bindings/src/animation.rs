//! Timed activity sequences of cases (or objects) for animating them over a process map.

use std::collections::HashMap;

use process_mining::bindings::register_binding;
use process_mining::conformance::case_centric::alignments::{
    AlignmentMove, AlignmentOptions, VariantAlignmentResult,
};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::AcceptingPetriNet;
use process_mining::EventLog;
use process_mining::{Cancelled, Control};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::xes_event::{event_activity, event_time_ms};

/// One case or object: its events in order, as `(activity, epoch milliseconds)`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Journey {
    pub id: String,
    /// The object type, for an object; `None` for a case
    pub object_type: Option<String>,
    pub events: Vec<(String, i64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Journeys {
    /// Cases or objects with at least one timed event, sampled evenly when there are more than
    /// asked for
    pub journeys: Vec<Journey>,
    /// How many there were before sampling
    pub total: usize,
    pub min_ms: i64,
    pub max_ms: i64,
}

fn finish(mut all: Vec<Journey>, max: usize) -> Journeys {
    all.sort_by_key(|j| j.events[0].1);
    let total = all.len();
    let min_ms = all.iter().map(|j| j.events[0].1).min().unwrap_or(0);
    let max_ms = all
        .iter()
        .filter_map(|j| j.events.last().map(|e| e.1))
        .max()
        .unwrap_or(0);
    if total > max {
        let step = total as f64 / max as f64;
        all = (0..max)
            .map(|i| all[(i as f64 * step) as usize].clone())
            .collect();
    }
    Journeys {
        journeys: all,
        total,
        min_ms,
        max_ms,
    }
}

/// The timed activity sequence of each case, at most `max_cases` (default 2,000) spread evenly
/// over the cases ordered by start time. Events without a time are left out.
#[register_binding]
pub fn get_case_journeys(
    event_log: &EventLog,
    #[bind(default)] max_cases: Option<usize>,
) -> Journeys {
    let all = event_log
        .traces
        .iter()
        .enumerate()
        .filter_map(|(i, t)| {
            let mut events: Vec<(String, i64)> = t
                .events
                .iter()
                .filter_map(|e| Some((event_activity(e)?.to_string(), event_time_ms(e)?)))
                .collect();
            events.sort_by_key(|e| e.1);
            (!events.is_empty()).then(|| Journey {
                id: i.to_string(),
                object_type: None,
                events,
            })
        })
        .collect();
    finish(all, max_cases.unwrap_or(2000).max(1))
}

/// The timed event sequence of each object, at most `max_objects` (default 2,000) spread evenly
/// over the objects ordered by their first event.
#[register_binding]
pub fn get_object_journeys(
    ocel: &SlimLinkedOCEL,
    #[bind(default)] max_objects: Option<usize>,
) -> Journeys {
    let all = ocel
        .get_all_obs()
        .filter_map(|ob| {
            let mut events: Vec<(String, i64)> = ocel
                .get_e2o_rev_evs(ob)
                .map(|ev| {
                    (
                        ocel.get_ev_type_of(ev).to_string(),
                        ocel.get_ev_time(ev).timestamp_millis(),
                    )
                })
                .collect();
            events.sort_by_key(|e| e.1);
            (!events.is_empty()).then(|| Journey {
                id: ocel.get_ob_id(ob).to_string(),
                object_type: Some(ocel.get_ob_type_of(ob).to_string()),
                events,
            })
        })
        .collect();
    finish(all, max_objects.unwrap_or(2000).max(1))
}

/// A transition firing of a replayed case.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NetFiring {
    /// Index of the transition in the net
    pub transition: usize,
    /// Epoch milliseconds; a model-only move takes the time of the event before it
    pub time: i64,
    /// Whether an event matched the firing (`false` for a model-only move)
    pub sync: bool,
}

/// One case replayed on a Petri net: the transitions its alignment fires, with times.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NetJourney {
    pub firings: Vec<NetFiring>,
    /// Events the model could not follow (log moves), as `(activity, epoch milliseconds)`
    pub log_moves: Vec<(String, i64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NetReplay {
    pub journeys: Vec<NetJourney>,
    /// Cases with timed events before sampling
    pub total: usize,
    /// Sampled cases whose variant could not be aligned, left out
    pub unaligned: usize,
    pub min_ms: i64,
    pub max_ms: i64,
}

/// Replays cases on a net through their alignments, for animating tokens over the net. At most
/// `max_cases` (default 2,000) cases, spread evenly over the cases ordered by start time.
#[register_binding(stringify_error)]
pub fn get_net_replay(
    event_log: &EventLog,
    #[bind(handle)] net: &AcceptingPetriNet,
    #[bind(default)] max_cases: Option<usize>,
    #[bind(ctx)] ctl: &Control<'_>,
) -> Result<NetReplay, Cancelled> {
    let cases = get_case_journeys(event_log, max_cases);
    // Aligned as the journeys see the cases (timed events, by time), so every lookup below finds
    // its variant, and only the sampled cases' variants are aligned.
    let sequences: Vec<Vec<String>> = cases
        .journeys
        .iter()
        .map(|j| j.events.iter().map(|(a, _)| a.clone()).collect())
        .collect();
    let projection = crate::ocpn_replay::projection_of(&sequences);
    let alignments = crate::control::progress_only(ctl, None).align_variants(
        net,
        &projection,
        &AlignmentOptions::default(),
    )?;
    let by_variant: HashMap<&[String], &VariantAlignmentResult> = alignments
        .iter()
        .map(|a| (a.activities.as_slice(), a))
        .collect();
    let mut unaligned = 0;
    let journeys = cases
        .journeys
        .iter()
        .filter_map(|j| {
            let acts: Vec<String> = j.events.iter().map(|(a, _)| a.clone()).collect();
            let Some(Ok(alignment)) = by_variant.get(acts.as_slice()).map(|a| &a.result) else {
                unaligned += 1;
                return None;
            };
            let mut time = j.events[0].1;
            let mut firings = Vec::new();
            let mut log_moves = Vec::new();
            for m in &alignment.moves {
                match m {
                    AlignmentMove::SyncMove {
                        transition,
                        trace_event_index,
                        ..
                    } => {
                        time = j.events.get(*trace_event_index).map_or(time, |e| e.1);
                        firings.push(NetFiring {
                            transition: transition.index(),
                            time,
                            sync: true,
                        });
                    }
                    AlignmentMove::ModelMove { transition, .. } => {
                        firings.push(NetFiring {
                            transition: transition.index(),
                            time,
                            sync: false,
                        });
                    }
                    AlignmentMove::LogMove { trace_event_index } => {
                        if let Some((activity, t)) = j.events.get(*trace_event_index) {
                            time = *t;
                            log_moves.push((activity.clone(), *t));
                        }
                    }
                }
            }
            Some(NetJourney { firings, log_moves })
        })
        .collect();
    Ok(NetReplay {
        journeys,
        total: cases.total,
        unaligned,
        min_ms: cases.min_ms,
        max_ms: cases.max_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    #[test]
    fn samples_cases_in_start_order() {
        let ev = |a: &str, d: &str| {
            format!(
                r#"<event><string key="concept:name" value="{a}"/><date key="time:timestamp" value="2024-01-{d}T00:00:00Z"/></event>"#
            )
        };
        let xes = format!(
            "<log><trace>{}{}</trace><trace>{}</trace><trace><event><string key=\"concept:name\" value=\"x\"/></event></trace></log>",
            ev("b", "05"),
            ev("a", "03"),
            ev("a", "01"),
        );
        let log = EventLog::import_from_bytes(xes.as_bytes(), "xes").unwrap();
        let j = get_case_journeys(&log, None);
        assert_eq!(j.total, 2, "the case without timed events is left out");
        assert_eq!(j.journeys[0].id, "1");
        assert_eq!(j.journeys[1].events[0].0, "a", "events sorted by time");
        assert_eq!(get_case_journeys(&log, Some(1)).journeys.len(), 1);
    }

    #[test]
    fn replays_cases_on_a_net() {
        use process_mining::core::process_models::case_centric::petri_net::ArcType;
        use process_mining::PetriNet;
        let mut net = PetriNet::new();
        let [p0, p1, p2] = [(); 3].map(|_| net.add_place(None));
        let a = net.add_transition(Some("a".into()), None);
        let b = net.add_transition(Some("b".into()), None);
        net.add_arc(ArcType::place_to_transition(p0, a), None);
        net.add_arc(ArcType::transition_to_place(a, p1), None);
        net.add_arc(ArcType::place_to_transition(p1, b), None);
        net.add_arc(ArcType::transition_to_place(b, p2), None);
        let net = AcceptingPetriNet::new(net, [(p0, 1)].into(), [(p2, 1)].into());
        let ev = |a: &str, d: &str| {
            format!(
                r#"<event><string key="concept:name" value="{a}"/><date key="time:timestamp" value="2024-01-{d}T00:00:00Z"/></event>"#
            )
        };
        let xes = format!(
            "<log><trace>{}{}</trace></log>",
            ev("a", "01"),
            ev("b", "03")
        );
        let log = EventLog::import_from_bytes(xes.as_bytes(), "xes").unwrap();
        let r = get_net_replay(&log, &net, None, &Control::new()).unwrap();
        assert_eq!(r.journeys.len(), 1);
        let f = &r.journeys[0].firings;
        assert_eq!(
            f.iter().map(|x| x.transition).collect::<Vec<_>>(),
            vec![0, 1]
        );
        assert_eq!(f[1].time - f[0].time, 2 * 86_400_000);
        assert!(f.iter().all(|x| x.sync));
    }
}
