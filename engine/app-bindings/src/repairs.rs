//! Repairs for what the health checks find: each is deterministic, so a repaired copy can be
//! rebuilt from its source like any other derived dataset.

use std::collections::{HashMap, HashSet};
use std::hash::Hash;

use process_mining::bindings::register_binding;
use process_mining::core::chrono::TimeDelta;
use process_mining::core::event_data::case_centric::{
    AttributeValue, Event, Trace, XESEditableAttribute,
};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::log_overview::long_case_indices;
use crate::slim_project::{build_slim, Overlay};
use crate::xes_event::{event_activity, event_lifecycle, event_time, event_time_ms};

/// Which events a repair removes, or whose cases it removes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum EventDefect {
    /// No activity (`concept:name`)
    NoActivity,
    /// No readable timestamp
    NoTime,
    /// A timestamp of exactly 1970-01-01T00:00:00Z
    EpochTime,
}

/// One repair of an event log or OCEL. A repair that does not apply to the input is skipped.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum Repair {
    /// Remove the events with `defect`.
    RemoveEvents { defect: EventDefect },
    /// Remove every case with an event with `defect` (event logs only).
    RemoveCasesWith { defect: EventDefect },
    /// Sort the events of each case by time, keeping the file order of equal times and the
    /// position of events without a time (event logs only).
    SortCasesByTime,
    /// Remove repeated events of a case, keeping the first: with `exact`, only events whose
    /// attributes are all equal; otherwise events with the same activity, lifecycle transition and
    /// time (event logs only).
    RemoveDuplicateEvents { exact: bool },
    /// Remove cases without events (event logs only).
    RemoveEmptyCases,
    /// Remove cases more than ten times longer than the 99th percentile (event logs only).
    RemoveLongCases,
    /// Order the events of a case with equal times by the position their activity usually has,
    /// then by file order, and move them 1 ms apart in that order. A group whose spread would
    /// reach the case's next time keeps its times (event logs only).
    OrderTies,
    /// Give events with equal times distinct times, 1 ms apart, ordered by the position their
    /// activity usually has, then by event id. A group whose spread would reach the next time is
    /// left as is (OCELs only).
    SpreadTies,
    /// Remove events related to no object (OCELs only).
    RemoveEventsWithoutObjects,
    /// Remove objects no event is related to; with `keep_related`, keep those with an O2O
    /// relation (OCELs only).
    RemoveObjectsWithoutEvents { keep_related: bool },
    /// Remove O2O relations from an object to itself (OCELs only).
    RemoveSelfRelations,
    /// Remove declared types without instances. Every repaired OCEL declares only the types in
    /// use, so this needs no work of its own (OCELs only).
    RemoveUnusedTypes,
}

fn has_defect(event: &Event, defect: EventDefect) -> bool {
    match defect {
        EventDefect::NoActivity => event_activity(event).is_none(),
        EventDefect::NoTime => event_time_ms(event).is_none(),
        EventDefect::EpochTime => event_time_ms(event) == Some(0),
    }
}

/// Mean relative position (0 = first, 1 = last) of each activity among events whose time differs
/// from both neighbours, in `sequences` of `(activity, time)` sorted by time.
fn usual_positions<'s>(
    sequences: impl Iterator<Item = Vec<(&'s str, i64)>>,
) -> HashMap<&'s str, f64> {
    let mut sums: HashMap<&str, (f64, usize)> = HashMap::new();
    for seq in sequences {
        if seq.len() < 2 {
            continue;
        }
        let last = (seq.len() - 1) as f64;
        for (i, &(activity, t)) in seq.iter().enumerate() {
            let tied = (i > 0 && seq[i - 1].1 == t) || seq.get(i + 1).is_some_and(|n| n.1 == t);
            if !tied {
                let s = sums.entry(activity).or_default();
                s.0 += i as f64 / last;
                s.1 += 1;
            }
        }
    }
    sums.into_iter()
        .map(|(a, (sum, n))| (a, sum / n as f64))
        .collect()
}

/// An activity never seen untied sorts in the middle.
fn position_of(positions: &HashMap<&str, f64>, activity: &str) -> f64 {
    positions.get(activity).copied().unwrap_or(0.5)
}

fn order_ties(log: &mut EventLog) {
    let owned: Vec<Vec<(String, i64)>> = log
        .traces
        .iter()
        .map(|t| {
            t.events
                .iter()
                .filter_map(|e| Some((event_activity(e)?.to_string(), event_time_ms(e)?)))
                .collect()
        })
        .collect();
    let positions = usual_positions(
        owned
            .iter()
            .map(|seq| seq.iter().map(|(a, t)| (a.as_str(), *t)).collect()),
    );
    let positions: HashMap<String, f64> = positions
        .into_iter()
        .map(|(a, p)| (a.to_string(), p))
        .collect();
    let rank = |e: &Event| {
        event_activity(e)
            .and_then(|a| positions.get(a).copied())
            .unwrap_or(0.5)
    };
    for trace in &mut log.traces {
        let mut start = 0;
        while start < trace.events.len() {
            let t = event_time_ms(&trace.events[start]);
            let mut end = start + 1;
            while t.is_some() && end < trace.events.len() && event_time_ms(&trace.events[end]) == t
            {
                end += 1;
            }
            if let (Some(t), true) = (t, end - start > 1) {
                trace.events[start..end].sort_by(|a, b| rank(a).total_cmp(&rank(b)));
                let spread = (end - start - 1) as i64;
                let next = trace.events[end..]
                    .iter()
                    .filter_map(event_time_ms)
                    .filter(|&x| x > t)
                    .min();
                if next.is_none_or(|n| t + spread < n) {
                    for (i, event) in trace.events[start..end].iter_mut().enumerate().skip(1) {
                        if let (Some(time), Some(attr)) = (
                            event_time(event),
                            event.attributes.get_by_key_mut("time:timestamp"),
                        ) {
                            attr.value =
                                AttributeValue::Date(time + TimeDelta::milliseconds(i as i64));
                        }
                    }
                }
            }
            start = end;
        }
    }
}

fn sort_by_time(trace: &mut Trace) {
    let slots: Vec<usize> = (0..trace.events.len())
        .filter(|&i| event_time_ms(&trace.events[i]).is_some())
        .collect();
    let mut timed: Vec<Event> = slots.iter().map(|&i| trace.events[i].clone()).collect();
    timed.sort_by_key(event_time_ms);
    for (slot, event) in slots.into_iter().zip(timed) {
        trace.events[slot] = event;
    }
}

fn dedup(trace: &mut Trace, exact: bool) {
    let mut seen: HashSet<String> = HashSet::new();
    trace.events.retain(|e| {
        let key = if exact {
            format!("{:?}", e.attributes)
        } else {
            format!(
                "{:?}\u{0}{:?}\u{0}{:?}",
                event_activity(e),
                event_lifecycle(e),
                event_time_ms(e)
            )
        };
        seen.insert(key)
    });
}

fn repair_log(log: &mut EventLog, repair: &Repair) {
    match repair {
        Repair::RemoveEvents { defect } => {
            for t in &mut log.traces {
                t.events.retain(|e| !has_defect(e, *defect));
            }
        }
        Repair::RemoveCasesWith { defect } => log
            .traces
            .retain(|t| !t.events.iter().any(|e| has_defect(e, *defect))),
        Repair::SortCasesByTime => log.traces.iter_mut().for_each(sort_by_time),
        Repair::RemoveDuplicateEvents { exact } => {
            log.traces.iter_mut().for_each(|t| dedup(t, *exact))
        }
        Repair::RemoveEmptyCases => log.traces.retain(|t| !t.events.is_empty()),
        Repair::RemoveLongCases => {
            let long: HashSet<usize> = long_case_indices(log).into_iter().collect();
            let mut i = 0;
            log.traces.retain(|_| {
                i += 1;
                !long.contains(&(i - 1))
            });
        }
        Repair::OrderTies => order_ties(log),
        Repair::SpreadTies
        | Repair::RemoveEventsWithoutObjects
        | Repair::RemoveObjectsWithoutEvents { .. }
        | Repair::RemoveSelfRelations
        | Repair::RemoveUnusedTypes => {}
    }
}

fn spread_ties<'a, A>(ov: &mut Overlay<'a, A>)
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    let src = ov.source();
    let moves = {
        let positions = usual_positions(src.get_all_obs().filter(|o| ov.ob_kept(*o)).map(|o| {
            ov.related_events_sorted(o)
                .into_iter()
                .map(|e| (ov.ev_type(e), ov.ev_time(e).timestamp_millis()))
                .collect()
        }));
        let mut by_time: Vec<(i64, A::EventRepr)> = src
            .get_all_evs()
            .filter(|e| ov.ev_kept(*e))
            .map(|e| (ov.ev_time(e).timestamp_millis(), e))
            .collect();
        by_time.sort_by_key(|(t, _)| *t);
        let mut moves = Vec::new();
        let mut start = 0;
        while start < by_time.len() {
            let t = by_time[start].0;
            let mut end = start + 1;
            while end < by_time.len() && by_time[end].0 == t {
                end += 1;
            }
            let n = (end - start) as i64;
            let next = by_time.get(end).map(|(t, _)| *t);
            if n > 1 && next.is_none_or(|next| t + n - 1 < next) {
                let mut group: Vec<A::EventRepr> =
                    by_time[start..end].iter().map(|(_, e)| *e).collect();
                group.sort_by(|&a, &b| {
                    position_of(&positions, ov.ev_type(a))
                        .total_cmp(&position_of(&positions, ov.ev_type(b)))
                        .then_with(|| src.get_ev_id(a).cmp(src.get_ev_id(b)))
                });
                for (i, e) in group.into_iter().enumerate() {
                    if i > 0 {
                        moves.push((e, ov.ev_time(e) + TimeDelta::milliseconds(i as i64)));
                    }
                }
            }
            start = end;
        }
        moves
    };
    for (e, t) in moves {
        ov.override_ev_time(e, t);
    }
}

fn repair_overlay<'a, A>(ov: &mut Overlay<'a, A>, repair: &Repair)
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    match repair {
        Repair::RemoveEvents {
            defect: EventDefect::EpochTime,
        } => ov.retain_events(|ov, e| ov.ev_time(e).timestamp_millis() != 0),
        Repair::SpreadTies => spread_ties(ov),
        Repair::RemoveEventsWithoutObjects => ov.retain_events(|ov, e| ov.e2o(e).next().is_some()),
        Repair::RemoveObjectsWithoutEvents { keep_related } => {
            let src = ov.source();
            let related: HashSet<A::ObjectRepr> = if *keep_related {
                src.get_all_obs()
                    .filter(|o| {
                        src.get_o2o(*o).next().is_some() || src.get_o2o_rev(*o).next().is_some()
                    })
                    .collect()
            } else {
                HashSet::new()
            };
            ov.retain_objects(|ov, o| ov.e2o_rev(o).next().is_some() || related.contains(&o));
        }
        Repair::RemoveSelfRelations => ov.drop_self_relations(),
        Repair::RemoveEvents { .. }
        | Repair::RemoveCasesWith { .. }
        | Repair::SortCasesByTime
        | Repair::RemoveDuplicateEvents { .. }
        | Repair::RemoveEmptyCases
        | Repair::RemoveLongCases
        | Repair::OrderTies
        | Repair::RemoveUnusedTypes => {}
    }
}

/// A copy of an event log with `repairs` applied in order.
#[register_binding]
pub fn repair_event_log(event_log: &EventLog, repairs: Vec<Repair>) -> EventLog {
    let mut out = event_log.clone();
    for r in &repairs {
        repair_log(&mut out, r);
    }
    out
}

/// A copy of an OCEL with `repairs` applied in order.
#[register_binding]
pub fn repair_ocel(ocel: &SlimLinkedOCEL, repairs: Vec<Repair>) -> SlimLinkedOCEL {
    let mut ov = Overlay::identity(ocel);
    for r in &repairs {
        repair_overlay(&mut ov, r);
    }
    build_slim(&ov)
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    fn ev(a: &str, t: &str) -> String {
        format!(
            r#"<event><string key="concept:name" value="{a}"/><date key="time:timestamp" value="{t}"/></event>"#
        )
    }

    #[test]
    fn order_ties_follows_the_usual_order_and_spreads_times() {
        let traces = [
            ev("a", "2024-01-01T10:00:00Z") + &ev("b", "2024-01-01T11:00:00Z"),
            ev("b", "2024-01-02T10:00:00Z")
                + &ev("a", "2024-01-02T10:00:00Z")
                + &ev("c", "2024-01-02T10:00:00.001Z"),
        ];
        let body: String = traces
            .iter()
            .map(|t| format!("<trace>{t}</trace>"))
            .collect();
        let log =
            EventLog::import_from_bytes(format!("<log>{body}</log>").as_bytes(), "xes").unwrap();
        let out = repair_event_log(&log, vec![Repair::OrderTies]);
        let tied: Vec<(Option<&str>, Option<i64>)> = out.traces[1]
            .events
            .iter()
            .map(|e| (event_activity(e), event_time_ms(e)))
            .collect();
        let t = event_time_ms(&log.traces[1].events[0]).unwrap();
        // The spread would reach c's time, so a and b keep theirs, now in the usual order.
        assert_eq!(tied[0], (Some("a"), Some(t)));
        assert_eq!(tied[1], (Some("b"), Some(t)));

        let log = EventLog::import_from_bytes(
            format!(
                "<log><trace>{}</trace><trace>{}</trace></log>",
                traces[0],
                ev("b", "2024-01-03T10:00:00Z") + &ev("a", "2024-01-03T10:00:00Z")
            )
            .as_bytes(),
            "xes",
        )
        .unwrap();
        let out = repair_event_log(&log, vec![Repair::OrderTies]);
        let times: Vec<i64> = out.traces[1]
            .events
            .iter()
            .filter_map(event_time_ms)
            .collect();
        assert_eq!(event_activity(&out.traces[1].events[0]), Some("a"));
        assert_eq!(times[1] - times[0], 1);
    }
}
