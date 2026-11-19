//! How objects of each type live: where activities fall in their lifetime, and the lifelines of
//! individual objects.

use std::collections::{HashMap, HashSet};

use process_mining::analysis::durations::{quantile_sorted, summarize};
use process_mining::bindings::register_binding;
use process_mining::core::event_data::object_centric::linked_ocel::slim_linked_ocel::EventIndex;
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Where an activity falls in the lifetime of the objects of one type.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LifecycleActivity {
    pub activity: String,
    /// Share of the type's objects (with events) that have the activity
    pub reach: f64,
    /// Time from an object's first event to its first event of this activity, in milliseconds
    pub median_ms: f64,
    pub p25_ms: f64,
    pub p75_ms: f64,
    /// Mean number of such events per object that has the activity
    pub mean_count: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TypeLifecycle {
    pub object_type: String,
    pub objects: usize,
    /// Median time from an object's first to its last event, in milliseconds
    pub median_lifetime_ms: f64,
    pub p90_lifetime_ms: f64,
    /// Sorted by `median_ms`
    pub activities: Vec<LifecycleActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LifecycleMap {
    /// Most objects first
    pub object_types: Vec<TypeLifecycle>,
}

fn lifecycle_of(ocel: &SlimLinkedOCEL, object_type: &str) -> TypeLifecycle {
    let mut offsets: HashMap<&str, Vec<f64>> = HashMap::new();
    let mut counts: HashMap<&str, usize> = HashMap::new();
    let mut lifetimes = Vec::new();
    let mut objects = 0;
    for ob in ocel.get_obs_of_type(object_type) {
        let mut evs: Vec<(i64, &str)> = ocel
            .get_e2o_rev_evs(ob)
            .map(|ev| {
                (
                    ocel.get_ev_time(ev).timestamp_millis(),
                    ocel.get_ev_type_of(ev),
                )
            })
            .collect();
        if evs.is_empty() {
            continue;
        }
        objects += 1;
        evs.sort_unstable();
        let start = evs[0].0;
        lifetimes.push((evs[evs.len() - 1].0 - start) as f64);
        let mut seen = HashSet::new();
        for (t, act) in &evs {
            *counts.entry(act).or_default() += 1;
            if seen.insert(*act) {
                offsets.entry(act).or_default().push((t - start) as f64);
            }
        }
    }
    let mut activities: Vec<LifecycleActivity> = offsets
        .into_iter()
        .map(|(act, mut v)| {
            v.sort_by(|a, b| a.total_cmp(b));
            LifecycleActivity {
                activity: act.to_string(),
                reach: v.len() as f64 / objects.max(1) as f64,
                median_ms: quantile_sorted(&v, 0.5),
                p25_ms: quantile_sorted(&v, 0.25),
                p75_ms: quantile_sorted(&v, 0.75),
                mean_count: counts[act] as f64 / v.len() as f64,
            }
        })
        .collect();
    activities.sort_by(|a, b| {
        a.median_ms
            .total_cmp(&b.median_ms)
            .then_with(|| a.activity.cmp(&b.activity))
    });
    let summary = summarize(&mut lifetimes);
    TypeLifecycle {
        object_type: object_type.to_string(),
        objects,
        median_lifetime_ms: summary.as_ref().map_or(0.0, |s| s.median),
        p90_lifetime_ms: summary.as_ref().map_or(0.0, |s| s.p90),
        activities,
    }
}

/// For each object type, when its activities happen relative to the object's first event.
#[register_binding]
pub fn get_lifecycle_map(ocel: &SlimLinkedOCEL) -> LifecycleMap {
    let mut object_types: Vec<TypeLifecycle> = ocel
        .get_ob_types()
        .map(|t| lifecycle_of(ocel, t))
        .filter(|t| t.objects > 0)
        .collect();
    object_types.sort_by(|a, b| {
        b.objects
            .cmp(&a.objects)
            .then_with(|| a.object_type.cmp(&b.object_type))
    });
    LifecycleMap { object_types }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LifelineEvent {
    pub id: String,
    pub activity: String,
    pub time_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Lifeline {
    pub id: String,
    pub object_type: String,
    /// Indices into `events`, by time
    pub events: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Lifelines {
    /// Grouped by object type, then by first event
    pub lifelines: Vec<Lifeline>,
    pub events: Vec<LifelineEvent>,
    /// Objects of the chosen types with events, before sampling
    pub total: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LifelineWindow {
    Start,
    #[default]
    Middle,
    End,
}

/// The lifelines of `max_objects` (default 300) consecutive objects of `object_types` (default: all),
/// in the order of their first event, from the start, middle or end of the log. Neighbouring rows
/// are objects that started at about the same time, so the ones that meet in events are close.
#[register_binding]
pub fn get_object_lifelines(
    ocel: &SlimLinkedOCEL,
    #[bind(default)] object_types: Option<Vec<String>>,
    #[bind(default)] max_objects: Option<usize>,
    #[bind(default)] window: LifelineWindow,
) -> Lifelines {
    let types: HashSet<String> = object_types
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| ocel.get_ob_types().map(str::to_string).collect())
        .into_iter()
        .collect();
    let max_objects = max_objects.unwrap_or(300).max(1);
    let mut objects: Vec<(i64, Vec<EventIndex>, String, String)> = ocel
        .get_all_obs()
        .filter(|ob| types.contains(ocel.get_ob_type_of(ob)))
        .filter_map(|ob| {
            let mut evs: Vec<EventIndex> = ocel.get_e2o_rev_evs(ob).copied().collect();
            evs.sort_by_key(|ev| ocel.get_ev_time(ev).timestamp_millis());
            let first = ocel.get_ev_time(evs.first()?).timestamp_millis();
            Some((
                first,
                evs,
                ocel.get_ob_id(ob).to_string(),
                ocel.get_ob_type_of(ob).to_string(),
            ))
        })
        .collect();
    objects.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.2.cmp(&b.2)));
    let total = objects.len();
    let take = max_objects.min(total);
    let start = match window {
        LifelineWindow::Start => 0,
        LifelineWindow::Middle => (total - take) / 2,
        LifelineWindow::End => total - take,
    };
    let mut events: Vec<LifelineEvent> = Vec::new();
    let mut index: HashMap<EventIndex, usize> = HashMap::new();
    let lifelines = objects[start..start + take]
        .iter()
        .map(|(_, evs, id, object_type)| Lifeline {
            id: id.clone(),
            object_type: object_type.clone(),
            events: evs
                .iter()
                .map(|ev| {
                    *index.entry(*ev).or_insert_with(|| {
                        events.push(LifelineEvent {
                            id: ocel.get_ev_id(ev).to_string(),
                            activity: ocel.get_ev_type_of(ev).to_string(),
                            time_ms: ocel.get_ev_time(ev).timestamp_millis(),
                        });
                        events.len() - 1
                    })
                })
                .collect(),
        })
        .collect();
    Lifelines {
        lifelines,
        events,
        total,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::{Importable, OCEL};

    const OCEL_JSON: &str = r#"{
  "eventTypes": [{"name": "place", "attributes": []}, {"name": "pick", "attributes": []}, {"name": "pay", "attributes": []}],
  "objectTypes": [{"name": "order", "attributes": []}, {"name": "item", "attributes": []}],
  "events": [
    {"id": "e1", "type": "place", "time": "2024-01-01T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": ""}]},
    {"id": "e2", "type": "pick", "time": "2024-01-03T00:00:00Z", "relationships": [{"objectId": "i1", "qualifier": ""}]},
    {"id": "e3", "type": "pay", "time": "2024-01-11T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}]},
    {"id": "e4", "type": "place", "time": "2024-01-05T00:00:00Z", "relationships": [{"objectId": "o2", "qualifier": ""}]}
  ],
  "objects": [{"id": "o1", "type": "order"}, {"id": "o2", "type": "order"}, {"id": "i1", "type": "item"}]
}"#;

    fn ocel() -> SlimLinkedOCEL {
        SlimLinkedOCEL::from_ocel(OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap())
    }

    #[test]
    fn places_activities_in_the_lifetime() {
        let m = get_lifecycle_map(&ocel());
        let order = &m.object_types[0];
        assert_eq!((order.object_type.as_str(), order.objects), ("order", 2));
        let pay = order
            .activities
            .iter()
            .find(|a| a.activity == "pay")
            .unwrap();
        assert_eq!(pay.reach, 0.5);
        assert_eq!(pay.median_ms, 10.0 * 86_400_000.0);
        assert_eq!(order.activities[0].activity, "place");
    }

    #[test]
    fn lifelines_share_events_between_objects() {
        let l = get_object_lifelines(&ocel(), None, None, LifelineWindow::Start);
        assert_eq!(l.total, 3);
        let o1 = l.lifelines.iter().find(|x| x.id == "o1").unwrap();
        let i1 = l.lifelines.iter().find(|x| x.id == "i1").unwrap();
        assert_eq!(o1.events[0], i1.events[0], "e1 is one shared event");
        assert_eq!(l.events.len(), 4);
    }
}
