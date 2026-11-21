//! One process execution of an OCEL as a graph: the events around a leading object, ordered by each
//! related object's lifecycle and laid out left to right.

use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};

use process_mining::bindings::register_binding;
use process_mining::core::event_data::object_centric::linked_ocel::slim_linked_ocel::{
    EventIndex, ObjectIndex,
};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::visualization::engine::layout_graph;
use process_mining::visualization::graphlay::{
    Direction, Edge, Graph, Layout, Node, NodeId, Preset, Shape, Size,
};
use process_mining::visualization::LayoutSettings;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExecutionEvent {
    pub id: String,
    pub activity: String,
    pub time_ms: i64,
    /// `(object type, object id)` of the execution's objects the event is related to
    pub objects: Vec<(String, String)>,
}

/// Consecutive events of one or more objects: `from` directly precedes `to` in their lifecycles.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExecutionEdge {
    pub from: usize,
    pub to: usize,
    pub object_types: Vec<String>,
    pub objects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExecutionObject {
    pub id: String,
    pub object_type: String,
    /// Hops from the leading object
    pub distance: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExecutionGraph {
    pub root: ExecutionObject,
    pub objects: Vec<ExecutionObject>,
    /// Sorted by time; `layout.nodes[i]` is the place of `events[i]`
    pub events: Vec<ExecutionEvent>,
    /// `layout.edges[i]` is the route of `edges[i]`
    pub edges: Vec<ExecutionEdge>,
    /// More objects were reachable than `max_objects` allows
    pub truncated: bool,
    /// The events of all objects in the graph, also those beyond `max_events`
    pub total_events: usize,
    pub layout: Layout,
}

/// The objects within `depth` hops of `object_id` (through shared events and O2O relations, at most
/// `max_objects`, default 60), their events (at most `max_events`, default 200, those of the nearest
/// objects first), and the
/// directly-follows edges of each object's lifecycle among those events, laid out. Objects of
/// `exclude_types` (e.g., long-lived master data such as products, which would connect everything)
/// are left out.
#[register_binding(stringify_error)]
pub fn get_execution_graph(
    ocel: &SlimLinkedOCEL,
    object_id: String,
    #[bind(default)] depth: Option<usize>,
    #[bind(default)] max_objects: Option<usize>,
    #[bind(default)] max_events: Option<usize>,
    #[bind(default)] exclude_types: Option<Vec<String>>,
) -> Result<ExecutionGraph, String> {
    let excluded: HashSet<String> = exclude_types.unwrap_or_default().into_iter().collect();
    let depth = depth.unwrap_or(2);
    let max_objects = max_objects.unwrap_or(60).max(1);
    let max_events = max_events.unwrap_or(200).max(1);
    let root = ocel
        .get_ob_by_id(&object_id)
        .ok_or_else(|| format!("No object '{object_id}'"))?;

    let mut distance: HashMap<ObjectIndex, usize> = HashMap::from([(root, 0)]);
    let mut order = vec![root];
    let mut queue = VecDeque::from([root]);
    let mut truncated = false;
    while let Some(ob) = queue.pop_front() {
        let d = distance[&ob];
        if d >= depth {
            continue;
        }
        let neighbours = ocel
            .get_e2o_rev_evs(ob)
            .flat_map(|ev| ocel.get_e2o(ev).map(|(_q, o)| *o))
            .chain(ocel.get_o2o(ob).map(|(_q, o)| *o))
            .chain(ocel.get_o2o_rev(ob).map(|(_q, o)| *o));
        for o in neighbours {
            if distance.contains_key(&o) || excluded.contains(ocel.get_ob_type_of(o)) {
                continue;
            }
            if order.len() >= max_objects {
                truncated = true;
                break;
            }
            distance.insert(o, d + 1);
            order.push(o);
            queue.push_back(o);
        }
    }

    // Each event at the distance of its nearest object, so a cut keeps the root's events.
    let mut nearest: HashMap<EventIndex, usize> = HashMap::new();
    for ob in &order {
        for ev in ocel.get_e2o_rev_evs(*ob) {
            nearest.entry(*ev).or_insert(distance[ob]);
        }
    }
    let total_events = nearest.len();
    let time_key = |ev: &EventIndex| (ocel.get_ev_time(ev).timestamp_millis(), ocel.get_ev_id(ev));
    let mut events: Vec<EventIndex> = nearest.keys().copied().collect();
    events.sort_by_key(|ev| (nearest[ev], time_key(ev)));
    events.truncate(max_events);
    events.sort_by_key(time_key);
    let position: HashMap<EventIndex, usize> =
        events.iter().enumerate().map(|(i, e)| (*e, i)).collect();
    let in_execution: HashSet<ObjectIndex> = order.iter().copied().collect();

    let mut edges: HashMap<(usize, usize), (BTreeSet<String>, Vec<String>)> = HashMap::new();
    for ob in &order {
        let mut evs: Vec<usize> = ocel
            .get_e2o_rev_evs(*ob)
            .filter_map(|ev| position.get(ev).copied())
            .collect();
        evs.sort_unstable();
        for w in evs.windows(2) {
            let e = edges.entry((w[0], w[1])).or_default();
            e.0.insert(ocel.get_ob_type_of(ob).to_string());
            e.1.push(ocel.get_ob_id(ob).to_string());
        }
    }
    let mut edges: Vec<ExecutionEdge> = edges
        .into_iter()
        .map(|((from, to), (types, objects))| ExecutionEdge {
            from,
            to,
            object_types: types.into_iter().collect(),
            objects,
        })
        .collect();
    edges.sort_by_key(|e| (e.from, e.to));

    let events: Vec<ExecutionEvent> = events
        .iter()
        .map(|ev| ExecutionEvent {
            id: ocel.get_ev_id(ev).to_string(),
            activity: ocel.get_ev_type_of(ev).to_string(),
            time_ms: ocel.get_ev_time(ev).timestamp_millis(),
            objects: ocel
                .get_e2o(ev)
                .filter(|(_q, o)| in_execution.contains(*o))
                .map(|(_q, o)| {
                    (
                        ocel.get_ob_type_of(o).to_string(),
                        ocel.get_ob_id(o).to_string(),
                    )
                })
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
        })
        .collect();

    let graph = Graph {
        nodes: events
            .iter()
            .map(|e| Node {
                size: Size {
                    width: (7.0 * e.activity.chars().count() as f64 + 32.0).clamp(96.0, 240.0),
                    height: 44.0,
                },
                shape: Shape::Box,
                ..Node::default()
            })
            .collect(),
        edges: edges
            .iter()
            .map(|e| Edge {
                weight: e.objects.len() as f64,
                ..Edge::new(NodeId(e.from as u32), NodeId(e.to as u32))
            })
            .collect(),
    };
    let request = LayoutSettings::default()
        .layered(
            graph,
            Preset::Layered,
            Some(Direction::LeftRight),
            serde_json::Value::Null,
        )
        .map_err(|e| e.to_string())?;
    let layout = layout_graph(&request).map_err(|e| e.to_string())?;

    let object = |o: &ObjectIndex| ExecutionObject {
        id: ocel.get_ob_id(o).to_string(),
        object_type: ocel.get_ob_type_of(o).to_string(),
        distance: distance[o],
    };
    Ok(ExecutionGraph {
        root: object(&root),
        objects: order.iter().map(object).collect(),
        events,
        edges,
        truncated,
        total_events,
        layout,
    })
}

/// Object ids of a type with how many events each has, most first, for picking a leading object.
#[register_binding]
pub fn get_objects_by_event_count(
    ocel: &SlimLinkedOCEL,
    object_type: String,
    #[bind(default)] limit: Option<usize>,
) -> Vec<(String, usize)> {
    let mut out: Vec<(String, usize)> = ocel
        .get_obs_of_type(&object_type)
        .map(|o| {
            (
                ocel.get_ob_id(o).to_string(),
                ocel.get_e2o_rev_evs(o).count(),
            )
        })
        .collect();
    out.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    out.truncate(limit.unwrap_or(200));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::{Importable, OCEL};

    const OCEL_JSON: &str = r#"{
  "eventTypes": [{"name": "place", "attributes": []}, {"name": "pick", "attributes": []}, {"name": "pack", "attributes": []}],
  "objectTypes": [{"name": "order", "attributes": []}, {"name": "item", "attributes": []}],
  "events": [
    {"id": "e1", "type": "place", "time": "2024-01-01T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": ""}, {"objectId": "i2", "qualifier": ""}]},
    {"id": "e2", "type": "pick", "time": "2024-01-02T00:00:00Z", "relationships": [{"objectId": "i1", "qualifier": ""}]},
    {"id": "e3", "type": "pick", "time": "2024-01-03T00:00:00Z", "relationships": [{"objectId": "i2", "qualifier": ""}]},
    {"id": "e4", "type": "pack", "time": "2024-01-04T00:00:00Z", "relationships": [{"objectId": "o1", "qualifier": ""}, {"objectId": "i1", "qualifier": ""}, {"objectId": "i2", "qualifier": ""}]},
    {"id": "e5", "type": "place", "time": "2024-01-05T00:00:00Z", "relationships": [{"objectId": "o2", "qualifier": ""}]}
  ],
  "objects": [{"id": "o1", "type": "order"}, {"id": "o2", "type": "order"}, {"id": "i1", "type": "item"}, {"id": "i2", "type": "item"}]
}"#;

    #[test]
    fn builds_the_partial_order_of_an_order() {
        let ocel = SlimLinkedOCEL::from_ocel(
            OCEL::import_from_bytes(OCEL_JSON.as_bytes(), "json").unwrap(),
        );
        let g = get_execution_graph(&ocel, "o1".into(), None, None, None, None).unwrap();
        let ids: Vec<&str> = g.events.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["e1", "e2", "e3", "e4"],
            "o2's event is not part of it"
        );
        let pairs: Vec<(usize, usize)> = g.edges.iter().map(|e| (e.from, e.to)).collect();
        assert_eq!(pairs, vec![(0, 1), (0, 2), (0, 3), (1, 3), (2, 3)]);
        let order_edge = g.edges.iter().find(|e| (e.from, e.to) == (0, 3)).unwrap();
        assert_eq!(order_edge.object_types, vec!["order"]);
        assert_eq!(g.layout.nodes.len(), 4);
        assert_eq!(g.layout.edges.len(), 5);
        assert!(get_execution_graph(&ocel, "nope".into(), None, None, None, None).is_err());
        let orders_only = get_execution_graph(
            &ocel,
            "o1".into(),
            None,
            None,
            None,
            Some(vec!["item".into()]),
        )
        .unwrap();
        assert_eq!(orders_only.events.len(), 2);
    }
}
